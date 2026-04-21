<div align="center">

# 🤖 QQ-Claude-Proxy

## 📱 简化的 QQ Bot 代理，远程控制本地 Claude Code CLI

## 🔒 代码不出本地，纯净架构，专注核心功能

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/VAAN0524/QQ-Claude-Proxy)
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
| **架构复杂度** | 📦 **极简设计，易维护** | ❌ 黑盒服务 |
| **使用成本** | 💰 **使用你自己的 API 配额** | 💸 平台收费或受限 |

---

## 🎯 核心亮点

### 🚀 简化架构

- **🎯 单一专注** - 纯 CLI 模式，直接调用本地 Claude Code CLI
- **📦 极简设计** - 移除 60-70% 的复杂代码，专注核心功能
- **⚡ 快速响应** - 无多 Agent 协调开销，直接通信
- **🔧 易维护** - 代码结构清晰，易于理解和扩展

### 🤖 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     纯 CLI 模式工作流程                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  QQ Bot → Gateway → ClaudeCodeAgent → Claude Code CLI            │
│                                                                  │
│  用户消息 → WebSocket 路由 → 直接调用本地 CLI → 返回结果          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**核心特性**：
- 🧠 **直接集成** - 无中间层，直接调用 Claude Code CLI
- 🔧 **完整功能** - 保留所有 Claude Code CLI 原生能力
- 📁 **文件传输** - 支持图片、视频、文档等各种格式
- ⚙️ **配置管理** - 灵活的配置系统
- 📊 **Dashboard** - 实时监控和管理界面

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
npm run build    # 编译 TypeScript
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

### 4️⃣ 启动服务

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
- ⚙️ **系统配置** - 修改配置并重启服务
- 📝 **日志查看** - 查看系统运行日志

---

## 📖 使用指南

### QQ 常用命令

| 命令 | 说明 |
|:---|:---|
| `有哪些图片` | 查看工作区文件 |
| `把 xxx.png 发给我` | 发送文件到 QQ |
| `清空历史` | 重置对话 |
| `列出任务` | 查看定时任务 |

### 使用示例

```
# 代码分析
用户: 帮我分析一下 src/utils/logger.ts
→ Claude Code CLI 直接分析代码文件

# 文件操作
用户: 发送最新的图片给我
→ 系统查找并发送最新图片文件

# 对话重置
用户: 清空历史
→ 重置当前对话上下文
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
│   ├── agents/                    # Claude Code CLI 适配器
│   │   ├── ClaudeCodeAgent.ts    # 主 Agent 实现
│   │   └── base/                 # Agent 基础接口
│   ├── gateway/                   # WebSocket 消息网关
│   ├── channels/qqbot/           # QQ Bot Channel
│   ├── scheduler/                 # 定时任务调度器
│   ├── config/                    # 配置管理
│   └── utils/                     # 工具函数
├── public/dashboard/              # Web Dashboard
└── workspace/                     # Claude Code 工作目录
```

---

## 🔥 最新更新 (v2.0.0)

### ✨ 架构重构

- **🎯 纯 CLI 模式** - 移除双模式系统，专注单一架构
- **📦 简化设计** - 移除 60-70% 的复杂代码
- **🔧 移除组件**:
  - 删除多 Agent 协调系统
  - 删除技能管理系统
  - 删除模式切换功能
  - 删除分层记忆系统
  - 删除智能意图识别
- **⚡ 性能提升** - 直接调用 Claude Code CLI，响应更快
- **🛠️ 易维护性** - 代码结构更清晰，易于理解和扩展

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

### Q: 支持哪些功能？
**A:** 支持所有 Claude Code CLI 的原生功能，包括代码分析、文件操作、Git 命令、测试运行等。

### Q: 需要配置 API Key 吗？
**A:** 不需要额外配置，使用你已有的 Claude Code CLI 配置即可。

### Q: 支持群聊吗？
**A:** 支持！机器人可以在私聊和群聊中使用。

---

---

## 🔗 相关链接

- [Claude Code CLI 官方文档](https://docs.anthropic.com/en/docs/claude-code)
- [QQ 开放平台](https://q.qq.com/)
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
