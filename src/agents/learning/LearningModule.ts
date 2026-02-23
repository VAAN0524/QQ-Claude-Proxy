/**
 * LearningModule - Agent 自学习模块
 *
 * 让 Agent 具备：
 * - 识别知识缺口
 * - 自动搜索解决方案
 * - 从结果中学习
 * - 存储知识以供将来使用
 */

import { logger } from '../../utils/logger.js';
import { MemoryService, MemoryType } from '../memory/index.js';
import type { IAgent, AgentMessage, AgentContext } from '../base/Agent.js';

/**
 * 知识条目
 */
export interface KnowledgeEntry {
  /** 知识 ID */
  id: string;
  /** 问题/查询 */
  question: string;
  /** 答案/解决方案 */
  answer: string;
  /** 来源 */
  source: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 相关标签 */
  tags: string[];
  /** 学习时间 */
  learnedAt: Date;
  /** 使用次数 */
  useCount: number;
  /** 最后使用时间 */
  lastUsedAt: Date;
}

/**
 * 学习结果
 */
export interface LearningResult {
  /** 是否成功学习 */
  success: boolean;
  /** 学到的知识 */
  knowledge?: KnowledgeEntry;
  /** 使用的搜索查询 */
  searchQuery?: string;
  /** 找到的信息摘要 */
  summary?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 学习模块配置
 */
export interface LearningModuleOptions {
  /** 记忆服务 */
  memoryService: MemoryService;
  /** Web 搜索 Agent（可选） */
  webSearchAgent?: IAgent;
  /** 最大学习结果数 */
  maxResults?: number;
  /** 知识保留时间（毫秒） */
  knowledgeRetentionTime?: number;
}

/**
 * 学习模块
 */
export class LearningModule {
  private memoryService: MemoryService;
  private webSearchAgent?: IAgent;
  private maxResults: number;
  private knowledgeCache: Map<string, KnowledgeEntry[]> = new Map();
  private knowledgeRetentionTime: number;

  constructor(options: LearningModuleOptions) {
    this.memoryService = options.memoryService;
    this.webSearchAgent = options.webSearchAgent;
    this.maxResults = options.maxResults || 5;
    this.knowledgeRetentionTime = options.knowledgeRetentionTime || 90 * 24 * 60 * 60 * 1000; // 90 天

    logger.info('[LearningModule] 自学习模块已初始化');
  }

  /**
   * 检查是否知道某个问题的答案
   */
  async knowsAbout(question: string, context?: { userId?: string; groupId?: string }): Promise<{
    known: boolean;
    knowledge?: KnowledgeEntry[];
    confidence: number;
  }> {
    // 从缓存中搜索
    const cached = this.searchKnowledgeCache(question);
    if (cached.length > 0) {
      const avgConfidence = cached.reduce((sum, k) => sum + k.confidence, 0) / cached.length;
      return {
        known: avgConfidence > 0.5,
        knowledge: cached,
        confidence: avgConfidence,
      };
    }

    // 从记忆中搜索
    const memories = this.memoryService.retrieveMemories({
      userId: context?.userId,
      groupId: context?.groupId,
      types: [MemoryType.KNOWLEDGE],
      limit: this.maxResults * 2,
    });

    const relevant: KnowledgeEntry[] = [];
    for (const memory of memories) {
      const entry = this.parseKnowledgeEntry(memory);
      if (entry && this.isRelevant(question, entry.question)) {
        relevant.push(entry);
      }
    }

    // 按相关性排序
    relevant.sort((a, b) => this.calculateRelevance(question, a) - this.calculateRelevance(question, b));

    if (relevant.length > 0) {
      // 缓存结果
      this.knowledgeCache.set(question.toLowerCase(), relevant.slice(0, this.maxResults));
    }

    const avgConfidence = relevant.length > 0
      ? relevant.reduce((sum, k) => sum + k.confidence, 0) / relevant.length
      : 0;

    return {
      known: relevant.length > 0 && avgConfidence > 0.5,
      knowledge: relevant.slice(0, this.maxResults),
      confidence: avgConfidence,
    };
  }

  /**
   * 学习新知识
   */
  async learn(
    question: string,
    context?: { userId?: string; groupId?: string }
  ): Promise<LearningResult> {
    logger.info(`[LearningModule] 开始学习: "${question.substring(0, 50)}..."`);

    try {
      // 如果有 Web 搜索 Agent，使用它来搜索
      if (this.webSearchAgent) {
        return await this.learnFromWebSearch(question, context);
      }

      // 否则，尝试从上下文中学习
      return {
        success: false,
        error: '没有可用的学习方式（需要 Web 搜索 Agent）',
      };
    } catch (error) {
      logger.error(`[LearningModule] 学习失败: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 直接存储知识
   */
  async storeKnowledge(
    question: string,
    answer: string,
    source: string,
    options: {
      confidence?: number;
      tags?: string[];
      userId?: string;
      groupId?: string;
    } = {}
  ): Promise<string> {
    const entry: KnowledgeEntry = {
      id: `knowledge_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      question,
      answer,
      source,
      confidence: options.confidence || 0.7,
      tags: options.tags || [],
      learnedAt: new Date(),
      useCount: 0,
      lastUsedAt: new Date(),
    };

    // 存储到记忆
    const content = JSON.stringify({
      question: entry.question,
      answer: entry.answer,
      source: entry.source,
      confidence: entry.confidence,
    });

    await this.memoryService.addMemory(MemoryType.KNOWLEDGE, content, {
      userId: options.userId,
      groupId: options.groupId,
      tags: ['knowledge', 'learning', ...options.tags!],
      importance: entry.confidence,
    });

    // 更新缓存
    const cacheKey = question.toLowerCase();
    if (!this.knowledgeCache.has(cacheKey)) {
      this.knowledgeCache.set(cacheKey, []);
    }
    this.knowledgeCache.get(cacheKey)!.push(entry);

    logger.info(`[LearningModule] 存储知识: ${entry.id}`);
    return entry.id;
  }

  /**
   * 从 Web 搜索学习
   */
  private async learnFromWebSearch(
    question: string,
    context?: { userId?: string; groupId?: string }
  ): Promise<LearningResult> {
    if (!this.webSearchAgent) {
      return {
        success: false,
        error: 'Web 搜索 Agent 不可用',
      };
    }

    // 构建搜索查询
    const searchQuery = this.buildSearchQuery(question);

    // 执行搜索
    const searchMessage: AgentMessage = {
      channel: 'learning',
      userId: context?.userId || 'learning',
      content: searchQuery,
      timestamp: new Date(),
    };

    const searchContext: AgentContext = {
      workspacePath: process.cwd(),
      storagePath: process.cwd(),
      allowedUsers: [], // 学习模式下不需要用户限制
    };

    const response = await this.webSearchAgent.process(searchMessage, searchContext);

    // 提取有用信息
    const summary = this.extractSummary(response.content);

    if (summary) {
      // 存储学到的知识
      const knowledgeId = await this.storeKnowledge(
        question,
        summary,
        'web_search',
        {
          confidence: 0.6,
          tags: ['web-search', 'auto-learned'],
          userId: context?.userId,
          groupId: context?.groupId,
        }
      );

      const entry: KnowledgeEntry = {
        id: knowledgeId,
        question,
        answer: summary,
        source: 'web_search',
        confidence: 0.6,
        tags: ['web-search', 'auto-learned'],
        learnedAt: new Date(),
        useCount: 0,
        lastUsedAt: new Date(),
      };

      return {
        success: true,
        knowledge: entry,
        searchQuery,
        summary,
      };
    }

    return {
      success: false,
      error: '无法从搜索结果中提取有用信息',
    };
  }

  /**
   * 获取知识
   */
  getKnowledge(question: string): KnowledgeEntry[] {
    const cacheKey = question.toLowerCase();
    return this.knowledgeCache.get(cacheKey) || [];
  }

  /**
   * 标记知识已使用
   */
  markUsed(entryId: string): void {
    for (const entries of this.knowledgeCache.values()) {
      const entry = entries.find(e => e.id === entryId);
      if (entry) {
        entry.useCount++;
        entry.lastUsedAt = new Date();
        // 提高置信度（基于使用频率）
        entry.confidence = Math.min(0.95, entry.confidence + 0.05);
      }
    }
  }

  /**
   * 构建搜索查询
   */
  private buildSearchQuery(question: string): string {
    // 移除常见的口语化表达
    const cleaned = question
      .replace(/^(怎么|如何|怎样|what|how|why)/gi, '')
      .replace(/[？?!]+/g, '')
      .trim();

    return `搜索: ${cleaned} 解决方案 方法 教程`;
  }

  /**
   * 从搜索结果中提取摘要
   */
  private extractSummary(searchResult: string): string {
    // 简单提取：取前 500 个字符作为摘要
    const cleaned = searchResult
      .replace(/\\[.*?\\]/g, '') // 移除引用标记
      .replace(/\n+/g, ' ') // 合并换行
      .trim();

    if (cleaned.length <= 500) {
      return cleaned;
    }

    return cleaned.substring(0, 497) + '...';
  }

  /**
   * 搜索知识缓存
   */
  private searchKnowledgeCache(question: string): KnowledgeEntry[] {
    const lowerQuestion = question.toLowerCase();
    const results: KnowledgeEntry[] = [];

    for (const [key, entries] of this.knowledgeCache.entries()) {
      if (lowerQuestion.includes(key) || key.includes(lowerQuestion)) {
        results.push(...entries);
      }
    }

    return results;
  }

  /**
   * 判断问题是否相关
   */
  private isRelevant(question: string, storedQuestion: string): boolean {
    const lowerQ = question.toLowerCase();
    const lowerStored = storedQuestion.toLowerCase();

    // 精确匹配
    if (lowerQ === lowerStored) return true;

    // 包含匹配
    if (lowerQ.includes(lowerStored) || lowerStored.includes(lowerQ)) return true;

    // 关键词匹配
    const qWords = new Set(lowerQ.split(/\s+/));
    const storedWords = new Set(lowerStored.split(/\s+/));
    const intersection = [...qWords].filter(w => storedWords.has(w));

    return intersection.length >= Math.min(qWords.size, storedWords.size) * 0.5;
  }

  /**
   * 计算相关性评分
   */
  private calculateRelevance(question: string, entry: KnowledgeEntry): number {
    const lowerQ = question.toLowerCase();
    const lowerStored = entry.question.toLowerCase();

    let score = 0;

    // 精确匹配
    if (lowerQ === lowerStored) score += 1.0;

    // 包含匹配
    if (lowerQ.includes(lowerStored)) score += 0.8;
    if (lowerStored.includes(lowerQ)) score += 0.6;

    // 置信度加权
    score *= entry.confidence;

    // 使用频率加权
    score += Math.min(entry.useCount * 0.1, 0.5);

    return Math.min(score, 1.0);
  }

  /**
   * 解析知识条目
   */
  private parseKnowledgeEntry(memory: { content: string }): KnowledgeEntry | null {
    try {
      const data = JSON.parse(memory.content);
      return {
        id: `knowledge_${Math.random().toString(36).substring(2, 11)}`,
        question: data.question || '',
        answer: data.answer || '',
        source: data.source || 'memory',
        confidence: data.confidence || 0.5,
        tags: [],
        learnedAt: new Date(),
        useCount: 0,
        lastUsedAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  /**
   * 清理过期知识
   */
  async cleanupExpiredKnowledge(): Promise<number> {
    let cleaned = 0;
    const cutoff = Date.now() - this.knowledgeRetentionTime;

    for (const [key, entries] of this.knowledgeCache.entries()) {
      const filtered = entries.filter(e => e.lastUsedAt.getTime() > cutoff);
      if (filtered.length < entries.length) {
        this.knowledgeCache.set(key, filtered);
        cleaned += entries.length - filtered.length;
      }
    }

    if (cleaned > 0) {
      logger.info(`[LearningModule] 清理了 ${cleaned} 条过期知识`);
    }

    return cleaned;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalKnowledge: number;
    cacheEntries: number;
    avgConfidence: number;
  } {
    let totalKnowledge = 0;
    let totalConfidence = 0;
    let count = 0;

    for (const entries of this.knowledgeCache.values()) {
      for (const entry of entries) {
        totalKnowledge++;
        totalConfidence += entry.confidence;
        count++;
      }
    }

    return {
      totalKnowledge,
      cacheEntries: this.knowledgeCache.size,
      avgConfidence: count > 0 ? totalConfidence / count : 0,
    };
  }
}

export default LearningModule;
