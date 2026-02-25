/**
 * 上下文压缩器
 *
 * 减少传递给 LLM 的 token 数量，同时保留关键信息。
 *
 * 策略:
 * 1. 移除重复内容
 * 2. 摘要旧消息
 * 3. 保留最近 N 条完整消息
 * 4. 提取关键信息（代码、文件路径、结果）
 *
 * @example
 * ```typescript
 * const messages = [
 *   { role: 'user', content: '帮我写一个函数' },
 *   { role: 'assistant', content: '好的，这是代码...' },
 *   // ... 更多消息
 * ];
 *
 * const compressed = ContextCompressor.compress(messages, 8000);
 * console.log(`压缩前: ${messages.length} 条, 压缩后: ${compressed.length} 条`);
 * ```
 */

import { logger } from '../utils/logger.js';

/**
 * 消息角色类型
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * 消息接口
 */
export interface Message {
  /** 角色 */
  role: MessageRole;
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp?: Date;
  /** 工具调用 ID（用于 tool 角色消息） */
  toolCallId?: string;
  /** 工具名称（用于 tool 角色消息） */
  toolName?: string;
}

/**
 * 压缩配置
 */
export interface CompressionOptions {
  /** 最大 token 数量（估计），默认 8000 */
  maxTokens?: number;
  /** 最近消息占比 (0-1)，默认 0.5 */
  recentRatio?: number;
  /** 摘要批次大小，默认 10 */
  summaryBatchSize?: number;
  /** 是否保留代码块，默认 true */
  preserveCodeBlocks?: boolean;
  /** 是否保留文件路径，默认 true */
  preserveFilePaths?: boolean;
}

/**
 * 压缩统计
 */
export interface CompressionStats {
  originalCount: number;
  compressedCount: number;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
}

/**
 * 上下文压缩器
 */
export class ContextCompressor {
  private static readonly DEFAULT_MAX_TOKENS = 8000;
  private static readonly DEFAULT_RECENT_RATIO = 0.5;
  private static readonly DEFAULT_BATCH_SIZE = 10;

  /**
   * 压缩上下文
   *
   * @param messages - 原始消息列表
   * @param options - 压缩配置
   * @returns 压缩后的消息列表和统计信息
   */
  static compress(
    messages: Message[],
    options: CompressionOptions = {}
  ): { messages: Message[]; stats: CompressionStats } {
    const {
      maxTokens = this.DEFAULT_MAX_TOKENS,
      recentRatio = this.DEFAULT_RECENT_RATIO,
      summaryBatchSize = this.DEFAULT_BATCH_SIZE,
      preserveCodeBlocks = true,
      preserveFilePaths = true,
    } = options;

    if (messages.length === 0) {
      return {
        messages: [],
        stats: {
          originalCount: 0,
          compressedCount: 0,
          originalTokens: 0,
          compressedTokens: 0,
          compressionRatio: 0,
        },
      };
    }

    const originalTokens = this.estimateTotalTokens(messages);

    logger.debug(`[ContextCompressor] 开始压缩: ${messages.length} 条消息, ~${originalTokens} tokens`);

    // 1. 保留最近的完整消息（按预算比例）
    const recentBudget = Math.floor(maxTokens * recentRatio);
    const recent = this.extractRecentMessages(messages, recentBudget);

    // 2. 压缩旧消息
    const oldMessages = messages.slice(0, messages.length - recent.length);
    const compressed = this.compressOldMessages(oldMessages, {
      batchSize: summaryBatchSize,
      preserveCodeBlocks,
      preserveFilePaths,
    });

    // 3. 合并结果
    const result = [...compressed, ...recent];
    const compressedTokens = this.estimateTotalTokens(result);

    const stats: CompressionStats = {
      originalCount: messages.length,
      compressedCount: result.length,
      originalTokens,
      compressedTokens,
      compressionRatio: originalTokens > 0 ? compressedTokens / originalTokens : 1,
    };

    logger.debug(
      `[ContextCompressor] 压缩完成: ${stats.originalCount} -> ${stats.compressedCount} 条消息, ` +
      `${stats.originalTokens} -> ${stats.compressedTokens} tokens, ` +
      `压缩率: ${(stats.compressionRatio * 100).toFixed(1)}%`
    );

    return { messages: result, stats };
  }

  /**
   * 提取最近的消息（按 token 预算）
   */
  private static extractRecentMessages(
    messages: Message[],
    maxTokens: number
  ): Message[] {
    const recent: Message[] = [];
    let usedTokens = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const tokens = this.estimateTokens(msg.content);

      if (usedTokens + tokens > maxTokens) {
        break;
      }

      recent.unshift(msg);
      usedTokens += tokens;
    }

    return recent;
  }

  /**
   * 压缩旧消息（摘要）
   */
  private static compressOldMessages(
    messages: Message[],
    options: {
      batchSize: number;
      preserveCodeBlocks: boolean;
      preserveFilePaths: boolean;
    }
  ): Message[] {
    const { batchSize, preserveCodeBlocks, preserveFilePaths } = options;
    const result: Message[] = [];

    // 按批次处理
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const summary = this.summarizeBatch(batch, {
        preserveCodeBlocks,
        preserveFilePaths,
      });

      if (summary) {
        result.push({
          role: 'system',
          content: `[历史对话 ${Math.floor(i / batchSize) + 1}] ${summary}`,
        });
      }
    }

    return result;
  }

  /**
   * 摘要一批消息
   */
  private static summarizeBatch(
    messages: Message[],
    options: {
      preserveCodeBlocks: boolean;
      preserveFilePaths: boolean;
    }
  ): string {
    const { preserveCodeBlocks, preserveFilePaths } = options;
    const keyPoints: string[] = [];

    // 提取用户消息的关键词
    for (const msg of messages) {
      if (msg.role === 'user') {
        // 提取用户意图的关键词
        const keywords = this.extractKeywords(msg.content, 5);
        if (keywords.length > 0) {
          keyPoints.push(`用户: ${keywords.join(', ')}`);
        }
      } else if (msg.role === 'assistant') {
        // 提取助手回复的关键信息
        const keyInfo = this.extractKeyInfo(msg.content, {
          preserveCodeBlocks,
          preserveFilePaths,
        });
        if (keyInfo) {
          keyPoints.push(keyInfo);
        }
      }
    }

    return keyPoints.length > 0 ? keyPoints.join('; ') : '(无重要信息)';
  }

  /**
   * 提取关键词
   */
  private static extractKeywords(text: string, maxCount: number): string[] {
    // 移除标点和特殊字符
    const cleanText = text.replace(/[^\w\s\u4e00-\u9fa5]/g, ' ');

    // 分词（中文按字符，英文按单词）
    const words = cleanText
      .split(/\s+/)
      .filter(w => w.length > 1)
      .filter(w => !['the', 'is', 'at', 'which', 'on', 'in', 'and', 'or'].includes(w.toLowerCase()));

    // 去重并限制数量
    return Array.from(new Set(words)).slice(0, maxCount);
  }

  /**
   * 提取关键信息
   */
  private static extractKeyInfo(
    content: string,
    options: {
      preserveCodeBlocks: boolean;
      preserveFilePaths: boolean;
    }
  ): string | null {
    const { preserveCodeBlocks, preserveFilePaths } = options;
    const infos: string[] = [];

    // 1. 提取代码块
    if (preserveCodeBlocks) {
      const codeBlocks = content.match(/```[\s\S]*?```/g);
      if (codeBlocks && codeBlocks.length > 0) {
        infos.push(`[代码] ${codeBlocks.length} 个块`);
      }
    }

    // 2. 提取文件路径
    if (preserveFilePaths) {
      const filePaths = content.match(/[\w-]+\.[\w]+/g);
      if (filePaths && filePaths.length > 0) {
        const uniquePaths = Array.from(new Set(filePaths)).slice(0, 3);
        infos.push(`[文件] ${uniquePaths.join(', ')}`);
      }
    }

    // 3. 提取成功/完成标记
    if (content.includes('✅') || content.includes('完成') || content.includes('成功')) {
      infos.push('[完成]');
    }

    // 4. 提取错误信息
    if (content.includes('❌') || content.includes('错误') || content.includes('失败')) {
      const errorLines = content.split('\n').filter(l =>
        l.includes('错误') || l.includes('Error')
      );
      if (errorLines.length > 0) {
        infos.push(`[错误] ${errorLines[0].substring(0, 30)}...`);
      }
    }

    return infos.length > 0 ? infos.join(' ') : null;
  }

  /**
   * 估算文本的 token 数量
   *
   * 粗略估计: 中文字符 1 char = 1 token, 英文 4 chars = 1 token
   */
  static estimateTokens(text: string): number {
    // 统计中文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 统计非中文字符
    const otherChars = text.length - chineseChars;

    // 中文: 1 char = 1 token
    // 其他: 4 chars = 1 token
    return chineseChars + Math.ceil(otherChars / 4);
  }

  /**
   * 估算消息列表的总 token 数量
   */
  static estimateTotalTokens(messages: Message[]): number {
    return messages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
  }

  /**
   * 智能截断内容
   *
   * 按句子边界截断，避免截断语义
   */
  static truncate(content: string, maxTokens: number): string {
    const tokens = this.estimateTokens(content);

    if (tokens <= maxTokens) {
      return content;
    }

    // 按句子分割
    const sentences = content.split(/([。！？.!?\n])/);
    let result = '';
    let currentTokens = 0;

    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = sentences[i] + (sentences[i + 1] || '');
      const sentenceTokens = this.estimateTokens(sentence);

      if (currentTokens + sentenceTokens > maxTokens) {
        break;
      }

      result += sentence;
      currentTokens += sentenceTokens;
    }

    if (result.length < content.length) {
      result += '... (已截断)';
    }

    return result;
  }

  /**
   * 去重消息（移除重复内容）
   */
  static deduplicate(messages: Message[]): Message[] {
    const seen = new Set<string>();
    const result: Message[] = [];

    for (const msg of messages) {
      // 使用内容哈希去重
      const hash = this.simpleHash(msg.content);

      if (!seen.has(hash)) {
        seen.add(hash);
        result.push(msg);
      }
    }

    const removed = messages.length - result.length;
    if (removed > 0) {
      logger.debug(`[ContextCompressor] 去重: 移除 ${removed} 条重复消息`);
    }

    return result;
  }

  /**
   * 简单哈希函数
   */
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * 压缩单个消息的内容
   */
  static compressMessage(content: string, maxTokens: number): string {
    return this.truncate(content, maxTokens);
  }

  /**
   * 格式化统计信息
   */
  static formatStats(stats: CompressionStats): string {
    return [
      `消息数量: ${stats.originalCount} -> ${stats.compressedCount}`,
      `Token 数量: ${stats.originalTokens} -> ${stats.compressedTokens}`,
      `压缩率: ${(stats.compressionRatio * 100).toFixed(1)}%`,
    ].join('\n');
  }
}

export default ContextCompressor;
