/**
 * 文件操作工具定义
 *
 * 使用简化的工具定义 API
 */

import { tool, Tool } from '../../llm/tool.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * 文件工具上下文
 */
export interface FileToolContext {
  workspacePath: string;
  storagePath: string;
}

/**
 * 读取文件工具
 */
export const readFileTool = (context: FileToolContext): Tool => tool({
  name: 'read_file',
  description: '读取文件内容：支持文本文件和图片文件（图片以 base64 格式返回）',
  parameters: z.object({
    filePath: z.string().describe('文件的绝对路径或相对于工作区的路径'),
  }),
  execute: async ({ filePath }) => {
    let resolvedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      resolvedPath = path.resolve(context.workspacePath, filePath);
    }

    try {
      const content = await fs.readFile(resolvedPath, 'utf-8');
      return content;
    } catch (error: any) {
      return `错误：无法读取文件 - ${error.message}`;
    }
  },
});

/**
 * 写入文件工具
 */
export const writeFileTool = (context: FileToolContext): Tool => tool({
  name: 'write_file',
  description: '写入文件内容。如果文件不存在会创建，如果存在会覆盖',
  parameters: z.object({
    filePath: z.string().describe('文件的绝对路径或相对于工作区的路径'),
    content: z.string().describe('要写入的内容'),
    append: z.boolean().optional().describe('是否追加模式，默认 false（覆盖）'),
  }),
  execute: async ({ filePath, content, append }) => {
    let resolvedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      resolvedPath = path.resolve(context.workspacePath, filePath);
    }

    try {
      await fs.writeFile(resolvedPath, content, { flag: append ? 'a' : 'w' });
      return `文件已成功写入：${resolvedPath}`;
    } catch (error: any) {
      return `错误：无法写入文件 - ${error.message}`;
    }
  },
});

/**
 * 列出目录工具
 */
export const listDirectoryTool = (context: FileToolContext): Tool => tool({
  name: 'list_directory',
  description: '列出目录内容。返回目录中所有文件和子目录的列表',
  parameters: z.object({
    directoryPath: z.string().describe('目录的绝对路径或相对于工作区的路径'),
    recursive: z.boolean().optional().describe('是否递归列出子目录，默认 false'),
  }),
  execute: async ({ directoryPath, recursive }) => {
    let resolvedPath = directoryPath;
    if (!path.isAbsolute(directoryPath)) {
      resolvedPath = path.resolve(context.workspacePath, directoryPath);
    }

    try {
      if (recursive) {
        const items: string[] = [];
        async function walkDir(dir: string, base = '') {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.join(base, entry.name);
            items.push(relativePath + (entry.isDirectory() ? '/' : ''));
            if (entry.isDirectory()) {
              await walkDir(fullPath, relativePath);
            }
          }
        }
        await walkDir(resolvedPath);
        return items.join('\n');
      } else {
        const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
        const items = entries.map(entry => entry.name + (entry.isDirectory() ? '/' : ''));
        return items.join('\n');
      }
    } catch (error: any) {
      return `错误：无法列出目录 - ${error.message}`;
    }
  },
});

/**
 * 发送文件工具
 */
export const sendFileTool = (context: FileToolContext & { pendingFiles: string[] }): Tool => tool({
  name: 'send_file',
  description: '发送文件给用户：将工作区或存储区的文件发送到用户QQ',
  parameters: z.object({
    filePath: z.string().describe('要发送的文件路径，相对于工作区的路径'),
  }),
  execute: async ({ filePath }) => {
    let resolvedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      resolvedPath = path.resolve(context.workspacePath, filePath);
    }

    try {
      await fs.access(resolvedPath);
      context.pendingFiles.push(resolvedPath);
      return `文件已加入发送队列：${filePath}`;
    } catch (error: any) {
      return `错误：文件不存在 - ${error.message}`;
    }
  },
});

/**
 * 获取所有文件工具
 */
export function getAllFileTools(context: FileToolContext & { pendingFiles: string[] }): Tool[] {
  return [
    readFileTool(context),
    writeFileTool(context),
    listDirectoryTool(context),
    sendFileTool(context),
  ];
}
