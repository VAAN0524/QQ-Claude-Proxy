/**
 * DuckSearchAgent - 使用 DuckDuckGo 搜索和获取网页内容
 *
 * 基于 ducksearch npm 包，提供：
 * - DuckDuckGo 网络搜索
 * - 网页内容提取
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

// 导入 ducksearch
import { duckDuckGoSearch, fetchContent } from 'ducksearch';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

/**
 * DuckSearch Agent
 */
export class DuckSearchAgent implements IAgent {
  readonly id = 'ducksearch';
  readonly name = 'DuckSearch Agent';
  readonly description = 'DuckDuckGo 搜索和网页内容提取：搜索网络、获取网页内容';
  readonly capabilities: AgentCapability[] = [AgentCapability.Web, AgentCapability.Complex];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 8,
    timeout: 30000,
  };

  constructor() {
    logger.info('[DuckSearchAgent] 初始化完成');
  }

  canHandle(message: AgentMessage): number {
    const content = message.content;
    if (typeof content !== 'string') {
      return 0;
    }

    const lowerContent = content.toLowerCase();

    // URL 检测（优先级最高）
    const urlPattern = /https?:\/\/[^\s]+/i;
    if (urlPattern.test(content)) {
      return 0.95;
    }

    // 关键词检测
    const keywords = [
      '搜索', 'search', '查找', 'find',
      'duck', 'duckduckgo',
    ];

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

      // 检测 URL
      const urlMatch = content.match(/(https?:\/\/[^\s]+)/i);
      if (urlMatch) {
        const url = urlMatch[1];
        logger.info(`[DuckSearchAgent] 获取网页内容: ${url}`);
        return await this.handleFetch(url);
      }

      // 提取搜索关键词
      const query = this.extractQuery(content);
      if (!query) {
        return {
          content: `请提供搜索关键词或 URL\n\n用法：\n  搜索 TypeScript 最佳实践\n  search latest AI news\n  https://example.com`,
          agentId: this.id,
        };
      }

      logger.info(`[DuckSearchAgent] 搜索: "${query}"`);
      return await this.handleSearch(query);

    } catch (error) {
      logger.error(`[DuckSearchAgent] 处理失败: ${error}`);
      return {
        content: `❌ [DuckSearch Agent] 处理失败: ${error instanceof Error ? error.message : String(error)}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 处理搜索请求
   */
  private async handleSearch(query: string): Promise<AgentResponse> {
    try {
      const results = await duckDuckGoSearch(query, 5);

      if (results.length === 0) {
        return {
          content: `🔍 搜索: "${query}"\n\n❌ 未找到相关结果`,
          agentId: this.id,
        };
      }

      let output = `🔍 搜索结果: "${query}"\n\n`;
      output += `✅ 找到 ${results.length} 条相关结果:\n\n`;

      for (const result of results) {
        output += `${result.position}. **${result.title}**\n`;
        output += `   ${result.snippet.substring(0, 150)}${result.snippet.length > 150 ? '...' : ''}\n`;
        output += `   🔗 ${result.link}\n\n`;
      }

      return {
        content: output.trim(),
        agentId: this.id,
      };

    } catch (error) {
      throw new Error(`搜索失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理 URL 获取请求
   */
  private async handleFetch(url: string): Promise<AgentResponse> {
    try {
      const content = await fetchContent(url);

      let output = `📥 已获取: ${url}\n\n`;
      output += `**内容长度**: ${content.length} 字符\n\n`;
      output += `**内容预览**:\n\n`;

      const maxLength = 1500;
      if (content.length > maxLength) {
        output += content.substring(0, maxLength);
        output += `\n\n... (内容过长，已截断，共 ${content.length} 字符)`;
      } else {
        output += content;
      }

      return {
        content: output.trim(),
        agentId: this.id,
      };

    } catch (error) {
      throw new Error(`获取失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 提取搜索关键词
   */
  private extractQuery(content: string): string {
    return content
      .replace(/^(搜索|search|查找|find|duck|duckduckgo)\s*/i, '')
      .replace(/^(最新的|latest|)?\s*/i, '')
      .trim();
  }

  async initialize(): Promise<void> {
    logger.info('[DuckSearchAgent] 已初始化');
  }

  async cleanup(): Promise<void> {
    logger.info('[DuckSearchAgent] 已清理资源');
  }
}

export default DuckSearchAgent;
