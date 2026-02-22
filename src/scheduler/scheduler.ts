/**
 * 定时任务调度器
 *
 * 功能:
 * 1. 管理周期任务和定时任务的调度
 * 2. 在指定时间触发任务执行
 * 3. 支持任务的启动、停止、暂停
 * 4. 提供任务状态查询接口
 */

import { logger } from '../utils/logger.js';
import type { Task, TaskType, TaskStatistics, SchedulerConfig, TaskResult } from './types.js';
import { TaskStatus } from './types.js';
import { TaskStore } from './task-store.js';
import { TaskRunner } from './task-runner.js';

/**
 * QQ 消息发送回调类型
 */
type SendMessageCallback = (userId: string, content: string, groupId?: string) => Promise<void>;

/**
 * 调度器选项
 */
export interface SchedulerOptions extends SchedulerConfig {
  /** QQ 消息发送回调 */
  sendMessageCallback?: SendMessageCallback;
}

/**
 * 调度器状态
 */
enum SchedulerStatus {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
}

/**
 * 定时任务调度器
 */
export class Scheduler {
  private config: SchedulerOptions;
  private taskStore: TaskStore;
  private taskRunner: TaskRunner;
  private sendMessageCallback?: SendMessageCallback;

  private status: SchedulerStatus = SchedulerStatus.STOPPED;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private runningTasks: Set<string> = new Set();
  private stopRequested: boolean = false;

  constructor(options: SchedulerOptions) {
    this.config = options;
    this.taskStore = new TaskStore({
      storagePath: options.storagePath,
      maxHistorySize: 100,
    });
    this.taskRunner = new TaskRunner({
      workspacePath: process.cwd(),
      resultDir: options.resultDir,
      taskTimeout: options.taskTimeout,
      maxResultFileSize: 10 * 1024 * 1024, // 10MB
    });
    this.sendMessageCallback = options.sendMessageCallback;
  }

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this.status !== SchedulerStatus.STOPPED) {
      logger.warn('[Scheduler] 调度器已在运行中');
      return;
    }

    this.status = SchedulerStatus.STARTING;
    logger.info('[Scheduler] 正在启动调度器...');

    try {
      // 初始化任务存储
      await this.taskStore.initialize();

      // 重置所有运行中的任务状态为等待执行
      const runningTasks = this.taskStore.getTasksByStatus(TaskStatus.RUNNING);
      for (const task of runningTasks) {
        await this.taskStore.updateTaskStatus(task.id, TaskStatus.PENDING);
      }

      // 启动心跳
      this.startHeartbeat();

      this.status = SchedulerStatus.RUNNING;
      this.stopRequested = false;

      logger.info('[Scheduler] 调度器启动成功');
    } catch (error) {
      this.status = SchedulerStatus.STOPPED;
      logger.error(`[Scheduler] 启动失败: ${error}`);
      throw error;
    }
  }

  /**
   * 停止调度器
   */
  async stop(): Promise<void> {
    if (this.status !== SchedulerStatus.RUNNING) {
      return;
    }

    this.status = SchedulerStatus.STOPPING;
    this.stopRequested = true;
    logger.info('[Scheduler] 正在停止调度器...');

    // 停止心跳
    this.stopHeartbeat();

    // 等待正在运行的任务完成 (最多等待30秒)
    const maxWait = 30000;
    const startTime = Date.now();
    while (this.runningTasks.size > 0 && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.runningTasks.size > 0) {
      logger.warn(`[Scheduler] 强制停止，仍有 ${this.runningTasks.size} 个任务在运行`);
    }

    // 清理任务执行器
    this.taskRunner.cleanup();

    this.status = SchedulerStatus.STOPPED;
    logger.info('[Scheduler] 调度器已停止');
  }

  /**
   * 创建任务
   */
  async createTask(params: any): Promise<Task> {
    return await this.taskStore.createTask(params);
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): Task | undefined {
    return this.taskStore.getTask(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): Task[] {
    return this.taskStore.getAllTasks();
  }

  /**
   * 更新任务
   */
  async updateTask(taskId: string, params: any): Promise<Task | null> {
    return await this.taskStore.updateTask(taskId, params);
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<boolean> {
    // 如果任务正在运行，先取消
    if (this.runningTasks.has(taskId)) {
      this.taskRunner.cancelTask(taskId);
      this.runningTasks.delete(taskId);
    }
    return await this.taskStore.deleteTask(taskId);
  }

  /**
   * 暂停周期任务
   */
  async pauseTask(taskId: string): Promise<boolean> {
    const task = this.taskStore.getTask(taskId);
    if (!task || task.type !== 'periodic') {
      return false;
    }
    return await this.taskStore.updateTaskStatus(taskId, TaskStatus.PAUSED);
  }

  /**
   * 恢复周期任务
   */
  async resumeTask(taskId: string): Promise<boolean> {
    const task = this.taskStore.getTask(taskId);
    if (!task || task.type !== 'periodic') {
      return false;
    }
    return await this.taskStore.updateTaskStatus(taskId, TaskStatus.PENDING);
  }

  /**
   * 立即执行任务
   */
  async executeTaskNow(taskId: string): Promise<boolean> {
    const task = this.taskStore.getTask(taskId);
    if (!task) {
      logger.warn(`[Scheduler] 任务不存在: ${taskId}`);
      return false;
    }

    // 如果任务已在运行，不重复执行
    if (this.runningTasks.has(taskId)) {
      logger.warn(`[Scheduler] 任务已在运行中: ${task.name} (${task.id})`);
      return false;
    }

    // 检查并发限制
    if (this.runningTasks.size >= this.config.maxConcurrentTasks) {
      logger.warn(`[Scheduler] 达到最大并发任务数: ${this.config.maxConcurrentTasks}`);
      return false;
    }

    logger.info(`[Scheduler] 手动执行任务: ${task.name} (${task.id}), 原状态: ${task.status}`);

    // 异步执行任务
    this.runTask(task);
    return true;
  }

  /**
   * 获取统计信息
   */
  getStatistics(): TaskStatistics {
    return this.taskStore.getStatistics();
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      await this.heartbeat();
    }, this.config.heartbeatInterval);

    logger.info(`[Scheduler] 心跳已启动，间隔: ${this.config.heartbeatInterval}ms`);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 心跳处理 - 检查并执行到期的任务
   */
  private async heartbeat(): Promise<void> {
    if (this.status !== SchedulerStatus.RUNNING || this.stopRequested) {
      return;
    }

    try {
      const now = Date.now();
      const enabledTasks = this.taskStore.getEnabledTasks();

      // 清理僵尸任务：状态为 running 但不在 runningTasks 中的任务
      for (const task of enabledTasks) {
        if (task.status === TaskStatus.RUNNING && !this.runningTasks.has(task.id)) {
          logger.warn(`[Scheduler] 发现僵尸任务，重置状态: ${task.name} (${task.id})`);
          await this.taskStore.updateTaskStatus(task.id, TaskStatus.PENDING);

          // 为周期任务重新计算下次执行时间
          if (task.type === 'periodic' && task.periodicConfig) {
            const nextTime = now + task.periodicConfig.interval;
            await this.taskStore.updateTask(task.id, {
              nextExecutionTime: nextTime as any,
            } as any);
          }
        }
      }

      const pendingTasks = enabledTasks.filter(t =>
        t.status === TaskStatus.PENDING &&
        t.nextExecutionTime &&
        t.nextExecutionTime <= now
      );

      for (const task of pendingTasks) {
        // 检查并发限制
        if (this.runningTasks.size >= this.config.maxConcurrentTasks) {
          logger.warn(`[Scheduler] 达到最大并发任务数，跳过任务: ${task.name}`);
          break;
        }

        // 检查任务是否已在运行
        if (this.runningTasks.has(task.id)) {
          continue;
        }

        // 异步执行任务
        this.runTask(task);
      }
    } catch (error) {
      logger.error(`[Scheduler] 心跳处理错误: ${error}`);
    }
  }

  /**
   * 运行任务
   */
  private async runTask(task: Task): Promise<void> {
    this.runningTasks.add(task.id);
    await this.taskStore.updateTaskStatus(task.id, TaskStatus.RUNNING);

    logger.info(`[Scheduler] 执行任务: ${task.name} (${task.id})`);

    try {
      // 执行任务
      const result: TaskResult = await this.taskRunner.executeTask(task);

      // 记录执行历史
      await this.taskStore.addExecutionHistory(task.id, result);

      // 发送 QQ 通知
      if (task.notifyQQ && this.sendMessageCallback) {
        await this.sendNotification(task, result);
      }

      // 对于一次性任务，执行后禁用
      if (task.type === 'scheduled') {
        await this.taskStore.updateTaskStatus(task.id, TaskStatus.COMPLETED);
        task.enabled = false;
      }

      logger.info(`[Scheduler] 任务执行完成: ${task.name}, 成功: ${result.success}`);
    } catch (error) {
      logger.error(`[Scheduler] 任务执行异常: ${task.name}, 错误: ${error}`);

      // 记录失败结果
      const failureResult: TaskResult = {
        taskId: task.id,
        startTime: Date.now(),
        endTime: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };

      await this.taskStore.addExecutionHistory(task.id, failureResult);

      // 检查是否应该继续执行
      if (task.type === 'periodic' && !task.periodicConfig.continueOnError) {
        await this.taskStore.updateTaskStatus(task.id, TaskStatus.FAILED);
        task.enabled = false;
      }
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  /**
   * 发送 QQ 通知
   */
  private async sendNotification(task: Task, result: TaskResult): Promise<void> {
    if (!this.sendMessageCallback) {
      return;
    }

    // 如果 notifyTarget 为空或者是 "dashboard"，跳过通知
    // "dashboard" 是系统内部标识，不是真实的 QQ 用户 OpenID
    const notifyTarget = task.notifyTarget;
    if (!notifyTarget || notifyTarget === 'dashboard') {
      logger.info(`[Scheduler] 跳过 QQ 通知：${task.name} (notifyTarget="${notifyTarget}")`);
      return;
    }

    try {
      const status = result.success ? '✅ 成功' : '❌ 失败';
      const duration = (result.duration / 1000).toFixed(2);

      let message = `📋 定时任务执行通知\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `任务名称: ${task.name}\n`;
      message += `执行时间: ${new Date(result.startTime).toLocaleString('zh-CN')}\n`;
      message += `执行状态: ${status}\n`;
      message += `执行耗时: ${duration} 秒\n`;

      if (result.error) {
        message += `错误信息: ${result.error}\n`;
      }

      if (result.resultFilePath) {
        message += `结果文件: ${result.resultFilePath}\n`;
      }

      message += `━━━━━━━━━━━━━━━━━━━━━━`;

      await this.sendMessageCallback(notifyTarget, message);
      logger.info(`[Scheduler] 已发送 QQ 通知: ${task.name} -> ${notifyTarget}`);
    } catch (error) {
      logger.error(`[Scheduler] 发送 QQ 通知失败: ${error}`);
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus(): SchedulerStatus {
    return this.status;
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.status === SchedulerStatus.RUNNING;
  }
}

/**
 * 创建调度器实例
 */
export function createScheduler(options: SchedulerOptions): Scheduler {
  return new Scheduler(options);
}
