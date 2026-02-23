/**
 * Browser Agent - 网页自动化操作
 *
 * 使用 Playwright 进行网页访问、截图、表单填充等操作
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
    this.userAgent = options.userAgent || '';
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
   * 处理 URL 访问
   */
  private async handleUrlVisit(url: string, context: AgentContext): Promise<AgentResponse> {
    logger.info(`[BrowserAgent] 访问 URL: ${url}`);

    // 检查是否有 Playwright MCP 可用
    // 这里简化实现，返回说明信息
    const helpMessage = `
🤖 [Browser Agent]

检测到 URL: ${url}

当前为简化实现版本。要完整使用网页自动化功能，请：

1. 发送 /claude 前缀使用 Claude Code Agent
2. 或安装配置 Playwright MCP 插件

支持的操作：
- 访问网页并截图
- 填充表单
- 点击元素
- 提取页面信息
- 执行 JavaScript
`;

    return {
      content: helpMessage.trim(),
      agentId: this.id,
    };
  }

  /**
   * 构建帮助消息
   */
  private buildHelpMessage(content: string): string {
    return `
🤖 [Browser Agent]

我是网页自动化助手，当前支持以下功能：

**基本操作**:
- 直接发送 URL，我会访问并截图
- "截图 http://example.com"
- "填充表单 http://example.com"
- "点击元素 http://example.com button"

**注意**: 当前为简化实现版本。完整功能需要：
1. 配置 Playwright MCP 插件
2. 或使用 /claude 前缀调用完整 Claude Code Agent

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
