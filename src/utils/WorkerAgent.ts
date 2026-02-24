/**
 * WorkerAgent - 子 Agent 工作进程基类
 *
 * 处理进程间通信和任务执行
 */

import { stdin, stdout } from 'process';
import { logger } from './logger.js';

/**
 * 任务消息
 */
interface WorkerTask {
  type: 'task';
  taskId: string;
  message: any;
  context: any;
}

/**
 * 响应消息
 */
interface WorkerResponse {
  type: 'response';
  taskId: string;
  agentId: string;
  content: string;
  metadata?: any;
}

/**
 * 心跳消息
 */
interface Heartbeat {
  type: 'heartbeat';
  timestamp: number;
}

export class WorkerAgent {
  private agentId: string;
  private agentType: string;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(options: { agentId: string; agentType: string }) {
    this.agentId = options.agentId;
    this.agentType = options.agentType;
  }

  /**
   * 启动 Worker
   */
  start(): void {
    logger.info(`[Worker:${this.agentId}] 启动工作进程`);

    // 设置 stdin 编码
    stdin.setEncoding('utf-8');

    // 监听 stdin 输入
    stdin.on('data', async (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          await this.handleMessage(line);
        }
      }
    });

    // 启动心跳
    this.startHeartbeat();

    // 发送就绪信号
    this.sendReady();
  }

  /**
   * 处理消息
   */
  private async handleMessage(line: string): Promise<void> {
    try {
      const message = JSON.parse(line);

      if (message.type === 'task') {
        await this.handleTask(message as WorkerTask);
      }
    } catch (error) {
      logger.error(`[Worker:${this.agentId}] 消息解析失败: ${error}`);
    }
  }

  /**
   * 处理任务
   */
  private async handleTask(task: WorkerTask): Promise<void> {
    logger.info(`[Worker:${this.agentId}] 收到任务: ${task.taskId}`);

    try {
      // 执行任务
      const result = await this.executeTask(task);

      // 发送响应
      this.sendResponse({
        type: 'response',
        taskId: task.taskId,
        agentId: this.agentId,
        content: result,
      });
    } catch (error) {
      logger.error(`[Worker:${this.agentId}] 任务执行失败: ${error}`);

      // 发送错误响应
      this.sendResponse({
        type: 'response',
        taskId: task.taskId,
        agentId: this.agentId,
        content: `错误: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /**
   * 执行任务（子类覆盖）
   */
  async executeTask(task: WorkerTask): Promise<string> {
    // 默认实现：返回任务内容
    return `已处理: ${task.message.content}`;
  }

  /**
   * 发送响应
   */
  private sendResponse(response: WorkerResponse): void {
    stdout.write(JSON.stringify(response) + '\n');
  }

  /**
   * 发送就绪信号
   */
  private sendReady(): void {
    stdout.write(JSON.stringify({
      type: 'ready',
      agentId: this.agentId,
      timestamp: Date.now(),
    }) + '\n');
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const heartbeat: Heartbeat = {
        type: 'heartbeat',
        timestamp: Date.now(),
      };
      stdout.write(JSON.stringify(heartbeat) + '\n');
    }, 30000); // 每 30 秒
  }

  /**
   * 停止 Worker
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    logger.info(`[Worker:${this.agentId}] 工作进程已停止`);
  }
}

export default WorkerAgent;
