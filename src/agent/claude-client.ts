/**
 * Claude Client - Claude API 封装
 * 提供对话和流式响应功能
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ClaudeClientOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'thinking' | 'error';
  content?: string;
  toolName?: string;
  toolInput?: unknown;
}

/**
 * ClaudeClient 类
 * 封装 Anthropic Claude API，支持多轮对话和流式响应
 */
export class ClaudeClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private systemPrompt: string;
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  constructor(options: ClaudeClientOptions = {}) {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({ apiKey });
    this.model = options.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
    this.maxTokens = options.maxTokens || 4096;
    this.systemPrompt = options.systemPrompt || '';
  }

  /**
   * 设置系统提示词
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * 获取或创建会话历史
   */
  private getOrCreateSession(sessionId: string): ChatMessage[] {
    if (!this.conversationHistory.has(sessionId)) {
      this.conversationHistory.set(sessionId, []);
    }
    return this.conversationHistory.get(sessionId)!;
  }

  /**
   * 添加消息到会话历史
   */
  private addToHistory(sessionId: string, role: 'user' | 'assistant', content: string | ContentBlock[]): void {
    const history = this.getOrCreateSession(sessionId);
    history.push({ role, content });
  }

  /**
   * 转换历史消息为 API 格式
   */
  private formatHistoryForApi(history: ChatMessage[]): MessageParam[] {
    return history.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * 发送对话请求
   */
  async chat(
    message: string,
    options: {
      sessionId?: string;
      tools?: Anthropic.Tool[];
      attachments?: ContentBlock[];
    } = {}
  ): Promise<Message> {
    const { sessionId = 'default', tools, attachments } = options;
    const history = this.getOrCreateSession(sessionId);

    // 构建用户消息内容
    const userContent: ContentBlock[] = [];

    // 添加附件（如图片）
    if (attachments && attachments.length > 0) {
      userContent.push(...attachments);
    }

    // 添加文本消息（citations 是必需字段，传空数组）
    userContent.push({ type: 'text', text: message, citations: [] as never[] });

    // 添加用户消息到历史
    this.addToHistory(sessionId, 'user', userContent);

    const requestParams: Anthropic.Messages.MessageCreateParams = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: this.formatHistoryForApi(history),
    };

    if (this.systemPrompt) {
      requestParams.system = this.systemPrompt;
    }

    if (tools && tools.length > 0) {
      requestParams.tools = tools;
    }

    const response = await this.client.messages.create(requestParams);

    // 添加助手响应到历史
    this.addToHistory(sessionId, 'assistant', response.content);

    return response;
  }

  /**
   * 流式对话
   */
  async *streamChat(
    message: string,
    options: {
      sessionId?: string;
      tools?: Anthropic.Tool[];
      attachments?: ContentBlock[];
    } = {}
  ): AsyncGenerator<StreamChunk> {
    const { sessionId = 'default', tools, attachments } = options;
    const history = this.getOrCreateSession(sessionId);

    // 构建用户消息内容
    const userContent: ContentBlock[] = [];

    if (attachments && attachments.length > 0) {
      userContent.push(...attachments);
    }

    userContent.push({ type: 'text', text: message, citations: [] as never[] });

    // 添加用户消息到历史
    this.addToHistory(sessionId, 'user', userContent);

    const requestParams: Anthropic.Messages.MessageCreateParams = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: this.formatHistoryForApi(history),
    };

    if (this.systemPrompt) {
      requestParams.system = this.systemPrompt;
    }

    if (tools && tools.length > 0) {
      requestParams.tools = tools;
    }

    try {
      const stream = this.client.messages.stream(requestParams);

      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              yield { type: 'text', content: event.delta.text };
            }
            break;

          case 'content_block_start':
            // 工具调用开始
            if (event.content_block.type === 'tool_use') {
              // 这里记录工具调用信息
            }
            break;
        }
      }

      // 获取最终消息
      const finalMessage = await stream.finalMessage();
      this.addToHistory(sessionId, 'assistant', finalMessage.content);

      // 处理工具调用
      for (const block of finalMessage.content) {
        if (block.type === 'tool_use') {
          yield {
            type: 'tool_use',
            toolName: block.name,
            toolInput: block.input
          };
        }
      }

    } catch (error) {
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * 继续对话（处理工具调用结果）
   */
  async continueWithToolResult(
    toolResults: Array<{ toolUseId: string; content: string; isError?: boolean }>,
    options: {
      sessionId?: string;
      tools?: Anthropic.Tool[];
    } = {}
  ): Promise<Message> {
    const { sessionId = 'default', tools } = options;
    const history = this.getOrCreateSession(sessionId);

    // 构建工具结果内容（使用类型断言处理 SDK 类型限制）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResultContent: any[] = toolResults.map(result => {
      const item: Record<string, unknown> = {
        type: 'tool_result',
        tool_use_id: result.toolUseId,
        content: result.content,
      };
      // 只在错误时包含 is_error 字段
      if (result.isError) {
        item.is_error = true;
      }
      return item;
    });

    // 添加用户消息（工具结果）到历史
    this.addToHistory(sessionId, 'user', toolResultContent);

    const requestParams: Anthropic.Messages.MessageCreateParams = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: this.formatHistoryForApi(history),
    };

    if (this.systemPrompt) {
      requestParams.system = this.systemPrompt;
    }

    if (tools && tools.length > 0) {
      requestParams.tools = tools;
    }

    const response = await this.client.messages.create(requestParams);

    // 添加助手响应到历史
    this.addToHistory(sessionId, 'assistant', response.content);

    return response;
  }

  /**
   * 流式继续对话（处理工具调用结果）
   */
  async *streamContinueWithToolResult(
    toolResults: Array<{ toolUseId: string; content: string; isError?: boolean }>,
    options: {
      sessionId?: string;
      tools?: Anthropic.Tool[];
    } = {}
  ): AsyncGenerator<StreamChunk> {
    const { sessionId = 'default', tools } = options;
    const history = this.getOrCreateSession(sessionId);

    // 构建工具结果内容（使用类型断言处理 SDK 类型限制）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResultContent: any[] = toolResults.map(result => {
      const item: Record<string, unknown> = {
        type: 'tool_result',
        tool_use_id: result.toolUseId,
        content: result.content,
      };
      // 只在错误时包含 is_error 字段
      if (result.isError) {
        item.is_error = true;
      }
      return item;
    });

    // 添加用户消息（工具结果）到历史
    this.addToHistory(sessionId, 'user', toolResultContent);

    const requestParams: Anthropic.Messages.MessageCreateParams = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: this.formatHistoryForApi(history),
    };

    if (this.systemPrompt) {
      requestParams.system = this.systemPrompt;
    }

    if (tools && tools.length > 0) {
      requestParams.tools = tools;
    }

    try {
      const stream = this.client.messages.stream(requestParams);

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', content: event.delta.text };
        }
      }

      const finalMessage = await stream.finalMessage();
      this.addToHistory(sessionId, 'assistant', finalMessage.content);

    } catch (error) {
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * 清除指定会话的历史
   */
  clearSession(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
  }

  /**
   * 清除所有会话历史
   */
  clearAllSessions(): void {
    this.conversationHistory.clear();
  }

  /**
   * 获取会话历史
   */
  getSessionHistory(sessionId: string): ChatMessage[] {
    return [...this.getOrCreateSession(sessionId)];
  }

  /**
   * 获取当前使用的模型
   */
  getModel(): string {
    return this.model;
  }
}

export default ClaudeClient;
