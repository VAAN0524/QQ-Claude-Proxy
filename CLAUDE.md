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
                          ├──→ SimpleCoordinatorAgent (Simple模式)
                          │       └──→ 动态技能加载 (SKILL.md)
                          │       └──→ 专业 Agents (按需调用)
                          │
                          └──→ Claude Code CLI (CLI模式)
```

### Gateway 消息协议

**位置**: [src/gateway/protocol.ts](src/gateway/protocol.ts)

Gateway 使用 WebSocket 实现三种消息类型：

| 类型 | 用途 | 结构 |
|------|------|------|
| **Request** | RPC 请求 | `{ type: 'req', id, method, params }` |
| **Response** | RPC 响应 | `{ type: 'res', id, ok, payload?, error? }` |
| **Event** | 发布/订阅事件 | `{ type: 'event', channel, event, data }` |

**Router** ([src/gateway/router.ts](src/gateway/router.ts)) 负责消息路由：
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

# Watchdog (进程守护)
npm run watchdog      # 启动 watchdog
npm run watchdog:start # 注册为系统服务并启动
npm run watchdog:stop  # 停止服务
npm run watchdog:status # 查看状态

# 记忆清理
npm run daily-cleanup # 清理过期的记忆条目

# Dashboard CLI
npm run monitor       # 启动终端监控界面
```

## Agent 系统（核心）

### 双模式架构

项目支持**两种模式**，通过 ModeManager 管理：

| 模式 | 协调器 | 说明 |
|------|--------|------|
| **CLI 模式** | - | 直接调用本地 Claude Code CLI |
| **Simple 模式** | SimpleCoordinatorAgent | 极简协调 Agent + SKILL.md 驱动 |

**模式切换**: `/mode cli` 或 `/mode simple`（支持中文：`/模式 cli`、`/模式 简单`）

### SimpleCoordinatorAgent 设计理念

**位置**: [src/agents/SimpleCoordinatorAgent.ts](src/agents/SimpleCoordinatorAgent.ts)

核心设计原则：
1. **单一协调者** - 一个 Agent 处理所有任务
2. **动态技能加载** - 通过 SKILL.md 切换身份和技能
3. **简化记忆** - 基于 markdown 文档的记忆系统
4. **规则引擎** - 通过 markdown 文档定义规则
5. **直接工具调用** - 不经过 ReAct，直接调用工具

### Agent 人格设定系统

**位置**: [src/agents/personas.ts](src/agents/personas.ts)

每个 Agent 都有人格设定，包含：
- **角色定位**: Agent 的身份和职责
- **核心职责**: 具体负责什么
- **性格特点**: 行为风格（简洁/详细/友好/专业）
- **工作原则**: 决策准则
- **协作方式**: 与其他 Agent 配合

**应用方案**：
1. **System Prompt 注入**: 将人格设定转换为 LLM System Prompt
2. **基类扩展**: PersonaAgent 提供人格默认实现
3. **通信风格**: Agent 间通信时传递人格标签

### 已注册 Agents

| Agent ID | 名称 | 能力 |
|----------|------|------|
| `simple-coordinator` | 极简协调器 | 技能驱动、直接执行、通用任务 |
| `claude` | Claude Code Agent | 调用本地 Claude Code CLI |
| `browser` | 浏览器自动化 | Browser, Automation, Testing |
| `shell` | 命令行专家 | Shell, System, File |
| `websearch` | 网络搜索 | Web, Search, DuckDuckGo |
| `tavily-search` | 深度搜索分析师 | Deep Research, Vertical Search |
| `data` | 数据分析专家 | Analysis, Data, Statistics |
| `vision` | 视觉理解专家 | Vision, OCR, Image Analysis (MCP) |
| `code` | 代码专家 | Code, Analyze, Refactoring |
| `refactor` | 代码重构专家 | Code, Refactoring, Quality |
| `skill-manager` | 技能管理员 | Skill Management, Installation |

**查看人格设定**: `node scripts/list-agents.ts`

### Agent 调度器

**位置**: [src/agents/AgentDispatcher.ts](src/agents/AgentDispatcher.ts)

路由优先级：
1. **显式指定**: 前缀如 `/code`, `/browser`, `/shell`, `/claude`
2. **用户偏好**: 记住用户上次选择的 Agent
3. **智能选择**: 基于能力匹配自动选择
4. **默认回退**: Claude Code Agent

## 分层记忆系统

**位置**: [src/agents/memory/](src/agents/memory/)

### OpenViking 风格三层架构

| 层级 | 容量 | 用途 | 访问范围 |
|------|------|------|----------|
| **L0** | ~100 tokens | 快速检索索引、关键词 | 仅当前 Agent |
| **L1** | ~2000 tokens | 内容导航、关键点 | Agent 间共享 |
| **L2** | 无限 | 完整数据、原始引用 | 全局共享 |

**配置**: 在 `src/index.ts` 中初始化 `HierarchicalMemoryService`

**定期归档**:
- L0/L1: 自动清理过期记忆
- L2: 持久化存储，长期保留

## 技能管理系统

**位置**: [src/agents/SkillLoader.ts](src/agents/SkillLoader.ts), [src/agents/SkillInstaller.ts](src/agents/SkillInstaller.ts)

- **渐进式加载**: 只扫描 SKILL.md 元数据，按需加载完整代码
- **安装源**: 本地、GitHub、GitLab
- **管理接口**: SkillManagerAgent 提供安装/卸载/搜索/启用/禁用

**技能目录**: `skills/` 包含 30+ 技能，按功能分类：
- `code/` - 代码相关
- `git-*/` - Git 工作流
- `docker-*/` - Docker 相关
- `network-solutions/` - 网络解决方案
- `run_*_agent/` - 各 Agent 运行技能

## LLM Provider 系统

**位置**: [src/llm/providers.ts](src/llm/providers.ts)

统一接口支持多提供商：
- **OpenAI**: GPT-4 系列
- **Anthropic**: Claude 系列
- **GLM**: 智谱 AI GLM-4.7 (支持 Coding Plan API)

**代理支持**: 自动读取环境变量 `HTTP_PROXY` / `HTTPS_PROXY`

## 定时任务调度器

**位置**: [src/scheduler/](src/scheduler/)

支持两种任务类型：
- **周期任务**: 按固定间隔重复执行（秒/分钟/小时/天）
- **定时任务**: 在指定时间执行一次

**存储**: `data/tasks.json`

**管理方式**:
- QQ 对话命令: `列出任务`, `创建任务`, `删除任务A`, `暂停任务A`
- Dashboard: http://localhost:8080/tasks.html

## 重要约定

### ES Modules
- 项目使用 `"type": "module"`
- 所有 import 必须包含 `.js` 扩展名
- 动态 import: `await import('./agents/CodeAgent.js')`

### 日志
- 使用 `src/utils/logger.ts` 的 pino logger
- 结构化日志：`logger.info({ context }, 'message')`
- 日志级别：`trace`, `debug`, `info`, `warn`, `error`

### 配置加载
- 优先级: `.env` > `config.json` > `config/default.json`
- 配置 Schema: [src/config/schema.ts](src/config/schema.ts)
- 模式存储: `data/mode.json`

### 文件路径安全
- 用户输入文件名必须经过 `sanitizeFileName()` 清理
- 防止路径穿越攻击

## 扩展开发

### 添加新 Agent

1. 创建 `src/agents/NewAgent.ts`，实现 `IAgent` 接口 ([src/agents/base/Agent.ts](src/agents/base/Agent.ts))
   - 必须实现: `id`, `name`, `description`, `capabilities`, `config`, `process()`
   - 可选实现: `canHandle()`, `initialize()`, `cleanup()`, `getPersona()`, `applyPersonaStyle()`

2. 在 `src/agents/index.ts` 中导出新 Agent

3. 在 `src/index.ts` 的 Agent 注册部分添加初始化代码

4. 在 `src/agents/personas.ts` 中添加人格设定（包含：角色定位、核心职责、性格特点、工作原则、协作方式）

### 添加新技能

1. 在 `skills/` 目录创建技能文件夹
2. 创建 `SKILL.md` 元数据文件：
   ```markdown
   # 技能名称

   ## description
   技能描述

   ## systemPrompt
   系统提示词

   ## rules
   - 规则1
   - 规则2

   ## examples
   ### input
   用户输入示例
   ### output
   期望输出示例
   ```
3. 通过 Dashboard 或 QQ 命令安装

## 目录结构

```
QQ-Claude-Proxy/
├── src/
│   ├── agents/                 # 多 Agent 系统
│   │   ├── base/              # Agent 基础接口 (IAgent, PersonaAgent)
│   │   ├── memory/            # 分层记忆系统 (L0/L1/L2 OpenViking风格)
│   │   ├── learning/          # 自主学习模块
│   │   ├── tools/             # Agent 工具 (agent/file/learning/network)
│   │   └── *.ts               # 各个 Agent 实现
│   ├── agent/                 # Claude Code CLI 适配器
│   │   ├── claude-cli.ts      # CLI 进程管理
│   │   ├── cli-session-manager.ts  # 会话管理
│   │   └── *.ts
│   ├── gateway/               # 内部 Gateway (WS port 18789)
│   │   ├── protocol.ts        # 消息协议 (Request/Response/Event)
│   │   ├── router.ts          # 消息路由器
│   │   ├── server.ts          # WebSocket 服务器
│   │   └── dashboard-api.ts   # Dashboard API
│   ├── channels/              # 外部渠道适配器
│   │   └── qqbot/             # QQ Bot Channel
│   ├── llm/                   # LLM Provider 统一接口
│   ├── scheduler/             # 定时任务调度器
│   ├── utils/                 # 工具函数
│   ├── config/                # 配置管理
│   ├── skills/                # 技能系统
│   └── index.ts               # 主入口
├── public/                    # 静态文件
│   └── dashboard/             # Web Dashboard 前端
├── skills/                    # 技能目录 (30+ 技能)
├── scripts/                   # 实用脚本
├── workspace/                 # Claude Code 工作目录
├── uploads/                   # 文件上传存储
├── data/                      # 数据存储 (mode.json, sessions/, tasks.json)
└── logs/                      # 日志文件
```

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
| `GLM_BASE_URL` | GLM API 地址（可选，默认使用 coding plan） | 否 |
| `ANTHROPIC_API_KEY` | Anthropic API Key | 否 |
| `TAVILY_API_KEY` | Tavily Search API Key | 否 |
| `HTTP_PROXY` / `HTTPS_PROXY` | 代理设置 | 否 |

## 调试与故障排除

### 日志位置

- 应用日志: `logs/app.log`
- 错误日志: `logs/error.log`
- 开发日志: `dev.log` (npm run dev 输出)

### 调试模式

日志级别在 `src/utils/logger.ts` 中配置，支持：
- `trace`: 最详细
- `debug`: 调试信息
- `info`: 一般信息（默认）
- `warn`: 警告
- `error`: 错误

### 常见问题

**问题**: Claude Code CLI 无法启动
- 确保已全局安装: `npm install -g @anthropic-ai/claude-code`
- 运行 `claude` 命令进行登录认证

**问题**: QQ Bot 无法连接
- 检查 `QQ_BOT_APP_ID` 和 `QQ_BOT_SECRET` 是否正确
- 确保已在 QQ 开放平台配置沙箱用户

**问题**: Simple 模式无响应
- 检查 `GLM_API_KEY` 是否配置
- 验证 API Key 是否有效
- 检查网络连接到 GLM API 端点

### 会话持久化

每个用户/群组的会话独立存储在 `data/sessions/` 目录：
- 用户会话: `user_{userId}.json`
- 群组会话: `group_{groupId}.json`
