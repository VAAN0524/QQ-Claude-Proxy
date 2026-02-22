/**
 * SharedContext - Agent 间共享上下文
 *
 * 用于在主协调 Agent 和子 Agent 之间共享：
 * - 对话历史
 * - 工作状态（子 Agent 的执行结果）
 * - 文件引用
 */

import { logger } from '../utils/logger.js';

/**
 * 对话消息
 */
export interface ContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentId?: string; // 哪个 agent 产生的消息
}

/**
 * 工作状态
 */
export interface WorkState {
  agentId: string;
  result: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * 共享上下文配置
 */
export interface SharedContextOptions {
  /** 最大保留消息数 */
  maxMessages?: number;
  /** 消息最大保留时间（毫秒） */
  maxAge?: number;
}

/**
 * Agent 间共享上下文
 */
export class SharedContext {
  private conversationHistory: ContextMessage[] = [];
  private workState: Map<string, WorkState> = new Map();
  private fileReferences: string[] = [];

  private maxMessages: number;
  private maxAge: number;

  constructor(options: SharedContextOptions = {}) {
    this.maxMessages = options.maxMessages || 100;
    this.maxAge = options.maxAge || 60 * 60 * 1000; // 默认 1 小时
    logger.info('[SharedContext] 初始化完成');
  }

  /**
   * 添加对话消息
   */
  addConversation(role: 'user' | 'assistant' | 'system', content: string, agentId?: string): void {
    const message: ContextMessage = {
      role,
      content,
      timestamp: new Date(),
      agentId,
    };

    this.conversationHistory.push(message);
    this.pruneOldMessages();

    logger.debug(`[SharedContext] 添加消息: ${role} (${agentId || 'system'}): ${content.substring(0, 50)}...`);
  }

  /**
   * 获取对话历史（格式化为 Anthropic API 格式）
   */
  getAnthropicMessages(): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    for (const msg of this.conversationHistory) {
      if (msg.role === 'system') continue; // Anthropic API 不接受 system 在 messages 数组中

      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    return messages;
  }

  /**
   * 获取完整的对话历史（包括 system）
   */
  getAllMessages(): ContextMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * 获取格式化的对话历史（文本格式）
   */
  getFormattedHistory(): string {
    if (this.conversationHistory.length === 0) {
      return '(无对话历史)';
    }

    const lines: string[] = [];
    for (const msg of this.conversationHistory) {
      const agentInfo = msg.agentId ? ` [${msg.agentId}]` : '';
      lines.push(`${msg.role}${agentInfo}: ${msg.content}`);
    }

    return lines.join('\n');
  }

  /**
   * 保存工作状态
   */
  setWorkState(agentId: string, result: string, metadata?: Record<string, unknown>): void {
    const state: WorkState = {
      agentId,
      result,
      timestamp: new Date(),
      metadata,
    };

    this.workState.set(agentId, state);
    logger.debug(`[SharedContext] 保存工作状态: ${agentId}`);
  }

  /**
   * 获取工作状态
   */
  getWorkState(agentId: string): WorkState | undefined {
    return this.workState.get(agentId);
  }

  /**
   * 获取所有工作状态
   */
  getAllWorkStates(): Map<string, WorkState> {
    return new Map(this.workState);
  }

  /**
   * 添加文件引用
   */
  addFileReference(filePath: string): void {
    if (!this.fileReferences.includes(filePath)) {
      this.fileReferences.push(filePath);
      logger.debug(`[SharedContext] 添加文件引用: ${filePath}`);
    }
  }

  /**
   * 获取文件引用列表
   */
  getFileReferences(): string[] {
    return [...this.fileReferences];
  }

  /**
   * 清空文件引用
   */
  clearFileReferences(): void {
    this.fileReferences = [];
    logger.debug('[SharedContext] 清空文件引用');
  }

  /**
   * 清空对话历史
   */
  clearHistory(): void {
    this.conversationHistory = [];
    logger.info('[SharedContext] 清空对话历史');
  }

  /**
   * 清空工作状态
   */
  clearWorkStates(): void {
    this.workState.clear();
    logger.info('[SharedContext] 清空工作状态');
  }

  /**
   * 清空所有上下文
   */
  clearAll(): void {
    this.clearHistory();
    this.clearWorkStates();
    this.clearFileReferences();
  }

  /**
   * 获取上下文统计信息
   */
  getStats(): {
    messageCount: number;
    workStateCount: number;
    fileReferenceCount: number;
  } {
    return {
      messageCount: this.conversationHistory.length,
      workStateCount: this.workState.size,
      fileReferenceCount: this.fileReferences.length,
    };
  }

  /**
   * 清理过期消息
   */
  private pruneOldMessages(): void {
    const now = Date.now();

    // 移除过期的消息
    this.conversationHistory = this.conversationHistory.filter(
      msg => now - msg.timestamp.getTime() < this.maxAge
    );

    // 如果消息数量超过限制，移除最旧的消息
    while (this.conversationHistory.length > this.maxMessages) {
      this.conversationHistory.shift();
    }
  }

  /**
   * 清理过期的工作状态
   */
  pruneOldWorkStates(maxAge: number = this.maxAge): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [agentId, state] of this.workState.entries()) {
      if (now - state.timestamp.getTime() > maxAge) {
        expiredKeys.push(agentId);
      }
    }

    for (const key of expiredKeys) {
      this.workState.delete(key);
      logger.debug(`[SharedContext] 清理过期工作状态: ${key}`);
    }
  }
}

export default SharedContext;
