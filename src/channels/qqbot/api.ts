/**
 * QQ Bot Channel - API Client
 * QQ 开放平台 HTTP API 封装
 */

import {
  QQBotConfig,
  AccessTokenResponse,
  SendMessageResponse,
  UploadFileResponse,
  QQAPIError,
  MessageAttachment,
} from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * QQ Bot API 客户端
 * 封装所有 HTTP API 调用
 */
export class QQBotAPI {
  private readonly config: QQBotConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  // msg_seq 追踪器 - 用于对同一条消息的多次回复
  private readonly msgSeqTracker = new Map<string, number>();
  private readonly seqBaseTime = Math.floor(Date.now() / 1000) % 100000000;

  /**
   * 获取并递增消息序号
   */
  private getNextMsgSeq(msgId: string): number {
    const current = this.msgSeqTracker.get(msgId) ?? 0;
    const next = current + 1;
    this.msgSeqTracker.set(msgId, next);
    // 清理过期的序号（简单策略：保留最近 1000 条）
    if (this.msgSeqTracker.size > 1000) {
      const keys = Array.from(this.msgSeqTracker.keys());
      for (let i = 0; i < 500; i++) {
        this.msgSeqTracker.delete(keys[i]);
      }
    }
    return this.seqBaseTime + next;
  }

  /** API 基础 URL */
  private get baseUrl(): string {
    return this.config.sandbox
      ? 'https://sandbox.api.sgroup.qq.com'
      : 'https://api.sgroup.qq.com';
  }

  constructor(config: QQBotConfig) {
    this.config = config;
  }

  /**
   * 获取 Access Token
   * 使用新的 bots.qq.com 认证方式
   */
  async getAccessToken(): Promise<string> {
    // 检查缓存的 token 是否有效
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    try {
      // 使用新的 bots.qq.com 端点获取 AccessToken
      const response = await fetch('https://bots.qq.com/app/getAppAccessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appId: this.config.appId,
          clientSecret: this.config.appSecret,
        }),
      });

      const data = await this.safeParseJson(response);

      if (!response.ok) {
        const error = data as QQAPIError;
        throw new Error(`获取 Access Token 失败: ${error.message || 'Unknown error'} (${error.code || 'N/A'})`);
      }

      const tokenData = data as AccessTokenResponse;
      this.accessToken = tokenData.access_token;
      // 提前 60 秒过期，但至少保留 30 秒有效期
      // expires_in 可能是字符串，需要转换为数字
      const expiresIn = Number(tokenData.expires_in);
      const expiresInSeconds = Math.max(30, expiresIn - 60);
      this.tokenExpiresAt = Date.now() + expiresInSeconds * 1000;

      logger.info(`[API] AccessToken 获取成功，有效期: ${expiresInSeconds} 秒`);
      return this.accessToken;
    } catch (error) {
      logger.error(`[API] 获取 AccessToken 异常: ${error}`);
      throw new Error(`获取 Access Token 异常: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 构建请求头
   */
  private async buildHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization: `QQBot ${token}`,
      'Content-Type': 'application/json',
      'X-Union-Appid': this.config.appId,
    };
  }

  /**
   * 安全解析 JSON 响应
   */
  private async safeParseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return { message: 'Failed to parse response', code: -1 };
    }
  }

  /**
   * 发送 API 请求
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = await this.buildHeaders();

    logger.info(`[API] ${method} ${url}`);
    if (body) {
      logger.debug(`[API] Body: ${JSON.stringify(body).substring(0, 200)}`);
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await this.safeParseJson(response);
    logger.info(`[API] Response status: ${response.status}, ok: ${response.ok}`);

    if (!response.ok) {
      const error = data as QQAPIError;
      logger.error(`[API] Error: ${JSON.stringify(error)}`);
      throw new Error(`API 请求失败 [${method} ${path}]: ${error.message || 'Unknown error'} (${error.code || 'N/A'})`);
    }

    return data as T;
  }

  // ==================== 消息发送 API ====================

  /**
   * 发送 C2C 私聊消息
   * @param openid 用户 OpenID
   * @param content 消息内容
   * @param msgId 消息 ID (用于回复)
   */
  async sendC2CMessage(
    openid: string,
    content: string,
    msgId?: string
  ): Promise<SendMessageResponse> {
    const path = `/v2/users/${openid}/messages`;
    const body: Record<string, unknown> = {
      content,
      msg_type: 0, // 文本消息
    };

    if (msgId) {
      body.msg_id = msgId;
    }

    return this.request<SendMessageResponse>('POST', path, body);
  }

  /**
   * 发送 C2C 私聊富媒体消息
   * @param openid 用户 OpenID
   * @param attachments 附件列表
   * @param msgId 消息 ID
   */
  async sendC2CMediaMessage(
    openid: string,
    attachments: MessageAttachment[],
    msgId?: string
  ): Promise<SendMessageResponse> {
    const path = `/v2/users/${openid}/messages`;
    const msgSeq = msgId ? this.getNextMsgSeq(msgId) : 1;

    // QQ Bot API 富媒体消息格式：media 是单个对象，不是数组
    const body: Record<string, unknown> = {
      msg_type: 7, // 富媒体消息
      msg_seq: msgSeq, // 消息序号，QQ Bot API 要求
      media: {
        file_info: attachments[0]?.content || attachments[0]?.file || '',
      },
    };

    if (msgId) {
      body.msg_id = msgId;
    }

    return this.request<SendMessageResponse>('POST', path, body);
  }

  /**
   * 发送群聊消息
   * @param groupOpenid 群 OpenID
   * @param content 消息内容
   * @param msgId 消息 ID (用于回复)
   */
  async sendGroupMessage(
    groupOpenid: string,
    content: string,
    msgId?: string
  ): Promise<SendMessageResponse> {
    const path = `/v2/groups/${groupOpenid}/messages`;
    const body: Record<string, unknown> = {
      content,
      msg_type: 0,
    };

    if (msgId) {
      body.msg_id = msgId;
    }

    return this.request<SendMessageResponse>('POST', path, body);
  }

  /**
   * 发送群聊富媒体消息
   * @param groupOpenid 群 OpenID
   * @param attachments 附件列表
   * @param msgId 消息 ID
   */
  async sendGroupMediaMessage(
    groupOpenid: string,
    attachments: MessageAttachment[],
    msgId?: string
  ): Promise<SendMessageResponse> {
    const path = `/v2/groups/${groupOpenid}/messages`;
    const msgSeq = msgId ? this.getNextMsgSeq(msgId) : 1;

    // QQ Bot API 富媒体消息格式：media 是单个对象，不是数组
    const body: Record<string, unknown> = {
      msg_type: 7,
      msg_seq: msgSeq, // 消息序号，QQ Bot API 要求
      media: {
        file_info: attachments[0]?.content || attachments[0]?.file || '',
      },
    };

    if (msgId) {
      body.msg_id = msgId;
    }

    return this.request<SendMessageResponse>('POST', path, body);
  }

  // ==================== 文件上传 API ====================

  /**
   * 上传文件到 QQ 服务器 (C2C 单聊)
   * @param openid 用户 OpenID
   * @param fileData 文件数据 (Buffer 或 base64)
   * @param fileType 文件类型 (1: 图片, 2: 视频, 3: 语音, 4: 文件)
   * @param fileTypeData 文件格式后缀
   * @param srvSendMsg 是否直接发送 (true=直接发送占用频次, false=仅上传返回file_info可复用)
   * @param fileName 原始文件名 (可选，用于更准确的文件名)
   */
  async uploadC2CFile(
    openid: string,
    fileData: Buffer | string,
    fileType: 1 | 2 | 3 | 4,
    fileTypeData: string,
    srvSendMsg: boolean = false,
    fileName?: string
  ): Promise<UploadFileResponse> {
    const path = `/v2/users/${openid}/files`;
    return this.uploadFileToPathWithRetry(path, fileData, fileType, fileTypeData, srvSendMsg, fileName);
  }

  /**
   * 上传文件到 QQ 服务器 (群聊)
   * @param groupOpenid 群 OpenID
   * @param fileData 文件数据 (Buffer 或 base64)
   * @param fileType 文件类型 (1: 图片, 2: 视频, 3: 语音, 4: 文件)
   * @param fileTypeData 文件格式后缀
   * @param srvSendMsg 是否直接发送 (true=直接发送占用频次, false=仅上传返回file_info可复用)
   * @param fileName 原始文件名 (可选，用于更准确的文件名)
   */
  async uploadGroupFile(
    groupOpenid: string,
    fileData: Buffer | string,
    fileType: 1 | 2 | 3 | 4,
    fileTypeData: string,
    srvSendMsg: boolean = false,
    fileName?: string
  ): Promise<UploadFileResponse> {
    const path = `/v2/groups/${groupOpenid}/files`;
    return this.uploadFileToPathWithRetry(path, fileData, fileType, fileTypeData, srvSendMsg, fileName);
  }

  /**
   * 带重试的文件上传
   */
  private async uploadFileToPathWithRetry(
    path: string,
    fileData: Buffer | string,
    fileType: 1 | 2 | 3 | 4,
    fileTypeData: string,
    srvSendMsg: boolean,
    fileName?: string,
    maxRetries: number = 3
  ): Promise<UploadFileResponse> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.uploadFileToPath(path, fileData, fileType, fileTypeData, srvSendMsg, fileName);
      } catch (error) {
        lastError = error as Error;

        // 检查是否是可重试的错误
        const isRetryable = lastError.message.includes('850012') ||
                           lastError.message.includes('inner proxy error') ||
                           lastError.message.includes('500') ||
                           lastError.message.includes('timeout');

        if (!isRetryable || attempt === maxRetries) {
          throw lastError;
        }

        // 等待后重试 (指数退避)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        logger.warn(`[API] 文件上传失败，${delay}ms 后重试 (${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('文件上传失败');
  }

  /**
   * 内部方法: 上传文件到指定路径
   * 参考 QQ Bot 官方文档: https://bot.q.qq.com/wiki/develop/api/openapi/file/upload_files.html
   * 使用 JSON + Base64 方式（QQ Bot 推荐）
   * @param path 完整的API路径
   * @param fileData 文件数据 (Buffer)
   * @param fileType 文件类型
   * @param fileTypeData 文件格式后缀
   * @param srvSendMsg 是否直接发送
   * @param fileName 原始文件名
   */
  private async uploadFileToPath(
    path: string,
    fileData: Buffer | string,
    fileType: 1 | 2 | 3 | 4,
    fileTypeData: string,
    srvSendMsg: boolean,
    fileName?: string
  ): Promise<UploadFileResponse> {
    // 将 Buffer 转换为 Base64 字符串
    const base64Data = typeof fileData === 'string' ? fileData : fileData.toString('base64');

    const url = `${this.baseUrl}${path}`;
    logger.info(`[API] POST ${url} (JSON + Base64 upload)`);
    logger.info(`[API] Upload details: file_type=${fileType}, file_type_data=${fileTypeData}, srv_send_msg=${srvSendMsg ? '1' : '0'}, base64_length=${base64Data.length}`);

    // 使用 JSON + Base64 方式上传（QQ Bot 推荐方式）
    const body: Record<string, unknown> = {
      file_type: fileType,
      file_type_data: fileTypeData,
      srv_send_msg: srvSendMsg ? 1 : 0,
      file_data: base64Data,
    };

    const token = await this.getAccessToken();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `QQBot ${token}`,
        'Content-Type': 'application/json',
        'X-Union-Appid': this.config.appId,
      },
      body: JSON.stringify(body),
    });

    const data = await this.safeParseJson(response);
    logger.info(`[API] Upload Response status: ${response.status}`);

    if (!response.ok) {
      const error = data as QQAPIError;
      logger.error(`[API] Upload Error - Status: ${response.status}`);
      logger.error(`[API] Error response: ${JSON.stringify(error, null, 2)}`);
      const errorCode = error.code || error.err_code || 'N/A';
      const errorMessage = error.message || error.msg || 'Unknown error';
      throw new Error(`文件上传失败 [${errorCode}]: ${errorMessage}`);
    }

    return data as UploadFileResponse;
  }

  /**
   * 获取文件的 Content-Type
   */
  private getContentType(extension: string): string {
    const contentTypes: Record<string, string> = {
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'json': 'application/json',
      'md': 'text/markdown',
    };
    return contentTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  // ==================== 用户/群组信息 API ====================

  /**
   * 获取用户信息
   * @param openid 用户 OpenID
   */
  async getUserInfo(openid: string): Promise<{
    id: string;
    username: string;
    avatar: string;
    union_openid?: string;
  }> {
    return this.request('GET', `/v2/users/${openid}`);
  }

  /**
   * 获取群组信息
   * @param groupOpenid 群 OpenID
   */
  async getGroupInfo(groupOpenid: string): Promise<{
    group_id: string;
    group_name: string;
    member_count: number;
    max_member_count: number;
  }> {
    return this.request('GET', `/v2/groups/${groupOpenid}`);
  }

  /**
   * 获取群成员列表
   * @param groupOpenid 群 OpenID
   * @param limit 返回数量
   * @param startIdx 起始索引
   */
  async getGroupMembers(
    groupOpenid: string,
    limit: number = 100,
    startIdx?: string
  ): Promise<{
    members: Array<{
      member_openid: string;
      nickname: string;
      joined_at: string;
    }>;
    next_idx?: string;
  }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (startIdx) {
      params.append('start_idx', startIdx);
    }
    return this.request('GET', `/v2/groups/${groupOpenid}/members?${params}`);
  }

  // ==================== 识别机器人身份 ====================

  /**
   * 获取机器人信息
   */
  async getMe(): Promise<{
    id: string;
    username: string;
    avatar: string;
  }> {
    return this.request('GET', '/v2/users/@me');
  }

  // ==================== 工具方法 ====================

  /**
   * 清除缓存的 Access Token
   */
  clearToken(): void {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * 获取当前 Access Token 状态
   */
  getTokenStatus(): { hasToken: boolean; expiresInSeconds: number } {
    return {
      hasToken: !!this.accessToken,
      expiresInSeconds: Math.max(0, Math.floor((this.tokenExpiresAt - Date.now()) / 1000)),
    };
  }
}
