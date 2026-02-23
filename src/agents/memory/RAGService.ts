/**
 * RAGService - 检索增强生成服务
 *
 * 负责从记忆中检索相关内容，为 LLM 提供上下文
 */

import { MemoryService, MemoryType, MemoryEntry } from './MemoryService.js';
import { logger } from '../../utils/logger.js';

/**
 * 检索结果
 */
export interface RetrievalResult {
  /** 记忆条目 */
  memory: MemoryEntry;
  /** 相关性评分 (0-1) */
  score: number;
}

/**
 * RAG 检索选项
 */
export interface RAGRetrieveOptions {
  /** 用户 ID */
  userId?: string;
  /** 群组 ID */
  groupId?: string;
  /** 最大结果数 */
  maxResults?: number;
  /** 最小相关性阈值 */
  minScore?: number;
  /** 包含的记忆类型 */
  includeTypes?: MemoryType[];
}

/**
 * 增强的上下文
 */
export interface AugmentedContext {
  /** 检索到的记忆 */
  memories: RetrievalResult[];
  /** 格式化的上下文文本 */
  formattedContext: string;
  /** 摘要 */
  summary: string;
}

/**
 * RAG 服务配置
 */
export interface RAGServiceOptions {
  /** 记忆服务 */
  memoryService: MemoryService;
  /** 默认最大结果数 */
  defaultMaxResults?: number;
  /** 默认最小相关性 */
  defaultMinScore?: number;
}

/**
 * RAG 服务
 */
export class RAGService {
  private memoryService: MemoryService;
  private defaultMaxResults: number;
  private defaultMinScore: number;

  constructor(options: RAGServiceOptions) {
    this.memoryService = options.memoryService;
    this.defaultMaxResults = options.defaultMaxResults || 10;
    this.defaultMinScore = options.defaultMinScore || 0.3;

    logger.info('[RAGService] 初始化完成');
  }

  /**
   * 检索相关记忆
   */
  async retrieveMemories(
    query: string,
    options: RAGRetrieveOptions = {}
  ): Promise<RetrievalResult[]> {
    const {
      userId,
      groupId,
      maxResults = this.defaultMaxResults,
      minScore = this.defaultMinScore,
      includeTypes = [MemoryType.MESSAGE, MemoryType.CONTEXT, MemoryType.KNOWLEDGE],
    } = options;

    logger.debug(`[RAGService] 检索记忆: "${query.substring(0, 50)}..."`);

    // 获取候选记忆
    const candidates = this.memoryService.retrieveMemories({
      userId,
      groupId,
      types: includeTypes,
      limit: maxResults * 3, // 获取更多候选，然后排序
    });

    if (candidates.length === 0) {
      logger.debug('[RAGService] 没有找到候选记忆');
      return [];
    }

    // 计算相关性评分
    const scored = candidates.map(memory => ({
      memory,
      score: this.calculateRelevance(query, memory),
    }));

    // 过滤低于阈值的
    const filtered = scored.filter(r => r.score >= minScore);

    // 按评分排序
    filtered.sort((a, b) => b.score - a.score);

    // 限制结果数量
    const results = filtered.slice(0, maxResults);

    logger.debug(`[RAGService] 检索到 ${results.length} 条相关记忆`);
    return results;
  }

  /**
   * 获取对话历史上下文
   */
  getConversationContext(
    userId: string,
    groupId: string | undefined,
    limit: number = 20
  ): string {
    const memories = this.memoryService.getConversationHistory(
      userId,
      groupId,
      limit
    );

    if (memories.length === 0) {
      return '(无历史对话)';
    }

    const lines: string[] = ['## 历史对话摘要\n'];

    for (const m of memories) {
      const time = this.formatTime(m.createdAt);
      lines.push(`[${time}] ${m.content}`);
    }

    return lines.join('\n');
  }

  /**
   * 获取用户偏好上下文
   */
  getPreferencesContext(
    userId: string,
    groupId?: string
  ): string {
    const preferences = this.memoryService.getPreferences(userId, groupId);

    if (preferences.size === 0) {
      return '';
    }

    const lines: string[] = ['## 用户偏好\n'];

    for (const [key, value] of preferences.entries()) {
      lines.push(`- ${key}: ${value}`);
    }

    return lines.join('\n');
  }

  /**
   * 构建增强的上下文
   */
  async buildAugmentedContext(
    query: string,
    options: RAGRetrieveOptions = {}
  ): Promise<AugmentedContext> {
    // 检索相关记忆
    const memories = await this.retrieveMemories(query, options);

    // 获取对话历史
    const conversationContext = options.userId
      ? this.getConversationContext(options.userId, options.groupId, 10)
      : '';

    // 获取用户偏好
    const preferencesContext = options.userId
      ? this.getPreferencesContext(options.userId, options.groupId)
      : '';

    // 格式化上下文
    const parts: string[] = [];

    if (memories.length > 0) {
      parts.push('## 相关记忆\n');
      for (const { memory, score } of memories) {
        const time = this.formatTime(memory.createdAt);
        parts.push(`[${time}] (相关性: ${(score * 100).toFixed(0)}%) ${memory.content}`);
      }
    }

    if (conversationContext && conversationContext !== '(无历史对话)') {
      parts.push('\n' + conversationContext);
    }

    if (preferencesContext) {
      parts.push('\n' + preferencesContext);
    }

    const formattedContext = parts.join('\n');

    // 生成摘要
    const summary = this.generateSummary(memories, {
      conversationCount: conversationContext.split('\n').length - 1,
      preferencesCount: preferencesContext.split('\n').length - 1,
    });

    return {
      memories,
      formattedContext,
      summary,
    };
  }

  /**
   * 计算查询与记忆的相关性
   */
  private calculateRelevance(query: string, memory: MemoryEntry): number {
    const lowerQuery = query.toLowerCase();
    const lowerContent = memory.content.toLowerCase();

    let score = 0;

    // 1. 精确匹配
    if (lowerContent.includes(lowerQuery)) {
      score += 0.5;
    }

    // 2. 关键词匹配
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 1);
    const contentWords = lowerContent.split(/\s+/);
    const matchedWords = queryWords.filter(w => contentWords.includes(w));
    if (queryWords.length > 0) {
      score += (matchedWords.length / queryWords.length) * 0.3;
    }

    // 3. 标签匹配
    if (memory.metadata.tags) {
      const matchedTags = memory.metadata.tags.filter(t =>
        lowerQuery.includes(t.toLowerCase()) || t.toLowerCase().includes(lowerQuery)
      );
      score += matchedTags.length * 0.1;
    }

    // 4. 时间衰减（最近的记忆更相关）
    const age = Date.now() - memory.createdAt.getTime();
    const daysSinceCreation = age / (24 * 60 * 60 * 1000);
    const timeDecay = Math.exp(-daysSinceCreation / 30); // 30 天半衰期
    score *= timeDecay;

    // 5. 重要性加权
    if (memory.metadata.importance) {
      score *= memory.metadata.importance;
    }

    // 6. 访问频率加权（常访问的记忆更相关）
    const accessBoost = Math.min(memory.accessCount * 0.05, 0.5);
    score += accessBoost;

    return Math.min(score, 1);
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    memories: RetrievalResult[],
    stats: {
      conversationCount: number;
      preferencesCount: number;
    }
  ): string {
    const parts: string[] = [];

    if (memories.length > 0) {
      const avgScore = memories.reduce((sum, m) => sum + m.score, 0) / memories.length;
      parts.push(`${memories.length} 条相关记忆 (平均相关性: ${(avgScore * 100).toFixed(0)}%)`);
    }

    if (stats.conversationCount > 0) {
      parts.push(`${stats.conversationCount} 条历史对话`);
    }

    if (stats.preferencesCount > 0) {
      parts.push(`${stats.preferencesCount} 条偏好设置`);
    }

    return parts.join(', ') || '无相关上下文';
  }

  /**
   * 格式化时间
   */
  private formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;

    return date.toLocaleDateString('zh-CN');
  }

  /**
   * 为 LLM 构建系统提示词上下文
   */
  async buildSystemContext(
    userId: string,
    groupId: string | undefined,
    recentQuery?: string
  ): Promise<string> {
    const context: string[] = [];

    // 获取用户偏好
    const preferences = this.memoryService.getPreferences(userId, groupId);
    if (preferences.size > 0) {
      context.push('### 用户偏好\n');
      for (const [key, value] of preferences.entries()) {
        context.push(`- ${key}: ${value}`);
      }
      context.push('');
    }

    // 如果有最近的查询，获取相关记忆
    if (recentQuery) {
      const augmented = await this.buildAugmentedContext(recentQuery, {
        userId,
        groupId,
        maxResults: 5,
      });

      if (augmented.memories.length > 0) {
        context.push('### 相关历史记忆\n');
        for (const { memory, score } of augmented.memories) {
          context.push(`- ${(score * 100).toFixed(0)}%: ${memory.content.substring(0, 100)}`);
        }
        context.push('');
      }
    }

    return context.join('\n');
  }
}

export default RAGService;
