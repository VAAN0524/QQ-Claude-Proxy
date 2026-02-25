/**
 * 资源监控器
 *
 * 监控 Node.js 进程的资源使用情况（内存、CPU、负载等）
 * 用于性能分析和资源管理决策。
 *
 * @example
 * ```typescript
 * // 获取内存使用情况
 * const memUsage = ResourceMonitor.getMemoryUsage();
 * console.log(memUsage);
 * // { heapUsed: '45MB', heapTotal: '60MB', rss: '80MB', external: '10MB' }
 *
 * // 检查内存是否过高
 * if (ResourceMonitor.isMemoryHigh(500)) {
 *   console.warn('内存使用过高！');
 * }
 *
 * // 获取系统信息
 * const sysInfo = ResourceMonitor.getSystemInfo();
 * console.log(sysInfo);
 * ```
 */

import * as os from 'os';
import { logger } from '../utils/logger.js';

/**
 * 内存使用信息
 */
export interface MemoryUsageInfo {
  /** 堆内存使用量 */
  heapUsed: string;
  /** 堆内存总量 */
  heapTotal: string;
  /** 常驻内存大小 */
  rss: string;
  /** 外部内存大小 */
  external: string;
  /** 数组缓冲区大小 */
  arrayBuffers: string;
}

/**
 * 系统信息
 */
export interface SystemInfo {
  /** 操作系统类型 */
  platform: string;
  /** 系统版本 */
  release: string;
  /** CPU 架构 */
  arch: string;
  /** CPU 核心数 */
  cpuCores: number;
  /** 系统总内存 (GB) */
  totalMemory: number;
  /** 系统空闲内存 (GB) */
  freeMemory: number;
  /** 内存使用率 (%) */
  memoryUsagePercent: number;
  /** 系统负载 (1分钟) */
  loadAvg1m: number;
  /** 系统负载 (5分钟) */
  loadAvg5m: number;
  /** 系统负载 (15分钟) */
  loadAvg15m: number;
}

/**
 * 进程资源快照
 */
export interface ProcessSnapshot {
  /** 快照时间 */
  timestamp: Date;
  /** 内存使用 */
  memory: NodeJS.MemoryUsage;
  /** CPU 使用率 (%) */
  cpuUsage: number;
}

/**
 * 资源趋势数据
 */
export interface ResourceTrend {
  /** 快照列表 */
  snapshots: ProcessSnapshot[];
  /** 平均内存使用 (MB) */
  avgMemory: number;
  /** 峰值内存使用 (MB) */
  peakMemory: number;
  /** 平均 CPU 使用率 (%) */
  avgCpu: number;
  /** 峰值 CPU 使用率 (%) */
  peakCpu: number;
}

/**
 * 资源监控器
 */
export class ResourceMonitor {
  private static baselineMemory = process.memoryUsage();
  private static baselineCpu = process.cpuUsage();
  private static snapshots: ProcessSnapshot[] = [];
  private static maxSnapshots = 100; // 最多保留 100 个快照

  /**
   * 获取当前内存使用情况
   *
   * @returns 内存使用信息（带单位）
   */
  static getMemoryUsage(): MemoryUsageInfo {
    const usage = process.memoryUsage();

    return {
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
      arrayBuffers: `${Math.round(usage.arrayBuffers / 1024 / 1024)}MB`,
    };
  }

  /**
   * 获取原始内存使用情况（字节）
   */
  static getRawMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * 检查内存是否过高
   *
   * @param thresholdMB - 阈值（MB），默认 500
   * @returns 是否超过阈值
   */
  static isMemoryHigh(thresholdMB: number = 500): boolean {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;

    if (heapUsedMB > thresholdMB) {
      logger.warn(`[ResourceMonitor] 内存使用过高: ${heapUsedMB.toFixed(1)}MB > ${thresholdMB}MB`);
      return true;
    }

    return false;
  }

  /**
   * 获取内存使用率
   *
   * @returns 堆内存使用率 (0-1)
   */
  static getMemoryUsageRatio(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / usage.heapTotal;
  }

  /**
   * 获取 CPU 核心数
   */
  static getCPUCores(): number {
    return os.cpus().length;
  }

  /**
   * 获取系统负载平均值
   *
   * @returns [1分钟, 5分钟, 15分钟] 负载
   */
  static getLoadAverage(): number[] {
    return os.loadavg();
  }

  /**
   * 获取系统信息
   */
  static getSystemInfo(): SystemInfo {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const [load1m, load5m, load15m] = os.loadavg();

    return {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuCores: os.cpus().length,
      totalMemory: Math.round(totalMem / 1024 / 1024 / 1024 * 100) / 100,
      freeMemory: Math.round(freeMem / 1024 / 1024 / 1024 * 100) / 100,
      memoryUsagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      loadAvg1m: Math.round(load1m * 100) / 100,
      loadAvg5m: Math.round(load5m * 100) / 100,
      loadAvg15m: Math.round(load15m * 100) / 100,
    };
  }

  /**
   * 获取 CPU 使用情况
   *
   * @returns CPU 使用率 (%)，相对于上一次调用
   */
  static getCpuUsage(): number {
    const currentUsage = process.cpuUsage(this.baselineCpu);
    const currentTime = process.hrtime();

    const userUsage = currentUsage.user - this.baselineCpu.user;
    const systemUsage = currentUsage.system - this.baselineCpu.system;
    const elapsedTime = currentTime[0] * 1e6 + currentTime[1]; // 转换为纳秒

    // 更新基线
    this.baselineCpu = process.cpuUsage();

    // 计算 CPU 使用率
    const totalUsage = userUsage + systemUsage;
    const cpuPercent = (totalUsage / elapsedTime) * 100;

    return Math.min(100, Math.max(0, cpuPercent)); // 限制在 0-100
  }

  /**
   * 创建快照
   */
  static createSnapshot(): ProcessSnapshot {
    return {
      timestamp: new Date(),
      memory: process.memoryUsage(),
      cpuUsage: this.getCpuUsage(),
    };
  }

  /**
   * 记录快照
   */
  static recordSnapshot(): void {
    const snapshot = this.createSnapshot();
    this.snapshots.push(snapshot);

    // 限制快照数量
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  /**
   * 获取资源趋势
   *
   * @returns 资源趋势数据
   */
  static getTrend(): ResourceTrend {
    if (this.snapshots.length === 0) {
      return {
        snapshots: [],
        avgMemory: 0,
        peakMemory: 0,
        avgCpu: 0,
        peakCpu: 0,
      };
    }

    let totalMemory = 0;
    let peakMemory = 0;
    let totalCpu = 0;
    let peakCpu = 0;

    for (const snapshot of this.snapshots) {
      const memMB = snapshot.memory.heapUsed / 1024 / 1024;
      totalMemory += memMB;
      peakMemory = Math.max(peakMemory, memMB);

      totalCpu += snapshot.cpuUsage;
      peakCpu = Math.max(peakCpu, snapshot.cpuUsage);
    }

    return {
      snapshots: this.snapshots,
      avgMemory: Math.round(totalMemory / this.snapshots.length),
      peakMemory: Math.round(peakMemory),
      avgCpu: Math.round(totalCpu / this.snapshots.length * 10) / 10,
      peakCpu: Math.round(peakCpu * 10) / 10,
    };
  }

  /**
   * 清空快照
   */
  static clearSnapshots(): void {
    this.snapshots = [];
  }

  /**
   * 获取进程运行时间（秒）
   */
  static getUptime(): number {
    return process.uptime();
  }

  /**
   * 格式化系统信息
   */
  static formatSystemInfo(info: SystemInfo): string {
    return [
      `系统: ${info.platform} ${info.release} (${info.arch})`,
      `CPU: ${info.cpuCores} 核心`,
      `内存: ${info.freeMemory.toFixed(1)}GB / ${info.totalMemory}GB 可用 (${info.memoryUsagePercent}% 使用)`,
      `负载: ${info.loadAvg1m} (1m) / ${info.loadAvg5m} (5m) / ${info.loadAvg15m} (15m)`,
    ].join('\n');
  }

  /**
   * 格式化内存使用信息
   */
  static formatMemoryUsage(usage: MemoryUsageInfo): string {
    return [
      `堆内存: ${usage.heapUsed} / ${usage.heapTotal}`,
      `常驻内存: ${usage.rss}`,
      `外部内存: ${usage.external}`,
    ].join(', ');
  }

  /**
   * 生成资源报告
   */
  static generateReport(): {
    process: {
      uptime: string;
      memory: MemoryUsageInfo;
      cpu: number;
    };
    system: SystemInfo;
    trend: ResourceTrend;
  } {
    return {
      process: {
        uptime: `${Math.floor(this.getUptime() / 60)}分钟`,
        memory: this.getMemoryUsage(),
        cpu: Math.round(this.getCpuUsage() * 10) / 10,
      },
      system: this.getSystemInfo(),
      trend: this.getTrend(),
    };
  }

  /**
   * 启动定期监控
   *
   * @param intervalMs - 采样间隔（毫秒），默认 5000 (5秒)
   * @returns 清理函数
   */
  static startMonitoring(intervalMs: number = 5000): () => void {
    logger.info(`[ResourceMonitor] 启动定期监控，采样间隔: ${intervalMs}ms`);

    const timer = setInterval(() => {
      this.recordSnapshot();

      // 检查内存警告
      if (this.isMemoryHigh()) {
        logger.warn('[ResourceMonitor] 内存使用警告');
      }

      // 检查负载警告
      const [load1m] = this.getLoadAverage();
      const cores = this.getCPUCores();
      if (load1m > cores * 2) {
        logger.warn(`[ResourceMonitor] 系统负载过高: ${load1m.toFixed(2)} > ${cores * 2}`);
      }
    }, intervalMs);

    // 返回清理函数
    return () => {
      clearInterval(timer);
      logger.info('[ResourceMonitor] 停止定期监控');
    };
  }

  /**
   * 获取 GC 建议
   *
   * @returns 是否建议执行 GC
   */
  static shouldGC(): boolean {
    const usageRatio = this.getMemoryUsageRatio();
    // 如果堆内存使用超过 80%，建议 GC
    return usageRatio > 0.8;
  }

  /**
   * 执行手动 GC（如果可用）
   */
  static forceGC(): boolean {
    if (global.gc) {
      logger.info('[ResourceMonitor] 执行手动 GC');
      global.gc();
      return true;
    }
    return false;
  }

  /**
   * 重置基线
   */
  static resetBaseline(): void {
    this.baselineMemory = process.memoryUsage();
    this.baselineCpu = process.cpuUsage();
  }

  /**
   * 比较两个内存使用情况的差异
   */
  static compareMemory(
    before: NodeJS.MemoryUsage,
    after: NodeJS.MemoryUsage
  ): {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  } {
    return {
      heapUsed: (after.heapUsed - before.heapUsed) / 1024 / 1024,
      heapTotal: (after.heapTotal - before.heapTotal) / 1024 / 1024,
      rss: (after.rss - before.rss) / 1024 / 1024,
      external: (after.external - before.external) / 1024 / 1024,
    };
  }

  /**
   * 检查是否接近内存限制
   *
   * @param limitMB - 内存限制（MB），默认 1024 (1GB)
   * @param thresholdRatio - 阈值比例 (0-1)，默认 0.9
   * @returns 是否接近限制
   */
  static isNearMemoryLimit(
    limitMB: number = 1024,
    thresholdRatio: number = 0.9
  ): boolean {
    const usage = process.memoryUsage();
    const usedMB = usage.heapUsed / 1024 / 1024;
    return usedMB > (limitMB * thresholdRatio);
  }

  /**
   * 获取内存泄漏检测建议
   *
   * @returns 检测结果和建议
   */
  static detectMemoryLeak(): {
    detected: boolean;
    trend: 'increasing' | 'stable' | 'decreasing';
    recommendation: string;
  } {
    const trend = this.getTrend();

    if (trend.snapshots.length < 5) {
      return {
        detected: false,
        trend: 'stable',
        recommendation: '快照数据不足，无法判断',
      };
    }

    // 分析趋势
    const firstHalf = trend.snapshots.slice(0, Math.floor(trend.snapshots.length / 2));
    const secondHalf = trend.snapshots.slice(Math.floor(trend.snapshots.length / 2));

    const avgFirst = firstHalf.reduce((sum, s) => sum + s.memory.heapUsed, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, s) => sum + s.memory.heapUsed, 0) / secondHalf.length;

    const growthRatio = (avgSecond - avgFirst) / avgFirst;

    if (growthRatio > 0.1) {
      return {
        detected: true,
        trend: 'increasing',
        recommendation: '检测到内存持续增长，可能存在内存泄漏。建议检查循环引用和事件监听器。',
      };
    } else if (growthRatio < -0.1) {
      return {
        detected: false,
        trend: 'decreasing',
        recommendation: '内存使用呈下降趋势，系统健康。',
      };
    } else {
      return {
        detected: false,
        trend: 'stable',
        recommendation: '内存使用稳定。',
      };
    }
  }
}

export default ResourceMonitor;
