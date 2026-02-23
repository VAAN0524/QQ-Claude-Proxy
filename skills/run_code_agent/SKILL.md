---
name: run_code_agent
description: 执行代码相关任务的专业助手。使用此技能当用户需要编写、分析、调试或优化代码时。
---

# Code Agent Skill

## Quick Start

当用户需要以下帮助时使用此技能：
- "写一个快速排序算法"
- "帮我分析这段代码"
- "为什么我的代码报错了"
- "优化这个函数"

## Capabilities

- 编写各种编程语言的代码
- 分析现有代码结构和逻辑
- 调试代码问题并提供修复方案
- 优化代码性能和可读性
- 代码重构和架构建议

## Parameters

- `task` (required): 具体的代码任务描述
- `code` (optional): 需要分析或调试的代码片段

## Examples

```
用户: 写个快速排序算法
→ task: "写个快速排序算法", code: undefined

用户: 这段代码有什么问题？
→ task: "分析代码问题", code: "function test() { ... }"
```

## Output Format

提供：
1. 清晰的代码实现
2. 必要的注释说明
3. 代码解释（如果复杂）
4. 使用示例（如果适用）

## Notes

- 代码应该是可运行的
- 遵循最佳实践和编码规范
- 考虑边界情况和错误处理
