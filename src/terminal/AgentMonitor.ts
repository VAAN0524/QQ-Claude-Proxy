/**
 * Agent 监控器
 *
 * 使用差分渲染实时显示 Agent 执行状态
 */

import { DiffRenderer, Colors } from './DiffRenderer.js';
import type { WriteStream } from 'tty';

/**
 * Agent 状态
 */
export type AgentStatus = 'idle' | 'running' | 'success' | 'error' | 'timeout';

/**
 * Agent 执行信息
 */
export interface AgentExecutionInfo {
  currentAgent: string;
  currentStep: number;
  totalSteps: number;
  status: AgentStatus;
  lastOutput: string;
  toolCalls: string[];
  elapsedTime: number;
  startTime?: number;
}

/**
 * Agent 监控器
 */
export class AgentMonitor {
  private renderer: DiffRenderer;
  private startTime: number = 0;
  private updateInterval?: NodeJS.Timeout;

  constructor(terminal?: WriteStream) {
    this.renderer = new DiffRenderer(terminal);
    this.renderer.hideCursor();
  }

  /**
   * 开始监控
   */
  start(): void {
    this.startTime = Date.now();
    this.updateInterval = setInterval(() => {
      // 定期刷新（即使没有状态变化）
      // 这确保了计时器始终更新
    }, 100);
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    this.renderer.showCursor();
  }

  /**
   * 显示 Agent 执行状态（实时更新）
   */
  showAgentStatus(info: AgentExecutionInfo): void {
    const elapsed = info.elapsedTime || (this.startTime ? Date.now() - this.startTime : 0);

    const lines = this.formatStatus(info, elapsed);
    this.renderer.render(lines);
  }

  /**
   * 格式化状态为可显示的行
   */
  private formatStatus(info: AgentExecutionInfo, elapsed: number): string[] {
    const statusIcon = this.getStatusIcon(info.status);
    const statusColor = this.getStatusColor(info.status);

    return [
      '',
      '═══════════════════════════════════════════════════════════════',
      Colors.bold('  Agent 执行监控'),
      '═══════════════════════════════════════════════════════════════',
      '',
      `  当前 Agent: ${Colors.highlight(info.currentAgent)}`,
      `  执行步骤: ${Colors.info(`${info.currentStep}/${info.totalSteps}`)}`,
      `  状态: ${statusColor(statusIcon)} ${statusColor(this.getStatusText(info.status))}`,
      `  耗时: ${Colors.muted(`${elapsed}ms`)}`,
      '',
      '──────────────────────────────────────────────────────────────',
      '  最近输出:',
      `  ${Colors.dim(info.lastOutput || '(无)')}`,
      '──────────────────────────────────────────────────────────────',
      '',
      `  工具调用: ${info.toolCalls.length > 0 ? Colors.info(info.toolCalls.join(', ')) : Colors.muted('(无)')}`,
      '',
      '  ' + Colors.muted('按 Ctrl+C 退出监控'),
      '',
    ];
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: AgentStatus): string {
    switch (status) {
      case 'idle': return '○';
      case 'running': return Colors.info('▶');
      case 'success': return Colors.success('✓');
      case 'error': return Colors.error('✗');
      case 'timeout': return Colors.warning('⚠');
      default: return '○';
    }
  }

  /**
   * 获取状态颜色函数
   */
  private getStatusColor(status: AgentStatus): (text: string) => string {
    switch (status) {
      case 'idle': return Colors.muted;
      case 'running': return Colors.info;
      case 'success': return Colors.success;
      case 'error': return Colors.error;
      case 'timeout': return Colors.warning;
      default: return (s) => s;
    }
  }

  /**
   * 获取状态文本
   */
  private getStatusText(status: AgentStatus): string {
    switch (status) {
      case 'idle': return '空闲';
      case 'running': return '运行中';
      case 'success': return '成功';
      case 'error': return '错误';
      case 'timeout': return '超时';
      default: return '未知';
    }
  }

  /**
   * 显示欢迎信息
   */
  showWelcome(): void {
    const lines = [
      '',
      '═══════════════════════════════════════════════════════════════',
      Colors.bold('  QQ-Claude-Proxy Agent 监控器'),
      '═══════════════════════════════════════════════════════════════',
      '',
      Colors.muted('  正在连接到 Gateway...'),
      '',
    ];
    this.renderer.render(lines, true);
  }

  /**
   * 显示连接成功
   */
  showConnected(): void {
    const lines = [
      '',
      '═══════════════════════════════════════════════════════════════',
      Colors.bold('  QQ-Claude-Proxy Agent 监控器'),
      '═══════════════════════════════════════════════════════════════',
      '',
      Colors.success('  ✓ 已连接到 Gateway'),
      '',
      Colors.muted('  等待 Agent 执行事件...'),
      '',
      '  ' + Colors.muted('按 Ctrl+C 退出监控'),
      '',
    ];
    this.renderer.render(lines);
  }

  /**
   * 显示错误信息
   */
  showError(message: string): void {
    const lines = [
      '',
      '═══════════════════════════════════════════════════════════════',
      Colors.bold('  QQ-Claude-Proxy Agent 监控器'),
      '═══════════════════════════════════════════════════════════════',
      '',
      Colors.error('  ✗ 错误: ' + message),
      '',
      '  ' + Colors.muted('按 Ctrl+C 退出监控'),
      '',
    ];
    this.renderer.render(lines);
  }

  /**
   * 清屏
   */
  clear(): void {
    this.renderer.clear();
  }

  /**
   * 销毁监控器
   */
  destroy(): void {
    this.stop();
    this.renderer.showCursor();
    this.renderer.clear();
  }
}

/**
 * 进度条组件
 */
export class ProgressBar {
  private width: number;
  private current: number = 0;
  private total: number;

  constructor(total: number, width: number = 40) {
    this.total = total;
    this.width = width;
  }

  /**
   * 更新进度
   */
  update(current: number): string {
    this.current = Math.min(current, this.total);
    const ratio = this.current / this.total;
    const filled = Math.round(ratio * this.width);
    const empty = this.width - filled;

    const bar = Colors.success('█'.repeat(filled)) + Colors.dim('░'.repeat(empty));
    const percent = Colors.bold(`${Math.round(ratio * 100)}%`);
    const text = `${bar} ${percent} (${this.current}/${this.total})`;

    return text;
  }

  /**
   * 完成进度条
   */
  complete(): string {
    return this.update(this.total) + ' ' + Colors.success('✓');
  }
}
