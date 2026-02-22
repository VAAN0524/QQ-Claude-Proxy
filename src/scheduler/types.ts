/**
 * 定时任务模块类型定义
 *
 * 支持两种任务类型:
 * 1. 周期任务 (PeriodicTask) - 按固定间隔重复执行
 * 2. 定时任务 (ScheduledTask) - 在指定时间执行一次
 */

/**
 * 任务类型
 */
export enum TaskType {
  /** 周期任务 - 按固定间隔重复执行 */
  PERIODIC = 'periodic',
  /** 定时任务 - 在指定时间执行一次 */
  SCHEDULED = 'scheduled',
}

/**
 * 任务状态
 */
export enum TaskStatus {
  /** 等待执行 */
  PENDING = 'pending',
  /** 正在执行 */
  RUNNING = 'running',
  /** 已完成 */
  COMPLETED = 'completed',
  /** 执行失败 */
  FAILED = 'failed',
  /** 已取消 */
  CANCELLED = 'cancelled',
  /** 已暂停 (仅周期任务) */
  PAUSED = 'paused',
}

/**
 * 任务执行结果
 */
export interface TaskResult {
  /** 任务ID */
  taskId: string;
  /** 执行开始时间 */
  startTime: number;
  /** 执行结束时间 */
  endTime: number;
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  output?: string;
  /** 错误信息 */
  error?: string;
  /** 执行时长 (毫秒) */
  duration: number;
  /** 结果文件路径 (如果保存了结果) */
  resultFilePath?: string;
}

/**
 * 周期任务配置
 */
export interface PeriodicTaskConfig {
  /** 执行间隔 (毫秒) */
  interval: number;
  /** 是否在启动时立即执行一次 */
  runImmediately?: boolean;
  /** 最大执行次数 (可选，null 表示无限执行) */
  maxRuns?: number | null;
  /** 是否在失败后继续执行 */
  continueOnError?: boolean;
}

/**
 * 定时任务配置
 */
export interface ScheduledTaskConfig {
  /** 执行时间 (Unix 时间戳，毫秒) */
  scheduledTime: number;
}

/**
 * 定时任务基础接口
 */
export interface BaseTask {
  /** 唯一标识符 */
  id: string;
  /** 任务名称 */
  name: string;
  /** 任务描述 */
  description?: string;
  /** 任务类型 */
  type: TaskType;
  /** 任务状态 */
  status: TaskStatus;
  /** 要执行的 Claude CLI 命令/提示词 */
  command: string;
  /** 创建时间 */
  createdAt: number;
  /** 创建者 (用户ID) */
  createdBy: string;
  /** 最后更新时间 */
  updatedAt: number;
  /** 是否启用 */
  enabled: boolean;
  /** 是否发送QQ通知 */
  notifyQQ: boolean;
  /** QQ通知目标 (用户ID或群组ID) */
  notifyTarget?: string;
  /** 是否保存结果到文件 */
  saveResult: boolean;
  /** 结果保存目录 */
  resultDir?: string;
  /** 执行历史 */
  executionHistory: TaskResult[];
  /** 下次执行时间 (毫秒时间戳) */
  nextExecutionTime?: number;
  /** 上次执行时间 (毫秒时间戳) */
  lastExecutionTime?: number;
  /** 已执行次数 */
  executionCount: number;
  /** 失败次数 */
  failureCount: number;
}

/**
 * 周期任务
 */
export interface PeriodicTask extends BaseTask {
  type: TaskType.PERIODIC;
  /** 周期任务配置 */
  periodicConfig: PeriodicTaskConfig;
}

/**
 * 定时任务
 */
export interface ScheduledTask extends BaseTask {
  type: TaskType.SCHEDULED;
  /** 定时任务配置 */
  scheduledConfig: ScheduledTaskConfig;
}

/**
 * 任务联合类型
 */
export type Task = PeriodicTask | ScheduledTask;

/**
 * 任务创建参数
 */
export interface CreateTaskParams {
  name: string;
  description?: string;
  type: TaskType;
  command: string;
  createdBy: string;
  enabled?: boolean;
  notifyQQ?: boolean;
  notifyTarget?: string;
  saveResult?: boolean;
  resultDir?: string;
  periodicConfig?: PeriodicTaskConfig;
  scheduledConfig?: ScheduledTaskConfig;
}

/**
 * 任务更新参数
 */
export interface UpdateTaskParams {
  name?: string;
  description?: string;
  command?: string;
  enabled?: boolean;
  notifyQQ?: boolean;
  notifyTarget?: string;
  saveResult?: boolean;
  resultDir?: string;
  periodicConfig?: Partial<PeriodicTaskConfig>;
  scheduledConfig?: Partial<ScheduledTaskConfig>;
}

/**
 * 任务统计信息
 */
export interface TaskStatistics {
  /** 总任务数 */
  totalTasks: number;
  /** 周期任务数 */
  periodicTasks: number;
  /** 定时任务数 */
  scheduledTasks: number;
  /** 启用的任务数 */
  enabledTasks: number;
  /** 运行中的任务数 */
  runningTasks: number;
  /** 等待执行的任务数 */
  pendingTasks: number;
  /** 今日已执行任务数 */
  todayExecutions: number;
  /** 总执行次数 */
  totalExecutions: number;
  /** 成功执行次数 */
  successExecutions: number;
  /** 失败执行次数 */
  failedExecutions: number;
}

/**
 * 调度器配置
 */
export interface SchedulerConfig {
  /** 是否启用调度器 */
  enabled: boolean;
  /** 任务数据存储路径 */
  storagePath: string;
  /** 结果保存目录 */
  resultDir: string;
  /** 最大并发执行任务数 */
  maxConcurrentTasks: number;
  /** 任务执行超时时间 (毫秒，默认30分钟) */
  taskTimeout: number;
  /** 心跳间隔 (毫秒) */
  heartbeatInterval: number;
}
