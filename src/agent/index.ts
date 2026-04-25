/**
 * Claude Code Agent - 主入口
 * 直接调用本地 Claude Code CLI，实现真正的 Claude Code Agent
 */

import { FileStorage, StoredFile } from './file-storage.js';
import { ConversationManager } from './conversation-history.js';
import { CliSessionManager } from './cli-session-manager.js';
import { ProgressTracker } from './progress-tracker.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';
import type { DashboardState } from '../gateway/dashboard-api.js';
import type { DashboardStateStore } from '../gateway/dashboard-state-store.js';
import type {
  IAgent,
  AgentCapability,
  AgentConfig as IAgentConfig,
  AgentMessage as IAgentMessage,
  AgentContext,
  AgentResponse as IAgentResponse,
} from '../agents/base/Agent.js';

export interface AgentConfig {
  /** 工作目录 */
  workspacePath: string;
  /** 文件存储路径 */
  storagePath: string;
  /** 允许的用户列表 */
  allowedUsers?: string[];
  /** Dashboard 状态 (可选) */
  dashboardState?: DashboardState;
  /** 状态持久化存储 (可选) */
  stateStore?: DashboardStateStore;
  /** 是否启用详细进度模式 */
  verboseProgress?: boolean;
}

export interface AgentMessage {
  channel: string;
  userId: string;
  groupId?: string;
  content: string;
  attachments?: Array<{
    type: string;
    url: string;
    filename: string;
  }>;
  timestamp?: Date;
}

export interface AgentResponse {
  userId?: string;
  groupId?: string;
  msgId?: string;
  content: string;
  filesToSend?: string[];
}

export class ClaudeCodeAgent implements IAgent {
  // IAgent 接口要求的属性
  readonly id = 'claude';
  readonly name = 'Claude Code Agent';
  readonly description = 'Claude Code CLI - 完整的代码分析和执行能力';
  readonly capabilities: AgentCapability[] = [
    'complex' as AgentCapability,
    'code' as AgentCapability,
    'file' as AgentCapability,
    'analyze' as AgentCapability,
    'general' as AgentCapability,
  ];
  readonly config: IAgentConfig = {
    enabled: true,
    priority: 5,
    timeout: 300000,
  };

  private cliSessionManager: CliSessionManager;
  private storage: FileStorage;
  private conversationManager: ConversationManager;
  private config_internal: AgentConfig;
  private mainGateway: any = null;
  private sendFileCallback: ((userId: string, filePath: string, groupId?: string) => Promise<void>) | null = null;
  private sendMessageCallback: ((userId: string, content: string, groupId?: string) => Promise<void>) | null = null;
  private progressTracker: ProgressTracker | null = null;

  // Phase 3: 知识库服务（自动保存建议）
  private knowledgeService: any = null;
  private autoSaveEnabled = false;

  // 统一知识库入口
  private unifiedKnowledgeEntrance: any = null;

  constructor(config: AgentConfig) {
    this.config_internal = config;
    // 使用 CLI 会话管理器（长期运行的进程）
    this.cliSessionManager = new CliSessionManager({
      workspacePath: config.workspacePath,
      bypassPermissions: true,
      sessionTimeout: 30 * 60 * 1000,  // 30 分钟超时
    });
    this.storage = new FileStorage(config.storagePath);
    // 初始化对话历史管理器
    const historyPath = path.join(config.storagePath, 'conversations');
    this.conversationManager = new ConversationManager(historyPath, {
      maxMessages: 50,  // 最多保留 50 条消息
      maxAgeHours: 12,   // 12 小时后过期
    });

    // 启动自动保存 (每 30 秒)
    this.conversationManager.startAutoSave(30000);

    // Phase 3: 初始化知识库服务（如果可用）
    this.initializeKnowledgeService().catch(error => {
      logger.warn(`知识库服务初始化失败: ${error}`);
    });

    // 初始化进度追踪器，传入 Dashboard 状态
    this.progressTracker = new ProgressTracker(
      {
        throttleInterval: 5000,   // 5 秒节流 - 更快的响应
        maxMessageLength: 1900,   // QQ 消息长度限制
        smartTriggerInterval: 2000, // 智能触发最小间隔 2 秒
        dashboardState: config.dashboardState,  // 传入 Dashboard 状态
        stateStore: config.stateStore,         // 传入持久化存储
        sendCallback: async (userId, content, groupId) => {
          if (this.sendMessageCallback) {
            await this.sendMessageCallback(userId, content, groupId);
          }
        },
      },
      config.verboseProgress ?? false  // 传入详细模式配置
    );

    logger.info(`Claude Code Agent 初始化完成`);
    logger.info(`工作目录: ${config.workspacePath}`);
    logger.info(`存储目录: ${config.storagePath}`);
    logger.info(`CLI 会话模式: 长期运行进程`);
  }

  /**
   * IAgent 接口实现 - 检查是否能处理该任务
   * Claude Code Agent 是默认的兜底 Agent，可以处理所有类型的任务
   */
  canHandle(message: IAgentMessage): number {
    const content = message.content.toLowerCase();

    // 复杂任务特征
    const complexIndicators = [
      // 长任务描述
      message.content.length > 200,
      // 多步骤任务
      /\d+\.\s+|\d+、/.test(message.content),
      // 包含"帮我实现"
      /帮我实现|帮我写|帮我创建/.test(content),
      // 包含代码文件引用
      /\.[a-z]{1,4}\s*[:：]/i.test(message.content),
    ];

    const score = complexIndicators.filter(Boolean).length * 0.15;
    return Math.min(score + 0.2, 1.0); // 基础分数 0.2，最高 1.0
  }

  /**
   * IAgent 接口实现 - 处理消息
   * 将 agents/base/Agent.ts 的 AgentMessage 转换为内部格式后调用 processEvent 方法
   */
  async process(message: IAgentMessage, context: AgentContext): Promise<IAgentResponse> {
    // 将 IAgentMessage 转换为内部使用的 AgentMessage 格式
    const internalMessage: AgentMessage = {
      channel: message.channel,
      userId: message.userId,
      groupId: message.groupId,
      content: message.content,
      attachments: message.attachments?.map(a => ({
        type: a.type,
        url: a.path,
        filename: a.name,
      })),
      timestamp: message.timestamp,
    };

    // 调用内部处理逻辑
    const response = await this.processEvent({ event: 'message', data: internalMessage });

    if (!response) {
      return {
        content: '处理失败',
        userId: message.userId,
        groupId: message.groupId,
      };
    }

    // 转换响应格式
    return {
      content: response.content,
      userId: response.userId,
      groupId: response.groupId,
      msgId: response.msgId,
      filesToSend: response.filesToSend,
    };
  }

  /**
   * 兼容方法：将 IAgentMessage 转换后处理
   */
  async processAgent(message: IAgentMessage, context: AgentContext): Promise<IAgentResponse> {
    // 将 IAgentMessage 转换为内部使用的 AgentMessage
    const internalMessage: AgentMessage = {
      channel: message.channel,
      userId: message.userId,
      groupId: message.groupId,
      content: message.content,
      attachments: message.attachments?.map(a => ({
        type: a.type as string,
        url: a.path,
        filename: a.name,
      })),
      timestamp: message.timestamp,
    };

    // 调用内部处理逻辑
    const response = await this.processEvent({ event: 'message', data: internalMessage });

    if (!response) {
      return {
        content: '处理失败',
        agentId: this.id,
      };
    }

    // 转换响应格式
    return {
      content: response.content || '',
      filesToSend: response.filesToSend,
      agentId: this.id,
    };
  }

  setGateway(gateway: any): void {
    this.mainGateway = gateway;
  }

  setSendFileCallback(callback: (userId: string, filePath: string, groupId?: string) => Promise<void>): void {
    this.sendFileCallback = callback;
  }

  setSendMessageCallback(callback: (userId: string, content: string, groupId?: string) => Promise<void>): void {
    this.sendMessageCallback = callback;
  }

  /**
   * 处理用户消息（内部 event 格式）
   */
  async processEvent(event: any): Promise<AgentResponse | null> {
    const { event: eventType, data } = event;

    if (eventType !== 'message' && eventType !== 'group_message') {
      return null;
    }

    const message = data as AgentMessage;

    // 检查用户权限
    if (this.config_internal.allowedUsers && this.config_internal.allowedUsers.length > 0) {
      if (!this.config_internal.allowedUsers.includes(message.userId)) {
        logger.warn(`用户 ${message.userId} 不在允许列表中`);
        return {
          userId: message.userId,
          groupId: message.groupId,
          content: '抱歉，您没有使用此机器人的权限。',
        };
      }
    }

    // Phase 3: 优先检查知识库相关请求（统一入口）
    if (this.unifiedKnowledgeEntrance) {
      try {
        const kbResponse = await this.unifiedKnowledgeEntrance.handleNaturalInput(message.content);

        // 如果返回的是知识库相关的响应，直接返回
        if (kbResponse && !kbResponse.includes('可以这样对我说')) {
          // 记录到知识库（用于自动提取）
          await this.unifiedKnowledgeEntrance.recordDialogue('user', message.content);

          // 检查是否需要提示保存
          const saveSuggestion = await this.unifiedKnowledgeEntrance.checkAndSuggestSave();
          if (saveSuggestion) {
            return {
              userId: message.userId,
              groupId: message.groupId,
              content: kbResponse + '\n\n' + saveSuggestion
            };
          }

          return {
            userId: message.userId,
            groupId: message.groupId,
            content: kbResponse
          };
        }
      } catch (error) {
        logger.error(`知识库统一入口处理失败: ${error}`);
        // 继续处理其他请求
      }
    }

    // 声明 taskId 以便在 catch 块中访问
    let taskId: string | null = null;

    try {
      // 处理附件（图片、文件）
      const storedFiles: StoredFile[] = [];

      if (message.attachments && message.attachments.length > 0) {
        for (const att of message.attachments) {
          logger.info(`处理附件: ${att.filename} (${att.type})`);

          // 检查是否是已经被预处理模块处理的文件（相对路径）
          // 预处理模块已经下载了QQ图片，保存到workspace
          if (att.url && !att.url.startsWith('http://') && !att.url.startsWith('https://')) {
            // 不是HTTP URL，可能是预处理模块已经处理的文件
            // 尝试从workspace读取
            const workspacePath = this.storage.getWorkspacePath();
            const filePath = path.join(workspacePath, att.url);

            try {
              // 检查文件是否存在
              const fs = await import('fs');
              if (fs.existsSync(filePath)) {
                // 文件已存在，直接使用
                const stats = fs.statSync(filePath);
                const storedFile: StoredFile = {
                  id: att.url,
                  originalName: att.filename || att.url,
                  storedPath: filePath,
                  mimeType: att.type || 'application/octet-stream',
                  size: stats.size,
                  createdAt: new Date(),
                };
                storedFiles.push(storedFile);
                logger.info(`使用预处理模块保存的文件: ${filePath}`);
                continue;
              }
            } catch (error) {
              logger.warn(`检查文件失败: ${error}`);
            }

            // 文件不存在，跳过
            logger.warn(`跳过非HTTP URL的附件: ${att.url}`);
            continue;
          }

          // HTTP URL，需要下载
          try {
            // 下载并存储附件
            const storedFile = await this.storage.storeFromUrl(att.url, att.filename);
            storedFiles.push(storedFile);
            logger.info(`附件已下载并存储: ${storedFile.storedPath}`);
          } catch (error) {
            logger.error(`存储附件失败: ${error}`);
            // 图片下载失败时，明确告知用户
            if (att.type.startsWith('image/')) {
              return {
                userId: message.userId,
                groupId: message.groupId,
                content: `❌ 无法获取您发送的图片。

💡 请尝试以下方法：
1. 直接描述图片内容，我尽力帮您处理
2. 将图片保存到本地，然后告诉我文件路径

您的消息：${message.content}`
              };
            }
          }
        }
      }

      // 记录用户消息到对话历史（用于备份和查看）
      this.conversationManager.addUserMessage(message.userId, message.groupId, message.content);

      // Phase 3: 记录到知识库（用于自动提取）
      if (this.knowledgeService && this.autoSaveEnabled) {
        try {
          await this.knowledgeService.recordDialogue('user', message.content);
        } catch (error) {
          logger.error(`记录用户消息到知识库失败: ${error}`);
        }
      }

      // 构建提示（CLI 会话会自己维护上下文，所以不需要每次都传历史）
      let fullPrompt = message.content;

      // 如果有附件，告诉 Claude 附件的路径
      if (storedFiles.length > 0) {
        const filePaths = storedFiles.map(f => `- ${f.storedPath}`).join('\n');
        fullPrompt = `用户发送了以下附件，已保存到本地：
${filePaths}

用户消息：${message.content}

请先读取/查看用户发送的附件（使用 read_file 工具），然后处理用户的请求。`;
      }

      // 优先检查列表请求（避免被文件发送请求误判）
      if (this.isListRequest(message.content)) {
        return await this.handleListRequest(message);
      }

      // 如果用户要发送文件给自己
      if (this.isFileSendRequest(message.content)) {
        return await this.handleFileSendRequest(message);
      }

      // 检查是否要清空对话历史
      if (this.isClearHistoryRequest(message.content)) {
        return await this.handleClearHistory(message);
      }

      // 检查是否要新建任务
      if (this.isNewTaskRequest(message.content)) {
        return await this.handleNewTask(message);
      }

      // 调用 Claude Code CLI 会话
      logger.info(`执行 Claude Code CLI (会话模式)...`);
      const previewLength = Math.min(200, fullPrompt.length);
      logger.debug(`提示: ${fullPrompt.substring(0, previewLength)}${fullPrompt.length > 200 ? '...' : ''}`);

      // 生成任务 ID 并启动进度追踪
      taskId = uuidv4().substring(0, 8);
      if (this.progressTracker) {
        this.progressTracker.startTask(taskId, message.userId, message.groupId, message.content);
      }

      // 使用会话管理器发送消息，启用 onProgress 实时进度
      // timeout: 0 表示禁用超时限制，允许长任务运行
      const output = await this.cliSessionManager.sendMessage(
        message.userId,
        fullPrompt,
        message.groupId,
        {
          imagePath: storedFiles.find(f => f.mimeType.startsWith('image/'))?.storedPath,
          attachmentPath: storedFiles[0]?.storedPath,
          onProgress: (chunk) => {
            // 实时进度回调
            if (this.progressTracker) {
              this.progressTracker.onProgress(taskId, chunk, message.userId, message.groupId);
            }
          },
          timeout: 0,  // 禁用超时限制
        }
      );

      logger.info(`[Agent] CLI 执行完成, output.length=${output.length}`);

      // Phase 3: 记录Claude响应到知识库（用于自动提取）
      if (this.knowledgeService && this.autoSaveEnabled) {
        try {
          // 只记录较长的响应（避免记录简短的确认消息）
          if (output.length > 100) {
            await this.knowledgeService.recordDialogue('assistant', output);
          }
        } catch (error) {
          logger.error(`记录Claude响应到知识库失败: ${error}`);
        }
      }

      // 结束进度追踪并发送最终结果

      // 结束进度追踪并发送最终结果
      if (this.progressTracker) {
        await this.progressTracker.endTask(taskId, output, message.userId, message.groupId);
      }

      // 构建响应（output 就是返回的内容）
      let responseContent = output;

      // 检查是否有新生成的文件需要发送
      const newFiles = this.findNewFiles();
      if (newFiles.length > 0) {
        responseContent += `\n\n📄 新生成的文件：\n${newFiles.map(f => `- ${path.basename(f)}`).join('\n')}`;
        responseContent += '\n💡 如需发送文件，请使用文件名（如：把 test.docx 发给我）';
      }

      // 注意：不再限制消息长度，Channel 会自动分段发送长消息

      logger.info(`[Agent] 准备返回响应: userId=${message.userId}, content.length=${responseContent.length}`);

      // 记录助手响应到对话历史
      this.conversationManager.addAssistantMessage(message.userId, message.groupId, responseContent);

      return {
        userId: message.userId,
        groupId: message.groupId,
        msgId: (message as any).raw?.id,
        content: responseContent,
        filesToSend: newFiles.length > 0 ? newFiles : undefined,
      };
    } catch (error) {
      logger.error(`Agent 处理错误: ${error}`);

      // 如果任务已启动，标记为失败状态
      if (taskId && this.progressTracker) {
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        await this.progressTracker.failTask(taskId, errorMsg, message.userId, message.groupId);
      }

      return {
        userId: message.userId,
        groupId: message.groupId,
        content: `处理请求时发生错误：${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  /**
   * 检查是否是文件发送请求
   */
  private isFileSendRequest(content: string): boolean {
    // 更精确的关键词匹配，避免误判
    // 必须明确提到"发送文件"或类似的表述
    const sendPatterns = [
      /把\s*\S+\.\w+.*发[给me我]/i,      // "把 xxx.jpeg 发给我"
      /把.+文件.*发[给me我]/i,         // "把 xxx 文件发给我"
      /发送文件\s*\S+/i,               // "发送文件 xxx"
      /把.*文件夹.*文件.*发/i,       // "把文件夹内的文件发"
      /通过.*bot.*发[给me我]/i,       // "通过QQ Bot发给我"
      /传\s*\S+\.\w+.*[给me我]/i,      // "传 xxx.pdf 给我"
      /发.*文件.*给[我我]/i,             // "发 xxx 文件给我"
    ];

    // 排除常见误触发场景
    const excludePatterns = [
      /不要传给我/i,                   // "不要传给我"
      /不用.*传/i,                   // "不用传给我"
      /传.*给.*其他人/i,              // "传给其他人"
      /传送.*其他/i,                  // "传送其他"
    ];

    // 先检查排除模式
    if (excludePatterns.some(p => p.test(content))) {
      return false;
    }

    return sendPatterns.some(p => p.test(content));
  }

  /**
   * 检查是否是列表请求
   */
  private isListRequest(content: string): boolean {
    const keywords = ['列出文件', '查看文件', '什么文件', '有哪些文件', '文件列表', 'list files'];
    const lowerContent = content.toLowerCase();
    return keywords.some(k => lowerContent.includes(k));
  }

  /**
   * 检查是否要清空对话历史
   */
  private isClearHistoryRequest(content: string): boolean {
    const keywords = ['清空历史', '清空记录', '清除记忆', 'clear history'];
    const lowerContent = content.toLowerCase();
    return keywords.some(k => lowerContent.includes(k));
  }

  /**
   * 检查是否要新建任务
   */
  private isNewTaskRequest(content: string): boolean {
    const keywords = ['新任务', '新建任务', 'new task', '新对话', 'reset conversation'];
    const lowerContent = content.toLowerCase();
    return keywords.some(k => lowerContent.includes(k));
  }

  /**
   * 处理清空对话历史请求
   */
  private async handleClearHistory(message: AgentMessage): Promise<AgentResponse> {
    this.conversationManager.clearHistory(message.userId, message.groupId);

    const convStats = this.conversationManager.getStats();
    const cliStats = this.cliSessionManager.getStats();

    return {
      userId: message.userId,
      groupId: message.groupId,
      content: `对话历史已清空。\n当前共有 ${convStats.totalSessions} 个会话，${convStats.totalMessages} 条消息。\nCLI 会话数: ${cliStats.totalSessions}`,
    };
  }

  /**
   * 处理新建任务请求
   */
  private async handleNewTask(message: AgentMessage): Promise<AgentResponse> {
    const newTaskId = await this.cliSessionManager.newTask(message.userId, message.groupId);

    // 同时清空对话历史
    this.conversationManager.clearHistory(message.userId, message.groupId);

    return {
      userId: message.userId,
      groupId: message.groupId,
      content: `已创建新任务 (ID: ${newTaskId})。\n之前的 CLI 会话已终止，现在是一个全新的会话。`,
    };
  }

  /**
   * 安全提取文件名（防止路径穿越攻击）
   */
  private sanitizeFileName(fileName: string): string | null {
    // 移除路径分隔符和危险字符
    const sanitized = fileName
      .replace(/[\/\\]/g, '')  // 移除路径分隔符
      .replace(/\.\./g, '')     // 移除 ..
      .replace(/[<>:"|?*]/g, '') // 移除 Windows 非法字符
      .trim();

    // 验证文件名格式（必须包含扩展名）
    if (!sanitized || !/^[a-zA-Z0-9_\-.]+\.[a-zA-Z0-9]+$/.test(sanitized)) {
      return null;
    }

    return sanitized;
  }

  /**
   * 处理文件发送请求
   */
  private async handleFileSendRequest(message: AgentMessage): Promise<AgentResponse> {
    const content = message.content;
    const workspacePath = this.config_internal.workspacePath;

    // 尝试从消息中提取文件名（优先匹配引号内的文件名）
    const quotedMatch = content.match(/["']([^"']+\.[a-zA-Z0-9]+)["']/);
    const unquotedMatch = content.match(/(?:^|\s)([a-zA-Z0-9_\-.]+\.[a-zA-Z0-9]+)(?:\s|$)/);

    let rawFileName = quotedMatch ? quotedMatch[1] : (unquotedMatch ? unquotedMatch[1] : null);

    // 如果没有找到文件名，尝试从上下文中获取（最近提到的文件路径）
    if (!rawFileName) {
      // 检查对话历史中最近提到的文件路径
      const recentMessages = this.conversationManager.getRecentMessages(message.userId, message.groupId, 5);
      for (const msg of recentMessages) {
        // 匹配路径格式的文件名，如 gemini-video\out\01-intro.mp4
        const pathMatch = msg.content.match(/([a-zA-Z0-9_\-\\\.]+\.[a-zA-Z0-9]+)/g);
        if (pathMatch && pathMatch.length > 0) {
          // 验证文件是否存在
          for (const matchedPath of pathMatch) {
            // 将反斜杠转换为正斜杠
            const normalizedPath = matchedPath.replace(/\\/g, '/');
            const fullPaths = [
              path.join(workspacePath, normalizedPath),
              path.join(workspacePath, matchedPath),
              path.join(this.config_internal.storagePath, normalizedPath),
              path.join(this.config_internal.storagePath, matchedPath),
            ];

            for (const fullPath of fullPaths) {
              if (fs.existsSync(fullPath)) {
                rawFileName = matchedPath;
                break;
              }
            }
            if (rawFileName) break;
          }
          if (rawFileName) break;
        }
      }
    }

    // 安全处理文件名
    const fileName = rawFileName ? this.sanitizeFileName(rawFileName.replace(/\\/g, '/').split('/').pop() || rawFileName) : null;

    if (!fileName) {
      // 列出可用文件
      const files = this.getAllFiles();
      return {
        userId: message.userId,
        groupId: message.groupId,
        content: `请指定要发送的文件名。当前工作区文件：\n${files.slice(0, 20).join('\n')}${files.length > 20 ? '\n...' : ''}`,
      };
    }

    // 尝试多个可能的路径
    const possiblePaths = [
      path.join(workspacePath, fileName),
      path.join(this.config_internal.storagePath, fileName),
      // 如果原始文件名包含路径，也尝试完整路径
      rawFileName && rawFileName.includes(path.sep) ? path.join(workspacePath, rawFileName) : null,
      rawFileName && rawFileName.includes('/') ? path.join(workspacePath, rawFileName.replace(/\//g, path.sep)) : null,
    ].filter(p => p !== null) as string[];

    let foundPath: string | null = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        foundPath = testPath;
        break;
      }
    }

    if (!foundPath) {
      return {
        userId: message.userId,
        groupId: message.groupId,
        content: `文件不存在: ${fileName}\n\n已尝试的路径：\n${possiblePaths.join('\n')}`,
      };
    }

    // 发送文件
    if (this.sendFileCallback) {
      try {
        await this.sendFileCallback(message.userId, foundPath, message.groupId);
        return {
          userId: message.userId,
          groupId: message.groupId,
          content: `✅ 文件已发送: ${path.basename(foundPath)}`,
        };
      } catch (error) {
        logger.error(`发送文件失败: ${error}`);
        return {
          userId: message.userId,
          groupId: message.groupId,
          content: `❌ 发送文件失败: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } else {
      return {
        userId: message.userId,
        groupId: message.groupId,
        content: `文件路径: ${foundPath}\n（文件发送功能未配置）`,
        filesToSend: [foundPath],
      };
    }
  }

  /**
   * 处理列表请求
   */
  private async handleListRequest(message: AgentMessage): Promise<AgentResponse> {
    const files = this.getAllFiles();
    const storageFiles = this.storage.listWorkspaceFiles();
    const maxLength = 1900; // QQ 消息长度限制

    let content = `📁 工作区文件 (${this.config_internal.workspacePath}):\n`;
    content += files.slice(0, 30).map(f => `  - ${f}`).join('\n');

    if (files.length > 30) {
      content += `\n  ... 还有 ${files.length - 30} 个文件`;
    }

    content += `\n\n📁 存储区文件 (${this.config_internal.storagePath}):\n`;
    content += storageFiles.slice(0, 20).map(f => `  - ${f}`).join('\n');

    // 截断过长消息
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '\n... (列表过长，已截断)';
    }

    return {
      userId: message.userId,
      groupId: message.groupId,
      content,
    };
  }

  /**
   * 查找新生成的文件
   * 排除用户上传的附件文件
   */
  private findNewFiles(): string[] {
    const taskStartTime = Date.now(); // 当前任务开始时间
    const files: { path: string; mtime: number }[] = [];
    const workspacePath = this.config_internal.workspacePath;

    // 获取任务开始前已存在的文件（避免重复）
    const existingFiles = new Set<string>();
    try {
      const items = fs.readdirSync(workspacePath);
      for (const item of items) {
        if (item === 'node_modules' || item === '.git' || item === 'dist' || item.startsWith('.')) continue;
        const fullPath = path.join(workspacePath, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            existingFiles.add(fullPath);
          }
        } catch {
          // 忽略错误
        }
      }
    } catch (error) {
      // 忽略错误
    }

    const scanDir = (dir: string) => {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (item === 'node_modules' || item === '.git' || item === 'dist' || item.startsWith('.')) continue;
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else if (stat.mtimeMs > taskStartTime) { // 任务开始后才修改的文件
            // 排除用户上传的图片（文件名包含 qq_ 前缀）
            const fileName = path.basename(fullPath);
            if (fileName.startsWith('qq_') || fileName.startsWith('embedded_')) {
              logger.debug(`[findNewFiles] 跳过用户上传的文件: ${fileName}`);
              continue;
            }
            files.push({ path: fullPath, mtime: stat.mtimeMs });
          }
        }
      } catch (error) {
        // 忽略权限错误
      }
    };

    try {
      scanDir(workspacePath);
    } catch (error) {
      logger.error(`扫描文件失败: ${error}`);
    }

    return files.sort((a, b) => b.mtime - a.mtime).slice(0, 5).map(f => f.path);
  }

  /**
   * 获取文件存储管理器
   */
  getStorage(): FileStorage {
    return this.storage;
  }

  /**
   * 获取所有工作区文件
   */
  getAllFiles(): string[] {
    const files: string[] = [];
    const workspacePath = this.config_internal.workspacePath;

    const scanDir = (dir: string) => {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (item === 'node_modules' || item === '.git' || item === 'dist' || item.startsWith('.')) continue;
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else {
            files.push(path.relative(workspacePath, fullPath));
          }
        }
      } catch (error) {
        // 忽略权限错误
      }
    };

    try {
      scanDir(workspacePath);
    } catch (error) {
      logger.error(`扫描文件失败: ${error}`);
    }

    return files;
  }

  /**
   * 获取 CLI 会话管理器
   */
  getCliSessionManager(): CliSessionManager {
    return this.cliSessionManager;
  }

  /**
   * 获取对话历史管理器
   */
  getConversationManager(): ConversationManager {
    return this.conversationManager;
  }

  // Phase 3: 知识库相关方法

  /**
   * 初始化知识库服务
   */
  private async initializeKnowledgeService(): Promise<void> {
    try {
      // 动态导入知识库服务
      const skillPath = './knowledge-service/skill/index.js';
      const module = await import(skillPath);
      const KnowledgeService = module.KnowledgeService;

      // 初始化知识库服务
      this.knowledgeService = new KnowledgeService({
        enableAutoExtraction: true,  // Phase 3: 启用自动提取
        enableSemantic: true        // Phase 2: 启用语义搜索
      });

      await this.knowledgeService.initialize();

      // 初始化统一知识库入口
      const entranceModule = await import('./knowledge-service/unified-entrance.js');
      const UnifiedKnowledgeEntrance = entranceModule.UnifiedKnowledgeEntrance;
      this.unifiedKnowledgeEntrance = new UnifiedKnowledgeEntrance(this.knowledgeService);

      logger.info('统一知识库入口已初始化');

      // 检查是否应该建议保存
      if (this.knowledgeService.shouldSuggestSave()) {
        const suggestions = await this.knowledgeService.generateSaveSuggestions();

        if (suggestions.length > 0) {
          // 生成建议消息
          const message = this.knowledgeService.generateSuggestionMessage(suggestions);

          // 发送建议通知（可以通过Gateway发送）
          logger.info(`[知识库] 发现 ${suggestions.length} 条建议保存的知识:\n${message}`);

          // 这里可以添加逻辑来实际发送建议给用户
          // 暂时只记录日志
        }
      }

      this.autoSaveEnabled = true;
      logger.info('[知识库] 自动保存建议系统已启用');
    } catch (error) {
      logger.warn(`知识库服务初始化失败: ${error}`);
      this.autoSaveEnabled = false;
    }
  }

  /**
   * 检查并生成保存建议
   */
  async checkAndSuggestSave(): Promise<string | null> {
    if (!this.knowledgeService || !this.autoSaveEnabled) {
      return null;
    }

    if (this.knowledgeService.shouldSuggestSave()) {
      const suggestions = await this.knowledgeService.generateSaveSuggestions();

      if (suggestions.length > 0) {
        return this.knowledgeService.generateSuggestionMessage(suggestions);
      }
    }

    return null;
  }

  /**
   * 处理用户对保存建议的响应
   */
  async handleSaveSuggestionResponse(response: string): Promise<string> {
    if (!this.knowledgeService) {
      return '知识库功能未启用';
    }

    const suggestions = await this.knowledgeService.generateSaveSuggestions();
    const result = await this.knowledgeService.handleSuggestionResponse(response, suggestions);

    return result.message;
  }

  /**
   * 手动保存知识
   */
  async saveKnowledge(content: string, tags: string[]): Promise<string> {
    if (!this.knowledgeService) {
      throw new Error('知识库功能未启用');
    }

    const tagHierarchy = {
      level1: tags[0] || '工作',
      level2: tags[1] || '通用',
      level3: tags[2] || '其他'
    };

    const id = await this.knowledgeService.save(content, tagHierarchy, {
      source: 'manual',
      metadata: {
        timestamp: Date.now(),
        source: 'agent'
      }
    });

    return `知识已保存，ID: ${id}`;
  }

  /**
   * 清理僵尸任务
   *
   * 判断标准：任务状态为 'running' 但没有心跳定时器（说明进程已死亡）
   * 不会误杀真正需要长时间运行的任务
   *
   * @returns 清理的任务数量
   */
  cleanupZombieTasks(): number {
    if (this.progressTracker) {
      return this.progressTracker.cleanupZombieTasks();
    }
    return 0;
  }
}

export { FileStorage, ConversationManager, CliSessionManager };
export default ClaudeCodeAgent;
