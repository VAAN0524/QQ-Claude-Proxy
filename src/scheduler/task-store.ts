/**
 * 定时任务持久化存储
 *
 * 功能:
 * 1. 保存/加载任务到文件
 * 2. 自动备份防止数据损坏
 * 3. 支持任务增删改查
 * 4. 版本控制和数据迁移
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import type {
  Task,
  TaskType,
  CreateTaskParams,
  UpdateTaskParams,
  TaskStatistics,
} from './types.js';
import { TaskStatus } from './types.js';

/**
 * 序列化的任务格式 (移除运行时状态)
 */
interface SerializedTask {
  id: string;
  name: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  command: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  enabled: boolean;
  notifyQQ: boolean;
  notifyTarget?: string;
  saveResult: boolean;
  resultDir?: string;
  executionHistory: Array<{
    taskId: string;
    startTime: number;
    endTime: number;
    success: boolean;
    output?: string;
    error?: string;
    duration: number;
    resultFilePath?: string;
  }>;
  nextExecutionTime?: number;
  lastExecutionTime?: number;
  executionCount: number;
  failureCount: number;
  periodicConfig?: {
    interval: number;
    runImmediately?: boolean;
    maxRuns?: number | null;
    continueOnError?: boolean;
  };
  scheduledConfig?: {
    scheduledTime: number;
  };
}

/**
 * 存储文件格式
 */
interface StorageData {
  version: number;
  savedAt: number;
  tasks: SerializedTask[];
}

/**
 * 任务存储选项
 */
export interface TaskStoreOptions {
  /** 存储目录路径 */
  storagePath: string;
  /** 任务文件名 (默认: tasks.json) */
  fileName?: string;
  /** 备份文件名 (默认: tasks.backup.json) */
  backupFileName?: string;
  /** 最大历史记录数 (默认: 100) */
  maxHistorySize?: number;
}

/**
 * 任务存储类
 */
export class TaskStore {
  private storagePath: string;
  private tasksFilePath: string;
  private backupFilePath: string;
  private maxHistorySize: number;
  private tasks: Map<string, Task> = new Map();

  // 版本号
  private readonly VERSION = 1;

  constructor(options: TaskStoreOptions) {
    this.storagePath = options.storagePath;
    this.tasksFilePath = resolve(this.storagePath, options.fileName || 'tasks.json');
    this.backupFilePath = resolve(this.storagePath, options.backupFileName || 'tasks.backup.json');
    this.maxHistorySize = options.maxHistorySize || 100;
  }

  /**
   * 初始化存储
   */
  async initialize(): Promise<void> {
    try {
      // 确保存储目录存在
      await fs.mkdir(this.storagePath, { recursive: true });

      // 尝试加载任务
      await this.load();
      logger.info(`[TaskStore] 初始化完成，加载了 ${this.tasks.size} 个任务`);
    } catch (error) {
      logger.error(`[TaskStore] 初始化失败: ${error}`);
    }
  }

  /**
   * 创建新任务
   */
  async createTask(params: CreateTaskParams): Promise<Task> {
    const now = Date.now();
    const taskId = uuidv4();

    const baseTask = {
      id: taskId,
      name: params.name,
      description: params.description,
      type: params.type,
      status: TaskStatus.PENDING,
      command: params.command,
      createdAt: now,
      createdBy: params.createdBy,
      updatedAt: now,
      enabled: params.enabled ?? true,
      notifyQQ: params.notifyQQ ?? false,
      notifyTarget: params.notifyTarget,
      saveResult: params.saveResult ?? true,
      resultDir: params.resultDir,
      executionHistory: [],
      executionCount: 0,
      failureCount: 0,
    };

    let task: Task;

    if (params.type === 'periodic' && params.periodicConfig) {
      task = {
        ...baseTask,
        type: 'periodic',
        periodicConfig: params.periodicConfig,
        nextExecutionTime: params.periodicConfig.runImmediately ? now : now + params.periodicConfig.interval,
      } as Task;
    } else if (params.type === 'scheduled' && params.scheduledConfig) {
      task = {
        ...baseTask,
        type: 'scheduled',
        scheduledConfig: params.scheduledConfig,
        nextExecutionTime: params.scheduledConfig.scheduledTime,
      } as Task;
    } else {
      throw new Error('无效的任务配置');
    }

    this.tasks.set(taskId, task);
    await this.save();

    logger.info(`[TaskStore] 创建任务: ${task.name} (${taskId})`);
    return task;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 按类型获取任务
   */
  getTasksByType(type: TaskType): Task[] {
    return this.getAllTasks().filter(t => t.type === type);
  }

  /**
   * 按状态获取任务
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter(t => t.status === status);
  }

  /**
   * 获取启用的任务
   */
  getEnabledTasks(): Task[] {
    return this.getAllTasks().filter(t => t.enabled);
  }

  /**
   * 更新任务
   */
  async updateTask(taskId: string, params: UpdateTaskParams): Promise<Task | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    // 更新字段
    if (params.name !== undefined) task.name = params.name;
    if (params.description !== undefined) task.description = params.description;
    if (params.command !== undefined) task.command = params.command;
    if (params.enabled !== undefined) task.enabled = params.enabled;
    if (params.notifyQQ !== undefined) task.notifyQQ = params.notifyQQ;
    if (params.notifyTarget !== undefined) task.notifyTarget = params.notifyTarget;
    if (params.saveResult !== undefined) task.saveResult = params.saveResult;
    if (params.resultDir !== undefined) task.resultDir = params.resultDir;

    // 更新配置
    if (task.type === 'periodic' && params.periodicConfig) {
      (task as any).periodicConfig = { ...task.periodicConfig, ...params.periodicConfig };
    }
    if (task.type === 'scheduled' && params.scheduledConfig) {
      (task as any).scheduledConfig = { ...task.scheduledConfig, ...params.scheduledConfig };
    }

    task.updatedAt = Date.now();
    this.tasks.set(taskId, task);
    await this.save();

    logger.info(`[TaskStore] 更新任务: ${task.name} (${taskId})`);
    return task;
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<boolean> {
    const deleted = this.tasks.delete(taskId);
    if (deleted) {
      await this.save();
      logger.info(`[TaskStore] 删除任务: ${taskId}`);
    }
    return deleted;
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.status = status;
    task.updatedAt = Date.now();
    this.tasks.set(taskId, task);
    await this.save();

    return true;
  }

  /**
   * 添加执行历史
   */
  async addExecutionHistory(taskId: string, result: any): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.executionHistory.push(result);
    task.executionCount++;
    if (!result.success) {
      task.failureCount++;
    }
    task.lastExecutionTime = result.endTime;

    // 限制历史记录大小
    if (task.executionHistory.length > this.maxHistorySize) {
      task.executionHistory = task.executionHistory.slice(-this.maxHistorySize);
    }

    // 对于周期任务，计算下次执行时间
    if (task.type === 'periodic' && task.status !== TaskStatus.PAUSED && task.status !== TaskStatus.CANCELLED) {
      const interval = task.periodicConfig.interval;
      task.nextExecutionTime = Date.now() + interval;
      task.status = TaskStatus.PENDING;
    }

    task.updatedAt = Date.now();
    this.tasks.set(taskId, task);
    await this.save();

    return true;
  }

  /**
   * 计算下次执行时间
   */
  updateNextExecutionTime(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    if (task.type === 'periodic') {
      task.nextExecutionTime = Date.now() + task.periodicConfig.interval;
    }
  }

  /**
   * 获取任务统计
   */
  getStatistics(): TaskStatistics {
    const tasks = this.getAllTasks();
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let todayExecutions = 0;
    let totalExecutions = 0;
    let successExecutions = 0;
    let failedExecutions = 0;

    for (const task of tasks) {
      for (const result of task.executionHistory) {
        totalExecutions++;
        if (result.endTime >= todayStart.getTime()) {
          todayExecutions++;
        }
        if (result.success) {
          successExecutions++;
        } else {
          failedExecutions++;
        }
      }
    }

    return {
      totalTasks: tasks.length,
      periodicTasks: tasks.filter(t => t.type === 'periodic').length,
      scheduledTasks: tasks.filter(t => t.type === 'scheduled').length,
      enabledTasks: tasks.filter(t => t.enabled).length,
      runningTasks: tasks.filter(t => t.status === TaskStatus.RUNNING).length,
      pendingTasks: tasks.filter(t => t.status === TaskStatus.PENDING).length,
      todayExecutions,
      totalExecutions,
      successExecutions,
      failedExecutions,
    };
  }

  /**
   * 保存到文件
   */
  async save(): Promise<void> {
    try {
      const data: StorageData = {
        version: this.VERSION,
        savedAt: Date.now(),
        tasks: Array.from(this.tasks.values()).map(this.serializeTask),
      };

      // 先备份
      try {
        await fs.access(this.tasksFilePath);
        await fs.copyFile(this.tasksFilePath, this.backupFilePath);
      } catch {
        // 文件不存在，无需备份
      }

      // 写入新内容
      await fs.writeFile(this.tasksFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      logger.error(`[TaskStore] 保存失败: ${error}`);
      throw error;
    }
  }

  /**
   * 从文件加载
   */
  async load(): Promise<void> {
    try {
      // 先尝试主文件
      let content = await this.safeReadFile(this.tasksFilePath);

      // 如果主文件损坏，尝试备份
      if (!content) {
        logger.warn('[TaskStore] 主文件损坏，尝试备份...');
        content = await this.safeReadFile(this.backupFilePath);
      }

      if (!content) {
        logger.info('[TaskStore] 无历史数据，使用空存储');
        return;
      }

      const data = JSON.parse(content) as StorageData;

      // 验证版本
      if (data.version !== this.VERSION) {
        logger.warn(`[TaskStore] 版本不匹配: file=${data.version}, current=${this.VERSION}`);
        // 可以在这里添加版本迁移逻辑
      }

      // 反序列化任务
      this.tasks.clear();
      for (const taskData of data.tasks) {
        const task = this.deserializeTask(taskData);
        this.tasks.set(task.id, task);
      }

      logger.info(`[TaskStore] 加载了 ${this.tasks.size} 个任务`);
    } catch (error) {
      logger.error(`[TaskStore] 加载失败: ${error}`);
    }
  }

  /**
   * 序列化任务
   */
  private serializeTask(task: Task): SerializedTask {
    return {
      id: task.id,
      name: task.name,
      description: task.description,
      type: task.type,
      status: task.status,
      command: task.command,
      createdAt: task.createdAt,
      createdBy: task.createdBy,
      updatedAt: task.updatedAt,
      enabled: task.enabled,
      notifyQQ: task.notifyQQ,
      notifyTarget: task.notifyTarget,
      saveResult: task.saveResult,
      resultDir: task.resultDir,
      executionHistory: task.executionHistory,
      nextExecutionTime: task.nextExecutionTime,
      lastExecutionTime: task.lastExecutionTime,
      executionCount: task.executionCount,
      failureCount: task.failureCount,
      periodicConfig: task.type === 'periodic' ? task.periodicConfig : undefined,
      scheduledConfig: task.type === 'scheduled' ? task.scheduledConfig : undefined,
    };
  }

  /**
   * 反序列化任务
   */
  private deserializeTask(data: SerializedTask): Task {
    if (data.type === 'periodic') {
      return {
        ...data,
        periodicConfig: data.periodicConfig!,
      } as any;
    } else {
      return {
        ...data,
        scheduledConfig: data.scheduledConfig!,
      } as any;
    }
  }

  /**
   * 安全读取文件
   */
  private async safeReadFile(filePath: string): Promise<string | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // 验证 JSON 格式
      JSON.parse(content);
      return content;
    } catch {
      return null;
    }
  }

  /**
   * 清除所有任务
   */
  async clear(): Promise<void> {
    this.tasks.clear();
    await this.save();
    logger.info('[TaskStore] 已清除所有任务');
  }
}

/**
 * 创建任务存储实例
 */
export function createTaskStore(options: TaskStoreOptions): TaskStore {
  return new TaskStore(options);
}
