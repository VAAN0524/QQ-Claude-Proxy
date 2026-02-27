# 🤖 QQ-Claude-Proxy

<div align="center">

![Version](https://img.shields.io/badge/version-1.6.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen.svg)
![Code](https://img.shields.io/badge/code-31.8k%20lines-orange.svg)

---

## 📱 通过手机 QQ 控制 本地 Claude Code CLI

### 不受时间和地点限制，随时随地使用你的 AI 编程助手

</div>

---

## ✨ 核心特性

### 🎯 与众不同之处

| 特性 | QQ-Claude-Proxy | 云端 AI 平台 |
|------|:----------------:|:-------------:|
| **执行环境** | 🏠 **本地运行 Claude Code CLI** | ☁️ 云端服务器 |
| **数据安全** | 🔒 **代码保留在本地** | ⚠️ 需上传到云端 |
| **配置继承** | ✅ **使用你自己的配置** | ❌ 平台预设配置 |
| **扩展能力** | 🧩 **支持本地 Skills/MCP** | ❌ 受限或不可用 |
| **使用成本** | 💰 **使用你自己的 API 配额** | 💸 平台收费或受限 |

---

## 🚀 主要功能

### 双模式系统

#### CLI 模式
```
/mode cli
```
直接调用本地安装的 Claude Code CLI，使用你配置的所有 Skills 和 MCP 插件。

#### Simple 模式 🆕
```
/mode simple
```
极简协调 Agent + SKILL.md 驱动，快速响应日常任务：

| 特性 | 说明 |
|------|------|
| **单一协调者** | 一个 Agent 处理所有任务 |
| **动态技能加载** | 通过 SKILL.md 切换身份和技能 |
| **直接工具调用** | 不经过 ReAct，直接执行 |
| **专业 Agents** | 按需调用 Browser/Shell/Search 等专业 Agents |

### 🤖 Agent 人格设定系统

每个 Agent 都有独特的人格设定，包含：
- **角色定位** - Agent 的身份和职责
- **核心职责** - 具体负责什么
- **性格特点** - 行为风格（简洁/详细/友好/专业）
- **工作原则** - 决策准则
- **协作方式** - 与其他 Agent 配合

**阿白** - Simple 模式的默认人格：
- 🤗 友善亲切，像朋友一样自然交流
- 💡 专业可靠，有能力解决问题
- 😊 偶尔幽默，轻松聊天
- 🎯 灵活应变，根据话题调整语气

### 🧠 分层记忆系统 (OpenViking 风格)

| 层级 | 容量 | 用途 | 访问范围 |
|------|------|------|----------|
| **L0** | ~100 tokens | 快速检索索引、关键词 | 仅当前 Agent |
| **L1** | ~2000 tokens | 内容导航、关键点 | Agent 间共享 |
| **L2** | 无限 | 完整数据、原始引用 | 全局共享 |

### 📁 完整文件传输

- 支持图片、视频、文档等所有文件类型
- 自动识别文件类型并选择发送方式
- 完善的错误处理和重试机制

---

## 📊 项目统计

| 分类 | 文件数 | 代码行数 |
|------|-------|---------|
| **后端** (TypeScript) | 93 | **~30,424** |
| **前端** (HTML/CSS/JS) | 5 | ~1,419 |
| **总计** | **98** | **~31,843** |

**核心模块**:
- SimpleCoordinatorAgent (极简协调 Agent)
- Agent 人格设定系统
- ContextCompressor (上下文压缩)
- LazyAgentProxy (延迟加载)
- SharedContext (会话管理)
- ZaiMcpClient (MCP 视觉理解)
- 技能管理系统 (34+ 内置技能)
- 定时任务调度器
- Web Dashboard

---

## 📢 现有用户注意

**如果你已经安装过本项目**，请查看 [**UPGRADE.md**](./UPGRADE.md) 了解如何升级到最新版本。

升级过程**不会改变你的现有配置**，只需添加少量新配置项即可。

---

## 🚀 快速开始

### 1. 安装 Claude Code CLI (必需)
```bash
npm install -g @anthropic-ai/claude-code
claude  # 登录你的 Anthropic 账户
```

### 2. 安装项目
```bash
git clone https://github.com/VAAN0524/QQ-Claude-Proxy.git
cd QQ-Claude-Proxy
npm install
```

### 3. 配置 QQ Bot

1. 访问 [QQ 开放平台](https://q.qq.com/) 注册开发者账号
2. 创建机器人应用，获取 **AppID** 和 **AppSecret**
3. 配置沙箱用户（添加你的 QQ 号）
4. 用手机 QQ 扫码添加机器人
5. 复制配置模板并填入你的密钥：

**Windows (CMD/PowerShell):**
```cmd
copy .env.example .env
```

**Linux/Mac:**
```bash
cp .env.example .env
```

然后用记事本或 VS Code 编辑 `.env` 文件，将占位符替换为你的真实密钥：

```env
# 将 your_app_id_here 替换为你的 AppID
QQ_BOT_APP_ID=your_app_id_here

# 将 your_app_secret_here 替换为你的 AppSecret
QQ_BOT_SECRET=your_app_secret_here
```

### 4. 配置 LLM API (Simple 模式需要)

Simple 模式需要配置 GLM API Key。获取方式：
1. 访问 [智谱 AI 开放平台](https://open.bigmodel.cn/)
2. 注册并登录，进入「控制台」→「API密钥」
3. 创建并复制 API Key

编辑 `.env` 文件：

```env
# 将 your_glm_api_key_here 替换为你的 API Key
GLM_API_KEY=your_glm_api_key_here
```

### 5. 启动服务
```bash
npm run dev    # 开发模式 (热重载)
npm start      # 生产模式
quick-start.bat  # Windows 快捷启动
```

### 6. 访问 Dashboard
打开浏览器访问 **http://localhost:8080**

---

## 🔄 升级指南

如果你已经安装过本项目，请按以下步骤升级：

### 1. 获取最新代码

```bash
cd 你的项目目录
git fetch origin
git pull origin main
```

### 2. 安装新增依赖

```bash
# 检查是否已安装（如果已安装可跳过）
mcporter --version
yt-dlp --version

# 如果未安装，执行：
npm install -g mcporter
npm install -g yt-dlp
```

### 3. 更新 .env 配置

在现有 `.env` 文件**末尾追加**以下内容（不要修改已有配置）：

```env
# Agent Reach 配置
AGENT_REACH_MCPORTER_PATH=mcporter
AGENT_REACH_YTDLP_PATH=yt-dlp
AGENT_REACH_ENABLE_SOCIAL=true
```

### 4. 创建配置文件

```bash
# 确保 config 目录存在
mkdir -p config
```

创建 `config/agent-reach.json`：
```json
{
  "version": "1.0.0",
  "mcporter": {
    "configured": true,
    "path": "mcporter",
    "servers": ["exa"]
  },
  "ytDlp": {
    "installed": true,
    "path": "yt-dlp"
  }
}
```

创建 `config/mcporter.json`：
```json
{
  "exa": "https://mcp.exa.ai/mcp"
}
```

### 5. 重新编译和启动

```bash
npm run build
npm start
```

### ✅ 重要说明

- **安全升级** - 您的现有配置（QQ_BOT_*、GLM_API_KEY 等）完全不受影响
- **向后兼容** - 原有的搜索功能继续正常工作
- **可选功能** - Agent Reach 是增强功能，不配置也不影响基础使用

---

## 📖 使用指南

### 模式切换
```
/mode cli       # 切换到 CLI 模式
/mode simple    # 切换到 Simple 模式 🆕
/模式 cli       # 中文命令
/模式 简单      # 中文命令
```

### QQ 常用命令
```
列出文件              # 查看工作区文件
把 xxx.png 发给我     # 发送文件到 QQ
搜索 xxx              # 网络搜索
清空历史              # 重置对话
新任务                # 开始新任务
列出任务              # 查看定时任务
```

### Dashboard 功能

访问 **http://localhost:8080** 可以：

* 📊 **实时监控** - 查看运行中的任务和进度
* 🤖 **Agent 管理** - 查看各个 Agent 状态
* 📅 **定时任务** - 创建和管理周期/定时任务
* ⚙️ **系统配置** - 修改配置并重启服务
* 📝 **日志查看** - 实时查看系统日志
* 🛠️ **技能管理** - 管理已安装的技能

### 定时任务

支持通过 **QQ 对话** 和 **Dashboard** 设置定时任务：

**周期任务** - 按固定间隔重复执行
- 间隔单位：秒、分钟、小时、天
- 例如：每 6 分钟执行一次、每天早上 8 点执行

**定时任务** - 在指定时间执行一次
- 指定具体日期和时间
- 执行完成后自动标记为完成

**QQ 对话管理**:
- "列出任务" - 查看所有定时任务
- "创建任务" - 创建新的周期/定时任务
- "删除任务A" - 删除指定任务
- "暂停任务A" / "恢复任务A" - 暂停或恢复任务

---

## 🏗️ 项目架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       QQ 消息处理流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ① 用户发送消息/文件                                               │
│        ↓                                                         │
│  ② QQ Bot Channel 接收事件                                       │
│        ↓                                                         │
│  ③ Gateway 路由分发 (模式选择)                                    │
│        ↓                                                         │
│  ④ Agent 处理:                                                    │
│      - CLI 模式 → 调用本地 Claude Code CLI                       │
│      - Simple 模式 → SimpleCoordinatorAgent + 专业 Agents        │
│        ↓                                                         │
│  ⑤ 执行完成，返回响应                                              │
│      - 文件自动发送                                               │
│      - 进度实时推送                                               │
│        ↓                                                         │
│  ⑥ QQ Bot Channel 发送回用户                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 核心目录结构

```
QQ-Claude-Proxy/
├── src/
│   ├── agents/                 # 🤖 多 Agent 系统
│   │   ├── base/              # Agent 基础接口 (IAgent, PersonaAgent)
│   │   ├── memory/            # 🧠 分层记忆 (OpenViking L0/L1/L2)
│   │   ├── tools-layer/       # 🔧 工具层 (搜索/Shell/文件/进程)
│   │   ├── SimpleCoordinatorAgent.ts  # 极简协调 Agent
│   │   ├── ContextCompressor.ts       # 上下文压缩
│   │   ├── LazyAgentProxy.ts          # 延迟加载代理
│   │   ├── AgentLoader.ts             # Agent 加载器
│   │   ├── ResourceMonitor.ts         # 资源监控
│   │   └── *.ts               # 各个 Agent 实现
│   ├── agent/                 # Claude Code CLI 适配器
│   ├── gateway/               # 🔶 WebSocket 消息网关
│   ├── channels/qqbot/        # 🔵 QQ Bot Channel
│   ├── llm/                   # 🔷 LLM Provider (OpenAI/Anthropic/GLM)
│   ├── scheduler/             # 🟡 定时任务调度器
│   └── utils/                 # 🛠️ 工具函数
├── public/dashboard/          # 🌐 Web Dashboard
├── skills/                    # 📚 技能目录 (34+ 技能)
├── workspace/                 # 📁 Claude Code 工作目录
└── uploads/                   # 📎 上传文件存储
```

---

## 🔥 最新更新 (v1.6.0)

> 📌 **现有用户升级**: 查看 [UPGRADE.md](./UPGRADE.md) 获取平滑升级指南

### ✨ 功能增强

- **🔍 Agent Reach 集成** 🆕
  - Exa 语义搜索 - AI 驱动的智能搜索
  - Jina Reader - 网页内容提取
  - YouTube/B站视频搜索 - 获取视频信息
  - 智能路由 - 自动识别查询类型

- **🤖 Agent 人格设定系统**
  - 阿白人格 - 友善亲切、专业可靠的 AI 伙伴
  - 实时上下文注入 - 当前日期/时间/时区自动感知
  - 对话连续性指导 - 支持省略表达（"继续"、"还有呢"）
  - 动态响应风格调整

- **🧠 上下文管理优化**
  - ContextCompressor - 智能上下文压缩 (16k tokens)
  - SharedContext 大小限制和自动清理
  - 对话历史权重优化 (70% 最近消息)

- **⚡ 性能优化**
  - LazyAgentProxy - Agent 延迟加载
  - AgentLoader - 统一 Agent 加载管理
  - SkillLoader 索引缓存
  - ResourceMonitor - 资源使用监控

- **🔧 工具层扩展**
  - 文件工具 - 完整的文件操作支持
  - 进程工具 - 系统进程管理
  - 搜索工具 - Tavily/Exa/Jina Reader/视频搜索

- **🧠 记忆系统增强**
  - DocumentChunker - 文档分块处理
  - EmbeddingCache - 向量嵌入缓存
  - HybridSearchEngine - 混合搜索引擎
  - MemoryWatcher - 记忆监控

### 🐛 Bug 修复

- **📁 文件发送修复**
  - 修复文件重复发送问题
  - 改进文件发送错误处理
  - 添加超时控制 (30s 普通请求, 60s 文件上传)

- **🔌 稳定性改进**
  - ZaiMcpClient 自动重连机制
  - 搜索工具描述更新 (包含当前年份提示)
  - API 请求超时处理
  - web_search 布尔值格式修复 (`'True'` → `true`)

---

## 🔥 历史更新 (v1.5.0)

### ✨ 功能增强

- **👁️ 官方 MCP 视觉理解** - 集成 Z.ai MCP Server
  - 支持图片分析 (glm-4.6v 模型)
  - 支持视频内容分析
  - 支持 OCR 文字提取
  - 支持错误截图诊断

- **📁 文件传输优化**
  - 修复图片/视频发送功能
  - 恢复 JSON + Base64 上传方式
  - 改进文件名匹配和指代词处理

- **🧠 Agent 自我认知增强**
  - 完善项目信息和文档位置说明
  - 添加核心能力和工作原则说明
  - 改进上下文记忆检索

### 🐛 Bug 修复

- 修复文件上传错误 850026 (富媒体文件下载失败)
- 修复视觉模型选择 (glm-4.7 不支持 vision，使用 glm-4.6v)
- 修复文件路径拼接问题 (workspace 路径)
- 优化文件发送请求检测模式

---

## 🛡️ 安全注意事项

1. 🔐 **保护 AppSecret** - 不要提交到 Git，使用 `.env` 文件
2. 👥 **设置用户白名单** - 限制谁可以使用你的机器人
3. 📍 **端口安全** - Gateway 默认只监听 `127.0.0.1`，不对外暴露
4. 📝 **定期审查日志** - 监控机器人的活动

---

## 📖 常见问题

### Q: 和云端 AI 平台有什么区别？
**A:** 本项目运行的是**你本地安装的 Claude Code CLI**，使用你自己的配置、Skills 和 MCP 插件，代码完全本地执行，不需要上传到云端。

### Q: CLI 模式和 Simple 模式有什么区别？
**A:**
- **CLI 模式**: 直接调用本地 Claude Code CLI，拥有完整的代码分析能力
- **Simple 模式**: 极简协调 Agent，快速响应日常任务，按需调用专业 Agents

### Q: Simple 模式需要配置 API Key 吗？
**A:** 是的，Simple 模式需要配置 GLM API Key（智谱 AI）。可以在 `.env` 文件中设置 `GLM_API_KEY`。

### Q: 支持群聊吗？
**A:** 支持！机器人可以在私聊和群聊中使用。

### Q: 服务重启后会丢失对话历史吗？
**A:** 不会！会话持久化系统会自动保存和恢复对话历史。

### Q: 如何获取 QQ 用户的 OpenID？
**A:** 用户首次发送消息后，可以在日志中看到其 OpenID。

---

## 🔗 相关链接

- [Claude Code CLI 官方文档](https://docs.anthropic.com/en/docs/claude-code)
- [QQ 开放平台](https://q.qq.com/)
- [智谱 AI 开放平台](https://open.bigmodel.cn/)
- [GitHub 仓库](https://github.com/VAAN0524/QQ-Claude-Proxy)
- [问题反馈](https://github.com/VAAN0524/QQ-Claude-Proxy/issues)

---

## 📜 开源许可

MIT License

---

<div align="center">

**Made with ❤️ by VAAN**

[GitHub](https://github.com/VAAN0524) | [Issues](https://github.com/VAAN0524/QQ-Claude-Proxy/issues) | [Star ⭐](https://github.com/VAAN0524/QQ-Claude-Proxy)

</div>
