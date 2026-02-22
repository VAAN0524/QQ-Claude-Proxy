/**
 * VSCode 风格进度展示
 *
 * 参考 VSCode 的终端进度显示方式：
 * 1. Unicode 旋转字符 (⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
 * 2. 进度条 (████████░░░░░░░░░)
 * 3. 百分比显示
 */

/**
 * 进度图标类型
 */
export type ProgressIconType = 'spinner' | 'dots' | 'arrow' | 'blocks';

/**
 * VSCode 风格进度格式化器
 */
export class ProgressFormatter {
  private static readonly SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private static readonly DOTS_FRAMES = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷', '⣿', '⡿'];
  private static readonly ARROW_FRAMES = ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'];
  private static readonly BLOCKS_FRAMES = ['◐', '◓', '◑', '◒'];

  /**
   * 获取旋转动画帧
   */
  static getSpinnerFrame(index: number, type: ProgressIconType = 'spinner'): string {
    const frames = this.getFrames(type);
    return frames[index % frames.length];
  }

  private static getFrames(type: ProgressIconType): string[] {
    switch (type) {
      case 'dots': return this.DOTS_FRAMES;
      case 'arrow': return this.ARROW_FRAMES;
      case 'blocks': return this.BLOCKS_FRAMES;
      default: return this.SPINNER_FRAMES;
    }
  }

  /**
   * 格式化进度条 (VSCode 风格)
   * @param progress 0-100
   * @param width 进度条宽度（字符数）
   */
  static formatProgressBar(progress: number, width: number = 20): string {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;

    // 使用 █ 和 ░
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${progress}%`;
  }

  /**
   * VSCode 风格的紧凑进度行
   * @param icon 旋转图标
   * @param title 任务标题
   * @param progress 0-100 (可选)
   * @param detail 详情信息
   */
  static formatCompactProgress(
    icon: string,
    title: string,
    progress?: number,
    detail?: string
  ): string {
    let line = `${icon} ${title}`;

    if (progress !== undefined) {
      line += ` ${this.formatProgressBar(progress, 12)}`;
    }

    if (detail) {
      const maxLength = 50;
      const truncatedDetail = detail.length > maxLength
        ? detail.substring(0, maxLength) + '...'
        : detail;
      line += `\n   ${truncatedDetail}`;
    }

    return line;
  }

  /**
   * 多任务进度展示 (类似 VSCode 的输出面板)
   */
  static formatMultiProgress(tasks: Array<{
    title: string;
    progress?: number;
    detail?: string;
  }>): string {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    let output = `[${timestamp}] 正在执行任务...\n\n`;

    for (const task of tasks) {
      const icon = task.progress !== undefined ? '⚙' : '⠋';
      output += this.formatCompactProgress(icon, task.title, task.progress, task.detail) + '\n\n';
    }

    return output.trimEnd();
  }

  /**
   * 关键状态更新 (VSCode 风格)
   */
  static formatMilestoneUpdate(
    action: string,  // "Reading", "Analyzing", "Compiling"
    target: string,  // 文件名、模块名等
    status?: 'pending' | 'active' | 'done' | 'error'
  ): string {
    const icons = {
      pending: '○',
      active: '◐',
      done: '●',
      error: '◉'
    };

    const icon = icons[status || 'active'];
    return `${icon} ${action}: ${target}`;
  }

  /**
   * 生成心跳消息 (VSCode 风格)
   */
  static formatHeartbeat(
    elapsedSeconds: number,
    currentAction?: string,
    spinnerIndex: number = 0
  ): string {
    const spinner = this.getSpinnerFrame(spinnerIndex, 'spinner');
    const elapsed = this.formatElapsed(elapsedSeconds);

    let message = `${spinner} 任务执行中... ${elapsed}`;

    if (currentAction) {
      const action = currentAction.length > 40
        ? currentAction.substring(0, 40) + '...'
        : currentAction;
      message += `\n   ${action}`;
    }

    return message;
  }

  /**
   * 格式化时间
   */
  private static formatElapsed(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}秒`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}分${secs}秒`;
  }

  /**
   * 任务完成样式
   */
  static formatCompletion(
    title: string,
    elapsedSeconds: number,
    hasErrors: boolean = false
  ): string {
    const icon = hasErrors ? '⚠' : '✓';
    const status = hasErrors ? '完成 (有警告)' : '完成';
    const elapsed = this.formatElapsed(elapsedSeconds);

    return `${icon} ${title} - ${status} (${elapsed})`;
  }
}

/**
 * 进度动画状态管理器
 */
export class ProgressAnimator {
  private frameIndex: number = 0;
  private interval: NodeJS.Timeout | null = null;
  private currentTask: string | null = null;

  /**
   * 启动动画
   */
  start(
    callback: (frame: string) => void,
    intervalMs: number = 100,
    iconType: ProgressIconType = 'spinner'
  ): void {
    this.stop(); // 清除之前的动画

    this.interval = setInterval(() => {
      const frame = ProgressFormatter.getSpinnerFrame(this.frameIndex++, iconType);
      callback(frame);
    }, intervalMs);
  }

  /**
   * 停止动画
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.frameIndex = 0;
    this.currentTask = null;
  }

  /**
   * 获取当前帧（不启动动画）
   */
  getCurrentFrame(type: ProgressIconType = 'spinner'): string {
    return ProgressFormatter.getSpinnerFrame(this.frameIndex++, type);
  }
}
