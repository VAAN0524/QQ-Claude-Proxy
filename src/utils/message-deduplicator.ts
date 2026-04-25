/**
 * 消息去重器
 * 防止重复消息发送到QQ
 */

import { logger } from './logger.js';

export interface MessageDeduplicatorOptions {
  /** 去重窗口时间（ms），默认 5000ms (5秒) */
  windowMs?: number;
}

/**
 * 消息去重器
 *
 * 功能：
 * 1. 记录最近发送的消息
 * 2. 在时间窗口内拒绝重复消息
 * 3. 自动清理过期记录
 */
export class MessageDeduplicator {
  private windowMs: number;
  private messageHistory: Map<string, number> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: MessageDeduplicatorOptions = {}) {
    this.windowMs = options.windowMs ?? 5000;

    // 每分钟清理一次过期记录
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60000);

    logger.info(`[MessageDeduplicator] 初始化完成: window=${this.windowMs}ms`);
  }

  /**
   * 检查消息是否重复
   * @param userId 用户ID
   * @param content 消息内容
   * @param groupId 群组ID（可选）
   * @returns true 表示重复，应该跳过；false 表示不重复，可以发送
   */
  isDuplicate(userId: string, content: string, groupId?: string): boolean {
    const key = this.getKey(userId, groupId);
    const contentHash = this.hashContent(content);
    const fullKey = `${key}:${contentHash}`;

    const now = Date.now();
    const lastSendTime = this.messageHistory.get(fullKey);

    if (lastSendTime && (now - lastSendTime < this.windowMs)) {
      logger.info(`[MessageDeduplicator] 检测到重复消息: userId=${userId}, groupId=${groupId || 'none'}, timeSinceLast=${now - lastSendTime}ms`);
      logger.debug(`[MessageDeduplicator] 重复内容: "${content.substring(0, 50)}..."`);
      return true;
    }

    // 记录这条消息
    this.messageHistory.set(fullKey, now);
    return false;
  }

  /**
   * 记录消息（用于手动标记已发送）
   */
  markSent(userId: string, content: string, groupId?: string): void {
    const key = this.getKey(userId, groupId);
    const contentHash = this.hashContent(content);
    const fullKey = `${key}:${contentHash}`;

    this.messageHistory.set(fullKey, Date.now());
  }

  /**
   * 生成用户键
   */
  private getKey(userId: string, groupId?: string): string {
    return groupId ? `group_${groupId}` : `user_${userId}`;
  }

  /**
   * 生成内容哈希（简单版本）
   */
  private hashContent(content: string): string {
    // 移除时间戳、进度等动态内容
    const normalized = content
      .replace(/\d+秒/g, 'X秒')
      .replace(/\d+分/g, 'X分')
      .replace(/\d+%/g, 'X%')
      .replace(/\[\d+\/\d+\]/g, '[X/Y]')
      .replace(/任务执行中\.\.\. \d+秒/g, '任务执行中...')
      .trim();

    // 简单哈希：取前100字符 + 长度
    const prefix = normalized.length > 100 ? normalized.substring(0, 100) : normalized;
    return `${prefix.substring(0, 50)}_${normalized.length}`;
  }

  /**
   * 清理过期记录
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, timestamp] of this.messageHistory.entries()) {
      if (now - timestamp > this.windowMs * 2) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.messageHistory.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug(`[MessageDeduplicator] 清理了 ${expiredKeys.length} 条过期记录`);
    }
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.messageHistory.clear();
    logger.info('[MessageDeduplicator] 已销毁');
  }

  /**
   * 获取统计信息
   */
  getStats(): { historySize: number; windowMs: number } {
    return {
      historySize: this.messageHistory.size,
      windowMs: this.windowMs,
    };
  }
}

// 全局单例
let globalDeduplicator: MessageDeduplicator | null = null;

/**
 * 获取全局去重器实例
 */
export function getGlobalDeduplicator(): MessageDeduplicator {
  if (!globalDeduplicator) {
    globalDeduplicator = new MessageDeduplicator();
  }
  return globalDeduplicator;
}

/**
 * 销毁全局去重器
 */
export function destroyGlobalDeduplicator(): void {
  if (globalDeduplicator) {
    globalDeduplicator.destroy();
    globalDeduplicator = null;
  }
}
