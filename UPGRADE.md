# 升级指南

本文档帮助现有用户升级到最新版本，**不会改变您的现有配置**。

---

## 最新更新 (2026-02-27)

### Agent Reach 集成

新增增强搜索功能：
- 🔍 **Exa 语义搜索** - AI 驱动的智能搜索
- 📄 **Jina Reader** - 网页内容提取
- 🎬 **YouTube/B站搜索** - 视频信息获取
- 🧠 **智能路由** - 自动识别查询类型

---

## 快速升级步骤

### 1. 获取最新代码

```bash
cd 你的项目目录
git fetch origin
git pull origin main
```

### 2. 安装新增依赖

```bash
# 检查是否已安装
mcporter --version
yt-dlp --version

# 如果未安装
npm install -g mcporter
npm install -g yt-dlp
```

### 3. 更新 .env 配置

在现有 `.env` 文件**末尾追加**（不要修改已有配置）：

```bash
# Agent Reach 配置
AGENT_REACH_MCPORTER_PATH=mcporter
AGENT_REACH_YTDLP_PATH=yt-dlp
AGENT_REACH_ENABLE_SOCIAL=true

# 社交平台配置（可选，留空即可）
# TWITTER_COOKIES_PATH=config/twitter_cookies.json
# REDDIT_PROXY_URL=
# XIAOHONGSHU_MCP_URL=http://localhost:18060/mcp
# DOUYIN_MCP_URL=http://localhost:18070/mcp
```

### 4. 创建配置文件

```bash
# 确保 config 目录存在
mkdir -p config
```

**创建 `config/agent-reach.json`：**

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

**创建 `config/mcporter.json`：**

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

---

## 新功能使用

升级后，您可以直接使用以下功能：

| 用法 | 功能 | 示例 |
|------|------|------|
| 发送关键词 | Exa 语义搜索 | `搜索: TypeScript 2026年 最佳实践` |
| 发送 YouTube 链接 | 获取视频信息 | `https://youtube.com/watch?v=xxx` |
| 发送 B站链接 | 获取视频信息 | `https://bilibili.com/video/BVxxx` |
| 发送任意 URL | 提取网页内容 | `https://example.com/article` |

---

## 重要说明

- ✅ **安全升级** - 您的现有配置（QQ_BOT_*、GLM_API_KEY 等）完全不受影响
- ✅ **向后兼容** - 原有的搜索功能（Tavily、智谱内置搜索）继续正常工作
- ✅ **可选功能** - Agent Reach 是增强功能，不配置也不影响基础使用

---

## 常见问题

### Q: 升级后我的设置会丢失吗？

**A:** 不会。升级只会添加新配置，不会修改或删除您现有的任何设置。

### Q: 如果不配置 Agent Reach 会怎样？

**A:** 机器人会继续使用原有的搜索功能（智谱 AI 内置搜索或 Tavily），一切正常。

### Q: 需要重新配置 QQ Bot 吗？

**A:** 不需要。您的 QQ Bot 配置保持不变。

---

## 历史版本更新

### v1.6.0 (2026-02-27)
- ✨ 新增 Agent Reach 集成
- ✨ 新增 Exa 语义搜索
- ✨ 新增 YouTube/B站视频搜索
- ✨ 新增 Jina Reader 网页提取
- 🐛 修复 web_search 布尔值格式问题

### 更早版本
详见 [CHANGELOG.md](./CHANGELOG.md) 或 Git 提交历史。
