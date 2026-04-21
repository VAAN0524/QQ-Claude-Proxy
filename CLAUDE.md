# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**QQ-Claude-Proxy** 是通过 QQ 远程控制本地 Claude Code CLI 的纯代理系统。

**版本**: 2.0.0
**核心特性**:
- 🚀 **纯 CLI 模式** - 直接调用 Claude Code CLI，无中间层
- 💬 **QQ 集成** - 通过 QQ 机器人远程控制
- 📊 **任务调度** - 支持定时任务和周期任务
- 🎛️ **Web 监控** - 实时监控和管理界面

## 核心架构

```
QQ Bot → QQ Gateway → Internal Gateway (WS, port 18789) → ClaudeCodeAgent → Claude Code CLI
```

### Gateway 消息协议

**位置**: `src/gateway/protocol.ts`

Gateway 使用 WebSocket 实现三种消息类型：

| 类型 | 用途 | 结构 |
|------|------|------|
| **Request** | RPC 请求 | `{ type: 'req', id, method, params }` |
| **Response** | RPC 响应 | `{ type: 'res', id, ok, payload?, error? }` |
| **Event** | 发布/订阅事件 | `{ type: 'event', channel, event, data }` |

**Router** (`src/gateway/router.ts`) 负责消息路由：
- `onMethod(method, handler)` - 注册 RPC 方法处理器
- `onEvent(channel, handler)` - 注册事件处理器

## 开发命令

```bash
# 开发模式（热重载）
npm run dev            # Unix/Mac
npm run dev:win        # Windows (设置 UTF-8 编码)

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
npm run test tests/gateway.test.ts  # 运行单个测试文件

# Watchdog (进程守护)
npm run watchdog:start # 注册为系统服务并启动
npm run watchdog:stop  # 停止服务
npm run watchdog:status # 查看状态

# Dashboard CLI
npm run monitor       # 启动终端监控界面
```

## 代码结构导航

```
src/
├── agent/                     # Claude Code CLI 适配器
│   └── ClaudeCodeAgent.ts     # 主要的 Agent 实现
├── gateway/                   # WebSocket 消息网关
│   ├── server.ts              # WebSocket 服务器
│   ├── http-server.ts         # HTTP 服务器（Dashboard）
│   ├── dashboard-api.ts       # Dashboard API 端点
│   ├── protocol.ts            # 消息协议定义
│   └── router.ts              # 消息路由器
├── channels/qqbot/           # QQ Bot Channel
│   ├── client.ts              # QQ Bot 客户端
│   └── message-handler.ts     # 消息处理
├── scheduler/                 # 定时任务调度器
│   ├── task-runner.ts         # 任务执行器
│   └── task-store.ts          # 任务存储
├── config/                    # 配置加载和验证
│   └── schema.ts              # 配置 Schema
└── utils/                     # 工具函数
    └── logger.ts              # 日志工具
```

## 核心组件

### 1. ClaudeCodeAgent (`src/agent/ClaudeCodeAgent.ts`)

负责与本地 Claude Code CLI 通信的核心组件：
- **命令执行**: 调用 `claude` 命令并捕获输出
- **流式响应**: 实时返回 CLI 的输出
- **会话管理**: 维护与 CLI 的持久连接

### 2. Gateway 系统 (`src/gateway/`)

**WebSocket 服务器** (`server.ts`):
- 监听端口 18789
- 处理来自 QQ Bot 的连接
- 消息路由到 ClaudeCodeAgent

**HTTP 服务器** (`http-server.ts`):
- 监听端口 8080
- 提供 Dashboard API
- 静态文件服务

### 3. QQ Bot Channel (`src/channels/qqbot/`)

**客户端** (`client.ts`):
- 连接到 QQ 机器人平台
- 接收和发送消息

**消息处理器** (`message-handler.ts`):
- 解析 QQ 消息
- 转发到 Gateway
- 返回响应到 QQ

### 4. 任务调度器 (`src/scheduler/`)

支持两种任务类型：
- **周期任务**: 按固定间隔重复执行
- **定时任务**: 在指定时间执行一次

**存储**: `data/tasks.json`

**任务格式**:
```json
{
  "id": "unique-id",
  "name": "任务名称",
  "type": "cron|once",
  "schedule": "0 9 * * *",
  "command": "claude 命令",
  "enabled": true
}
```

## 重要文件位置

### 配置文件
- `config.json` - 主配置文件
- `.env` - 环境变量（不要提交到 Git）

### 日志文件
- `logs/app.log` - 应用日志
- `logs/error.log` - 错误日志
- `dev.log` - 开发日志

### 数据目录
- `data/sessions/` - 用户会话持久化
- `workspace/` - Claude Code 工作目录
- `data/tasks.json` - 定时任务存储

## 重要约定

### ES Modules
- 项目使用 `"type": "module"`
- 所有 import 必须包含 `.js` 扩展名
- 动态 import: `await import('./agent/ClaudeCodeAgent.js')`

### TypeScript 编译
- 目标：ES2022, 模块：NodeNext
- 严格模式已关闭 (`strict: false`)
- 输出目录：`dist/`
- 声明文件已启用

### 测试框架
- 使用 **vitest** 作为测试框架
- 测试文件位于 `tests/` 目录
- 支持 v8 覆盖率提供者

### 日志
- 使用 `src/utils/logger.ts` 的 pino logger
- 日志级别：`trace`, `debug`, `info`, `warn`, `error`

### 配置加载
- 优先级：`.env` > `config.json` > `config/default.json`
- 配置 Schema: `src/config/schema.ts`

### 文件路径安全
- 用户输入文件名必须经过 `sanitizeFileName()` 清理
- 防止路径穿越攻击

## Dashboard 功能

访问 **http://localhost:8080**

- **监控** (index.html): 实时任务进度、系统状态
- **Tasks** (tasks.html): 定时任务管理
- **Config** (config.html): 系统配置
- **Logs** (logs.html): 日志查看

## 端口说明

| 端口 | 服务 |
|:----:|------|
| 18789 | Gateway WebSocket (内部通信) |
| 8080 | Dashboard HTTP |

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `QQ_BOT_APP_ID` | QQ 机器人 AppID | 是 |
| `QQ_BOT_SECRET` | QQ 机器人 AppSecret | 是 |
| `ALLOWED_USERS` | 用户白名单 | 否 |
| `ANTHROPIC_API_KEY` | Anthropic API Key | 否 |
| `HTTP_PROXY` / `HTTPS_PROXY` | 代理设置 | 否 |

## 安全铁律

**禁止泄露敏感信息到 Git 仓库**

以下信息**绝对禁止**提交到 Git：
- API Keys (Anthropic, OpenAI, etc.)
- 密钥和密码 (QQ Bot Secret, Access Token, etc.)
- 用户 OpenID 和个人标识信息

**正确做法**：
1. 所有敏感信息放在 `.env` 文件中
2. 代码中使用 `process.env.VARIABLE_NAME` 读取
3. 提交前执行安全检查：
```bash
git ls-files | xargs grep -l "sk-ant-"     # 检查 Anthropic Key
```

## 调试与故障排除

### 日志位置
- 应用日志：`logs/app.log`
- 错误日志：`logs/error.log`
- 开发日志：`dev.log`

### 常见问题

**Claude Code CLI 无法启动**
- 确保已全局安装：`npm install -g @anthropic-ai/claude-code`
- 检查 CLI 版本：`claude --version`

**Gateway 连接失败**
- 检查端口 18789 是否被占用
- 查看日志：`tail -f logs/app.log`

**定时任务不执行**
- 检查 `data/tasks.json` 文件格式
- 确保任务配置的 `command` 使用正确的 claude 命令格式
- 查看调度器日志：`grep -i "scheduler\|task" logs/app.log`

**QQ Bot 无响应**
- 检查 `QQ_BOT_APP_ID` 和 `QQ_BOT_SECRET` 是否正确
- 查看日志：`tail -f logs/app.log | grep qqbot`

### 会话持久化

每个用户/群组的会话独立存储在 `data/sessions/` 目录：
- 用户会话：`user_{userId}.json`
- 群组会话：`group_{groupId}.json`

## 开发技巧

### 调试 Gateway 消息

```bash
# 查看 Gateway 消息日志
tail -f logs/app.log | grep -i "gateway\|message"

# 查看 WebSocket 连接状态
curl http://localhost:8080/api/status
```

### 性能分析

```bash
# 查看响应时间
grep "处理耗时" logs/app.log | tail -20

# 查看内存使用
# 访问 http://localhost:8080 查看实时监控
```

### 测试 Claude Code CLI 集成

```bash
# 直接测试 CLI
claude "你好"

# 查看完整日志
tail -f logs/app.log
```

## 相关文档

- [Gateway 架构文档](docs/gateway-architecture.md)
- [任务调度系统](docs/task-scheduler.md)
- [部署指南](docs/deployment.md)
