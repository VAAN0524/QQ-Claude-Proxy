/**
 * ToolCallTracker - 工具调用追踪器
 *
 * 记录所有工具调用，统计成功率和延迟
 * 用于监控和调试工具使用情况
 */

import { logger } from '../utils/logger.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * 工具调用日志
 */
export interface ToolCallLog {
  /** 工具名称 */
  toolName: string;
  /** 调用参数 */
  parameters: Record<string, unknown>;
  /** 调用结果（成功/失败） */
  result: 'success' | 'failure';
  /** 错误信息（失败时） */
  error?: string;
  /** 执行时长（毫秒） */
  duration: number;
  /** 时间戳 */
  timestamp: Date;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * 工具统计信息
 */
export interface ToolStats {
  toolName: string;
  totalCalls: number;
  successCalls: number;
  failureCalls: number;
  successRate: number;
  avgDuration: number;
  lastCallTime?: Date;
}

/**
 * 工具调用追踪器
 */
export class ToolCallTracker {
  private static logs: ToolCallLog[] = [];
  private static maxLogs = 1000; // 最多保留 1000 条日志
  private static persistPath = 'data/tool-calls.json';

  /**
   * 记录工具调用
   */
  static async track(options: {
    toolName: string;
    parameters: Record<string, unknown>;
    execute: () => Promise<unknown>;
    sessionId?: string;
  }): Promise<unknown> {
    const { toolName, parameters, execute, sessionId } = options;
    const startTime = Date.now();

    let result: 'success' | 'failure' = 'success';
    let error: string | undefined;
    let returnValue: unknown;

    try {
      returnValue = await execute();
      return returnValue;
    } catch (e: any) {
      result = 'failure';
      error = e?.message || String(e);
      throw e;
    } finally {
      const duration = Date.now() - startTime;

      const log: ToolCallLog = {
        toolName,
        parameters: this.sanitizeParameters(parameters),
        result,
        error,
        duration,
        timestamp: new Date(),
        sessionId,
      };

      this.addLog(log);

      logger.debug(
        `[ToolCallTracker] ${toolName}: ${result} (${duration}ms)`
      );
    }
  }

  /**
   * 清理参数中的敏感信息
   */
  private static sanitizeParameters(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'apiKey'];

    for (const [key, value] of Object.entries(params)) {
      const isSensitive = sensitiveKeys.some(sensitive =>
        key.toLowerCase().includes(sensitive)
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 200) {
        // 截断过长的字符串
        sanitized[key] = value.substring(0, 200) + '...';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * 添加日志
   */
  private static addLog(log: ToolCallLog): void {
    this.logs.push(log);

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 异步持久化
    this.persist().catch(e => {
      logger.warn(`[ToolCallTracker] 持久化失败: ${e}`);
    });
  }

  /**
   * 获取工具统计
   */
  static getStats(toolName?: string): ToolStats[] {
    const statsMap = new Map<string, ToolStats>();

    for (const log of this.logs) {
      if (toolName && log.toolName !== toolName) {
        continue;
      }

      if (!statsMap.has(log.toolName)) {
        statsMap.set(log.toolName, {
          toolName: log.toolName,
          totalCalls: 0,
          successCalls: 0,
          failureCalls: 0,
          successRate: 0,
          avgDuration: 0,
        });
      }

      const stats = statsMap.get(log.toolName)!;
      stats.totalCalls++;
      stats.lastCallTime = log.timestamp;

      if (log.result === 'success') {
        stats.successCalls++;
      } else {
        stats.failureCalls++;
      }
    }

    // 计算成功率和平均延迟
    for (const stats of statsMap.values()) {
      stats.successRate = stats.totalCalls > 0
        ? stats.successCalls / stats.totalCalls
        : 0;

      const toolLogs = this.logs.filter(l => l.toolName === stats.toolName);
      stats.avgDuration = toolLogs.length > 0
        ? toolLogs.reduce((sum, l) => sum + l.duration, 0) / toolLogs.length
        : 0;
    }

    return Array.from(statsMap.values()).sort((a, b) =>
      b.totalCalls - a.totalCalls
    );
  }

  /**
   * 获取最近的调用日志
   */
  static getRecentLogs(limit: number = 50): ToolCallLog[] {
    return this.logs
      .slice(-limit)
      .reverse();
  }

  /**
   * 清空日志
   */
  static clear(): void {
    this.logs = [];
    logger.info('[ToolCallTracker] 已清空日志');
  }

  /**
   * 持久化到磁盘
   */
  private static async persist(): Promise<void> {
    try {
      const dir = join(process.cwd(), 'data');
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      const data = JSON.stringify(this.logs.slice(-100), null, 2); // 只保留最近 100 条
      await writeFile(join(dir, 'tool-calls.json'), data, 'utf-8');
    } catch (e) {
      logger.error(`[ToolCallTracker] 持久化失败: ${e}`);
    }
  }

  /**
   * 格式化统计信息
   */
  static formatStats(stats: ToolStats[]): string {
    if (stats.length === 0) {
      return '(暂无统计数据)';
    }

    const lines: string[] = ['## 工具调用统计\n\n'];

    for (const stat of stats) {
      lines.push(`### ${stat.toolName}`);
      lines.push(`- 总调用: ${stat.totalCalls}`);
      lines.push(`- 成功: ${stat.successCalls} | 失败: ${stat.failureCalls}`);
      lines.push(`- 成功率: ${(stat.successRate * 100).toFixed(1)}%`);
      lines.push(`- 平均延迟: ${stat.avgDuration.toFixed(0)}ms`);
      if (stat.lastCallTime) {
        lines.push(`- 最后调用: ${stat.lastCallTime.toISOString()}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

export default ToolCallTracker;
