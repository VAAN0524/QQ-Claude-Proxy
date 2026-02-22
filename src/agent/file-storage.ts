/**
 * 文件存储管理器
 * 处理用户发送的文件（图片、文档等）的存储和管理
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';

export interface StoredFile {
  id: string;
  originalName: string;
  storedPath: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

export class FileStorage {
  private basePath: string;
  private files: Map<string, StoredFile> = new Map();

  constructor(basePath: string = './workspace') {
    this.basePath = path.resolve(basePath);
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
      logger.info(`创建存储目录: ${this.basePath}`);
    }

    // 创建子目录
    const subdirs = ['images', 'documents', 'downloads'];
    for (const subdir of subdirs) {
      const dir = path.join(this.basePath, subdir);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * 生成文件 ID
   */
  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * 根据 MIME 类型获取存储子目录
   */
  private getSubdir(mimeType: string): string {
    if (mimeType.startsWith('image/')) {
      return 'images';
    }
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) {
      return 'documents';
    }
    return 'downloads';
  }

  /**
   * 存储文件
   */
  async storeFile(
    data: Buffer | string,
    originalName: string,
    mimeType: string = 'application/octet-stream'
  ): Promise<StoredFile> {
    const id = this.generateId();
    const subdir = this.getSubdir(mimeType);
    const ext = path.extname(originalName) || this.getExtensionFromMime(mimeType);
    const fileName = `${id}${ext}`;
    const storedPath = path.join(this.basePath, subdir, fileName);

    // 写入文件
    const buffer = typeof data === 'string' ? Buffer.from(data, 'base64') : data;
    fs.writeFileSync(storedPath, buffer);

    const storedFile: StoredFile = {
      id,
      originalName,
      storedPath,
      mimeType,
      size: buffer.length,
      createdAt: new Date(),
    };

    this.files.set(id, storedFile);
    logger.info(`文件已存储: ${originalName} -> ${storedPath}`);

    return storedFile;
  }

  /**
   * 从 URL 下载并存储文件
   */
  async storeFromUrl(url: string, originalName?: string): Promise<StoredFile> {
    logger.info(`下载文件: ${url}`);

    // 设置 30 秒超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`下载失败: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // 检查文件大小（限制 50MB）
      if (buffer.length > 50 * 1024 * 1024) {
        throw new Error('文件过大，超过 50MB 限制');
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const name = originalName || this.getFileNameFromUrl(url) || `file_${Date.now()}`;

      return this.storeFile(buffer, name, contentType);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('下载超时（30秒）');
      }
      throw error;
    }
  }

  /**
   * 获取文件
   */
  getFile(id: string): StoredFile | undefined {
    return this.files.get(id);
  }

  /**
   * 读取文件内容
   */
  readFile(id: string): Buffer | null {
    const file = this.files.get(id);
    if (!file) {
      return null;
    }
    return fs.readFileSync(file.storedPath);
  }

  /**
   * 获取文件路径
   */
  getFilePath(id: string): string | null {
    const file = this.files.get(id);
    return file ? file.storedPath : null;
  }

  /**
   * 删除文件
   */
  deleteFile(id: string): boolean {
    const file = this.files.get(id);
    if (!file) {
      return false;
    }

    try {
      fs.unlinkSync(file.storedPath);
      this.files.delete(id);
      logger.info(`文件已删除: ${file.originalName}`);
      return true;
    } catch (error) {
      logger.error(`删除文件失败: ${id}`);
      return false;
    }
  }

  /**
   * 列出所有存储的文件
   */
  listFiles(): StoredFile[] {
    return Array.from(this.files.values());
  }

  /**
   * 获取工作区路径
   */
  getWorkspacePath(): string {
    return this.basePath;
  }

  /**
   * 列出工作区所有文件
   */
  listWorkspaceFiles(): string[] {
    const files: string[] = [];

    const scanDir = (dir: string, base: string) => {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          // 跳过隐藏目录和 node_modules
          if (item.startsWith('.') || item === 'node_modules') continue;

          const fullPath = path.join(dir, item);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              scanDir(fullPath, base);
            } else {
              files.push(path.relative(base, fullPath));
            }
          } catch {
            // 忽略无法访问的文件
          }
        }
      } catch (error) {
        logger.error(`扫描目录失败: ${dir} - ${error}`);
      }
    };

    try {
      scanDir(this.basePath, this.basePath);
    } catch (error) {
      logger.error(`列出工作区文件失败: ${error}`);
    }

    return files;
  }

  /**
   * 从 MIME 类型获取扩展名
   */
  private getExtensionFromMime(mimeType: string): string {
    const mimeMap: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'application/json': '.json',
    };
    return mimeMap[mimeType] || '';
  }

  /**
   * 从 URL 获取文件名
   */
  private getFileNameFromUrl(url: string): string | null {
    try {
      const urlPath = new URL(url).pathname;
      const fileName = path.basename(urlPath);
      return fileName || null;
    } catch {
      return null;
    }
  }
}

export default FileStorage;
