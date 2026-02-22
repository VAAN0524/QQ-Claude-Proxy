/**
 * QQ Bot Channel - Type Definitions
 * QQ 开放平台 API v2 类型定义
 */

// ==================== 配置接口 ====================

export interface QQBotConfig {
  /** 机器人 AppID */
  appId: string;
  /** 机器人 AppSecret */
  appSecret: string;
  /** 机器人 Token (用于 WebSocket) */
  token?: string;
  /** 沙箱环境 */
  sandbox?: boolean;
  /** 重连配置 */
  reconnect?: {
    enabled: boolean;
    maxAttempts: number;
    delay: number;
  };
}

// ==================== 认证相关 ====================

export interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// ==================== 消息类型 ====================

/** 消息内容类型 */
export type MessageContentType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'markdown' | 'ark';

/** 消息附件 */
export interface MessageAttachment {
  /** 附件类型 */
  type: MessageContentType;
  /** 文件 URL 或 base64 */
  content?: string;
  /** 文件名 */
  file?: string;
  /** 文件 URL (服务端返回) */
  url?: string;
}

/** QQ 消息接口 */
export interface QQMessage {
  /** 消息 ID */
  id: string;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: string;
  /** 发送者 ID */
  author: {
    id: string;
    username?: string;
    avatar?: string;
    bot?: boolean;
  };
  /** 群组信息 (群聊时) */
  group_id?: string;
  /** 频道 ID (频道消息时) */
  channel_id?: string;
  /** 子频道 ID */
  sub_channel_id?: string;
  /** 消息类型 */
  msg_type?: number;
  /** 消息序列号 */
  seq?: number;
  /** @用户列表 */
  mentions?: Array<{
    id: string;
    username?: string;
  }>;
  /** @所有人 */
  mention_everyone?: boolean;
  /** 附件 */
  attachments?: MessageAttachment[];
  /** 原始事件数据 */
  raw?: QQPayload;
}

// ==================== 事件 Payload ====================

/** 事件类型 */
export type QQEventType =
  | 'READY'
  | 'RESUMED'
  | 'C2C_MESSAGE_CREATE'
  | 'GROUP_AT_MESSAGE_CREATE'
  | 'DIRECT_MESSAGE_CREATE'
  | 'AT_MESSAGE_CREATE'
  | 'MESSAGE_CREATE'
  | 'MESSAGE_DELETE'
  | 'MESSAGE_REACTION_ADD'
  | 'GUILD_CREATE'
  | 'GUILD_DELETE'
  | 'CHANNEL_CREATE'
  | 'CHANNEL_DELETE';

/** QQ 事件 Payload */
export interface QQPayload {
  /** 事件类型 */
  t?: QQEventType;
  /** 事件数据 */
  d?: QQMessage | ReadyData | ResumedData | unknown;
  /** 序列号 */
  s?: number;
  /** 操作码 */
  op?: number;
}

/** READY 事件数据 */
export interface ReadyData {
  version: number;
  session_id: string;
  user: {
    id: string;
    username: string;
    bot: boolean;
  };
  shard?: [number, number];
}

/** RESUMED 事件数据 */
export interface ResumedData {
  session_id: string;
  seq: number;
}

// ==================== WebSocket 消息 ====================

/** WebSocket 操作码 */
export enum WSOpcodes {
  /** 分发事件 */
  DISPATCH = 0,
  /** 心跳 */
  HEARTBEAT = 1,
  /** 识别 */
  IDENTIFY = 2,
  /** 恢复会话 */
  RESUME = 6,
  /** 重连 */
  RECONNECT = 7,
  /** 无效会话 */
  INVALID_SESSION = 9,
  /** 你好 */
  HELLO = 10,
  /** 心跳确认 */
  HEARTBEAT_ACK = 11,
  /** HTTP 回调心跳 */
  HTTP_CALLBACK_ACK = 12,
}

/** Gateway Hello 消息 */
export interface GatewayHello {
  op: WSOpcodes.HELLO;
  d: {
    heartbeat_interval: number;
  };
}

/** Identify Payload */
export interface IdentifyPayload {
  op: WSOpcodes.IDENTIFY;
  d: {
    token: string;
    intents: number;
    shard?: [number, number];
    properties?: Record<string, string>;
  };
}

/** Resume Payload */
export interface ResumePayload {
  op: WSOpcodes.RESUME;
  d: {
    token: string;
    session_id: string;
    seq: number;
  };
}

/** Heartbeat Payload */
export interface HeartbeatPayload {
  op: WSOpcodes.HEARTBEAT;
  d: number | null;
}

// ==================== Intents 常量 ====================

/**
 * Intent 位掩码
 * 用于订阅特定事件
 */
export const Intents = {
  /** 频道事件 */
  GUILDS: 1 << 0,
  /** 频道成员事件 */
  GUILD_MEMBERS: 1 << 1,
  /** 频道消息事件 */
  GUILD_MESSAGES: 1 << 9,
  /** 频道消息表情反应事件 */
  GUILD_MESSAGE_REACTIONS: 1 << 10,
  /** 直接消息事件 */
  DIRECT_MESSAGE: 1 << 12,
  /** 直接消息表情反应事件 */
  DIRECT_MESSAGE_REACTIONS: 1 << 13,
  /** 论坛事件 */
  OPEN_FORUMS_EVENT: 1 << 28,
  /** 音频事件 */
  AUDIO_OR_LIVE_CHANNEL_MEMBER: 1 << 29,
  /** C2C 私聊消息 */
  C2C_MESSAGE_CREATE: 1 << 25,
  /** 群聊 @ 消息 */
  GROUP_AT_MESSAGE_CREATE: 1 << 26,
  /** 互动事件 */
  INTERACTION: 1 << 27,

  /** 公域机器人预设 Intent */
  PUBLIC_INTENTS: (1 << 25) | (1 << 26),

  /** 所有 Intent */
  ALL_INTENTS:
    (1 << 0) |
    (1 << 1) |
    (1 << 9) |
    (1 << 10) |
    (1 << 12) |
    (1 << 13) |
    (1 << 25) |
    (1 << 26) |
    (1 << 27) |
    (1 << 28) |
    (1 << 29),
} as const;

// ==================== API 响应 ====================

/** API 错误响应 */
export interface QQAPIError {
  code?: number;
  message?: string;
  msg?: string;          // 备用消息字段
  err_code?: number;     // 备用错误代码
  trace_id?: string;
  data?: unknown;
}

/** 发送消息响应 */
export interface SendMessageResponse {
  id: string;
  timestamp: string;
}

/** 上传文件响应 */
export interface UploadFileResponse {
  file_uuid: string;
  file_info: string;
  ttl: number;
}

// ==================== 事件类型守卫 ====================

export function isQQMessage(data: unknown): data is QQMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as QQMessage;
  return typeof msg.id === 'string' && typeof msg.content === 'string';
}

export function isReadyData(data: unknown): data is ReadyData {
  if (typeof data !== 'object' || data === null) return false;
  const ready = data as ReadyData;
  return typeof ready.session_id === 'string' && typeof ready.user === 'object';
}
