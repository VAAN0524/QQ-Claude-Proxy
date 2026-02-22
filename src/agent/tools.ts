/**
 * Agent Tools - 工具定义和执行
 * 提供文件操作和命令执行功能
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ToolResult {
  success: boolean;
  content: string;
  isError?: boolean;
}

export interface SendFilePayload {
  filePath: string;
  fileName?: string;
}

// 工具结果回调类型
export type SendFileCallback = (payload: SendFilePayload) => Promise<void>;

/**
 * 工具定义列表
 */
export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: 'execute_command',
    description: '在终端执行命令。可以运行 shell 命令、脚本等。注意：此操作可能会修改系统，请谨慎使用。',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的命令'
        },
        cwd: {
          type: 'string',
          description: '执行命令的工作目录（可选）'
        },
        timeout: {
          type: 'number',
          description: '命令超时时间（毫秒），默认 30000'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: '读取文件内容。支持文本文件、图片文件等。图片会以 base64 编码返回。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '文件的绝对路径'
        },
        encoding: {
          type: 'string',
          description: '文件编码，默认 utf-8',
          enum: ['utf-8', 'base64', 'binary']
        }
      },
      required: ['file_path']
    }
  },
  {
    name: 'write_file',
    description: '写入文件内容。如果文件不存在会创建，如果存在会覆盖。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '文件的绝对路径'
        },
        content: {
          type: 'string',
          description: '要写入的内容'
        },
        encoding: {
          type: 'string',
          description: '文件编码，默认 utf-8',
          enum: ['utf-8', 'base64']
        },
        append: {
          type: 'boolean',
          description: '是否追加模式，默认 false（覆盖）'
        }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: '列出目录内容。返回目录中所有文件和子目录的列表。',
    input_schema: {
      type: 'object',
      properties: {
        directory_path: {
          type: 'string',
          description: '目录的绝对路径'
        },
        recursive: {
          type: 'boolean',
          description: '是否递归列出子目录，默认 false'
        }
      },
      required: ['directory_path']
    }
  },
  {
    name: 'send_file',
    description: '发送文件到 QQ 频道。用于将本地文件发送给用户。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '要发送的文件路径'
        },
        description: {
          type: 'string',
          description: '文件的描述信息（可选）'
        }
      },
      required: ['file_path']
    }
  }
];

/**
 * 工具执行器类
 */
export class ToolExecutor {
  private sendFileCallback: SendFileCallback | null = null;
  private allowedDirectories: string[];
  private blockedCommands: string[];

  constructor(options: {
    allowedDirectories?: string[];
    blockedCommands?: string[];
    sendFileCallback?: SendFileCallback;
  } = {}) {
    this.allowedDirectories = options.allowedDirectories || [];
    this.blockedCommands = options.blockedCommands || [
      'rm -rf /',
      'mkfs',
      'dd if=',
      'format c:',
      'del /s /q',
      '> /dev/sda'
    ];
    this.sendFileCallback = options.sendFileCallback || null;
  }

  /**
   * 设置发送文件回调
   */
  setSendFileCallback(callback: SendFileCallback): void {
    this.sendFileCallback = callback;
  }

  /**
   * 检查路径是否在允许的目录中
   */
  private isPathAllowed(targetPath: string): boolean {
    if (this.allowedDirectories.length === 0) {
      return true; // 没有限制则允许所有
    }

    const resolvedPath = path.resolve(targetPath);
    return this.allowedDirectories.some(allowedDir =>
      resolvedPath.startsWith(path.resolve(allowedDir))
    );
  }

  /**
   * 检查命令是否被阻止
   */
  private isCommandBlocked(command: string): boolean {
    const lowerCommand = command.toLowerCase();
    return this.blockedCommands.some(blocked =>
      lowerCommand.includes(blocked.toLowerCase())
    );
  }

  /**
   * 执行工具调用
   */
  async executeTool(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'execute_command':
          return await this.executeCommand(toolInput);

        case 'read_file':
          return await this.readFile(toolInput);

        case 'write_file':
          return await this.writeFile(toolInput);

        case 'list_directory':
          return await this.listDirectory(toolInput);

        case 'send_file':
          return await this.sendFile(toolInput);

        default:
          return {
            success: false,
            isError: true,
            content: `Unknown tool: ${toolName}`
          };
      }
    } catch (error) {
      return {
        success: false,
        isError: true,
        content: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * 执行终端命令
   */
  private async executeCommand(input: Record<string, unknown>): Promise<ToolResult> {
    const command = input.command as string;
    const cwd = input.cwd as string | undefined;
    const timeout = (input.timeout as number) || 30000;

    // 检查命令是否被阻止
    if (this.isCommandBlocked(command)) {
      return {
        success: false,
        isError: true,
        content: `Command blocked for security reasons: ${command}`
      };
    }

    // 检查工作目录是否允许
    if (cwd && !this.isPathAllowed(cwd)) {
      return {
        success: false,
        isError: true,
        content: `Directory not allowed: ${cwd}`
      };
    }

    try {
      const options: { cwd?: string; timeout: number; maxBuffer: number } = {
        timeout,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      };

      if (cwd) {
        options.cwd = cwd;
      }

      const { stdout, stderr } = await execAsync(command, options);

      let output = '';
      if (stdout) output += `STDOUT:\n${stdout}\n`;
      if (stderr) output += `STDERR:\n${stderr}`;

      return {
        success: true,
        content: output || 'Command executed successfully (no output)'
      };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; message?: string };
      let output = '';
      if (execError.stdout) output += `STDOUT:\n${execError.stdout}\n`;
      if (execError.stderr) output += `STDERR:\n${execError.stderr}\n`;
      if (execError.message) output += `ERROR:\n${execError.message}`;

      return {
        success: false,
        isError: true,
        content: output || 'Command execution failed'
      };
    }
  }

  /**
   * 读取文件
   */
  private async readFile(input: Record<string, unknown>): Promise<ToolResult> {
    const filePath = input.file_path as string;
    const encoding = (input.encoding as string) || 'utf-8';

    // 检查路径是否允许
    if (!this.isPathAllowed(filePath)) {
      return {
        success: false,
        isError: true,
        content: `Path not allowed: ${filePath}`
      };
    }

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        isError: true,
        content: `File not found: ${filePath}`
      };
    }

    try {
      // 检查是否是图片文件
      const ext = path.extname(filePath).toLowerCase();
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

      if (imageExtensions.includes(ext)) {
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        const mimeType = this.getMimeType(ext);
        return {
          success: true,
          content: `[Image file: ${path.basename(filePath)}]\nData: data:${mimeType};base64,${base64}`
        };
      }

      // 读取文本文件
      const content = fs.readFileSync(filePath, encoding as BufferEncoding);
      const stats = fs.statSync(filePath);

      return {
        success: true,
        content: `File: ${filePath}\nSize: ${stats.size} bytes\n\n${content}`
      };
    } catch (error) {
      return {
        success: false,
        isError: true,
        content: error instanceof Error ? error.message : 'Failed to read file'
      };
    }
  }

  /**
   * 写入文件
   */
  private async writeFile(input: Record<string, unknown>): Promise<ToolResult> {
    const filePath = input.file_path as string;
    const content = input.content as string;
    const encoding = (input.encoding as string) || 'utf-8';
    const append = input.append as boolean;

    // 检查路径是否允许
    if (!this.isPathAllowed(filePath)) {
      return {
        success: false,
        isError: true,
        content: `Path not allowed: ${filePath}`
      };
    }

    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入文件
      if (append) {
        fs.appendFileSync(filePath, content, encoding as BufferEncoding);
      } else {
        fs.writeFileSync(filePath, content, encoding as BufferEncoding);
      }

      const stats = fs.statSync(filePath);
      return {
        success: true,
        content: `File written successfully: ${filePath}\nSize: ${stats.size} bytes`
      };
    } catch (error) {
      return {
        success: false,
        isError: true,
        content: error instanceof Error ? error.message : 'Failed to write file'
      };
    }
  }

  /**
   * 列出目录
   */
  private async listDirectory(input: Record<string, unknown>): Promise<ToolResult> {
    const directoryPath = input.directory_path as string;
    const recursive = input.recursive as boolean;

    // 检查路径是否允许
    if (!this.isPathAllowed(directoryPath)) {
      return {
        success: false,
        isError: true,
        content: `Path not allowed: ${directoryPath}`
      };
    }

    // 检查目录是否存在
    if (!fs.existsSync(directoryPath)) {
      return {
        success: false,
        isError: true,
        content: `Directory not found: ${directoryPath}`
      };
    }

    try {
      const items = this.listDirRecursive(directoryPath, recursive ? 3 : 1, 0);
      return {
        success: true,
        content: `Directory: ${directoryPath}\n\n${items.join('\n')}`
      };
    } catch (error) {
      return {
        success: false,
        isError: true,
        content: error instanceof Error ? error.message : 'Failed to list directory'
      };
    }
  }

  /**
   * 递归列出目录
   */
  private listDirRecursive(dir: string, maxDepth: number, currentDepth: number): string[] {
    const result: string[] = [];
    const indent = '  '.repeat(currentDepth);

    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        const prefix = item.isDirectory() ? '[DIR]  ' : '[FILE] ';
        const suffix = item.isDirectory() ? '/' : '';
        result.push(`${indent}${prefix}${item.name}${suffix}`);

        // 递归处理子目录
        if (item.isDirectory() && currentDepth < maxDepth - 1) {
          const subDir = path.join(dir, item.name);
          const subItems = this.listDirRecursive(subDir, maxDepth, currentDepth + 1);
          result.push(...subItems);
        }
      }
    } catch (error) {
      result.push(`${indent}[ERROR] Cannot read directory`);
    }

    return result;
  }

  /**
   * 发送文件到 QQ
   */
  private async sendFile(input: Record<string, unknown>): Promise<ToolResult> {
    const filePath = input.file_path as string;
    const description = input.description as string | undefined;

    // 检查路径是否允许
    if (!this.isPathAllowed(filePath)) {
      return {
        success: false,
        isError: true,
        content: `Path not allowed: ${filePath}`
      };
    }

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        isError: true,
        content: `File not found: ${filePath}`
      };
    }

    // 检查是否有回调
    if (!this.sendFileCallback) {
      return {
        success: false,
        isError: true,
        content: 'Send file callback not configured'
      };
    }

    try {
      await this.sendFileCallback({
        filePath,
        fileName: path.basename(filePath)
      });

      // 返回空内容，避免在 Claude 响应中出现重复消息
      return {
        success: true,
        content: ''
      };
    } catch (error) {
      return {
        success: false,
        isError: true,
        content: error instanceof Error ? error.message : 'Failed to send file'
      };
    }
  }

  /**
   * 获取 MIME 类型
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

/**
 * 创建工具执行器实例
 */
export function createToolExecutor(options?: {
  allowedDirectories?: string[];
  blockedCommands?: string[];
  sendFileCallback?: SendFileCallback;
}): ToolExecutor {
  return new ToolExecutor(options);
}

export default {
  toolDefinitions,
  ToolExecutor,
  createToolExecutor
};
