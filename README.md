# QQ-Claude-Proxy

<div align="center">

![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen.svg)

### [本地 Claude Code] + [QQ 远程控制] = 你的移动 AI 工作站

通过手机 QQ 远程控制本地安装的 Claude Code CLI，让 AI 助手随身边随行。

**核心差异**: 与其他云端 AI 平台不同，本项目运行的是**你本地安装的 Claude Code CLI**，

## 🔄 双模式切换

系统支持 **两种 Agent 模式** 自由切换：

### CLI 模式
```
/mode cli
```
- 直接调用本地 Claude Code CLI
- 强大的代码分析和执行能力
- 完整访问文件系统
- 支持所有自定义 Skills 和 MCP 插件

### 团队模式
```
/mode team
```
- GLM-4.7 主协调 Agent 智能分配任务
- 5 个专业 Agent 协作工作：
  - **Code Agent** - 代码编写与分析
  - **Browser Agent** - 网页操作与截图
  - **Shell Agent** - 命令执行
  - **WebSearch Agent** - 网络搜索
  - **DataAgent** - 数据分析
- 分层记忆系统 (L0/L1/L2)

这意味着：

*   所有指令、工具和配置都沿用自己的 Claude Code 设置
*   支持你自定义的所有 Skills 和 MCP 插件
*   完全本地执行，无需上传代码到云端
*   一次安装，终身使用，不受云端服务限制

[快速开始](#快速开始) | [功能特性](#功能特性) | [配置说明](#配置说明) | [使用指南](#使用指南)

</div>

---

## 📸 演示截图

### QQ 端实时交互

<table>
<tr>
<td width="33%"><img src="screenshots/IMG_2582.PNG" alt="视频传输"></td>
<td width="33%"><img src="screenshots/IMG_2583.PNG" alt="图片传输"></td>
<td width="33%"><img src="screenshots/IMG_2584.PNG" alt="工具实时状态"></td>
</tr>
<tr>
<td align="center">视频传输</td>
<td align="center">图片传输</td>
<td align="center">工具实时状态</td>
</tr>
</table>

---

## 📊 项目统计

| 分类 | 文件数 | 代码行数 |
|------|-------|---------|
| **后端** (TypeScript) | 56 | 20,630 |
| **前端** (HTML/CSS/JS) | 3 | 3,178 |
| **配置** (JSON) | 8 | 6,791 |
| **总计** | 67 | 30,599 |

💡 **估算有效代码**: 约 20,000+ 行（排除空行和注释）

---

## 功能特性

### 核心

*   **[双模式切换](#-双模式切换)** - CLI 模式与团队模式自由切换，满足不同场景需求
*   **[QQ Bot 集成](#qq-bot-集成)** - 通过手机 QQ 发送消息与 Claude Code CLI 交互
*   **本地 CLI 执行** - 直接运行电脑端的 `claude` 命令行工具，使用你自己的配置和插件
*   **文件双向传输** - 手机 QQ 与电脑互传文件，自动处理图片和文档

### 监控

*   **Web Dashboard** - 精美的 Web 界面 (http://localhost:8080) 实时监控任务状态
*   **实时进度跟踪** - VS Code 风格的任务进度展示，支持工具使用实时显示
*   **定时任务调度** - 支持周期任务和定时任务，QQ 通知执行结果
*   **Agent 协作系统** - 多 Agent 协作执行复杂任务（代码、浏览器、Shell、搜索等）
*   **分层记忆系统** - L0/L1/L2 三层记忆架构，支持跨会话上下文恢复

### 高级功能

*   **技能管理** - 通过 QQ 安装、卸载、搜索技能，支持从 GitHub/GitLab 安装
*   **会话持久化** - 服务重启后自动恢复对话状态
*   **视觉理解** - 图像分析和理解能力
*   **MCP 协议** - 支持 Model Context Protocol 扩展

### 运维

*   **自动重启** - 支持通过 Dashboard 一键重启服务
*   **端口自动清理** - 启动时自动清理被占用的端口
*   **状态持久化** - 自动保存和恢复任务状态
*   **权限控制** - 支持用户白名单限制访问

---

## 快速开始

### 1. 安装依赖

```bash
git clone https://github.com/VAAN0524/QQ-Claude-Proxy.git
cd QQ-Claude-Proxy
npm install
```

### 2. 安装 Claude Code CLI

**这是本项目的核心依赖**，必须先安装并登录：

```bash
# 全局安装 Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 登录你的 Anthropic 账户
claude
```

> **注意**: Claude Code CLI 使用你本地安装的配置，包括：
> - `~/.claude/` 下的自定义 Skills
> - `~/.claude/` 下的 MCP 插件配置
> - 你个人的 API Key 和使用配额

### 3. 配置 QQ Bot

1. 访问 [QQ 开放平台](https://q.qq.com/) 注册开发者账号
2. 创建机器人应用，获取 **AppID** 和 **AppSecret**
3. 配置沙箱用户（添加你的 QQ 号）
4. 用手机 QQ 扫码添加机器人

复制环境变量模板并编辑：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# QQ Bot 配置 (从 QQ 开放平台获取)
QQ_BOT_APP_ID=your_app_id
QQ_BOT_SECRET=your_app_secret

# 可选：用户白名单 (逗号分隔的 OpenID)
# ALLOWED_USERS=
```

### 4. 运行服务

**开发模式** (支持热重载):

```bash
npm run dev
```

**生产模式**:

```bash
npm run build
npm start
```

**Windows 快捷启动**:

```batch
quick-start.bat
```

### 5. 访问 Dashboard

打开浏览器访问: **http://localhost:8080**

---

## 配置说明

### 环境变量 (.env)

| 变量 | 说明 | 必需 |
|------|------|------|
| `QQ_BOT_APP_ID` | QQ 机器人 AppID | 是 |
| `QQ_BOT_SECRET` | QQ 机器人 AppSecret | 是 |
| `ALLOWED_USERS` | 用户白名单 (逗号分隔的 OpenID) | 否 |

### 配置文件 (config.json)

```json
{
  "gateway": {
    "port": 18789,
    "host": "127.0.0.1"
  },
  "channels": {
    "qqbot": {
      "enabled": true,
      "appId": "",
      "clientSecret": "",
      "sandbox": true
    }
  },
  "agent": {
    "allowedUsers": [],
    "timeout": 300000
  },
  "storage": {
    "downloadPath": "./workspace",
    "uploadPath": "./uploads"
  },
  "scheduler": {
    "enabled": true,
    "storagePath": "./scheduler-data",
    "resultDir": "./scheduler-results"
  }
}
```

---

## 使用指南

### 模式切换

通过 QQ 发送命令切换模式：

```
/mode cli      # 切换到 CLI 模式
/mode team     # 切换到团队模式
/模式 cli      # 中文命令
/模式 团队     # 中文命令
```

**模式对比**:

| 特性 | CLI 模式 | 团队模式 |
|------|---------|---------|
| 执行引擎 | Claude Code CLI | GLM-4.7 Coordinator |
| 代码能力 | ★★★★★ | ★★★★☆ |
| 网页操作 | 依赖 MCP 插件 | 内置 Browser Agent |
| 网络搜索 | 依赖 MCP 插件 | 内置 WebSearch Agent |
| 记忆系统 | CLI 自带 | L0/L1/L2 分层记忆 |
| 技能扩展 | 全部 Skills | 内置技能 + MCP |
| 适用场景 | 复杂代码任务 | 多步骤协作任务 |

### QQ 消息交互

通过手机 QQ，你可以：

*   **对话交互**: 直接发送消息与 Claude 对话
*   **发送图片**: 发送图片，Claude 会保存到工作区并读取
*   **发送文件**: 发送文件，Claude 会自动处理
*   **请求文件**: 让 Claude 生成文件并发送给你

**示例命令**:

```
帮我读取 package.json 文件
创建一个 hello.txt 文件，内容是 Hello World
分析这张图片 (附上图片)
把刚才生成的代码发给我
列出文件
清空历史
新任务
```

### Dashboard 功能

访问 **http://localhost:8080** 可以:

*   **实时监控**: 查看运行中的任务和进度
*   **定时任务**: 创建和管理周期/定时任务
*   **系统设置**: 修改配置并重启服务
*   **任务历史**: 查看已完成任务的历史记录

### 定时任务

支持两种类型的定时任务:

1.  **周期任务**: 按固定间隔重复执行 (如每天、每小时)
2.  **定时任务**: 在指定时间执行一次

**创建方式**:
*   通过 Dashboard 界面创建
*   直接编辑 `scheduler-data/tasks.json`

---

## 项目架构

### 系统架构图

```mermaid
flowchart TD
    User[📱 QQ 用户] -->|消息/文件| QQ[QQ 开放平台]
    QQ -->|WebSocket 事件| Channel[QQ Bot Channel]
    Channel -->|事件转发| Gateway[Internal Gateway<br/>Port: 18789]

    Gateway -->|消息分发| Agent[Agent 处理器]
    Gateway -->|API 请求| Dashboard[Web Dashboard<br/>Port: 8080]

    Agent -->|执行命令| CLI[本地 Claude Code CLI]
    CLI -->|返回结果| Agent

    Agent -->|发送回调| FileStore[文件存储管理]
    Agent -->|进度更新| Progress[实时进度跟踪]
    Progress -->|推送消息| Channel

    Agent -->|定时任务| Scheduler[任务调度器]
    Scheduler -->|触发执行| CLI
    Scheduler -->|QQ 通知| Channel

    subgraph 存储层
        Workspace[./workspace<br/>工作目录]
        Uploads[./uploads<br/>上传文件]
        State[./scheduler-data<br/>状态持久化]
    end

    FileStore --> Workspace
    FileStore --> Uploads
    Scheduler --> State
```

### 数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                         QQ 消息处理流程                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ① 用户发送消息/文件                                                  │
│        ↓                                                             │
│  ② QQ Bot Channel 接收事件                                          │
│        ↓                                                             │
│  ③ Gateway 路由分发                                                 │
│        ↓                                                             │
│  ④ Agent 处理:                                                       │
│      - 权限检查 (allowedUsers)                                       │
│      - 文件下载 → uploads/                                           │
│      - 调用 Claude Code CLI                                          │
│        ↓                                                             │
│  ⑤ Claude 执行 (本地)                                                │
│      - 读取 workspace/ 文件                                          │
│      - 执行命令/工具                                                  │
│      - 生成新文件                                                     │
│        ↓                                                             │
│  ⑥ Agent 返回响应                                                    │
│      - 文件自动发送                                                   │
│      - 进度实时推送                                                   │
│        ↓                                                             │
│  ⑦ QQ Bot Channel 发送回用户                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 核心模块

```
QQ-Claude-Proxy/
├── 📂 src/                          # 源代码
│   ├── index.ts                     # 🔷 主入口
│   │
│   ├── 📂 gateway/                  # 🔶 WebSocket 消息网关
│   │   ├── server.ts                #    WS 服务器 (Port: 18789)
│   │   ├── protocol.ts              #    消息协议定义
│   │   ├── router.ts                #    消息路由分发
│   │   ├── session.ts               #    会话管理
│   │   ├── http-server.ts           #    HTTP 服务器 (Port: 8080)
│   │   ├── dashboard-api.ts         #    Dashboard REST API
│   │   └── dashboard-state-store.ts #    状态持久化
│   │
│   ├── 📂 channels/                 # 🔵 渠道适配器
│   │   └── qqbot/                   #    QQ Bot 适配器
│   │       ├── gateway.ts           #       QQ Gateway WebSocket
│   │       ├── api.ts               #       QQ HTTP API
│   │       ├── types.ts             #       类型定义
│   │       └── index.ts             #       主入口
│   │
│   ├── 📂 agent/                    # 🟢 Claude Code Agent
│   │   ├── index.ts                 #    Agent 主入口
│   │   ├── cli-session-manager.ts  #    CLI 会话管理 (队列化)
│   │   ├── progress-tracker.ts     #    实时进度跟踪
│   │   ├── file-storage.ts         #    文件下载/存储
│   │   ├── conversation-history.ts #    对话历史备份
│   │   └── tools.ts                 #    工具定义
│   │
│   ├── 📂 scheduler/                # 🟡 定时任务调度器
│   │   ├── scheduler.ts             #    调度器核心
│   │   ├── task-store.ts            #    任务存储
│   │   ├── task-runner.ts           #    任务执行器
│   │   └── types.ts                 #    类型定义
│   │
│   ├── 📂 config/                   # ⚙️ 配置管理
│   │   ├── index.ts                 #    配置加载器
│   │   └── schema.ts                #    配置 Schema
│   │
│   └── 📂 utils/                    # 🔧 工具函数
│       └── logger.ts                #    结构化日志
│
├── 📂 public/dashboard/              # 🌐 Dashboard 前端
│   ├── index.html                   #    主页面
│   ├── styles.css                   #    样式文件
│   └── app.js                       #    前端逻辑
│
├── 📂 workspace/                     # 📁 Claude 工作目录
├── 📂 uploads/                       # 📎 用户上传文件存储
│
├── start.bat                        # 🚀 启动脚本
├── quick-start.bat                  # ⚡ 快速启动
├── .env.example                     # 🔐 环境变量模板
└── README.md                        # 📖 项目文档
```

### 端口说明

| 端口 | 服务 | 说明 |
|:----:|------|------|
| 18789 | Gateway WebSocket | 内部消息总线，组件间通信 |
| 8080 | Dashboard HTTP | Web 管理界面 |

---

## 与其他平台的差异

| 特性 | QQ-Claude-Proxy | 云端 AI 平台 |
|------|----------------|-------------|
| **执行环境** | 本地 Claude Code CLI | 云端服务器 |
| **配置管理** | 沿用你自己的配置 | 平台预设配置 |
| **自定义 Skills** | 支持所有本地 Skills | 受限或不可用 |
| **MCP 插件** | 支持所有本地插件 | 受限或不可用 |
| **代码安全** | 完全本地执行 | 需上传到云端 |
| **使用成本** | 使用你自己的 API 配额 | 平台收费或受限 |
| **网络要求** | 仅 QQ 消息需要网络 | 完全依赖网络 |

---

## 安全注意事项

1.  **不要泄露凭证** - AppSecret 需要妥善保管，不要提交到 Git
2.  **设置用户白名单** - 限制谁可以使用你的机器人
3.  **Claude CLI 认证** - Claude CLI 使用本地认证，无需在代码中存储 API Key
4.  **定期审查日志** - 监控机器人的活动
5.  **端口安全** - Gateway 默认只监听 127.0.0.1，不对外暴露

---

## 常见问题

### Q: Claude Code CLI 没有安装会怎样?

A: 启动时会显示警告，但服务可以运行。当收到消息时会报错。

### Q: 如何获取 QQ 用户的 OpenID?

A: 用户首次发送消息后，可以在日志中看到其 OpenID。

### Q: 支持群聊吗?

A: 支持！机器人可以在私聊和群聊中使用。

### Q: 如何查看实时日志?

A: 服务运行时会输出结构化日志，包含任务进度和工具使用信息。

### Q: 定时任务失败会重试吗?

A: 周期任务默认会在失败后继续执行，可通过配置修改。

---

## 开发命令

```bash
# 开发模式 (热重载)
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

---

## 更新日志

### v1.2.0 (2026-02-23)

#### 新增功能

- **分层记忆系统** (`src/agents/memory/`)
  - L0/L1/L2 三层记忆架构
  - 跨 Agent 记忆共享
  - 自动记忆清理

- **技能管理系统**
  - 通过 QQ 安装/卸载技能
  - 支持 GitHub/GitLab URL 安装
  - 技能元数据按需加载

- **会话持久化** (`docs/session-persistence.md`)
  - SessionManager 多会话管理
  - 服务重启后自动恢复

- **新增 Agents**
  - `VisionAgent`: 图像理解
  - `CodeRefactorAgent`: 代码重构

- **MCP 客户端** (`ZaiMcpClient.ts`)

#### 文档更新

- 新增 [AGENTS.md](docs/AGENTS.md) - 多 Agent 系统完整文档
- 新增 [SKILLS.md](docs/SKILLS.md) - 技能管理指南
- 新增 [session-persistence.md](docs/session-persistence.md) - 会话持久化说明

#### 项目清理

- 删除测试脚本和临时文件
- 清理运行时日志和测试数据

### v1.1.0 (2026-02-22)

#### 新增功能

- **Agent 协作系统** (`src/agents/`)
  - `CoordinatorAgent`: 智能任务协调器，自动分配子任务
  - `GLMCoordinatorAgent`: 基于 GLM-4.7 的高性能协调器
  - `CodeAgent`: 代码分析和生成 Agent
  - `BrowserAgent`: 浏览器自动化 Agent
  - `ShellAgent`: 命令行执行 Agent
  - `WebSearchAgent`: 网页搜索 Agent
  - `DataAnalysisAgent`: 数据分析 Agent

- **定时任务增强**
  - 修复 CLI 非交互模式执行问题 (`-p` 参数)
  - 修复环境变量污染 (CLAUDECODE/VSCODE_*)
  - 修复间隔计算错误
  - 优化 QQ 通知目标验证
  - 周期间隔人性化显示

#### Bug 修复

- 修复 CLI 嵌套会话检测导致的任务失败
- 修复周期任务执行后无 QQ 通知的问题
- 修复 Dashboard 缓存导致的配置更新不生效
- 修复 TaskStore 不支持热重载的问题

#### 配置更新

- 更新 `.gitignore` 排除敏感文件和测试数据
- 更新 `.env.example` 添加 Agent 系统配置项

### v1.0.0 (2026-02-20)

#### 初始版本

- QQ Bot 集成
- Web Dashboard
- 定时任务调度
- 实时进度跟踪
- 文件双向传输

---

## 许可证

MIT License

---

## 相关链接

*   [Claude Code CLI 官方文档](https://docs.anthropic.com/en/docs/claude-code)
*   [QQ 开放平台](https://q.qq.com/)
*   [GitHub 仓库](https://github.com/VAAN0524/QQ-Claude-Proxy)

---

<div align="center">

**Made with [Heart] by VAAN**

[GitHub](https://github.com/VAAN0524) | [Issues](https://github.com/VAAN0524/QQ-Claude-Proxy/issues) | [Star ⭐](https://github.com/VAAN0524/QQ-Claude-Proxy)

</div>
