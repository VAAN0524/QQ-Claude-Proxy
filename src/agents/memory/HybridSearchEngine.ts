/**
 * 混合搜索引擎
 *
 * 借鉴自 OpenClaw 的混合搜索设计:
 * - 向量搜索 (70% 权重): 语义理解
 * - BM25 搜索 (30% 权重): 精确匹配
 *
 * 最终分数 = vectorWeight × 向量相似度 + textWeight × BM25 分数
 *
 * @example
 * ```typescript
 * const engine = new HybridSearchEngine({ vectorWeight: 0.7, textWeight: 0.3 });
 * const results = engine.search('搜索查询', memoryEntries, 10);
 * ```
 */

import { TextProcessor } from '../../utils/text-processor.js';
import { BM25SearchEngine } from './SearchEngine.js';
import { EmbeddingCache } from './EmbeddingCache.js';
import { DocumentChunker, type Chunk } from './DocumentChunker.js';
import type { HierarchicalMemoryEntry } from './HierarchicalMemoryService.js';
import { logger } from '../../utils/logger.js';

/**
 * 向量接口
 */
export interface Vector {
  /** 向量数据 */
  data: number[];
  /** 维度 */
  dimensions: number;
}

/**
 * 向量搜索结果
 */
export interface VectorSearchResult {
  /** 记忆条目 */
  entry: HierarchicalMemoryEntry;
  /** 相似度分数 (0-1) */
  score: number;
  /** 使用的 chunk */
  chunk?: Chunk;
}

/**
 * 混合搜索结果
 */
export interface HybridSearchResult {
  /** 记忆条目 */
  entry: HierarchicalMemoryEntry;
  /** 最终分数 (0-1) */
  score: number;
  /** 向量分数 */
  vectorScore: number;
  /** BM25 分数 */
  bm25Score: number;
}

/**
 * Embedding 生成函数类型
 */
export type EmbeddingFn = (text: string) => Promise<number[]>;

/**
 * 搜索引擎配置
 */
export interface HybridSearchEngineOptions {
  /** 向量搜索权重 (默认 0.7) */
  vectorWeight?: number;
  /** BM25 搜索权重 (默认 0.3) */
  textWeight?: number;
  /** Embedding 缓存 */
  embeddingCache?: EmbeddingCache;
  /** Embedding 生成函数 */
  embeddingFn?: EmbeddingFn;
  /** 是否启用 chunk 搜索 (默认 true) */
  enableChunkSearch?: boolean;
  /** BM25 参数 */
  k1?: number;
  b?: number;
}

/**
 * 向量搜索引擎
 */
class VectorSearchEngine {
  private vectors: Map<string, Vector> = new Map();
  private chunkVectors: Map<string, { vector: Vector; chunk: Chunk }> = new Map();

  /**
   * 索引文档
   */
  indexDocument(docId: string, embedding: number[]): void {
    const vector: Vector = {
      data: embedding,
      dimensions: embedding.length,
    };
    this.vectors.set(docId, vector);
  }

  /**
   * 索引 chunk
   */
  indexChunk(chunk: Chunk, embedding: number[]): void {
    const vector: Vector = {
      data: embedding,
      dimensions: embedding.length,
    };
    this.chunkVectors.set(chunk.id, { vector, chunk });
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('向量维度不匹配');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * 向量搜索
   */
  search(
    queryEmbedding: number[],
    entries: HierarchicalMemoryEntry[],
    limit: number = 10
  ): VectorSearchResult[] {
    const results: VectorSearchResult[] = [];

    // 搜索文档级向量
    for (const entry of entries) {
      const vector = this.vectors.get(entry.id);
      if (vector) {
        const score = this.cosineSimilarity(queryEmbedding, vector.data);
        if (score > 0) {
          results.push({ entry, score });
        }
      }
    }

    // 搜索 chunk 级向量（如果启用）
    for (const [chunkId, { vector, chunk }] of this.chunkVectors) {
      const entry = entries.find(e => e.id === chunk.parentId);
      if (entry) {
        const score = this.cosineSimilarity(queryEmbedding, vector.data);
        if (score > 0) {
          // 检查是否已有更高分数的结果
          const existing = results.find(r => r.entry.id === entry.id);
          if (!existing || score > existing.score) {
            // 替换或添加
            if (existing) {
              existing.score = Math.max(existing.score, score);
              existing.chunk = chunk;
            } else {
              results.push({ entry, score, chunk });
            }
          }
        }
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * 移除文档
   */
  removeDocument(docId: string): boolean {
    this.vectors.delete(docId);

    // 移除相关 chunks
    for (const [chunkId, data] of this.chunkVectors) {
      if (data.chunk.parentId === docId) {
        this.chunkVectors.delete(chunkId);
      }
    }

    return true;
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.vectors.clear();
    this.chunkVectors.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(): { documentCount: number; chunkCount: number } {
    return {
      documentCount: this.vectors.size,
      chunkCount: this.chunkVectors.size,
    };
  }
}

/**
 * 混合搜索引擎
 */
export class HybridSearchEngine {
  private vectorEngine: VectorSearchEngine;
  private bm25Engine: BM25SearchEngine;
  private vectorWeight: number;
  private textWeight: number;
  private embeddingCache?: EmbeddingCache;
  private embeddingFn?: EmbeddingFn;
  private enableChunkSearch: boolean;

  // 用于反向查找: chunkId -> entry
  private entryMap = new Map<string, HierarchicalMemoryEntry>();

  constructor(options: HybridSearchEngineOptions = {}) {
    this.vectorEngine = new VectorSearchEngine();
    this.bm25Engine = new BM25SearchEngine();

    // 自定义 BM25 参数
    if (options.k1 !== undefined || options.b !== undefined) {
      // 可以通过修改 BM25SearchEngine 来支持自定义参数
      // 这里暂时使用默认值
    }

    this.vectorWeight = options.vectorWeight ?? 0.7;
    this.textWeight = options.textWeight ?? 0.3;
    this.embeddingCache = options.embeddingCache;
    this.embeddingFn = options.embeddingFn;
    this.enableChunkSearch = options.enableChunkSearch !== false;

    logger.info(`[HybridSearchEngine] 初始化完成 (向量权重: ${this.vectorWeight}, BM25 权重: ${this.textWeight})`);
  }

  /**
   * 索引文档
   *
   * @param entry - 记忆条目
   * @param content - 用于索引的内容（可选，默认使用 L0 + L1）
   */
  async indexDocument(entry: HierarchicalMemoryEntry, content?: string): Promise<void> {
    this.entryMap.set(entry.id, entry);

    // 1. BM25 索引
    const indexContent = content ||
      (entry.L0?.summary || '') + ' ' +
      (entry.L1?.overview || '') + ' ' +
      (entry.L2?.content || '');
    this.bm25Engine.indexDocument(entry.id, indexContent);

    // 2. 向量索引（如果有 embedding 函数）
    if (this.embeddingFn) {
      const embedding = await this.getEmbedding(indexContent);
      this.vectorEngine.indexDocument(entry.id, embedding);
    }

    // 3. Chunk 索引（如果启用且有长内容）
    if (this.enableChunkSearch && entry.L2?.content) {
      const chunks = DocumentChunker.chunk(entry.id, entry.L2.content);

      // 只对长文档进行 chunk 索引 (>800 tokens)
      const totalTokens = chunks.reduce((sum, c) => sum + c.tokenEstimate, 0);
      if (totalTokens > 800 && this.embeddingFn) {
        for (const chunk of chunks) {
          const chunkEmbedding = await this.getEmbedding(chunk.content);
          this.vectorEngine.indexChunk(chunk, chunkEmbedding);
        }
      }
    }
  }

  /**
   * 批量索引
   */
  async indexEntries(entries: HierarchicalMemoryEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.indexDocument(entry);
    }
    logger.debug(`[HybridSearchEngine] 已索引 ${entries.length} 条记忆`);
  }

  /**
   * 搜索
   *
   * @param query - 搜索查询
   * @param entries - 候选记忆条目
   * @param limit - 返回结果数量
   * @returns 搜索结果
   */
  async search(
    query: string,
    entries: HierarchicalMemoryEntry[],
    limit: number = 10
  ): Promise<HybridSearchResult[]> {
    // 更新 entryMap
    for (const entry of entries) {
      this.entryMap.set(entry.id, entry);
    }

    const results = new Map<string, HybridSearchResult>();

    // 1. 向量搜索（如果有 embedding 函数）
    let vectorScores = new Map<string, number>();
    if (this.embeddingFn) {
      const queryEmbedding = await this.getEmbedding(query);
      const vectorResults = this.vectorEngine.search(queryEmbedding, entries, limit * 2);

      // 归一化向量分数
      const maxVector = Math.max(...vectorResults.map(r => r.score), 1);
      for (const result of vectorResults) {
        vectorScores.set(result.entry.id, result.score / maxVector);
      }
    }

    // 2. BM25 搜索
    const bm25Results = this.bm25Engine.search(query, entries, 'bm25', limit * 2);

    // 归一化 BM25 分数
    const maxBM25 = Math.max(...bm25Results.map(r => r.score), 1);
    const bm25Scores = new Map<string, number>();
    for (const result of bm25Results) {
      bm25Scores.set(result.entry.id, result.score / maxBM25);
    }

    // 3. 合并分数
    const allIds = new Set([...vectorScores.keys(), ...bm25Scores.keys()]);

    for (const id of allIds) {
      const vectorScore = vectorScores.get(id) || 0;
      const bm25Score = bm25Scores.get(id) || 0;
      const finalScore = vectorScore * this.vectorWeight + bm25Score * this.textWeight;

      const entry = this.entryMap.get(id);
      if (entry && finalScore > 0) {
        results.set(id, {
          entry,
          score: finalScore,
          vectorScore,
          bm25Score,
        });
      }
    }

    // 4. 排序并返回
    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 获取 embedding（使用缓存）
   */
  private async getEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingFn) {
      throw new Error('未配置 embedding 函数');
    }

    if (this.embeddingCache) {
      return await this.embeddingCache.get(text, this.embeddingFn);
    }

    return await this.embeddingFn(text);
  }

  /**
   * 移除文档
   */
  removeDocument(docId: string): boolean {
    this.entryMap.delete(docId);
    this.bm25Engine.removeDocument(docId);
    this.vectorEngine.removeDocument(docId);
    return true;
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.entryMap.clear();
    this.bm25Engine.clear();
    this.vectorEngine.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    bm25: ReturnType<BM25SearchEngine['getStats']>;
    vector: ReturnType<VectorSearchEngine['getStats']>;
    weights: { vector: number; text: number };
  } {
    return {
      bm25: this.bm25Engine.getStats(),
      vector: this.vectorEngine.getStats(),
      weights: {
        vector: this.vectorWeight,
        text: this.textWeight,
      },
    };
  }
}

export default HybridSearchEngine;
