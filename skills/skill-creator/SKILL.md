---
name: skill_creator
description: 创建新技能的指南。使用此技能当需要创建新技能、更新现有技能或扩展 Agent 能力时。技能让 Agent 从通用助手转变为具备专业领域知识的专家。
---

# Skill Creator - 技能创建指南

## 技能是什么

技能是模块化的、自包含的包，通过提供专业知识、工作流程和工具来扩展 Agent 的能力。

### 技能提供的内容

1. **专业工作流程** - 特定领域的多步骤程序
2. **工具集成** - 处理特定文件格式或 API 的说明
3. **领域专业知识** - 项目特定知识、架构、业务逻辑
4. **捆绑资源** - 脚本、参考文档、资源文件

## 核心原则

### 简洁是关键

上下文窗口是公共资源。默认假设：Agent 已经很聪明了，只添加 Agent 没有的知识。

### 适度的自由度

- **高自由度**（文本说明）：多种方法都有效、决策依赖上下文
- **中等自由度**（伪代码或带参数脚本）：有首选模式但允许变化
- **低自由度**（特定脚本、少参数）：操作脆弱且易错、必须遵循特定顺序

## 技能结构

```
skill-name/
├── SKILL.md (必需)
│   ├── YAML frontmatter 元数据 (必需)
│   │   ├── name: 技能名称 (必需)
│   │   └── description: 技能描述 (必需)
│   └── Markdown 指令 (必需)
└── 捆绑资源 (可选)
    ├── scripts/          # 可执行代码
    ├── references/       # 参考文档
    └── assets/           # 输出中使用的文件
```

### SKILL.md 格式

```yaml
---
name: skill_name
description: 清晰描述技能用途和使用场景
---

# 技能标题

## 快速开始
简洁的使用说明

## 功能列表
- 功能 1
- 功能 2

## 参数
- `param1` (required): 参数描述
- `param2` (optional): 参数描述

## 示例
使用示例
```

### 捆绑资源

**scripts/** - 可执行代码
- 何时包含：代码被反复重写或需要确定性可靠性
- 示例：`scripts/search.py` 搜索脚本

**references/** - 参考文档
- 何时包含：Agent 工作时需要引用的文档
- 示例：`references/api_docs.md` API 文档

**assets/** - 资源文件
- 何时包含：Agent 产生的输出中使用的文件
- 示例：`assets/template.pptx` 模板文件

## 创建新技能步骤

### 1. 确定技能范围

回答以下问题：
- 这个技能解决什么问题？
- 它是通用工具还是领域特定？
- 需要什么样的输入？
- 产生什么样的输出？

### 2. 创建技能目录

```bash
mkdir -p src/agents/skills/your_skill
touch src/agents/skills/your_skill/SKILL.md
```

### 3. 编写 SKILL.md

按照标准格式编写：
- YAML frontmatter（name + description）
- 清晰的使用说明
- 参数定义
- 使用示例

### 4. 添加资源（可选）

根据需要添加：
- `scripts/` - 可执行脚本
- `references/` - 参考文档
- `assets/` - 资源文件

### 5. 注册到系统

在 [GLMCoordinatorAgent.ts](../../src/agents/GLMCoordinatorAgent.ts) 中的 `toolToAgentMap` 添加映射：

```typescript
private readonly toolToAgentMap: Record<string, string> = {
  // ...existing
  'your_skill': 'agent_id',
};
```

### 6. 测试技能

确保技能：
- 正确触发
- 参数正确传递
- 输出符合预期

## 技能循环

```
遇到问题 → 搜索解决方案 → 创建/更新技能 → 下次直接使用
    ↑                                           ↓
    └────────────── 越用越聪明 ←──────────────────┘
```

## 示例技能

查看现有技能作为参考：
- [run_code_agent](../../src/agents/skills/run_code_agent/SKILL.md) - 代码任务
- [run_browser_agent](../../src/agents/skills/run_browser_agent/SKILL.md) - 网页操作
- [agent_debugging](../agent-debugging/SKILL.md) - 系统调试
- [agent_memory](../agent-memory/SKILL.md) - 记忆管理

## 最佳实践

1. **一个技能做一件事** - 保持专注
2. **清晰的命名** - 名称应该说明用途
3. **详细的描述** - 描述应该说明何时使用
4. **实用的示例** - 提供真实的使用场景
5. **持续改进** - 根据使用反馈不断优化
