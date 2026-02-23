/**
 * Watchdog - 进程监控和自动重启守护进程
 *
 * 功能：
 * - 监控主进程运行状态
 * - 进程崩溃时自动重启
 * - 健康检查（HTTP/Socket）
 * - 内存泄漏检测
 * - 日志记录
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../src/utils/logger.js';

/**
 * 看门狗配置
 */
interface WatchdogConfig {
  /** 监控的命令 */
  command: string;
  /** 命令参数 */
  args: string[];
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: NodeJS.ProcessEnv;
  /** 最大重启次数（-1 表示无限） */
  maxRestarts?: number;
  /** 重启延迟（毫秒） */
  restartDelay?: number;
  /** 健康检查间隔（毫秒） */
  healthCheckInterval?: number;
  /** 健康检查 URL */
  healthCheckUrl?: string;
  /** 内存阈值（MB） */
  memoryThreshold?: number;
  /** PID 文件路径 */
  pidFile?: string;
  /** 日志文件路径 */
  logFile?: string;
}

/**
 * 进程状态
 */
type ProcessStatus = 'starting' | 'running' | 'stopped' | 'crashed' | 'restarting';

/**
 * 看门狗类
 */
export class Watchdog {
  private config: Required<WatchdogConfig>;
  private childProcess: ChildProcess | null = null;
  private status: ProcessStatus = 'stopped';
  private restartCount = 0;
  private healthCheckTimer?: NodeJS.Timeout;
  private startupTime: Date | null = null;
  private lastHealthCheck: Date | null = null;
  private isShuttingDown = false;

  constructor(config: WatchdogConfig) {
    this.config = {
      command: config.command,
      args: config.args,
      cwd: config.cwd || process.cwd(),
      env: config.env || process.env,
      maxRestarts: config.maxRestarts ?? -1,
      restartDelay: config.restartDelay ?? 5000,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
      healthCheckUrl: config.healthCheckUrl,
      memoryThreshold: config.memoryThreshold ?? 1024, // 1GB
      pidFile: config.pidFile || path.join(process.cwd(), 'data', 'watchdog.pid'),
      logFile: config.logFile || path.join(process.cwd(), 'logs', 'watchdog.log'),
    };
  }

  /**
   * 启动看门狗
   */
  async start(): Promise<void> {
    if (this.status !== 'stopped') {
      logger.warn('[Watchdog] 看门狗已经在运行');
      return;
    }

    this.isShuttingDown = false;
    logger.info('[Watchdog] 启动看门狗');
    await this.writePid();

    // 启动子进程
    await this.startChildProcess();

    // 启动健康检查
    if (this.config.healthCheckUrl) {
      this.startHealthCheck();
    }

    // 处理退出信号
    this.setupSignalHandlers();
  }

  /**
   * 启动子进程
   */
  private async startChildProcess(): Promise<void> {
    if (this.isShuttingDown) return;

    this.status = 'starting';
    logger.info(`[Watchdog] 启动子进程: ${this.config.command} ${this.config.args.join(' ')}`);

    try {
      this.childProcess = spawn(this.config.command, this.config.args, {
        cwd: this.config.cwd,
        env: this.config.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      this.childProcess.on('spawn', () => {
        this.status = 'running';
        this.startupTime = new Date();
        logger.info('[Watchdog] 子进程已启动');
      });

      this.childProcess.stdout?.on('data', (data) => {
        const message = data.toString().trim();
        if (message) {
          logger.info(`[App] ${message}`);
        }
      });

      this.childProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        if (message) {
          logger.error(`[App Error] ${message}`);
        }
      });

      this.childProcess.on('exit', (code, signal) => {
        logger.warn(`[Watchdog] 子进程退出 (code: ${code}, signal: ${signal})`);

        if (!this.isShuttingDown) {
          this.status = 'crashed';
          this.handleChildExit();
        }
      });

      this.childProcess.on('error', (error) => {
        logger.error(`[Watchdog] 子进程错误: ${error.message}`);
        if (!this.isShuttingDown) {
          this.status = 'crashed';
          this.handleChildExit();
        }
      });

    } catch (error) {
      logger.error(`[Watchdog] 启动子进程失败: ${error}`);
      this.status = 'crashed';
      this.handleChildExit();
    }
  }

  /**
   * 处理子进程退出
   */
  private async handleChildExit(): Promise<void> {
    if (this.isShuttingDown) return;

    // 检查是否超过最大重启次数
    if (this.config.maxRestarts >= 0 && this.restartCount >= this.config.maxRestarts) {
      logger.error(`[Watchdog] 达到最大重启次数 (${this.config.maxRestarts})，停止尝试`);
      this.status = 'stopped';
      return;
    }

    this.restartCount++;
    const delay = this.config.restartDelay;

    logger.info(`[Watchdog] ${delay / 1000} 秒后进行第 ${this.restartCount} 次重启尝试...`);

    await this.sleep(delay);
    await this.startChildProcess();
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    const check = async () => {
      if (this.isShuttingDown) return;

      try {
        await this.performHealthCheck();
        this.lastHealthCheck = new Date();
      } catch (error) {
        logger.error(`[Watchdog] 健康检查失败: ${error}`);

        // 如果连续多次失败，重启进程
        if (this.status === 'running') {
          logger.warn('[Watchdog] 健康检查失败，可能需要重启');
          // 可选：在这里触发重启
        }
      }
    };

    this.healthCheckTimer = setInterval(check, this.config.healthCheckInterval);
    check(); // 立即执行一次
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.config.healthCheckUrl) {
      return;
    }

    const response = await fetch(this.config.healthCheckUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 秒超时
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as { status?: string; uptime?: number };

    // 检查响应状态
    if (data.status !== 'ok') {
      throw new Error(`应用状态异常: ${data.status}`);
    }

    // 检查内存使用
    if (this.childProcess?.pid) {
      const memoryUsage = await this.getProcessMemory(this.childProcess.pid);
      if (memoryUsage > this.config.memoryThreshold) {
        logger.warn(`[Watchdog] 内存使用过高: ${memoryUsage}MB / ${this.config.memoryThreshold}MB`);
      }
    }
  }

  /**
   * 获取进程内存使用（MB）
   */
  private async getProcessMemory(pid: number): Promise<number> {
    try {
      if (process.platform === 'win32') {
        // Windows: 使用 tasklist
        const { spawn } = await import('child_process');
        return new Promise((resolve) => {
          const tasklist = spawn('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV']);
          let output = '';

          tasklist.stdout.on('data', (data) => {
            output += data.toString();
          });

          tasklist.on('close', () => {
            const match = output.match(/(\d+,?\d*)\s*K\s*Memory/);
            if (match) {
              const kb = parseInt(match[1].replace(',', ''));
              resolve(kb / 1024);
            } else {
              resolve(0);
            }
          });
        });
      } else {
        // Linux/macOS: 使用 ps
        const { spawn } = await import('child_process');
        return new Promise((resolve) => {
          const ps = spawn('ps', ['-p', pid.toString(), '-o', 'rss=']);
          let output = '';

          ps.stdout.on('data', (data) => {
            output += data.toString();
          });

          ps.on('close', () => {
            const kb = parseInt(output.trim());
            resolve(isNaN(kb) ? 0 : kb / 1024);
          });
        });
      }
    } catch {
      return 0;
    }
  }

  /**
   * 设置信号处理器
   */
  private setupSignalHandlers(): void {
    const shutdown = async () => {
      logger.info('[Watchdog] 收到关闭信号，正在停止...');
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGQUIT', shutdown);
  }

  /**
   * 写入 PID 文件
   */
  private async writePid(): Promise<void> {
    try {
      const dir = path.dirname(this.config.pidFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.config.pidFile, process.pid.toString());
    } catch (error) {
      logger.error(`[Watchdog] 写入 PID 文件失败: ${error}`);
    }
  }

  /**
   * 删除 PID 文件
   */
  private async removePid(): Promise<void> {
    try {
      await fs.unlink(this.config.pidFile);
    } catch {
      // 忽略错误
    }
  }

  /**
   * 停止看门狗
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    logger.info('[Watchdog] 正在停止看门狗...');

    // 停止健康检查
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // 停止子进程
    if (this.childProcess) {
      logger.info('[Watchdog] 正在停止子进程...');
      this.childProcess.kill('SIGTERM');

      // 等待进程退出
      await this.sleep(5000);

      // 如果还没退出，强制杀死
      if (this.childProcess.pid) {
        try {
          process.kill(this.childProcess.pid, 'SIGKILL');
        } catch {
          // 进程已经退出
        }
      }

      this.childProcess = null;
    }

    this.status = 'stopped';
    await this.removePid();

    logger.info('[Watchdog] 看门狗已停止');
  }

  /**
   * 获取状态
   */
  getStatus(): {
    status: ProcessStatus;
    restartCount: number;
    startupTime: Date | null;
    lastHealthCheck: Date | null;
    pid: number | null;
    childPid: number | null;
  } {
    return {
      status: this.status,
      restartCount: this.restartCount,
      startupTime: this.startupTime,
      lastHealthCheck: this.lastHealthCheck,
      pid: process.pid,
      childPid: this.childProcess?.pid ?? null,
    };
  }

  /**
   * 休眠指定毫秒数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * CLI 入口
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';

  // 配置
  const config: WatchdogConfig = {
    command: process.execPath,
    args: [path.join(process.cwd(), 'dist', 'index.js')],
    cwd: process.cwd(),
    env: process.env,
    maxRestarts: -1, // 无限重启
    restartDelay: 5000,
    healthCheckInterval: 30000,
    healthCheckUrl: 'http://127.0.0.1:8080/api/health', // Dashboard HTTP 端口
    memoryThreshold: 1024, // 1GB
  };

  const watchdog = new Watchdog(config);

  switch (command) {
    case 'start':
      await watchdog.start();
      logger.info('[Watchdog] 看门狗正在运行，按 Ctrl+C 退出');
      // 保持进程运行
      await new Promise(() => {});
      break;

    case 'stop':
      // 从 PID 文件读取并停止
      try {
        const pidFile = path.join(process.cwd(), 'data', 'watchdog.pid');
        const pid = parseInt(await fs.readFile(pidFile, 'utf-8'));
        process.kill(pid, 'SIGTERM');
        logger.info(`[Watchdog] 已发送停止信号到 PID ${pid}`);
      } catch {
        logger.error('[Watchdog] 无法停止看门狗：PID 文件不存在或进程未运行');
      }
      break;

    case 'status':
      try {
        const pidFile = path.join(process.cwd(), 'data', 'watchdog.pid');
        const pid = parseInt(await fs.readFile(pidFile, 'utf-8'));
        process.kill(pid, 0); // 检查进程是否存在
        logger.info(`[Watchdog] 看门狗正在运行 (PID: ${pid})`);
      } catch {
        logger.info('[Watchdog] 看门狗未运行');
      }
      break;

    default:
      logger.info(`用法: npm run watchdog [start|stop|status]`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default Watchdog;
