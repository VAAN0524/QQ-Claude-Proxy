# 🤖 QQ-Claude-Proxy

<div align="center">

![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen.svg)
![Code](https://img.shields.io/badge/code-47k%20lines-orange.svg)

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

#### 团队模式
```
/mode team
```
基于 GLM-4.7 的智能协调器，自动分析任务并分配给 **8 个专业 Agent**：

| Agent | 功能 |
|-------|------|
| **Code Agent** | 代码分析、生成、调试 |
| **Browser Agent** | 网页操作、截图 |
| **Shell Agent** | 命令执行 |
| **WebSearch Agent** | 网络搜索 |
| **Data Agent** | 数据分析 |
| **Vision Agent** | 图像理解 |
| **Refactor Agent** | 代码重构 |
| **SkillManager Agent** | 技能管理 |

---

## 📊 项目统计

| 分类 | 文件数 | 代码行数 |
|------|-------|---------|
| **后端** (TypeScript) | 73 | **31,500+** |
| **前端** (HTML/CSS/JS) | 15 | 8,900 |
| **配置** (JSON) | 16 | 7,800 |
| **总计** | **104** | **~48,200** |

**核心模块**:
- LLM Provider 统一接口 (OpenAI/Anthropic/GLM)
- 8 个专业 Agents
- 分层记忆系统 (L0/L1/L2)
- 知识缓存服务
- 会话持久化
- 定时任务调度
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
/mode cli      # 切换到 CLI 模式
/mode team     # 切换到团队模式
/模式 cli      # 中文命令
/模式 团队     # 中文命令
```

### QQ 常用命令
```
列出文件              # 查看工作区文件
把 xxx.md 发给我      # 发送文件到 QQ
清空历史              # 重置对话
新任务                # 开始新任务
列出任务              # 查看定时任务 (团队模式)
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

**QQ 对话管理** (团队模式):
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
│      - 团队模式 → GLM-4.7 协调器分配给专业 Agent                   │
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
│   │   ├── memory/            # 🧠 记忆系统 (分层记忆 + 知识缓存)
│   │   ├── learning/          # 📚 自主学习模块
│   │   └── tools/             # 🔧 Agent 工具
│   ├── gateway/              # 🔶 WebSocket 消息网关
│   ├── channels/             # 🔵 QQ Bot Channel
│   ├── llm/                  # 🔷 LLM Provider
│   ├── terminal/             # 🟠 终端监控
│   └── scheduler/            # 🟡 定时任务调度器
├── public/dashboard/         # 🌐 Web Dashboard
├── skills/                   # 📚 技能目录
├── workspace/                # 📁 工作目录
└── uploads/                  # 📎 上传文件存储
```

---

## 🔥 最新更新 (v1.3.0)

### ✨ 新增功能

- **🧠 知识缓存服务** - 智能缓存搜索结果，避免重复搜索
  - 天气信息：30 分钟缓存
  - 新闻摘要：6 小时缓存
  - 定义/概念：7 天缓存
  - API 文档：30 天缓存

- **💾 会话持久化** - 每个用户/群组独立会话
  - 服务重启后自动恢复对话历史
  - 支持 `user_{userId}` 和 `group_{groupId}` 隔离

- **🎯 记忆利用优化** - LLM 优先使用历史记忆中的答案

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

### Q: 支持群聊吗？
**A:** 支持！机器人可以在私聊和群聊中使用。

### Q: 搜索结果会缓存吗？
**A:** 是的！智能缓存系统会根据查询类型自动设置有效期，避免重复搜索。

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

**Made with [Heart] by VAAN**

[GitHub](https://github.com/VAAN0524) | [Issues](https://github.com/VAAN0524/QQ-Claude-Proxy/issues) | [Star ⭐](https://github.com/VAAN0524/QQ-Claude-Proxy)

</div>
