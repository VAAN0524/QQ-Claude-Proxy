/**
 * 文档分块器
 *
 * 借鉴自 OpenClaw 的 Chunk 策略:
 * - 目标大小: ~400 tokens (~1600 字符)
 * - 重叠大小: ~80 tokens (~320 字符)
 * - 保持句子边界完整
 *
 * @example
 * ```typescript
 * const chunks = DocumentChunker.chunk(memoryId, longContent);
 * // 返回: [{ id, parentId, content, startLine, endLine, tokenEstimate }, ...]
 * ```
 */

import { logger } from '../../utils/logger.js';

/**
 * 文档块
 */
export interface Chunk {
  /** 块 ID (自动生成: {parentId}_chunk{index}) */
  id: string;
  /** 父记忆条目 ID */
  parentId: string;
  /** 块内容 */
  content: string;
  /** 起始行号 */
  startLine: number;
  /** 结束行号 */
  endLine: number;
  /** 估计的 token 数量 */
  tokenEstimate: number;
  /** 块索引 */
  index: number;
}

/**
 * 分块配置
 */
export interface ChunkerOptions {
  /** 目标 token 数 (默认 400) */
  targetTokens?: number;
  /** 重叠 token 数 (默认 80) */
  overlapTokens?: number;
  /** 每个字符对应的 token 估计值 (默认 4) */
  charsPerToken?: number;
}

/**
 * 文档分块器类
 */
export class DocumentChunker {
  private static readonly DEFAULT_TARGET_TOKENS = 400;
  private static readonly DEFAULT_OVERLAP_TOKENS = 80;
  private static readonly DEFAULT_CHARS_PER_TOKEN = 4;

  /**
   * 分块文档
   *
   * @param parentId - 父记忆条目 ID
   * @param content - 文档内容
   * @param options - 分块配置
   * @returns 分块数组
   */
  static chunk(
    parentId: string,
    content: string,
    options: ChunkerOptions = {}
  ): Chunk[] {
    const {
      targetTokens = this.DEFAULT_TARGET_TOKENS,
      overlapTokens = this.DEFAULT_OVERLAP_TOKENS,
      charsPerToken = this.DEFAULT_CHARS_PER_TOKEN,
    } = options;

    const chunks: Chunk[] = [];
    const targetChars = targetTokens * charsPerToken;
    const overlapChars = overlapTokens * charsPerToken;

    // 空内容直接返回单个空块
    if (content.trim().length === 0) {
      return [{
        id: `${parentId}_chunk0`,
        parentId,
        content: '',
        startLine: 0,
        endLine: 0,
        tokenEstimate: 0,
        index: 0,
      }];
    }

    // 按句子分割
    const sentences = this.splitIntoSentences(content);

    let currentChunk = '';
    let chunkIndex = 0;
    let startLine = 0;
    let currentLine = 0;

    for (const sentence of sentences) {
      const sentenceLines = this.countLines(sentence);
      const wouldExceed = currentChunk.length + sentence.length > targetChars;

      if (wouldExceed && currentChunk.length > 0) {
        // 保存当前 chunk
        chunks.push({
          id: `${parentId}_chunk${chunkIndex}`,
          parentId,
          content: currentChunk.trim(),
          startLine,
          endLine: currentLine,
          tokenEstimate: Math.ceil(currentChunk.length / charsPerToken),
          index: chunkIndex,
        });

        // 开始新 chunk，保留重叠内容
        const overlapContent = this.getOverlapContent(currentChunk, overlapChars);
        const overlapLines = this.countLines(overlapContent);

        currentChunk = overlapContent + sentence;
        startLine = Math.max(0, currentLine - overlapLines);
        chunkIndex++;
      } else {
        if (currentChunk.length === 0) {
          startLine = currentLine;
        }
        currentChunk += sentence;
      }

      currentLine += sentenceLines;
    }

    // 保存最后一个 chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: `${parentId}_chunk${chunkIndex}`,
        parentId,
        content: currentChunk.trim(),
        startLine,
        endLine: currentLine,
        tokenEstimate: Math.ceil(currentChunk.length / charsPerToken),
        index: chunkIndex,
      });
    }

    logger.debug(`[DocumentChunker] 分块完成: ${chunks.length} 个块 (总计 ~${chunks.reduce((sum, c) => sum + c.tokenEstimate, 0)} tokens)`);

    return chunks;
  }

  /**
   * 按句子分割（支持中英文标点）
   *
   * 支持的句子分隔符: 。 ！ ？ . ! ? \n
   */
  private static splitIntoSentences(text: string): string[] {
    const sentences: string[] = [];

    // 按句子分隔符分割，保留分隔符
    const parts = text.split(/([。！？.!?\n])/);

    // 重新组合句子和分隔符
    for (let i = 0; i < parts.length - 1; i += 2) {
      const sentence = parts[i] || '';
      const delimiter = parts[i + 1] || '';

      const combined = (sentence + delimiter).trim();
      if (combined.length > 0) {
        sentences.push(combined);
      }
    }

    // 处理可能的剩余部分
    if (parts.length % 2 === 1) {
      const last = parts[parts.length - 1]?.trim();
      if (last && last.length > 0) {
        sentences.push(last);
      }
    }

    // 如果没有分割出句子，直接返回原文
    if (sentences.length === 0 && text.trim().length > 0) {
      return [text];
    }

    return sentences;
  }

  /**
   * 获取重叠内容（保留末尾 N 个字符）
   *
   * 尝试在句子边界处切割，避免截断句子
   */
  private static getOverlapContent(content: string, overlapChars: number): string {
    if (content.length <= overlapChars) {
      return content;
    }

    // 从末尾取 overlapChars 个字符
    const fromEnd = content.substring(content.length - overlapChars);

    // 尝试在句子边界处切割
    // 查找第一个句子分隔符（从前往后）
    const firstBoundary = fromEnd.search(/[。！？.!?\n]/);

    if (firstBoundary > 0) {
      // 从句子边界后开始
      return fromEnd.substring(firstBoundary + 1);
    }

    // 没有句子边界，直接返回
    return fromEnd;
  }

  /**
   * 计算行数
   */
  private static countLines(text: string): number {
    if (!text) return 0;
    const matches = text.match(/\n/g);
    return (matches ? matches.length : 0) + 1;
  }

  /**
   * 估计文本的 token 数量
   *
   * 粗略估计: 中文字符 1 char = 1 token, 英文 4 chars = 1 token
   */
  static estimateTokens(text: string, charsPerToken: number = 4): number {
    // 统计中文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 统计非中文字符
    const otherChars = text.length - chineseChars;

    // 中文: 1 char = 1 token
    // 其他: charsPerToken chars = 1 token
    return chineseChars + Math.ceil(otherChars / charsPerToken);
  }

  /**
   * 获取分块统计信息
   */
  static getChunkStats(chunks: Chunk[]): {
    totalChunks: number;
    totalTokens: number;
    avgTokensPerChunk: number;
    minTokens: number;
    maxTokens: number;
  } {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        totalTokens: 0,
        avgTokensPerChunk: 0,
        minTokens: 0,
        maxTokens: 0,
      };
    }

    const tokenCounts = chunks.map(c => c.tokenEstimate);
    const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);

    return {
      totalChunks: chunks.length,
      totalTokens,
      avgTokensPerChunk: Math.round(totalTokens / chunks.length),
      minTokens: Math.min(...tokenCounts),
      maxTokens: Math.max(...tokenCounts),
    };
  }
}

export default DocumentChunker;
