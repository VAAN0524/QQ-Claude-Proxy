/**
 * Code Agent - 简单代码任务处理
 *
 * 直接使用 Anthropic API 处理简单代码编写和分析任务
 * 避免调用重量级的 Claude Code CLI
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import type {
  IAgent,
  AgentConfig,
  AgentMessage,
  AgentContext,
  AgentResponse,
} from './base/Agent.js';
import { AgentCapability } from './base/Agent.js';

/**
 * Code Agent 配置选项
 */
export interface CodeAgentOptions {
  /** Anthropic API Key */
  apiKey: string;
  /** 使用的模型 */
  model?: string;
  /** 最大 tokens */
  maxTokens?: number;
}

/**
 * Code Agent - 处理简单代码任务
 */
export class CodeAgent implements IAgent {
  readonly id = 'code';
  readonly name = 'Code Agent';
  readonly description = '处理简单代码编写、分析和调试任务';
  readonly capabilities: AgentCapability[] = [
    AgentCapability.Code,
    AgentCapability.Analyze,
  ];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 10,
    timeout: 60000,
  };

  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  // 代码相关关键词
  private readonly codeKeywords = [
    // 中文
    '代码', '写', '函数', '类', '实现', 'bug', '调试', '算法', '数据结构',
    '解释代码', '分析代码', '重构', '优化代码',
    // 英文
    'code', 'write', 'function', 'class', 'implement', 'debug', 'algorithm',
    'data structure', 'explain code', 'analyze code', 'refactor', 'optimize code',
    // 编程语言
    'javascript', 'typescript', 'python', 'java', 'c++', 'go', 'rust', 'php',
    'html', 'css', 'sql', 'bash', 'shell',
  ];

  constructor(options: CodeAgentOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
    });
    this.model = options.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = options.maxTokens || 4096;
    logger.info(`[CodeAgent] 初始化完成 (模型: ${this.model})`);
  }

  /**
   * 检查是否能处理该任务
   */
  canHandle(message: AgentMessage): number {
    const content = message.content.toLowerCase();

    // 检查是否包含代码片段
    const hasCodeSnippet = /```[\s\S]*```|`[^`\n]+`/.test(message.content);
    if (hasCodeSnippet) {
      return 0.95;
    }

    // 关键词匹配
    const hitCount = this.codeKeywords.filter(kw => content.includes(kw)).length;
    const score = Math.min(hitCount * 0.15, 0.85);

    return score;
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
      logger.info(`[CodeAgent] 处理消息: ${message.content.substring(0, 50)}...`);

      const systemPrompt = this.buildSystemPrompt(context);
      const userPrompt = this.buildUserPrompt(message);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt,
        }],
      });

      const contentBlock = response.content[0];
      const text = contentBlock.type === 'text' ? contentBlock.text : '';

      const elapsed = Date.now() - startTime;
      logger.info(`[CodeAgent] 处理完成，耗时: ${elapsed}ms`);

      return {
        content: `🤖 [Code Agent]\n\n${text}`,
        agentId: this.id,
      };

    } catch (error) {
      logger.error(`[CodeAgent] 处理失败: ${error}`);
      return {
        content: `❌ [Code Agent] 处理失败: ${error instanceof Error ? error.message : String(error)}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(context: AgentContext): string {
    return `你是一个专业的编程助手，擅长处理简单代码任务。

你的职责：
1. 编写简洁、高效的代码片段
2. 解释代码逻辑和工作原理
3. 分析和调试代码问题
4. 提供代码优化建议

注意事项：
- 保持回答简洁明了
- 代码要有注释说明
- 对于复杂任务，建议用户使用完整的 Claude Code CLI
- 当前工作目录: ${context.workspacePath}

请直接给出代码或分析结果，不需要过多的开场白。`;
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(message: AgentMessage): string {
    let prompt = message.content;

    // 如果有附件，添加附件信息
    if (message.attachments && message.attachments.length > 0) {
      const attachmentInfo = message.attachments
        .map(a => `- ${a.type}: ${a.path}`)
        .join('\n');
      prompt += `\n\n附件:\n${attachmentInfo}`;
    }

    return prompt;
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
      logger.info('[CodeAgent] API 连接验证成功');
    } catch (error) {
      logger.warn(`[CodeAgent] API 连接验证失败: ${error}`);
      throw new Error(`Code Agent 初始化失败: ${error}`);
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    // Anthropic SDK 不需要显式清理
    logger.info('[CodeAgent] 已清理资源');
  }
}
