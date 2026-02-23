---
name: parallel_agents
description: 并行 Agent 调度技能。使用此技能当有多个独立任务需要同时处理、多个子问题需要并行解决、或需要同时调用多个 Agent 协作时。
---

# 并行 Agent 调度技能

## 概述

当有多个独立任务需要同时处理时，并行调度多个 Agent 可以大幅提高效率。

## 使用场景

- 多个独立测试失败
- 多个子系统问题
- 多个不同领域的问题
- 无依赖关系的任务

**不适用于：**
- 任务间有依赖关系
- 共享状态可能导致冲突
- 需要全局理解的场景

## 并行调度模式

### 模式 1：独立问题域

```
问题 A ──┐
          ├──→ 并行处理 ──→ 汇总结果
问题 B ──┤
          │
问题 C ──┘
```

**示例：**
```
问题 1: 用户登录失败
问题 2: 数据库连接超时
问题 3: 文件上传错误

→ 三个 Agent 同时处理
→ 汇总所有问题
→ 提供综合报告
```

### 模式 2：多源信息收集

```
源 1 ──┐
        ├──→ 并行获取 ──→ 综合分析
源 2 ──┤
        │
源 3 ──┘
```

**示例：**
```
源 1: GitHub API
源 2: 官方文档
源 3: 社区论坛

→ 三个 Agent 同时查询
→ 综合所有信息
→ 形成完整报告
```

### 模式 3：多方案并行验证

```
方案 A ──┐
         ├──→ 并行执行 ──→ 结果比较
方案 B ──┤
         │
方案 C ──┘
```

**示例：**
```
方案 A: 使用正则表达式
方案 B: 使用解析器
方案 C: 使用 LLM

→ 三个方案同时尝试
→ 比较结果
→ 选择最佳方案
```

## 调度流程

### 1. 任务分解

```
复杂任务
    ↓
分解为独立子任务
    ↓
验证独立性（无依赖、无共享状态）
```

### 2. Agent 分配

```
子任务 1 → Agent A
子任务 2 → Agent B
子任务 3 → Agent C
```

### 3. 并行执行

```typescript
// 使用 Promise.all 并行执行
const results = await Promise.all([
  agentA.process(task1, context),
  agentB.process(task2, context),
  agentC.process(task3, context),
]);
```

### 4. 结果汇总

```
收集所有结果
    ↓
验证结果一致性
    ↓
处理冲突（如有）
    ↓
生成综合报告
```

## 实现示例

### 使用 Task 工具

```typescript
// 创建并行任务
const task1 = Task({
  description: "修复用户登录问题",
  subagent: "debugging",
});

const task2 = Task({
  description: "修复数据库连接问题",
  subagent: "database",
});

const task3 = Task({
  description: "修复文件上传问题",
  subagent: "storage",
});

// 等待所有任务完成
const results = await Promise.all([
  task1,
  task2,
  task3,
]);
```

### 在 GLMCoordinatorAgent 中实现

```typescript
// 检测到多个独立问题时
if (independentProblems.length > 1) {
  // 为每个问题创建 Agent 任务
  const tasks = independentProblems.map(problem =>
    this.invokeSubAgent('run_debug_agent', {
      task: `诊断并修复: ${problem}`
    })
  );

  // 并行等待所有结果
  const results = await Promise.all(tasks);

  // 汇总结果
  return this.aggregateResults(results);
}
```

## 注意事项

### 1. 确保独立性

- 任务间没有数据依赖
- 不修改共享状态
- 独立的错误处理

### 2. 资源管理

- 控制并发数量
- 避免资源耗尽
- 设置超时限制

### 3. 错误处理

- 单个失败不影响其他
- 收集所有错误
- 提供详细报告

### 4. 结果同步

- 统一结果格式
- 处理时间差异
- 验证结果一致性

## 最佳实践

1. **任务粒度适中**
   - 不要过于细分
   - 不要过于复杂
   - 平衡粒度和效率

2. **合理超时设置**
   - 根据任务类型设置
   - 避免无限等待
   - 提供降级方案

3. **监控和日志**
   - 记录每个任务状态
   - 监控资源使用
   - 追踪性能指标

4. **优雅降级**
   - 单个失败不阻塞全部
   - 提供部分结果
   - 给出明确建议
