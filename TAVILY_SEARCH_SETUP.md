# Tavily Search Skill 安装完成

## ✅ 已完成

1. **创建 Skill 文件**
   - `/skills/tavily-search/SKILL.md` - Skill 说明文档
   - `/skills/tavily-search/index.ts` - Skill 实现代码

2. **创建 TavilySearchAgent**
   - `/src/agents/TavilySearchAgent.ts` - Agent 实现

3. **配置 API 密钥**
   - `.env` 中已添加 `TAVILY_API_KEY`

4. **系统集成**
   - 已在 `src/agents/index.ts` 中导出
   - 已在 `src/index.ts` 中添加初始化逻辑

## 🔑 API 密钥

```
TAVILY_API_KEY=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
```

## 🌐 网络问题解决方案

### 方案 1: 配置代理

```bash
# 在 .env 中添加
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
```

### 方案 2: 使用镜像端点

通过 Cloudflare Workers 创建镜像：

```javascript
// worker.js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.host = 'api.tavily.com';
    return fetch(new Request(url, request));
  }
};
```

然后在 `.env` 中设置：
```
TAVILY_API_URL=https://your-worker.workers.dev
```

### 方案 3: 使用备用搜索

网络错误时，Agent 会自动提示使用：
- Team 模式的 `web_search` 工具（Zhipu AI 搜索）
- 发送 `/mode team` 切换模式

## 📝 使用方式

```
搜索 TypeScript 5.0 新特性
search latest AI news
tavily React Server Components
```

## 📊 API 限制

- 开发密钥：每月 1,000 次搜索
- 响应时间：通常 < 2 秒
- 支持的搜索深度：basic / advanced

## 🚀 重启服务

```bash
npm start
```

重启后 Tavily Search Agent 将自动启用！
