/**
 * 对话历史管理
 * 为每个用户/群组维护对话上下文
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationHistory {
  sessionId: string;  // userId 或 groupId
  messages: Message[];
  lastUpdated: number;
}

export class ConversationManager {
  private historyPath: string;
  private histories: Map<string, ConversationHistory> = new Map();
  private maxMessages: number;
  private maxAge: number;  // 毫秒

  constructor(
    historyPath: string,
    options: {
      maxMessages?: number;
      maxAgeHours?: number;
    } = {}
  ) {
    this.historyPath = historyPath;
    this.maxMessages = options.maxMessages ?? 50;
    this.maxAge = (options.maxAgeHours ?? 24) * 60 * 60 * 1000;

    // 确保目录存在
    if (!fs.existsSync(this.historyPath)) {
      fs.mkdirSync(this.historyPath, { recursive: true });
    }

    this.loadFromFile();
  }

  /**
   * 获取会话 ID (优先使用群组 ID，否则使用用户 ID)
   */
  getSessionId(userId: string, groupId?: string): string {
    return groupId ? `group_${groupId}` : `user_${userId}`;
  }

  /**
   * 获取对话历史
   */
  getHistory(userId: string, groupId?: string): Message[] {
    const sessionId = this.getSessionId(userId, groupId);
    const history = this.histories.get(sessionId);

    if (!history) {
      return [];
    }

    // 清理过期消息
    this.cleanupOldMessages(history);

    return history.messages;
  }

  /**
   * 获取最近的 N 条消息
   */
  getRecentMessages(userId: string, groupId: string | undefined, count: number): Message[] {
    const messages = this.getHistory(userId, groupId);
    return messages.slice(-count);
  }

  /**
   * 添加用户消息
   */
  addUserMessage(userId: string, groupId: string | undefined, content: string): void {
    const sessionId = this.getSessionId(userId, groupId);
    let history = this.histories.get(sessionId);

    if (!history) {
      history = {
        sessionId,
        messages: [],
        lastUpdated: Date.now(),
      };
      this.histories.set(sessionId, history);
    }

    history.messages.push({
      role: 'user',
      content,
      timestamp: Date.now(),
    });

    history.lastUpdated = Date.now();

    // 限制消息数量
    this.trimHistory(history);
  }

  /**
   * 添加助手消息
   */
  addAssistantMessage(userId: string, groupId: string | undefined, content: string): void {
    const sessionId = this.getSessionId(userId, groupId);
    let history = this.histories.get(sessionId);

    if (!history) {
      history = {
        sessionId,
        messages: [],
        lastUpdated: Date.now(),
      };
      this.histories.set(sessionId, history);
    }

    history.messages.push({
      role: 'assistant',
      content,
      timestamp: Date.now(),
    });

    history.lastUpdated = Date.now();

    // 限制消息数量
    this.trimHistory(history);
  }

  /**
   * 清理过期消息
   */
  private cleanupOldMessages(history: ConversationHistory): void {
    const now = Date.now();
    history.messages = history.messages.filter(
      msg => now - msg.timestamp < this.maxAge
    );
  }

  /**
   * 限制历史长度
   */
  private trimHistory(history: ConversationHistory): void {
    if (history.messages.length > this.maxMessages) {
      // 保留最近的消息
      history.messages = history.messages.slice(-this.maxMessages);
    }
  }

  /**
   * 清空某个会话的历史
   */
  clearHistory(userId: string, groupId?: string): void {
    const sessionId = this.getSessionId(userId, groupId);
    this.histories.delete(sessionId);
    this.saveToFile();
  }

  /**
   * 获取格式化的对话历史 (用于传递给 Claude)
   */
  getFormattedHistory(userId: string, groupId?: string): string {
    const messages = this.getHistory(userId, groupId);

    if (messages.length === 0) {
      return '';
    }

    const lines: string[] = ['以下是之前的对话上下文：\n'];

    for (const msg of messages) {
      const role = msg.role === 'user' ? '用户' : '助手';
      lines.push(`${role}: ${msg.content}`);
    }

    lines.push('\n请基于以上对话上下文，回应用户的最新消息。');
    lines.push('如果用户的新消息与之前的对话无关，你可以忽略上下文直接回答。\n');

    return lines.join('\n');
  }

  /**
   * 保存到文件
   */
  saveToFile(): void {
    const filePath = path.join(this.historyPath, 'conversations.json');

    try {
      const data = Array.from(this.histories.entries());
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      logger.error(`保存对话历史失败: ${error}`);
    }
  }

  /**
   * 从文件加载
   */
  private loadFromFile(): void {
    const filePath = path.join(this.historyPath, 'conversations.json');

    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as Array<[string, ConversationHistory]>;

        this.histories = new Map(data);

        // 清理过期消息
        for (const history of this.histories.values()) {
          this.cleanupOldMessages(history);
        }

        logger.info(`已加载 ${this.histories.size} 个会话的历史记录`);
      }
    } catch (error) {
      logger.error(`加载对话历史失败: ${error}`);
      this.histories = new Map();
    }
  }

  /**
   * 定期保存 (可由外部调用)
   */
  startAutoSave(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(() => {
      this.saveToFile();
      logger.debug('对话历史已自动保存');
    }, intervalMs);
  }

  /**
   * 获取统计信息
   */
  getStats(): { totalSessions: number; totalMessages: number } {
    let totalMessages = 0;

    for (const history of this.histories.values()) {
      totalMessages += history.messages.length;
    }

    return {
      totalSessions: this.histories.size,
      totalMessages,
    };
  }
}

export default ConversationManager;
