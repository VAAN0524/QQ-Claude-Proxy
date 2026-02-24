/**
 * 网页工具 - 网页访问和内容提取
 */

import { logger } from '../../utils/logger.js';
import { smartFetch, type SmartFetchResult } from '../tools/network_tool.js';

/**
 * 网页内容提取结果
 */
export interface WebContent {
  title?: string;
  content: string;
  url: string;
  success: boolean;
  error?: string;
}

/**
 * 获取网页内容
 */
export async function fetchWebContent(url: string, options: { timeout?: number; useMirror?: boolean } = {}): Promise<WebContent> {
  try {
    logger.info(`[网页工具] 获取: ${url}`);

    const result: SmartFetchResult = await smartFetch(url, {
      maxRetries: 1,
      timeout: options.timeout || 15000,
      forceMirror: options.useMirror,
    });

    if (result.success && result.content) {
      return {
        content: result.content,
        url: result.finalUrl || url,
        success: true,
      };
    }

    return {
      content: '',
      url,
      success: false,
      error: result.error || '获取失败',
    };
  } catch (error) {
    logger.error(`[网页工具] 获取失败: ${error}`);
    return {
      content: '',
      url,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 检测内容中的 GitHub URL 并提取信息
 */
export function detectGitHubUrl(content: string): { type: 'repo' | 'file' | 'unknown'; owner?: string; repo?: string; path?: string } | null {
  // GitHub 仓库 URL
  const repoMatch = content.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
  if (repoMatch) {
    return {
      type: 'repo',
      owner: repoMatch[1],
      repo: repoMatch[2],
    };
  }

  // GitHub 文件 URL
  const fileMatch = content.match(/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)/);
  if (fileMatch) {
    return {
      type: 'file',
      owner: fileMatch[1],
      repo: fileMatch[2],
      path: fileMatch[4],
    };
  }

  return null;
}
