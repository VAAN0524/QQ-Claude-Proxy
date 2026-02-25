/**
 * 进程工具 - 后台进程管理
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { logger } from '../../utils/logger.js';

/**
 * 进程会话
 */
interface ProcessSession {
  id: string;
  command: string;
  pid?: number;
  startTime: Date;
  status: 'running' | 'stopped' | 'failed';
  exitCode?: number;
}

/**
 * 进程管理器
 */
class ProcessManager {
  private sessions: Map<string, ProcessSession> = new Map();

  /**
   * 启动后台进程
   */
  spawnProcess(
    sessionId: string,
    command: string,
    args: string[] = [],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      detached?: boolean;
    } = {}
  ): ProcessSession {
    const { cwd = process.cwd(), detached = true } = options;

    logger.info(`[进程工具] 启动进程: ${command} (session: ${sessionId})`);

    const child = spawn(command, args, {
      cwd,
      detached,
      stdio: 'ignore',
      env: { ...process.env, ...options.env },
    });

    const session: ProcessSession = {
      id: sessionId,
      command: `${command} ${args.join(' ')}`,
      pid: child.pid,
      startTime: new Date(),
      status: 'running',
    };

    this.sessions.set(sessionId, session);

    // 监听进程退出
    child.on('exit', (code) => {
      logger.info(`[进程工具] 进程退出: ${sessionId} (code: ${code})`);
      session.status = 'stopped';
      session.exitCode = code;
    });

    child.on('error', (err) => {
      logger.error(`[进程工具] 进程错误: ${sessionId} - ${err.message}`);
      session.status = 'failed';
    });

    // 如果是分离进程，取消引用
    if (detached) {
      child.unref();
    }

    return session;
  }

  /**
   * 终止进程
   */
  terminateProcess(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[进程工具] 会话不存在: ${sessionId}`);
      return false;
    }

    if (session.status !== 'running') {
      logger.warn(`[进程工具] 进程未运行: ${sessionId}`);
      return false;
    }

    // Windows 需要 taskkill
    if (process.platform === 'win32' && session.pid) {
      const { execSync } = require('child_process');
      try {
        execSync(`taskkill /F /PID ${session.pid}`, { stdio: 'ignore' });
        session.status = 'stopped';
        logger.info(`[进程工具] 进程已终止: ${sessionId}`);
        return true;
      } catch (error) {
        logger.error(`[进程工具] 终止失败: ${error}`);
        return false;
      }
    }

    // Unix 系统
    try {
      process.kill(session.pid);
      session.status = 'stopped';
      logger.info(`[进程工具] 进程已终止: ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`[进程工具] 终止失败: ${error}`);
      return false;
    }
  }

  /**
   * 获取进程状态
   */
  getStatus(sessionId: string): ProcessSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 列出所有会话
   */
  listSessions(filter?: { status?: ProcessSession['status'] }): ProcessSession[] {
    let sessions = Array.from(this.sessions.values());

    if (filter?.status) {
      sessions = sessions.filter(s => s.status === filter.status);
    }

    return sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  /**
   * 清理已停止的会话
   */
  cleanup(olderThanMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (session.status === 'stopped' && (now - session.startTime.getTime()) > olderThanMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`[进程工具] 清理了 ${cleaned} 个过期会话`);
    }

    return cleaned;
  }
}

// 单例实例
const manager = new ProcessManager();

// 定期清理
setInterval(() => manager.cleanup(3600000), 3600000);

/**
 * 启动后台进程
 */
export async function spawnProcess(
  sessionId: string,
  command: string,
  args: string[] = [],
  options?: { cwd?: string; env?: Record<string, string> }
): Promise<string> {
  const session = manager.spawnProcess(sessionId, command, args, options);

  let output = `[启动进程] ${session.command}\n\n`;
  output += `会话ID: ${session.id}\n`;
  output += `PID: ${session.pid || '未知'}\n`;
  output += `时间: ${session.startTime.toISOString()}\n`;
  output += `状态: ${session.status}\n`;

  return output;
}

/**
 * 终止进程
 */
export async function terminateProcess(sessionId: string): Promise<string> {
  const success = manager.terminateProcess(sessionId);

  let output = `[终止进程] ${sessionId}\n\n`;

  if (success) {
    output += `成功: 进程已终止\n`;
  } else {
    output += `失败: 无法终止进程\n`;
  }

  return output;
}

/**
 * 获取进程状态
 */
export async function getProcessStatus(sessionId: string): Promise<string> {
  const session = manager.getStatus(sessionId);

  if (!session) {
    return `[进程状态] ${sessionId}\n\n会话不存在`;
  }

  let output = `[进程状态] ${session.id}\n\n`;
  output += `命令: ${session.command}\n`;
  output += `PID: ${session.pid || '未知'}\n`;
  output += `启动时间: ${session.startTime.toISOString()}\n`;
  output += `状态: ${session.status}\n`;

  if (session.exitCode !== undefined) {
    output += `退出码: ${session.exitCode}\n`;
  }

  return output;
}

/**
 * 列出进程会话
 */
export async function listProcesses(options?: { status?: 'running' | 'stopped' | 'failed' }): Promise<string> {
  const sessions = manager.listSessions(options);

  let output = `[进程列表] (${sessions.length} 个会话)\n\n`;

  if (sessions.length === 0) {
    output += `暂无进程会话`;
    return output;
  }

  for (const session of sessions) {
    const statusEmoji: Record<ProcessSession['status'], string> = {
      running: '[运行中]',
      stopped: '[已停止]',
      failed: '[失败]',
    };

    output += `${statusEmoji[session.status]} ${session.id} - ${session.command}\n`;
    output += `   PID: ${session.pid || '未知'}, 状态: ${session.status}\n\n`;
  }

  return output;
}

export { ProcessManager, manager as processManager };
