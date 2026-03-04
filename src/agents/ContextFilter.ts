/**
 * ContextFilter - 上下文相关性过滤器
 *
 * 基于 BM25 和关键词匹配，过滤与当前查询相关的历史消息
 * 减少不相干上下文对 LLM 的干扰
 */

import { logger } from '../utils/logger.js';
import type { ContextMessage } from './SharedContext.js';

/**
 * BM25 参数配置
 */
interface BM25Options {
  k1: number;  // 词频饱和参数
  b: number;   // 长度归一化参数
}

/**
 * 相关性分数结果
 */
interface RelevanceScore {
  message: ContextMessage;
  score: number;
}

/**
 * 上下文过滤器
 */
export class ContextFilter {
  private static readonly DEFAULT_OPTIONS: BM25Options = {
    k1: 1.2,
    b: 0.75,
  };

  /**
   * 简单的分词器（支持中英文）
   */
  private static tokenize(text: string): string[] {
    // 移除特殊字符，保留中文、英文、数字
    const cleanText = text.toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/gi, ' ');

    // 中文按字符分割，英文按单词分割
    const tokens: string[] = [];
    for (const word of cleanText.split(/\s+/)) {
      if (/[\u4e00-\u9fa5]/.test(word)) {
        // 中文：按字符分割（2-3字词组）
        for (let i = 0; i < word.length; i++) {
          tokens.push(word[i]);
          if (i + 2 <= word.length) {
            tokens.push(word.substring(i, i + 2));
          }
        }
      } else if (word.length > 0) {
        // 英文：直接添加单词
        tokens.push(word);
      }
    }

    return tokens.filter(t => t.length > 0);
  }

  /**
   * 计算 BM25 分数
   */
  private static calculateBM25(
    queryTokens: string[],
    docTokens: string[],
    avgDocLength: number,
    options: BM25Options
  ): number {
    const { k1, b } = options;
    const docLength = docTokens.length;

    // 构建文档词频
    const docFreq = new Map<string, number>();
    for (const token of docTokens) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }

    let score = 0;
    for (const queryToken of queryTokens) {
      const freq = docFreq.get(queryToken) || 0;
      if (freq === 0) continue;

      const idf = Math.log(1 + 1);  // 简化 IDF
      const numerator = freq * (k1 + 1);
      const denominator = freq + k1 * (1 - b + b * (docLength / avgDocLength));

      score += idf * (numerator / denominator);
    }

    return score;
  }

  /**
   * 基于关键词快速匹配
   */
  private static keywordMatch(query: string, content: string): number {
    const queryTokens = new Set(this.tokenize(query));
    const contentTokens = this.tokenize(content);

    let matchCount = 0;
    for (const token of contentTokens) {
      if (queryTokens.has(token)) {
        matchCount++;
      }
    }

    return queryTokens.size > 0 ? matchCount / queryTokens.size : 0;
  }

  /**
   * 过滤相关的历史消息
   *
   * @param messages - 历史消息列表
   * @param query - 当前查询
   * @param maxMessages - 最大保留消息数
   * @returns 过滤后的消息列表
   */
  static filterRelevant(
    messages: ContextMessage[],
    query: string,
    maxMessages: number = 20
  ): ContextMessage[] {
    if (messages.length === 0) {
      return [];
    }

    // 快速路径：消息数量不多，直接返回最近的
    if (messages.length <= maxMessages) {
      return [...messages];
    }

    const queryTokens = this.tokenize(query);

    // 计算平均文档长度
    const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
    const avgLength = totalLength / messages.length;

    // 计算相关性分数
    const scores: RelevanceScore[] = messages.map(msg => {
      const msgTokens = this.tokenize(msg.content);

      // 组合分数：BM25 + 关键词匹配
      const bm25Score = this.calculateBM25(
        queryTokens,
        msgTokens,
        avgLength,
        this.DEFAULT_OPTIONS
      );

      const keywordScore = this.keywordMatch(query, msg.content);

      // 加权组合（BM25 60%，关键词 40%）
      const combinedScore = bm25Score * 0.6 + keywordScore * 0.4;

      return {
        message: msg,
        score: combinedScore,
      };
    });

    // 按分数排序，取前 maxMessages 条
    scores.sort((a, b) => b.score - a.score);

    // 保持时间顺序（返回原始消息，按时间戳排序）
    const selected = scores
      .slice(0, maxMessages)
      .map(s => s.message)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    logger.debug(
      `[ContextFilter] 查询: "${query.substring(0, 30)}..." | ` +
      `原始: ${messages.length} 条 | 过滤后: ${selected.length} 条`
    );

    return selected;
  }

  /**
   * 获取消息摘要（用于调试）
   */
  static getMessagesSummary(messages: ContextMessage[]): string {
    if (messages.length === 0) {
      return '(无消息)';
    }

    return messages
      .map(m => `[${m.role}] ${m.content.substring(0, 50)}...`)
      .join('\n');
  }
}

export default ContextFilter;
