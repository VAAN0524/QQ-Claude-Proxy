/**
 * 任务执行器
 *
 * 负责执行定时任务中的 Claude CLI 命令，捕获输出并保存结果
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { logger } from '../utils/logger.js';
import type { Task, TaskResult } from './types.js';

/**
 * 任务执行器选项
 */
export interface TaskRunnerOptions {
  /** 工作目录 */
  workspacePath: string;
  /** 结果保存目录 */
  resultDir: string;
  /** 任务执行超时时间 (毫秒) */
  taskTimeout: number;
  /** 结果文件最大大小 (字节，默认 10MB) */
  maxResultFileSize?: number;
}

/**
 * 任务执行器类
 */
export class TaskRunner {
  private workspacePath: string;
  private resultDir: string;
  private taskTimeout: number;
  private maxResultFileSize: number;
  private runningTasks: Map<string, ReturnType<typeof spawn>> = new Map();

  constructor(options: TaskRunnerOptions) {
    this.workspacePath = options.workspacePath;
    this.resultDir = options.resultDir;
    this.taskTimeout = options.taskTimeout;
    this.maxResultFileSize = options.maxResultFileSize || 10 * 1024 * 1024;
  }

  /**
   * 执行任务
   */
  async executeTask(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    logger.info(`[TaskRunner] 开始执行任务: ${task.name} (${task.id})`);

    // 更新任务状态为运行中
    const result: TaskResult = {
      taskId: task.id,
      startTime,
      endTime: 0,
      success: false,
      output: '',
      error: undefined,
      duration: 0,
    };

    try {
      // 确保结果目录存在
      if (task.saveResult) {
        const dir = task.resultDir || this.resultDir;
        await fs.mkdir(dir, { recursive: true });
      }

      // 执行 Claude CLI 命令
      const output = await this.runClaudeCommand(task.command, task.id);

      result.output = output;
      result.success = true;
      result.endTime = Date.now();
      result.duration = result.endTime - startTime;

      // 保存结果到文件
      if (task.saveResult) {
        const resultFilePath = await this.saveResultToFile(task, output, startTime);
        result.resultFilePath = resultFilePath;
      }

      logger.info(`[TaskRunner] 任务执行成功: ${task.name}, 耗时: ${result.duration}ms`);
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);
      result.endTime = Date.now();
      result.duration = result.endTime - startTime;

      logger.error(`[TaskRunner] 任务执行失败: ${task.name}, 错误: ${result.error}`);
    }

    return result;
  }

  /**
   * 运行 Claude CLI 命令
   */
  private async runClaudeCommand(command: string, taskId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      let outputSize = 0;

      // 如果命令已包含 --dangerously-skip-permissions，则不再添加
      // 必须使用 -p/--print 参数以非交互模式运行，否则 CLI 会等待用户输入
      const cmd = command.startsWith('--dangerously-skip-permissions')
        ? command
        : `--dangerously-skip-permissions ${command}`;

      // 直接调用 claude 命令（已在 PATH 中）
      // -p 参数使 CLI 以非交互模式运行，执行后自动退出
      const fullCommand = `claude -p ${cmd}`;

      // 创建环境变量，移除 CLAUDECODE 以避免嵌套会话检测
      // CLI 检查 process.env.CLAUDECODE === "1"
      const env: NodeJS.ProcessEnv = {};
      // 只复制必需的环境变量，排除 CLAUDECODE
      for (const [key, value] of Object.entries(process.env)) {
        if (key !== 'CLAUDECODE' &&
            key !== 'VSCODE_PID' &&
            key !== 'VSCODE_NLS_CONFIG' &&
            key !== 'VSCODE_CWD' &&
            !key.startsWith('VSCODE_')) {
          env[key] = value;
        }
      }

      logger.debug(`[TaskRunner] 执行命令: ${fullCommand}`);
      logger.debug(`[TaskRunner] 工作目录: ${this.workspacePath}`);

      const child = spawn(fullCommand, [], {
        cwd: this.workspacePath,
        env,
        shell: true,  // 使用 shell 来解析命令
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // 记录运行中的任务
      this.runningTasks.set(taskId, child);
      logger.debug(`[TaskRunner] 子进程已启动, PID: ${child.pid}`);

      // 设置超时
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`任务执行超时 (${this.taskTimeout}ms)`));
      }, this.taskTimeout);

      // 捕获标准输出
      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;

        // 检查输出大小
        outputSize += chunk.length;
        if (outputSize > this.maxResultFileSize) {
          child.kill('SIGTERM');
          reject(new Error(`输出超过最大大小限制 (${this.maxResultFileSize} bytes)`));
        }
      });

      // 捕获错误输出
      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      // 处理进程退出
      child.on('close', (code) => {
        clearTimeout(timeout);
        this.runningTasks.delete(taskId);

        if (code === 0) {
          resolve(output.trim());
        } else {
          const errorMsg = errorOutput || `Claude CLI 退出码: ${code}`;
          reject(new Error(errorMsg));
        }
      });

      // 处理启动错误
      child.on('error', (error) => {
        clearTimeout(timeout);
        this.runningTasks.delete(taskId);
        reject(new Error(`启动 Claude CLI 失败: ${error.message}`));
      });
    });
  }

  /**
   * 保存结果到文件
   */
  private async saveResultToFile(task: Task, output: string, timestamp: number): Promise<string> {
    try {
      const dir = task.resultDir || this.resultDir;
      const filename = this.generateResultFileName(task, timestamp);
      const filePath = resolve(dir, filename);

      // 创建结果内容
      const resultContent = this.formatResultContent(task, output, timestamp);

      // 写入文件
      await fs.writeFile(filePath, resultContent, 'utf-8');

      logger.info(`[TaskRunner] 结果已保存: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error(`[TaskRunner] 保存结果失败: ${error}`);
      throw error;
    }
  }

  /**
   * 生成结果文件名
   */
  private generateResultFileName(task: Task, timestamp: number): string {
    const date = new Date(timestamp);
    const dateStr = date.toISOString().replace(/[:.]/g, '-').split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    const sanitizedName = task.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
    return `${sanitizedName}_${dateStr}_${timeStr}.txt`;
  }

  /**
   * 格式化结果内容
   */
  private formatResultContent(task: Task, output: string, timestamp: number): string {
    const date = new Date(timestamp);
    const lines = [
      '========================================',
      `任务名称: ${task.name}`,
      `任务ID: ${task.id}`,
      `执行时间: ${date.toLocaleString('zh-CN')}`,
      `执行命令: ${task.command}`,
      '========================================',
      '',
      '输出结果:',
      '----------------------------------------',
      output,
      '----------------------------------------',
      '',
      `执行完成: ${new Date().toLocaleString('zh-CN')}`,
      '========================================',
    ];

    return lines.join('\n');
  }

  /**
   * 取消正在运行的任务
   */
  cancelTask(taskId: string): boolean {
    const child = this.runningTasks.get(taskId);
    if (child) {
      child.kill('SIGTERM');
      this.runningTasks.delete(taskId);
      logger.info(`[TaskRunner] 已取消任务: ${taskId}`);
      return true;
    }
    return false;
  }

  /**
   * 获取正在运行的任务数量
   */
  getRunningTaskCount(): number {
    return this.runningTasks.size;
  }

  /**
   * 清理所有正在运行的任务
   */
  cleanup(): void {
    for (const [taskId, child] of this.runningTasks) {
      child.kill('SIGTERM');
      logger.info(`[TaskRunner] 清理任务: ${taskId}`);
    }
    this.runningTasks.clear();
  }
}

/**
 * 创建任务执行器实例
 */
export function createTaskRunner(options: TaskRunnerOptions): TaskRunner {
  return new TaskRunner(options);
}
