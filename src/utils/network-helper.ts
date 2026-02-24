/**
 * Network Helper - 网络环境检测和适配工具
 *
 * 功能：
 * - 检测用户所在区域（中国大陆/全球）
 * - 判断是否需要使用镜像
 * - 提供 URL 镜像转换
 */

import { logger } from './logger.js';

/**
 * 区域类型
 */
export type Region = 'cn' | 'global';

/**
 * 镜像类型
 */
export type MirrorType = 'jsdelivr' | 'ghproxy' | 'gitclone';

/**
 * 网络错误诊断结果
 */
export interface NetworkError {
  /** 错误类型 */
  type: 'timeout' | 'dns' | 'connection_refused' | 'ssl' | 'unknown';
  /** 原始 URL */
  url: string;
  /** 是否应该重试 */
  shouldRetry: boolean;
  /** 建议的镜像 URL */
  suggestedMirror?: string;
}

/**
 * 网络检测结果
 */
export interface NetworkDetectionResult {
  /** 检测到的区域 */
  region: Region;
  /** 是否在中国大陆 */
  isChina: boolean;
  /** 检测耗时（毫秒） */
  detectionTime: number;
  /** 建议的镜像类型 */
  preferredMirror: MirrorType | null;
}

/**
 * GitHub URL 解析结果
 */
interface GitHubUrlParts {
  owner?: string;
  repo?: string;
  branch?: string;
  path?: string;
  type: 'repo' | 'file' | 'raw' | 'api' | 'unknown';
}

/**
 * 网络助手类
 */
export class NetworkHelper {
  private region: Region | null = null;
  private detectionTime: number | null = null;
  private detectionTimestamp: number | null = null;

  /**
   * 检测用户所在区域
   */
  async detectRegion(): Promise<NetworkDetectionResult> {
    const startTime = Date.now();

    logger.info('[NetworkHelper] 开始检测网络区域...');

    try {
      // 方法1: 尝试访问 Google（最快）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      await fetch('https://www.google.com', {
        method: 'HEAD',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      this.region = 'global';
      logger.info('[NetworkHelper] 检测到区域: 全球 (可访问 Google)');
    } catch {
      // 方法2: 尝试访问 GitHub
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        await fetch('https://github.com', {
          method: 'HEAD',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        // 能访问 GitHub 但不能访问 Google，可能是其他地区
        this.region = 'global';
        logger.info('[NetworkHelper] 检测到区域: 全球 (可访问 GitHub)');
      } catch {
        // 都无法访问，判定为中国大陆
        this.region = 'cn';
        logger.info('[NetworkHelper] 检测到区域: 中国大陆 (Google/GitHub 均无法访问)');
      }
    }

    const detectionTime = Date.now() - startTime;
    this.detectionTime = detectionTime;
    this.detectionTimestamp = Date.now();

    return {
      region: this.region,
      isChina: this.region === 'cn',
      detectionTime,
      preferredMirror: this.region === 'cn' ? 'jsdelivr' : null
    };
  }

  /**
   * 获取当前区域（异步检测，同步返回）
   */
  getRegion(): Region {
    return this.region || 'global';
  }

  /**
   * 是否在中国大陆
   */
  isChinaRegion(): boolean {
    return this.region === 'cn';
  }

  /**
   * 判断是否需要使用镜像
   */
  shouldUseMirror(url: string): boolean {
    // 如果不在检测为中国区域，不使用镜像
    if (this.region !== 'cn') {
      return false;
    }

    // 检查是否是 GitHub 域名
    const githubDomains = [
      'github.com',
      'raw.githubusercontent.com',
      'gist.github.com',
      'api.github.com'
    ];

    try {
      const urlObj = new URL(url);
      return githubDomains.some(domain => urlObj.hostname.endsWith(domain));
    } catch {
      return false;
    }
  }

  /**
   * 解析 GitHub URL
   */
  private parseGitHubUrl(url: string): GitHubUrlParts {
    try {
      const urlObj = new URL(url);

      // 不是 GitHub 域名
      if (!urlObj.hostname.endsWith('github.com') &&
          !urlObj.hostname.endsWith('raw.githubusercontent.com')) {
        return { type: 'unknown' };
      }

      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      // raw.githubusercontent.com
      if (urlObj.hostname.endsWith('raw.githubusercontent.com')) {
        // 格式: /owner/repo/branch/path
        if (pathParts.length >= 3) {
          return {
            owner: pathParts[0],
            repo: pathParts[1],
            branch: pathParts[2],
            path: pathParts.slice(3).join('/'),
            type: 'raw'
          };
        }
      }

      // github.com
      if (pathParts.length >= 2) {
        const owner = pathParts[0];
        const repo = pathParts[1];

        // 检查是文件还是仓库
        if (pathParts[2] === 'blob' || pathParts[2] === 'tree') {
          return {
            owner,
            repo,
            branch: pathParts[3],
            path: pathParts.slice(4).join('/'),
            type: 'file'
          };
        }

        if (pathParts[2] === 'raw') {
          return {
            owner,
            repo,
            branch: pathParts[3],
            path: pathParts.slice(4).join('/'),
            type: 'raw'
          };
        }

        // 只是仓库主页
        return {
          owner,
          repo,
          type: 'repo'
        };
      }

      return { type: 'unknown' };
    } catch {
      return { type: 'unknown' };
    }
  }

  /**
   * 转换为镜像 URL
   */
  toMirrorUrl(url: string, mirrorType: MirrorType = 'jsdelivr'): string | null {
    const parsed = this.parseGitHubUrl(url);

    if (parsed.type === 'unknown' || !parsed.owner || !parsed.repo) {
      return null;
    }

    const { owner, repo, branch = 'main', path } = parsed;

    switch (mirrorType) {
      case 'jsdelivr':
        // jsDelivr: https://fastly.jsdelivr.net/gh/owner/repo@branch/path
        if (path) {
          return `https://fastly.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
        }
        // 默认返回 README
        return `https://fastly.jsdelivr.net/gh/${owner}/${repo}@${branch}/README.md`;

      case 'ghproxy':
        // ghproxy: https://ghproxy.com/原始URL
        return `https://ghproxy.com/${url}`;

      case 'gitclone':
        // gitclone: https://gitclone.com/github.com/owner/repo.git
        return `https://gitclone.com/github.com/${owner}/${repo}.git`;

      default:
        return null;
    }
  }

  /**
   * 诊断网络错误
   */
  diagnoseError(error: Error, url: string): NetworkError {
    const message = error.message.toLowerCase();

    // 超时
    if (message.includes('timeout') || message.includes('timed out')) {
      const mirrorUrl = this.toMirrorUrl(url, 'jsdelivr');
      return {
        type: 'timeout',
        url,
        shouldRetry: true,
        suggestedMirror: mirrorUrl || undefined
      };
    }

    // DNS 解析失败
    if (message.includes('dns') ||
        message.includes('err_name_not_resolved') ||
        message.includes('could not resolve')) {
      const mirrorUrl = this.toMirrorUrl(url, 'jsdelivr');
      return {
        type: 'dns',
        url,
        shouldRetry: true,
        suggestedMirror: mirrorUrl || undefined
      };
    }

    // 连接被拒绝
    if (message.includes('connection refused') ||
        message.includes('err_connection_refused') ||
        message.includes('econnrefused')) {
      const mirrorUrl = this.toMirrorUrl(url, 'jsdelivr');
      return {
        type: 'connection_refused',
        url,
        shouldRetry: true,
        suggestedMirror: mirrorUrl || undefined
      };
    }

    // SSL 错误
    if (message.includes('ssl') ||
        message.includes('certificate') ||
        message.includes('cert')) {
      return {
        type: 'ssl',
        url,
        shouldRetry: false
      };
    }

    return {
      type: 'unknown',
      url,
      shouldRetry: false
    };
  }

  /**
   * 获取推荐的镜像类型
   */
  getPreferredMirror(): MirrorType | null {
    if (this.region !== 'cn') {
      return null;
    }
    return 'jsdelivr';
  }

  /**
   * 重置检测状态
   */
  reset(): void {
    this.region = null;
    this.detectionTime = null;
    this.detectionTimestamp = null;
  }

  /**
   * 获取检测状态信息
   */
  getStatus(): {
    region: Region | null;
    detectionTime: number | null;
    age: number | null;
  } {
    return {
      region: this.region,
      detectionTime: this.detectionTime,
      age: this.detectionTimestamp ? Date.now() - this.detectionTimestamp : null
    };
  }
}

/**
 * 单例实例
 */
let instance: NetworkHelper | null = null;

/**
 * 获取单例实例
 */
export function getNetworkHelper(): NetworkHelper {
  if (!instance) {
    instance = new NetworkHelper();
  }
  return instance;
}

/**
 * 便捷函数：检测区域
 */
export async function detectNetworkRegion(): Promise<NetworkDetectionResult> {
  return getNetworkHelper().detectRegion();
}

/**
 * 便捷函数：是否需要镜像
 */
export function shouldUseMirror(url: string): boolean {
  return getNetworkHelper().shouldUseMirror(url);
}

/**
 * 便捷函数：转换为镜像 URL
 */
export function toMirrorUrl(url: string, mirrorType?: MirrorType): string | null {
  return getNetworkHelper().toMirrorUrl(url, mirrorType);
}

/**
 * 便捷函数：诊断错误
 */
export function diagnoseNetworkError(error: Error, url: string): NetworkError {
  return getNetworkHelper().diagnoseError(error, url);
}

export default NetworkHelper;
