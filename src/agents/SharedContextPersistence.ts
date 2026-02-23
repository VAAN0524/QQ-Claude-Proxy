/**
 * SharedContext 持久化扩展
 * 为 SharedContext 添加文件持久化能力
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import type { SharedContext, ContextMessage, WorkState } from './SharedContext.js';

/**
 * 持久化配置
 */
export interface PersistenceOptions {
  /** 持久化存储目录 */
  storagePath?: string;
  /** 自动保存间隔（毫秒），0 表示禁用自动保存 */
  autoSaveInterval?: number;
  /** 是否在每次修改后立即保存 */
  saveImmediately?: boolean;
  /** 压缩历史消息（只保留最近的 N 条） */
  maxHistoryMessages?: number;
}

/**
 * 持久化数据格式
 */
interface PersistedData {
  version: string;
  savedAt: string;
  conversationHistory: ContextMessage[];
  workStates: Array<[string, WorkState]>;
  fileReferences: string[];
}

/**
 * SharedContext 持久化管理器
 */
export class SharedContextPersistence {
  private sharedContext: SharedContext;
  private storagePath: string;
  private autoSaveTimer?: NodeJS.Timeout;
  private saveImmediately: boolean;
  private maxHistoryMessages: number;
  private pendingSave: boolean = false;
  private savePromise?: Promise<void>;

  // 会话 ID（用于区分不同的用户/群组）
  private sessionId: string;

  constructor(sharedContext: SharedContext, sessionId: string, options: PersistenceOptions = {}) {
    this.sharedContext = sharedContext;
    this.sessionId = sessionId;
    this.storagePath = options.storagePath || path.join(process.cwd(), 'data', 'sessions');
    this.saveImmediately = options.saveImmediately ?? false;
    this.maxHistoryMessages = options.maxHistoryMessages || 100;

    // 确保存储目录存在
    fs.mkdir(this.storagePath, { recursive: true })
      .then(() => logger.debug(`[SharedContextPersistence] 存储目录已创建: ${this.storagePath}`))
      .catch(err => logger.error(`[SharedContextPersistence] 创建存储目录失败: ${err}`));

    // 启动自动保存
    if (options.autoSaveInterval && options.autoSaveInterval > 0) {
      this.startAutoSave(options.autoSaveInterval);
    }
  }

  /**
   * 获取会话文件路径
   */
  private getSessionFilePath(): string {
    // 使用 sessionId 作为文件名，添加 .json 扩展名
    return path.join(this.storagePath, `${this.sanitizeSessionId(this.sessionId)}.json`);
  }

  /**
   * 清理会话 ID（移除不安全的字符）
   */
  private sanitizeSessionId(id: string): string {
    // 移除或替换不安全的文件名字符
    return id.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * 保存到文件
   */
  async save(): Promise<void> {
    // 如果已有保存任务在进行，等待其完成
    if (this.savePromise) {
      this.pendingSave = true;
      await this.savePromise;
      // 如果在等待期间又有新的保存请求，再次触发保存
      if (this.pendingSave) {
        this.pendingSave = false;
        return this.save();
      }
      return;
    }

    this.savePromise = this.performSave();
    await this.savePromise;
    this.savePromise = undefined;
  }

  /**
   * 执行实际的保存操作
   */
  private async performSave(): Promise<void> {
    try {
      const filePath = this.getSessionFilePath();

      // 收集数据
      const allMessages = this.sharedContext.getAllMessages();

      // 压缩历史消息（只保留最近的 N 条）
      const messages = allMessages.slice(-this.maxHistoryMessages);

      const workStates = Array.from(this.sharedContext.getAllWorkStates().entries());
      const fileReferences = this.sharedContext.getFileReferences();

      const data: PersistedData = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        conversationHistory: messages,
        workStates,
        fileReferences,
      };

      // 写入临时文件，然后重命名（原子操作）
      const tempPath = filePath + '.tmp';
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, filePath);

      logger.debug(`[SharedContextPersistence] 会话已保存: ${this.sessionId}`);
    } catch (error) {
      logger.error(`[SharedContextPersistence] 保存会话失败: ${error}`);
    }
  }

  /**
   * 从文件加载
   */
  async load(): Promise<boolean> {
    try {
      const filePath = this.getSessionFilePath();

      // 检查文件是否存在
      await fs.access(filePath);

      // 读取文件
      const content = await fs.readFile(filePath, 'utf-8');
      const data: PersistedData = JSON.parse(content);

      // 验证版本
      if (data.version !== '1.0') {
        logger.warn(`[SharedContextPersistence] 不支持的版本: ${data.version}`);
        return false;
      }

      // 恢复数据
      this.sharedContext.clearAll();

      for (const msg of data.conversationHistory) {
        this.sharedContext.addConversation(msg.role, msg.content, msg.agentId);
      }

      for (const [agentId, state] of data.workStates) {
        // 重新设置工作状态
        this.sharedContext.setWorkState(state.agentId, state.result, state.metadata);
      }

      for (const fileRef of data.fileReferences) {
        this.sharedContext.addFileReference(fileRef);
      }

      logger.info(`[SharedContextPersistence] 会话已加载: ${this.sessionId}`);
      logger.info(`[SharedContextPersistence] 加载了 ${data.conversationHistory.length} 条消息`);

      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`[SharedContextPersistence] 加载会话失败: ${error}`);
      }
      return false;
    }
  }

  /**
   * 删除会话文件
   */
  async delete(): Promise<void> {
    try {
      const filePath = this.getSessionFilePath();
      await fs.unlink(filePath);
      logger.info(`[SharedContextPersistence] 会话已删除: ${this.sessionId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`[SharedContextPersistence] 删除会话失败: ${error}`);
      }
    }
  }

  /**
   * 启动自动保存
   */
  startAutoSave(intervalMs: number): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(() => {
      this.save().catch(err => {
        logger.error(`[SharedContextPersistence] 自动保存失败: ${err}`);
      });
    }, intervalMs);

    logger.debug(`[SharedContextPersistence] 自动保存已启动: ${intervalMs}ms`);
  }

  /**
   * 停止自动保存
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
      logger.debug('[SharedContextPersistence] 自动保存已停止');
    }
  }

  /**
   * 代理 SharedContext 的方法，在修改后自动保存
   */
  addConversation(role: 'user' | 'assistant' | 'system', content: string, agentId?: string): void {
    this.sharedContext.addConversation(role, content, agentId);
    if (this.saveImmediately) {
      this.save().catch(err => logger.error(`[SharedContextPersistence] 保存失败: ${err}`));
    }
  }

  setWorkState(agentId: string, result: string, metadata?: Record<string, unknown>): void {
    this.sharedContext.setWorkState(agentId, result, metadata);
    if (this.saveImmediately) {
      this.save().catch(err => logger.error(`[SharedContextPersistence] 保存失败: ${err}`));
    }
  }

  addFileReference(filePath: string): void {
    this.sharedContext.addFileReference(filePath);
    if (this.saveImmediately) {
      this.save().catch(err => logger.error(`[SharedContextPersistence] 保存失败: ${err}`));
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.stopAutoSave();
    // 保存最后的状态
    await this.save();
  }

  /**
   * 获取底层 SharedContext
   */
  getContext(): SharedContext {
    return this.sharedContext;
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

/**
 * 会话管理器 - 管理多个 SharedContext 实例
 */
export class SessionManager {
  private storagePath: string;
  private sessions: Map<string, SharedContextPersistence> = new Map();
  private autoSaveInterval: number;
  private saveImmediately: boolean;
  private maxHistoryMessages: number;

  constructor(options: PersistenceOptions & { defaultAutoSaveInterval?: number } = {}) {
    this.storagePath = options.storagePath || path.join(process.cwd(), 'data', 'sessions');
    this.autoSaveInterval = options.autoSaveInterval ?? options.defaultAutoSaveInterval ?? 60000;
    this.saveImmediately = options.saveImmediately ?? false;
    this.maxHistoryMessages = options.maxHistoryMessages || 100;
  }

  /**
   * 获取或创建会话
   */
  async getOrCreateSession(sessionId: string): Promise<SharedContextPersistence> {
    let persistence = this.sessions.get(sessionId);

    if (!persistence) {
      // 创建新的 SharedContext
      const { SharedContext } = await import('./SharedContext.js');
      const sharedContext = new SharedContext({
        maxMessages: this.maxHistoryMessages,
      });

      // 创建持久化包装器
      persistence = new SharedContextPersistence(sharedContext, sessionId, {
        storagePath: this.storagePath,
        autoSaveInterval: this.autoSaveInterval,
        saveImmediately: this.saveImmediately,
        maxHistoryMessages: this.maxHistoryMessages,
      });

      // 尝试加载现有数据
      const loaded = await persistence.load();
      if (loaded) {
        logger.info(`[SessionManager] 会话已恢复: ${sessionId}`);
      }

      this.sessions.set(sessionId, persistence);
    }

    return persistence;
  }

  /**
   * 获取会话（不创建）
   */
  getSession(sessionId: string): SharedContextPersistence | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    const persistence = this.sessions.get(sessionId);
    if (persistence) {
      await persistence.delete();
      await persistence.cleanup();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * 清空所有会话
   */
  async clearAllSessions(): Promise<void> {
    for (const [sessionId, persistence] of this.sessions) {
      await persistence.cleanup();
    }
    this.sessions.clear();
  }

  /**
   * 获取所有会话 ID
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * 获取会话统计
   */
  getStats(): Array<{ sessionId: string; stats: ReturnType<SharedContext['getStats']> }> {
    return Array.from(this.sessions.entries()).map(([sessionId, persistence]) => ({
      sessionId,
      stats: persistence.getContext().getStats(),
    }));
  }

  /**
   * 保存所有会话
   */
  async saveAll(): Promise<void> {
    for (const persistence of this.sessions.values()) {
      await persistence.save();
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.saveAll();
    await this.clearAllSessions();
  }
}

export default SharedContextPersistence;
