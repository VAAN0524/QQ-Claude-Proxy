/**
 * Browser Agent - 网页自动化操作
 *
 * 使用 fetch 和 MCP 工具进行网页访问、内容提取
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
 * Browser Agent 配置选项
 */
export interface BrowserAgentOptions {
  /** 是否无头模式 */
  headless?: boolean;
  /** 页面超时时间 (毫秒) */
  timeout?: number;
  /** 用户代理 */
  userAgent?: string;
}

/**
 * 网页内容提取结果
 */
interface WebContent {
  title?: string;
  content: string;
  url: string;
}

/**
 * Browser Agent - 网页操作
 */
export class BrowserAgent implements IAgent {
  readonly id = 'browser';
  readonly name = 'Browser Agent';
  readonly description = '网页自动化：访问、截图、填充表单、点击等';
  readonly capabilities: AgentCapability[] = [AgentCapability.Web];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 8,
    timeout: 120000,
  };

  private headless: boolean;
  private pageTimeout: number;
  private userAgent: string;

  // 网页相关关键词
  private readonly webKeywords = [
    // 中文
    '网页', '网站', '访问', '打开', '截图', '填充', '点击', '表单',
    '浏览器', '页面', 'url', '链接', 'http',
    // 英文
    'web', 'page', 'website', 'visit', 'open', 'screenshot', 'fill', 'click',
    'form', 'browser', 'url', 'link', 'http',
  ];

  constructor(options: BrowserAgentOptions = {}) {
    this.headless = options.headless !== false;
    this.pageTimeout = options.timeout || 30000;
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    logger.info(`[BrowserAgent] 初始化完成 (无头: ${this.headless})`);
  }

  /**
   * 检查是否能处理该任务
   */
  canHandle(message: AgentMessage): number {
    const content = message.content.toLowerCase();

    // 检查是否包含 URL (优先级最高)
    const urlPattern = /https?:\/\/[^\s\u4e00-\u9fa5]+/i;
    if (urlPattern.test(message.content)) {
      return 0.95;
    }

    // 关键词匹配
    const hitCount = this.webKeywords.filter(kw => content.includes(kw)).length;
    return Math.min(hitCount * 0.2, 0.85);
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
      // 参数验证
      const content = typeof message.content === 'string' ? message.content : String(message.content || '');

      logger.info(`[BrowserAgent] 处理消息: ${content.substring(0, 50)}...`);

      // 提取 URL
      const urlMatch = content.match(/https?:\/\/[^\s\u4e00-\u9fa5]+/i);
      const url = urlMatch ? urlMatch[0] : null;

      if (url) {
        return await this.handleUrlVisit(url, context);
      }

      // 通用网页操作说明
      return {
        content: this.buildHelpMessage(content),
        agentId: this.id,
      };

    } catch (error) {
      logger.error(`[BrowserAgent] 处理失败: ${error}`);
      return {
        content: `❌ [Browser Agent] 处理失败: ${error instanceof Error ? error.message : String(error)}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 处理 URL 访问 - 实际抓取网页内容
   */
  private async handleUrlVisit(url: string, context: AgentContext): Promise<AgentResponse> {
    logger.info(`[BrowserAgent] 访问 URL: ${url}`);

    try {
      // 尝试使用多种方法获取网页内容
      const webContent = await this.fetchWebContent(url);

      // 格式化输出
      let output = `🤖 [Browser Agent]\n\n`;
      output += `📄 已访问: ${url}\n\n`;

      if (webContent.title) {
        output += `**标题**: ${webContent.title}\n\n`;
      }

      output += `**内容摘要**:\n\n${webContent.content}\n`;

      // 限制输出长度
      const maxLength = 2000;
      if (output.length > maxLength) {
        output = output.substring(0, maxLength) + '\n... (内容过长已截断)';
      }

      return {
        content: output.trim(),
        agentId: this.id,
      };
    } catch (error) {
      logger.error(`[BrowserAgent] 获取网页内容失败: ${error}`);
      return {
        content: `❌ [Browser Agent] 无法访问网页: ${url}\n错误: ${error instanceof Error ? error.message : String(error)}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 抓取网页内容
   */
  private async fetchWebContent(url: string): Promise<WebContent> {
    // 验证 URL 格式
    try {
      new URL(url);
    } catch {
      throw new Error('无效的 URL 格式');
    }

    // 使用 fetch 获取网页内容
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(this.pageTimeout),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // 提取标题
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // 移除 script 和 style 标签
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

    // 提取主要内容
    let content = this.extractMainContent(cleanHtml);

    // 如果提取失败，使用备用方法
    if (!content || content.length < 50) {
      content = this.extractTextFallback(cleanHtml);
    }

    // 清理内容
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    // 限制内容长度
    const maxLength = 1500;
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '...';
    }

    return {
      title,
      content,
      url,
    };
  }

  /**
   * 提取主要内容 - 优先提取 article、main、body 等标签
   */
  private extractMainContent(html: string): string {
    // 尝试按优先级提取内容
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<body[^>]*>([\s\S]*?)<\/body>/i,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*main[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1] && match[1].length > 100) {
        return this.stripHtmlTags(match[1]);
      }
    }

    return '';
  }

  /**
   * 备用文本提取方法
   */
  private extractTextFallback(html: string): string {
    // 移除所有 HTML 标签
    const text = this.stripHtmlTags(html);
    return text;
  }

  /**
   * 移除 HTML 标签，保留文本
   */
  private stripHtmlTags(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 构建帮助消息
   */
  private buildHelpMessage(content: string): string {
    return `
🤖 [Browser Agent]

我是网页自动化助手，当前支持以下功能：

**基本操作**:
- 直接发送 URL，我会访问并提取内容
- "访问 http://example.com"
- "打开网页 https://example.com"

**支持的网站**:
- 大部分静态网页
- GitHub 仓库页面
- 博客和新闻网站
- 技术文档网站

你的消息: "${content.substring(0, 100)}"
`;
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    logger.info('[BrowserAgent] 已初始化');
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    logger.info('[BrowserAgent] 已清理资源');
  }
}
