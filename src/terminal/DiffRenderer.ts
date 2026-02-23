/**
 * 差分渲染器 (DiffRenderer)
 *
 * 参考 pi-mono 的 pi-tui 模块，实现高效的终端渲染：
 * - 只更新变化的行，避免重绘整个屏幕
 * - 支持彩色输出和样式
 * - 适合大量输出场景（如代码生成、日志流）
 */

import { writeFileSync } from 'fs';
import type { WriteStream } from 'tty';

/**
 * 差异类型
 */
type DiffType = 'same' | 'insert' | 'delete' | 'update';

/**
 * 差异项
 */
interface Diff {
  type: DiffType;
  line: number;
  content?: string;
}

/**
 * 终端颜色
 */
export enum TerminalColor {
  Reset = '\x1b[0m',
  Bright = '\x1b[1m',
  Dim = '\x1b[2m',
  Underscore = '\x1b[4m',
  Blink = '\x1b[5m',
  Reverse = '\x1b[7m',
  Hidden = '\x1b[8m',

  // 前景色
  Black = '\x1b[30m',
  Red = '\x1b[31m',
  Green = '\x1b[32m',
  Yellow = '\x1b[33m',
  Blue = '\x1b[34m',
  Magenta = '\x1b[35m',
  Cyan = '\x1b[36m',
  White = '\x1b[37m',

  // 背景色
  BgBlack = '\x1b[40m',
  BgRed = '\x1b[41m',
  BgGreen = '\x1b[42m',
  BgYellow = '\x1b[43m',
  BgBlue = '\x1b[44m',
  BgMagenta = '\x1b[45m',
  BgCyan = '\x1b[46m',
  BgWhite = '\x1b[47m',
}

/**
 * 颜色样式
 */
export interface ColorStyle {
  color?: TerminalColor;
  background?: TerminalColor;
  bright?: boolean;
  dim?: boolean;
  underscore?: boolean;
  blink?: boolean;
}

/**
 * 应用颜色样式
 */
export function colorize(text: string, style: ColorStyle): string {
  let codes = '';

  if (style.color) codes += style.color;
  if (style.background) codes += style.background;
  if (style.bright) codes += TerminalColor.Bright;
  if (style.dim) codes += TerminalColor.Dim;
  if (style.underscore) codes += TerminalColor.Underscore;
  if (style.blink) codes += TerminalColor.Blink;

  return codes + text + TerminalColor.Reset;
}

/**
 * 预定义颜色样式
 */
export const Colors = {
  success: (text: string) => colorize(text, { color: TerminalColor.Green }),
  error: (text: string) => colorize(text, { color: TerminalColor.Red }),
  warning: (text: string) => colorize(text, { color: TerminalColor.Yellow }),
  info: (text: string) => colorize(text, { color: TerminalColor.Blue }),
  muted: (text: string) => colorize(text, { color: TerminalColor.Black, bright: true }),
  highlight: (text: string) => colorize(text, { color: TerminalColor.Cyan, bright: true }),
  bold: (text: string) => colorize(text, { bright: true }),
  dim: (text: string) => colorize(text, { dim: true }),
};

/**
 * 差分渲染器
 *
 * 使用 VT100 转义序列实现高效的终端更新
 */
export class DiffRenderer {
  private previousLines: string[] = [];
  private terminal: WriteStream;
  private lineCount = 0;

  constructor(terminal: WriteStream = process.stdout as WriteStream) {
    this.terminal = terminal;
  }

  /**
   * 渲染新内容，只更新变化的行
   *
   * @param lines 要渲染的行数组
   * @param fullRedraw 是否强制完全重绘（用于初始化）
   */
  render(lines: string[], fullRedraw: boolean = false): void {
    if (fullRedraw || this.previousLines.length === 0) {
      // 首次渲染或完全重绘
      this.clear();
      for (const line of lines) {
        this.terminal.write(line + '\n');
      }
      this.previousLines = [...lines];
      this.lineCount = lines.length;
      return;
    }

    const diffs = this.computeDiff(this.previousLines, lines);

    // 移动光标到第一行
    this.moveCursorToLine(0);

    for (const diff of diffs) {
      switch (diff.type) {
        case 'same':
          // 相同行：向下移动
          this.moveCursorDown(1);
          break;

        case 'delete':
          // 删除行：清除并向下移动
          this.clearLine();
          this.moveCursorDown(1);
          break;

        case 'insert':
          // 插入行：打印新内容
          this.terminal.write(diff.content! + '\n');
          break;

        case 'update':
          // 更新行：清除并重写
          this.clearLine();
          this.terminal.write(diff.content! + '\n');
          break;
      }
    }

    // 处理多余的行（新行数少于旧行数）
    if (lines.length < this.previousLines.length) {
      for (let i = lines.length; i < this.previousLines.length; i++) {
        this.clearLine();
        this.moveCursorDown(1);
      }
    }

    this.previousLines = [...lines];
    this.lineCount = lines.length;
  }

  /**
   * 追加新行（不清除旧内容）
   */
  append(lines: string[]): void {
    for (const line of lines) {
      this.terminal.write(line + '\n');
    }
    this.previousLines.push(...lines);
    this.lineCount += lines.length;
  }

  /**
   * 计算两行数组的差异
   *
   * 使用简化的差异算法，适用于终端渲染场景
   */
  private computeDiff(oldLines: string[], newLines: string[]): Diff[] {
    const diffs: Diff[] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (!oldLine && newLine) {
        diffs.push({ type: 'insert', line: i, content: newLine });
      } else if (oldLine && !newLine) {
        diffs.push({ type: 'delete', line: i });
      } else if (oldLine !== newLine) {
        diffs.push({ type: 'update', line: i, content: newLine! });
      } else {
        diffs.push({ type: 'same', line: i });
      }
    }

    return diffs;
  }

  /**
   * 移动光标到指定行（从 0 开始）
   */
  private moveCursorToLine(line: number): void {
    this.terminal.write(`\x1b[${line + 1};0H`); // VT100 光标定位
  }

  /**
   * 向下移动光标
   */
  private moveCursorDown(n: number): void {
    if (n > 0) {
      this.terminal.write(`\x1b[${n}B`);
    }
  }

  /**
   * 清除当前行
   */
  private clearLine(): void {
    this.terminal.write('\x1b[2K'); // 清除整行
  }

  /**
   * 清屏
   */
  clear(): void {
    this.terminal.write('\x1b[2J'); // 清屏
    this.terminal.write('\x1b[H');  // 移动到左上角
    this.previousLines = [];
    this.lineCount = 0;
  }

  /**
   * 隐藏光标
   */
  hideCursor(): void {
    this.terminal.write('\x1b[?25l');
  }

  /**
   * 显示光标
   */
  showCursor(): void {
    this.terminal.write('\x1b[?25h');
  }

  /**
   * 获取当前行数
   */
  getLineCount(): number {
    return this.lineCount;
  }

  /**
   * 保存光标位置
   */
  saveCursor(): void {
    this.terminal.write('\x1b[s');
  }

  /**
   * 恢复光标位置
   */
  restoreCursor(): void {
    this.terminal.write('\x1b[u');
  }
}

/**
 * 分屏渲染器
 *
 * 将终端分为多个区域，独立更新
 */
export class SplitRenderer {
  private renders: Map<string, { region: Region; renderer: DiffRenderer }>;

  constructor() {
    this.renders = new Map();
  }

  /**
   * 创建一个区域
   */
  createRegion(name: string, region: Region): DiffRenderer {
    const renderer = new DiffRenderer();
    this.renders.set(name, { region, renderer });
    return renderer;
  }

  /**
   * 渲染指定区域
   */
  renderRegion(name: string, lines: string[]): void {
    const entry = this.renders.get(name);
    if (!entry) {
      throw new Error(`Region not found: ${name}`);
    }

    const { region } = entry;
    const absoluteLine = region.top;

    // 移动到区域起始位置
    process.stdout.write(`\x1b[${absoluteLine + 1};0H`);

    // 渲染内容
    entry.renderer.render(lines);
  }

  /**
   * 获取区域渲染器
   */
  getRenderer(name: string): DiffRenderer | undefined {
    return this.renders.get(name)?.renderer;
  }
}

/**
 * 终端区域
 */
export interface Region {
  top: number;
  left: number;
  width?: number;
  height?: number;
}

/**
 * 终端尺寸
 */
export function getTerminalSize(): { rows: number; cols: number } {
  return {
    rows: process.stdout.rows || 24,
    cols: process.stdout.columns || 80,
  };
}

/**
 * 检测是否支持颜色
 */
export function supportsColor(): boolean {
  return process.stdout.isTTY &&
    (process.env.TERM === 'xterm-256color' || process.env.TERM === 'xterm');
}

/**
 * 检测是否支持真彩色
 */
export function supportsTrueColor(): boolean {
  return process.env.COLORTERM === 'truecolor' || process.env.COLORTERM === '24bit';
}
