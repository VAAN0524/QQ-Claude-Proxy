# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**QQ-Claude-Proxy** 是通过 QQ 远程控制本地 Claude Code CLI 的代理系统。用户通过手机 QQ 发送消息，消息经过 QQ 开放平台传送到本地服务器，本地服务器调用 `claude` CLI 执行命令，然后将结果返回给 QQ。

## 核心架构

项目采用**三层架构**，通过 WebSocket Gateway 实现组件解耦：

```
QQ Bot → QQ Gateway ──────┐
                          │
                    Internal Gateway (WS, port 18789)
                          │
                          ├──→ Agent (Claude Code CLI)
                          └──→ 可扩展其他 Channel
```

### Gateway 模块 (`src/gateway/`)

Gateway 是核心消息总线，支持两种消息协议：

- **Request/Response**: RPC 风格的方法调用
- **Event**: Pub/Sub 风格的事件发布

关键文件：
- [server.ts](src/gateway/server.ts) - WebSocket 服务器，监听 18789 端口
- [protocol.ts](src/gateway/protocol.ts) - 消息协议定义 (Request, Response, Event)
- [router.ts](src/gateway/router.ts) - 消息路由和方法分发
- [session.ts](src/gateway/session.ts) - WebSocket 会话管理

Gateway 内置方法：
- `ping` - 健康检查
- `session.info` - 获取会话信息
- `channel.subscribe/unsubscribe` - 订阅/取消频道
- `agent.register/unregister` - 注册 Agent
- `gateway.stats` - 获取统计信息

### Channel 模块 (`src/channels/`)

Channel 是外部平台的适配器层。当前只有 QQ Bot 实现：

- [qqbot/gateway.ts](src/channels/qqbot/gateway.ts) - 连接 QQ 开放平台 WebSocket
- [qqbot/api.ts](src/channels/qqbot/api.ts) - QQ Bot HTTP API (发送消息、上传文件)
- [qqbot/index.ts](src/channels/qqbot/index.ts) - Channel 主入口，将 QQ 消息转发到 Gateway

添加新 Channel 的步骤：
1. 在 `src/channels/` 下创建新目录
2. 实现类似 QQ Bot 的接口（WebSocket + HTTP API）
3. 在 Gateway Router 注册事件处理器

### Agent 模块 (`src/agent/`)

Agent 负责与 Claude Code CLI 交互：

- [index.ts](src/agent/index.ts) - Agent 主入口，处理用户消息和权限检查
- [cli-session-manager.ts](src/agent/cli-session-manager.ts) - **关键组件**：管理长期运行的 CLI 会话，使用队列机制确保同一用户的请求串行执行
- [conversation-history.ts](src/agent/conversation-history.ts) - 对话历史备份管理
- [file-storage.ts](src/agent/file-storage.ts) - 文件下载和存储管理

**CLI 会话管理**：每个用户/群组有独立的会话键（`user_{userId}` 或 `group_{groupId}`），同一会话的请求通过 Promise 链串行执行，避免 session ID 冲突。

## 开发命令

```bash
# 开发模式（热重载）
npm run dev

# 编译
npm run build

# 生产运行
npm start

# 类型检查
npm run typecheck

# 测试
npm test              # 运行所有测试
npm run test:watch    # 监视模式
npm run test:coverage # 覆盖率报告
```

## 配置管理

配置加载优先级：`.env` 环境变量 > `config.json` 文件 > `config/default.json` 默认值

关键配置项（[config/schema.ts](src/config/schema.ts)）：

```json
{
  "gateway": { "port": 18789, "host": "127.0.0.1" },
  "channels": {
    "qqbot": {
      "appId": "从 QQ 开放平台获取",
      "clientSecret": "从 QQ 开放平台获取",
      "sandbox": true  // 沙箱模式
    }
  },
  "agent": {
    "allowedUsers": [],  // 用户白名单（OpenID 列表）
    "timeout": 300000
  },
  "storage": {
    "downloadPath": "./workspace",  // Claude 工作目录
    "uploadPath": "./uploads"       // 用户上传文件存储
  }
}
```

环境变量（[.env.example](.env.example)）：
- `QQ_BOT_APP_ID` - QQ Bot AppID
- `QQ_BOT_SECRET` - QQ Bot AppSecret
- `ALLOWED_USERS` - 逗号分隔的 OpenID 列表

## 工作流程

### 消息处理流程

1. QQ 用户发送消息 → QQ 开放平台
2. QQ Gateway 接收 WebSocket 事件
3. QQ Bot Channel 解析消息，调用 `gateway.handleChannelEvent()`
4. Gateway Router 分发到 `qqbot` channel 的 event handler
5. Agent 处理消息：
   - 权限检查（`allowedUsers`）
   - 附件处理（下载到 `uploads/`）
   - 调用 Claude Code CLI
6. Agent 返回响应 → QQ Bot Channel 发送回复

### 文件处理

- **接收文件**：用户发送文件 → 自动下载到 `uploads/` → 路径传给 Claude
- **发送文件**：Claude 生成文件 → 自动检测新文件 → 用户请求"把 xxx 发给我" → 发送回 QQ
- **新文件检测**：扫描最近 2 分钟内修改的文件（[agent/index.ts:416-446](src/agent/index.ts#L416-L446)）

### 会话管理

CLI 使用 `--continue` 参数继续最近的对话，而不是 `--session-id`（避免锁定冲突）。每个用户请求启动新的 CLI 进程，但通过 `--continue` 保持上下文连续性。

## 重要约定

1. **ES Modules**: 项目使用 `"type": "module"`，所有 import 必须包含 `.js` 扩展名
2. **日志**: 使用 `src/utils/logger.ts` 的 pino logger，支持结构化日志
3. **类型安全**: TypeScript 配置较宽松（`strict: false`），但核心类型定义完整
4. **文件路径安全**: 用户输入的文件名必须经过 `sanitizeFileName()` 清理，防止路径穿越攻击
5. **消息分段**: QQ 消息长度限制约 2000 字符，Channel 会自动分段发送长消息

## 扩展开发

### 添加新的 Agent

在 [src/index.ts](src/index.ts#L117) 的 `router.onEvent()` 中添加新的 channel 处理逻辑。

### 添加新的 Channel

1. 创建 `src/channels/{name}/` 目录
2. 实现 Gateway 连接和 HTTP API
3. 在 [src/index.ts](src/index.ts) 中初始化并注册到 Gateway
4. 在 Gateway Router 注册 channel event handler

### 添加新的快捷命令

在 [agent/index.ts](src/agent/index.ts) 中添加新的 `isXxxRequest()` 检测方法和 `handleXxx()` 处理方法。现有命令：
- `列出文件` - 列出工作区和存储区文件
- `把 xxx 文件发给我` - 发送指定文件
- `清空历史` - 清空对话历史
- `新任务` - 创建新任务（重置 CLI 会话）
