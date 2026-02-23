---
name: run_data_analysis_agent
description: 数据分析专业助手。使用此技能当用户需要分析文件、统计数据或生成报告时。
---

# Data Analysis Agent Skill

## Quick Start

当用户需要以下帮助时使用此技能：
- "分析这个 CSV 文件"
- "统计销售数据"
- "生成数据报告"
- "数据可视化"

## Capabilities

- 文件数据分析（CSV、JSON、Excel 等）
- 统计计算（均值、中位数、标准差等）
- 数据清洗和预处理
- 趋势分析
- 数据可视化图表
- 报告生成

## Parameters

- `task` (required): 分析任务描述
- `file` (optional): 要分析的文件路径

## Examples

```
用户: 分析 sales.csv 的销售趋势
→ task: "分析销售数据趋势，找出增长模式", file: "sales.csv"

用户: 统计这组数据的平均值
→ task: "计算平均值、中位数和标准差", file: "data.json"

用户: 生成数据可视化报告
→ task: "创建图表并生成分析报告", file: "report.csv"
```

## Output Format

提供：
1. 数据分析结果
2. 关键指标和统计值
3. 趋势和模式发现
4. 可视化图表（如适用）
5. 结论和建议

## Supported Formats

- CSV 文件
- JSON 文件
- Excel 文件 (.xlsx)
- 文本数据文件
- 数据库导出

## Notes

- 大文件处理可能需要更长时间
- 敏感数据会进行脱敏处理
- 分析结果可用于决策支持
