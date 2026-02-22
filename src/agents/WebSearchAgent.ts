/**
 * Web Search Agent - 网络搜索和研究
 *
 * 使用 WebSearch 工具进行网络搜索、问题研究、信息收集
 */

import { logger } from '../utils/logger.js';
import type {
  IAgent,
  AgentConfig,
  AgentMessage,
  AgentContext,
  AgentResponse,
} from './base/Agent.js';
import { AgentCapability } from './base/Agent.js';

/**
 * Web Search Agent 配置选项
 */
export interface WebSearchAgentOptions {
  /** 最大搜索结果数 */
  maxResults?: number;
  /** 搜索超时时间 (毫秒) */
  timeout?: number;
}

/**
 * Web Search Agent - 网络搜索
 */
export class WebSearchAgent implements IAgent {
  readonly id = 'websearch';
  readonly name = 'Web Search Agent';
  readonly description = '网络搜索和研究：搜索问题、查找资料、收集信息';
  readonly capabilities: AgentCapability[] = [AgentCapability.Web, AgentCapability.Complex];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 9,
    timeout: 60000,
  };

  private maxResults: number;
  private searchTimeout: number;

  // 搜索相关关键词
  private readonly searchKeywords = [
    // 中文
    '搜索', '查找', '研究', '搜索一下', '百度', '谷歌', 'google',
    '问题', '怎么', '如何', '是什么', '为什么',
    '资料', '信息', '相关', '最新',
    // 英文
    'search', 'find', 'look up', 'research', 'google', 'bing',
    'question', 'how to', 'what is', 'why',
    'information', 'data', 'latest', 'recent',
  ];

  constructor(options: WebSearchAgentOptions = {}) {
    this.maxResults = options.maxResults || 10;
    this.searchTimeout = options.timeout || 30000;
    logger.info(`[WebSearchAgent] 初始化完成`);
  }

  /**
   * 检查是否能处理该任务
   */
  canHandle(message: AgentMessage): number {
    const content = message.content.toLowerCase();

    // 检查是否包含搜索相关的关键词
    const hitCount = this.searchKeywords.filter(kw => content.includes(kw)).length;

    // 检查是否是问题形式（包含问号）
    if (message.content.includes('?') || message.content.includes('？')) {
      return Math.min(hitCount * 0.15 + 0.3, 0.9);
    }

    return Math.min(hitCount * 0.15, 0.75);
  }

  /**
   * 处理消息
   */
  async process(
    message: AgentMessage,
    context: AgentContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      logger.info(`[WebSearchAgent] 处理消息: ${message.content.substring(0, 50)}...`);

      // 提取搜索关键词
      const searchQuery = this.extractSearchQuery(message.content);

      if (!searchQuery) {
        return {
          content: '请提供明确的搜索关键词或问题',
          agentId: this.id,
        };
      }

      // 执行搜索
      const results = await this.performSearch(searchQuery);

      const elapsed = Date.now() - startTime;
      logger.info(`[WebSearchAgent] 搜索完成，耗时: ${elapsed}ms`);

      // 格式化结果
      const formattedResults = this.formatResults(searchQuery, results);

      return {
        content: formattedResults,
        agentId: this.id,
      };

    } catch (error) {
      logger.error(`[WebSearchAgent] 处理失败: ${error}`);
      return {
        content: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 提取搜索关键词
   */
  private extractSearchQuery(content: string): string {
    // 移除常见的搜索前缀
    let query = content
      .replace(/^(搜索|查找|百度|谷歌|google|search|找一下|帮我搜)\s*(一下|下|一下下)?\s*/i, '')
      .replace(/[??？]$/, '')
      .trim();

    // 如果提取后为空，返回原始内容
    if (!query) {
      query = content;
    }

    return query;
  }

  /**
   * 执行搜索
   * 注意：这里使用模拟搜索，实际使用时需要集成真实的搜索 API
   */
  private async performSearch(query: string): Promise<Array<{
    title: string;
    url: string;
    snippet: string;
  }>> {
    // 这里是模拟搜索结果
    // 实际使用时，可以集成以下服务：
    // - Bing Search API
    // - Google Custom Search API
    // - DuckDuckGo Instant Answer API
    // - 或使用本地搜索引擎如 Meilisearch

    logger.debug(`[WebSearchAgent] 执行搜索: ${query}`);

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    // 返回模拟结果
    return [
      {
        title: `关于 "${query}" 的搜索结果`,
        url: `https://www.example.com/search?q=${encodeURIComponent(query)}`,
        snippet: `这是关于 "${query}" 的搜索结果摘要。实际使用时需要集成真实的搜索 API。`,
      },
    ];
  }

  /**
   * 格式化搜索结果
   */
  private formatResults(
    query: string,
    results: Array<{ title: string; url: string; snippet: string }>
  ): string {
    if (results.length === 0) {
      return `未找到关于 "${query}" 的相关结果。`;
    }

    let output = `🔍 搜索结果: "${query}"\n\n`;
    output += `找到 ${results.length} 条相关结果：\n\n`;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      output += `${i + 1}. **${result.title}**\n`;
      output += `   ${result.snippet}\n`;
      output += `   🔗 ${result.url}\n\n`;
    }

    output += `\n💡 提示：这是模拟搜索结果。要使用真实搜索功能，请配置搜索 API 密钥。`;

    return output;
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    logger.info('[WebSearchAgent] 已初始化');
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    logger.info('[WebSearchAgent] 已清理资源');
  }
}

export default WebSearchAgent;
