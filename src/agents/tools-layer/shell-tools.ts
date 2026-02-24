/**
 * Shell 工具 - 命令执行
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

/**
 * 命令执行结果
 */
export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

/**
 * 危险命令列表 (默认阻止)
 */
const DANGEROUS_COMMANDS = [
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

/**
 * 检查命令是否安全
 */
export function isCommandSafe(command: string): boolean {
  const lowerCommand = command.toLowerCase().trim();

  // 检查危险命令
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (lowerCommand.includes(dangerous)) {
      return false;
    }
  }

  return true;
}

/**
 * 执行命令
 */
export async function executeCommand(
  command: string,
  options: {
    cwd?: string;
    timeout?: number;
    allowedCommands?: string[];
    blockedCommands?: string[];
  } = {}
): Promise<ShellResult> {
  const { cwd = process.cwd(), timeout = 30000, allowedCommands, blockedCommands } = options;

  // 安全检查
  if (!isCommandSafe(command)) {
    return {
      stdout: '',
      stderr: '命令被阻止：危险命令',
      exitCode: 1,
      success: false,
    };
  }

  // 检查允许列表
  if (allowedCommands && allowedCommands.length > 0) {
    const baseCommand = command.split(' ')[0];
    if (!allowedCommands.includes(baseCommand)) {
      return {
        stdout: '',
        stderr: `命令被阻止：${baseCommand} 不在允许列表中`,
        exitCode: 1,
        success: false,
      };
    }
  }

  // 检查阻止列表
  if (blockedCommands) {
    for (const blocked of blockedCommands) {
      if (command.toLowerCase().includes(blocked.toLowerCase())) {
        return {
          stdout: '',
          stderr: `命令被阻止：${blocked} 被禁止`,
          exitCode: 1,
          success: false,
        };
      }
    }
  }

  try {
    logger.info(`[Shell工具] 执行命令: ${command.substring(0, 100)}...`);

    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      windowsHide: true,
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      success: true,
    };
  } catch (error: any) {
    logger.error(`[Shell工具] 命令执行失败: ${error.message}`);

    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      exitCode: error.code || 1,
      success: false,
    };
  }
}

/**
 * 格式化命令执行结果
 */
export function formatShellResult(result: ShellResult, command: string): string {
  let output = `💻 **命令**: \`${command}\`\n\n`;

  if (result.success) {
    output += `✅ **执行成功**\n\n`;

    if (result.stdout) {
      output += `**输出**:\n\`\`\`\n${result.stdout}\n\`\`\`\n\n`;
    }

    if (result.stderr) {
      output += `**错误输出**:\n\`\`\`\n${result.stderr}\n\`\`\`\n\n`;
    }
  } else {
    output += `❌ **执行失败**\n\n`;
    output += `**错误**: ${result.stderr}\n\n`;
  }

  return output;
}

/**
 * 检测内容中的命令
 */
export function detectCommand(content: string): string | null {
  // 检测常见的命令模式
  const patterns = [
    /`([^`]+)`/,  // 反引号包裹
    /```(\w+)?\n([\s\S]+?)\n```/,  // 代码块
    /^\s*(npm|yarn|pnpm|git|ls|dir|cd|mkdir|rm|cp|mv|cat|grep|find|curl|wget|ping|python|node|bash|sh)\s+/m,  // 常见命令开头
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      // 对于代码块，提取第二组
      const command = pattern.toString().includes('second') ? match[2]?.trim() : match[1]?.trim();
      if (command) {
        return command;
      }
    }
  }

  return null;
}
