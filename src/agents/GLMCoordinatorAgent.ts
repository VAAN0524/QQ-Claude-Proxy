/**
 * GLMCoordinatorAgent - 使用智谱AI GLM-4.7 的主协调 Agent
 *
 * 使用智谱AI API（OpenAI兼容格式），支持 Tool Use 调用子 Agent
 * 负责任务分解、协调、汇总
 */

import { logger } from '../utils/logger.js';
import { SharedContext } from './SharedContext.js';
import { MemoryService, MemoryType, RAGService, HierarchicalMemoryService, MemoryLayer } from './memory/index.js';
import { LearningModule } from './learning/index.js';
import { SkillLoader } from './SkillLoader.js';
import type { Scheduler } from '../scheduler/index.js';
import type {
  IAgent,
  AgentConfig,
  AgentMessage,
  AgentContext,
  AgentResponse,
} from './base/Agent.js';
import { AgentCapability } from './base/Agent.js';
import { createHmac, randomBytes, createSign } from 'crypto';
import { promises as fs, existsSync, mkdirSync, readdir } from 'fs';
import * as crypto from 'crypto';
import path from 'path';

// 新的简化 API
import { glm, type LLMProvider as LLMProviderType, type ChatCompletionParams, type ChatCompletionResponse as LLMChatCompletionResponse } from '../llm/providers.js';
import { getAllAgentTools, getAllFileTools, getAllLearningTools, type ToolContext, type FileToolContext, type LearningToolContext } from './tools/index.js';

// 人格设定
import { getAgentPersona, AGENT_PERSONAS } from './personas.js';
import { buildFullPersonaPrompt, buildTeamCollaborationPrompt } from './PersonaPromptBuilder.js';

// 类型别名避免冲突
type LLMProvider = LLMProviderType;

// File Storage 处理图片下载和存储
interface StoredFile {
  id: string;
  originalName: string;
  storedPath: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

class ImageStorage {
  private basePath: string;
  private files: Map<string, StoredFile> = new Map();

  constructor(basePath: string) {
    this.basePath = basePath;
    // 确保 images 目录存在
    const imagesDir = path.join(basePath, 'images');
    if (!existsSync(imagesDir)) {
      mkdirSync(imagesDir, { recursive: true });
    }
  }

  /**
   * 从 URL 下载并存储图片
   * 支持 http(s):// 和 file:// 协议
   */
  async storeFromUrl(url: string, filename: string): Promise<StoredFile> {
    const id = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(filename) || '.jpg';
    const storedFileName = `${id}${ext}`;
    const storedPath = path.join(this.basePath, 'images', storedFileName);

    logger.info(`[ImageStorage] 处理图片: ${url} -> ${storedPath}`);

    let buffer: Buffer;

    // 检查是否是 file:// 协议
    if (url.startsWith('file://')) {
      // 从 file:// URL 提取文件路径
      const filePath = decodeURIComponent(url.substring(7)); // 移除 'file://' 前缀
      logger.info(`[ImageStorage] 读取本地文件: ${filePath}`);

      // 直接读取本地文件
      try {
        buffer = await fs.readFile(filePath);
      } catch (error) {
        throw new Error(`读取本地文件失败: ${filePath} - ${error}`);
      }
    } else {
      // 使用 fetch 下载 HTTP(S) 图片
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP 错误: ${response.status}`);
      }
      buffer = Buffer.from(await response.arrayBuffer());
    }

    // 保存到本地
    await fs.writeFile(storedPath, buffer);

    // 检测 MIME 类型
    const mimeType = this.detectMimeType(buffer, ext);

    const storedFile: StoredFile = {
      id,
      originalName: filename,
      storedPath,
      mimeType,
      size: buffer.length,
      createdAt: new Date(),
    };

    this.files.set(id, storedFile);
    return storedFile;
  }

  /**
   * 检测 MIME 类型
   */
  private detectMimeType(buffer: Buffer, ext: string): string {
    const extMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    return extMap[ext.toLowerCase()] || 'image/jpeg';
  }

  /**
   * 读取图片并转换为 base64
   */
  async readAsBase64(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('base64');
  }
}

/**
 * GLM Coordinator Agent 配置选项
 */
export interface GLMCoordinatorAgentOptions {
  /** 智谱AI API Key */
  apiKey: string;
  /** API Base URL */
  baseUrl?: string;
  /** 使用的模型 */
  model?: string;
  /** 最大 tokens */
  maxTokens?: number;
  /** 共享上下文 */
  sharedContext: SharedContext;
  /** 子 Agent 注册表 */
  subAgents: Map<string, IAgent>;
  /** 记忆服务（可选） */
  memoryService?: MemoryService;
  /** 分层记忆服务（可选，OpenViking 风格） */
  hierarchicalMemoryService?: HierarchicalMemoryService;
  /** RAG 服务（可选） */
  ragService?: RAGService;
  /** 学习模块（可选） */
  learningModule?: LearningModule;
  /** 是否启用记忆存储 */
  enableMemory?: boolean;
  /** 是否启用自主学习 */
  enableLearning?: boolean;
  /** 调度器（可选，用于定时任务管理） */
  scheduler?: Scheduler;
}

/**
 * 内容类型
 */
type ContentBlock = string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;

/**
 * 聊天消息
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: ContentBlock;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/**
 * 工具调用
 */
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 工具定义
 */
interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

/**
 * API 响应
 */
interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls: ToolCall[] | null;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 执行步骤
 */
interface ExecutionStep {
  /** 步骤序号 */
  stepNumber: number;
  /** 思考内容 */
  thought: string;
  /** 采取的行动 */
  action: string;
  /** 行动结果 */
  result: string;
  /** 是否成功 */
  success: boolean;
  /** 时间戳 */
  timestamp: Date;
}

/**
 * 执行状态
 */
interface ExecutionState {
  /** 用户目标 */
  goal: string;
  /** 当前步骤数 */
  currentStep: number;
  /** 执行历史 */
  history: ExecutionStep[];
  /** 目标是否达成 */
  goalAchieved: boolean;
  /** 最后的错误 */
  lastError?: string;
  /** 尝试的工具 */
  attemptedTools: Set<string>;
  /** 失败次数 */
  failureCount: number;
}

/**
 * 目标导向执行器 - 实现"不达目的不罢休"的持续执行
 *
 * 核心特性：
 * 1. 持续尝试直到目标达成
 * 2. 每次迭代进行思考-行动-观察-反思
 * 3. 失败时自动分析并调整策略
 * 4. 支持多步推理和工具链组合
 */
class GoalOrientedExecutor {
  private state: ExecutionState;
  private maxIterations: number;
  private maxFailures: number;

  constructor(goal: string, options: { maxIterations?: number; maxFailures?: number } = {}) {
    this.state = {
      goal,
      currentStep: 0,
      history: [],
      goalAchieved: false,
      attemptedTools: new Set(),
      failureCount: 0,
    };
    this.maxIterations = options.maxIterations || 20;
    this.maxFailures = options.maxFailures || 5;
  }

  /**
   * 执行目标导向的循环
   */
  async execute(
    thinkAndAct: (state: ExecutionState) => Promise<{ thought: string; action: string; result: string; success: boolean; toolUsed?: string }>,
    checkGoalAchieved: (result: string) => boolean
  ): Promise<{ finalResult: string; steps: ExecutionStep[] }> {
    logger.info(`[GoalOrientedExecutor] 开始执行目标: "${this.state.goal.substring(0, 50)}..."`);

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      this.state.currentStep++;

      logger.info(`[GoalOrientedExecutor] 步骤 ${this.state.currentStep}/${this.maxIterations}`);

      // 思考并行动
      const { thought, action, result, success, toolUsed } = await thinkAndAct(this.state);

      // 记录步骤
      const step: ExecutionStep = {
        stepNumber: this.state.currentStep,
        thought,
        action,
        result,
        success,
        timestamp: new Date(),
      };
      this.state.history.push(step);

      // 记录使用的工具
      if (toolUsed) {
        this.state.attemptedTools.add(toolUsed);
      }

      // 检查目标是否达成
      if (success && checkGoalAchieved(result)) {
        this.state.goalAchieved = true;
        logger.info(`[GoalOrientedExecutor] 目标已达成! 总步骤: ${this.state.currentStep}`);
        return { finalResult: result, steps: this.state.history };
      }

      // 检查是否应该继续尝试
      if (!success) {
        this.state.failureCount++;
        this.state.lastError = result;

        logger.warn(`[GoalOrientedExecutor] 步骤失败 (${this.state.failureCount}/${this.maxFailures}): ${result.substring(0, 100)}`);

        // 失败次数过多，停止尝试
        if (this.state.failureCount >= this.maxFailures) {
          logger.error(`[GoalOrientedExecutor] 达到最大失败次数，停止执行`);
          return { finalResult: result, steps: this.state.history };
        }
      } else {
        // 成功但目标未达成，重置失败计数
        this.state.failureCount = 0;
      }
    }

    logger.warn(`[GoalOrientedExecutor] 达到最大迭代次数 (${this.maxIterations})，目标未达成`);
    return {
      finalResult: this.state.history[this.state.history.length - 1]?.result || '未获得结果',
      steps: this.state.history,
    };
  }

  /**
   * 获取执行摘要
   */
  getSummary(): string {
    const successfulSteps = this.state.history.filter(s => s.success).length;
    const failedSteps = this.state.history.filter(s => !s.success).length;

    return `
执行摘要:
- 目标: ${this.state.goal}
- 总步骤: ${this.state.history.length}
- 成功步骤: ${successfulSteps}
- 失败步骤: ${failedSteps}
- 目标达成: ${this.state.goalAchieved ? '是' : '否'}
- 尝试的工具: ${Array.from(this.state.attemptedTools).join(', ') || '无'}
    `.trim();
  }

  /**
   * 获取当前状态
   */
  getState(): ExecutionState {
    return { ...this.state };
  }
}

/**
 * GLM Coordinator Agent - 主协调 Agent
 */
export class GLMCoordinatorAgent implements IAgent {
  readonly id = 'glm-coordinator';
  readonly name = 'GLM Coordinator Agent';
  readonly description = '智能任务协调助手（基于智谱AI GLM-4.7），可调用专门的子 Agent 协助完成任务';
  readonly capabilities: AgentCapability[] = [
    AgentCapability.General,
    AgentCapability.Complex,
    AgentCapability.Code,
    AgentCapability.Web,
  ];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 100,
    timeout: 300000,
  };

  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private sharedContext: SharedContext;
  private subAgents: Map<string, IAgent>;
  private imageStorage: ImageStorage;
  private memoryService?: MemoryService;
  private hierarchicalMemoryService?: HierarchicalMemoryService;
  private ragService?: RAGService;
  private learningModule?: LearningModule;
  private skillLoader?: SkillLoader;
  private enableMemory: boolean;
  private enableLearning: boolean;
  private enableHierarchicalMemory: boolean;
  private scheduler?: Scheduler;

  // 待发送的文件列表
  private pendingFiles: string[] = [];

  // LLM 提供商（使用新的提供商抽象）
  private llmProvider: LLMProvider;
  private useJwtAuth: boolean;

  // 工具名称到 Agent ID 的映射
  private readonly toolToAgentMap: Record<string, string> = {
    'run_code_agent': 'code',
    'run_browser_agent': 'browser',
    'run_shell_agent': 'shell',
    'run_websearch_agent': 'websearch',
    'run_data_analysis_agent': 'data',
    'run_vision_agent': 'vision',
    'run_refactor_agent': 'refactor',
  };

  constructor(options: GLMCoordinatorAgentOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://open.bigmodel.cn/api/paas/v4/';
    this.model = options.model || 'glm-4.7';
    this.maxTokens = options.maxTokens || 8192;
    this.sharedContext = options.sharedContext;
    this.subAgents = options.subAgents;
    this.memoryService = options.memoryService;
    this.hierarchicalMemoryService = options.hierarchicalMemoryService;
    this.ragService = options.ragService;
    this.learningModule = options.learningModule;
    this.enableMemory = options.enableMemory ?? true;
    this.enableLearning = options.enableLearning ?? true;
    this.enableHierarchicalMemory = !!options.hierarchicalMemoryService;
    this.scheduler = options.scheduler;

    // 初始化技能加载器（渐进式加载：先只扫描元数据）
    // 使用统一的 skills 目录（所有技能的默认存放位置）
    const skillsDir = path.join(process.cwd(), 'skills');
    this.skillLoader = new SkillLoader(skillsDir);
    this.skillLoader.scanSkillsMetadata().then(() => {
      const stats = this.skillLoader!.getStats();
      logger.info(`[GLMCoordinatorAgent] 技能系统已初始化（渐进式加载）: ${stats.loadingRatio}`);
    }).catch(err => {
      logger.warn(`[GLMCoordinatorAgent] 技能扫描失败: ${err}`);
    });

    // 初始化图片存储（使用 workspace 作为存储路径）
    this.imageStorage = new ImageStorage(process.cwd());

    // 检查是否使用 Coding Plan 端点
    // Coding Plan 使用直接 API Key 认证，普通端点可能需要 JWT
    const isCodingPlan = this.baseUrl.includes('/coding/');
    this.useJwtAuth = !isCodingPlan && this.apiKey.includes('.');

    // 初始化 LLM 提供商（使用新的提供商抽象）
    this.llmProvider = glm({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      useJwt: this.useJwtAuth,
      isCodingPlan: isCodingPlan,
    });

    logger.info(`[GLMCoordinatorAgent] 初始化完成 (模型: ${this.model})`);
    logger.info(`[GLMCoordinatorAgent] API 地址: ${this.baseUrl}`);
    logger.info(`[GLMCoordinatorAgent] 认证方式: ${isCodingPlan ? 'Coding Plan (直接 API Key)' : (this.useJwtAuth ? 'JWT' : 'API Key')}`);
    logger.info(`[GLMCoordinatorAgent] 图片存储路径: ${process.cwd()}/images`);
    logger.info(`[GLMCoordinatorAgent] 已注册 ${this.subAgents.size} 个子 Agent`);
    logger.info(`[GLMCoordinatorAgent] 记忆服务: ${this.enableMemory && this.memoryService ? '已启用' : '未启用'}`);
    logger.info(`[GLMCoordinatorAgent] 分层记忆: ${this.enableHierarchicalMemory && this.hierarchicalMemoryService ? '已启用 (OpenViking 风格)' : '未启用'}`);
    logger.info(`[GLMCoordinatorAgent] 自主学习: ${this.enableLearning && this.learningModule ? '已启用' : '未启用'}`);
    logger.info(`[GLMCoordinatorAgent] 定时任务调度器: ${this.scheduler ? '已启用' : '未启用'}`);
  }

  /**
   * 检查是否能处理该任务
   */
  canHandle(message: AgentMessage): number {
    return 1.0;
  }

  /**
   * 从消息内容中解析嵌入的图片 (file:// 协议)
   */
  private parseEmbeddedImages(content: string): Array<{ path: string; name: string }> {
    const images: Array<{ path: string; name: string }> = [];
    // 匹配 <img src="file://..." /> 格式
    const imgRegex = /<img\s+src="file:\/\/([^"]+)"\s*\/?>/gi;
    let match;

    while ((match = imgRegex.exec(content)) !== null) {
      const filePath = match[1];
      // Windows 路径需要转换反斜杠
      const normalizedPath = filePath.replace(/\\/g, '/');
      const fileName = normalizedPath.split('/').pop() || 'image';
      images.push({ path: `file://${normalizedPath}`, name: fileName });
    }

    if (images.length > 0) {
      logger.info(`[GLMCoordinatorAgent] 从 content 中解析出 ${images.length} 个嵌入图片`);
    }

    return images;
  }

  /**
   * 处理消息 - 使用 o1 风格的深度思考模式
   *
   * o1 设计理念：
   * 1. 先思考，后回答 - 生成详细的推理过程
   * 2. 多步推理 - 将复杂问题分解
   * 3. 自我验证 - 检查答案的正确性
   * 4. 迭代改进 - 根据验证结果优化
   */
  async process(
    message: AgentMessage,
    context: AgentContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    // 清空待发送文件列表
    this.pendingFiles = [];

    try {
      logger.info(`[GLMCoordinatorAgent] 处理消息: ${message.content.substring(0, 50)}...`);

      // 处理空内容情况（如只发送图片）
      let content = message.content;
      if (!content || content.trim() === '') {
        if (message.attachments && message.attachments.length > 0) {
          // 有附件但无文字内容，添加默认提示
          const attachmentTypes = message.attachments.map(a => a.type).join(', ');
          content = `请帮我查看这张${attachmentTypes}图片`;
        } else {
          // 完全空消息，返回提示
          return {
            content: '请发送文字内容或图片，我会帮你处理。',
            agentId: this.id,
          };
        }
      }

      // 检查是否有图片附件
      const imageAttachments = message.attachments?.filter(a =>
        a.type === 'image' ||
        ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(a.type)
      ) || [];

      // 检查 content 中是否有嵌入的图片
      const embeddedImages = this.parseEmbeddedImages(content);

      // 合并两种来源的图片
      const allImages = [
        ...imageAttachments.map(a => ({ path: a.path, name: a.name || 'image', type: a.type })),
        ...embeddedImages.map(img => ({ ...img, type: 'image' as const }))
      ];

      logger.info(`[GLMCoordinatorAgent] 图片统计: attachments=${imageAttachments.length}, embedded=${embeddedImages.length}, total=${allImages.length}`);

      // 如果有嵌入图片，从 content 中移除 <img> 标签，避免污染提示词
      if (embeddedImages.length > 0) {
        content = content.replace(/<img\s+src="file:\/\/[^"]+"\s*\/?>/gi, '').trim();
        // 如果清理后内容为空，添加默认提示
        if (!content || content.trim() === '') {
          content = '请帮我查看这张图片';
        }
        logger.info(`[GLMCoordinatorAgent] 清理后的 content: ${content.substring(0, 50)}...`);
      }

      // 添加用户消息到共享上下文
      this.sharedContext.addConversation('user', content);

      // 如果有图片且 Vision Agent 可用，直接委托给 Vision Agent
      if (allImages.length > 0 && this.subAgents.has('vision')) {
        logger.info(`[GLMCoordinatorAgent] 检测到 ${allImages.length} 个图片，委托给 Vision Agent`);

        // 构建图片路径列表
        const imagePaths = allImages.map(img => img.path).join(', ');

        // 构建任务描述
        const task = content || '请帮我分析这张图片';

        // 调用 Vision Agent
        const visionAgent = this.subAgents.get('vision')!;
        const subMessage: AgentMessage = {
          channel: message.channel,
          userId: message.userId,
          groupId: message.groupId,
          content: `请分析图片: ${imagePaths}\n任务: ${task}`,
          attachments: allImages.map(img => ({
            type: 'image',
            path: path.join(context.workspacePath, img.path),
            name: img.name,
          })),
          timestamp: new Date(),
        };

        const visionResponse = await visionAgent.process(subMessage, context);

        // 添加助手响应到共享上下文
        this.sharedContext.addConversation('assistant', visionResponse.content, this.id);

        // 保存对话记忆
        if (this.enableMemory && this.memoryService) {
          await this.saveConversationMemory(message, visionResponse.content, context);
        }

        const elapsed = Date.now() - startTime;
        logger.info(`[GLMCoordinatorAgent] Vision Agent 处理完成，耗时: ${elapsed}ms`);

        return {
          content: visionResponse.content,
          agentId: 'vision',
        };
      }

      // 构建消息历史（不包含图片，因为 GLM-4.7 不支持）
      const messages = this.buildMessages(message, content);

      // 获取可用工具
      const tools = this.getAvailableTools();

      // 使用 ReAct 模式：Reasoning + Acting
      logger.info(`[GLMCoordinatorAgent] 使用 ReAct 推理模式`);

      const result = await this.reactLoop(messages, context, message, tools, content);

      let finalResponse = result.answer;

      // 自动纠正：检测用户请求发送文件但 GLM API 没有调用工具的情况
      const requestSendFile = /.*(发给我|发送|传给我|下载|我要.*文件).*/i.test(content);
      const hasFileToolCall = result.hasFileSendToolCall;

      if (requestSendFile && !hasFileToolCall && this.pendingFiles.length === 0) {
        logger.warn(`[GLMCoordinatorAgent] 检测到文件发送请求但未调用工具，尝试自动纠正...`);

        // 尝试从用户消息中提取文件名
        const fileMatch = content.match(/(\w+\.(txt|md|json|xml|csv|log|yaml|yml|docx|pdf|png|jpg|jpeg))/i);
        if (fileMatch) {
          const fileName = fileMatch[1];
          const filePath = path.join(context.workspacePath, fileName);

          try {
            await fs.access(filePath);
            this.pendingFiles.push(filePath);
            logger.info(`[GLMCoordinatorAgent] 自动纠正：添加文件到发送队列: ${filePath}`);
            finalResponse = `📁 ${finalResponse}\n\n💡 已自动为您添加文件: ${fileName}`;
          } catch {
            logger.warn(`[GLMCoordinatorAgent] 自动纠正失败：文件不存在: ${filePath}`);
          }
        } else {
          // 如果无法提取具体文件名，提示用户
          finalResponse = `⚠️ ${finalResponse}\n\n💡 请明确指定要发送的文件名，例如："把 test.txt 发给我"`;
        }
      }

      // 添加助手响应到共享上下文
      this.sharedContext.addConversation('assistant', finalResponse, this.id);

      // 保存对话记忆
      if (this.enableMemory && this.memoryService) {
        await this.saveConversationMemory(message, finalResponse, context);
      }

      const elapsed = Date.now() - startTime;
      logger.info(`[GLMCoordinatorAgent] 处理完成，耗时: ${elapsed}ms`);

      return {
        content: finalResponse,
        agentId: this.id,
        filesToSend: this.pendingFiles.length > 0 ? [...this.pendingFiles] : undefined,
      };

    } catch (error) {
      logger.error(`[GLMCoordinatorAgent] 处理失败: ${error}`);

      // 即使处理失败，如果有待发送文件，仍然返回文件列表
      const errorMessage = `❌ [GLM Coordinator Agent] 处理失败: ${error instanceof Error ? error.message : String(error)}`;

      // 检查是否是 GLM API 网络错误
      const isNetworkError = error instanceof Error && (
        error.message.includes('500') ||
        error.message.includes('Internal network failure') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT')
      );

      if (isNetworkError && this.pendingFiles.length > 0) {
        logger.info(`[GLMCoordinatorAgent] GLM API 网络错误，但有待发送文件: ${this.pendingFiles.length} 个`);
        return {
          content: `${errorMessage}\n\n💡 但已找到 ${this.pendingFiles.length} 个文件，稍后将发送给您...`,
          agentId: this.id,
          filesToSend: [...this.pendingFiles],
        };
      }

      return {
        content: errorMessage,
        agentId: this.id,
      };
    }
  }

  /**
   * ReAct 循环：Reasoning + Acting
   *
   * 简洁有效的推理模式：
   * 1. 直接调用 API，让模型自己推理
   * 2. 如果需要工具，执行工具并继续
   * 3. 验证结果质量
   */
  private async reactLoop(
    messages: ChatMessage[],
    context: AgentContext,
    originalMessage: AgentMessage,
    tools: Tool[],
    userQuery: string
  ): Promise<{ answer: string; steps: number; hasFileSendToolCall: boolean }> {
    const systemPrompt = await this.buildSystemPrompt(context, originalMessage);
    let steps = 0;
    let hasFileSendToolCall = false;
    const maxSteps = 5;

    // 当前消息历史
    let currentMessages = [...messages];
    let finalAnswer = '';

    while (steps < maxSteps) {
      steps++;
      logger.info(`[ReAct] 步骤 ${steps}/${maxSteps}`);

      // 调用 API
      const response = await this.callGLMAPI(currentMessages, systemPrompt, tools);

      // 检查是否需要调用工具
      if (response.choices[0]?.finish_reason === 'tool_calls' && response.choices[0]?.message?.tool_calls) {
        const toolCalls = response.choices[0].message.tool_calls;
        logger.info(`[ReAct] 调用工具: ${toolCalls.map(t => t.function.name).join(', ')}`);

        // 检查是否调用了文件发送工具
        if (toolCalls.some(t => t.function.name === 'send_file' || t.function.name === 'send_multiple_files')) {
          hasFileSendToolCall = true;
        }

        // 添加 assistant 消息（包含 tool_calls）
        currentMessages.push({
          role: 'assistant',
          content: response.choices[0].message.content || '',
          tool_calls: toolCalls
        });

        // 执行工具
        const toolResults = await this.executeTools(toolCalls, context, originalMessage);

        // 检查是否有失败
        const hasFailures = toolResults.some(r =>
          r.result.includes('错误') || r.result.includes('失败') || r.result.includes('ERROR')
        );

        // 添加工具结果到消息历史
        for (const result of toolResults) {
          currentMessages.push({
            role: 'tool',
            content: result.result,
            tool_call_id: result.toolCallId
          });
        }

        // 如果有失败，尝试继续
        if (hasFailures) {
          logger.warn(`[ReAct] 工具执行失败，继续尝试...`);
          continue;
        }

        // 继续对话获取最终答案
        const continueResponse = await this.callGLMAPI(currentMessages, systemPrompt, tools);

        if (continueResponse.choices[0]?.finish_reason === 'stop' || !continueResponse.choices[0]?.message?.tool_calls) {
          finalAnswer = continueResponse.choices[0]?.message?.content || '处理完成';

          // 任务验证：检查是否真的完成了用户的请求
          const userWantsFileSend = /.*(发给我|发送|传给我|下载).*/i.test(userQuery);
          const actuallySentFile = hasFileSendToolCall || this.pendingFiles.length > 0;

          if (userWantsFileSend && !actuallySentFile) {
            logger.warn(`[ReAct] 检测到未完成的文件发送请求，强制纠正...`);
            finalAnswer += '\n\n⚠️ 需要调用文件发送工具来完成您的请求。';
          }

          break;
        }

        // 还有工具调用，添加到消息历史并继续
        if (continueResponse.choices[0]?.message) {
          currentMessages.push({
            role: 'assistant',
            content: continueResponse.choices[0].message.content || '',
            tool_calls: continueResponse.choices[0].message.tool_calls
          });
        }
      } else {
        // 直接返回答案
        finalAnswer = response.choices[0]?.message?.content || '无响应';
        break;
      }
    }

    logger.info(`[ReAct] 完成，总步骤: ${steps}`);
    return { answer: finalAnswer, steps, hasFileSendToolCall };
  }

  /**
   * 目标导向执行 - 持续尝试直到目标达成
   *
   * 实现类似 o1 的持续推理能力：
   * 1. 多步思考 - 每次行动前进行深入分析
   * 2. 失败重试 - 遇到错误不放弃，尝试替代方案
   * 3. 自我纠正 - 识别问题并主动调整策略
   * 4. 工具链组合 - 灵活组合多个工具解决问题
   */
  private async executeWithGoalOrientation(
    messages: ChatMessage[],
    systemPrompt: string,
    tools: Tool[],
    context: AgentContext,
    originalMessage: AgentMessage,
    content: string
  ): Promise<{ result: string; steps: ExecutionStep[] }> {
    // 创建目标导向执行器
    const executor = new GoalOrientedExecutor(content, {
      maxIterations: 15,
      maxFailures: 5,
    });

    // 执行目标导向循环
    const { finalResult, steps } = await executor.execute(
      // 思考并行动函数
      async (state) => {
        // 1. 思考阶段：分析当前状态，决定下一步行动
        const thoughtPrompt = this.buildThoughtPrompt(state, messages);
        const thoughtResponse = await this.callGLMAPI(
          [{ role: 'user', content: thoughtPrompt }],
          this.getThoughtSystemPrompt(),
          []
        );
        const thought = thoughtResponse.choices[0]?.message?.content || '继续执行任务';

        logger.info(`[GoalOrientedExecutor] 思考: ${thought.substring(0, 100)}...`);

        // 2. 行动阶段：执行决定的行动
        const actionPrompt = this.buildActionPrompt(state, thought, messages);
        const actionResponse = await this.callGLMAPI(
          [{ role: 'user', content: actionPrompt }],
          systemPrompt,
          tools
        );

        // 3. 处理响应
        let actionResult: string;
        let success = false;
        let toolUsed: string | undefined;

        if (actionResponse.choices[0]?.finish_reason === 'tool_calls' && actionResponse.choices[0]?.message?.tool_calls) {
          // 需要调用工具
          const toolCalls = actionResponse.choices[0].message.tool_calls;
          logger.info(`[GoalOrientedExecutor] 调用工具: ${toolCalls.map(t => t.function.name).join(', ')}`);

          const toolResults = await this.executeTools(toolCalls, context, originalMessage);

          // 继续对话获取最终结果
          const continueMessages = [
            ...messages,
            { role: 'assistant', content: actionResponse.choices[0].message.content || '', tool_calls: toolCalls } as ChatMessage,
            ...toolResults.map(r => ({ role: 'tool' as const, content: r.result, tool_call_id: r.toolCallId })),
          ];

          const continueResponse = await this.callGLMAPI(continueMessages, systemPrompt, tools);
          actionResult = continueResponse.choices[0]?.message?.content || '工具执行完成';
          toolUsed = toolCalls[0]?.function.name;
        } else {
          actionResult = actionResponse.choices[0]?.message?.content || '无响应';
        }

        // 4. 评估结果
        success = this.isActionSuccessful(actionResult);

        return {
          thought,
          action: toolUsed || '直接回答',
          result: actionResult,
          success,
          toolUsed,
        };
      },
      // 检查目标是否达成
      (result) => {
        return this.isGoalAchieved(content, result);
      }
    );

    return { result: finalResult, steps };
  }

  /**
   * 构建思考提示词
   */
  private buildThoughtPrompt(state: ExecutionState, originalMessages: ChatMessage[]): string {
    const historySummary = state.history.length > 0
      ? `\n执行历史:\n${state.history.map(s => `- 步骤 ${s.stepNumber}: ${s.action} -> ${s.success ? '成功' : '失败'}`).join('\n')}`
      : '';

    const failureInfo = state.lastError
      ? `\n上次失败原因: ${state.lastError}`
      : '';

    return `
当前任务: ${state.goal}
当前步骤: ${state.currentStep}${historySummary}${failureInfo}

请分析当前情况，决定下一步应该做什么。如果之前的方法失败了，请思考替代方案。
    `.trim();
  }

  /**
   * 构建行动提示词
   */
  private buildActionPrompt(state: ExecutionState, thought: string, originalMessages: ChatMessage[]): string {
    return `
思考: ${thought}

任务: ${state.goal}

基于你的思考，选择合适的工具或直接回答问题来完成任务。
    `.trim();
  }

  /**
   * 获取思考阶段的系统提示词
   */
  private getThoughtSystemPrompt(): string {
    return `
你是一个任务分析专家。你的职责是：
1. 分析当前执行状态
2. 识别问题和障碍
3. 提出下一步行动建议
4. 如果之前的方法失败，思考替代方案

重要原则：
- 如果目标未达成，不要轻易放弃
- 优先尝试不同的工具组合
- 分析失败原因并调整策略
- 保持简洁明确的思考
    `.trim();
  }

  /**
   * 判断行动是否成功
   */
  private isActionSuccessful(result: string): boolean {
    // 检查结果是否包含错误标记
    const errorPatterns = [
      '错误',
      '失败',
      '无法',
      '错误：',
      'ERROR',
      'FAILED',
      '执行失败',
      '未找到',
      '不存在',
    ];

    const lowerResult = result.toLowerCase();
    return !errorPatterns.some(pattern => lowerResult.includes(pattern.toLowerCase()));
  }

  /**
   * 判断目标是否达成
   */
  private isGoalAchieved(goal: string, result: string): boolean {
    // 简单的达成检测：结果不包含错误，且长度合理
    if (!this.isActionSuccessful(result)) {
      return false;
    }

    // 检查结果是否提供了有意义的回答（至少20个字符）
    if (result.length < 20) {
      return false;
    }

    // 如果结果看起来完整（以句号、问号等结尾），认为达成
    const completePatterns = ['。', '！', '？', '.', '!', '?', '\n\n'];
    return completePatterns.some(pattern => result.trim().endsWith(pattern));
  }

  /**
   * 调用 GLM API
   *
   * 使用新的提供商抽象 API
   */
  private async callGLMAPI(
    messages: ChatMessage[],
    systemPrompt: string,
    tools: Tool[]
  ): Promise<ChatCompletionResponse> {
    // 构建完整的消息数组（包含系统提示）
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // 检查是否需要使用视觉模型（消息中包含图片）
    const hasVisionContent = messages.some(msg =>
      Array.isArray(msg.content) && msg.content.some((block: any) => block.type === 'image_url')
    );

    // 如果有视觉内容，使用 GLM-4V 模型
    const model = hasVisionContent ? 'glm-4v' : this.model;

    logger.debug(`[GLMCoordinatorAgent] 使用模型: ${model}${hasVisionContent ? ' (视觉)' : ''}`);

    // 转换消息格式以匹配提供商 API
    // GLMCoordinatorAgent 使用 ContentBlock[]，提供商使用 string
    const providerMessages = fullMessages.map(msg => ({
      role: msg.role,
      content: Array.isArray(msg.content)
        ? JSON.stringify(msg.content)  // 简化处理：将数组转为字符串
        : msg.content,
      tool_calls: msg.tool_calls as any,
      tool_call_id: msg.tool_call_id,
    }));

    // 使用提供商抽象调用 API
    const llmResponse = await this.llmProvider.chat.completions.create({
      model,
      messages: providerMessages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: this.maxTokens,
      temperature: 0.7,
      top_p: 0.9,
    });

    // 转换为本地 ChatCompletionResponse 类型
    const response: ChatCompletionResponse = {
      id: llmResponse.id,
      object: llmResponse.object,
      created: llmResponse.created,
      model: llmResponse.model,
      choices: llmResponse.choices.map(choice => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content,
          tool_calls: choice.message.tool_calls,
        },
        finish_reason: choice.finish_reason,
      })),
      usage: llmResponse.usage,
    };

    logger.debug(`[GLMCoordinatorAgent] API 响应: ${JSON.stringify(response).substring(0, 500)}...`);
    return response;
  }

  /**
   * 执行网络搜索（使用 Zhipu API）
   */
  private async performWebSearch(query: string): Promise<string> {
    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) {
      throw new Error('GLM_API_KEY not set');
    }

    const baseUrl = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'glm-4.7',
        messages: [
          {
            role: 'system',
            content: '你是一个搜索助手。请根据用户的问题进行网络搜索，提供准确、详细的答案。如果搜索到相关信息，请总结要点并提供来源。'
          },
          {
            role: 'user',
            content: query
          }
        ],
        tools: [
          {
            type: 'web_search',
            web_search: {
              enable: true,
              search_result: true
            }
          }
        ],
        max_tokens: 4096,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '搜索失败，未获取到结果';
  }

  /**
   * 构建系统提示词 - 使用 SKILL.md 技能系统
   */
  private async buildSystemPrompt(context: AgentContext, message?: AgentMessage): Promise<string> {
    const enabledAgents = this.getEnabledAgentNames();
    const platform = process.platform;
    const isWindows = platform === 'win32';

    // 获取记忆上下文
    let memoryContext = '';
    if (this.enableMemory && this.ragService && message) {
      const userId = message.userId || 'unknown';
      const groupId = message.groupId;
      memoryContext = await this.ragService.buildSystemContext(userId, groupId, message.content);
    }

    // ========== 方案1：注入人格设定到 System Prompt ==========
    // 获取当前 Agent 的人格设定
    const myPersona = getAgentPersona('glm-coordinator');
    let personaPrompt = '';
    if (myPersona) {
      personaPrompt = buildFullPersonaPrompt(myPersona);

      // 如果有其他 Agent，添加团队协作提示
      const teammateIds = Object.keys(AGENT_PERSONAS).filter(id => id !== 'glm-coordinator');
      if (teammateIds.length > 0) {
        const teammates = teammateIds.map(id => AGENT_PERSONAS[id]).filter(Boolean);
        personaPrompt += '\n\n' + buildTeamCollaborationPrompt(myPersona, teammates);
      }
    }

    // 基础提示词（精简版）
    let systemPrompt = `# 任务协调助手

你是高级任务协调助手，可以调用子 Agent 和工具完成用户请求。

## 工作环境
- 工作目录: ${context.workspacePath}
- 存储目录: ${context.storagePath}
- 可用 Agent: ${enabledAgents.join(', ')}

## 工作流程

对于每个请求：
1. **理解需求** - 分析用户想要什么
2. **选择工具** - 根据需求选择合适的 Agent 或工具
3. **执行验证** - 确保任务完成，不要半途而废

## ⚠️ 重要规则

- 文件发送请求（"把xxx发给我"）必须调用 send_file 或 send_multiple_files 工具
- 列出文件不算发送文件，必须调用发送工具！
- 代码相关任务优先调用 Claude Code Agent
- 搜索相关任务优先调用 Web Search Agent

## Few-Shot 示例（参考这些对话模式）

### 示例1：文件发送
用户: "把 test.md 发给我"
助手: [调用 send_file(filePath="test.md")]

### 示例2：批量文件发送
用户: "把这些test文件都发给我"
助手: [调用 list_directory 查看文件]
助手: [调用 send_multiple_files(filePatterns=["test.txt", "test.md", "test.json"])]

### 示例3：代码执行
用户: "帮我写一个Python脚本"
助手: [调用 run_claude_code_agent]

### 示例4：网络搜索
用户: "搜索最新的AI新闻"
助手: [调用 web_search(query="最新AI新闻")]

### 错误示例（禁止）：
用户: "把 test.txt 发给我"
助手: [调用 list_directory] "已列出文件，已发送"  ❌ 错误！必须调用 send_file
`;

    // ========== 注入人格设定 ==========
    if (personaPrompt) {
      systemPrompt += `

${personaPrompt}
`;
    }

    // 如果有技能系统，使用技能元数据增强提示词（按需加载，非全部注入）
    if (this.skillLoader) {
      // 只在有明确需求时注入技能信息，而非每次都注入全部30个技能
      // systemPrompt = this.skillLoader.buildMetadataSystemPrompt(systemPrompt);
    }

    // 添加记忆上下文（如果有）
    if (memoryContext) {
      systemPrompt += `\n## 记忆上下文\n${memoryContext}`;
    }

    return systemPrompt;
  }

  /**
   * 构建消息历史
   */
  private buildMessages(message: AgentMessage, contentOverride?: ContentBlock): ChatMessage[] {
    // 使用 override 内容或原始内容
    const content = contentOverride !== undefined ? contentOverride : message.content;

    // 从共享上下文获取历史消息
    const historyMessages = this.sharedContext.getAnthropicMessages();

    // 如果历史消息为空，使用当前消息
    if (historyMessages.length === 0) {
      return [{ role: 'user', content }];
    }

    // 检查最后一条消息是否是当前用户的消息，避免重复
    const lastMsg = historyMessages[historyMessages.length - 1];
    // 对于图片消息，我们始终添加新的消息
    const isVisionContent = Array.isArray(content);
    if (!isVisionContent && lastMsg.role === 'user' && lastMsg.content === content) {
      return historyMessages as ChatMessage[];
    }

    // 添加当前用户消息
    return [
      ...historyMessages,
      { role: 'user', content },
    ] as ChatMessage[];
  }

  /**
   * 获取可用的工具定义 - 动态从 SKILL.md 加载
   */
  private getAvailableTools(): Tool[] {
    const tools: Tool[] = [];

    // 使用 SkillLoader 动态加载工具定义（基于元数据，渐进式加载第1层）
    if (this.skillLoader) {
      const metadatas = this.skillLoader.getAllMetadata();

      for (const [name, metadata] of metadatas) {
        // 只为已注册的子 Agent 添加工具
        const agentId = this.toolToAgentMap[name];
        if (agentId && this.subAgents.has(agentId)) {
          tools.push(this.skillLoader.metadataToTool(metadata));
        }
      }
    }

    // 回退到硬编码的工具定义（如果 SkillLoader 不可用）
    if (tools.length === 0) {
      // Code Agent
      if (this.subAgents.has('code')) {
        tools.push({
          type: 'function',
          function: {
            name: 'run_code_agent',
            description: '执行代码相关任务：编写、分析、调试、优化代码',
            parameters: {
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
          },
        });
      }

      // Browser Agent
      if (this.subAgents.has('browser')) {
        tools.push({
          type: 'function',
          function: {
            name: 'run_browser_agent',
            description: '网页操作：访问网页、截图、提取信息、填充表单',
            parameters: {
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
          },
        });
      }

      // Browser Agent
      if (this.subAgents.has('browser')) {
        tools.push({
          type: 'function',
          function: {
            name: 'run_browser_agent',
            description: '网页操作：访问网页、截图、提取信息、填充表单',
            parameters: {
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
          },
        });
      }

      // Shell Agent
    if (this.subAgents.has('shell')) {
      tools.push({
        type: 'function',
        function: {
          name: 'run_shell_agent',
          description: '执行系统命令。用于：列出文件(ls/dir)、查看目录、运行脚本等安全操作',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: '要执行的命令。常用示例：ls -la（列出文件）、dir（Windows列出文件）、cat file.txt（查看文件）',
              },
            },
            required: ['command'],
          },
        },
      });
    }

    // Web Search Agent
    if (this.subAgents.has('websearch')) {
      tools.push({
        type: 'function',
        function: {
          name: 'run_websearch_agent',
          description: '网络搜索：搜索问题、查找资料、收集信息',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '搜索关键词或问题',
              },
            },
            required: ['query'],
          },
        },
      });
    }

    // Web Search Tool - 使用 Zhipu API 直接搜索（推荐使用）
    tools.push({
      type: 'function',
      function: {
        name: 'web_search',
        description: '网络搜索工具：使用 Zhipu AI 搜索引擎进行实时网络搜索，获取最新信息',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词或问题',
            },
          },
          required: ['query'],
        },
      },
    });

    // Data Analysis Agent
    if (this.subAgents.has('data')) {
      tools.push({
        type: 'function',
        function: {
          name: 'run_data_analysis_agent',
          description: '数据分析：分析文件、统计数据、生成报告',
          parameters: {
            type: 'object',
            properties: {
              task: {
                type: 'string',
                description: '分析任务描述，例如：分析 data.csv 文件',
              },
              file: {
                type: 'string',
                description: '可选的文件路径',
              },
            },
            required: ['task'],
          },
        },
      });
    }

    // Batch File Send Tool - 批量发送文件给用户
    tools.push({
      type: 'function',
      function: {
        name: 'send_multiple_files',
        description: '【批量文件传输 - 必须调用】当用户请求发送多个文件时必须使用此工具！⚠️ 列出文件后必须调用此工具才能真正发送文件！触发词："把这些文件都发给我"、"发送所有test文件"、"批量发送文件"、"把test相关的文件传给我"。参数 filePatterns 是文件名列表，如：["test.txt", "test.md", "test.json"]。注意：只列出文件名不算发送，必须调用此工具！',
        parameters: {
          type: 'object',
          properties: {
            filePatterns: {
              type: 'array',
              items: { type: 'string' } as any,
              description: '文件名列表（不是路径，只是文件名）。例如：["test.txt", "test.md", "test.json"]',
            } as any,
          } as any,
          required: ['filePatterns'],
        } as any,
      },
    } as any);

    // File Send Tool - 发送文件给用户
    tools.push({
      type: 'function',
      function: {
        name: 'send_file',
        description: '【文件传输】当用户请求把单个文件发送到QQ时使用。触发词："把xxx发给我"、"发送文件xxx"、"传文件给我"、"我要xxx文件"、"下载xxx"。注意：此工具用于文件传输，不是读取内容。执行后文件会发送到用户的QQ。',
        parameters: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: '文件名。只需提供文件名如：ai_news_summary.md，系统会自动查找工作区中的文件',
            },
          },
          required: ['filePath'],
        },
      },
    });

    // Read File Tool - 读取文件内容（支持图片和文本）
    tools.push({
      type: 'function',
      function: {
        name: 'read_file',
        description: '【读取内容】用于读取文本文件内容或查看图片。用于分析文件内容，不是用于文件传输。如果用户要接收文件，应使用send_file工具',
        parameters: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: '文件的绝对路径或相对于工作区的路径',
            },
          },
          required: ['filePath'],
        },
      },
    });

    // Write File Tool - 写入文件内容
    tools.push({
      type: 'function',
      function: {
        name: 'write_file',
        description: '写入文件内容。如果文件不存在会创建，如果存在会覆盖。',
        parameters: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: '文件的绝对路径或相对于工作区的路径',
            },
            content: {
              type: 'string',
              description: '要写入的内容',
            },
            append: {
              type: 'boolean',
              description: '是否追加模式，默认 false（覆盖）',
            },
          },
          required: ['filePath', 'content'],
        },
      },
    });

    // List Directory Tool - 列出目录内容
    tools.push({
      type: 'function',
      function: {
        name: 'list_directory',
        description: '列出目录内容。返回目录中所有文件和子目录的列表。',
        parameters: {
          type: 'object',
          properties: {
            directoryPath: {
              type: 'string',
              description: '目录的绝对路径或相对于工作区的路径',
            },
            recursive: {
              type: 'boolean',
              description: '是否递归列出子目录，默认 false',
            },
          },
          required: ['directoryPath'],
        },
      },
    });

    // Learn Tool - 学习新知识（自主学习）
    if (this.enableLearning && this.learningModule) {
      tools.push({
        type: 'function',
        function: {
          name: 'learn_and_solve',
          description: '自主学习并解决问题：当不知道答案时，自动搜索解决方案并学习，然后回答用户问题',
          parameters: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: '需要学习的问题或任务',
              },
            },
            required: ['question'],
          },
        },
      });

      // Check Knowledge Tool - 检查是否已有相关知识
      tools.push({
        type: 'function',
        function: {
          name: 'check_knowledge',
          description: '检查知识库中是否已有相关的答案或解决方案',
          parameters: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: '要查询的问题',
              },
            },
            required: ['question'],
          },
        },
      });

      // Store Knowledge Tool - 存储新学到的知识
      tools.push({
        type: 'function',
        function: {
          name: 'store_knowledge',
          description: '存储新学到的知识到记忆中，以便将来使用',
          parameters: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: '问题或主题',
              },
              answer: {
                type: 'string',
                description: '答案或解决方案',
              },
              confidence: {
                type: 'number',
                description: '置信度 (0-1)，默认 0.7',
              },
            },
            required: ['question', 'answer'],
          },
        },
      });
    }
    }

    // 计划工具 - 制定执行计划
    tools.push({
      type: 'function',
      function: {
        name: 'create_plan',
        description: '制定执行计划：将复杂任务分解为多个步骤，生成详细的执行计划',
        parameters: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: '需要规划的任务描述',
            },
            context: {
              type: 'string',
              description: '任务背景信息，帮助更好地理解任务需求',
            },
          },
          required: ['task'],
        },
      },
    });

    // 自我反思工具 - 评估当前行为和结果
    tools.push({
      type: 'function',
      function: {
        name: 'self_reflect',
        description: '自我反思和评估：分析当前行为、结果是否符合预期，识别问题和改进点',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: '已执行的操作或行动',
            },
            result: {
              type: 'string',
              description: '操作的结果或响应',
            },
            expectation: {
              type: 'string',
              description: '预期的结果或目标',
            },
          },
          required: ['action', 'result'],
        },
      },
    });

    // 调整策略工具 - 根据反思结果调整策略
    tools.push({
      type: 'function',
      function: {
        name: 'adjust_strategy',
        description: '调整执行策略：根据自我反思的结果，调整执行方法或尝试新的解决方案',
        parameters: {
          type: 'object',
          properties: {
            currentStrategy: {
              type: 'string',
              description: '当前的执行策略或方法',
            },
            issue: {
              type: 'string',
              description: '当前策略存在的问题或失败原因',
            },
            newStrategy: {
              type: 'string',
              description: '建议的新策略或替代方案',
            },
          },
          required: ['currentStrategy', 'issue'],
        },
      },
    });

    // Vision Agent - 图片分析工具
    if (this.subAgents.has('vision')) {
      tools.push({
        type: 'function',
        function: {
          name: 'run_vision_agent',
          description: '图片分析工具：使用 GLM-4V 进行图片内容分析、OCR 文字提取、错误诊断、图表理解、UI 分析等',
          parameters: {
            type: 'object',
            properties: {
              task: {
                type: 'string',
                description: '具体的视觉任务描述，例如：描述图片内容、提取文字、分析错误截图、理解架构图等',
              },
              image: {
                type: 'string',
                description: '图片文件路径（相对于工作区或绝对路径）',
              },
            },
            required: ['task', 'image'],
          },
        },
      });
    }

    // ==================== 定时任务工具 ====================
    if (this.scheduler) {
      // 列出所有定时任务
      tools.push({
        type: 'function',
        function: {
          name: 'list_scheduled_tasks',
          description: '列出所有已设置的定时任务（包括通过 Dashboard 和 QQ 对话设置的任务）',
          parameters: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                description: '可选的状态筛选：pending(等待中)、running(运行中)、paused(已暂停)、completed(已完成)、all(全部)',
              },
            },
            required: [],
          },
        },
      });

      // 创建定时任务
      tools.push({
        type: 'function',
        function: {
          name: 'create_scheduled_task',
          description: '创建新的定时任务。支持周期任务（每隔一段时间执行）和定时任务（在指定时间执行一次）',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: '任务名称',
              },
              description: {
                type: 'string',
                description: '任务描述',
              },
              type: {
                type: 'string',
                description: '任务类型：periodic(周期任务) 或 scheduled(定时任务)',
              },
              command: {
                type: 'string',
                description: '要执行的命令或提示词',
              },
              interval: {
                type: 'number',
                description: '执行间隔（毫秒）。仅周期任务需要，例如：3600000 = 1小时',
              },
              scheduledTime: {
                type: 'number',
                description: '执行时间（Unix 时间戳，毫秒）。仅定时任务需要',
              },
              notifyQQ: {
                type: 'boolean',
                description: '是否发送 QQ 通知，默认 false',
              },
            },
            required: ['name', 'type', 'command'],
          },
        },
      });

      // 更新定时任务
      tools.push({
        type: 'function',
        function: {
          name: 'update_scheduled_task',
          description: '更新已存在的定时任务配置',
          parameters: {
            type: 'object',
            properties: {
              taskId: {
                type: 'string',
                description: '任务 ID',
              },
              name: {
                type: 'string',
                description: '新的任务名称',
              },
              description: {
                type: 'string',
                description: '新的任务描述',
              },
              command: {
                type: 'string',
                description: '新的命令',
              },
              enabled: {
                type: 'boolean',
                description: '是否启用任务',
              },
            },
            required: ['taskId'],
          },
        },
      });

      // 删除定时任务
      tools.push({
        type: 'function',
        function: {
          name: 'delete_scheduled_task',
          description: '删除指定的定时任务',
          parameters: {
            type: 'object',
            properties: {
              taskId: {
                type: 'string',
                description: '要删除的任务 ID',
              },
            },
            required: ['taskId'],
          },
        },
      });

      // 暂停/恢复任务
      tools.push({
        type: 'function',
        function: {
          name: 'pause_scheduled_task',
          description: '暂停周期任务（停止自动执行，但保留任务）',
          parameters: {
            type: 'object',
            properties: {
              taskId: {
                type: 'string',
                description: '要暂停的任务 ID',
              },
            },
            required: ['taskId'],
          },
        },
      });

      tools.push({
        type: 'function',
        function: {
          name: 'resume_scheduled_task',
          description: '恢复已暂停的周期任务',
          parameters: {
            type: 'object',
            properties: {
              taskId: {
                type: 'string',
                description: '要恢复的任务 ID',
              },
            },
            required: ['taskId'],
          },
        },
      });

      // 立即执行任务
      tools.push({
        type: 'function',
        function: {
          name: 'execute_scheduled_task_now',
          description: '立即执行指定的定时任务（不影响原有的调度计划）',
          parameters: {
            type: 'object',
            properties: {
              taskId: {
                type: 'string',
                description: '要执行的任务 ID',
              },
            },
            required: ['taskId'],
          },
        },
      });

      // 获取任务统计
      tools.push({
        type: 'function',
        function: {
          name: 'get_task_statistics',
          description: '获取定时任务的统计信息：总任务数、运行中、已完成、执行次数等',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      });
    }

    return tools;
  }

  /**
   * 执行工具调用
   */
  private async executeTools(
    toolCalls: ToolCall[],
    context: AgentContext,
    message?: AgentMessage
  ): Promise<Array<{ toolCallId: string; result: string; agentId: string }>> {
    const results: Array<{ toolCallId: string; result: string; agentId: string }> = [];

    for (const toolCall of toolCalls) {
      // 处理 send_file 工具（特殊处理，不调用子Agent）
      if (toolCall.function.name === 'send_file') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const filePath = args.filePath as string;

          // 参数验证
          if (!filePath) {
            results.push({
              toolCallId: toolCall.id,
              result: 'Error: Missing required parameter filePath',
              agentId: 'glm-coordinator',
            });
            continue;
          }

          // 解析文件路径
          let fullPath: string;
          if (filePath.startsWith('uploads/') || filePath.startsWith('workspace/')) {
            // 相对路径，需要完整路径
            fullPath = path.join(process.cwd(), filePath);
          } else if (path.isAbsolute(filePath)) {
            fullPath = filePath;
          } else {
            // 默认从工作区查找
            fullPath = path.join(context.workspacePath, filePath);
          }

          // 检查文件是否存在
          try {
            await fs.access(fullPath);
            const fileName = path.basename(fullPath);
            // 添加到待发送文件列表
            this.pendingFiles.push(fullPath);
            logger.info(`[GLMCoordinatorAgent] 添加文件到发送队列: ${fullPath}`);
            // 返回明确的成功消息，让 GLM API 知道文件将被发送
            results.push({
              toolCallId: toolCall.id,
              result: `文件 ${fileName} 已准备发送，将通过 QQ 传送给您`,
              agentId: 'glm-coordinator',
            });
          } catch {
            results.push({
              toolCallId: toolCall.id,
              result: `Error: File not found - ${filePath}`,
              agentId: 'glm-coordinator',
            });
          }
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] send_file 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `Error: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 send_multiple_files 工具（批量文件发送）
      if (toolCall.function.name === 'send_multiple_files') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const filePatterns = args.filePatterns as string[];

          // 参数验证
          if (!filePatterns || filePatterns.length === 0) {
            results.push({
              toolCallId: toolCall.id,
              result: 'Error: Missing required parameter filePatterns',
              agentId: 'glm-coordinator',
            });
            continue;
          }

          // 简化实现：直接使用文件名列表，不支持通配符
          const matchedFiles: string[] = [];
          for (const pattern of filePatterns) {
            // 如果包含通配符，返回提示
            if (pattern.includes('*') || pattern.includes('?')) {
              results.push({
                toolCallId: toolCall.id,
                result: `Error: 通配符暂不支持，请使用完整文件名。例如：["test.txt", "test.md", "test.json"]`,
                agentId: 'glm-coordinator',
              });
              continue;
            }

            // 检查文件是否存在
            const fullPath = path.join(context.workspacePath, pattern);
            try {
              await fs.access(fullPath);
              matchedFiles.push(fullPath);
            } catch {
              // 文件不存在，跳过
            }
          }

          // 去重
          const uniqueFiles = [...new Set(matchedFiles)];

          if (uniqueFiles.length === 0) {
            results.push({
              toolCallId: toolCall.id,
              result: `Error: No files found. 请检查文件名是否正确`,
              agentId: 'glm-coordinator',
            });
            continue;
          }

          // 添加所有匹配的文件到待发送列表
          for (const filePath of uniqueFiles) {
            this.pendingFiles.push(filePath);
            logger.info(`[GLMCoordinatorAgent] 添加文件到发送队列: ${filePath}`);
          }

          results.push({
            toolCallId: toolCall.id,
            result: `已将 ${uniqueFiles.length} 个文件添加到发送队列: ${uniqueFiles.map(f => path.basename(f)).join(', ')}`,
            agentId: 'glm-coordinator',
          });
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] send_multiple_files 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `Error: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 read_file 工具（本地文件读取）
      if (toolCall.function.name === 'read_file') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const filePath = args.filePath as string;

          // 参数验证
          if (!filePath) {
            results.push({
              toolCallId: toolCall.id,
              result: `错误：缺少必需参数 filePath`,
              agentId: 'glm-coordinator',
            });
            continue;
          }

          // 解析文件路径
          let fullPath: string;
          if (filePath.startsWith('uploads/') || filePath.startsWith('workspace/') || filePath.startsWith('images/')) {
            // 相对路径，需要完整路径
            fullPath = path.join(process.cwd(), filePath);
          } else if (path.isAbsolute(filePath)) {
            fullPath = filePath;
          } else {
            // 默认从工作区查找
            fullPath = path.join(context.workspacePath, filePath);
          }

          // 检查文件是否存在
          try {
            await fs.access(fullPath);

            // 检查是否是图片文件
            const ext = path.extname(fullPath).toLowerCase();
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

            if (imageExtensions.includes(ext)) {
              // 读取图片并转换为 base64
              const buffer = await fs.readFile(fullPath);
              const base64 = buffer.toString('base64');
              const mimeType = this.getMimeType(ext);
              const result = `[Image file: ${path.basename(fullPath)}]\nData: data:${mimeType};base64,${base64}`;
              results.push({
                toolCallId: toolCall.id,
                result,
                agentId: 'glm-coordinator',
              });
              logger.info(`[GLMCoordinatorAgent] read_file 成功读取图片: ${fullPath}`);
            } else {
              // 读取文本文件
              const content = await fs.readFile(fullPath, 'utf-8');
              const stats = await fs.stat(fullPath);
              const result = `File: ${fullPath}\nSize: ${stats.size} bytes\n\n${content}`;
              results.push({
                toolCallId: toolCall.id,
                result,
                agentId: 'glm-coordinator',
              });
              logger.info(`[GLMCoordinatorAgent] read_file 成功读取文件: ${fullPath}`);
            }
          } catch {
            results.push({
              toolCallId: toolCall.id,
              result: `错误：文件不存在 - ${filePath}`,
              agentId: 'glm-coordinator',
            });
          }
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] read_file 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 write_file 工具（本地文件写入）
      if (toolCall.function.name === 'write_file') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const filePath = args.filePath as string;
          const content = args.content as string;
          const append = args.append as boolean;

          // 参数验证
          if (!filePath) {
            results.push({
              toolCallId: toolCall.id,
              result: `错误：缺少必需参数 filePath`,
              agentId: 'glm-coordinator',
            });
            continue;
          }
          if (content === undefined || content === null) {
            results.push({
              toolCallId: toolCall.id,
              result: `错误：缺少必需参数 content`,
              agentId: 'glm-coordinator',
            });
            continue;
          }

          // 解析文件路径
          let fullPath: string;
          if (filePath.startsWith('uploads/') || filePath.startsWith('workspace/') || filePath.startsWith('images/')) {
            fullPath = path.join(process.cwd(), filePath);
          } else if (path.isAbsolute(filePath)) {
            fullPath = filePath;
          } else {
            fullPath = path.join(context.workspacePath, filePath);
          }

          // 确保目录存在
          const dir = path.dirname(fullPath);
          try {
            await fs.access(dir);
          } catch {
            await fs.mkdir(dir, { recursive: true });
          }

          // 写入文件
          if (append) {
            await fs.appendFile(fullPath, content, 'utf-8');
          } else {
            await fs.writeFile(fullPath, content, 'utf-8');
          }

          const stats = await fs.stat(fullPath);
          const result = `File written successfully: ${fullPath}\nSize: ${stats.size} bytes`;
          results.push({
            toolCallId: toolCall.id,
            result,
            agentId: 'glm-coordinator',
          });
          logger.info(`[GLMCoordinatorAgent] write_file 成功写入文件: ${fullPath}`);
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] write_file 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 list_directory 工具（列出目录内容）
      if (toolCall.function.name === 'list_directory') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const directoryPath = args.directoryPath as string;
          const recursive = args.recursive as boolean;

          // 参数验证
          if (!directoryPath) {
            results.push({
              toolCallId: toolCall.id,
              result: `错误：缺少必需参数 directoryPath`,
              agentId: 'glm-coordinator',
            });
            continue;
          }

          // 解析目录路径
          let fullPath: string;
          if (directoryPath.startsWith('uploads/') || directoryPath.startsWith('workspace/') || directoryPath.startsWith('images/')) {
            fullPath = path.join(process.cwd(), directoryPath);
          } else if (path.isAbsolute(directoryPath)) {
            fullPath = directoryPath;
          } else {
            fullPath = path.join(context.workspacePath, directoryPath);
          }

          // 检查目录是否存在
          try {
            const stats = await fs.stat(fullPath);
            if (!stats.isDirectory()) {
              results.push({
                toolCallId: toolCall.id,
                result: `错误：路径不是目录 - ${directoryPath}`,
                agentId: 'glm-coordinator',
              });
              continue;
            }
          } catch {
            results.push({
              toolCallId: toolCall.id,
              result: `错误：目录不存在 - ${directoryPath}`,
              agentId: 'glm-coordinator',
            });
            continue;
          }

          // 列出目录内容
          const items = await this.listDirRecursive(fullPath, recursive ? 3 : 1, 0);
          const result = `Directory: ${fullPath}\n\n${items.join('\n')}`;
          results.push({
            toolCallId: toolCall.id,
            result,
            agentId: 'glm-coordinator',
          });
          logger.info(`[GLMCoordinatorAgent] list_directory 成功列出目录: ${fullPath}`);
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] list_directory 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理学习工具
      if (toolCall.function.name === 'learn_and_solve' && this.learningModule) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const question = args.question as string;

          logger.info(`[GLMCoordinatorAgent] 自主学习: "${question.substring(0, 50)}..."`);

          // 检查是否已经知道
          const knowledgeCheck = await this.learningModule.knowsAbout(question, {
            userId: message?.userId,
            groupId: message?.groupId,
          });

          if (knowledgeCheck.known && knowledgeCheck.knowledge && knowledgeCheck.knowledge.length > 0) {
            // 已有相关知识，直接返回
            const bestKnowledge = knowledgeCheck.knowledge[0];
            this.learningModule.markUsed(bestKnowledge.id);

            results.push({
              toolCallId: toolCall.id,
              result: `[已有知识] (置信度: ${(bestKnowledge.confidence * 100).toFixed(0)}%)\n\n问题: ${bestKnowledge.question}\n\n答案: ${bestKnowledge.answer}`,
              agentId: 'glm-coordinator',
            });
          } else {
            // 不知道，开始学习
            const learnResult = await this.learningModule.learn(question, {
              userId: message?.userId,
              groupId: message?.groupId,
            });

            if (learnResult.success && learnResult.summary) {
              results.push({
                toolCallId: toolCall.id,
                result: `[自主学习完成]\n\n已搜索并学习关于 "${question}" 的知识。\n\n找到的信息:\n${learnResult.summary}`,
                agentId: 'glm-coordinator',
              });
            } else {
              results.push({
                toolCallId: toolCall.id,
                result: `[自主学习失败] ${learnResult.error || '无法获取信息'}\n\n建议：您可以尝试使用 run_websearch_agent 工具进行网络搜索。`,
                agentId: 'glm-coordinator',
              });
            }
          }
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] learn_and_solve 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 check_knowledge 工具
      if (toolCall.function.name === 'check_knowledge' && this.learningModule) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const question = args.question as string;

          const knowledgeCheck = await this.learningModule.knowsAbout(question, {
            userId: message?.userId,
            groupId: message?.groupId,
          });

          if (knowledgeCheck.known && knowledgeCheck.knowledge && knowledgeCheck.knowledge.length > 0) {
            const entries = knowledgeCheck.knowledge.map(k =>
              `- ${(k.confidence * 100).toFixed(0)}%: ${k.question}\n  ${k.answer.substring(0, 100)}...`
            ).join('\n');
            results.push({
              toolCallId: toolCall.id,
              result: `[已有相关知识]\n平均置信度: ${(knowledgeCheck.confidence * 100).toFixed(0)}%\n\n${entries}`,
              agentId: 'glm-coordinator',
            });
          } else {
            results.push({
              toolCallId: toolCall.id,
              result: `[无相关知识] 知识库中没有关于 "${question}" 的记录。建议使用 learn_and_solve 工具进行自主学习。`,
              agentId: 'glm-coordinator',
            });
          }
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] check_knowledge 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 store_knowledge 工具
      if (toolCall.function.name === 'store_knowledge' && this.learningModule) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const question = args.question as string;
          const answer = args.answer as string;
          const confidence = args.confidence as number | undefined;

          const knowledgeId = await this.learningModule.storeKnowledge(
            question,
            answer,
            'user_provided',
            {
              confidence: confidence ?? 0.7,
              tags: ['user-taught'],
              userId: message?.userId,
              groupId: message?.groupId,
            }
          );

          results.push({
            toolCallId: toolCall.id,
            result: `[知识已存储] ID: ${knowledgeId}\n问题: ${question}\n置信度: ${confidence ?? 0.7}`,
            agentId: 'glm-coordinator',
          });
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] store_knowledge 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 create_plan 工具（制定执行计划）
      if (toolCall.function.name === 'create_plan') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const task = args.task as string;
          const context = args.context as string | undefined;

          logger.info(`[GLMCoordinatorAgent] 制定执行计划: "${task.substring(0, 50)}..."`);

          // 生成计划提示词
          const planPrompt = context
            ? `任务背景:\n${context}\n\n任务: ${task}\n\n请将这个任务分解为具体的执行步骤，每个步骤应该是可执行的、清晰的。`
            : `任务: ${task}\n\n请将这个任务分解为具体的执行步骤，每个步骤应该是可执行的、清晰的。`;

          // 调用 GLM API 生成计划
          const planResponse = await this.callGLMAPI(
            [{ role: 'user', content: planPrompt }],
            '你是一个任务规划专家。将复杂任务分解为清晰、可执行的步骤。每个步骤应该：\n1. 明确具体\n2. 可独立执行\n3. 有明确的结果验证标准\n\n请以编号列表形式输出计划。',
            []
          );

          const plan = planResponse.choices[0]?.message?.content || '无法生成计划';

          results.push({
            toolCallId: toolCall.id,
            result: `[执行计划]\n\n${plan}`,
            agentId: 'glm-coordinator',
          });

          // 保存计划到共享上下文
          this.sharedContext.addConversation('system', `[当前执行计划]\n${plan}`, this.id);

          logger.info(`[GLMCoordinatorAgent] 计划已生成并保存`);
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] create_plan 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 self_reflect 工具（自我反思和评估）
      if (toolCall.function.name === 'self_reflect') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const action = args.action as string;
          const result = args.result as string;
          const expectation = args.expectation as string | undefined;

          logger.info(`[GLMCoordinatorAgent] 自我反思: "${action.substring(0, 50)}..."`);

          // 构建反思提示词
          const reflectPrompt = expectation
            ? `执行的操作: ${action}\n预期结果: ${expectation}\n实际结果: ${result}\n\n请分析：\n1. 结果是否符合预期？\n2. 如果不符合，问题出在哪里？\n3. 有什么改进建议？`
            : `执行的操作: ${action}\n实际结果: ${result}\n\n请评估这个操作是否成功，识别潜在问题和改进点。`;

          // 调用 GLM API 进行自我反思
          const reflectResponse = await this.callGLMAPI(
            [{ role: 'user', content: reflectPrompt }],
            '你是一个自我反思专家。客观分析执行结果，识别成功和失败的原因，提供具体的改进建议。',
            []
          );

          const reflection = reflectResponse.choices[0]?.message?.content || '无法进行反思';

          results.push({
            toolCallId: toolCall.id,
            result: `[自我反思分析]\n\n${reflection}`,
            agentId: 'glm-coordinator',
          });

          // 保存反思结果到共享上下文
          this.sharedContext.addConversation('system', `[自我反思]\n${reflection}`, this.id);

          logger.info(`[GLMCoordinatorAgent] 自我反思完成`);
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] self_reflect 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 adjust_strategy 工具（调整执行策略）
      if (toolCall.function.name === 'adjust_strategy') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const currentStrategy = args.currentStrategy as string;
          const issue = args.issue as string;
          const newStrategy = args.newStrategy as string | undefined;

          logger.info(`[GLMCoordinatorAgent] 调整策略: "${issue.substring(0, 50)}..."`);

          // 构建策略调整提示词
          const adjustPrompt = newStrategy
            ? `当前策略: ${currentStrategy}\n存在的问题: ${issue}\n建议的新策略: ${newStrategy}\n\n请分析：\n1. 新策略是否能解决当前问题？\n2. 实施新策略需要注意什么？\n3. 预期的改进效果是什么？`
            : `当前策略: ${currentStrategy}\n存在的问题: ${issue}\n\n请分析问题并提出替代策略或解决方案。`;

          // 调用 GLM API 生成策略调整建议
          const adjustResponse = await this.callGLMAPI(
            [{ role: 'user', content: adjustPrompt }],
            '你是一个策略分析专家。分析当前策略的问题，评估替代方案的可行性，提供具体的实施建议。',
            []
          );

          const adjustment = adjustResponse.choices[0]?.message?.content || '无法生成策略调整建议';

          results.push({
            toolCallId: toolCall.id,
            result: `[策略调整分析]\n\n${adjustment}`,
            agentId: 'glm-coordinator',
          });

          // 保存策略调整到共享上下文
          this.sharedContext.addConversation('system', `[策略调整]\n${adjustment}`, this.id);

          logger.info(`[GLMCoordinatorAgent] 策略调整完成`);
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] adjust_strategy 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // ==================== 定时任务工具处理 ====================
      if (this.scheduler && toolCall.function.name.startsWith('list_scheduled_tasks') ||
          toolCall.function.name === 'create_scheduled_task' ||
          toolCall.function.name === 'update_scheduled_task' ||
          toolCall.function.name === 'delete_scheduled_task' ||
          toolCall.function.name === 'pause_scheduled_task' ||
          toolCall.function.name === 'resume_scheduled_task' ||
          toolCall.function.name === 'execute_scheduled_task_now' ||
          toolCall.function.name === 'get_task_statistics') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const userId = message?.userId || 'unknown';

          switch (toolCall.function.name) {
            case 'list_scheduled_tasks': {
              const status = args.status as string | undefined;
              let tasks;

              if (!status || status === 'all') {
                tasks = this.scheduler.getAllTasks();
              } else {
                tasks = this.scheduler.getAllTasks().filter(t => t.status === status);
              }

              if (tasks.length === 0) {
                results.push({
                  toolCallId: toolCall.id,
                  result: '[定时任务列表] 暂无任务。使用 create_scheduled_task 工具创建新任务。',
                  agentId: 'glm-coordinator',
                });
              } else {
                const taskList = tasks.map(t => {
                  const nextExec = t.nextExecutionTime ? new Date(t.nextExecutionTime).toLocaleString('zh-CN') : '无';
                  const typeStr = t.type === 'periodic'
                    ? `周期 (${Math.round((t as any).periodicConfig.interval / 60000)}分钟)`
                    : '定时';
                  return `- [${t.id.substring(0, 8)}] ${t.name}
  类型: ${typeStr} | 状态: ${t.enabled ? '启用' : '禁用'} (${t.status})
  命令: ${t.command.substring(0, 50)}...
  下次执行: ${nextExec}
  执行次数: ${t.executionCount}`;
                }).join('\n\n');

                results.push({
                  toolCallId: toolCall.id,
                  result: `[定时任务列表] 共 ${tasks.length} 个任务：\n\n${taskList}`,
                  agentId: 'glm-coordinator',
                });
              }
              break;
            }

            case 'create_scheduled_task': {
              const name = args.name as string;
              const type = args.type as 'periodic' | 'scheduled';
              const command = args.command as string;
              const description = args.description as string | undefined;
              const interval = args.interval as number | undefined;
              const scheduledTime = args.scheduledTime as number | undefined;
              const notifyQQ = args.notifyQQ as boolean | undefined;

              // 验证参数
              if (type === 'periodic' && !interval) {
                results.push({
                  toolCallId: toolCall.id,
                  result: '错误：周期任务必须指定 interval 参数（执行间隔，毫秒）',
                  agentId: 'glm-coordinator',
                });
                break;
              }

              if (type === 'scheduled' && !scheduledTime) {
                results.push({
                  toolCallId: toolCall.id,
                  result: '错误：定时任务必须指定 scheduledTime 参数（Unix 时间戳）',
                  agentId: 'glm-coordinator',
                });
                break;
              }

              const task = await this.scheduler.createTask({
                name,
                description,
                type,
                command,
                createdBy: userId,
                notifyQQ: notifyQQ ?? false,
                notifyTarget: userId,
                periodicConfig: type === 'periodic' ? { interval } : undefined,
                scheduledConfig: type === 'scheduled' ? { scheduledTime } : undefined,
              });

              results.push({
                toolCallId: toolCall.id,
                result: `[任务创建成功] ${task.name} (ID: ${task.id.substring(0, 8)})
类型: ${type === 'periodic' ? '周期任务' : '定时任务'}
${type === 'periodic' ? `执行间隔: ${Math.round(interval! / 60000)} 分钟` : `执行时间: ${new Date(scheduledTime!).toLocaleString('zh-CN')}`}
命令: ${command}`,
                agentId: 'glm-coordinator',
              });
              break;
            }

            case 'update_scheduled_task': {
              const taskId = args.taskId as string;
              const updates: any = {};

              if (args.name !== undefined) updates.name = args.name;
              if (args.description !== undefined) updates.description = args.description;
              if (args.command !== undefined) updates.command = args.command;
              if (args.enabled !== undefined) updates.enabled = args.enabled;

              const task = await this.scheduler.updateTask(taskId, updates);
              if (!task) {
                results.push({
                  toolCallId: toolCall.id,
                  result: `错误：未找到任务 ${taskId}`,
                  agentId: 'glm-coordinator',
                });
              } else {
                results.push({
                  toolCallId: toolCall.id,
                  result: `[任务更新成功] ${task.name}`,
                  agentId: 'glm-coordinator',
                });
              }
              break;
            }

            case 'delete_scheduled_task': {
              const taskId = args.taskId as string;
              const deleted = await this.scheduler.deleteTask(taskId);

              if (deleted) {
                results.push({
                  toolCallId: toolCall.id,
                  result: `[任务删除成功] 任务 ${taskId.substring(0, 8)} 已删除`,
                  agentId: 'glm-coordinator',
                });
              } else {
                results.push({
                  toolCallId: toolCall.id,
                  result: `错误：未找到任务 ${taskId}`,
                  agentId: 'glm-coordinator',
                });
              }
              break;
            }

            case 'pause_scheduled_task': {
              const taskId = args.taskId as string;
              const success = await this.scheduler.pauseTask(taskId);

              if (success) {
                results.push({
                  toolCallId: toolCall.id,
                  result: `[任务已暂停] 任务 ${taskId.substring(0, 8)} 已暂停。使用 resume_scheduled_task 恢复。`,
                  agentId: 'glm-coordinator',
                });
              } else {
                results.push({
                  toolCallId: toolCall.id,
                  result: `错误：暂停失败，任务不存在或不是周期任务`,
                  agentId: 'glm-coordinator',
                });
              }
              break;
            }

            case 'resume_scheduled_task': {
              const taskId = args.taskId as string;
              const success = await this.scheduler.resumeTask(taskId);

              if (success) {
                results.push({
                  toolCallId: toolCall.id,
                  result: `[任务已恢复] 任务 ${taskId.substring(0, 8)} 已恢复运行。`,
                  agentId: 'glm-coordinator',
                });
              } else {
                results.push({
                  toolCallId: toolCall.id,
                  result: `错误：恢复失败，任务不存在或不是周期任务`,
                  agentId: 'glm-coordinator',
                });
              }
              break;
            }

            case 'execute_scheduled_task_now': {
              const taskId = args.taskId as string;
              const success = await this.scheduler.executeTaskNow(taskId);

              if (success) {
                results.push({
                  toolCallId: toolCall.id,
                  result: `[任务已开始执行] 任务 ${taskId.substring(0, 8)} 正在执行中...`,
                  agentId: 'glm-coordinator',
                });
              } else {
                results.push({
                  toolCallId: toolCall.id,
                  result: `错误：执行失败，任务可能已在运行中`,
                  agentId: 'glm-coordinator',
                });
              }
              break;
            }

            case 'get_task_statistics': {
              const stats = this.scheduler.getStatistics();
              results.push({
                toolCallId: toolCall.id,
                result: `[定时任务统计]
总任务数: ${stats.totalTasks}
- 周期任务: ${stats.periodicTasks}
- 定时任务: ${stats.scheduledTasks}
- 启用任务: ${stats.enabledTasks}
- 运行中: ${stats.runningTasks}
- 等待中: ${stats.pendingTasks}

执行统计:
- 今日执行: ${stats.todayExecutions} 次
- 总执行次数: ${stats.totalExecutions} 次
- 成功: ${stats.successExecutions} 次
- 失败: ${stats.failedExecutions} 次`,
                agentId: 'glm-coordinator',
              });
              break;
            }

            default:
              results.push({
                toolCallId: toolCall.id,
                result: `错误：未知的工具 ${toolCall.function.name}`,
                agentId: 'glm-coordinator',
              });
          }
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] 定时任务工具执行失败 (${toolCall.function.name}): ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 web_search 工具（使用 Zhipu API 直接搜索）
      if (toolCall.function.name === 'web_search') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const query = args.query as string;

          if (!query) {
            results.push({
              toolCallId: toolCall.id,
              result: `错误：缺少必需参数 query`,
              agentId: 'glm-coordinator',
            });
            continue;
          }

          logger.info(`[GLMCoordinatorAgent] 执行网络搜索: "${query}"`);

          // 直接调用 Zhipu API 进行网络搜索
          const searchResult = await this.performWebSearch(query);

          results.push({
            toolCallId: toolCall.id,
            result: `[网络搜索结果]\n\n${searchResult}`,
            agentId: 'glm-coordinator',
          });

          logger.info(`[GLMCoordinatorAgent] 网络搜索完成`);

        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] web_search 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 run_websearch_agent 工具（兼容旧版，使用真实搜索）
      if (toolCall.function.name === 'run_websearch_agent') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const query = args.query as string;

          if (!query) {
            results.push({
              toolCallId: toolCall.id,
              result: `错误：缺少必需参数 query`,
              agentId: 'glm-coordinator',
            });
            continue;
          }

          logger.info(`[GLMCoordinatorAgent] 执行网络搜索 (run_websearch_agent): "${query}"`);

          // 直接调用 Zhipu API 进行网络搜索
          const searchResult = await this.performWebSearch(query);

          results.push({
            toolCallId: toolCall.id,
            result: `[网络搜索结果]\n\n${searchResult}`,
            agentId: 'websearch',
          });

          logger.info(`[GLMCoordinatorAgent] 网络搜索完成`);

        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] run_websearch_agent 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'websearch',
          });
        }
        continue;
      }

      // 处理子Agent工具
      const agentId = this.toolToAgentMap[toolCall.function.name];

      if (!agentId) {
        logger.warn(`[GLMCoordinatorAgent] 未知的工具: ${toolCall.function.name}`);
        results.push({
          toolCallId: toolCall.id,
          result: `错误：未知的工具 ${toolCall.function.name}`,
          agentId: 'unknown',
        });
        continue;
      }

      const agent = this.subAgents.get(agentId);
      if (!agent) {
        logger.warn(`[GLMCoordinatorAgent] 子 Agent 未找到: ${agentId}`);
        results.push({
          toolCallId: toolCall.id,
          result: `错误：子 Agent ${agentId} 未找到`,
          agentId,
        });
        continue;
      }

      try {
        logger.info(`[GLMCoordinatorAgent] 调用子 Agent: ${agentId}`);

        // 解析工具参数
        const args = JSON.parse(toolCall.function.arguments);

        // 构建子 Agent 消息
        const subMessage: AgentMessage = {
          channel: 'coordinator',
          userId: 'coordinator',
          content: this.buildSubAgentPrompt(toolCall.function.name, args),
          timestamp: new Date(),
        };

        // Vision Agent 特殊处理：需要传递图片
        if (agentId === 'vision' && args.image) {
          const imagePath = args.image as string;
          const task = args.task as string;

          // 构建包含图片的消息内容
          const imageContent = await this.loadImageForVision(imagePath, context);
          subMessage.content = [
            { type: 'image_url', image_url: { url: imageContent } },
            { type: 'text', text: task },
          ] as any;
        }

        // 调用子 Agent
        const subResponse = await agent.process(subMessage, context);

        // 保存工作状态到共享上下文
        this.sharedContext.setWorkState(agentId, subResponse.content);

        results.push({
          toolCallId: toolCall.id,
          result: subResponse.content,
          agentId,
        });

        logger.info(`[GLMCoordinatorAgent] 子 Agent ${agentId} 执行完成`);

      } catch (error) {
        logger.error(`[GLMCoordinatorAgent] 子 Agent ${agentId} 执行失败: ${error}`);
        results.push({
          toolCallId: toolCall.id,
          result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
          agentId,
        });
      }
    }

    return results;
  }

  /**
   * 构建子 Agent 提示词
   */
  private buildSubAgentPrompt(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case 'run_code_agent':
        return args.task as string;

      case 'run_browser_agent':
        if (args.url) {
          return `访问 ${args.url}：${args.task}`;
        }
        return args.task as string;

      case 'run_shell_agent':
        return `执行命令: ${args.command}`;

      case 'run_websearch_agent':
        return `搜索: ${args.query}`;

      case 'run_data_analysis_agent':
        if (args.file) {
          return `分析文件 ${args.file}：${args.task}`;
        }
        return args.task as string;

      case 'run_vision_agent':
        // Vision Agent 需要特殊处理，传递完整的参数对象
        // 因为需要同时传递 task 和 image
        return `分析图片: ${args.task}`;

      case 'run_refactor_agent':
        if (args.autoApply) {
          return `执行重构: ${args.task} (自动应用)`;
        }
        return args.task as string;

      default:
        return JSON.stringify(args);
    }
  }

  /**
   * 保存对话记忆
   */
  private async saveConversationMemory(
    userMessage: AgentMessage,
    assistantResponse: string,
    context: AgentContext
  ): Promise<void> {
    const userId = userMessage.userId || 'unknown';
    const groupId = userMessage.groupId;

    // 使用分层记忆服务（OpenViking 风格）
    if (this.enableHierarchicalMemory && this.hierarchicalMemoryService) {
      const sessionId = (context.metadata?.sessionId as string) || 'default';

      // 保存用户消息到 L0（快速检索）
      await this.hierarchicalMemoryService.addHierarchicalMemory(
        MemoryType.MESSAGE,
        userMessage.content,
        MemoryLayer.L0,
        {
          userId,
          groupId,
          taskId: `${this.id}:${sessionId}`,
          tags: ['user-message', 'L0'],
          importance: 0.5,
        }
      );

      // 保存助手响应到 L0
      await this.hierarchicalMemoryService.addHierarchicalMemory(
        MemoryType.MESSAGE,
        assistantResponse,
        MemoryLayer.L0,
        {
          userId,
          groupId,
          taskId: `${this.id}:${sessionId}`,
          tags: ['assistant-response', 'L0'],
          importance: 0.5,
        }
      );

      logger.debug('[GLMCoordinatorAgent] 分层对话记忆已保存 (L0)');
      return;
    }

    // 使用普通记忆服务
    if (this.enableMemory && this.memoryService) {
      // 保存用户消息
      await this.memoryService.addMemory(
        MemoryType.MESSAGE,
        userMessage.content,
        {
          userId,
          groupId,
          tags: ['user-message'],
          importance: 0.5,
        }
      );

      // 保存助手响应
      await this.memoryService.addMemory(
        MemoryType.MESSAGE,
        assistantResponse,
        {
          userId,
          groupId,
          tags: ['assistant-response'],
          importance: 0.5,
        }
      );

      logger.debug('[GLMCoordinatorAgent] 对话记忆已保存');
    }
  }

  /**
   * 继续对话，传入工具结果
   */
  private async continueWithToolResults(
    originalMessages: ChatMessage[],
    originalToolCalls: ToolCall[],
    toolResults: Array<{ toolCallId: string; result: string; agentId: string }>,
    context: AgentContext,
    message?: AgentMessage
  ): Promise<string> {
    // 构建新的消息数组
    const newMessages: ChatMessage[] = [
      ...originalMessages,
    ];

    // 添加原始的 tool_calls 和结果
    for (const toolCall of originalToolCalls) {
      // 添加 assistant 的工具调用消息
      newMessages.push({
        role: 'assistant',
        content: '',
        tool_calls: [toolCall],
      });

      // 查找对应的工具结果
      const result = toolResults.find(r => r.toolCallId === toolCall.id);
      if (result) {
        newMessages.push({
          role: 'tool',
          content: result.result,
          tool_call_id: toolCall.id,
        });
      }
    }

    // 检查是否还有更多工具调用需要处理
    // 调用 API 继续对话
    const systemPrompt = await this.buildSystemPrompt(context);
    const response = await this.callGLMAPI(newMessages, systemPrompt, []);

    // 检查是否还有工具调用
    if (response.choices[0]?.finish_reason === 'tool_calls' && response.choices[0]?.message?.tool_calls) {
      const moreResults = await this.executeTools(response.choices[0].message.tool_calls, context, message);
      return await this.continueWithToolResults(newMessages, response.choices[0].message.tool_calls, moreResults, context, message);
    }

    // 返回最终文本
    return response.choices[0]?.message?.content || '处理完成';
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
    if (this.subAgents.has('websearch')) {
      names.push('Web Search Agent (搜索)');
    }
    if (this.subAgents.has('data')) {
      names.push('Data Analysis Agent (数据分析)');
    }
    if (this.subAgents.has('vision')) {
      names.push('Vision Agent (视觉)');
    }
    if (this.subAgents.has('refactor')) {
      names.push('Code Refactor Agent (重构)');
    }

    return names;
  }

  /**
   * 为 Vision Agent 加载图片
   */
  private async loadImageForVision(imagePath: string, context: AgentContext): Promise<string> {
    try {
      // 解析文件路径
      let fullPath: string;
      if (imagePath.startsWith('/') || path.isAbsolute(imagePath)) {
        fullPath = imagePath;
      } else if (imagePath.startsWith('uploads/') || imagePath.startsWith('workspace/') || imagePath.startsWith('images/')) {
        fullPath = path.join(process.cwd(), imagePath);
      } else {
        fullPath = path.join(context.workspacePath || process.cwd(), imagePath);
      }

      // 检查文件是否存在
      await fs.access(fullPath);

      // 读取图片并转换为 Base64
      const buffer = await fs.readFile(fullPath);
      const base64 = buffer.toString('base64');

      // 获取 MIME 类型
      const ext = path.extname(fullPath).toLowerCase();
      const mimeType = this.getMimeType(ext);

      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      logger.error(`[GLMCoordinatorAgent] 加载图片失败: ${error}`);
      throw new Error(`无法加载图片 ${imagePath}: ${error}`);
    }
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    // 验证 API 连接
    try {
      logger.info('[GLMCoordinatorAgent] 开始验证 API 连接...');
      logger.debug(`[GLMCoordinatorAgent] 使用模型: ${this.model}`);
      logger.debug(`[GLMCoordinatorAgent] API 地址: ${this.baseUrl}`);

      const testMessages: ChatMessage[] = [
        { role: 'user', content: 'Hi' }
      ];

      logger.debug('[GLMCoordinatorAgent] 发送测试请求...');
      await this.callGLMAPI(testMessages, await this.buildSystemPrompt({ workspacePath: process.cwd(), storagePath: process.cwd(), allowedUsers: [] }), []);

      logger.info('[GLMCoordinatorAgent] API 连接验证成功');
    } catch (error) {
      logger.error(`[GLMCoordinatorAgent] API 连接验证失败: ${error}`);
      if (error instanceof Error) {
        logger.error(`[GLMCoordinatorAgent] 错误详情: ${error.message}`);
        logger.error(`[GLMCoordinatorAgent] 错误堆栈: ${error.stack}`);
      }
      throw new Error(`GLM Coordinator Agent 初始化失败: ${error}`);
    }
  }

  /**
   * 清理响应内容中的 Markdown 格式
   * 将 **xxx** 格式替换为 [ xxx ] 格式
   */
  private cleanMarkdownFormat(text: string): string {
    // 匹配 **xxx** 格式并替换为 [ xxx ]
    return text.replace(/\*\*([^*]+)\*\*/g, '[ $1 ]');
  }

  /**
   * 获取 MIME 类型
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 递归列出目录
   */
  private async listDirRecursive(dir: string, maxDepth: number, currentDepth: number): Promise<string[]> {
    const result: string[] = [];
    const indent = '  '.repeat(currentDepth);

    try {
      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        const prefix = item.isDirectory() ? '[DIR]  ' : '[FILE] ';
        const suffix = item.isDirectory() ? '/' : '';
        result.push(`${indent}${prefix}${item.name}${suffix}`);

        // 递归处理子目录
        if (item.isDirectory() && currentDepth < maxDepth - 1) {
          const subDir = path.join(dir, item.name);
          const subItems = await this.listDirRecursive(subDir, maxDepth, currentDepth + 1);
          result.push(...subItems);
        }
      }
    } catch (error) {
      result.push(`${indent}[ERROR] Cannot read directory`);
    }

    return result;
  }

  /**
   * 获取技能加载器（供 Dashboard API 使用）
   */
  getSkillLoader(): SkillLoader | undefined {
    return this.skillLoader;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    logger.info('[GLMCoordinatorAgent] 已清理资源');
  }
}

export default GLMCoordinatorAgent;
