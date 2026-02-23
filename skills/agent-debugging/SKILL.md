---
name: agent_debugging
description: Agent 系统调试技能。使用此技能当 Agent 出现错误、行为异常或需要排查问题时。
---

# Agent 系统调试

## 概述

Agent 系统的调试需要系统化方法，因为涉及多个组件（Gateway、Channel、Agent）和异步消息流。

## 核心原则

```
找到根因后再修复，不要盲目修改
```

## 调试流程

### 阶段 1：问题定位

1. **检查日志输出**
   - Gateway 日志：消息是否正确路由
   - Channel 日志：QQ 消息是否正确接收/发送
   - Agent 日志：处理逻辑是否正确执行

2. **复现问题**
   - 问题是否可稳定复现？
   - 触发问题的具体步骤是什么？
   - 是特定消息类型导致的吗？

3. **检查配置**
   - `config.json` 配置是否正确
   - 环境变量是否正确加载
   - API Key 是否有效

### 阶段 2：日志分析

1. **Gateway 层**
   ```
   [Gateway] 收到消息: { ... }
   [Gateway] 路由到: qqbot
   [Gateway] 调用方法: agent.process
   ```

2. **Agent 层**
   ```
   [GLMCoordinatorAgent] 处理消息: { ... }
   [GLMCoordinatorAgent] 调用 API
   [GLMCoordinatorAgent] API 响应: { ... }
   ```

3. **Channel 层**
   ```
   [QQBot] 发送消息: { ... }
   [QQBot] 消息已发送
   ```

### 阶段 3：常见问题

**问题 1：Agent 无响应**
- 检查 API 连接是否正常
- 检查超时配置
- 查看是否有错误日志

**问题 2：消息发送失败**
- 检查 QQ Bot API 状态
- 验证 AppID 和 Secret
- 检查消息格式是否符合要求

**问题 3：工具调用失败**
- 检查工具参数是否正确
- 验证子 Agent 是否正常工作
- 查看工具执行日志

## 调试命令

```bash
# 查看实时日志
npm run dev

# 类型检查
npm run typecheck

# 测试
npm test
```

## 注意事项

- 日志使用结构化格式 (pino)
- 敏感信息不要记录到日志
- 使用适当的时间戳和上下文 ID
