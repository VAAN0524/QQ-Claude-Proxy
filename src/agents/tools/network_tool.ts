/**
 * Smart Network Tool - 智能网络访问工具
 *
 * 功能：
 * - 自动检测网络环境
 * - 智能选择访问策略（直连/镜像）
 * - 多重容错重试机制
 * - 支持 GitHub、普通网页等多种访问场景
 */

import { logger } from '../../utils/logger.js';
import {
  getNetworkHelper,
  shouldUseMirror,
  toMirrorUrl,
  diagnoseNetworkError,
  type MirrorType
} from '../../utils/network-helper.js';

/**
 * 访问策略
 */
interface FetchStrategy {
  /** 策略名称 */
  name: string;
  /** 策略描述 */
  description: string;
  /** 执行函数 */
  execute: (url: string) => Promise<string | null>;
}

/**
 * 智能获取选项
 */
export interface SmartFetchOptions {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 强制使用镜像 */
  forceMirror?: boolean;
  /** 优先镜像类型 */
  preferredMirror?: MirrorType;
  /** 是否包含错误详情 */
  verbose?: boolean;
}

/**
 * 智能获取结果
 */
export interface SmartFetchResult {
  /** 是否成功 */
  success: boolean;
  /** 内容 */
  content?: string;
  /** 使用的策略 */
  strategy?: string;
  /** 最终 URL */
  finalUrl?: string;
  /** 错误信息 */
  error?: string;
  /** 尝试次数 */
  attempts: number;
  /** 耗时（毫秒） */
  duration: number;
}

/**
 * 智能网络访问类
 */
export class SmartNetworkTool {
  private networkHelper = getNetworkHelper();
  private initialized = false;

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('[SmartNetworkTool] 正在检测网络环境...');
    try {
      const result = await this.networkHelper.detectRegion();
      logger.info(`[SmartNetworkTool] 网络环境检测完成: ${result.region} (${result.detectionTime}ms)`);
    } catch (error) {
      logger.warn(`[SmartNetworkTool] 网络环境检测失败: ${error}`);
    }

    this.initialized = true;
  }

  /**
   * 直接获取
   */
  private async directFetch(url: string, timeout: number = 10000): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      return text;
    } catch (error) {
      logger.debug(`[SmartNetworkTool] directFetch 失败: ${error}`);
      throw error;
    }
  }

  /**
   * 镜像获取
   */
  private async mirrorFetch(url: string, mirrorType: MirrorType, timeout: number = 10000): Promise<string | null> {
    try {
      const mirrorUrl = this.networkHelper.toMirrorUrl(url, mirrorType);
      if (!mirrorUrl) {
        throw new Error(`无法转换为 ${mirrorType} 镜像 URL`);
      }

      logger.debug(`[SmartNetworkTool] 使用 ${mirrorType} 镜像: ${mirrorUrl}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(mirrorUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      return text;
    } catch (error) {
      logger.debug(`[SmartNetworkTool] ${mirrorType} 镜像获取失败: ${error}`);
      throw error;
    }
  }

  /**
   * jsDelivr 镜像获取
   */
  private async jsdelivrFetch(url: string, timeout: number = 10000): Promise<string | null> {
    return this.mirrorFetch(url, 'jsdelivr', timeout);
  }

  /**
   * ghproxy 代理获取
   */
  private async ghproxyFetch(url: string, timeout: number = 10000): Promise<string | null> {
    return this.mirrorFetch(url, 'ghproxy', timeout);
  }

  /**
   * Web Reader MCP 获取
   */
  private async webReaderFetch(url: string): Promise<string | null> {
    try {
      // 尝试使用 MCP web_reader 工具
      logger.debug(`[SmartNetworkTool] 尝试使用 web_reader: ${url}`);

      // 注意：这里需要在实际使用时通过 MCP 调用
      // 这里只是预留接口
      throw new Error('Web Reader MCP 未集成');
    } catch (error) {
      logger.debug(`[SmartNetworkTool] webReaderFetch 失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取访问策略列表
   */
  private getStrategies(url: string, options: SmartFetchOptions): FetchStrategy[] {
    const useMirror = options.forceMirror || shouldUseMirror(url);
    const strategies: FetchStrategy[] = [];

    // 如果需要镜像，优先使用镜像
    if (useMirror) {
      strategies.push(
        {
          name: 'jsdelivr',
          description: 'jsDelivr CDN 镜像',
          execute: (u) => this.jsdelivrFetch(u, options.timeout)
        },
        {
          name: 'ghproxy',
          description: 'ghproxy 代理',
          execute: (u) => this.ghproxyFetch(u, options.timeout)
        }
      );
    }

    // 始终尝试直连（如果镜像失败）
    strategies.push({
      name: 'direct',
      description: '直接访问',
      execute: (u) => this.directFetch(u, options.timeout)
    });

    return strategies;
  }

  /**
   * 智能获取
   */
  async smartFetch(url: string, options: SmartFetchOptions = {}): Promise<SmartFetchResult> {
    const startTime = Date.now();
    const maxRetries = options.maxRetries ?? 3;
    const timeout = options.timeout ?? 10000;

    // 确保已初始化
    await this.initialize();

    logger.info(`[SmartNetworkTool] 开始智能获取: ${url}`);

    const strategies = this.getStrategies(url, options);
    let lastError: Error | null = null;
    let attemptCount = 0;

    for (const strategy of strategies) {
      for (let retry = 0; retry < maxRetries; retry++) {
        attemptCount++;

        try {
          logger.info(`[SmartNetworkTool] [${attemptCount}/${strategies.length * maxRetries}] 尝试策略: ${strategy.name}${retry > 0 ? ` (重试 ${retry})` : ''}`);

          const content = await strategy.execute(url);

          if (content) {
            const duration = Date.now() - startTime;
            logger.info(`[SmartNetworkTool] ✅ 成功: ${strategy.name} (${duration}ms)`);

            return {
              success: true,
              content,
              strategy: strategy.name,
              finalUrl: url,
              attempts: attemptCount,
              duration
            };
          }
        } catch (error) {
          lastError = error as Error;
          const diagnosis = diagnoseNetworkError(lastError, url);

          logger.warn(`[SmartNetworkTool] ❌ 失败: ${strategy.name} - ${diagnosis.type}`);

          // 如果不应该重试，跳出重试循环
          if (!diagnosis.shouldRetry) {
            break;
          }
        }
      }
    }

    // 所有策略都失败
    const duration = Date.now() - startTime;
    const errorMsg = lastError?.message || '所有策略均失败';

    logger.error(`[SmartNetworkTool] ❌ 所有策略失败 (${attemptCount} 次尝试, ${duration}ms)`);

    return {
      success: false,
      error: errorMsg,
      attempts: attemptCount,
      duration
    };
  }

  /**
   * 快速获取（仅成功或失败，不返回详细信息）
   */
  async fetch(url: string, options: SmartFetchOptions = {}): Promise<string | null> {
    const result = await this.smartFetch(url, options);
    return result.content ?? null;
  }

  /**
   * 获取 GitHub 仓库内容
   */
  async getGitHubRepo(owner: string, repo: string, branch: string = 'main'): Promise<SmartFetchResult> {
    const url = `https://github.com/${owner}/${repo}`;
    return this.smartFetch(url);
  }

  /**
   * 获取 GitHub 文件内容
   */
  async getGitHubFile(owner: string, repo: string, path: string, branch: string = 'main'): Promise<SmartFetchResult> {
    const url = `https://github.com/${owner}/${repo}/blob/${branch}/${path}`;
    return this.smartFetch(url);
  }

  /**
   * 获取 GitHub Raw 文件
   */
  async getGitHubRaw(owner: string, repo: string, path: string, branch: string = 'main'): Promise<SmartFetchResult> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    return this.smartFetch(url);
  }

  /**
   * 获取网络状态
   */
  getStatus(): {
    initialized: boolean;
    region: string | null;
    detectionTime: number | null;
  } {
    const helperStatus = this.networkHelper.getStatus();

    return {
      initialized: this.initialized,
      region: helperStatus.region,
      detectionTime: helperStatus.detectionTime
    };
  }
}

/**
 * 单例实例
 */
let instance: SmartNetworkTool | null = null;

/**
 * 获取单例实例
 */
export function getSmartNetworkTool(): SmartNetworkTool {
  if (!instance) {
    instance = new SmartNetworkTool();
  }
  return instance;
}

/**
 * 便捷函数：智能获取
 */
export async function smartFetch(url: string, options?: SmartFetchOptions): Promise<SmartFetchResult> {
  return getSmartNetworkTool().smartFetch(url, options);
}

/**
 * 便捷函数：快速获取
 */
export async function quickFetch(url: string, options?: SmartFetchOptions): Promise<string | null> {
  const tool = getSmartNetworkTool();
  await tool.initialize();
  return tool.fetch(url, options);
}

/**
 * 便捷函数：获取 GitHub 仓库
 */
export async function fetchGitHubRepo(owner: string, repo: string, branch?: string): Promise<SmartFetchResult> {
  const tool = getSmartNetworkTool();
  await tool.initialize();
  return tool.getGitHubRepo(owner, repo, branch);
}

/**
 * 便捷函数：获取 GitHub 文件
 */
export async function fetchGitHubFile(owner: string, repo: string, path: string, branch?: string): Promise<SmartFetchResult> {
  const tool = getSmartNetworkTool();
  await tool.initialize();
  return tool.getGitHubFile(owner, repo, path, branch);
}

export default SmartNetworkTool;
