/**
 * MemoryService - 持久化记忆存储服务
 *
 * 基于 SQLite 的长期记忆存储，支持：
 * - 对话历史存储
 * - 用户偏好记忆
 * - 上下文关联
 * - 时间衰减
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger.js';

/**
 * 记忆类型
 */
export enum MemoryType {
  /** 对话消息 */
  MESSAGE = 'message',
  /** 用户偏好 */
  PREFERENCE = 'preference',
  /** 任务上下文 */
  CONTEXT = 'context',
  /** 知识片段 */
  KNOWLEDGE = 'knowledge',
}

/**
 * 记忆元数据
 */
export interface MemoryMetadata {
  /** 用户 ID */
  userId?: string;
  /** 群组 ID */
  groupId?: string;
  /** 关联的任务 */
  taskId?: string;
  /** 关键词标签 */
  tags?: string[];
  /** 重要性评分 (0-1) */
  importance?: number;
}

/**
 * 记忆条目
 */
export interface MemoryEntry {
  /** 记忆 ID */
  id: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 内容 */
  content: string;
  /** 嵌入向量（可选，用于语义检索） */
  embedding?: number[];
  /** 元数据 */
  metadata: MemoryMetadata;
  /** 创建时间 */
  createdAt: Date;
  /** 最后访问时间 */
  lastAccessedAt: Date;
  /** 访问次数 */
  accessCount: number;
}

/**
 * 记忆检索选项
 */
export interface MemoryRetrieveOptions {
  /** 用户 ID */
  userId?: string;
  /** 群组 ID */
  groupId?: string;
  /** 记忆类型过滤 */
  types?: MemoryType[];
  /** 标签过滤 */
  tags?: string[];
  /** 最大结果数 */
  limit?: number;
  /** 时间范围（毫秒） */
  timeRange?: number;
}

/**
 * 记忆服务配置
 */
export interface MemoryServiceOptions {
  /** 数据存储路径 */
  storagePath?: string;
  /** 是否自动清理过期记忆 */
  autoCleanup?: boolean;
  /** 记忆保留时间（毫秒）默认 30 天 */
  retentionTime?: number;
}

/**
 * 内存记忆存储（简单实现）
 */
class InMemoryMemoryStore {
  private memories: Map<string, MemoryEntry> = new Map();
  private userMemories: Map<string, Set<string>> = new Map();
  private groupMemories: Map<string, Set<string>> = new Map();
  private taggedMemories: Map<string, Set<string>> = new Map();

  add(entry: MemoryEntry): void {
    this.memories.set(entry.id, entry);

    // 索引用户记忆
    if (entry.metadata.userId) {
      if (!this.userMemories.has(entry.metadata.userId)) {
        this.userMemories.set(entry.metadata.userId, new Set());
      }
      this.userMemories.get(entry.metadata.userId)!.add(entry.id);
    }

    // 索引群组记忆
    if (entry.metadata.groupId) {
      if (!this.groupMemories.has(entry.metadata.groupId)) {
        this.groupMemories.set(entry.metadata.groupId, new Set());
      }
      this.groupMemories.get(entry.metadata.groupId)!.add(entry.id);
    }

    // 索引标签
    if (entry.metadata.tags) {
      for (const tag of entry.metadata.tags) {
        if (!this.taggedMemories.has(tag)) {
          this.taggedMemories.set(tag, new Set());
        }
        this.taggedMemories.get(tag)!.add(entry.id);
      }
    }
  }

  get(id: string): MemoryEntry | undefined {
    return this.memories.get(id);
  }

  getByUser(userId: string): MemoryEntry[] {
    const ids = this.userMemories.get(userId);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.memories.get(id))
      .filter((m): m is MemoryEntry => m !== undefined);
  }

  getByGroup(groupId: string): MemoryEntry[] {
    const ids = this.groupMemories.get(groupId);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.memories.get(id))
      .filter((m): m is MemoryEntry => m !== undefined);
  }

  getByTag(tag: string): MemoryEntry[] {
    const ids = this.taggedMemories.get(tag);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.memories.get(id))
      .filter((m): m is MemoryEntry => m !== undefined);
  }

  delete(id: string): boolean {
    const entry = this.memories.get(id);
    if (!entry) return false;

    this.memories.delete(id);

    // 清理索引
    if (entry.metadata.userId) {
      this.userMemories.get(entry.metadata.userId)?.delete(id);
    }
    if (entry.metadata.groupId) {
      this.groupMemories.get(entry.metadata.groupId)?.delete(id);
    }
    if (entry.metadata.tags) {
      for (const tag of entry.metadata.tags) {
        this.taggedMemories.get(tag)?.delete(id);
      }
    }

    return true;
  }

  getAll(): MemoryEntry[] {
    return Array.from(this.memories.values());
  }

  clear(): void {
    this.memories.clear();
    this.userMemories.clear();
    this.groupMemories.clear();
    this.taggedMemories.clear();
  }

  size(): number {
    return this.memories.size;
  }
}

/**
 * 记忆服务
 */
export class MemoryService {
  private store: InMemoryMemoryStore;
  private storagePath: string;
  private autoCleanup: boolean;
  private retentionTime: number;

  constructor(options: MemoryServiceOptions = {}) {
    this.storagePath = options.storagePath || path.join(process.cwd(), 'data', 'memory');
    this.autoCleanup = options.autoCleanup ?? true;
    this.retentionTime = options.retentionTime || 30 * 24 * 60 * 60 * 1000; // 30 天

    this.store = new InMemoryMemoryStore();

    logger.info(`[MemoryService] 初始化完成 (存储路径: ${this.storagePath})`);
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    // 确保存储目录存在
    await fs.mkdir(this.storagePath, { recursive: true });

    // 加载持久化的记忆
    await this.loadFromFile();

    // 启动自动清理
    if (this.autoCleanup) {
      this.startAutoCleanup();
    }

    logger.info('[MemoryService] 服务启动完成');
  }

  /**
   * 添加记忆
   */
  async addMemory(
    type: MemoryType,
    content: string,
    metadata: MemoryMetadata = {}
  ): Promise<string> {
    const id = this.generateId();

    const entry: MemoryEntry = {
      id,
      type,
      content,
      metadata,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
    };

    this.store.add(entry);

    // 异步保存到文件
    this.saveToFile().catch(error => {
      logger.error(`[MemoryService] 保存失败: ${error}`);
    });

    logger.debug(`[MemoryService] 添加记忆: ${id} (${type})`);
    return id;
  }

  /**
   * 获取记忆
   */
  getMemory(id: string): MemoryEntry | undefined {
    const entry = this.store.get(id);
    if (entry) {
      // 更新访问统计
      entry.lastAccessedAt = new Date();
      entry.accessCount++;
    }
    return entry;
  }

  /**
   * 检索记忆
   */
  retrieveMemories(options: MemoryRetrieveOptions = {}): MemoryEntry[] {
    let results: MemoryEntry[] = [];

    // 按 user/group 过滤
    if (options.userId) {
      results = this.store.getByUser(options.userId);
    } else if (options.groupId) {
      results = this.store.getByGroup(options.groupId);
    } else {
      results = this.store.getAll();
    }

    // 按类型过滤
    if (options.types && options.types.length > 0) {
      results = results.filter(m => options.types!.includes(m.type));
    }

    // 按标签过滤
    if (options.tags && options.tags.length > 0) {
      results = results.filter(m =>
        m.metadata.tags?.some(t => options.tags!.includes(t))
      );
    }

    // 按时间过滤
    if (options.timeRange) {
      const cutoff = new Date(Date.now() - options.timeRange);
      results = results.filter(m => m.createdAt >= cutoff);
    }

    // 按重要性排序
    results.sort((a, b) => {
      const aImportance = a.metadata.importance || 0.5;
      const bImportance = b.metadata.importance || 0.5;
      return bImportance - aImportance;
    });

    // 限制结果数量
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * 获取对话历史
   */
  getConversationHistory(
    userId: string,
    groupId: string | undefined,
    limit: number = 50
  ): MemoryEntry[] {
    return this.retrieveMemories({
      userId,
      groupId,
      types: [MemoryType.MESSAGE],
      limit,
    });
  }

  /**
   * 保存用户偏好
   */
  async savePreference(
    userId: string,
    key: string,
    value: string,
    groupId?: string
  ): Promise<void> {
    const content = `${key}=${value}`;

    // 检查是否已存在相同的偏好
    const existing = this.retrieveMemories({
      userId,
      groupId,
      types: [MemoryType.PREFERENCE],
      tags: [key],
    });

    // 如果存在，删除旧的
    for (const old of existing) {
      if (old.content.startsWith(`${key}=`)) {
        this.store.delete(old.id);
      }
    }

    await this.addMemory(MemoryType.PREFERENCE, content, {
      userId,
      groupId,
      tags: [key, 'preference'],
      importance: 0.8,
    });
  }

  /**
   * 获取用户偏好
   */
  getPreferences(userId: string, groupId?: string): Map<string, string> {
    const memories = this.retrieveMemories({
      userId,
      groupId,
      types: [MemoryType.PREFERENCE],
    });

    const preferences = new Map<string, string>();
    for (const memory of memories) {
      const [key, ...valueParts] = memory.content.split('=');
      const value = valueParts.join('=');
      preferences.set(key, value);
    }

    return preferences;
  }

  /**
   * 搜索记忆（简单文本匹配）
   */
  searchMemories(
    query: string,
    options: MemoryRetrieveOptions = {}
  ): MemoryEntry[] {
    const results = this.retrieveMemories(options);
    const lowerQuery = query.toLowerCase();

    return results.filter(m =>
      m.content.toLowerCase().includes(lowerQuery) ||
      m.metadata.tags?.some(t => t.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 删除记忆
   */
  async deleteMemory(id: string): Promise<boolean> {
    const deleted = this.store.delete(id);
    if (deleted) {
      this.saveToFile().catch(error => {
        logger.error(`[MemoryService] 保存失败: ${error}`);
      });
    }
    return deleted;
  }

  /**
   * 清理过期记忆
   */
  async cleanupExpiredMemories(): Promise<number> {
    const cutoff = new Date(Date.now() - this.retentionTime);
    const allMemories = this.store.getAll();
    let deleted = 0;

    for (const memory of allMemories) {
      // 保留重要的记忆
      if (memory.metadata.importance && memory.metadata.importance > 0.8) {
        continue;
      }

      // 删除过期的低重要性记忆
      if (memory.lastAccessedAt < cutoff) {
        this.store.delete(memory.id);
        deleted++;
      }
    }

    if (deleted > 0) {
      await this.saveToFile();
      logger.info(`[MemoryService] 清理了 ${deleted} 条过期记忆`);
    }

    return deleted;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    byType: Record<MemoryType, number>;
    byUser: number;
    byGroup: number;
  } {
    const all = this.store.getAll();
    const byType: Record<string, number> = {};
    const users = new Set<string>();
    const groups = new Set<string>();

    for (const m of all) {
      byType[m.type] = (byType[m.type] || 0) + 1;
      if (m.metadata.userId) users.add(m.metadata.userId);
      if (m.metadata.groupId) groups.add(m.metadata.groupId);
    }

    return {
      total: all.length,
      byType: byType as Record<MemoryType, number>,
      byUser: users.size,
      byGroup: groups.size,
    };
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 保存到文件
   */
  private async saveToFile(): Promise<void> {
    const filePath = path.join(this.storagePath, 'memories.json');
    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      memories: Array.from(this.store.getAll()).map(m => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
        lastAccessedAt: m.lastAccessedAt.toISOString(),
      })),
    };
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * 从文件加载
   */
  private async loadFromFile(): Promise<void> {
    const filePath = path.join(this.storagePath, 'memories.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      if (data.version === 1 && Array.isArray(data.memories)) {
        for (const m of data.memories) {
          const entry: MemoryEntry = {
            ...m,
            createdAt: new Date(m.createdAt),
            lastAccessedAt: new Date(m.lastAccessedAt),
          };
          this.store.add(entry);
        }
        logger.info(`[MemoryService] 加载了 ${data.memories.length} 条记忆`);
      }
    } catch (error) {
      // 文件不存在或格式错误，忽略
      logger.debug('[MemoryService] 没有找到已保存的记忆');
    }
  }

  /**
   * 启动自动清理
   */
  private startAutoCleanup(): void {
    // 每小时清理一次
    setInterval(() => {
      this.cleanupExpiredMemories().catch(error => {
        logger.error(`[MemoryService] 自动清理失败: ${error}`);
      });
    }, 60 * 60 * 1000);
  }

  /**
   * 关闭服务
   */
  async shutdown(): Promise<void> {
    await this.saveToFile();
    logger.info('[MemoryService] 服务已关闭');
  }
}

export default MemoryService;
