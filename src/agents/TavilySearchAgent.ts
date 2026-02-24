/**
 * TavilySearchAgent - 使用 Tavily API 进行网络搜索
 *
 * 实时网络搜索，支持代理和备用端点解决网络问题
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

interface TavilySearchOptions {
  query: string;
  searchDepth?: 'basic' | 'advanced';
  topics?: Array<'general' | 'news' | 'finance'>;
  days?: number;
  maxResults?: number;
}

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  answer?: string;
  results: TavilySearchResult[];
}

/**
 * Tavily Search Agent
 */
export class TavilySearchAgent implements IAgent {
  readonly id = 'tavily-search';
  readonly name = 'Tavily Search Agent';
  readonly description = '实时网络搜索：使用 Tavily API 获取最新信息';
  readonly capabilities: AgentCapability[] = [AgentCapability.Web, AgentCapability.Complex];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 8,
    timeout: 30000,
  };

  private get apiUrl(): string {
    return process.env.TAVILY_API_URL || 'https://api.tavily.com/search';
  }

  constructor() {
    const apiKey = process.env.TAVILY_API_KEY;
    if (apiKey) {
      logger.info('[TavilySearchAgent] 初始化完成 (API Key: ***)');
      const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      if (proxy) {
        logger.info(`[TavilySearchAgent] 代理配置: ${proxy}`);
      }
    } else {
      logger.warn('[TavilySearchAgent] TAVILY_API_KEY 未设置，搜索功能将不可用');
    }
  }

  canHandle(message: AgentMessage): number {
    const content = message.content;
    if (typeof content !== 'string') {
      return 0;
    }

    const keywords = [
      '搜索', 'search', '查找', 'find', 'tavily',
      '最新', 'latest', '新闻', 'news',
    ];

    const lowerContent = content.toLowerCase();
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) {
        return 0.8;
      }
    }

    return 0;
  }

  async process(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    try {
      const content = message.content as string;

      // 提取搜索关键词
      const query = this.extractQuery(content);

      if (!query) {
        return {
          content: `请提供搜索关键词\n\n用法：\n  搜索 TypeScript 最佳实践\n  search latest AI news`,
          agentId: this.id,
        };
      }

      logger.info(`[TavilySearchAgent] 搜索: "${query}"`);

      // 执行搜索
      const result = await this.search({
        query,
        searchDepth: 'basic',
        topics: ['general'],
        maxResults: 5,
      });

      return {
        content: result,
        agentId: this.id,
      };

    } catch (error) {
      logger.error(`[TavilySearchAgent] 处理失败: ${error}`);

      // 网络错误时提供解决方案
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('ETIMEDOUT') ||
          errorMessage.includes('ENOTFOUND')) {
        return {
          content: this.getNetworkErrorHelp(errorMessage),
          agentId: this.id,
        };
      }

      return {
        content: `搜索失败: ${errorMessage}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 提取搜索关键词
   */
  private extractQuery(content: string): string {
    return content
      .replace(/^(搜索|search|查找|find|tavily)\s*/i, '')
      .replace(/^(最新的|latest|)?\s*/i, '')
      .trim();
  }

  /**
   * 执行 Tavily 搜索
   */
  private async search(options: TavilySearchOptions): Promise<string> {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      throw new Error('TAVILY_API_KEY not set');
    }

    const { query, searchDepth = 'basic', topics = ['general'], maxResults = 10 } = options;

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: searchDepth,
        topics,
        days: 3,
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false,
        include_images: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data: TavilyResponse = await response.json();
    return this.formatResults(data, query);
  }

  /**
   * 格式化搜索结果
   */
  private formatResults(data: TavilyResponse, query: string): string {
    let output = `🔍 搜索结果: "${query}"\n\n`;

    if (data.answer) {
      output += `💡 **AI 总结**\n${data.answer}\n\n`;
    }

    output += `找到 ${data.results.length} 条相关结果：\n\n`;

    for (let i = 0; i < data.results.length; i++) {
      const result = data.results[i];
      output += `${i + 1}. **${result.title}**\n`;
      output += `   ${result.content.substring(0, 200)}${result.content.length > 200 ? '...' : ''}\n`;
      output += `   🔗 ${result.url}\n`;
      if (result.published_date) {
        output += `   📅 ${result.published_date}\n`;
      }
      output += `\n`;
    }

    return output;
  }

  /**
   * 网络错误帮助信息
   */
  private getNetworkErrorHelp(error: string): string {
    return `⚠️ 网络连接失败: ${error}

**可能的解决方案:**

1. **配置代理** (推荐)
   在 .env 中添加:
   \`\`\`
   HTTPS_PROXY=http://127.0.0.1:7890
   HTTP_PROXY=http://127.0.0.1:7890
   \`\`\`

2. **使用镜像端点**
   在 .env 中添加:
   \`\`\`
   TAVILY_API_URL=https://your-worker.workers.dev
   \`\`\`

3. **切换到团队模式搜索**
   发送: /mode team
   然后使用 web_search 工具（基于 Zhipu AI）

4. **检查网络**
   - 确保能访问 api.tavily.com
   - 尝试重启服务`;
  }

  async initialize(): Promise<void> {
    // 已在构造函数中初始化
  }

  async cleanup(): Promise<void> {
    logger.info('[TavilySearchAgent] 已清理资源');
  }
}

export default TavilySearchAgent;
