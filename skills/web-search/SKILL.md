---
name: web_search
description: 网页搜索技能。使用此技能当需要搜索网络信息、查找资料、获取最新文档或解决方案时。支持实时信息检索和网页内容提取。
---

# 网页搜索技能

## 概述

此技能提供网页搜索和内容提取能力，用于获取实时信息和在线资源。

## 使用场景

- 搜索最新的技术文档
- 查找问题的解决方案
- 获取实时新闻和数据
- 发现新的工具和库
- 查找代码示例
- 搜索错误信息和解决方案

## 搜索方法

### 方法 1: 智谱 AI 搜索（推荐）

使用智谱 AI 的内置搜索能力，实时获取网络信息。

**参数：**
- `query` (required): 搜索关键词
- `limit` (optional): 结果数量，默认 10

**使用方式：**
```
调用 web_search 工具，传入搜索查询
Agent 将自动使用智谱 API 的搜索功能
```

### 方法 2: DuckDuckGo 搜索

备选搜索方案，不需要 API Key。

**命令：**
```bash
npx -y ducksearch search "搜索关键词"
npx -y ducksearch search "关键词" -n 5    # 限制结果
```

### 方法 3: 网页内容提取

提取网页的纯文本内容。

**命令：**
```bash
npx -y ducksearch fetch https://example.com
npx -y ducksearch fetch https://example.com -o out.txt
```

## 配置

### 智谱 API

确保已设置智谱 API Key（与 GLM 模型共用）：

```bash
export ZHIPU_API_KEY=your_api_key_here
# 或在 .env 文件中
ZHIPU_API_KEY=your_api_key_here
```

## 搜索流程

```
用户问题 → 分析需要搜索 → 调用搜索工具
                ↓
        获取搜索结果
                ↓
        分析和总结结果
                ↓
        返回答案给用户
```

## 工作流程

### 1. 分析查询

确定搜索意图：
- 信息检索（查找文档）
- 问题解决（查找方案）
- 实时数据（新闻、价格）
- 资源发现（工具、库）

### 2. 执行搜索

根据查询类型选择合适的方法：
- 技术问题：搜索关键词 + "solution" 或 "fix"
- 文档查找：搜索关键词 + "documentation"
- 最新信息：搜索关键词 + "2025" 或 "latest"

### 3. 处理结果

- 阅读搜索摘要
- 访问相关页面（如需要）
- 提取关键信息
- 综合多个来源

### 4. 形成答案

- 总结搜索发现
- 提供具体解决方案
- 包含参考链接
- 标注信息来源

## 搜索技巧

### 精确搜索

使用引号进行精确匹配：
```
"TypeError: Cannot read property 'undefined'"
```

### 排除关键词

使用减号排除不相关结果：
```
python tutorial -beginner
```

### 站点搜索

搜索特定网站：
```
site:docs.python.com asyncio
```

### 文件类型搜索

搜索特定文件类型：
```
python async filetype:pdf
```

## 常见使用模式

### 模式 1: 错误解决

```
用户: "遇到 TypeError: Cannot read property 'x' of undefined"
→ 搜索: "TypeError Cannot read property undefined solution"
→ 返回: 常见原因和解决方法
```

### 模式 2: 技术调研

```
用户: "React 和 Vue 哪个更好？"
→ 搜索: "React vs Vue comparison 2025"
→ 返回: 对比分析、优缺点、适用场景
```

### 模式 3: 文档查找

```
用户: "TypeScript 泛型怎么用？"
→ 搜索: "TypeScript generics documentation"
→ 返回: 官方文档链接、代码示例
```

### 模式 4: 最新信息

```
用户: "最新的 AI 模型有哪些？"
→ 搜索: "latest AI models 2025"
→ 返回: 最新发布的模型、特性对比
```

## 搜索结果格式

返回结果应包含：

```
## 搜索结果

### 来源
[标题](链接) - 摘要

### 关键信息
- 要点 1
- 要点 2

### 参考链接
1. [链接标题](URL)
2. [链接标题](URL)
```

## 注意事项

1. **验证信息** - 多源验证，确保准确性
2. **标注来源** - 提供参考链接
3. **时效性** - 注意信息的发布时间
4. **相关性** - 筛选最相关的结果
5. **总结提炼** - 不要简单复制，要理解和总结

## 故障排查

**问题：搜索无结果**
- 检查网络连接
- 验证 API Key 配置
- 尝试简化搜索关键词

**问题：结果不相关**
- 使用更精确的关键词
- 添加上下文词汇
- 尝试不同的搜索引擎

**问题：无法访问网页**
- 检查 URL 是否正确
- 尝试使用内容提取工具
- 查找缓存版本
