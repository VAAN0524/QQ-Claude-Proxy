---
name: run_websearch_agent
description: 网络搜索专业助手。使用此技能当用户需要查找最新信息、搜索资料或收集数据时。
---

# Web Search Agent Skill

## Quick Start

当用户需要以下帮助时使用此技能：
- "搜索最新的 React 版本"
- "查找某技术的文档"
- "了解当前事件"
- "收集市场信息"

## Capabilities

- 实时网络搜索
- 技术文档查询
- 新闻资讯检索
- 数据收集整理
- 多源信息对比

## Parameters

- `query` (required): 搜索关键词或问题

## Examples

```
用户: React 19 有什么新特性？
→ query: "React 19 new features"

用户: 搜索 TypeScript 最新版本
→ query: "TypeScript latest version 2024"

用户: 查找 GitHub Copilot 价格
→ query: "GitHub Copilot pricing"
```

## Output Format

提供：
1. 搜索结果摘要
2. 相关链接列表
3. 关键信息提取
4. 多源信息对比（如果适用）

## Notes

- 信息实时从网络获取
- 结果会进行相关性排序
- 提供来源链接便于深入阅读
