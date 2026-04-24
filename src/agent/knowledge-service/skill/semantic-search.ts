/**
 * 语义搜索引擎 - Phase 2
 * 支持TF-IDF向量相似度和混合检索
 */

import { TFIDFVectorizer, SemanticSimilarity, Tokenizer } from './vector-embeddings.js';
import { KnowledgeItem, SearchQuery, SemanticSearchResult } from './types.js';

export interface SearchCache {
  query: string;
  results: SemanticSearchResult[];
  timestamp: number;
}

export class SemanticSearchEngine {
  private vectorizer: TFIDFVectorizer;
  private similarity: SemanticSimilarity;
  private cache: Map<string, SearchCache>;
  private cacheTimeout: number = 5 * 60 * 1000; // 5分钟缓存
  private initialized = false;

  constructor() {
    this.vectorizer = new TFIDFVectorizer();
    this.similarity = new SemanticSimilarity(this.vectorizer);
    this.cache = new Map();
  }

  /**
   * 初始化搜索引擎
   */
  async initialize(items: KnowledgeItem[]): Promise<void> {
    if (this.initialized) return;

    // 训练TF-IDF模型
    const documents = items.map(item => item.content);
    this.vectorizer.fit(documents);

    // 为所有item生成向量
    for (const item of items) {
      const vector = this.vectorizer.transform(item.content);
      item.embedding = vector.dimensions;
    }

    this.initialized = true;
  }

  /**
   * 语义搜索
   */
  async semanticSearch(
    query: string,
    items: KnowledgeItem[],
    options: {
      minSimilarity?: number;
      limit?: number;
    } = {}
  ): Promise<SemanticSearchResult[]> {
    const { minSimilarity = 0.1, limit = 20 } = options;

    // 检查缓存
    const cacheKey = this.getCacheKey(query, minSimilarity, limit);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.results;
    }

    // 查询向量化
    const queryVec = this.vectorizer.transform(query);

    // 计算相似度
    const results: SemanticSearchResult[] = items
      .map(item => {
        if (!item.embedding) {
          return {
            item,
            score: 0,
            matchType: 'keyword' as const
          };
        }

        // 计算余弦相似度
        let dotProduct = 0;
        let queryMagnitude = 0;
        let itemMagnitude = 0;

        for (let i = 0; i < queryVec.dimensions.length && i < item.embedding.length; i++) {
          dotProduct += queryVec.dimensions[i] * (item.embedding[i] || 0);
        }

        queryMagnitude = queryVec.magnitude;
        itemMagnitude = this.calculateMagnitude(item.embedding);

        const magnitude = queryMagnitude * itemMagnitude;
        const score = magnitude > 0 ? dotProduct / magnitude : 0;

        return {
          item,
          score,
          matchType: (score > 0.3 ? 'semantic' : 'keyword') as 'exact' | 'semantic' | 'keyword'
        };
      })
      .filter(result => result.score >= minSimilarity)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // 缓存结果
    this.cache.set(cacheKey, {
      query,
      results,
      timestamp: Date.now()
    });

    return results;
  }

  /**
   * 混合检索（关键词 + 语义）
   */
  async hybridSearch(
    query: string,
    items: KnowledgeItem[],
    options: {
      keywordWeight?: number; // 关键词权重 0-1
      semanticWeight?: number; // 语义权重 0-1
      minSimilarity?: number;
      limit?: number;
    } = {}
  ): Promise<SemanticSearchResult[]> {
    const {
      keywordWeight = 0.3,
      semanticWeight = 0.7,
      minSimilarity = 0.1,
      limit = 20
    } = options;

    // 关键词匹配
    const queryLower = query.toLowerCase();
    const keywords = Tokenizer.extractKeywords(query, 5);

    const keywordScores = new Map<string, number>();
    for (const item of items) {
      const contentLower = item.content.toLowerCase();
      let score = 0;

      // 完全匹配
      if (contentLower.includes(queryLower)) {
        score += 1.0;
      }

      // 关键词匹配
      for (const keyword of keywords) {
        if (contentLower.includes(keyword.toLowerCase())) {
          score += 0.3;
        }
      }

      // 标签匹配
      if (item.tags.level3.toLowerCase().includes(queryLower) ||
          item.tags.level2.toLowerCase().includes(queryLower)) {
        score += 0.5;
      }

      keywordScores.set(item.id, Math.min(score, 1.0));
    }

    // 语义相似度
    const semanticResults = await this.semanticSearch(query, items, {
      minSimilarity,
      limit: items.length // 不限制，后续合并
    });

    // 合并分数
    const mergedResults = new Map<string, SemanticSearchResult>();

    // 添加语义搜索结果
    for (const result of semanticResults) {
      const keywordScore = keywordScores.get(result.item.id) || 0;
      const combinedScore =
        result.score * semanticWeight +
        keywordScore * keywordWeight;

      mergedResults.set(result.item.id, {
        ...result,
        score: combinedScore,
        matchType: keywordScore > 0.5 ? 'exact' : result.matchType
      });
    }

    // 添加只有关键词匹配的结果
    for (const [id, keywordScore] of keywordScores.entries()) {
      if (!mergedResults.has(id) && keywordScore > 0.3) {
        const item = items.find(i => i.id === id);
        if (item) {
          mergedResults.set(id, {
            item,
            score: keywordScore * keywordWeight,
            matchType: 'keyword' as const
          });
        }
      }
    }

    // 排序并限制结果
    return Array.from(mergedResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 生成文本摘要
   */
  generateSummary(text: string, maxLength: number = 100): string {
    // 简单摘要：提取前几句
    const sentences = text.split(/[。！？.!?]/);
    let summary = '';
    let length = 0;

    for (const sentence of sentences) {
      if (length + sentence.length > maxLength) {
        break;
      }
      summary += sentence.trim() + '。';
      length += sentence.length;
    }

    return summary || text.substring(0, maxLength);
  }

  /**
   * 自动提取标签
   */
  suggestTags(content: string, existingTags: string[][]): string[] {
    const keywords = Tokenizer.extractKeywords(content, 10);

    // 基于现有标签建议
    const suggestions: string[] = [];

    // 一级标签（大类）
    const level1Suggestions = ['工作', '学习', '项目', '个人'];
    for (const tag of level1Suggestions) {
      if (content.toLowerCase().includes(tag.toLowerCase())) {
        suggestions.push(tag);
      }
    }

    // 二级标签（从关键词中提取）
    if (keywords.length > 0) {
      suggestions.push(keywords[0]);
    }

    // 三级标签（具体关键词）
    if (keywords.length > 1) {
      suggestions.push(keywords[1]);
    }

    return suggestions.slice(0, 3);
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 计算向量模长
   */
  private calculateMagnitude(vector: number[]): number {
    let sum = 0;
    for (const v of vector) {
      sum += v * v;
    }
    return Math.sqrt(sum);
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(query: string, minSimilarity: number, limit: number): string {
    return `${query}:${minSimilarity}:${limit}`;
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}
