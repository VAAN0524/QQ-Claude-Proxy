/**
 * CoordinatorAgent - 主协调 Agent
 *
 * 使用 Anthropic API 直接调用，支持 Tool Use 调用子 Agent
 * 负责任务分解、协调、汇总
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { SharedContext } from './SharedContext.js';
import type {
  IAgent,
  AgentConfig,
  AgentMessage,
  AgentContext,
  AgentResponse,
} from './base/Agent.js';
import { AgentCapability } from './base/Agent.js';

/**
 * Coordinator Agent 配置选项
 */
export interface CoordinatorAgentOptions {
  /** Anthropic API Key */
  apiKey: string;
  /** 使用的模型 */
  model?: string;
  /** 最大 tokens */
  maxTokens?: number;
  /** 共享上下文 */
  sharedContext: SharedContext;
  /** 子 Agent 注册表 */
  subAgents: Map<string, IAgent>;
}

/**
 * 工具调用结果
 */
interface ToolResult {
  toolUseId: string;
  result: string;
  agentId: string;
}

/**
 * Coordinator Agent - 主协调 Agent
 */
export class CoordinatorAgent implements IAgent {
  readonly id = 'coordinator';
  readonly name = 'Coordinator Agent';
  readonly description = '智能任务协调助手，可调用专门的子 Agent 协助完成任务';
  readonly capabilities: AgentCapability[] = [
    AgentCapability.General,
    AgentCapability.Complex,
    AgentCapability.Code,
    AgentCapability.Web,
  ];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 100, // 最高优先级
    timeout: 300000, // 5 分钟
  };

  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private sharedContext: SharedContext;
  private subAgents: Map<string, IAgent>;

  // 工具名称到 Agent ID 的映射
  private readonly toolToAgentMap: Record<string, string> = {
    'run_code_agent': 'code',
    'run_browser_agent': 'browser',
    'run_shell_agent': 'shell',
  };

  // 正在进行的多轮对话
  private currentConversation: Array<{ role: string; content: string }> = [];

  constructor(options: CoordinatorAgentOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
    });
    this.model = options.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = options.maxTokens || 8192;
    this.sharedContext = options.sharedContext;
    this.subAgents = options.subAgents;

    logger.info(`[CoordinatorAgent] 初始化完成 (模型: ${this.model})`);
    logger.info(`[CoordinatorAgent] 已注册 ${this.subAgents.size} 个子 Agent`);
  }

  /**
   * 检查是否能处理该任务
   * Coordinator Agent 可以处理所有任务
   */
  canHandle(message: AgentMessage): number {
    return 1.0; // 始终返回最高分数
  }

  /**
   * 处理消息
   */
  async process(
    message: AgentMessage,
    context: AgentContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      logger.info(`[CoordinatorAgent] 处理消息: ${message.content.substring(0, 50)}...`);

      // 添加用户消息到共享上下文
      this.sharedContext.addConversation('user', message.content);

      // 构建消息历史
      const messages = this.buildMessages(message);

      // 获取可用工具
      const tools = this.getAvailableTools();

      // 调用 Anthropic API
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.buildSystemPrompt(context),
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      // 处理响应
      let finalResponse: string;

      if (response.stop_reason === 'tool_use') {
        // 需要调用工具
        logger.info(`[CoordinatorAgent] 检测到工具调用请求`);
        const toolResults = await this.executeTools(response.content, context);

        // 继续对话，传入工具结果
        finalResponse = await this.continueWithToolResults(messages, response.content, toolResults, context);
      } else {
        // 直接返回文本响应
        const textBlock = response.content.find(b => b.type === 'text');
        finalResponse = textBlock?.text || '无响应';
      }

      // 添加助手响应到共享上下文
      this.sharedContext.addConversation('assistant', finalResponse, this.id);

      const elapsed = Date.now() - startTime;
      logger.info(`[CoordinatorAgent] 处理完成，耗时: ${elapsed}ms`);

      return {
        content: finalResponse,
        agentId: this.id,
      };

    } catch (error) {
      logger.error(`[CoordinatorAgent] 处理失败: ${error}`);
      return {
        content: `❌ [Coordinator Agent] 处理失败: ${error instanceof Error ? error.message : String(error)}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(context: AgentContext): string {
    const enabledAgents = this.getEnabledAgentNames();

    return `你是一个智能任务协调助手，可以调用专门的子 Agent 来协助完成任务。

**当前工作目录**: ${context.workspacePath}
**存储目录**: ${context.storagePath}

**可用的子 Agent**:
${enabledAgents.map(name => `- ${name}`).join('\n')}

**工作流程**:
1. 首先理解用户需求
2. 判断是否需要调用子 Agent：
   - 简单问题直接回答，无需调用工具
   - 代码相关任务使用 run_code_agent
   - 网页相关任务使用 run_browser_agent
   - 命令执行使用 run_shell_agent
3. 调用相应的工具（可以多次调用）
4. 汇总结果，返回给用户

**注意事项**:
- 保持回答简洁明了
- 如果子 Agent 的结果需要改进，可以在汇总时进行
- 对于复杂任务，可以分解后逐步执行
- 执行命令前要确保安全`;
  }

  /**
   * 构建消息历史
   */
  private buildMessages(message: AgentMessage): Anthropic.MessageParam[] {
    // 从共享上下文获取历史消息
    const historyMessages = this.sharedContext.getAnthropicMessages();

    // 如果历史消息为空，使用当前消息
    if (historyMessages.length === 0) {
      return [{ role: 'user', content: message.content }];
    }

    // 检查最后一条消息是否是当前用户的消息，避免重复
    const lastMsg = historyMessages[historyMessages.length - 1];
    if (lastMsg.role === 'user' && lastMsg.content === message.content) {
      return historyMessages as Anthropic.MessageParam[];
    }

    // 添加当前用户消息
    return [
      ...historyMessages,
      { role: 'user', content: message.content },
    ] as Anthropic.MessageParam[];
  }

  /**
   * 获取可用的工具定义
   */
  private getAvailableTools(): Anthropic.Tool[] {
    const tools: Anthropic.Tool[] = [];

    // Code Agent
    if (this.subAgents.has('code')) {
      tools.push({
        name: 'run_code_agent',
        description: '执行代码相关任务：编写、分析、调试、优化代码',
        input_schema: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: '具体的代码任务描述，例如：写个快速排序算法',
            },
            code: {
              type: 'string',
              description: '可选的代码片段，用于分析或调试',
            },
          },
          required: ['task'],
        },
      });
    }

    // Browser Agent
    if (this.subAgents.has('browser')) {
      tools.push({
        name: 'run_browser_agent',
        description: '网页操作：访问网页、截图、提取信息、填充表单',
        input_schema: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: '具体的网页操作任务，例如：访问 https://github.com 并截图',
            },
            url: {
              type: 'string',
              description: '可选的 URL，如果是纯访问任务',
            },
          },
          required: ['task'],
        },
      });
    }

    // Shell Agent
    if (this.subAgents.has('shell')) {
      tools.push({
        name: 'run_shell_agent',
        description: '执行系统命令：谨慎使用，仅用于安全的命令操作',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: '要执行的命令，例如：npm install',
            },
          },
          required: ['command'],
        },
      });
    }

    return tools;
  }

  /**
   * 执行工具调用
   */
  private async executeTools(
    contentBlocks: Anthropic.ContentBlock[],
    context: AgentContext
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const block of contentBlocks) {
      if (block.type === 'tool_use') {
        const toolUse = block as Anthropic.ToolUseBlock;
        const agentId = this.toolToAgentMap[toolUse.name];

        if (!agentId) {
          logger.warn(`[CoordinatorAgent] 未知的工具: ${toolUse.name}`);
          results.push({
            toolUseId: toolUse.id,
            result: `错误：未知的工具 ${toolUse.name}`,
            agentId: 'unknown',
          });
          continue;
        }

        const agent = this.subAgents.get(agentId);
        if (!agent) {
          logger.warn(`[CoordinatorAgent] 子 Agent 未找到: ${agentId}`);
          results.push({
            toolUseId: toolUse.id,
            result: `错误：子 Agent ${agentId} 未找到`,
            agentId,
          });
          continue;
        }

        try {
          logger.info(`[CoordinatorAgent] 调用子 Agent: ${agentId}`);

          // 构建子 Agent 消息
          const subMessage: AgentMessage = {
            channel: 'coordinator',
            userId: 'coordinator',
            content: this.buildSubAgentPrompt(toolUse.name, toolUse.input as Record<string, unknown>),
            timestamp: new Date(),
          };

          // 调用子 Agent
          const subResponse = await agent.process(subMessage, context);

          // 保存工作状态到共享上下文
          this.sharedContext.setWorkState(agentId, subResponse.content);

          results.push({
            toolUseId: toolUse.id,
            result: subResponse.content,
            agentId,
          });

          logger.info(`[CoordinatorAgent] 子 Agent ${agentId} 执行完成`);

        } catch (error) {
          logger.error(`[CoordinatorAgent] 子 Agent ${agentId} 执行失败: ${error}`);
          results.push({
            toolUseId: toolUse.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId,
          });
        }
      }
    }

    return results;
  }

  /**
   * 构建子 Agent 提示词
   */
  private buildSubAgentPrompt(toolName: string, input: Record<string, unknown>): string {
    switch (toolName) {
      case 'run_code_agent':
        return input.task as string;

      case 'run_browser_agent':
        if (input.url) {
          return `访问 ${input.url}：${input.task}`;
        }
        return input.task as string;

      case 'run_shell_agent':
        return `执行命令: ${input.command}`;

      default:
        return JSON.stringify(input);
    }
  }

  /**
   * 继续对话，传入工具结果
   */
  private async continueWithToolResults(
    originalMessages: Anthropic.MessageParam[],
    originalContent: Anthropic.ContentBlock[],
    toolResults: ToolResult[],
    context: AgentContext
  ): Promise<string> {
    // 构建新的消息数组
    const newMessages = [
      ...originalMessages,
    ];

    // 添加原始的 tool_use 块和结果
    for (const block of originalContent) {
      if (block.type === 'tool_use') {
        newMessages.push({
          role: 'assistant',
          content: JSON.stringify({ ...block, type: 'tool_use' as const }),
        });
      }
    }

    // 添加工具结果
    for (const result of toolResults) {
      newMessages.push({
        role: 'user',
        content: JSON.stringify({
          tool_use_id: result.toolUseId,
          result: result.result,
          type: 'tool_result',
        }),
      });
    }

    // 继续对话
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: this.buildSystemPrompt(context),
      messages: newMessages as Anthropic.MessageParam[],
    });

    // 检查是否还有更多工具调用
    if (response.stop_reason === 'tool_use') {
      const moreResults = await this.executeTools(response.content, context);
      return await this.continueWithToolResults(newMessages as any, response.content, moreResults, context);
    }

    // 返回最终文本
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text || '处理完成';
  }

  /**
   * 获取已启用的子 Agent 名称列表
   */
  private getEnabledAgentNames(): string[] {
    const names: string[] = [];

    if (this.subAgents.has('code')) {
      names.push('Code Agent (代码)');
    }
    if (this.subAgents.has('browser')) {
      names.push('Browser Agent (网页)');
    }
    if (this.subAgents.has('shell')) {
      names.push('Shell Agent (命令)');
    }

    return names;
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    // 验证 API Key
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      logger.info('[CoordinatorAgent] API 连接验证成功');
    } catch (error) {
      logger.warn(`[CoordinatorAgent] API 连接验证失败: ${error}`);
      throw new Error(`Coordinator Agent 初始化失败: ${error}`);
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    logger.info('[CoordinatorAgent] 已清理资源');
  }
}

export default CoordinatorAgent;
