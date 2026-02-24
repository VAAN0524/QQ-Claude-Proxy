/**
 * 搜索工具 - 网络搜索功能
 *
 * 整合多种搜索来源：
 * - DuckDuckGo (免费)
 * - Tavily (需要 API Key)
 */

import { logger } from '../../utils/logger.js';
import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * 创建 axios 实例，支持代理
 */
function createAxiosInstance(): AxiosInstance {
  const config: any = {
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (proxyUrl) {
    config.httpsAgent = new HttpsProxyAgent(proxyUrl);
    config.proxy = false;
  }

  return axios.create(config);
}

/**
 * 搜索结果
 */
export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  publishedDate?: string;
}

/**
 * DuckDuckGo 搜索
 */
export async function duckDuckGoSearch(query: string, maxResults: number = 5): Promise<SearchResult[]> {
  try {
    // 动态导入 ducksearch
    const ducksearch = await import('ducksearch');

    // ducksearch 可能是 default 导出或命名导出
    const searchFn = (ducksearch as any).default || ducksearch;
    const results = await searchFn(query, maxResults);

    return results.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.body || r.snippet || '',
      score: r.score || 0,
    }));
  } catch (error) {
    logger.error(`[搜索工具] DuckDuckGo 搜索失败: ${error}`);
    return [];
  }
}

/**
 * Tavily 搜索
 */
export async function tavilySearch(query: string, maxResults: number = 5): Promise<{ results: SearchResult[]; answer?: string }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY 未配置');
  }

  try {
    const axiosInstance = createAxiosInstance();
    const apiUrl = process.env.TAVILY_API_URL || 'https://api.tavily.com/search';

    const response = await axiosInstance.post(apiUrl, {
      api_key: apiKey,
      query,
      search_depth: 'basic',
      topics: ['general'],
      days: 7,
      max_results: maxResults,
      include_answer: true,
      include_raw_content: false,
      include_images: false,
    });

    const data = response.data;

    const results = (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
      score: r.score || 0,
      publishedDate: r.published_date,
    }));

    return {
      results,
      answer: data.answer,
    };
  } catch (error) {
    logger.error(`[搜索工具] Tavily 搜索失败: ${error}`);
    throw error;
  }
}

/**
 * 智能搜索 - 自动选择最佳搜索方式
 */
export async function smartSearch(query: string, options: { maxResults?: number; preferTavily?: boolean } = {}): Promise<{
  results: SearchResult[];
  answer?: string;
  source: 'duckduckgo' | 'tavily';
}> {
  const { maxResults = 5, preferTavily = false } = options;

  // 如果配置了 Tavily 且优先使用，或者没有其他选择
  if (preferTavily && process.env.TAVILY_API_KEY) {
    try {
      const tavilyResult = await tavilySearch(query, maxResults);
      return {
        results: tavilyResult.results,
        answer: tavilyResult.answer,
        source: 'tavily',
      };
    } catch (error) {
      logger.warn(`[搜索工具] Tavily 失败，回退到 DuckDuckGo`);
    }
  }

  // 默认使用 DuckDuckGo
  const results = await duckDuckGoSearch(query, maxResults);
  return {
    results,
    source: 'duckduckgo',
  };
}

/**
 * 格式化搜索结果为 Markdown
 */
export function formatSearchResults(results: SearchResult[], answer?: string, source: string = 'duckduckgo'): string {
  let output = '';

  if (answer) {
    output += `💡 **AI 总结**\n${answer}\n\n`;
  }

  output += `🔍 **搜索结果** (${source}): ${results.length} 条\n\n`;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    output += `${i + 1}. **${result.title}**\n`;
    output += `   ${result.content.substring(0, 300)}${result.content.length > 300 ? '...' : ''}\n`;
    output += `   🔗 ${result.url}\n`;
    if (result.publishedDate) {
      output += `   📅 ${result.publishedDate}\n`;
    }
    output += `\n`;
  }

  return output;
}
