/**
 * KnowledgeCache - 知识缓存服务
 *
 * 缓存搜索结果和事实性答案，避免重复搜索
 * 适用于：
 * - 天气查询（短时间内答案不变）
 * - 新闻摘要（一天内有效）
 * - 定义/概念（长期有效）
 * - API 文档（版本不变时有效）
 */

import { logger } from '../../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * 缓存条目
 */
interface CacheEntry {
  /** 问题/查询 */
  query: string;
  /** 答案/结果 */
  answer: string;
  /** 缓存时间 */
  cachedAt: Date;
  /** 有效期（毫秒） */
  ttl: number;
  /** 访问次数 */
  accessCount: number;
  /** 相关标签 */
  tags: string[];
}

/**
 * 缓存配置
 */
export interface KnowledgeCacheOptions {
  /** 存储路径 */
  storagePath?: string;
  /** 默认 TTL（毫秒）默认 1 小时 */
  defaultTTL?: number;
  /** 最大缓存条目数 */
  maxEntries?: number;
  /** 是否持久化到磁盘 */
  persist?: boolean;
}

/**
 * 知识类型及其默认 TTL
 */
export const KNOWLEDGE_TTL = {
  /** 天气信息：30 分钟 */
  WEATHER: 30 * 60 * 1000,
  /** 新闻摘要：6 小时 */
  NEWS: 6 * 60 * 60 * 1000,
  /** 定义/概念：7 天 */
  DEFINITION: 7 * 24 * 60 * 60 * 1000,
  /** API 文档：30 天 */
  API_DOCS: 30 * 24 * 60 * 60 * 1000,
  /** 通用知识：1 天 */
  GENERAL: 24 * 60 * 60 * 1000,
  /** 实时数据：5 分钟 */
  REALTIME: 5 * 60 * 1000,
} as const;

/**
 * 知识缓存服务
 */
export class KnowledgeCache {
  private cache: Map<string, CacheEntry> = new Map();
  private storagePath: string;
  private defaultTTL: number;
  private maxEntries: number;
  private persist: boolean;

  constructor(options: KnowledgeCacheOptions = {}) {
    this.storagePath = options.storagePath || path.join(process.cwd(), 'data', 'knowledge-cache');
    this.defaultTTL = options.defaultTTL || 60 * 60 * 1000; // 1 小时
    this.maxEntries = options.maxEntries || 1000;
    this.persist = options.persist ?? true;

    logger.info('[KnowledgeCache] 初始化完成');
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.persist) {
      await fs.mkdir(this.storagePath, { recursive: true });
      await this.loadFromFile();
    }
    logger.info('[KnowledgeCache] 服务启动完成');
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(query: string): string {
    // 简单规范化：转小写、去除空格
    const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
    return `kc_${Buffer.from(normalized).toString('base64').substring(0, 32)}`;
  }

  /**
   * 检测查询类型
   */
  private detectQueryType(query: string): keyof typeof KNOWLEDGE_TTL {
    const lower = query.toLowerCase();

    // 天气相关
    if (lower.includes('天气') || lower.includes('气温') || lower.includes('温度')) {
      return 'WEATHER';
    }

    // 新闻相关
    if (lower.includes('新闻') || lower.includes('最新') || lower.includes('资讯')) {
      return 'NEWS';
    }

    // 定义/概念相关
    if (lower.startsWith('什么是') || lower.startsWith('定义') || lower.includes('是什么意思')) {
      return 'DEFINITION';
    }

    // API 文档相关
    if (lower.includes('api') || lower.includes('文档') || lower.includes('接口')) {
      return 'API_DOCS';
    }

    // 实时数据
    if (lower.includes('现在') || lower.includes('当前') || lower.includes('实时')) {
      return 'REALTIME';
    }

    return 'GENERAL';
  }

  /**
   * 获取缓存的答案
   */
  get(query: string): string | null {
    const key = this.getCacheKey(query);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - entry.cachedAt.getTime() > entry.ttl) {
      this.cache.delete(key);
      logger.debug(`[KnowledgeCache] 缓存已过期: ${query.substring(0, 30)}...`);
      return null;
    }

    // 更新访问统计
    entry.accessCount++;

    logger.info(`[KnowledgeCache] 缓存命中: ${query.substring(0, 30)}... (访问次数: ${entry.accessCount})`);
    return entry.answer;
  }

  /**
   * 设置缓存
   */
  set(query: string, answer: string, customTTL?: number): void {
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].cachedAt.getTime() - b[1].cachedAt.getTime())[0][0];
      this.cache.delete(oldestKey);
      logger.debug('[KnowledgeCache] 缓存已满，删除最旧条目');
    }

    const key = this.getCacheKey(query);
    const queryType = this.detectQueryType(query);
    const ttl = customTTL ?? KNOWLEDGE_TTL[queryType];

    const entry: CacheEntry = {
      query,
      answer,
      cachedAt: new Date(),
      ttl,
      accessCount: 0,
      tags: [queryType],
    };

    this.cache.set(key, entry);

    // 异步保存
    if (this.persist) {
      this.saveToFile().catch(err => {
        logger.error(`[KnowledgeCache] 保存失败: ${err}`);
      });
    }

    logger.info(`[KnowledgeCache] 已缓存: ${query.substring(0, 30)}... (TTL: ${Math.round(ttl / 60000)}分钟, 类型: ${queryType})`);
  }

  /**
   * 删除缓存
   */
  delete(query: string): boolean {
    const key = this.getCacheKey(query);
    const deleted = this.cache.delete(key);

    if (deleted && this.persist) {
      this.saveToFile().catch(err => {
        logger.error(`[KnowledgeCache] 保存失败: ${err}`);
      });
    }

    return deleted;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    logger.info('[KnowledgeCache] 缓存已清空');
  }

  /**
   * 清理过期缓存
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt.getTime() > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`[KnowledgeCache] 清理了 ${cleaned} 条过期缓存`);
      this.saveToFile().catch(err => {
        logger.error(`[KnowledgeCache] 保存失败: ${err}`);
      });
    }

    return cleaned;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    byTag: Record<string, number>;
    totalAccesses: number;
    avgAccessCount: number;
  } {
    const byTag: Record<string, number> = {};
    let totalAccesses = 0;

    for (const entry of this.cache.values()) {
      for (const tag of entry.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
      totalAccesses += entry.accessCount;
    }

    return {
      total: this.cache.size,
      byTag,
      totalAccesses,
      avgAccessCount: this.cache.size > 0 ? totalAccesses / this.cache.size : 0,
    };
  }

  /**
   * 保存到文件
   */
  private async saveToFile(): Promise<void> {
    const filePath = path.join(this.storagePath, 'cache.json');
    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      cache: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        ...entry,
        cachedAt: entry.cachedAt.toISOString(),
      })),
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * 从文件加载
   */
  private async loadFromFile(): Promise<void> {
    const filePath = path.join(this.storagePath, 'cache.json');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      if (data.version === 1 && Array.isArray(data.cache)) {
        for (const item of data.cache) {
          const entry: CacheEntry = {
            ...item,
            cachedAt: new Date(item.cachedAt),
          };
          this.cache.set(item.key, entry);
        }

        logger.info(`[KnowledgeCache] 加载了 ${data.cache.length} 条缓存`);
      }
    } catch (error) {
      // 文件不存在或格式错误，忽略
      logger.debug('[KnowledgeCache] 没有找到已保存的缓存');
    }
  }

  /**
   * 定期清理过期缓存
   */
  startPeriodicCleanup(intervalMs: number = 60 * 60 * 1000): void {
    setInterval(() => {
      this.cleanupExpired();
    }, intervalMs);

    logger.info(`[KnowledgeCache] 定期清理已启动: ${intervalMs}ms`);
  }

  /**
   * 关闭服务
   */
  async shutdown(): Promise<void> {
    if (this.persist) {
      await this.saveToFile();
    }
    logger.info('[KnowledgeCache] 服务已关闭');
  }
}

export default KnowledgeCache;
