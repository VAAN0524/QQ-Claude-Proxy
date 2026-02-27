/**
 * 搜索工具 - 网络搜索功能
 *
 * 整合多种搜索来源：
 * - 智谱 AI 内置网络搜索 (通过 GLM API 的 web_search 工具)
 * - Tavily (需要 API Key，推荐)
 */

import { logger } from '../../utils/logger.js';
import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Tavily API Key 申请指南
 */
export const TAVILY_API_GUIDE = `
## 🔑 Tavily API Key 申请指南

### 什么是 Tavily？
Tavily 是专为 AI 应用设计的搜索引擎 API，提供高质量的搜索结果。

### 申请步骤：

1. **访问官网**
   https://tavily.com

2. **注册账户**
   - 点击 "Get Started" 或 "Sign Up"
   - 使用 Google/GitHub 账户快速注册
   - 或使用邮箱注册

3. **获取 API Key**
   - 登录后进入 Dashboard
   - 复制你的 API Key (格式: tvly-xxxxxx)

4. **免费额度**
   - 每月 1,000 次免费搜索
   - 无需信用卡

### 配置方法：
编辑 .env 文件，添加：
\`\`\`
TAVILY_API_KEY=tvly-your-api-key-here
\`\`\`

### 注意事项：
- 免费版每秒最多 1 次请求
- 支持中文搜索
- 结果包含 AI 摘要
`;

/**
 * 智谱 AI 网络搜索说明
 */
export const ZHIPU_WEB_SEARCH_GUIDE = `
## 🌐 智谱 AI 网络搜索

你的 GLM API Key 已经支持内置网络搜索功能！

### 使用方法：
直接向 AI 提问需要搜索的问题，系统会自动调用智谱 AI 的 web_search 工具。

### 特点：
- 无需额外配置
- 国内访问稳定
- 实时网络搜索
- 自动总结结果

### 限制：
- Coding Plan 端点可能搜索时间较长
- 需要耐心等待响应
`;

/**
 * 检查是否首次使用搜索功能
 */
let isFirstSearch = true;

/**
 * 获取首次使用提示
 */
export function getFirstSearchTip(): string | null {
  if (!isFirstSearch) return null;
  isFirstSearch = false;

  const hasTavily = !!process.env.TAVILY_API_KEY;
  const hasGlm = !!process.env.GLM_API_KEY;

  if (hasTavily) {
    return null; // 已配置 Tavily，无需提示
  }

  if (hasGlm) {
    return `💡 **搜索功能提示**

你当前使用的是智谱 AI 内置网络搜索，已自动启用。

${TAVILY_API_GUIDE}
`;
  }

  return `⚠️ **搜索功能未配置**

请配置以下任一搜索服务：

${TAVILY_API_GUIDE}

${ZHIPU_WEB_SEARCH_GUIDE}
`;
}

/**
 * 创建 axios 实例，支持代理
 */
function createAxiosInstance(): AxiosInstance {
  const config: any = {
    timeout: 60000, // 增加到 60 秒
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY ||
                   process.env.https_proxy || process.env.http_proxy;
  if (proxyUrl) {
    config.httpsAgent = new HttpsProxyAgent(proxyUrl);
    config.proxy = false;
    logger.debug(`[搜索工具] 使用代理: ${proxyUrl}`);
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
 * Tavily 搜索
 */
export async function tavilySearch(query: string, maxResults: number = 5): Promise<{ results: SearchResult[]; answer?: string }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(`TAVILY_API_KEY 未配置\n\n${TAVILY_API_GUIDE}`);
  }

  try {
    logger.info(`[搜索工具] Tavily 搜索: ${query}`);
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

    logger.info(`[搜索工具] Tavily 搜索完成: ${results.length} 条结果`);
    return {
      results,
      answer: data.answer,
    };
  } catch (error: any) {
    logger.error(`[搜索工具] Tavily 搜索失败: ${error.message}`);

    // 如果是认证错误，提供更详细的提示
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error(`Tavily API Key 无效或已过期\n\n${TAVILY_API_GUIDE}`);
    }

    throw error;
  }
}

/**
 * 智能搜索 - 优先使用 Tavily
 *
 * 注意：智谱 AI 的内置网络搜索通过 SimpleCoordinatorAgent 中的 web_search 工具实现，
 * 这里只提供 Tavily 作为补充搜索方案
 */
export async function smartSearch(query: string, options: { maxResults?: number } = {}): Promise<{
  results: SearchResult[];
  answer?: string;
  source: 'tavily' | 'none';
  tip?: string;
}> {
  const { maxResults = 5 } = options;

  // 检查首次使用提示
  const tip = getFirstSearchTip();

  // 如果配置了 Tavily，使用它
  if (process.env.TAVILY_API_KEY) {
    try {
      const tavilyResult = await tavilySearch(query, maxResults);
      return {
        results: tavilyResult.results,
        answer: tavilyResult.answer,
        source: 'tavily',
      };
    } catch (error: any) {
      logger.warn(`[搜索工具] Tavily 搜索失败: ${error.message}`);
      return {
        results: [],
        source: 'none',
        tip: `搜索失败: ${error.message}\n\n智谱 AI 内置搜索已自动启用，请直接向 AI 提问。`,
      };
    }
  }

  // 没有配置 Tavily，提示用户
  return {
    results: [],
    source: 'none',
    tip: tip || `请使用智谱 AI 内置网络搜索（已自动启用），或配置 Tavily API Key 获得更好的搜索体验。\n\n${TAVILY_API_GUIDE}`,
  };
}

/**
 * 格式化搜索结果为 Markdown
 */
export function formatSearchResults(results: SearchResult[], answer?: string, source: string = 'tavily'): string {
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

// 导出 Tavily 搜索作为主要搜索工具
export { tavilySearch as duckDuckGoSearch }; // 保持向后兼容

// ============================================================
// Agent Reach - 增强搜索功能
// ============================================================

/**
 * Agent Reach 配置指南
 */
export const AGENT_REACH_GUIDE = `
## 🔧 Agent Reach 配置指南

Agent Reach 提供增强的搜索能力，包括 Exa 语义搜索、视频搜索、网页阅读等。

### 已安装依赖:
- ✅ mcporter 0.7.3
- ✅ yt-dlp 2026.02.21
- ✅ Exa 搜索已配置

### 快速测试:
\`\`\`bash
# 测试 Exa 搜索
mcporter call exa.web_search_exa '{"query":"test"}'

# 测试视频搜索
yt-dlp --dump-json "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
\`\`\`
`;

/**
 * Exa 搜索结果
 */
export interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  text: string;
  score?: number;
}

/**
 * Exa 搜索选项
 */
export interface ExaSearchOptions {
  numResults?: number;
  livecrawl?: 'fallback' | 'preferred';
  type?: 'auto' | 'fast';
  contextMaxCharacters?: number;
}

/**
 * 视频信息接口
 */
export interface VideoInfo {
  id: string;
  title: string;
  description: string;
  uploader: string;
  uploaderId?: string;
  duration: number;
  thumbnail: string;
  viewCount?: number;
  subtitles?: string[];
}

/**
 * 智能搜索 V2 结果接口
 */
export interface SmartSearchV2Result {
  source: 'exa' | 'jina' | 'youtube' | 'bilibili' | 'duckduckgo';
  results?: SearchResult[] | ExaResult[];
  video?: VideoInfo;
  content?: string;
  answer?: string;
}

/**
 * Exa 语义搜索
 * 使用 mcporter 调用 Exa MCP 服务
 */
export async function exaSearch(
  query: string,
  options: ExaSearchOptions = {}
): Promise<ExaResult[]> {
  const { execSync } = await import('child_process');

  try {
    logger.info(`[Agent Reach] Exa 搜索: ${query}`);

    const cmd = `mcporter call exa.web_search_exa '${JSON.stringify({ query, ...options })}'`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });

    // 解析 Exa 输出（Markdown 格式）
    const results = parseExaOutput(output);
    logger.info(`[Agent Reach] Exa 搜索完成: ${results.length} 条结果`);

    return results;
  } catch (error: any) {
    logger.error(`[Agent Reach] Exa 搜索失败: ${error.message || error}`);
    throw new Error(`Exa 搜索失败: ${error.message || error}`);
  }
}

/**
 * 解析 Exa 输出
 */
function parseExaOutput(output: string): ExaResult[] {
  const results: ExaResult[] = [];
  const lines = output.split('\n');
  let currentResult: Partial<ExaResult> | null = null;

  for (const line of lines) {
    const titleMatch = line.match(/^#+\s+(.+)$/);
    if (titleMatch) {
      if (currentResult?.title) {
        results.push(currentResult as ExaResult);
      }
      currentResult = { title: titleMatch[1].trim() };
      continue;
    }

    const urlMatch = line.match(/^\*\*URL:\*\*\s+(.+)$/);
    if (urlMatch && currentResult) {
      currentResult.url = urlMatch[1].trim();
      continue;
    }

    const dateMatch = line.match(/^\*\*Published Date:\*\*\s+(.+)$/);
    if (dateMatch && currentResult) {
      currentResult.publishedDate = dateMatch[1].trim();
      continue;
    }

    if (line.startsWith('**Text:**') || line.startsWith('**text:**') && currentResult) {
      currentResult.text = line.replace(/^\*\*[Tt]ext:\*\*\s*/, '').trim();
    } else if (currentResult && line.trim() && !line.match(/^\*\*/)) {
      // 继续累积文本内容
      currentResult.text = (currentResult.text || '') + ' ' + line.trim();
    }
  }

  if (currentResult?.title) {
    results.push(currentResult as ExaResult);
  }

  return results;
}

/**
 * Exa 代码搜索
 */
export async function exaCodeSearch(query: string, tokensNum?: number): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    logger.info(`[Agent Reach] Exa 代码搜索: ${query}`);

    const args = tokensNum ? ` tokensNum:${tokensNum}` : '';
    const cmd = `mcporter call exa.get_code_context_exa 'query:"${query}"${args}'`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });

    return output;
  } catch (error: any) {
    logger.error(`[Agent Reach] Exa 代码搜索失败: ${error.message || error}`);
    throw new Error(`Exa 代码搜索失败: ${error.message || error}`);
  }
}

/**
 * Jina Reader 网页阅读
 * 使用 https://r.jina.ai/ 提取网页内容
 */
export async function jinaRead(url: string): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    logger.info(`[Agent Reach] Jina Reader: ${url}`);

    const cmd = `curl -s "https://r.jina.ai/${url}"`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });

    logger.info(`[Agent Reach] Jina Reader 完成: ${output.length} 字符`);
    return output;
  } catch (error: any) {
    logger.error(`[Agent Reach] Jina Reader 失败: ${error.message || error}`);
    throw new Error(`网页读取失败: ${error.message || error}`);
  }
}

/**
 * YouTube 视频信息提取
 */
export async function youtubeSearch(url: string): Promise<VideoInfo> {
  const { execSync } = await import('child_process');

  try {
    logger.info(`[Agent Reach] YouTube 搜索: ${url}`);

    const cmd = `yt-dlp --dump-json "${url}"`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });

    const data = JSON.parse(output);

    const info: VideoInfo = {
      id: data.id,
      title: data.title,
      description: data.description || '',
      uploader: data.uploader,
      uploaderId: data.uploader_id,
      duration: data.duration,
      thumbnail: data.thumbnail,
      viewCount: data.view_count,
    };

    logger.info(`[Agent Reach] YouTube 完成: ${info.title}`);
    return info;
  } catch (error: any) {
    logger.error(`[Agent Reach] YouTube 失败: ${error.message || error}`);
    throw new Error(`YouTube 视频信息提取失败: ${error.message || error}`);
  }
}

/**
 * B站视频信息提取
 */
export async function bilibiliSearch(url: string): Promise<VideoInfo> {
  const { execSync } = await import('child_process');

  try {
    logger.info(`[Agent Reach] B站搜索: ${url}`);

    const cmd = `yt-dlp --dump-json "${url}"`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });

    const data = JSON.parse(output);

    const info: VideoInfo = {
      id: data.id,
      title: data.title,
      description: data.description || '',
      uploader: data.uploader || data.uploader_id,
      uploaderId: data.uploader_id,
      duration: data.duration,
      thumbnail: data.thumbnail,
    };

    logger.info(`[Agent Reach] B站完成: ${info.title}`);
    return info;
  } catch (error: any) {
    logger.error(`[Agent Reach] B站失败: ${error.message || error}`);
    throw new Error(`B站视频信息提取失败: ${error.message || error}`);
  }
}

/**
 * 智能搜索 V2 - 自动路由到最佳搜索方式
 */
export async function smart_search_v2(
  query: string,
  options: { forceFallback?: boolean; numResults?: number } = {}
): Promise<SmartSearchV2Result> {
  logger.info(`[Agent Reach] 智能搜索: ${query}`);

  // 检测查询类型
  const urlMatch = query.match(/^https?:\/\/(.+)$/);
  if (urlMatch) {
    const url = query;

    // YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const video = await youtubeSearch(url);
      return { source: 'youtube', video };
    }

    // B站
    if (url.includes('bilibili.com')) {
      const video = await bilibiliSearch(url);
      return { source: 'bilibili', video };
    }

    // 其他 URL - 使用 Jina Reader
    const content = await jinaRead(url);
    return { source: 'jina', content };
  }

  // 普通关键词搜索
  if (!options.forceFallback) {
    try {
      const results = await exaSearch(query, { numResults: options.numResults || 5 });
      return { source: 'exa', results };
    } catch (error: any) {
      logger.warn(`[Agent Reach] Exa 失败，回退到 DuckDuckGo: ${error.message || error}`);
    }
  }

  // 回退到 Tavily (作为 DuckDuckGo 替代)
  const tavilyResult = await tavilySearch(query, options.numResults || 5);
  return { source: 'duckduckgo', results: tavilyResult.results };
}

/**
 * 格式化 Agent Reach 搜索结果
 */
export function formatAgentReachResult(result: SmartSearchV2Result): string {
  switch (result.source) {
    case 'exa':
      let output = `🔍 **Exa 搜索结果**\n\n`;
      for (const r of (result.results as ExaResult[])) {
        output += `- **${r.title}**\n`;
        output += `  ${r.text.substring(0, 200)}...\n`;
        output += `  🔗 ${r.url}\n\n`;
      }
      return output;

    case 'jina':
      return `📄 **网页内容**\n\n${result.content?.substring(0, 2000)}${result.content && result.content.length > 2000 ? '...' : ''}`;

    case 'youtube':
    case 'bilibili':
      const v = result.video!;
      return `🎬 **视频信息** (${result.source})\n\n` +
        `- 标题: ${v.title}\n` +
        `- 上传者: ${v.uploader}\n` +
        `- 时长: ${v.duration}秒\n` +
        `- 缩略图: ${v.thumbnail}\n` +
        `- 描述: ${v.description.substring(0, 200)}...`;

    case 'duckduckgo':
      return formatSearchResults(result.results as SearchResult[]);

    default:
      return '未知搜索来源';
  }
}
