/**
 * QQ Bot Channel - Main Entry
 * QQ Bot 渠道适配器主入口
 */

import { EventEmitter } from 'events';
import type { QQBotConfig, QQMessage } from './types.js';
import { isQQMessage } from './types.js';
import { QQBotAPI } from './api.js';
import { QQGateway } from './gateway.js';
import { logger } from '../../utils/logger.js';
import { KnowledgeCommands } from '../../agent/knowledge-service/global-commands.js';
import { getGlobalDeduplicator } from '../../utils/message-deduplicator.js';

export interface QQBotChannelOptions {
  config: QQBotConfig;
}

export interface ChannelMessage {
  channel: 'qqbot';
  userId: string;
  groupId?: string;
  content: string;
  attachments?: Array<{
    type: string;
    url: string;
    filename: string;
  }>;
  timestamp: Date;
  raw?: QQMessage;
}

export interface ChannelResponse {
  userId?: string;
  groupId?: string;
  msgId?: string;
  content: string;
  attachments?: Array<{
    type: string;
    content: string;
  }>;
}

export class QQBotChannel extends EventEmitter {
  private config: QQBotConfig;
  private api: QQBotAPI;
  private gateway: QQGateway;
  private mainGateway: any = null;
  private knowledgeCommands?: KnowledgeCommands;

  constructor(config: QQBotConfig) {
    super();
    this.config = config;
    this.api = new QQBotAPI(config);
    this.gateway = new QQGateway(config);
  }

  async initializeKnowledgeService(): Promise<void> {
    this.knowledgeCommands = new KnowledgeCommands();
    await this.knowledgeCommands.initialize();
    logger.info('[QQBot] 知识库服务已初始化（使用全局skill）');
  }

  async start(): Promise<void> {
    if (!this.config.appId || !this.config.appSecret) {
      logger.warn('QQ Bot credentials not configured, channel disabled');
      return;
    }

    // Setup gateway event handlers
    this.gateway.on('message', (message: QQMessage) => {
      this.handleC2CMessage(message);
    });

    this.gateway.on('groupMessage', (message: QQMessage) => {
      this.handleGroupMessage(message);
    });

    this.gateway.on('error', (error: Error) => {
      logger.error(`QQ Gateway error: ${error}`);
      this.emit('error', error);
    });

    this.gateway.on('reconnect', () => {
      logger.info('QQ Gateway reconnecting...');
    });

    // Connect to QQ Gateway
    await this.gateway.connect();
    logger.info('QQ Bot channel started');
  }

  private handleC2CMessage(message: QQMessage): void {
    const content = this.cleanContent(message.content);

    // 处理知识库命令
    if (content.startsWith('/kb ') && this.knowledgeCommands) {
      this.handleKnowledgeCommand(message.author.id, undefined, content);
      return;
    }

    const channelMessage: ChannelMessage = {
      channel: 'qqbot',
      userId: message.author.id,
      content,
      attachments: message.attachments?.map(att => ({
        type: att.type,
        url: att.url || '',
        filename: att.file || 'unknown',
      })),
      timestamp: new Date(message.timestamp),
      raw: message,
    };

    logger.info(`[C2C] ${message.author.id}: ${channelMessage.content}`);
    this.emit('message', channelMessage);

    // Forward to main gateway if registered
    if (this.mainGateway) {
      this.forwardToGateway(channelMessage);
    }
  }

  private handleGroupMessage(message: QQMessage): void {
    // Remove @ mention from content
    const content = this.cleanContent(message.content);

    // 处理知识库命令
    if (content.startsWith('/kb ') && this.knowledgeCommands) {
      this.handleKnowledgeCommand(message.author.id, message.group_id, content);
      return;
    }

    const channelMessage: ChannelMessage = {
      channel: 'qqbot',
      userId: message.author.id,
      groupId: message.group_id,
      content,
      attachments: message.attachments?.map(att => ({
        type: att.type,
        url: att.url || '',
        filename: att.file || 'unknown',
      })),
      timestamp: new Date(message.timestamp),
      raw: message,
    };

    logger.info(`[Group:${message.group_id}] ${message.author.id}: ${content}`);
    this.emit('groupMessage', channelMessage);

    // Forward to main gateway if registered
    if (this.mainGateway) {
      this.forwardToGateway(channelMessage);
    }
  }

  private cleanContent(content: string): string {
    // Remove @ mentions like <@!123456>
    return content.replace(/<@!\d+>/g, '').trim();
  }

  private forwardToGateway(message: ChannelMessage): void {
    if (this.mainGateway && typeof this.mainGateway.handleChannelEvent === 'function') {
      this.mainGateway.handleChannelEvent({
        type: 'event',
        channel: 'qqbot',
        event: message.groupId ? 'group_message' : 'message',
        data: message,
      });
    }
  }

  setGateway(gateway: any): void {
    this.mainGateway = gateway;
  }

  async send(response: ChannelResponse): Promise<void> {
    try {
      logger.info(`[QQChannel.send] 开始发送: groupId=${response.groupId}, userId=${response.userId}, content.length=${response.content.length}`);

      // QQ 消息长度限制约 2000 字符，使用 1900 作为安全值
      const MAX_LENGTH = 1900;
      const content = response.content;

      if (content.length <= MAX_LENGTH) {
        // 短消息，直接发送
        await this.sendMessage(response.groupId, response.userId, content, response.msgId);
      } else {
        // 长消息，分段发送
        const chunks = this.splitMessage(content, MAX_LENGTH);
        logger.info(`[QQChannel.send] 消息过长，将分 ${chunks.length} 段发送`);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const isFirst = i === 0;
          const isLast = i === chunks.length - 1;

          // 第一条消息使用 msgId 回复，后续消息不使用
          const msgId = isFirst ? response.msgId : undefined;

          await this.sendMessage(response.groupId, response.userId, chunk, msgId);

          // 添加延迟，避免发送过快被限制
          if (!isLast) {
            await this.delay(500);
          }
        }

        logger.info(`[QQChannel.send] 分段消息全部发送完成 (${chunks.length} 段)`);
      }
    } catch (error) {
      logger.error(`[QQChannel.send] 发送失败: ${error}`);
      throw error;
    }
  }

  /**
   * 发送单条消息
   */
  private async sendMessage(
    groupId: string | undefined,
    userId: string | undefined,
    content: string,
    msgId?: string
  ): Promise<void> {
    // 去重检查：防止重复消息
    const deduplicator = getGlobalDeduplicator();
    const targetUserId = userId || groupId || 'unknown';

    if (deduplicator.isDuplicate(targetUserId, content, groupId)) {
      logger.warn(`[QQChannel] 阻止重复消息: userId=${targetUserId}, groupId=${groupId || 'none'}`);
      return;
    }

    if (groupId) {
      // 群消息
      await this.api.sendGroupMessage(groupId, content, msgId);
    } else if (userId) {
      // 私聊消息
      await this.api.sendC2CMessage(userId, content, msgId);
    }
  }

  /**
   * 智能分割消息，尽量在合适的位置断开
   */
  private splitMessage(content: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > maxLength) {
      // 取最大长度前的文本
      let chunk = remaining.substring(0, maxLength);

      // 尝试在合适的位置断开：换行、句号、分号等
      const breakPoints = ['\n\n', '\n', '。', '；', ';', '！', '!', '？', '?', '，', ',', ' '];

      for (const breakPoint of breakPoints) {
        const lastIndex = chunk.lastIndexOf(breakPoint);
        if (lastIndex > maxLength * 0.7) {
          // 在 70% 以后找到断点，使用它
          chunk = chunk.substring(0, lastIndex + breakPoint.length);
          break;
        }
      }

      chunks.push(chunk);
      remaining = remaining.substring(chunk.length);
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
  }

  /**
   * 延迟指定毫秒数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 处理知识库命令（Phase 2: 支持自然语言）
   */
  private async handleKnowledgeCommand(userId: string, groupId: string | undefined, content: string): Promise<void> {
    try {
      // 解析命令
      const parts = content.substring(4).trim().split(/\s+/);
      const command = parts.shift() || '';
      const args = parts;

      logger.info(`[KnowledgeCommand] command=${command}, args=${args.join(', ')}`);

      // Phase 2: 特殊命令直接用自然语言处理
      if (command === 'chat' || command === 'ask' || command === '帮我') {
        const userInput = args.join(' ');
        const response = await this.knowledgeCommands!.handleCommand('chat', [userInput]);
        await this.sendMessage(groupId, userId, response, undefined);
        return;
      }

      // 执行命令
      const response = await this.knowledgeCommands!.handleCommand(command, args);

      // 发送响应（使用原有的 sendMessage 方法，msgId 设为 undefined）
      await this.sendMessage(groupId, userId, response, undefined);
    } catch (error) {
      logger.error(`[KnowledgeCommand] 处理失败: ${error}`);
      const errorMsg = `❌ 命令执行失败: ${error}`;
      await this.sendMessage(groupId, userId, errorMsg, undefined);
    }
  }

  async sendFile(userId: string, filePath: string, isGroup: boolean = false, message?: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    try {
      logger.info(`[QQChannel.sendFile] Starting file send: filePath=${filePath}, userId=${userId}, isGroup=${isGroup}`);

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      const fileSizeKB = Math.round(stats.size / 1024);
      logger.info(`[QQChannel.sendFile] File size: ${fileSizeKB} KB`);

      const buffer = fs.readFileSync(filePath);
      const ext = filePath.split('.').pop() || 'bin';

      // 根据文件扩展名确定文件类型和大小限制
      // 1: 图片, 2: 视频, 3: 语音, 4: 文件
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
      const videoExts = ['mp4', 'mov', 'avi', 'mkv'];
      const audioExts = ['mp3', 'wav', 'ogg', 'flac'];

      // 文件大小限制 (单位: 字节)
      const sizeLimits = {
        image: 20 * 1024 * 1024,   // 20MB
        video: 100 * 1024 * 1024,  // 100MB
        audio: 2 * 1024 * 1024,    // 2MB
        file: 100 * 1024 * 1024,   // 100MB
      };

      let fileType: 1 | 2 | 3 | 4 = 4;  // 默认为文件
      let sizeLimit = sizeLimits.file;

      if (imageExts.includes(ext.toLowerCase())) {
        fileType = 1;
        sizeLimit = sizeLimits.image;
      } else if (videoExts.includes(ext.toLowerCase())) {
        fileType = 2;
        sizeLimit = sizeLimits.video;
      } else if (audioExts.includes(ext.toLowerCase())) {
        fileType = 3;
        sizeLimit = sizeLimits.audio;
      } else {
        fileType = 4;
        sizeLimit = sizeLimits.file;
      }

      // 检查文件大小是否超过限制
      if (stats.size > sizeLimit) {
        const sizeLimitMB = Math.round(sizeLimit / (1024 * 1024));
        throw new Error(`文件过大 (${fileSizeKB} KB)，超过 QQ 限制 (${sizeLimitMB} MB)`);
      }

      logger.info(`[QQChannel.sendFile] File type: ${fileType} (1=image, 2=video, 3=audio, 4=file), ext: ${ext}`);

      // 获取原始文件名（不含路径）
      const originalFileName = path.basename(filePath);

      // ========== 根据 QQ Bot 官方文档，不同类型使用不同方式 ==========
      // 图片/视频：先上传获取 file_info，再用富媒体消息发送
      // 普通文件：直接使用 srv_send_msg=1 发送
      if (fileType === 1 || fileType === 2) {
        // ===== 图片或视频：使用富媒体消息方式 =====
        logger.info(`[QQChannel.sendFile] 图片/视频使用富媒体消息方式发送`);

        // 步骤 1: 上传文件（srv_send_msg=0），获取 file_info
        logger.info(`[QQChannel.sendFile] 步骤 1: 上传文件获取 file_info...`);
        const uploadResult = isGroup
          ? await this.api.uploadGroupFile(userId, buffer, fileType, ext, false, originalFileName)
          : await this.api.uploadC2CFile(userId, buffer, fileType, ext, false, originalFileName);

        logger.info(`[QQChannel.sendFile] 上传成功，file_info: ${JSON.stringify(uploadResult).substring(0, 200)}`);

        // 步骤 2: 使用富媒体消息发送
        const fileInfo = uploadResult.file_info || '';
        if (!fileInfo) {
          throw new Error('上传成功但未返回 file_info');
        }

        logger.info(`[QQChannel.sendFile] 步骤 2: 发送富媒体消息...`);
        const attachment: import('./types.js').MessageAttachment = {
          type: fileType === 1 ? ('image' as const) : ('video' as const),
          file: fileInfo,
        };

        if (isGroup) {
          await this.api.sendGroupMediaMessage(userId, [attachment]);
        } else {
          await this.api.sendC2CMediaMessage(userId, [attachment]);
        }

        logger.info(`[QQChannel.sendFile] 富媒体消息发送成功`);

      } else {
        // ===== 普通文件：使用 srv_send_msg=1 直接发送 =====
        logger.info(`[QQChannel.sendFile] 普通文件使用直接发送方式 (srv_send_msg=1)`);
        const uploadResult = isGroup
          ? await this.api.uploadGroupFile(userId, buffer, fileType, ext, true, originalFileName)
          : await this.api.uploadC2CFile(userId, buffer, fileType, ext, true, originalFileName);
        logger.info(`[QQChannel.sendFile] 直接发送成功: ${JSON.stringify(uploadResult).substring(0, 200)}`);
      }

      // 发送附加文本消息
      if (message) {
        if (isGroup) {
          await this.api.sendGroupMessage(userId, message);
        } else {
          await this.api.sendC2CMessage(userId, message);
        }
      }

      logger.info(`[QQChannel.sendFile] File sent successfully to ${isGroup ? 'group' : 'user'} ${userId}: ${path.basename(filePath)}`);
    } catch (error) {
      logger.error(`[QQChannel.sendFile] File send failed: ${error}`);

      // 备用方案：如果是文本文件，发送文件内容
      const textFileExts = ['txt', 'md', 'json', 'xml', 'csv', 'log', 'yaml', 'yml'];
      const ext = filePath.split('.').pop()?.toLowerCase() || '';

      if (textFileExts.includes(ext) && fs.existsSync(filePath)) {
        logger.info(`[QQChannel.sendFile] 尝试备用方案：发送文本文件内容`);

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const maxSize = 3000; // QQ 消息长度限制

          if (content.length <= maxSize) {
            // 直接发送文件内容
            const message = `📄 ${path.basename(filePath)}:\n\n${content}`;

            if (isGroup) {
              await this.api.sendGroupMessage(userId, message);
            } else {
              await this.api.sendC2CMessage(userId, message);
            }

            logger.info(`[QQChannel.sendFile] 备用方案成功：已发送文件内容`);
            return;
          } else {
            // 文件太大，分段发送
            const chunks = content.match(/[\s\S]{1,2000}/g) || [];
            const totalChunks = chunks.length;

            for (let i = 0; i < chunks.length; i++) {
              const chunkMessage = `📄 ${path.basename(filePath)} (${i + 1}/${totalChunks}):\n\n${chunks[i]}`;

              if (isGroup) {
                await this.api.sendGroupMessage(userId, chunkMessage);
              } else {
                await this.api.sendC2CMessage(userId, chunkMessage);
              }

              // 添加延迟，避免频率限制
              if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }

            logger.info(`[QQChannel.sendFile] 备用方案成功：已分段发送文件内容 (${totalChunks} 段)`);
            return;
          }
        } catch (fallbackError) {
          logger.error(`[QQChannel.sendFile] 备用方案也失败: ${fallbackError}`);
        }
      }

      throw error;
    }
  }

  getAPI(): QQBotAPI {
    return this.api;
  }

  isConnected(): boolean {
    return this.gateway.isConnected();
  }

  async stop(): Promise<void> {
    this.gateway.close();
    logger.info('QQ Bot channel stopped');
  }
}

export type { QQBotConfig, QQMessage } from './types.js';
export { QQBotAPI, QQGateway };
export default QQBotChannel;
