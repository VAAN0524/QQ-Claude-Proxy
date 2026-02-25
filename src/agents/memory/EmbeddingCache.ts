/**
 * Embedding 缓存
 *
 * 使用 SHA-256 哈希去重，避免重复计算
 * 借鉴自 OpenClaw 的缓存设计
 */

import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger.js';

/**
 * 缓存的 embedding 条目
 */
export interface CachedEmbedding {
  /** 内容哈希 (SHA-256) */
  hash: string;
  /** embedding 向量 */
  embedding: number[];
  /** 创建时间 */
  createdAt: Date;
  /** 访问次数 */
  accessCount: number;
  /** 最后访问时间 */
  lastAccessedAt: Date;
}

/**
 * 缓存配置
 */
export interface EmbeddingCacheOptions {
  /** 缓存目录 */
  cacheDir?: string;
  /** 最大缓存条目数 (默认 50000) */
  maxEntries?: number;
  /** 缓存文件名 (默认 embedding-cache.json) */
  cacheFileName?: string;
  /** 自动保存间隔 (毫秒，默认 5000) */
  autoSaveInterval?: number;
}

/**
 * Embedding 缓存类
 */
export class EmbeddingCache {
  private cache: Map<string, CachedEmbedding> = new Map();
  private readonly maxEntries: number;
  private readonly cachePath: string;
  private readonly autoSaveInterval: number;
  private dirty = false;
  private saveTimer?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(options: EmbeddingCacheOptions = {}) {
    this.maxEntries = options.maxEntries || 50000;
    this.autoSaveInterval = options.autoSaveInterval || 5000;
    this.cachePath = path.join(
      options.cacheDir || path.join(process.cwd(), 'data'),
      options.cacheFileName || 'embedding-cache.json'
    );
  }

  /**
   * 初始化：加载缓存
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 确保目录存在
      const dir = path.dirname(this.cachePath);
      await fs.mkdir(dir, { recursive: true });

      const content = await fs.readFile(this.cachePath, 'utf-8');
      const data = JSON.parse(content);

      for (const entry of data) {
        entry.createdAt = new Date(entry.createdAt);
        entry.lastAccessedAt = new Date(entry.lastAccessedAt);
        this.cache.set(entry.hash, entry);
      }

      logger.info(`[EmbeddingCache] 已加载 ${this.cache.size} 条缓存`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`[EmbeddingCache] 加载失败: ${error}`);
      }
      logger.info('[EmbeddingCache] 无现有缓存，创建新缓存');
      this.cache.clear();
    }

    this.isInitialized = true;
  }

  /**
   * 获取 embedding（带缓存）
   *
   * @param text - 文本内容
   * @param computeFn - 计算 embedding 的函数
   * @returns embedding 向量
   */
  async get(
    text: string,
    computeFn: (text: string) => Promise<number[]>
  ): Promise<number[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const hash = this.hash(text);
    const cached = this.cache.get(hash);

    if (cached) {
      // 更新访问统计
      cached.accessCount++;
      cached.lastAccessedAt = new Date();

      this.scheduleSave();
      logger.debug(`[EmbeddingCache] 缓存命中: ${hash.substring(0, 8)}...`);
      return cached.embedding;
    }

    // 计算新 embedding
    const embedding = await computeFn(text);

    // 存入缓存
    const entry: CachedEmbedding = {
      hash,
      embedding,
      createdAt: new Date(),
      accessCount: 1,
      lastAccessedAt: new Date(),
    };

    this.cache.set(hash, entry);

    // 检查缓存大小，必要时清理
    if (this.cache.size > this.maxEntries) {
      this.evictLRU();
    }

    this.dirty = true;
    this.scheduleSave();

    logger.debug(`[EmbeddingCache] 新增缓存: ${hash.substring(0, 8)}... (总计: ${this.cache.size})`);
    return embedding;
  }

  /**
   * 批量获取 embedding
   *
   * @param texts - 文本数组
   * @param computeFn - 计算 embedding 的函数
   * @returns embedding 向量数组
   */
  async batchGet(
    texts: string[],
    computeFn: (texts: string[]) => Promise<number[][]>
  ): Promise<number[][]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const results: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // 检查缓存
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const hash = this.hash(text);
      const cached = this.cache.get(hash);

      if (cached) {
        cached.accessCount++;
        cached.lastAccessedAt = new Date();
        results[i] = cached.embedding;
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(i);
      }
    }

    // 批量计算未缓存的
    if (uncachedTexts.length > 0) {
      const newEmbeddings = await computeFn(uncachedTexts);

      for (let i = 0; i < uncachedTexts.length; i++) {
        const text = uncachedTexts[i];
        const embedding = newEmbeddings[i];
        const hash = this.hash(text);

        const entry: CachedEmbedding = {
          hash,
          embedding,
          createdAt: new Date(),
          accessCount: 1,
          lastAccessedAt: new Date(),
        };

        this.cache.set(hash, entry);
        results[uncachedIndices[i]] = embedding;
      }

      this.dirty = true;
      this.scheduleSave();
    }

    return results;
  }

  /**
   * 检查缓存是否存在
   */
  has(text: string): boolean {
    const hash = this.hash(text);
    return this.cache.has(hash);
  }

  /**
   * 直接获取缓存的 embedding（不计算）
   */
  getCached(text: string): number[] | undefined {
    const hash = this.hash(text);
    const cached = this.cache.get(hash);

    if (cached) {
      cached.accessCount++;
      cached.lastAccessedAt = new Date();
      return cached.embedding;
    }

    return undefined;
  }

  /**
   * 手动添加到缓存
   */
  set(text: string, embedding: number[]): void {
    const hash = this.hash(text);
    const entry: CachedEmbedding = {
      hash,
      embedding,
      createdAt: new Date(),
      accessCount: 1,
      lastAccessedAt: new Date(),
    };

    this.cache.set(hash, entry);
    this.dirty = true;
    this.scheduleSave();
  }

  /**
   * 计算 SHA-256 哈希
   */
  private hash(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
  }

  /**
   * LRU 淘汰
   */
  private evictLRU(): void {
    const sorted = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessedAt.getTime() - b[1].lastAccessedAt.getTime());

    // 删除最旧的 10%
    const toDelete = Math.floor(this.maxEntries * 0.1);
    for (let i = 0; i < toDelete; i++) {
      this.cache.delete(sorted[i][0]);
    }

    this.dirty = true;
    logger.info(`[EmbeddingCache] LRU 淘汰: 删除 ${toDelete} 条 (剩余: ${this.cache.size})`);
  }

  /**
   * 定时保存（防抖）
   */
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.save().catch(error => {
        logger.error(`[EmbeddingCache] 保存失败: ${error}`);
      });
    }, this.autoSaveInterval);
  }

  /**
   * 保存到磁盘
   */
  async save(): Promise<void> {
    if (!this.dirty) {
      return;
    }

    try {
      const data = Array.from(this.cache.values());
      await fs.writeFile(
        this.cachePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );

      this.dirty = false;
      logger.debug(`[EmbeddingCache] 已保存 ${data.length} 条缓存到 ${this.cachePath}`);
    } catch (error) {
      logger.error(`[EmbeddingCache] 保存失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    size: number;
    hitRate: number;
    totalAccess: number;
    cachePath: string;
    maxEntries: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalAccess = entries.reduce((sum, e) => sum + e.accessCount, 0);
    const uniqueEntries = entries.length;
    const hitRate = totalAccess > 0 ? (totalAccess - uniqueEntries) / totalAccess : 0;

    return {
      size: this.cache.size,
      hitRate,
      totalAccess,
      cachePath: this.cachePath,
      maxEntries: this.maxEntries,
    };
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.dirty = true;
    await this.save();
    logger.info('[EmbeddingCache] 缓存已清空');
  }

  /**
   * 删除指定条目
   */
  delete(text: string): boolean {
    const hash = this.hash(text);
    const deleted = this.cache.delete(hash);
    if (deleted) {
      this.dirty = true;
      this.scheduleSave();
    }
    return deleted;
  }

  /**
   * 关闭（保存）
   */
  async shutdown(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    await this.save();
    logger.info('[EmbeddingCache] 已关闭');
  }
}

export default EmbeddingCache;
