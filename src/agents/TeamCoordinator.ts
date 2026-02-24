/**
 * TeamCoordinator - 增强版团队协调器
 *
 * 支持真正的多进程 Agent 团队：
 * - 每个 Agent 独立进程运行
 * - 进程间通信 (IPC)
 * - 动态 Agent 生成
 * - 任务分发和收集
 * - 故障恢复
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import type { IAgent, AgentMessage, AgentContext, AgentResponse, AgentConfig } from './base/Agent.js';
import { AgentCapability } from './base/Agent.js';

/**
 * 子 Agent 配置
 */
export interface SubAgentConfig {
  /** Agent ID */
  id: string;
  /** Agent 名称 */
  name: string;
  /** 命令 */
  command: string;
  /** 参数 */
  args: string[];
  /** 工作目录 */
  cwd?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 重启策略 */
  restartPolicy?: 'never' | 'on-failure' | 'always';
}

/**
 * 子 Agent 状态
 */
type SubAgentStatus = 'starting' | 'idle' | 'busy' | 'stopped' | 'error';

/**
 * 子 Agent 实例
 */
interface SubAgentInstance {
  /** 配置 */
  config: SubAgentConfig;
  /** 进程 */
  process?: ChildProcess;
  /** 状态 */
  status: SubAgentStatus;
  /** 当前任务 */
  currentTask?: {
    id: string;
    message: AgentMessage;
    startTime: Date;
  };
  /** 完成的任务数 */
  completedTasks: number;
  /** 错误数 */
  errors: number;
  /** 最后活动时间 */
  lastActivity: Date;
}

/**
 * 团队任务
 */
export interface TeamTask {
  /** 任务 ID */
  id: string;
  /** 类型 */
  type: 'parallel' | 'sequential' | 'pipeline';
  /** 任务消息 */
  message: AgentMessage;
  /** 上下文 */
  context: AgentContext;
  /** 分配的 Agent */
  assignedAgents: string[];
  /** 状态 */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** 结果 */
  results?: Map<string, AgentResponse>;
  /** 开始时间 */
  startTime: Date;
  /** 结束时间 */
  endTime?: Date;
}

/**
 * 团队协调器配置
 */
export interface TeamCoordinatorOptions {
  /** 子 Agent 配置列表 */
  agents: SubAgentConfig[];
  /** 最大并发任务数 */
  maxConcurrentTasks?: number;
  /** Agent 超时时间（毫秒） */
  agentTimeout?: number;
  /** 是否启用自动重启 */
  autoRestart?: boolean;
}

/**
 * 团队协调器事件
 */
export interface TeamCoordinatorEvents {
  'agent:ready': (agentId: string) => void;
  'agent:busy': (agentId: string) => void;
  'agent:error': (agentId: string, error: Error) => void;
  'task:started': (taskId: string) => void;
  'task:completed': (taskId: string, results: Map<string, AgentResponse>) => void;
  'task:failed': (taskId: string, error: Error) => void;
}

/**
 * 团队协调器
 */
export class TeamCoordinator extends EventEmitter implements IAgent {
  readonly id = 'team-coordinator';
  readonly name = 'Team Coordinator';
  readonly description = '真正的多进程 Agent 团队协调器';
  readonly capabilities: AgentCapability[] = [];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 90,
    timeout: 300000,
  };

  private subAgents: Map<string, SubAgentInstance> = new Map();
  private tasks: Map<string, TeamTask> = new Map();
  private maxConcurrentTasks: number;
  private agentTimeout: number;
  private autoRestart: boolean;
  private isRunning = false;

  constructor(options: TeamCoordinatorOptions) {
    super();

    this.maxConcurrentTasks = options.maxConcurrentTasks || 5;
    this.agentTimeout = options.agentTimeout || 120000;
    this.autoRestart = options.autoRestart !== false;

    // 初始化子 Agent
    for (const config of options.agents) {
      const instance: SubAgentInstance = {
        config,
        status: 'stopped',
        completedTasks: 0,
        errors: 0,
        lastActivity: new Date(),
      };
      this.subAgents.set(config.id, instance);
    }

    logger.info(`[TeamCoordinator] 初始化完成，管理 ${this.subAgents.size} 个子 Agent`);
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    this.isRunning = true;

    // 启动所有子 Agent
    for (const agentId of this.subAgents.keys()) {
      await this.startAgent(agentId);
    }

    logger.info('[TeamCoordinator] 团队协调器已启动');
  }

  /**
   * 检查是否能处理该任务
   */
  canHandle(message: AgentMessage): number {
    const content = message.content;

    if (typeof content !== 'string') {
      return 0;
    }

    // 检查是否是团队命令
    if (content.toString().startsWith('/team')) {
      return 1;
    }

    return 0;
  }

  /**
   * 启动子 Agent
   */
  private async startAgent(agentId: string): Promise<void> {
    const instance = this.subAgents.get(agentId);
    if (!instance) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (instance.status !== 'stopped') {
      return;
    }

    instance.status = 'starting';
    logger.info(`[TeamCoordinator] 启动子 Agent: ${agentId}`);

    try {
      const { command, args, cwd } = instance.config;

      instance.process = spawn(command, args, {
        cwd: cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          AGENT_MODE: 'child',
          AGENT_ID: agentId,
        },
      });

      // 处理进程事件
      instance.process.on('spawn', () => {
        instance.status = 'idle';
        this.emit('agent:ready', agentId);
        logger.info(`[TeamCoordinator] 子 Agent 已启动: ${agentId}`);
      });

      instance.process.stdout?.on('data', (data) => {
        this.handleAgentOutput(agentId, data.toString());
      });

      instance.process.stderr?.on('data', (data) => {
        logger.error(`[TeamCoordinator] Agent ${agentId} stderr: ${data}`);
      });

      instance.process.on('exit', (code, signal) => {
        logger.warn(`[TeamCoordinator] Agent ${agentId} 退出 (code: ${code}, signal: ${signal})`);

        instance.status = 'stopped';
        instance.process = undefined;

        // 处理当前任务
        if (instance.currentTask) {
          this.failTask(instance.currentTask.id, new Error(`Agent ${agentId} 退出`));
          instance.currentTask = undefined;
        }

        // 自动重启
        if (this.autoRestart && this.isRunning) {
          if (instance.config.restartPolicy !== 'never') {
            setTimeout(() => {
              if (this.isRunning) {
                this.startAgent(agentId);
              }
            }, 5000);
          }
        }
      });

      instance.process.on('error', (error) => {
        logger.error(`[TeamCoordinator] Agent ${agentId} 错误: ${error}`);
        instance.status = 'error';
        instance.errors++;
        this.emit('agent:error', agentId, error);
      });

    } catch (error) {
      logger.error(`[TeamCoordinator] 启动 Agent ${agentId} 失败: ${error}`);
      instance.status = 'error';
    }
  }

  /**
   * 处理 Agent 输出
   */
  private handleAgentOutput(agentId: string, output: string): void {
    try {
      // 解析输出（假设是 JSON 行）
      const lines = output.trim().split('\n');
      for (const line of lines) {
        const data = JSON.parse(line);

        if (data.type === 'response') {
          this.handleAgentResponse(agentId, data);
        } else if (data.type === 'heartbeat') {
          // 心跳，更新活动时间
          const instance = this.subAgents.get(agentId);
          if (instance) {
            instance.lastActivity = new Date();
          }
        }
      }
    } catch {
      // 非输出，可能是日志
      logger.debug(`[TeamCoordinator] Agent ${agentId}: ${output.substring(0, 100)}`);
    }
  }

  /**
   * 处理 Agent 响应
   */
  private handleAgentResponse(agentId: string, response: any): void {
    const instance = this.subAgents.get(agentId);
    if (!instance || !instance.currentTask) {
      return;
    }

    const task = this.tasks.get(instance.currentTask.id);
    if (!task) {
      return;
    }

    // 保存结果
    if (!task.results) {
      task.results = new Map();
    }
    task.results.set(agentId, response);

    // 检查任务是否完成
    const pendingAgents = task.assignedAgents.filter(
      id => !task.results!.has(id)
    );

    if (pendingAgents.length === 0) {
      this.completeTask(task.id);
    }

    // 更新 Agent 状态
    instance.status = 'idle';
    instance.currentTask = undefined;
    instance.completedTasks++;
    instance.lastActivity = new Date();
    this.emit('agent:ready', agentId);
  }

  /**
   * 分配任务给 Agent
   */
  private async assignTaskToAgent(agentId: string, task: TeamTask): Promise<void> {
    const instance = this.subAgents.get(agentId);
    if (!instance || instance.status !== 'idle') {
      throw new Error(`Agent ${agentId} 不可用`);
    }

    instance.status = 'busy';
    instance.currentTask = {
      id: task.id,
      message: task.message,
      startTime: new Date(),
    };

    this.emit('agent:busy', agentId);

    // 发送任务到子进程
    if (instance.process?.stdin) {
      const taskData = {
        type: 'task',
        taskId: task.id,
        message: task.message,
        context: task.context,
      };

      instance.process.stdin.write(JSON.stringify(taskData) + '\n');
    }
  }

  /**
   * 执行任务（作为 IAgent 接口）
   */
  async process(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    if (typeof message.content !== 'string') {
      return {
        content: 'Team Coordinator 只支持文本消息',
        agentId: this.id,
      };
    }

    const content = message.content as string;

    // 解析任务指令
    const taskMatch = content.match(/^\/team\s+(\w+)\s*(.*)$/);
    if (taskMatch) {
      const [, action, args] = taskMatch;
      return await this.handleTeamCommand(action, args, context);
    }

    // 默认：并行任务
    return await this.executeParallelTask(content, context);
  }

  /**
   * 处理团队命令
   */
  private async handleTeamCommand(
    action: string,
    args: string,
    context: AgentContext
  ): Promise<AgentResponse> {
    switch (action) {
      case 'status':
        return {
          content: this.getTeamStatus(),
          agentId: this.id,
        };

      case 'stop':
        const agentToStop = args.trim();
        if (agentToStop) {
          await this.stopAgent(agentToStop);
          return {
            content: `Agent ${agentToStop} 已停止`,
            agentId: this.id,
          };
        }
        break;

      case 'restart':
        const agentToRestart = args.trim();
        if (agentToRestart) {
          await this.stopAgent(agentToRestart);
          await this.startAgent(agentToRestart);
          return {
            content: `Agent ${agentToRestart} 已重启`,
            agentId: this.id,
          };
        }
        break;

      default:
        return {
          content: `未知命令: ${action}`,
          agentId: this.id,
        };
    }

    return {
      content: '命令执行完成',
      agentId: this.id,
    };
  }

  /**
   * 执行并行任务
   */
  private async executeParallelTask(
    prompt: string,
    context: AgentContext
  ): Promise<AgentResponse> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    // 找到空闲的 Agent
    const idleAgents = Array.from(this.subAgents.entries())
      .filter(([_, instance]) => instance.status === 'idle')
      .map(([id, _]) => id)
      .slice(0, this.maxConcurrentTasks);

    if (idleAgents.length === 0) {
      return {
        content: '没有可用的 Agent',
        agentId: this.id,
      };
    }

    const message: AgentMessage = {
      channel: context.metadata?.channel as string || 'default',
      userId: context.metadata?.userId as string || 'unknown',
      content: prompt,
      timestamp: new Date(),
    };

    const task: TeamTask = {
      id: taskId,
      type: 'parallel',
      message,
      context,
      assignedAgents: idleAgents,
      status: 'running',
      startTime: new Date(),
    };

    this.tasks.set(taskId, task);
    this.emit('task:started', taskId);

    // 分配任务
    for (const agentId of idleAgents) {
      try {
        await this.assignTaskToAgent(agentId, task);
      } catch (error) {
        logger.error(`[TeamCoordinator] 分配任务到 ${agentId} 失败: ${error}`);
      }
    }

    // 等待完成
    return await this.waitForTask(taskId);
  }

  /**
   * 等待任务完成
   */
  private async waitForTask(taskId: string): Promise<AgentResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off(`task:completed:${taskId}`, listener);
        this.off(`task:failed:${taskId}`, failListener);
        reject(new Error('任务超时'));
      }, this.agentTimeout);

      const listener = (completedTaskId: string, results: Map<string, AgentResponse>) => {
        if (completedTaskId === taskId) {
          clearTimeout(timeout);
          const responses = Array.from(results.values());
          resolve({
            content: this.combineResponses(responses),
            agentId: this.id,
            metadata: {
              taskId,
              agentCount: results.size,
            },
          });
        }
      };

      const failListener = (failedTaskId: string, error: Error) => {
        if (failedTaskId === taskId) {
          clearTimeout(timeout);
          reject(error);
        }
      };

      this.on('task:completed', listener);
      this.on('task:failed', failListener);
    });
  }

  /**
   * 合并多个响应
   */
  private combineResponses(responses: AgentResponse[]): string {
    const parts: string[] = [];

    for (const response of responses) {
      parts.push(`[${response.agentId}]:\n${response.content}`);
    }

    return parts.join('\n\n');
  }

  /**
   * 完成任务
   */
  private completeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.status = 'completed';
    task.endTime = new Date();

    this.emit('task:completed', taskId, task.results || new Map());
    logger.info(`[TeamCoordinator] 任务完成: ${taskId}`);
  }

  /**
   * 任务失败
   */
  private failTask(taskId: string, error: Error): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.status = 'failed';
    task.endTime = new Date();

    this.emit('task:failed', taskId, error);
    logger.error(`[TeamCoordinator] 任务失败: ${taskId} - ${error}`);
  }

  /**
   * 停止 Agent
   */
  private async stopAgent(agentId: string): Promise<void> {
    const instance = this.subAgents.get(agentId);
    if (!instance) {
      return;
    }

    if (instance.process) {
      // 先发送 SIGTERM 优雅关闭
      instance.process.kill('SIGTERM');

      // 等待最多5秒让进程自行退出
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 如果进程还在运行，使用 SIGKILL 强制终止
      try {
        // 检查进程是否还在运行
        process.kill(instance.process.pid, 0); // 信号 0 用于检查进程是否存在
        // 进程还存在，强制终止
        instance.process.kill('SIGKILL');
      } catch (e) {
        // 进程已停止，不需要做任何事情
      }
    }

    instance.status = 'stopped';
    instance.process = undefined;

    // 处理当前任务
    if (instance.currentTask) {
      this.failTask(instance.currentTask.id, new Error(`Agent ${agentId} 被停止`));
      instance.currentTask = undefined;
    }
  }

  /**
   * 获取团队状态
   */
  private getTeamStatus(): string {
    const lines: string[] = ['Team Coordinator Status:\n'];

    lines.push('Agents:');
    for (const [id, instance] of this.subAgents) {
      lines.push(`  ${id}:`);
      lines.push(`    Status: ${instance.status}`);
      lines.push(`    Completed: ${instance.completedTasks}`);
      lines.push(`    Errors: ${instance.errors}`);
      lines.push(`    Last Activity: ${instance.lastActivity.toISOString()}`);
    }

    lines.push('\nTasks:');
    lines.push(`  Total: ${this.tasks.size}`);
    lines.push(`  Running: ${Array.from(this.tasks.values()).filter(t => t.status === 'running').length}`);

    return lines.join('\n');
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.isRunning = false;

    // 停止所有子 Agent
    for (const agentId of this.subAgents.keys()) {
      await this.stopAgent(agentId);
    }

    this.subAgents.clear();
    this.tasks.clear();

    logger.info('[TeamCoordinator] 团队协调器已清理');
  }
}

export default TeamCoordinator;
