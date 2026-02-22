/**
 * Dashboard State 持久化存储
 *
 * 功能：
 * 1. 将 DashboardState 保存到文件
 * 2. 从文件加载 DashboardState
 * 3. 自动备份防止数据损坏
 * 4. 支持定期快照
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { logger } from '../utils/logger.js';
import type { DashboardState, TaskInfo } from './dashboard-api.js';

/**
 * 持久化存储配置
 */
export interface DashboardStateStoreOptions {
  /** 存储目录路径 */
  storagePath: string;
  /** 状态文件名 (默认: dashboard-state.json) */
  fileName?: string;
  /** 备份文件名 (默认: dashboard-state.backup.json) */
  backupFileName?: string;
  /** 自动快照间隔 (ms)，默认 60000 (1分钟) */
  autoSnapshotInterval?: number;
  /** 是否启用自动快照 */
  enableAutoSnapshot?: boolean;
}

/**
 * 序列化的状态格式（Map 转换为 Array）
 */
interface SerializedDashboardState {
  version: number;
  savedAt: number;
  tasks: Array<[string, TaskInfo]>;
  stats: {
    totalTasks: number;
    runningTasks: number;
    completedTasks: number;
    uptime: number;
    startTime: number;
  };
}

/**
 * Dashboard 状态持久化存储
 */
export class DashboardStateStore {
  private storagePath: string;
  private stateFilePath: string;
  private backupFilePath: string;
  private autoSnapshotInterval: number;
  private enableAutoSnapshot: boolean;
  private snapshotTimer: NodeJS.Timeout | null = null;
  private dirty: boolean = false;  // 标记状态是否有变更

  // 版本号，用于未来格式升级
  private readonly VERSION = 1;

  constructor(options: DashboardStateStoreOptions) {
    this.storagePath = options.storagePath;
    this.stateFilePath = resolve(this.storagePath, options.fileName || 'dashboard-state.json');
    this.backupFilePath = resolve(this.storagePath, options.backupFileName || 'dashboard-state.backup.json');
    this.autoSnapshotInterval = options.autoSnapshotInterval ?? 60000;
    this.enableAutoSnapshot = options.enableAutoSnapshot ?? true;
  }

  /**
   * 初始化存储（确保目录存在，加载状态）
   */
  async initialize(dashboardState: DashboardState): Promise<void> {
    try {
      // 确保存储目录存在
      await fs.mkdir(this.storagePath, { recursive: true });

      // 尝试加载之前的状态
      const loaded = await this.load();
      if (loaded) {
        // 合并加载的状态
        dashboardState.tasks = new Map(loaded.tasks);
        dashboardState.stats = loaded.stats;
        logger.info(`[DashboardStateStore] 已加载 ${loaded.tasks.length} 个任务记录`);
      } else {
        logger.info('[DashboardStateStore] 无历史状态，使用全新状态');
      }

      // 启动自动快照
      if (this.enableAutoSnapshot) {
        this.startAutoSnapshot(dashboardState);
      }
    } catch (error) {
      logger.error(`[DashboardStateStore] 初始化失败: ${error}`);
    }
  }

  /**
   * 保存状态到文件
   */
  async save(dashboardState: DashboardState): Promise<void> {
    try {
      const serialized: SerializedDashboardState = {
        version: this.VERSION,
        savedAt: Date.now(),
        tasks: Array.from(dashboardState.tasks.entries()),
        stats: { ...dashboardState.stats },
      };

      const content = JSON.stringify(serialized, null, 2);

      // 先备份现有文件（如果存在）
      try {
        await fs.access(this.stateFilePath);
        await fs.copyFile(this.stateFilePath, this.backupFilePath);
      } catch {
        // 文件不存在，无需备份
      }

      // 写入新内容
      await fs.writeFile(this.stateFilePath, content, 'utf-8');

      this.dirty = false;
      logger.debug(`[DashboardStateStore] 状态已保存: ${dashboardState.tasks.size} 个任务`);
    } catch (error) {
      logger.error(`[DashboardStateStore] 保存失败: ${error}`);
    }
  }

  /**
   * 从文件加载状态
   */
  async load(): Promise<SerializedDashboardState | null> {
    try {
      // 先尝试加载主文件
      let content = await this.safeReadFile(this.stateFilePath);

      // 如果主文件损坏，尝试备份
      if (!content) {
        logger.warn('[DashboardStateStore] 主状态文件损坏或不存在，尝试备份...');
        content = await this.safeReadFile(this.backupFilePath);
      }

      if (!content) {
        return null;
      }

      const parsed = JSON.parse(content) as SerializedDashboardState;

      // 验证版本
      if (parsed.version !== this.VERSION) {
        logger.warn(`[DashboardStateStore] 版本不匹配: file=${parsed.version}, current=${this.VERSION}`);
        // 可以在这里添加版本迁移逻辑
      }

      logger.info(`[DashboardStateStore] 状态加载成功: ${parsed.tasks.length} 个任务`);
      return parsed;
    } catch (error) {
      logger.error(`[DashboardStateStore] 加载失败: ${error}`);
      return null;
    }
  }

  /**
   * 安全读取文件（捕获解析错误）
   */
  private async safeReadFile(filePath: string): Promise<string | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // 验证 JSON 格式
      JSON.parse(content);
      return content;
    } catch (error) {
      logger.debug(`[DashboardStateStore] 读取文件失败 ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * 清除持久化状态
   */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.stateFilePath).catch(() => {});
      await fs.unlink(this.backupFilePath).catch(() => {});
      logger.info('[DashboardStateStore] 持久化状态已清除');
    } catch (error) {
      logger.error(`[DashboardStateStore] 清除失败: ${error}`);
    }
  }

  /**
   * 标记状态为脏（有变更）
   */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * 启动自动快照
   */
  private startAutoSnapshot(dashboardState: DashboardState): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
    }

    this.snapshotTimer = setInterval(async () => {
      if (this.dirty) {
        await this.save(dashboardState);
      }
    }, this.autoSnapshotInterval);

    logger.info(`[DashboardStateStore] 自动快照已启动: 间隔=${this.autoSnapshotInterval}ms`);
  }

  /**
   * 停止自动快照
   */
  stopAutoSnapshot(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
      logger.info('[DashboardStateStore] 自动快照已停止');
    }
  }

  /**
   * 销毁存储（停止快照并保存最终状态）
   */
  async destroy(dashboardState: DashboardState): Promise<void> {
    this.stopAutoSnapshot();
    if (this.dirty) {
      await this.save(dashboardState);
    }
  }

  /**
   * 获取状态文件路径
   */
  getStateFilePath(): string {
    return this.stateFilePath;
  }

  /**
   * 获取备份文件路径
   */
  getBackupFilePath(): string {
    return this.backupFilePath;
  }
}

/**
 * 创建存储实例
 */
export function createDashboardStateStore(options: DashboardStateStoreOptions): DashboardStateStore {
  return new DashboardStateStore(options);
}
