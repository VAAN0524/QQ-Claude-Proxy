/**
 * 记忆文件监听器
 *
 * 借鉴自 OpenClaw 的文件监听设计:
 * - 监听 memory 目录变化
 * - 防抖处理 (默认 1.5s)
 * - 自动触发索引更新
 *
 * @example
 * ```typescript
 * const watcher = new MemoryWatcher({
 *   watchPath: './data/memory',
 *   onChange: async (type, filePath) => {
 *     await memoryService.handleFileChange(type, filePath);
 *   },
 * });
 * watcher.start();
 * ```
 */

import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import { logger } from '../../utils/logger.js';

/**
 * 文件变化类型
 */
export type FileChangeType = 'add' | 'change' | 'unlink';

/**
 * 文件变化事件
 */
export interface FileChangeEvent {
  /** 变化类型 */
  type: FileChangeType;
  /** 文件路径 */
  filePath: string;
  /** 事件时间戳 */
  timestamp: Date;
}

/**
 * 监听器配置
 */
export interface MemoryWatcherOptions {
  /** 监听路径 */
  watchPath: string;
  /** 防抖延迟（毫秒），默认 1500 */
  debounce?: number;
  /** 变化回调 */
  onChange: (event: FileChangeEvent) => void | Promise<void>;
  /** 忽略的文件模式 (glob) */
  ignored?: Parameters<typeof chokidar.watch>[1]['ignored'];
  /** 监听深度 (undefined=无限, 0=不递归) */
  depth?: number;
  /** 启动时的回调 */
  onReady?: () => void | Promise<void>;
  /** 错误回调 */
  onError?: (error: Error) => void | Promise<void>;
}

/**
 * 记忆文件监听器类
 */
export class MemoryWatcher {
  private watcher?: FSWatcher;
  private debounceTimer?: NodeJS.Timeout;
  private pendingChanges = new Map<string, FileChangeType>();
  private readonly debounceMs: number;
  private isWatching = false;

  constructor(private options: MemoryWatcherOptions) {
    this.debounceMs = options.debounce || 1500;
  }

  /**
   * 启动监听
   */
  start(): void {
    if (this.isWatching) {
      logger.warn('[MemoryWatcher] 已经在运行中');
      return;
    }

    logger.info(`[MemoryWatcher] 启动监听: ${this.options.watchPath}`);

    // chokidar 默认递归监听，使用 depth 控制深度
    const depth = this.options.depth !== undefined ? this.options.depth : undefined;

    this.watcher = chokidar.watch(this.options.watchPath, {
      ignored: this.options.ignored || /(^|[\/\\])\../,  // 默认忽略隐藏文件
      persistent: true,
      ignoreInitial: true,  // 忽略初始扫描，只监听变化
      awaitWriteFinish: {
        stabilityThreshold: 2000,  // 文件稳定 2 秒后才触发
        pollInterval: 100,          // 每 100ms 检查一次
      },
      depth,
    });

    // 绑定事件
    this.watcher
      .on('add', (path) => this.scheduleChange('add', path))
      .on('change', (path) => this.scheduleChange('change', path))
      .on('unlink', (path) => this.scheduleChange('unlink', path))
      .on('ready', () => this.handleReady())
      .on('error', (error) => this.handleError(error));

    this.isWatching = true;
  }

  /**
   * 调度变更（防抖）
   *
   * 同一个文件的多次变更会被合并，只在最后一次变更后 debounceMs 毫秒执行
   */
  private scheduleChange(type: FileChangeType, filePath: string): void {
    // 记录变更类型（后到的类型会覆盖）
    this.pendingChanges.set(filePath, type);

    // 重置定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      await this.processPendingChanges();
    }, this.debounceMs);

    logger.debug(`[MemoryWatcher] 调度变更: ${type} - ${filePath}`);
  }

  /**
   * 处理待处理的变更
   */
  private async processPendingChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) {
      return;
    }

    const changes = Array.from(this.pendingChanges.entries());
    this.pendingChanges.clear();

    logger.info(`[MemoryWatcher] 处理 ${changes.length} 个文件变化`);

    for (const [filePath, type] of changes) {
      const event: FileChangeEvent = {
        type,
        filePath,
        timestamp: new Date(),
      };

      try {
        await this.options.onChange(event);
      } catch (error) {
        logger.error(`[MemoryWatcher] 处理失败: ${filePath} - ${error}`);
      }
    }
  }

  /**
   * 处理 ready 事件
   */
  private async handleReady(): Promise<void> {
    logger.info('[MemoryWatcher] 监听器已就绪');

    if (this.options.onReady) {
      try {
        await this.options.onReady();
      } catch (error) {
        logger.error(`[MemoryWatcher] onReady 回调失败: ${error}`);
      }
    }
  }

  /**
   * 处理错误
   */
  private async handleError(error: unknown): Promise<void> {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`[MemoryWatcher] 错误: ${err.message}`);

    if (this.options.onError) {
      try {
        await this.options.onError(err);
      } catch (callbackError) {
        logger.error(`[MemoryWatcher] onError 回调失败: ${callbackError}`);
      }
    }
  }

  /**
   * 添加监听路径
   */
  addPath(path: string): void {
    this.watcher?.add(path);
    logger.debug(`[MemoryWatcher] 添加监听路径: ${path}`);
  }

  /**
   * 移除监听路径
   */
  unwatch(path: string): void {
    this.watcher?.unwatch(path);
    logger.debug(`[MemoryWatcher] 移除监听路径: ${path}`);
  }

  /**
   * 获取监听的路径列表
   */
  getWatchedPaths(): string[] {
    const watched = this.watcher?.getWatched();
    if (!watched) return [];

    // 将 Record<string, string[]> 转换为 string[]
    const paths: string[] = [];
    for (const [dir, files] of Object.entries(watched)) {
      paths.push(dir);
      paths.push(...files);
    }
    return paths;
  }

  /**
   * 停止监听
   */
  async stop(): Promise<void> {
    if (!this.isWatching) {
      return;
    }

    logger.info('[MemoryWatcher] 停止监听');

    // 清理定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    // 处理剩余的变更
    if (this.pendingChanges.size > 0) {
      logger.info(`[MemoryWatcher] 处理剩余 ${this.pendingChanges.size} 个变更`);
      await this.processPendingChanges();
    }

    // 关闭监听器
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }

    this.isWatching = false;
  }

  /**
   * 检查是否正在监听
   */
  isActive(): boolean {
    return this.isWatching;
  }
}

/**
 * 创建并启动一个监听器
 *
 * @param options - 监听器配置
 * @returns 监听器实例
 */
export function createMemoryWatcher(options: MemoryWatcherOptions): MemoryWatcher {
  const watcher = new MemoryWatcher(options);
  watcher.start();
  return watcher;
}

export default MemoryWatcher;
