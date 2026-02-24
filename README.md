# 🤖 QQ-Claude-Proxy

<div align="center">

![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen.svg)
![Code](https://img.shields.io/badge/code-29.5k%20lines-orange.svg)

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

---

## 📊 项目统计

| 分类 | 文件数 | 代码行数 |
|------|-------|---------|
| **后端** (TypeScript) | 83 | **~25,500** |
| **前端** (HTML/CSS/JS) | 15 | ~4,000 |
| **总计** | **98** | **~29,500** |

**核心模块**:
- LLM Provider 统一接口 (OpenAI/Anthropic/GLM)
- SimpleCoordinatorAgent (极简协调 Agent)
- Z.ai MCP 集成 (官方视觉理解服务)
- 分层记忆系统 (OpenViking 风格 L0/L1/L2)
- 技能管理系统 (30+ 内置技能)
- 定时任务调度器
- Web Dashboard

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

```bash
cp .env.example .env
# 编辑 .env 文件，填入 QQ_BOT_APP_ID 和 QQ_BOT_SECRET
```

### 4. 启动服务
```bash
npm run dev    # 开发模式 (热重载)
npm start      # 生产模式
quick-start.bat  # Windows 快捷启动
```

### 5. 访问 Dashboard
打开浏览器访问 **http://localhost:8080**

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
把 xxx.md 发给我      # 发送文件到 QQ
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
│   │   ├── learning/          # 📚 自主学习模块
│   │   ├── tools/             # 🔧 Agent 工具
│   │   └── *.ts               # 各个 Agent 实现
│   ├── agent/                 # Claude Code CLI 适配器
│   ├── gateway/               # 🔶 WebSocket 消息网关
│   ├── channels/              # 🔵 QQ Bot Channel
│   ├── llm/                   # 🔷 LLM Provider 统一接口
│   ├── scheduler/             # 🟡 定时任务调度器
│   └── utils/                 # 🛠️ 工具函数
├── public/dashboard/          # 🌐 Web Dashboard
├── skills/                    # 📚 技能目录 (30+ 技能)
├── workspace/                 # 📁 Claude Code 工作目录
└── uploads/                   # 📎 上传文件存储
```

---

## 🔥 最新更新 (v1.5.0)

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

## 🔥 历史更新 (v1.4.0)

### ✨ 架构重构

- **🎯 Simple 模式** - 全新极简协调 Agent
  - 单一协调者设计，减少复杂度
  - SKILL.md 驱动，动态切换身份
  - 直接工具调用，提升响应速度

- **🧠 OpenViking 风格记忆系统** - 分层记忆优化
  - L0: ~100 tokens 快速索引
  - L1: ~2000 tokens 内容导航
  - L2: 无限完整数据存储

- **📦 代码精简** - 删除 ~5,000 行冗余代码
  - 移除复杂的 GLMCoordinatorAgent
  - 简化 Agent 调度逻辑
  - 优化项目结构

### 🐛 Bug 修复

- 修复网络重试导致的内存溢出问题
- 修复 Agent 接口类型定义
- 修复会话持久化边界情况

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
