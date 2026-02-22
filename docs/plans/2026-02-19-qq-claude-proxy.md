# QQ-Claude-Proxy 本地代理系统实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development

**Goal:** 创建一个本地运行的系统，让用户通过手机QQ远程控制家里的Claude Code，实现消息/文件双向传输。

**Architecture:**
- Gateway 作为中央控制平面（WebSocket服务端，端口18789）
- QQ Bot Channel 适配器连接QQ开放平台
- Claude Agent Runtime 直接调用本地Claude Code SDK
- 文件传输模块处理手机-电脑互传

**Tech Stack:** Node.js 22+, TypeScript, ws, @anthropic-ai/sdk, QQ Bot API v2

---

## 项目结构

```
qq-claude-proxy/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # 入口
│   ├── gateway/              # Gateway 守护进程
│   │   ├── server.ts         # WebSocket 服务端
│   │   ├── protocol.ts       # 消息协议
│   │   ├── router.ts         # 消息路由
│   │   └── session.ts        # 会话管理
│   ├── channels/             # 渠道适配器
│   │   └── qqbot/
│   │       ├── index.ts      # 入口
│   │       ├── api.ts        # QQ API 封装
│   │       ├── gateway.ts    # WebSocket 连接
│   │       ├── message.ts    # 消息处理
│   │       └── types.ts      # 类型定义
│   ├── agent/                # Claude Agent Runtime
│   │   ├── index.ts          # Runtime 入口
│   │   ├── claude-client.ts  # Claude SDK 调用
│   │   ├── tools.ts          # 工具定义
│   │   └── context.ts        # 上下文管理
│   ├── transfer/             # 文件传输
│   │   ├── uploader.ts       # 上传处理
│   │   ├── downloader.ts     # 下载处理
│   │   └── storage.ts        # 存储管理
│   ├── config/               # 配置
│   │   ├── index.ts
│   │   └── schema.ts
│   └── utils/                # 工具函数
│       ├── logger.ts
│       └── helpers.ts
├── config/
│   └── default.json
├── tests/
│   └── ...
└── README.md
```

---

## Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`

**Step 1: 初始化 npm 项目**

```bash
cd c:\Test\bot
npm init -y
```

**Step 2: 安装依赖**

```bash
npm install ws @anthropic-ai/sdk dotenv pino
npm install -D typescript @types/node @types/ws ts-node tsx
```

**Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: 创建入口文件**

```typescript
// src/index.ts
import { Gateway } from './gateway/server.js';
import { QQBotChannel } from './channels/qqbot/index.js';
import { ClaudeAgent } from './agent/index.js';
import { loadConfig } from './config/index.js';
import { logger } from './utils/logger.js';

async function main() {
  const config = loadConfig();
  logger.info('Starting QQ-Claude-Proxy...');

  const gateway = new Gateway(config.gateway);
  const qqChannel = new QQBotChannel(config.channels.qqbot);
  const agent = new ClaudeAgent(config.agent);

  await gateway.start();
  gateway.registerChannel('qqbot', qqChannel);
  gateway.registerAgent(agent);

  logger.info('System started successfully');
}

main().catch(console.error);
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: initialize project structure"
```

---

## Task 2: Gateway 核心模块

**Files:**
- Create: `src/gateway/server.ts`
- Create: `src/gateway/protocol.ts`
- Create: `src/gateway/router.ts`
- Create: `src/gateway/session.ts`

**Step 1: 定义消息协议**

```typescript
// src/gateway/protocol.ts
export interface Request {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface Response {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

export interface Event {
  type: 'event';
  channel: string;
  event: string;
  data: unknown;
}

export type Message = Request | Response | Event;
```

**Step 2: 创建 WebSocket 服务端**

```typescript
// src/gateway/server.ts
import { WebSocketServer, WebSocket } from 'ws';
import { Request, Response, Event } from './protocol.js';
import { Router } from './router.js';
import { SessionManager } from './session.js';
import { logger } from '../utils/logger.js';

export interface GatewayConfig {
  port: number;
  host: string;
}

export class Gateway {
  private wss: WebSocketServer | null = null;
  private router: Router;
  private sessions: SessionManager;
  private channels: Map<string, any> = new Map();
  private agent: any = null;

  constructor(private config: GatewayConfig) {
    this.router = new Router();
    this.sessions = new SessionManager();
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({
        port: this.config.port,
        host: this.config.host
      });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      this.wss.on('listening', () => {
        logger.info(`Gateway listening on ${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  private handleConnection(ws: WebSocket, req: any): void {
    const clientId = this.generateId();

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        await this.handleMessage(ws, msg, clientId);
      } catch (err) {
        logger.error('Message handling error:', err);
      }
    });

    ws.on('close', () => {
      this.sessions.remove(clientId);
    });
  }

  private async handleMessage(ws: WebSocket, msg: any, clientId: string): Promise<void> {
    // 处理来自Channel的消息
    if (msg.type === 'event') {
      await this.handleChannelEvent(msg as Event);
    }
  }

  async handleChannelEvent(event: Event): Promise<void> {
    // 路由到Agent处理
    if (this.agent) {
      const response = await this.agent.process(event);
      // 发送回复到对应Channel
      const channel = this.channels.get(event.channel);
      if (channel) {
        await channel.send(response);
      }
    }
  }

  registerChannel(name: string, channel: any): void {
    this.channels.set(name, channel);
    channel.setGateway(this);
    logger.info(`Channel registered: ${name}`);
  }

  registerAgent(agent: any): void {
    this.agent = agent;
    agent.setGateway(this);
    logger.info('Agent registered');
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
```

**Step 3: 创建路由器**

```typescript
// src/gateway/router.ts
import { Request, Response } from './protocol.js';

type Handler = (params: Record<string, unknown>) => Promise<unknown>;

export class Router {
  private handlers: Map<string, Handler> = new Map();

  on(method: string, handler: Handler): void {
    this.handlers.set(method, handler);
  }

  async route(req: Request): Promise<Response> {
    const handler = this.handlers.get(req.method);
    if (!handler) {
      return {
        type: 'res',
        id: req.id,
        ok: false,
        error: `Unknown method: ${req.method}`
      };
    }

    try {
      const payload = await handler(req.params);
      return { type: 'res', id: req.id, ok: true, payload };
    } catch (err: any) {
      return { type: 'res', id: req.id, ok: false, error: err.message };
    }
  }
}
```

**Step 4: 创建会话管理**

```typescript
// src/gateway/session.ts
interface Session {
  id: string;
  channel: string;
  userId: string;
  context: Map<string, unknown>;
  createdAt: Date;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  create(channel: string, userId: string): Session {
    const id = `${channel}:${userId}`;
    const session: Session = {
      id,
      channel,
      userId,
      context: new Map(),
      createdAt: new Date()
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  remove(id: string): void {
    this.sessions.delete(id);
  }
}
```

**Step 5: Commit**

```bash
git add src/gateway/
git commit -m "feat: implement Gateway core module"
```

---

## Task 3: QQ Bot Channel 适配器

**Files:**
- Create: `src/channels/qqbot/index.ts`
- Create: `src/channels/qqbot/api.ts`
- Create: `src/channels/qqbot/gateway.ts`
- Create: `src/channels/qqbot/message.ts`
- Create: `src/channels/qqbot/types.ts`

**Step 1: 定义类型**

```typescript
// src/channels/qqbot/types.ts
export interface QQBotConfig {
  appId: string;
  clientSecret: string;
  enabled: boolean;
  systemPrompt?: string;
}

export interface QQMessage {
  id: string;
  channel_id?: string;
  guild_id?: string;
  author: {
    id: string;
    username?: string;
  };
  content: string;
  attachments?: Array<{
    id: string;
    url: string;
    filename: string;
    content_type?: string;
  }>;
  timestamp: string;
}

export interface QQPayload {
  op: number;
  d: any;
  s?: number;
  t?: string;
}

export const Intents = {
  C2C_MESSAGE_CREATE: 1 << 25,
  GROUP_AT_MESSAGE_CREATE: 1 << 25,
  AT_MESSAGE_CREATE: 1 << 30,
  DIRECT_MESSAGE_CREATE: 1 << 12
};
```

**Step 2: 创建 QQ API 封装**

```typescript
// src/channels/qqbot/api.ts
import { QQBotConfig } from './types.js';

export class QQBotAPI {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(private config: QQBotConfig) {}

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const response = await fetch('https://bots.qq.com/app/getAppAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: this.config.appId,
        clientSecret: this.config.clientSecret
      })
    });

    const data = await response.json() as any;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

    return this.accessToken!;
  }

  async sendC2CMessage(userId: string, content: string): Promise<any> {
    const token = await this.getAccessToken();
    const response = await fetch(
      `https://bots.qq.com/v2/users/${userId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `QQBot ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content,
          msg_type: 0
        })
      }
    );
    return response.json();
  }

  async sendGroupMessage(groupId: string, content: string, msgId: string): Promise<any> {
    const token = await this.getAccessToken();
    const response = await fetch(
      `https://bots.qq.com/v2/groups/${groupId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `QQBot ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content,
          msg_type: 0,
          msg_id: msgId
        })
      }
    );
    return response.json();
  }

  async uploadFile(fileUrl: string): Promise<string> {
    // 下载并上传文件到 QQ 服务器
    // 返回文件 URL
    return fileUrl; // 简化实现
  }
}
```

**Step 3: 创建 WebSocket 网关连接**

```typescript
// src/channels/qqbot/gateway.ts
import WebSocket from 'ws';
import { QQBotConfig, QQPayload, Intents } from './types.js';
import { EventEmitter } from 'events';

export class QQGateway extends EventEmitter {
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;
  private seq: number = 0;

  constructor(private config: QQBotConfig) {
    super();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('wss://bots.qq.com/gateway');

      this.ws.on('open', () => {
        this.sendIdentify();
        resolve();
      });

      this.ws.on('message', (data) => {
        const payload: QQPayload = JSON.parse(data.toString());
        this.handlePayload(payload);
      });

      this.ws.on('close', () => {
        this.emit('close');
        this.reconnect();
      });

      this.ws.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });
    });
  }

  private sendIdentify(): void {
    const intents = Intents.C2C_MESSAGE_CREATE | Intents.GROUP_AT_MESSAGE_CREATE;

    this.send({
      op: 2,
      d: {
        token: `QQBot ${this.config.appId}.${this.config.clientSecret}`,
        intents,
        shard: [0, 1],
        properties: {}
      }
    });
  }

  private handlePayload(payload: QQPayload): void {
    switch (payload.op) {
      case 10: // Hello
        this.startHeartbeat(payload.d.heartbeat_interval);
        break;
      case 11: // Heartbeat ACK
        break;
      case 0: // Dispatch
        if (payload.s) this.seq = payload.s;
        this.emit('event', payload.t, payload.d);
        break;
    }
  }

  private startHeartbeat(interval: number): void {
    this.heartbeatInterval = setInterval(() => {
      this.send({ op: 1, d: this.seq });
    }, interval);
  }

  private send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private async reconnect(): Promise<void> {
    setTimeout(() => this.connect(), 5000);
  }

  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}
```

**Step 4: 创建 Channel 主入口**

```typescript
// src/channels/qqbot/index.ts
import { QQBotConfig, QQMessage } from './types.js';
import { QQBotAPI } from './api.js';
import { QQGateway } from './gateway.js';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';

export class QQBotChannel extends EventEmitter {
  private api: QQBotAPI;
  private gateway: QQGateway;
  private botGateway: any = null;

  constructor(private config: QQBotConfig) {
    super();
    this.api = new QQBotAPI(config);
    this.gateway = new QQGateway(config);
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('QQ Bot channel is disabled');
      return;
    }

    this.gateway.on('event', (eventType: string, data: any) => {
      this.handleEvent(eventType, data);
    });

    await this.gateway.connect();
    logger.info('QQ Bot channel started');
  }

  private handleEvent(eventType: string, data: any): void {
    switch (eventType) {
      case 'C2C_MESSAGE_CREATE':
        this.handleC2CMessage(data);
        break;
      case 'GROUP_AT_MESSAGE_CREATE':
        this.handleGroupMessage(data);
        break;
    }
  }

  private handleC2CMessage(data: QQMessage): void {
    const message = {
      channel: 'qqbot',
      userId: data.author.id,
      content: data.content,
      attachments: data.attachments,
      timestamp: new Date(data.timestamp)
    };

    // 发送到 Gateway 处理
    if (this.botGateway) {
      this.botGateway.handleChannelEvent({
        type: 'event',
        channel: 'qqbot',
        event: 'message',
        data: message
      });
    }
  }

  private handleGroupMessage(data: any): void {
    // 群消息处理（需要 @机器人）
    const message = {
      channel: 'qqbot',
      groupId: data.group_id,
      userId: data.author.id,
      content: data.content,
      timestamp: new Date()
    };

    if (this.botGateway) {
      this.botGateway.handleChannelEvent({
        type: 'event',
        channel: 'qqbot',
        event: 'group_message',
        data: message
      });
    }
  }

  setGateway(gateway: any): void {
    this.botGateway = gateway;
  }

  async send(message: any): Promise<void> {
    if (message.userId) {
      await this.api.sendC2CMessage(message.userId, message.content);
    } else if (message.groupId) {
      await this.api.sendGroupMessage(message.groupId, message.content, message.msgId);
    }
  }
}
```

**Step 5: Commit**

```bash
git add src/channels/qqbot/
git commit -m "feat: implement QQ Bot channel adapter"
```

---

## Task 4: Claude Code Agent Runtime

**Files:**
- Create: `src/agent/index.ts`
- Create: `src/agent/claude-client.ts`
- Create: `src/agent/tools.ts`
- Create: `src/agent/context.ts`

**Step 1: 创建 Claude 客户端**

```typescript
// src/agent/claude-client.ts
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

export interface ClaudeConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt?: string;
}

export class ClaudeClient {
  private client: Anthropic;
  private conversations: Map<string, Anthropic.MessageParam[]> = new Map();

  constructor(private config: ClaudeConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async chat(sessionId: string, userMessage: string, tools?: any[]): Promise<string> {
    // 获取或创建对话历史
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, []);
    }

    const messages = this.conversations.get(sessionId)!;
    messages.push({ role: 'user', content: userMessage });

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: this.config.systemPrompt,
        messages,
        tools
      });

      let assistantContent = '';
      const toolUses: any[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          assistantContent += block.text;
        } else if (block.type === 'tool_use') {
          toolUses.push(block);
        }
      }

      // 保存助手响应
      messages.push({ role: 'assistant', content: response.content });

      return assistantContent;
    } catch (error) {
      logger.error('Claude API error:', error);
      throw error;
    }
  }

  async *streamChat(sessionId: string, userMessage: string): AsyncGenerator<string> {
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, []);
    }

    const messages = this.conversations.get(sessionId)!;
    messages.push({ role: 'user', content: userMessage });

    const stream = this.client.messages.stream({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: this.config.systemPrompt,
      messages
    });

    let fullContent = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullContent += event.delta.text;
        yield event.delta.text;
      }
    }

    messages.push({ role: 'assistant', content: fullContent });
  }

  clearSession(sessionId: string): void {
    this.conversations.delete(sessionId);
  }
}
```

**Step 2: 定义工具**

```typescript
// src/agent/tools.ts
export const tools = [
  {
    name: 'execute_command',
    description: '在本地电脑执行终端命令',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的命令'
        },
        cwd: {
          type: 'string',
          description: '工作目录（可选）'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: '读取本地文件内容',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件路径'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: '写入内容到本地文件',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件路径'
        },
        content: {
          type: 'string',
          description: '文件内容'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: '列出目录内容',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '目录路径'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'send_file',
    description: '发送文件到QQ',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要发送的文件路径'
        },
        message: {
          type: 'string',
          description: '附加消息（可选）'
        }
      },
      required: ['path']
    }
  }
];

export async function executeTool(name: string, params: Record<string, any>): Promise<string> {
  const { execSync, readFileSync, writeFileSync, readdirSync, existsSync } = await import('fs');

  switch (name) {
    case 'execute_command':
      try {
        const result = execSync(params.command, {
          cwd: params.cwd || process.cwd(),
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024 * 10
        });
        return result || 'Command executed successfully';
      } catch (err: any) {
        return `Error: ${err.message}`;
      }

    case 'read_file':
      try {
        return readFileSync(params.path, 'utf-8');
      } catch (err: any) {
        return `Error reading file: ${err.message}`;
      }

    case 'write_file':
      try {
        writeFileSync(params.path, params.content, 'utf-8');
        return 'File written successfully';
      } catch (err: any) {
        return `Error writing file: ${err.message}`;
      }

    case 'list_directory':
      try {
        const items = readdirSync(params.path);
        return items.join('\n');
      } catch (err: any) {
        return `Error listing directory: ${err.message}`;
      }

    case 'send_file':
      // 这个工具会被 Agent 拦截并路由到文件传输模块
      return `FILE_TRANSFER:${params.path}:${params.message || ''}`;

    default:
      return `Unknown tool: ${name}`;
  }
}
```

**Step 3: 创建 Agent 主入口**

```typescript
// src/agent/index.ts
import { ClaudeClient, ClaudeConfig } from './claude-client.js';
import { tools, executeTool } from './tools.js';
import { Event } from '../gateway/protocol.js';
import { logger } from '../utils/logger.js';

export interface AgentConfig {
  claude: ClaudeConfig;
  allowedUsers?: string[];
  sandboxMode?: boolean;
}

export class ClaudeAgent {
  private client: ClaudeClient;
  private gateway: any = null;

  constructor(private config: AgentConfig) {
    this.client = new ClaudeClient(config.claude);
  }

  setGateway(gateway: any): void {
    this.gateway = gateway;
  }

  async process(event: Event): Promise<any> {
    const { channel, event: eventType, data } = event;

    if (eventType !== 'message' && eventType !== 'group_message') {
      return null;
    }

    // 检查用户权限
    if (this.config.allowedUsers && !this.config.allowedUsers.includes(data.userId)) {
      return {
        userId: data.userId,
        content: '抱歉，您没有使用权限。'
      };
    }

    const sessionId = `${channel}:${data.userId}`;

    try {
      // 处理文件附件
      let userContent = data.content;
      if (data.attachments && data.attachments.length > 0) {
        for (const att of data.attachments) {
          userContent += `\n[附件: ${att.filename}]`;
          // 下载并保存附件
        }
      }

      // 调用 Claude
      let response = '';
      for await (const chunk of this.client.streamChat(sessionId, userContent)) {
        response += chunk;
      }

      // 检查是否需要文件传输
      if (response.includes('FILE_TRANSFER:')) {
        const match = response.match(/FILE_TRANSFER:(.+):(.*)/);
        if (match && this.gateway) {
          // 触发文件传输
          const filePath = match[1];
          const message = match[2];
          // 这里需要调用文件传输模块
        }
      }

      return {
        userId: data.userId,
        groupId: data.groupId,
        msgId: data.id,
        content: response.substring(0, 2000) // QQ 消息长度限制
      };
    } catch (error) {
      logger.error('Agent processing error:', error);
      return {
        userId: data.userId,
        content: '处理请求时发生错误，请稍后重试。'
      };
    }
  }
}
```

**Step 4: Commit**

```bash
git add src/agent/
git commit -m "feat: implement Claude Code Agent Runtime"
```

---

## Task 5: 配置与工具模块

**Files:**
- Create: `src/config/index.ts`
- Create: `src/config/schema.ts`
- Create: `src/utils/logger.ts`
- Create: `config/default.json`

**Step 1: 创建配置 Schema**

```typescript
// src/config/schema.ts
export interface Config {
  gateway: {
    port: number;
    host: string;
  };
  channels: {
    qqbot: {
      enabled: boolean;
      appId: string;
      clientSecret: string;
      systemPrompt?: string;
    };
  };
  agent: {
    claude: {
      apiKey: string;
      model: string;
      maxTokens: number;
      systemPrompt?: string;
    };
    allowedUsers?: string[];
    sandboxMode?: boolean;
  };
  storage: {
    downloadPath: string;
    uploadPath: string;
  };
}

export const defaultConfig: Config = {
  gateway: {
    port: 18789,
    host: '127.0.0.1'
  },
  channels: {
    qqbot: {
      enabled: true,
      appId: '',
      clientSecret: ''
    }
  },
  agent: {
    claude: {
      apiKey: '',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      systemPrompt: '你是一个智能助手，可以通过QQ与用户交互，帮助用户操作本地电脑完成任务。'
    },
    sandboxMode: true
  },
  storage: {
    downloadPath: './downloads',
    uploadPath: './uploads'
  }
};
```

**Step 2: 创建配置加载器**

```typescript
// src/config/index.ts
import { Config, defaultConfig } from './schema.js';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export function loadConfig(): Config {
  const configPath = process.env.QQ_CLAUDE_CONFIG || resolve(process.cwd(), 'config.json');

  if (existsSync(configPath)) {
    const fileContent = readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(fileContent);
    return mergeConfig(defaultConfig, userConfig);
  }

  // 支持环境变量覆盖
  return {
    ...defaultConfig,
    channels: {
      qqbot: {
        ...defaultConfig.channels.qqbot,
        appId: process.env.QQ_BOT_APP_ID || '',
        clientSecret: process.env.QQ_BOT_SECRET || ''
      }
    },
    agent: {
      ...defaultConfig.agent,
      claude: {
        ...defaultConfig.agent.claude,
        apiKey: process.env.ANTHROPIC_API_KEY || ''
      }
    }
  };
}

function mergeConfig(defaults: any, user: any): Config {
  return {
    ...defaults,
    ...user,
    gateway: { ...defaults.gateway, ...user.gateway },
    channels: {
      qqbot: { ...defaults.channels.qqbot, ...user.channels?.qqbot }
    },
    agent: {
      ...defaults.agent,
      ...user.agent,
      claude: { ...defaults.agent.claude, ...user.agent?.claude }
    },
    storage: { ...defaults.storage, ...user.storage }
  };
}
```

**Step 3: 创建日志工具**

```typescript
// src/utils/logger.ts
import pino from 'pino';

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});
```

**Step 4: 创建默认配置文件**

```json
{
  "gateway": {
    "port": 18789,
    "host": "127.0.0.1"
  },
  "channels": {
    "qqbot": {
      "enabled": true,
      "appId": "YOUR_QQ_BOT_APP_ID",
      "clientSecret": "YOUR_QQ_BOT_SECRET"
    }
  },
  "agent": {
    "claude": {
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 4096,
      "systemPrompt": "你是Claude智能助手，通过QQ与用户交互，帮助用户操作本地电脑完成各种任务。支持执行命令、读写文件、管理目录等操作。"
    },
    "allowedUsers": [],
    "sandboxMode": true
  },
  "storage": {
    "downloadPath": "./downloads",
    "uploadPath": "./uploads"
  }
}
```

**Step 5: Commit**

```bash
git add src/config/ src/utils/ config/
git commit -m "feat: add configuration and utility modules"
```

---

## Task 6: 文件传输模块

**Files:**
- Create: `src/transfer/uploader.ts`
- Create: `src/transfer/downloader.ts`
- Create: `src/transfer/storage.ts`

**Step 1: 创建存储管理**

```typescript
// src/transfer/storage.ts
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export class StorageManager {
  constructor(
    private downloadPath: string,
    private uploadPath: string
  ) {
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.downloadPath)) {
      mkdirSync(this.downloadPath, { recursive: true });
    }
    if (!existsSync(this.uploadPath)) {
      mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  getDownloadPath(filename: string): string {
    return join(this.downloadPath, filename);
  }

  getUploadPath(filename: string): string {
    return join(this.uploadPath, filename);
  }
}
```

**Step 2: 创建下载器**

```typescript
// src/transfer/downloader.ts
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { logger } from '../utils/logger.js';

export class Downloader {
  async download(url: string, outputPath: string): Promise<string> {
    logger.info(`Downloading: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    const fileStream = createWriteStream(outputPath);
    // @ts-ignore
    await pipeline(response.body, fileStream);

    logger.info(`Downloaded to: ${outputPath}`);
    return outputPath;
  }
}
```

**Step 3: 创建上传器（发送到QQ）**

```typescript
// src/transfer/uploader.ts
import { QQBotAPI } from '../channels/qqbot/api.js';
import { logger } from '../utils/logger.js';

export class Uploader {
  constructor(private api: QQBotAPI) {}

  async sendFile(userId: string, filePath: string, message?: string): Promise<void> {
    logger.info(`Sending file to ${userId}: ${filePath}`);

    // QQ Bot API 发送文件
    // 先上传文件获取 URL，再发送消息
    const fileUrl = await this.api.uploadFile(filePath);

    if (message) {
      await this.api.sendC2CMessage(userId, message);
    }

    logger.info(`File sent successfully`);
  }
}
```

**Step 4: Commit**

```bash
git add src/transfer/
git commit -m "feat: add file transfer module"
```

---

## Task 7: 整合与测试

**Step 1: 更新入口文件整合所有模块**

```typescript
// src/index.ts (更新)
import { Gateway } from './gateway/server.js';
import { QQBotChannel } from './channels/qqbot/index.js';
import { ClaudeAgent } from './agent/index.js';
import { StorageManager } from './transfer/storage.js';
import { loadConfig } from './config/index.js';
import { logger } from './utils/logger.js';

async function main() {
  const config = loadConfig();

  logger.info('Starting QQ-Claude-Proxy...');
  logger.info(`Gateway: ${config.gateway.host}:${config.gateway.port}`);

  // 初始化存储
  const storage = new StorageManager(
    config.storage.downloadPath,
    config.storage.uploadPath
  );

  // 初始化 Gateway
  const gateway = new Gateway(config.gateway);

  // 初始化 QQ Bot Channel
  const qqChannel = new QQBotChannel(config.channels.qqbot);

  // 初始化 Claude Agent
  const agent = new ClaudeAgent(config.agent);

  // 启动服务
  await gateway.start();
  await qqChannel.start();

  gateway.registerChannel('qqbot', qqChannel);
  gateway.registerAgent(agent);

  // 优雅退出
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    process.exit(0);
  });

  logger.info('System started successfully!');
  logger.info('Waiting for QQ messages...');
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
```

**Step 2: 添加 npm 脚本**

```json
// package.json 添加
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "test": "tsx src/tests/index.ts"
  },
  "type": "module"
}
```

**Step 3: 创建 .env.example**

```
# QQ Bot 配置
QQ_BOT_APP_ID=your_app_id
QQ_BOT_SECRET=your_client_secret

# Claude API 配置
ANTHROPIC_API_KEY=your_api_key

# 可选：配置文件路径
QQ_CLAUDE_CONFIG=./config.json
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: integrate all modules and add startup scripts"
```

---

## Task 8: 创建 README 文档

**Step 1: 创建 README.md**

```markdown
# QQ-Claude-Proxy

通过 QQ 远程控制本地 Claude Code 的代理系统。

## 功能

- 手机 QQ 发送消息 → Claude 处理 → QQ 接收回复
- 执行本地命令
- 读写本地文件
- 手机-电脑文件互传
- 多轮对话支持

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置

复制配置文件模板：

```bash
cp config/default.json config.json
```

编辑 `config.json` 填入：
- QQ Bot AppID 和 Secret（从 https://q.qq.com 获取）
- Anthropic API Key

或使用环境变量：

```bash
cp .env.example .env
# 编辑 .env 填入配置
```

### 3. 运行

开发模式：
```bash
npm run dev
```

生产模式：
```bash
npm run build
npm start
```

## 使用方式

1. 在 QQ 开放平台创建机器人
2. 配置沙箱用户（添加你的 QQ 号）
3. 用 QQ 扫码添加机器人
4. 发送消息与 Claude 交互

## 支持的命令示例

- "帮我读取 package.json 文件"
- "执行 npm install"
- "创建一个 hello.txt 文件，内容是 Hello World"
- "列出当前目录的文件"

## License

MIT
```

**Step 2: 最终 Commit**

```bash
git add README.md .env.example
git commit -m "docs: add README and environment template"
```

---

## 实施顺序

| 任务 | 依赖 | 预计复杂度 |
|------|------|-----------|
| Task 1: 项目初始化 | - | 低 |
| Task 2: Gateway 核心 | Task 1 | 中 |
| Task 3: QQ Bot Channel | Task 2 | 中 |
| Task 4: Claude Agent | Task 2 | 中 |
| Task 5: 配置模块 | Task 1 | 低 |
| Task 6: 文件传输 | Task 3, 4 | 低 |
| Task 7: 整合测试 | Task 1-6 | 中 |
| Task 8: 文档 | Task 7 | 低 |

**建议并行开发：**
- 组 A: Task 2 (Gateway)
- 组 B: Task 3 (QQ Bot Channel)
- 组 C: Task 4 (Claude Agent)
- 组 D: Task 5 (配置)

然后依次完成 Task 6-8。
