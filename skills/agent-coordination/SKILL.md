---
name: agent_coordination
description: Agent 协调模式技能。使用此技能当需要设计多 Agent 系统或协调多个子 Agent 时。
---

# Agent 协调模式

## 概述

本项目采用 **Supervisor/Orchestrator** 模式，由 GLMCoordinatorAgent 作为主协调 Agent，负责任务分解、子 Agent 调用和结果汇总。

## 架构图

```
用户消息 → GLMCoordinatorAgent (主 Agent)
                ↓
        分析任务 → 选择工具
                ↓
    ┌───────────┼───────────┐
    ↓           ↓           ↓
CodeAgent  BrowserAgent  ShellAgent
 (子工具)     (子工具)      (子工具)
    └───────────┼───────────┘
                ↓
        GLMCoordinatorAgent 汇总
                ↓
            返回用户
```

## 设计原则

### 1. 上下文隔离
- 每个 Agent 有独立的上下文窗口
- 主 Agent 只传递必要的信息
- 避免上下文污染

### 2. 工具抽象
- 子 Agent 作为工具暴露给主 Agent
- 统一的工具调用接口
- 支持动态工具发现

### 3. 结果合成
- 主 Agent 负责结果汇总
- 支持多轮迭代优化
- 保持对话连贯性

## 组件说明

### GLMCoordinatorAgent
```typescript
class GLMCoordinatorAgent {
  // 可用的子 Agent
  private subAgents: Map<string, IAgent>;

  // 工具定义
  getAvailableTools(): Tool[];

  // 执行工具调用
  async executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]>;
}
```

### 子 Agent 接口
```typescript
interface IAgent {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  // 处理消息
  async process(message: AgentMessage, context: AgentContext): Promise<AgentResponse>;

  // 工具 Schema
  getToolSchema?: () => ToolSchema;
}
```

## 工具调用流程

### 1. 主 Agent 分析
```
用户: "帮我写个爬虫脚本"

主 Agent 思考:
- 这是一个代码任务
- 需要 run_code_agent 工具
- 准备工具调用参数
```

### 2. 工具调用
```json
{
  "name": "run_code_agent",
  "arguments": {
    "task": "写一个网页爬虫脚本，使用 Python 和 requests 库"
  }
}
```

### 3. 子 Agent 执行
```
CodeAgent 收到任务
→ 生成代码
→ 返回结果
```

### 4. 主 Agent 汇总
```
主 Agent 收到代码结果
→ 评估质量
→ 补充说明
→ 返回给用户
```

## ReAct 循环

系统使用 Think-Act-Observe 循环：

```
┌─────────────────────────────────────┐
│           Think (思考)               │
│   理解用户意图，选择合适的工具        │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│            Act (行动)                │
│   调用选定的工具，执行具体任务        │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│         Observe (观察)               │
│   观察工具执行结果，评估是否完成      │
└──────────────┬──────────────────────┘
               │
               ↓
        目标达成？ ──Yes──→ 结束
               │
              No
               │
               └──────→ 回到 Think
```

## SKILL.md 系统

Agent 使用 SKILL.md 文件定义工具能力：

```yaml
---
name: run_code_agent
description: 执行代码相关任务的专业助手
---

# Code Agent Skill

## Capabilities
- 编写各种编程语言的代码
- 分析现有代码结构和逻辑
- 调试代码问题并提供修复方案
- 优化代码性能和可读性

## Parameters
- `task` (required): 具体的代码任务描述
- `code` (optional): 需要分析或调试的代码片段
```

## 扩展新 Agent

### 步骤 1：创建 Agent 类
```typescript
export class NewAgent implements IAgent {
  readonly id = 'new-agent';
  readonly name = 'New Agent';
  readonly description = '新 Agent 描述';

  async process(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    // 处理逻辑
    return { content: '结果', agentId: this.id };
  }
}
```

### 步骤 2：注册到主 Agent
```typescript
const newAgent = new NewAgent();
subAgents.set('new', newAgent);
```

### 步骤 3：添加工具映射
```typescript
private readonly toolToAgentMap: Record<string, string> = {
  // ...existing
  'run_new_agent': 'new',
};
```

### 步骤 4：创建 SKILL.md
```bash
mkdir -p src/agents/skills/run_new_agent
touch src/agents/skills/run_new_agent/SKILL.md
```

## 协作模式

### 模式 1：顺序执行
```
任务 A → Agent A → 结果 A
                  ↓
任务 B (依赖 A) → Agent B → 结果 B
```

### 模式 2：并行执行
```
        ┌→ Agent A ─┐
任务 → ─┤           ├→ 汇总结果
        └→ Agent B ─┘
```

### 模式 3：迭代优化
```
任务 → Agent → 初步结果
                ↓
           反思和调整
                ↓
           Agent → 改进结果
```

## 配置示例

```json
{
  "coordinator": {
    "model": "glm-4.7",
    "maxTokens": 8192,
    "temperature": 0.2,
    "enableMemory": true,
    "enableLearning": true
  },
  "subAgents": {
    "code": { "enabled": true },
    "browser": { "enabled": true },
    "shell": { "enabled": false },
    "websearch": { "enabled": true },
    "data": { "enabled": false }
  }
}
```

## 最佳实践

1. **单一职责**
   - 每个 Agent 专注于一个领域
   - 避免功能重叠

2. **清晰接口**
   - 定义明确的输入输出
   - 使用统一的错误处理

3. **可观测性**
   - 记录工具调用
   - 追踪执行路径
   - 监控性能指标

4. **容错设计**
   - 处理子 Agent 失败
   - 提供降级方案
   - 优雅的错误恢复
