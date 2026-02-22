/**
 * Claude Code CLI 客户端
 * 直接调用本地 claude 命令，实现真正的 Claude Code Agent
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

export interface ClaudeCliOptions {
  /** 工作目录 */
  cwd?: string;
  /** 是否跳过权限确认 (默认 true) */
  bypassPermissions?: boolean;
}

export interface ClaudeCliResult {
  success: boolean;
  output: string;
  error?: string;
  filesCreated?: string[];
  filesModified?: string[];
}

export class ClaudeCodeCli {
  private cwd: string;
  private bypassPermissions: boolean;

  constructor(options: ClaudeCliOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    // 默认跳过权限确认，使用本地 CLI 配置
    this.bypassPermissions = options.bypassPermissions !== false;
  }

  /**
   * 执行 Claude Code CLI 命令
   */
  async execute(prompt: string, options: {
    imagePath?: string;
    attachmentPath?: string;
  } = {}): Promise<ClaudeCliResult> {
    return new Promise((resolve, reject) => {
      // 构建完整提示
      let fullPrompt = prompt;

      // 如果有图片附件，将其复制到工作目录并在提示中引用
      let localImagePath: string | undefined;
      if (options.imagePath && fs.existsSync(options.imagePath)) {
        try {
          // 将图片复制到工作目录，使用固定的文件名
          const imageName = `uploaded_image${path.extname(options.imagePath)}`;
          localImagePath = path.join(this.cwd, imageName);

          // 如果文件已存在，先删除
          if (fs.existsSync(localImagePath)) {
            fs.unlinkSync(localImagePath);
          }

          fs.copyFileSync(options.imagePath, localImagePath);
          logger.info(`图片已复制到工作目录: ${imageName}`);

          // 在 prompt 中明确告诉 Claude 查看图片
          fullPrompt = `[用户上传了一张图片，保存为: ${imageName}]\n请先用 read_file 工具查看这张图片，理解其内容，然后回答以下问题：\n\n${prompt}`;
        } catch (error) {
          logger.error(`处理图片失败: ${error}`);
          fullPrompt = `[图片处理失败: ${error}]\n\n${prompt}`;
        }
      }

      // 如果有其他附件，类似处理
      let localAttachmentPath: string | undefined;
      if (options.attachmentPath && fs.existsSync(options.attachmentPath) && !localImagePath) {
        try {
          const attachmentName = `uploaded_file${path.extname(options.attachmentPath)}`;
          localAttachmentPath = path.join(this.cwd, attachmentName);

          if (fs.existsSync(localAttachmentPath)) {
            fs.unlinkSync(localAttachmentPath);
          }

          fs.copyFileSync(options.attachmentPath, localAttachmentPath);
          logger.info(`文件已复制到工作目录: ${attachmentName}`);

          fullPrompt = `[用户上传了一个文件，保存为: ${attachmentName}]\n请查看这个文件后回答：\n\n${prompt}`;
        } catch (error) {
          logger.error(`处理文件失败: ${error}`);
        }
      }

      logger.info(`执行 Claude Code: claude "${prompt.substring(0, 50)}..."`);
      logger.debug(`工作目录: ${this.cwd}`);

      // 临时测试：使用简单回显来验证流程
      // 如果这个工作，说明问题是 CLI 嵌套检测
      const isTestMode = process.env.QQ_BOT_TEST_MODE === 'true';

      if (isTestMode) {
        // 测试模式：直接返回预设响应
        logger.info('测试模式：跳过 CLI 执行');
        logger.info('测试模式：返回预设响应');
        resolve({
          success: true,
          output: `收到您的消息：${prompt}\n\n这是一个测试响应。QQ Bot 连接正常工作！`,
        });
        return;
      }

      // 使用 stdin 传递 prompt，避免参数引号问题
      const args: string[] = [];
      if (this.bypassPermissions) {
        args.push('--dangerously-skip-permissions');
      }

      // Windows 需要使用 shell 来找到 claude 命令
      const isWindows = process.platform === 'win32';

      // 创建环境变量副本，但保留 PATH 等必要变量
      const env: Record<string, string> = { ...process.env } as Record<string, string>;
      // 只清除嵌套检测相关变量
      delete env.CLAUDECODE;
      delete env.CLAUDE_CODE_SESSION;

      const command = 'claude';
      const finalArgs = args;

      logger.debug(`执行命令: ${command} ${finalArgs.join(' ')}`);
      logger.debug(`Prompt: ${fullPrompt.substring(0, 100)}...`);

      const claudeProcess = spawn(command, finalArgs, {
        cwd: this.cwd,
        shell: isWindows, // Windows 需要 shell 来找到 claude 命令
        env: env,
        // 使用 stdin 传递 prompt
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      // 将 prompt 写入 stdin 并关闭，触发 CLI 处理
      claudeProcess.stdin.write(fullPrompt + '\n');
      claudeProcess.stdin.end();

      claudeProcess.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        // 实时输出日志
        logger.debug(`[Claude stdout] ${chunk.trim()}`);
      });

      claudeProcess.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        logger.debug(`[Claude stderr] ${chunk.trim()}`);
      });

      claudeProcess.on('close', (code: number | null) => {
        if (code === 0) {
          logger.info('Claude Code 执行成功');
          resolve({
            success: true,
            output: stdout,
          });
        } else {
          logger.warn(`Claude Code 退出码: ${code}`);
          resolve({
            success: false,
            output: stdout,
            error: stderr || `进程退出码: ${code ?? 'unknown'}`,
          });
        }
      });

      claudeProcess.on('error', (err: Error) => {
        logger.error(`Claude Code 执行错误: ${err.message}`);
        resolve({
          success: false,
          output: '',
          error: err.message,
        });
      });

      // 添加超时机制（5分钟）
      const timeout = setTimeout(() => {
        logger.warn('Claude Code 执行超时，正在终止...');
        claudeProcess.kill('SIGTERM');
        resolve({
          success: false,
          output: stdout,
          error: '执行超时（5分钟限制）',
        });
      }, 5 * 60 * 1000);

      // 清理超时当进程结束时
      claudeProcess.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * 读取文件内容
   */
  readFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      logger.error(`读取文件失败: ${filePath}`);
      throw error;
    }
  }

  /**
   * 写入文件
   */
  writeFile(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    logger.info(`文件已写入: ${filePath}`);
  }

  /**
   * 列出目录内容
   */
  listDirectory(dirPath: string): string[] {
    try {
      return fs.readdirSync(dirPath);
    } catch (error) {
      logger.error(`列出目录失败: ${dirPath}`);
      return [];
    }
  }

  /**
   * 检查文件是否存在
   */
  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  /**
   * 获取工作目录下的所有文件（递归）
   */
  getAllFiles(dir: string = this.cwd, baseDir: string = this.cwd): string[] {
    const files: string[] = [];

    try {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        // 跳过 node_modules, .git, dist 等
        if (item === 'node_modules' || item === '.git' || item === 'dist' || item.startsWith('.')) {
          continue;
        }

        if (stat.isDirectory()) {
          files.push(...this.getAllFiles(fullPath, baseDir));
        } else {
          files.push(path.relative(baseDir, fullPath));
        }
      }
    } catch (error) {
      logger.error(`读取目录失败: ${dir}`);
    }

    return files;
  }

  /**
   * 设置工作目录
   */
  setCwd(newCwd: string): void {
    if (fs.existsSync(newCwd)) {
      this.cwd = newCwd;
      logger.info(`工作目录已切换: ${newCwd}`);
    } else {
      throw new Error(`目录不存在: ${newCwd}`);
    }
  }

  /**
   * 获取当前工作目录
   */
  getCwd(): string {
    return this.cwd;
  }
}

export default ClaudeCodeCli;
