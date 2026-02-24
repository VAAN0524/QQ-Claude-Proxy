# Tavily Search Skill

使用 Tavily AI 搜索 API 进行实时网络搜索。

## 环境变量

需要设置 Tavily API 密钥：

```bash
export TAVILY_API_KEY=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
```

或者在 `.env` 文件中添加：

```
TAVILY_API_KEY=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
```

## 网络问题解决方案

### 方案 1: 使用代理（推荐）

如果无法直接访问 api.tavily.com，配置代理：

```bash
# 在 .env 中添加
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

### 方案 2: 使用镜像端点

如果 Tavily API 被墙，可以通过 Cloudflare Workers 搭建镜像：

```javascript
// worker.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    url.host = 'api.tavily.com';

    const newRequest = new Request(url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    return fetch(newRequest);
  }
};
```

然后在 `.env` 中设置：

```
TAVILY_API_URL=https://your-worker.workers.dev
```

### 方案 3: 备用搜索服务

如果 Tavily 完全不可用，系统会自动回退到：
- Zhipu AI 网络搜索 (web_search)
- DuckDuckGo 搜索
- Bing 搜索 API

## 功能

- 实时网络搜索
- 支持多种搜索类型（新闻、研究等）
- 返回结构化搜索结果
- 自动提取关键信息
- AI 生成搜索摘要

## 使用示例

```
用户: 搜索最新的 AI 新闻
用户: 搜索 TypeScript 5.0 的新特性
用户: 搜索 React Server Components 最佳实践
```

## API 限制

- 开发密钥：每月 1,000 次搜索
- 响应时间：通常 < 2 秒
- 支持的搜索深度：basic / advanced
