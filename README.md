<div align="center">

# 🤖 QQ-Claude-Proxy

### 📱 通过手机 QQ 远程控制本地 Claude Code CLI
### 🔒 代码不出本地，随时随地使用你的 AI 编程助手

[![Version](https://img.shields.io/badge/version-1.7.0-blue.svg)](https://github.com/VAAN0524/QQ-Claude-Proxy)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.8.0-blue.svg)](https://www.typescriptlang.org)

[![Star History Chart](https://api.star-history.com/svg?repos=VAAN0524/QQ-Claude-Proxy&type=Date)](https://star-history.com/#VAAN0524/QQ-Claude-Proxy&Date)

---

</div>

## ✨ 为什么选择 QQ-Claude-Proxy？

| 特性 | QQ-Claude-Proxy | 云端 AI 平台 |
|:---|:---:|:---:|
| **执行环境** | 🏠 **本地运行 Claude Code CLI** | ☁️ 云端服务器 |
| **数据安全** | 🔒 **代码保留在本地** | ⚠️ 需上传到云端 |
| **配置继承** | ✅ **使用你自己的配置** | ❌ 平台预设配置 |
| **扩展能力** | 🧩 **支持本地 Skills/MCP** | ❌ 受限或不可用 |
| **使用成本** | 💰 **使用你自己的 API 配额** | 💸 平台收费或受限 |

---

## 🎯 核心亮点

### 🚀 双模式系统

| 模式 | 说明 | 适用场景 |
|:---|:---|:---|
| **CLI 模式** | 直接调用本地 Claude Code CLI | 复杂代码分析、大型项目重构 |
| **Simple 模式** | 极简协调 Agent + 工具层 | 日常问答、快速搜索、文件管理 |

### 🤖 智能 Agent 系统

```
┌─────────────────────────────────────────────────────────────────┐
│                    Simple 模式工作流程                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  用户消息 → LLM 意图识别 → 智能路由 → 执行并返回                  │
│              ↓                                                   │
│         判断意图类型：                                            │
│         • 搜索请求 → Function Calling                             │
│         • 文件请求 → 文件操作工具                                  │
│         • 视频分析 → MCP 服务                                     │
│         • 代码任务 → 专业 Agent                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**核心特性**：
- 🧠 **LLM 意图识别** - 智能判断用户意图，不再依赖硬编码关键词
- 🔧 **工具层直接调用** - 搜索、Shell、文件、进程等工具直接可用
- 🎭 **动态人格切换** - 通过 SKILL.md 灵活切换 Agent 身份
- 🧩 **专业 Agent 协作** - Browser/Shell/Search 等专业 Agent 按需调用

### 🧠 分层记忆系统

| 层级 | 容量 | 用途 | 访问范围 |
|:---|:---:|:---|:---|
| **L0** | ~100 tokens | 快速索引、关键词 | 仅当前 Agent |
| **L1** | ~2000 tokens | 内容导航、关键点 | Agent 间共享 |
| **L2** | 无限 | 完整数据、原始引用 | 全局共享 |

### 📁 完整文件传输

- 🖼️ **图片** - 自动识别并发送
- 🎥 **视频** - 支持本地视频文件
- 📄 **文档** - 支持各种文档格式
- 🧠 **智能意图识别** - 自然语言理解文件请求意图

---

## 📦 快速开始

### 前置要求

- **Node.js** >= 18.0.0
- **Claude Code CLI** - 全局安装
- **QQ 机器人** - QQ 开放平台账号

### 1️⃣ 安装 Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
claude  # 登录你的 Anthropic 账户
```

### 2️⃣ 克隆项目

```bash
git clone https://github.com/VAAN0524/QQ-Claude-Proxy.git
cd QQ-Claude-Proxy
npm install
```

### 3️⃣ 配置 QQ Bot

#### 3.1 创建 QQ 机器人

1. 访问 [QQ 开放平台](https://q.qq.com/) 注册开发者账号
2. 创建机器人应用，获取 **AppID** 和 **AppSecret**
3. 配置沙箱用户（添加你的 QQ 号）
4. 用手机 QQ 扫码添加机器人

#### 3.2 配置环境变量

**Windows:**
```cmd
copy .env.example .env
```

**Linux/Mac:**
```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# QQ Bot 配置（必需）
QQ_BOT_APP_ID=your_app_id_here
QQ_BOT_SECRET=your_app_secret_here

# 用户白名单（可选，逗号分隔）
ALLOWED_USERS=qq_openid_1,qq_openid_2

# Simple 模式配置（可选）
GLM_API_KEY=your_glm_api_key_here

# 搜索配置（可选）
TAVILY_API_KEY=your_tavily_key_here
```

### 4️⃣ 配置 LLM API（Simple 模式）

> 如果只使用 CLI 模式，可跳过此步骤

Simple 模式需要配置 GLM API Key：

1. 访问 [智谱 AI 开放平台](https://open.bigmodel.cn/)
2. 注册并登录，进入「控制台」→「API密钥」
3. 创建并复制 API Key 到 `.env` 文件

### 5️⃣ 启动服务

```bash
# 开发模式（热重载）
npm run dev          # Unix/Mac
npm run dev:win      # Windows

# 生产模式
npm start

# Windows 快捷启动
quick-start.bat
```

### 6️⃣ 访问 Dashboard

打开浏览器访问 **http://localhost:8080**

- 📊 **实时监控** - 查看运行中的任务和进度
- 🤖 **Agent 管理** - 查看各个 Agent 状态
- 🛠️ **技能管理** - 管理已安装的技能
- ⚙️ **系统配置** - 修改配置并重启服务

---

## 📖 使用指南

### 模式切换

```
/mode cli       # 切换到 CLI 模式
/mode simple    # 切换到 Simple 模式
/模式 cli       # 中文命令
/模式 简单      # 中文命令
```

### QQ 常用命令

| 命令 | 说明 |
|:---|:---|
| `搜索 xxx` | 网络搜索 |
| `有哪些图片` | 查看工作区文件 |
| `把 xxx.png 发给我` | 发送文件到 QQ |
| `清空历史` | 重置对话 |
| `列出任务` | 查看定时任务 |

### Simple 模式示例

```
# 搜索（智能意图识别）
用户: ai科技方面的劲爆消息有哪些
→ 系统识别为搜索请求，调用搜索工具

# 文件操作（自然语言理解）
用户: 随便发一张图片给我
→ 系统识别为文件请求，随机选择图片发送

用户: 最新的视频有哪些
→ 系统识别为文件列表请求，按时间排序返回

# 视频分析
用户: [发送视频文件]
→ 系统自动调用 MCP 服务进行视频内容分析
```

---

## 🔄 升级指南

### 现有用户升级

**如果你已经安装过本项目**，升级过程**不会改变你的现有配置**：

### 方式一：一键升级（推荐）

**Windows:**
```cmd
upgrade.bat
```

**Linux/Mac:**
```bash
chmod +x upgrade.sh
./upgrade.sh
```

### 方式二：手动升级

```bash
# 1. 获取最新代码
git fetch origin
git pull origin main

# 2. 安装依赖
npm install

# 3. 重新编译
npm run build

# 4. 启动服务
npm start
```

---

## 🏗️ 项目架构

```
QQ-Claude-Proxy/
├── src/
│   ├── agents/                    # Agent 系统
│   │   ├── base/                 # Agent 基础接口
│   │   ├── memory/               # 分层记忆 (L0/L1/L2)
│   │   ├── tools-layer/          # 工具层 (搜索/Shell/文件/进程)
│   │   ├── SimpleCoordinatorAgent.ts  # 极简协调 Agent
│   │   ├── ContextCompressor.ts       # 上下文压缩
│   │   ├── LazyAgentProxy.ts          # 延迟加载代理
│   │   └── *.ts                   # 各个 Agent 实现
│   ├── gateway/                   # WebSocket 消息网关
│   ├── channels/qqbot/           # QQ Bot Channel
│   ├── llm/                       # LLM Provider
│   ├── scheduler/                 # 定时任务调度器
│   └── utils/                     # 工具函数
├── public/dashboard/              # Web Dashboard
├── skills/                        # 技能目录
└── workspace/                     # Claude Code 工作目录
```

---

## 🔥 最新更新 (v1.7.0)

### ✨ 功能增强

- **🧠 LLM 智能意图识别**
  - 不再依赖硬编码关键词
  - 智能区分文件请求和搜索请求
  - 自然语言理解文件操作意图
  - 降级方案确保稳定性

- **🔍 修复搜索功能**
  - 修复 availableTools 从 SKILL.md 提取失败的问题
  - 优化 Function Calling 路由逻辑
  - 添加当前查询高亮，避免上下文干扰

- **📁 文件操作优化**
  - 支持多种选择模式（随机、最新、指定）
  - 智能文件类型识别
  - 改进错误处理

### 🐛 Bug 修复

- 修复 YAML 解析器 availableTools 提取失败
- 修复 Function Calling 被硬编码检查绕过的问题
- 修复 LLM 被历史对话干扰导致搜索错误关键词
- 修复文件请求关键词误判问题

---

## 🛡️ 安全注意事项

1. 🔐 **保护 AppSecret** - 不要提交到 Git，使用 `.env` 文件
2. 👥 **设置用户白名单** - 限制谁可以使用你的机器人
3. 📍 **端口安全** - Gateway 默认只监听 `127.0.0.1`
4. 📝 **定期审查日志** - 监控机器人的活动

---

## 📚 常见问题

### Q: 和云端 AI 平台有什么区别？
**A:** 本项目运行的是**你本地安装的 Claude Code CLI**，代码完全本地执行，不需要上传到云端。

### Q: CLI 模式和 Simple 模式有什么区别？
**A:**
- **CLI 模式**: 直接调用本地 Claude Code CLI，拥有完整的代码分析能力
- **Simple 模式**: 极简协调 Agent，快速响应日常任务，按需调用专业 Agents

### Q: Simple 模式需要配置 API Key 吗？
**A:** 是的，Simple 模式需要配置 GLM API Key（智谱 AI）。

### Q: 支持群聊吗？
**A:** 支持！机器人可以在私聊和群聊中使用。

---

## 🔗 相关链接

- [Claude Code CLI 官方文档](https://docs.anthropic.com/en/docs/claude-code)
- [QQ 开放平台](https://q.qq.com/)
- [智谱 AI 开放平台](https://open.bigmodel.cn/)
- [问题反馈](https://github.com/VAAN0524/QQ-Claude-Proxy/issues)

---

## 📜 开源许可

MIT License - 详见 [LICENSE](./LICENSE)

---

<div align="center">

**Made with ❤️ by [VAAN](https://github.com/VAAN0524)**

[![Star](https://img.shields.io/github/stars/VAAN0524/QQ-Claude-Proxy.svg?style=social)](https://github.com/VAAN0524/QQ-Claude-Proxy/stargazers)
[![Fork](https://img.shields.io/github/forks/VAAN0524/QQ-Claude-Proxy.svg?style=social)](https://github.com/VAAN0524/QQ-Claude-Proxy/network/members)
[![Watch](https://img.shields.io/github/watchers/VAAN0524/QQ-Claude-Proxy.svg?style=social)](https://github.com/VAAN0524/QQ-Claude-Proxy/watchers)

</div>
