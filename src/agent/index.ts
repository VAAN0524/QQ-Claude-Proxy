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

export class ClaudeCodeAgent {
  private cliSessionManager: CliSessionManager;
  private storage: FileStorage;
  private conversationManager: ConversationManager;
  private config: AgentConfig;
  private mainGateway: any = null;
  private sendFileCallback: ((userId: string, filePath: string, groupId?: string) => Promise<void>) | null = null;
  private sendMessageCallback: ((userId: string, content: string, groupId?: string) => Promise<void>) | null = null;
  private progressTracker: ProgressTracker | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
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

    // 初始化进度追踪器，传入 Dashboard 状态
    this.progressTracker = new ProgressTracker({
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
    });

    logger.info(`Claude Code Agent 初始化完成`);
    logger.info(`工作目录: ${config.workspacePath}`);
    logger.info(`存储目录: ${config.storagePath}`);
    logger.info(`CLI 会话模式: 长期运行进程`);
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
   * 处理用户消息
   */
  async process(event: any): Promise<AgentResponse | null> {
    const { event: eventType, data } = event;

    if (eventType !== 'message' && eventType !== 'group_message') {
      return null;
    }

    const message = data as AgentMessage;

    // 检查用户权限
    if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(message.userId)) {
        logger.warn(`用户 ${message.userId} 不在允许列表中`);
        return {
          userId: message.userId,
          groupId: message.groupId,
          content: '抱歉，您没有使用此机器人的权限。',
        };
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

          try {
            // 下载并存储附件
            const storedFile = await this.storage.storeFromUrl(att.url, att.filename);
            storedFiles.push(storedFile);
            logger.info(`附件已存储: ${storedFile.storedPath}`);
          } catch (error) {
            logger.error(`存储附件失败: ${error}`);
          }
        }
      }

      // 记录用户消息到对话历史（用于备份和查看）
      this.conversationManager.addUserMessage(message.userId, message.groupId, message.content);

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
        responseContent += '\n如需发送文件，请说"把 xxx 文件发给我"';
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
    const sendPatterns = [
      /把.+文件.*发[给 me我]/,
      /把\s*\S+\.\w+.*发[给 me我]/,
      /发送文件/,
      /传给我.*文件/,
      /发文件给/,
      /文件.*发[给 me我]/,
      /通过.*[Bb]ot.*发[给me我]/,  // "通过QQ Bot发送给我"
      /qq.*bot.*发[给me我]/i,
      /使用.*bot.*发送/,
      /把.*文件夹.*文件.*发/,  // "把文件夹内的文件发给我"
    ];
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
    const workspacePath = this.config.workspacePath;

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
              path.join(this.config.storagePath, normalizedPath),
              path.join(this.config.storagePath, matchedPath),
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
      path.join(this.config.storagePath, fileName),
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

    let content = `📁 工作区文件 (${this.config.workspacePath}):\n`;
    content += files.slice(0, 30).map(f => `  - ${f}`).join('\n');

    if (files.length > 30) {
      content += `\n  ... 还有 ${files.length - 30} 个文件`;
    }

    content += `\n\n📁 存储区文件 (${this.config.storagePath}):\n`;
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
   */
  private findNewFiles(): string[] {
    // 简单实现：返回工作区中最近修改的文件
    const files: { path: string; mtime: number }[] = [];
    const workspacePath = this.config.workspacePath;

    const scanDir = (dir: string) => {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (item === 'node_modules' || item === '.git' || item === 'dist' || item.startsWith('.')) continue;
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else if (stat.mtimeMs > Date.now() - 120000) { // 最近2分钟内修改的
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
    const workspacePath = this.config.workspacePath;

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
