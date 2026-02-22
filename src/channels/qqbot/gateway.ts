/**
 * QQ Bot Channel - WebSocket Gateway
 * QQ 开放平台 WebSocket 连接管理
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  QQBotConfig,
  QQPayload,
  QQMessage,
  QQEventType,
  WSOpcodes,
  GatewayHello,
  IdentifyPayload,
  HeartbeatPayload,
  Intents,
  isQQMessage,
} from './types.js';
import { logger } from '../../utils/logger.js';

export interface QQGatewayEvents {
  ready: (sessionId: string) => void;
  message: (message: QQMessage) => void;
  groupMessage: (message: QQMessage) => void;
  error: (error: Error) => void;
  close: () => void;
  reconnect: () => void;
}

export class QQGateway extends EventEmitter {
  private config: QQBotConfig;
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private sessionId: string | null = null;
  private seq: number = 0;
  private reconnectAttempts: number = 0;
  private isConnecting: boolean = false;
  private readyResolve: ((value: void) => void) | null = null;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  /** API 基础 URL - 根据沙箱模式选择 */
  private get apiUrl(): string {
    return this.config.sandbox
      ? 'https://sandbox.api.sgroup.qq.com'
      : 'https://api.sgroup.qq.com';
  }

  /** 获取 AccessToken - 使用新的认证方式 */
  private async fetchAccessToken(): Promise<string> {
    // 检查缓存的 token 是否有效
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    try {
      // 使用 bots.qq.com 获取 AccessToken
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

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`获取 AccessToken 失败: ${response.status} ${text}`);
      }

      const data = await response.json() as { access_token: string; expires_in: number };
      this.accessToken = data.access_token;
      // 提前 60 秒过期，但至少保留 30 秒有效期
      const expiresInSeconds = Math.max(30, data.expires_in - 60);
      this.tokenExpiresAt = Date.now() + expiresInSeconds * 1000;

      logger.info(`AccessToken 获取成功，有效期: ${expiresInSeconds} 秒`);
      return this.accessToken;
    } catch (error) {
      logger.error(`获取 AccessToken 异常: ${error}`);
      throw error;
    }
  }

  /** 获取网关地址 - 通过 API 获取 */
  private async fetchGatewayUrl(): Promise<string> {
    try {
      // 使用 AccessToken 进行认证
      const accessToken = await this.fetchAccessToken();

      const response = await fetch(`${this.apiUrl}/gateway/bot`, {
        method: 'GET',
        headers: {
          'Authorization': `QQBot ${accessToken}`,
          'X-Union-Appid': this.config.appId,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        logger.warn(`Failed to fetch gateway URL: ${response.status} ${text}`);
        // 回退到默认地址
        return this.config.sandbox
          ? 'wss://sandbox.api.sgroup.qq.com/websocket/'
          : 'wss://api.sgroup.qq.com/websocket/';
      }

      const data = await response.json() as { url: string };
      logger.info(`Fetched gateway URL: ${data.url}`);
      return data.url;
    } catch (error) {
      logger.warn(`Error fetching gateway URL: ${error}, using default`);
      return this.config.sandbox
        ? 'wss://sandbox.api.sgroup.qq.com/websocket/'
        : 'wss://api.sgroup.qq.com/websocket/';
    }
  }

  constructor(config: QQBotConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    // 先获取网关地址
    const gatewayUrl = await this.fetchGatewayUrl();

    return new Promise((resolve, reject) => {
      try {
        logger.info(`Connecting to QQ Gateway (${this.config.sandbox ? 'sandbox' : 'production'})...`);
        logger.info(`Gateway URL: ${gatewayUrl}`);
        this.ws = new WebSocket(gatewayUrl);

        this.ws.on('open', () => {
          logger.info('WebSocket connection opened');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
        });

        this.ws.on('message', (data) => {
          try {
            const payload: QQPayload = JSON.parse(data.toString());
            this.handlePayload(payload, resolve);
          } catch (error) {
            logger.error(`Failed to parse gateway message: ${error}`);
          }
        });

        this.ws.on('close', (code, reason) => {
          logger.warn(`WebSocket closed: ${code} - ${reason}`);
          this.cleanup();
          this.emit('close');
          this.scheduleReconnect();
        });

        this.ws.on('error', (error) => {
          logger.error(`WebSocket error: ${error}`);
          this.emit('error', error);
          this.isConnecting = false;
          reject(error);
        });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private handlePayload(payload: QQPayload, resolve?: (value: void) => void): void {
    logger.info(`[Gateway.handlePayload] op=${payload.op}, t=${payload.t || 'N/A'}`);
    // 更新序列号
    if (payload.s !== undefined) {
      this.seq = payload.s;
    }

    switch (payload.op) {
      case WSOpcodes.HELLO:
        this.handleHello(payload as unknown as GatewayHello, resolve);
        break;

      case WSOpcodes.HEARTBEAT_ACK:
        logger.debug('Heartbeat ACK received');
        break;

      case WSOpcodes.DISPATCH:
        this.handleDispatch(payload);
        break;

      case WSOpcodes.RECONNECT:
        logger.warn('Server requested reconnect');
        this.reconnect();
        break;

      case WSOpcodes.INVALID_SESSION:
        logger.error('Invalid session, re-identifying...');
        this.sessionId = null;
        this.identify();
        break;
    }
  }

  private handleHello(hello: GatewayHello, resolve?: (value: void) => void): void {
    const heartbeatInterval = hello.d.heartbeat_interval;
    // 确保心跳间隔有效（至少 1 秒）
    const safeInterval = Math.max(1000, heartbeatInterval);
    this.startHeartbeat(safeInterval);
    this.identify();

    if (resolve) {
      // 保存 resolve 以便在 ready 时调用，避免重复添加监听器
      this.readyResolve = resolve;
    }
  }

  private startHeartbeat(interval: number): void {
    this.stopHeartbeat();
    logger.debug(`Starting heartbeat with interval: ${interval}ms`);

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendHeartbeat(): void {
    const payload: HeartbeatPayload = {
      op: WSOpcodes.HEARTBEAT,
      d: this.seq,
    };
    this.send(payload);
  }

  private identify(): void {
    // 使用 AccessToken 进行认证
    // 新格式: QQBot {ACCESS_TOKEN}
    const token = this.accessToken;
    if (!token) {
      logger.error('No access token available for identify');
      return;
    }

    const intents = Intents.C2C_MESSAGE_CREATE | Intents.GROUP_AT_MESSAGE_CREATE;
    logger.info(`[Identify] Intents: ${intents} (C2C=${Intents.C2C_MESSAGE_CREATE}, GROUP_AT=${Intents.GROUP_AT_MESSAGE_CREATE})`);

    const payload: IdentifyPayload = {
      op: WSOpcodes.IDENTIFY,
      d: {
        token: `QQBot ${token}`,
        intents,
        shard: [0, 1],
        properties: {
          $os: process.platform,
          $browser: 'qq-claude-proxy',
          $device: 'qq-claude-proxy',
        },
      },
    };

    logger.info(`Sending identify payload with token: QQBot ***`);
    this.send(payload);
  }

  private handleDispatch(payload: QQPayload): void {
    const eventType = payload.t as QQEventType;
    logger.info(`[Gateway.handleDispatch] 收到事件: ${eventType}`);

    switch (eventType) {
      case 'READY':
        this.handleReady(payload);
        break;

      case 'RESUMED':
        logger.info('Session resumed');
        break;

      case 'C2C_MESSAGE_CREATE':
        logger.info(`[Gateway.handleDispatch] 处理 C2C 消息`);
        this.handleC2CMessage(payload);
        break;

      case 'GROUP_AT_MESSAGE_CREATE':
        logger.info(`[Gateway.handleDispatch] 处理群消息`);
        this.handleGroupMessage(payload);
        break;

      default:
        logger.debug(`Unhandled event type: ${eventType}`);
    }
  }

  private handleReady(payload: QQPayload): void {
    const data = payload.d as { session_id: string; user: { id: string; username: string } };
    this.sessionId = data.session_id;
    logger.info(`Gateway ready - Session: ${this.sessionId}, Bot: ${data.user.username}`);
    this.emit('ready', this.sessionId);

    // 调用保存的 resolve 并清理
    if (this.readyResolve) {
      this.readyResolve();
      this.readyResolve = null;
    }
  }

  private handleC2CMessage(payload: QQPayload): void {
    const data = payload.d;
    if (isQQMessage(data)) {
      data.raw = payload;
      logger.debug(`C2C message from ${data.author.id}: ${data.content}`);
      this.emit('message', data);
    }
  }

  private handleGroupMessage(payload: QQPayload): void {
    const data = payload.d;
    if (isQQMessage(data)) {
      data.raw = payload;
      logger.debug(`Group message in ${data.group_id} from ${data.author.id}: ${data.content}`);
      this.emit('groupMessage', data);
    }
  }

  private send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();
    // 清理保存的 ready resolve，防止内存泄漏
    this.readyResolve = null;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    const maxAttempts = this.config.reconnect?.maxAttempts ?? 5;
    const delay = this.config.reconnect?.delay ?? 5000;

    if (this.reconnectAttempts >= maxAttempts) {
      logger.error(`Max reconnect attempts (${maxAttempts}) reached`);
      return;
    }

    if (this.config.reconnect?.enabled === false) {
      return;
    }

    this.reconnectAttempts++;
    logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${maxAttempts})`);

    setTimeout(() => {
      this.emit('reconnect');
      this.connect().catch((error) => {
        logger.error(`Reconnect failed: ${error}`);
      });
    }, delay);
  }

  reconnect(): void {
    this.cleanup();
    this.scheduleReconnect();
  }

  close(): void {
    logger.info('Closing gateway connection...');
    this.cleanup();
    this.reconnectAttempts = 100; // Prevent reconnection
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
