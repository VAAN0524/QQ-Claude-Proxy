/**
 * Shell Agent - 命令执行
 *
 * 执行系统命令和脚本，带安全检查
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import type {
  IAgent,
  AgentConfig,
  AgentMessage,
  AgentContext,
  AgentResponse,
} from './base/Agent.js';
import { AgentCapability } from './base/Agent.js';

const execAsync = promisify(exec);

/**
 * Shell Agent 配置选项
 */
export interface ShellAgentOptions {
  /** 允许的命令列表 (空表示允许所有) */
  allowedCommands?: string[];
  /** 禁止的命令列表 */
  blockedCommands?: string[];
  /** 工作目录 */
  cwd?: string;
  /** 超时时间 (毫秒) */
  timeout?: number;
}

/**
 * Shell Agent - 命令执行
 */
export class ShellAgent implements IAgent {
  readonly id = 'shell';
  readonly name = 'Shell Agent';
  readonly description = '执行系统命令和脚本';
  readonly capabilities: AgentCapability[] = [
    AgentCapability.Shell,
    AgentCapability.File,
  ];
  readonly config: AgentConfig = {
    enabled: false, // 默认禁用，安全考虑
    priority: 7,
    timeout: 30000,
  };

  private allowedCommands: Set<string>;
  private blockedCommands: Set<string>;
  private defaultCwd: string;
  private execTimeout: number;

  // 命令相关关键词
  private readonly shellKeywords = [
    // 中文
    '运行', '执行', '命令', '脚本', '终端', '控制台',
    // 英文
    'run', 'execute', 'command', 'script', 'terminal', 'console',
    // 常见命令
    'npm', 'yarn', 'pnpm', 'git', 'ls', 'dir', 'cd', 'mkdir', 'rm', 'cp', 'mv',
    'cat', 'grep', 'find', 'curl', 'wget', 'ping', 'python', 'node', 'bash',
  ];

  // 危险命令 (默认阻止)
  private readonly dangerousCommands = [
    'rm -rf /',
    'rm -rf /*',
    'mkfs',
    'dd if=/dev/zero',
    'format c:',
    'del /s /q',
    'shutdown',
    'reboot',
    'halt',
  ];

  constructor(options: ShellAgentOptions = {}) {
    this.allowedCommands = new Set(options.allowedCommands || []);
    this.blockedCommands = new Set([
      ...this.dangerousCommands,
      ...(options.blockedCommands || []),
    ]);
    this.defaultCwd = options.cwd || process.cwd();
    this.execTimeout = options.timeout || 30000;
    logger.info(`[ShellAgent] 初始化完成 (允许命令: ${this.allowedCommands.size || '全部'}, 阻止命令: ${this.blockedCommands.size})`);
  }

  /**
   * 检查是否能处理该任务
   */
  canHandle(message: AgentMessage): number {
    const content = message.content.toLowerCase();

    // 检查是否以命令样式开头
    const commandPattern = /^\s*[\w\-]+\s+/;
    if (commandPattern.test(message.content)) {
      return 0.9;
    }

    // 关键词匹配
    const hitCount = this.shellKeywords.filter(kw => content.includes(kw)).length;
    return Math.min(hitCount * 0.15, 0.8);
  }

  /**
   * 处理消息
   */
  async process(
    message: AgentMessage,
    context: AgentContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const command = message.content.trim();

      logger.info(`[ShellAgent] 执行命令: ${command}`);

      // 安全检查
      const safetyCheck = this.checkCommandSafety(command);
      if (!safetyCheck.safe) {
        return {
          content: `❌ [Shell Agent] 命令被阻止: ${safetyCheck.reason}`,
          agentId: this.id,
        };
      }

      // 执行命令
      const { stdout, stderr } = await execAsync(command, {
        cwd: context.workspacePath || this.defaultCwd,
        timeout: this.execTimeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
      });

      const elapsed = Date.now() - startTime;
      logger.info(`[ShellAgent] 命令执行完成，耗时: ${elapsed}ms`);

      // 构建响应
      let output = `🤖 [Shell Agent]\n\n$ ${command}\n`;

      if (stdout) {
        output += `\n输出:\n${stdout}`;
      }

      if (stderr) {
        output += `\n错误:\n${stderr}`;
      }

      output += `\n\n✅ 执行完成 (耗时: ${elapsed}ms)`;

      return {
        content: output,
        agentId: this.id,
      };

    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; message?: string; code?: number };
      logger.error(`[ShellAgent] 命令执行失败: ${error}`);

      let output = `❌ [Shell Agent]\n\n$ ${message.content.trim()}\n\n`;

      if (execError.stdout) {
        output += `输出:\n${execError.stdout}\n`;
      }

      if (execError.stderr) {
        output += `错误:\n${execError.stderr}\n`;
      }

      if (execError.message) {
        output += `信息: ${execError.message}\n`;
      }

      if (execError.code !== undefined) {
        output += `退出码: ${execError.code}`;
      }

      return {
        content: output,
        agentId: this.id,
      };
    }
  }

  /**
   * 检查命令安全性
   */
  private checkCommandSafety(command: string): { safe: boolean; reason?: string } {
    const lowerCommand = command.toLowerCase();

    // 检查危险命令
    for (const blocked of this.blockedCommands) {
      if (lowerCommand.includes(blocked.toLowerCase())) {
        return {
          safe: false,
          reason: `包含危险命令: ${blocked}`,
        };
      }
    }

    // 检查允许列表
    if (this.allowedCommands.size > 0) {
      const firstWord = command.trim().split(/\s+/)[0];
      if (!this.allowedCommands.has(firstWord)) {
        return {
          safe: false,
          reason: `命令 "${firstWord}" 不在允许列表中`,
        };
      }
    }

    return { safe: true };
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    logger.info('[ShellAgent] 已初始化');
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    logger.info('[ShellAgent] 已清理资源');
  }

  /**
   * 获取允许的命令列表
   */
  getAllowedCommands(): string[] {
    return Array.from(this.allowedCommands);
  }

  /**
   * 获取阻止的命令列表
   */
  getBlockedCommands(): string[] {
    return Array.from(this.blockedCommands);
  }
}
