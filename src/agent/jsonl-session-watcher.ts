/**
 * JSONL 会话文件监视器
 *
 * 通过监视 Claude Code 的会话文件 ({sessionId}.jsonl) 来检测工具调用
 * 这是 Happy 项目使用的方法，比流式输出解析更可靠
 *
 * 参考: https://github.com/slopus/happy
 */

import { watch } from 'fs';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger.js';

/**
 * Claude Code 会话消息类型
 */
export interface ClaudeMessage {
  type: 'user' | 'assistant' | 'system' | 'summary';
  uuid: string;
  timestamp: number;
  message?: {
    role: string;
    content: string | Array<{
      type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
      text?: string;
      thinking?: string;
      name?: string;        // 工具名称
      input?: any;         // 工具输入
      id?: string;         // 工具调用 ID
      tool_use_id?: string; // 工具结果 ID
      content?: string;    // 工具输出内容
    }>;
  };
}

/**
 * 工具调用事件
 */
export interface ToolCallEvent {
  type: 'tool-start' | 'tool-end';
  toolName: string;
  toolId?: string;
  timestamp: number;
  args?: any;
  result?: string;
}

/**
 * 会话监视器选项
 */
export interface SessionWatcherOptions {
  /** Claude Code 工作目录 */
  workspacePath: string;
  /** 会话 ID */
  sessionId?: string;
  /** 工具调用回调 */
  onToolCall?: (event: ToolCallEvent) => void;
  /** 消息回调 */
  onMessage?: (message: ClaudeMessage) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

/**
 * 会话文件监视器
 *
 * 监视 Claude Code 的 JSONL 会话文件，检测工具调用
 */
export class JsonlSessionWatcher {
  private workspacePath: string;
  private sessionId: string | null = null;
  private sessionFilePath: string | null = null;
  private watcher: ReturnType<typeof watch> | null = null;
  private processedOffsets: Map<string, number> = new Map();
  private onToolCall?: (event: ToolCallEvent) => void;
  private onMessage?: (message: ClaudeMessage) => void;
  private onError?: (error: Error) => void;
  private isRunning: boolean = false;
  private scanTimer: NodeJS.Timeout | null = null;

  // 跟踪活跃的工具调用
  private activeToolCalls: Map<string, string> = new Map(); // toolId -> toolName

  constructor(options: SessionWatcherOptions) {
    this.workspacePath = options.workspacePath;
    this.sessionId = options.sessionId || null;
    this.onToolCall = options.onToolCall;
    this.onMessage = options.onMessage;
    this.onError = options.onError;
  }

  /**
   * 启动监视器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[JsonlWatcher] 监视器已在运行中');
      return;
    }

    this.isRunning = true;

    try {
      // 尝试查找会话目录
      const claudeDir = join(this.workspacePath, '.claude');
      const sessionsDir = join(claudeDir, 'sessions');

      // 检查目录是否存在
      try {
        await stat(sessionsDir);
      } catch {
        logger.warn(`[JsonlWatcher] 会话目录不存在: ${sessionsDir}`);
        // 目录不存在，等待创建
      }

      // 如果没有指定 sessionId，查找最新的会话文件
      if (!this.sessionId) {
        this.sessionId = await this.findLatestSession(sessionsDir);
        if (this.sessionId) {
          logger.info(`[JsonlWatcher] 找到最新会话: ${this.sessionId}`);
        }
      }

      // 启动文件监视器
      this.watchDirectory(sessionsDir);

      // 启动定期扫描
      this.startPeriodicScan();

      logger.info('[JsonlWatcher] 监视器已启动');
    } catch (error) {
      if (this.onError) {
        this.onError(error as Error);
      }
      logger.error(`[JsonlWatcher] 启动失败: ${error}`);
    }
  }

  /**
   * 停止监视器
   */
  stop(): void {
    this.isRunning = false;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }

    logger.info('[JsonlWatcher] 监视器已停止');
  }

  /**
   * 设置会话 ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    this.sessionFilePath = null;
    this.processedOffsets.clear();
    logger.info(`[JsonlWatcher] 会话 ID 已更新: ${sessionId}`);
  }

  /**
   * 查找最新的会话文件
   */
  private async findLatestSession(sessionsDir: string): Promise<string | null> {
    try {
      const files = await readdir(sessionsDir);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

      if (jsonlFiles.length === 0) {
        return null;
      }

      // 按修改时间排序，获取最新的
      const fileStats = await Promise.all(
        jsonlFiles.map(async (f) => ({
          name: f,
          mtime: (await stat(join(sessionsDir, f))).mtime.getTime()
        }))
      );

      fileStats.sort((a, b) => b.mtime - a.mtime);
      const latest = fileStats[0].name.replace('.jsonl', '');

      return latest;
    } catch {
      return null;
    }
  }

  /**
   * 监视会话目录
   */
  private watchDirectory(sessionsDir: string): void {
    try {
      this.watcher = watch(sessionsDir, { persistent: false }, (eventType, filename) => {
        if (!this.isRunning) return;
        if (!filename || !filename.endsWith('.jsonl')) return;

        // 触发扫描
        this.scanSessions();
      });

      logger.info(`[JsonlWatcher] 正在监视目录: ${sessionsDir}`);
    } catch (error) {
      logger.error(`[JsonlWatcher] 监视目录失败: ${error}`);
    }
  }

  /**
   * 启动定期扫描
   */
  private startPeriodicScan(): void {
    // 每 2 秒扫描一次
    this.scanTimer = setInterval(() => {
      this.scanSessions();
    }, 2000);
  }

  /**
   * 扫描会话文件
   */
  private async scanSessions(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const claudeDir = join(this.workspacePath, '.claude');
      const sessionsDir = join(claudeDir, 'sessions');

      // 如果有指定 sessionId，只处理该文件
      if (this.sessionId) {
        await this.processSessionFile(join(sessionsDir, `${this.sessionId}.jsonl`));
        return;
      }

      // 否则处理所有会话文件
      const files = await readdir(sessionsDir);
      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          await this.processSessionFile(join(sessionsDir, file));
        }
      }
    } catch (error) {
      // 目录可能还不存在，忽略错误
    }
  }

  /**
   * 处理会话文件
   */
  private async processSessionFile(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      let offset = this.processedOffsets.get(filePath) || 0;

      for (let i = offset; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const message: ClaudeMessage = JSON.parse(line);
          await this.processMessage(message);
        } catch (parseError) {
          // 忽略解析错误
          logger.debug(`[JsonlWatcher] 解析消息失败: ${parseError}`);
        }
      }

      // 更新已处理的位置
      this.processedOffsets.set(filePath, lines.length);
    } catch (error) {
      // 文件可能被锁定，稍后重试
    }
  }

  /**
   * 处理消息
   */
  private async processMessage(message: ClaudeMessage): Promise<void> {
    // 通知消息回调
    if (this.onMessage) {
      this.onMessage(message);
    }

    // 处理工具调用
    if (message.type === 'assistant') {
      const content = message.message?.content;

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use' && block.name && block.id) {
            // 工具调用开始
            const toolEvent: ToolCallEvent = {
              type: 'tool-start',
              toolName: block.name,
              toolId: block.id,
              timestamp: message.timestamp || Date.now(),
              args: block.input
            };

            this.activeToolCalls.set(block.id, block.name);

            if (this.onToolCall) {
              this.onToolCall(toolEvent);
            }

            logger.debug(`[JsonlWatcher] 工具开始: ${block.name}`);
          }
        }
      }
    } else if (message.type === 'user') {
      const content = message.message?.content;

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            // 工具调用结束
            const toolId = block.tool_use_id;
            const toolName = this.activeToolCalls.get(toolId);

            if (toolName) {
              const toolEvent: ToolCallEvent = {
                type: 'tool-end',
                toolName,
                toolId,
                timestamp: message.timestamp || Date.now(),
                result: typeof block.content === 'string' ? block.content : undefined
              };

              if (this.onToolCall) {
                this.onToolCall(toolEvent);
              }

              logger.debug(`[JsonlWatcher] 工具结束: ${toolName}`);
            }

            this.activeToolCalls.delete(toolId);
          }
        }
      }
    }
  }
}

/**
 * 创建会话监视器
 */
export function createJsonlSessionWatcher(options: SessionWatcherOptions): JsonlSessionWatcher {
  return new JsonlSessionWatcher(options);
}
