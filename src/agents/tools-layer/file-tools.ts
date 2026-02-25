/**
 * 文件工具 - 读取、写入、编辑文件
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger.js';

/**
 * 读取文件内容
 */
export async function readFile(filePath: string, options: {
  encoding?: BufferEncoding;
  maxLength?: number;
} = {}): Promise<{
  success: boolean;
  content?: string;
  path?: string;
  size?: number;
  error?: string;
}> {
  try {
    const encoding = options.encoding || 'utf-8';
    const fullPath = path.resolve(filePath);

    logger.info(`[文件工具] 读取文件: ${fullPath}`);

    const content = await fs.readFile(fullPath, encoding);
    const size = Buffer.byteLength(content, encoding);

    let resultContent = content;
    if (options.maxLength && content.length > options.maxLength) {
      resultContent = content.substring(0, options.maxLength) + `\n\n... (文件已截断，共 ${size} 字节)`;
    }

    return {
      success: true,
      content: resultContent,
      path: fullPath,
      size,
    };
  } catch (error) {
    logger.error(`[文件工具] 读取失败: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 写入文件
 */
export async function writeFile(filePath: string, content: string, options: {
  encoding?: BufferEncoding;
  createDir?: boolean;
} = {}): Promise<{
  success: boolean;
  path?: string;
  bytesWritten?: number;
  error?: string;
}> {
  try {
    const encoding = options.encoding || 'utf-8';
    const fullPath = path.resolve(filePath);

    logger.info(`[文件工具] 写入文件: ${fullPath}`);

    // 如果需要，创建目录
    if (options.createDir) {
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(fullPath, content, encoding);

    return {
      success: true,
      path: fullPath,
      bytesWritten: Buffer.byteLength(content, encoding),
    };
  } catch (error) {
    logger.error(`[文件工具] 写入失败: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 编辑文件 - 精确替换
 */
export async function editFile(filePath: string, edits: Array<{
  oldText: string;
  newText: string;
}>, options = {}): Promise<{
  success: boolean;
  editsApplied?: number;
  error?: string;
}> {
  try {
    const fullPath = path.resolve(filePath);

    logger.info(`[文件工具] 编辑文件: ${fullPath} (${edits.length} 处修改)`);

    let content = await fs.readFile(fullPath, 'utf-8');
    let editsApplied = 0;

    for (const edit of edits) {
      if (content.includes(edit.oldText)) {
        content = content.replace(edit.oldText, edit.newText);
        editsApplied++;
      } else {
        logger.warn(`[文件工具] 未找到要替换的文本: ${edit.oldText.substring(0, 50)}...`);
      }
    }

    if (editsApplied > 0) {
      await fs.writeFile(fullPath, content, 'utf-8');
    }

    return {
      success: true,
      editsApplied,
    };
  } catch (error) {
    logger.error(`[文件工具] 编辑失败: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 格式化文件操作结果
 */
export function formatFileResult(result: {
  success: boolean;
  content?: string;
  path?: string;
  size?: number;
  bytesWritten?: number;
  editsApplied?: number;
  error?: string;
}, operation: 'read' | 'write' | 'edit'): string {
  const operationNames: Record<typeof operation, string> = {
    read: '读取文件',
    write: '写入文件',
    edit: '编辑文件',
  };

  let output = `[${operationNames[operation]}]...\n\n`;

  if (result.success) {
    output += `成功\n\n`;

    if (result.path) {
      output += `路径: ${result.path}\n\n`;
    }

    if (result.content) {
      output += `内容:\n${result.content.substring(0, 1000)}${result.content.length > 1000 ? '\n... (已截断)' : ''}\n\n`;
    }

    if (result.size) {
      output += `大小: ${result.size} 字节\n\n`;
    }

    if (result.bytesWritten) {
      output += `写入: ${result.bytesWritten} 字节\n\n`;
    }

    if (result.editsApplied !== undefined) {
      output += `修改数: ${result.editsApplied}\n\n`;
    }
  } else {
    output += `失败\n\n`;
    output += `错误: ${result.error}\n\n`;
  }

  return output;
}
