/**
 * Tavily Search Skill
 *
 * 使用 Tavily AI 搜索 API 进行实时网络搜索
 * 支持代理和镜像端点解决网络问题
 */

import { logger } from '../../utils/logger.js';
import { fetch as undiciFetch, RequestInit, Agent } from 'undici';

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

// 默认 API URL
const DEFAULT_API_URL = 'https://api.tavily.com/search';

// 备用搜索服务
const BACKUP_SEARCH_PROVIDERS = [
  {
    name: 'DuckDuckGo',
    url: 'https://api.duckduckgo.com/',
  },
  {
    name: 'Bing',
    url: 'https://bing.com/api/search',
  },
];

/**
 * 获取代理配置
 */
function getProxyConfig(): string | undefined {
  return process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.tavily_proxy;
}

/**
 * 获取 API URL
 */
function getApiUrl(): string {
  return process.env.TAVILY_API_URL || DEFAULT_API_URL;
}

/**
 * 创建 fetch 配置（支持代理）
 */
function createFetchOptions(): RequestInit {
  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // 配置代理
  const proxy = getProxyConfig();
  if (proxy) {
    try {
      const proxyUrl = new URL(proxy);
      options.dispatcher = new Agent({
        connect: {
          proxy: {
            uri: proxyUrl.origin,
          },
        },
      } as any);
      logger.debug(`[TavilySearch] 使用代理: ${proxy}`);
    } catch (error) {
      logger.warn(`[TavilySearch] 代理配置无效: ${proxy}`);
    }
  }

  return options;
}

/**
 * 执行 Tavily 搜索
 */
export async function tavilySearch(options: TavilySearchOptions): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error('TAVILY_API_KEY not set. Please set it in .env file or environment.');
  }

  const {
    query,
    searchDepth = 'basic',
    topics = ['general'],
    days = 3,
    maxResults = 10
  } = options;

  const apiUrl = getApiUrl();

  logger.info(`[TavilySearch] 搜索: "${query}" (URL: ${apiUrl})`);

  try {
    const fetchOptions = createFetchOptions();

    // 使用 undici fetch 支持代理
    const response = await undiciFetch(apiUrl, {
      ...fetchOptions,
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: searchDepth,
        topics,
        days,
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false,
        include_images: false,
      }),
    }) as any;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data: TavilyResponse = await response.json();

    // 格式化结果
    return formatTavilyResults(data, query);

  } catch (error: any) {
    logger.error(`[TavilySearch] 搜索失败: ${error.message}`);

    // 如果是网络错误，尝试使用备用搜索
    if (error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND')) {
      logger.info('[TavilySearch] 网络错误，尝试使用备用搜索...');
      return await backupSearch(query);
    }

    throw error;
  }
}

/**
 * 备用搜索（当 Tavily 不可用时）
 */
async function backupSearch(query: string): Promise<string> {
  // 返回提示信息，建议使用其他搜索方式
  return `⚠️ Tavily 搜索暂时不可用

搜索关键词: "${query}"

建议：
1. 检查网络连接
2. 配置代理: 设置 HTTPS_PROXY 环境变量
3. 使用 team 模式的 web_search 工具（使用 Zhipu AI 搜索）
4. 发送 "/mode team" 切换到团队模式使用搜索功能`;
}

/**
 * 格式化 Tavily 搜索结果
 */
function formatTavilyResults(data: TavilyResponse, query: string): string {
  let output = `🔍 搜索结果: "${query}"\n\n`;

  // 如果有 AI 生成的答案，优先显示
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
 * Skill 处理函数
 */
export async function handleTavilySearch(input: string): Promise<string> {
  // 简单的参数提取
  const searchQuery = input
    .replace(/^(搜索|search|查找|find|tavily)\s*/i, '')
    .trim();

  if (!searchQuery) {
    return `请提供搜索关键词

用法：
  搜索 TypeScript 最佳实践
  search latest AI news
  tavily React Server Components`;
  }

  return await tavilySearch({
    query: searchQuery,
    searchDepth: 'basic',
    topics: ['general'],
    maxResults: 5,
  });
}
