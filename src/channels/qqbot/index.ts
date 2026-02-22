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

  constructor(config: QQBotConfig) {
    super();
    this.config = config;
    this.api = new QQBotAPI(config);
    this.gateway = new QQGateway(config);
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
    const channelMessage: ChannelMessage = {
      channel: 'qqbot',
      userId: message.author.id,
      content: this.cleanContent(message.content),
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

      // 根据文件扩展名确定文件类型
      // 1: 图片, 2: 视频, 3: 语音, 4: 文件
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
      const videoExts = ['mp4', 'mov', 'avi', 'mkv'];
      const audioExts = ['mp3', 'wav', 'ogg', 'flac'];
      let fileType: 1 | 2 | 3 | 4 = 4;  // 默认为文件
      if (imageExts.includes(ext.toLowerCase())) {
        fileType = 1;
      } else if (videoExts.includes(ext.toLowerCase())) {
        fileType = 2;
      } else if (audioExts.includes(ext.toLowerCase())) {
        fileType = 3;
      }

      logger.info(`[QQChannel.sendFile] File type: ${fileType} (1=image, 2=video, 3=audio, 4=file), ext: ${ext}`);

      // 获取原始文件名（不含路径）
      const originalFileName = path.basename(filePath);

      // 上传文件到QQ服务器 (使用正确的端点 /v2/users/{openid}/files 或 /v2/groups/{group_openid}/files)
      // 使用 srv_send_msg=0 仅上传文件，然后单独发送富媒体消息
      logger.info(`[QQChannel.sendFile] Uploading file to QQ servers (srv_send_msg=0, upload only)...`);
      const uploadResult = isGroup
        ? await this.api.uploadGroupFile(userId, buffer, fileType, ext, false, originalFileName)
        : await this.api.uploadC2CFile(userId, buffer, fileType, ext, false, originalFileName);
      logger.info(`[QQChannel.sendFile] Upload successful: ${JSON.stringify(uploadResult).substring(0, 200)}`);

      // 发送富媒体消息（实际发送文件）
      logger.info(`[QQChannel.sendFile] Sending media message with file_info...`);
      // 根据文件类型确定 attachment type
      let attachmentType: 'image' | 'video' | 'audio' | 'file';
      if (fileType === 1) {
        attachmentType = 'image';
      } else if (fileType === 2) {
        attachmentType = 'video';
      } else if (fileType === 3) {
        attachmentType = 'audio';
      } else {
        attachmentType = 'file';
      }

      if (isGroup) {
        await this.api.sendGroupMediaMessage(userId, [{
          type: attachmentType,
          content: uploadResult.file_info,
        }]);
      } else {
        await this.api.sendC2CMediaMessage(userId, [{
          type: attachmentType,
          content: uploadResult.file_info,
        }]);
      }
      logger.info(`[QQChannel.sendFile] Media message sent successfully`);

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
