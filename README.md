# QQ-Claude-Proxy

通过 QQ 远程控制本地 Claude Code CLI 的代理系统。

## 功能特性

- 🔗 **QQ Bot 集成** - 通过手机 QQ 发送消息与 Claude Code CLI 交互
- 🖥️ **本地 CLI 执行** - 直接运行电脑端的 `claude` 命令行工具
- 📁 **文件传输** - 手机 QQ 与电脑互传文件
  - 发送图片/文件给机器人 → 自动保存到工作区 → Claude 自动读取
  - Claude 生成的文件 → 自动发送回手机
- 🔒 **权限控制** - 支持用户白名单限制访问

## 工作原理

```
QQ消息 → QQ开放平台 → 本地服务器 → Claude Code CLI → 响应 → QQ消息
                ↓                          ↓
            图片/附件                  工作区文件
                                     ↗        ↘
                                读取文件      生成文件
                                              ↓
                                          自动发送回QQ
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 安装 Claude Code CLI

确保已安装 Claude Code CLI 并登录：

```bash
# 安装 Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 登录 Anthropic 账户
claude
```

### 3. 配置

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 填入 QQ Bot 配置：

```env
# QQ Bot 配置 (从 https://q.qq.com 获取)
QQ_BOT_APP_ID=your_app_id
QQ_BOT_SECRET=your_app_secret

# 可选：用户白名单 (逗号分隔的 OpenID)
# ALLOWED_USERS=
```

### 4. 运行

开发模式：
```bash
npm run dev
```

生产模式：
```bash
npm run build
npm start
```

## QQ Bot 配置

1. 访问 [QQ 开放平台](https://q.qq.com/)
2. 注册开发者账号
3. 创建机器人应用
4. 获取 AppID 和 AppSecret
5. 配置沙箱用户（添加你的 QQ 号）
6. 用 QQ 扫码添加机器人

## 使用方式

通过 QQ 消息，你可以：

- **对话交互**: 直接发送消息与 Claude 对话
- **发送图片**: 发送图片，Claude 会保存到工作区并读取
- **发送文件**: 发送文件，Claude 会自动处理
- **请求文件**: 让 Claude 生成文件并发送给你

示例：
- "帮我读取 package.json 文件"
- "创建一个 hello.txt 文件，内容是 Hello World"
- "分析这张图片"（附上图片）
- "把刚才生成的代码发给我"

## 项目结构

```
src/
├── index.ts              # 主入口
├── gateway/              # WebSocket 网关
│   ├── server.ts         # 服务端
│   ├── protocol.ts       # 消息协议
│   ├── router.ts         # 消息路由
│   └── session.ts        # 会话管理
├── channels/             # 渠道适配器
│   └── qqbot/            # QQ Bot
│       ├── api.ts        # HTTP API
│       ├── gateway.ts    # WebSocket 连接
│       ├── types.ts      # 类型定义
│       └── index.ts      # 主入口
├── agent/                # Claude Code Agent
│   ├── claude-cli.ts     # CLI 执行器
│   ├── file-storage.ts   # 文件存储管理
│   └── index.ts          # Agent 入口
├── config/               # 配置管理
└── utils/                # 工具函数

workspace/                # Claude 工作目录
uploads/                  # 用户上传文件存储
```

## 配置说明

### config/default.json

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
      "clientSecret": ""
    }
  },
  "agent": {
    "allowedUsers": [],
    "timeout": 300000
  },
  "storage": {
    "downloadPath": "./workspace",
    "uploadPath": "./uploads"
  }
}
```

### allowedUsers

设置允许使用机器人的 QQ 用户 OpenID 列表。留空则允许所有人使用。

## 安全注意事项

1. **不要泄露凭证** - AppSecret 需要妥善保管
2. **设置用户白名单** - 限制谁可以使用你的机器人
3. **Claude CLI 认证** - Claude CLI 使用本地认证，无需在代码中存储 API Key
4. **定期审查日志** - 监控机器人的活动

## License

MIT
