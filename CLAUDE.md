# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**QQ-Claude-Proxy** 是通过 QQ 远程控制本地 Claude Code CLI 的代理系统，支持多 Agent 协作、人格设定、分层记忆等高级功能。

## 核心架构

```
QQ Bot → QQ Gateway ──────┐
                          │
                    Internal Gateway (WS, port 18789)
                          │
                          ├──→ SimpleCoordinatorAgent (Simple 模式)
                          │       └──→ 动态技能加载 (SKILL.md)
                          │       └──→ 工具层直接调用 (search/web/shell/file/process)
                          │       └──→ 专业 Agents (按需调用)
                          │
                          └──→ Claude Code CLI (CLI 模式)
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

# 记忆清理
npm run daily-cleanup # 清理过期的记忆条目

# Dashboard CLI
npm run monitor       # 启动终端监控界面
```

## 代码结构导航

```
src/
├── agents/                    # Agent 系统核心
│   ├── base/                 # Agent 基础接口
│   ├── memory/               # 分层记忆 (L0/L1/L2)
│   ├── tools-layer/          # 工具层 (搜索/Shell/文件/进程)
│   ├── SimpleCoordinatorAgent.ts
│   ├── AgentDispatcher.ts
│   └── personas.ts
├── gateway/                   # WebSocket 消息网关
│   ├── server.ts
│   ├── http-server.ts
│   ├── dashboard-api.ts
│   └── protocol.ts
├── channels/qqbot/           # QQ Bot Channel
├── agent/                     # Claude Code CLI 适配器
├── llm/                       # LLM Provider (OpenAI/Anthropic/GLM)
├── scheduler/                 # 定时任务调度器
├── config/                    # 配置加载和验证
└── utils/                     # 工具函数
```

## 双模式架构

项目支持**两种模式**，通过 ModeManager 管理：

| 模式 | 协调器 | 说明 |
|------|--------|------|
| **CLI 模式** | - | 直接调用本地 Claude Code CLI |
| **Simple 模式** | SimpleCoordinatorAgent | 极简协调 Agent + SKILL.md 驱动 + 工具层直接调用 |

**模式切换**: `/mode cli` 或 `/mode simple`（支持中文：`/模式 cli`、`/模式 简单`）

## 核心组件

### 1. SimpleCoordinatorAgent (`src/agents/SimpleCoordinatorAgent.ts`)

核心设计原则：
1. **单一协调者** - 一个 Agent 处理所有任务
2. **动态技能加载** - 通过 SKILL.md 切换身份和技能
3. **简化记忆** - 基于 markdown 文档的记忆系统
4. **直接工具调用** - 通过工具层直接调用功能

### 2. 工具层 (`src/agents/tools-layer/`)

Simple 模式的核心组件，将专业 Agent 功能提取为可调用的工具函数。

**工具分类**:
- **搜索**: `tavily_search`, `smart_search`, `exa_search`, `exa_code_search`
- **视频**: `youtube_search`, `bilibili_search`
- **网页**: `jina_read`, `fetch_web`
- **命令**: `execute_command`
- **文件**: `read_file`, `write_file`, `edit_file`, `apply_patch`
- **进程**: `spawn_process`, `terminate_process`, `list_processes`

**重要**: 所有搜索工具必须在关键词中包含当前年份以获取最新资讯。

### 3. 分层记忆系统 (`src/agents/memory/`)

| 层级 | 容量 | 用途 | 访问范围 |
|------|------|------|----------|
| **L0** | ~100 tokens | 快速检索索引、关键词 | 仅当前 Agent |
| **L1** | ~2000 tokens | 内容导航、关键点 | Agent 间共享 |
| **L2** | 无限 | 完整数据、原始引用 | 全局共享 |

**记忆生命周期**:
| 阶段 | 标签 | 保留时间 | 清理策略 |
|------|------|----------|----------|
| active | 活跃 | 无限期 | 保留 |
| archived | 归档 | 30 天 | 定期检查 |
| expired | 过期 | 7 天 | 自动清理 |

### 4. Agent 调度器 (`src/agents/AgentDispatcher.ts`)

路由优先级：
1. **显式指定**: 前缀如 `/code`, `/browser`, `/shell`, `/claude`
2. **用户偏好**: 记住用户上次选择的 Agent
3. **智能选择**: 基于能力匹配自动选择
4. **默认回退**: Claude Code Agent

### 5. 技能管理

**位置**: `src/agents/SkillLoader.ts`, `src/agents/SkillInstaller.ts`

- **渐进式加载**: 只扫描 SKILL.md 元数据，按需加载完整代码
- **安装源**: 本地、GitHub、GitLab
- **技能索引**: 使用 `.skill-index.json` 缓存加速启动

### 6. LLM Provider (`src/llm/providers.ts`)

统一接口支持多提供商：
- **OpenAI**: GPT-4 系列
- **Anthropic**: Claude 系列
- **GLM**: 智谱 AI GLM-4.7 (支持 Coding Plan API)

**代理支持**: 自动读取环境变量 `HTTP_PROXY` / `HTTPS_PROXY`

### 7. 定时任务调度器 (`src/scheduler/`)

支持两种任务类型：
- **周期任务**: 按固定间隔重复执行
- **定时任务**: 在指定时间执行一次

**存储**: `data/tasks.json`

## 重要约定

### ES Modules
- 项目使用 `"type": "module"`
- 所有 import 必须包含 `.js` 扩展名
- 动态 import: `await import('./agents/CodeAgent.js')`

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
- 模式存储：`data/mode.json`

### 文件路径安全
- 用户输入文件名必须经过 `sanitizeFileName()` 清理
- 防止路径穿越攻击

## 添加新组件

### 添加新 Agent

1. 创建 `src/agents/NewAgent.ts`，实现 `IAgent` 接口 (`src/agents/base/Agent.ts`)
   - 必须实现：`id`, `name`, `description`, `capabilities`, `config`, `process()`
   - 可选实现：`canHandle()`, `initialize()`, `cleanup()`, `getPersona()`, `applyPersonaStyle()`

2. 在 `src/agents/index.ts` 中导出新 Agent

3. 在 `src/index.ts` 的 Agent 注册部分添加初始化代码

4. 在 `src/agents/personas.ts` 中添加人格设定

### 添加新工具

工具层位于 `src/agents/tools-layer/`，按分类组织：

1. 在对应分类文件中添加工具函数（如 `search-tools.ts`）
2. 在 `index.ts` 的 `ToolManager.registerBuiltinTools()` 中注册：
```typescript
this.register({
  name: 'your_tool',
  description: '工具描述',
  category: 'search', // 或 web, shell, file, process
  execute: async (params) => {
    // 工具实现
  },
});
```

### 添加新技能

1. 在 `skills/` 目录创建技能文件夹
2. 创建 `SKILL.md` 元数据文件（YAML frontmatter 格式）
3. 通过 Dashboard 或 QQ 命令安装

## Dashboard 功能

访问 **http://localhost:8080**

- **监控** (index.html): 实时任务进度、工具状态
- **Agents** (agents.html): Agent 管理、状态查看
- **Skills** (skills.html): 技能管理（安装/卸载/启用/禁用）
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
| `GLM_API_KEY` | GLM API Key（Simple 模式） | 否 |
| `ANTHROPIC_API_KEY` | Anthropic API Key | 否 |
| `TAVILY_API_KEY` | Tavily Search API Key | 否 |
| `HTTP_PROXY` / `HTTPS_PROXY` | 代理设置 | 否 |
| `AGENT_REACH_*` | Agent Reach 配置 | 否 |

## 安全铁律

**禁止泄露敏感信息到 Git 仓库**

以下信息**绝对禁止**提交到 Git：
- API Keys (Tavily, GLM, Anthropic, OpenAI, etc.)
- 密钥和密码 (QQ Bot Secret, Access Token, etc.)
- 用户 OpenID 和个人标识信息

**正确做法**：
1. 所有敏感信息放在 `.env` 文件中
2. 代码中使用 `process.env.VARIABLE_NAME` 读取
3. 提交前执行安全检查：
```bash
git ls-files | xargs grep -l "tvly-"      # 检查 Tavily Key
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

**Simple 模式无响应**
- 检查 `GLM_API_KEY` 是否配置且有效
- 检查网络连接到 GLM API 端点

**Agent Reach 搜索失败**
- 确保已安装 `mcporter`: `npm install -g mcporter`
- 确保已安装 `yt-dlp`: `pip install yt-dlp`

### 会话持久化

每个用户/群组的会话独立存储在 `data/sessions/` 目录：
- 用户会话：`user_{userId}.json`
- 群组会话：`group_{groupId}.json`
