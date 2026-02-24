/**
 * BM25 搜索引擎 - 用于语义搜索
 * 使用 TF-IDF/BM25 算法计算文本相似度
 */

import { TextProcessor } from '../../utils/text-processor.js';
import type { HierarchicalMemoryEntry } from './HierarchicalMemoryService.js';

/**
 * 文档向量
 */
interface DocumentVector {
  docId: string;
  terms: Map<string, number>; // 词频统计
  magnitude: number; // 向量模长
  length: number; // 唯一词数量（文档长度）
}

/**
 * BM25 搜索结果
 */
export interface SearchResult {
  entry: HierarchicalMemoryEntry;
  score: number;
}

/**
 * BM25 搜索引擎
 */
export class BM25SearchEngine {
  private documents: Map<string, DocumentVector> = new Map();
  private docFreq: Map<string, number> = new Map(); // 文档频率
  private totalDocs: number = 0;
  private k1: number = 1.2; // 词频饱和参数
  private b: number = 0.75; // 长度归一化参数

  /**
   * 索引文档
   */
  indexDocument(docId: string, content: string): void {
    const terms = new Map<string, number>();
    const words = TextProcessor.tokenize(content);

    // 统计词频
    for (const word of words) {
      terms.set(word, (terms.get(word) || 0) + 1);
    }

    // 计算向量模长
    let magnitude = 0;
    for (const freq of terms.values()) {
      magnitude += freq * freq;
    }
    magnitude = Math.sqrt(magnitude);

    const docVector: DocumentVector = {
      docId,
      terms,
      magnitude,
      length: terms.size,
    };

    // 移除旧文档（如果存在）
    const oldDoc = this.documents.get(docId);
    if (oldDoc) {
      // 更新文档频率
      for (const word of oldDoc.terms.keys()) {
        const count = this.docFreq.get(word) || 0;
        if (count <= 1) {
          this.docFreq.delete(word);
        } else {
          this.docFreq.set(word, count - 1);
        }
      }
      this.totalDocs--;
    }

    this.documents.set(docId, docVector);

    // 更新文档频率
    const uniqueWords = new Set(words);
    for (const word of uniqueWords) {
      this.docFreq.set(word, (this.docFreq.get(word) || 0) + 1);
    }

    this.totalDocs++;
  }

  /**
   * 计算 BM25 分数
   */
  private calculateBM25(
    queryTerms: string[],
    docTerms: Map<string, number>,
    docLength: number,
    avgDocLength: number
  ): number {
    let score = 0;

    for (const term of queryTerms) {
      const termFreq = docTerms.get(term) || 0;
      if (termFreq === 0) continue;

      const docFreq = this.docFreq.get(term) || 0;
      const idf = Math.log((this.totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);

      const numerator = termFreq * (this.k1 + 1);
      const denominator = termFreq + this.k1 * (1 - this.b + this.b * (docLength / avgDocLength));

      score += idf * (numerator / denominator);
    }

    return score;
  }

  /**
   * 计算余弦相似度（TF-IDF）
   */
  private calculateCosineSimilarity(
    queryVector: Map<string, number>,
    queryMagnitude: number,
    docVector: DocumentVector
  ): number {
    let dotProduct = 0;

    for (const [term, queryWeight] of queryVector) {
      const docWeight = docVector.terms.get(term) || 0;
      dotProduct += queryWeight * docWeight;
    }

    return dotProduct / (queryMagnitude * docVector.magnitude);
  }

  /**
   * 搜索相关文档
   */
  search(
    query: string,
    entries: HierarchicalMemoryEntry[],
    method: 'bm25' | 'cosine' = 'bm25',
    limit: number = 10
  ): SearchResult[] {
    const queryTerms = TextProcessor.tokenize(query);
    if (queryTerms.length === 0) return [];

    // 构建查询向量
    const queryVector = new Map<string, number>();
    for (const term of queryTerms) {
      queryVector.set(term, (queryVector.get(term) || 0) + 1);
    }

    // 计算查询向量模长
    let queryMagnitude = 0;
    for (const freq of queryVector.values()) {
      queryMagnitude += freq * freq;
    }
    queryMagnitude = Math.sqrt(queryMagnitude);

    // 计算平均文档长度
    let totalLength = 0;
    for (const doc of this.documents.values()) {
      totalLength += doc.length;
    }
    const avgDocLength = this.totalDocs > 0 ? totalLength / this.totalDocs : 1;

    // 计算分数
    const results: SearchResult[] = [];

    for (const entry of entries) {
      const docVector = this.documents.get(entry.id);
      if (!docVector) continue;

      let score: number;
      if (method === 'bm25') {
        score = this.calculateBM25(
          queryTerms,
          docVector.terms,
          docVector.length,
          avgDocLength
        );
      } else {
        score = this.calculateCosineSimilarity(queryVector, queryMagnitude, docVector);
      }

      if (score > 0) {
        results.push({ entry, score });
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * 批量索引
   */
  indexEntries(entries: HierarchicalMemoryEntry[]): void {
    for (const entry of entries) {
      const content = entry.L0?.summary || entry.L1?.overview || entry.L2?.content || '';
      this.indexDocument(entry.id, content);
    }
  }

  /**
   * 移除文档
   */
  removeDocument(docId: string): boolean {
    const doc = this.documents.get(docId);
    if (!doc) return false;

    // 更新文档频率
    for (const word of doc.terms.keys()) {
      const count = this.docFreq.get(word) || 0;
      if (count <= 1) {
        this.docFreq.delete(word);
      } else {
        this.docFreq.set(word, count - 1);
      }
    }

    this.documents.delete(docId);
    this.totalDocs--;
    return true;
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.documents.clear();
    this.docFreq.clear();
    this.totalDocs = 0;
  }

  /**
   * 获取索引统计
   */
  getStats(): { totalDocs: number; uniqueTerms: number; avgDocLength: number } {
    let totalLength = 0;
    for (const doc of this.documents.values()) {
      totalLength += doc.length;
    }
    return {
      totalDocs: this.totalDocs,
      uniqueTerms: this.docFreq.size,
      avgDocLength: this.totalDocs > 0 ? totalLength / this.totalDocs : 0,
    };
  }

  /**
   * 检查文档是否已索引
   */
  hasDocument(docId: string): boolean {
    return this.documents.has(docId);
  }
}

export default BM25SearchEngine;
