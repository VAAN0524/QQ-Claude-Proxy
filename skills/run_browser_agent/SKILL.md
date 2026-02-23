---
name: run_browser_agent
description: 网页操作专家。使用此技能当用户需要访问网页、截图、提取信息或填充表单时。
---

# Browser Agent Skill

## Quick Start

当用户需要以下帮助时使用此技能：
- "访问 example.com 并截图"
- "从网页提取文章内容"
- "帮我填写这个表单"
- "点击页面上的下载按钮"

## Capabilities

- 访问指定 URL 的网页
- 截取网页屏幕截图
- 提取网页文本内容
- 填充和提交表单
- 点击页面元素
- 执行页面滚动操作

## Parameters

- `task` (required): 具体的网页操作任务描述
- `url` (optional): 要访问的网页 URL

## Examples

```
用户: 访问 GitHub 并截图
→ task: "访问 GitHub 并截图", url: "https://github.com"

用户: 提取这篇文章的内容
→ task: "提取文章内容", url: "https://example.com/article"
```

## Output Format

提供：
1. 操作执行结果
2. 网页截图（如果适用）
3. 提取的内容信息
4. 操作状态说明

## Notes

- 等待页面加载完成
- 处理动态加载内容
- 遵守网站的 robots.txt
