# QQ-Claude-Proxy Skills

本目录包含 Agent 系统的各种技能定义。

## 技能列表

### Agent 核心技能

| 技能 | 描述 | 文件 |
|------|------|------|
| `skill_creator` | 创建新技能指南 | [skill-creator/SKILL.md](skill-creator/SKILL.md) |
| `auto_error_resolver` | 自动错误解决 | [auto-error-resolver/SKILL.md](auto-error-resolver/SKILL.md) |
| `parallel_agents` | 并行 Agent 调度 | [parallel-agents/SKILL.md](parallel-agents/SKILL.md) |
| `network_solutions` | 网络问题解决方案 | [network-solutions/SKILL.md](network-solutions/SKILL.md) |
| `agent_debugging` | Agent 系统调试 | [agent-debugging/SKILL.md](agent-debugging/SKILL.md) |
| `agent_memory` | Agent 记忆管理 | [agent-memory/SKILL.md](agent-memory/SKILL.md) |
| `agent_coordination` | Agent 协调模式 | [agent-coordination/SKILL.md](agent-coordination/SKILL.md) |
| `web_search` | 网页搜索技能 | [web-search/SKILL.md](web-search/SKILL.md) |
| `glm_vision` | GLM 视觉理解 | [glm-vision/SKILL.md](glm-vision/SKILL.md) |

### 子 Agent 技能

| 技能 | 描述 | 文件 |
|------|------|------|
| `run_code_agent` | 代码相关任务 | [../src/agents/skills/run_code_agent/SKILL.md](../src/agents/skills/run_code_agent/SKILL.md) |
| `run_browser_agent` | 网页操作任务 | [../src/agents/skills/run_browser_agent/SKILL.md](../src/agents/skills/run_browser_agent/SKILL.md) |
| `run_vision_agent` | 图片分析任务 | [../src/agents/skills/run_vision_agent/SKILL.md](../src/agents/skills/run_vision_agent/SKILL.md) |

## SKILL.md 格式

每个技能都使用标准的 SKILL.md 格式：

```yaml
---
name: skill_name
description: 技能描述
---

# 技能标题

## 概述
技能的简要说明

## 功能列表
- 功能 1
- 功能 2

## 参数
- `param1` (required): 参数描述
- `param2` (optional): 参数描述

## 示例
```
```

## 添加新技能

1. 创建技能目录：
```bash
mkdir -p src/agents/skills/your_skill
```

2. 创建 SKILL.md 文件：
```bash
touch src/agents/skills/your_skill/SKILL.md
```

3. 实现 Agent（如果需要）：
```typescript
export class YourAgent implements IAgent {
  readonly id = 'your-agent';
  // ...
}
```

4. 注册到主 Agent：
```typescript
subAgents.set('your', new YourAgent());
```

## 参考资源

- [OpenClaw](https://github.com/openclaw) - 开源 AI Agent 框架
- [Claude Code Skills](~/.claude/skills/) - 本地 Claude Code 技能目录
