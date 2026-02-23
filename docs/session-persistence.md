# 会话持久化系统

## 概述

会话持久化系统提供跨会话的上下文保存和恢复能力，支持 Agent 在服务重启后恢复之前的对话状态。

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                    SessionManager                        │
│         (管理多个 SharedContextPersistence 实例)          │
└─────────────────────────────────────────────────────────┘
                           │
                           │ 每个用户/群组一个会话
                           ↓
┌─────────────────────────────────────────────────────────┐
│              SharedContextPersistence                    │
│                   (持久化包装层)                          │
├─────────────────────────────────────────────────────────┤
│  - 自动保存                                              │
│  - 加载/保存会话                                         │
│  - 代理 SharedContext 方法                              │
└─────────────────────────────────────────────────────────┘
                           │
                           │ 包装
                           ↓
┌─────────────────────────────────────────────────────────┐
│                   SharedContext                          │
│                 (核心上下文管理)                          │
├─────────────────────────────────────────────────────────┤
│  - conversationHistory: 对话历史                         │
│  - workStates: 工作状态                                  │
│  - fileReferences: 文件引用                              │
└─────────────────────────────────────────────────────────┘
```

## 组件说明

### SessionManager

会话管理器，负责创建和管理多个会话实例。

```typescript
import { SessionManager } from './agents/index.js';

// 创建会话管理器
const sessionManager = new SessionManager({
  storagePath: './data/sessions',
  autoSaveInterval: 60000,  // 60秒自动保存
  saveImmediately: false,   // 不立即保存
  maxHistoryMessages: 100,  // 最多保留100条消息
});

// 获取或创建会话
const session = await sessionManager.getOrCreateSession('user_123');

// 获取 SharedContext
const context = session.getContext();

// 使用上下文
context.addConversation('user', '你好');

// 获取会话统计
const stats = sessionManager.getStats();
```

### SharedContextPersistence

SharedContext 的持久化包装器，提供自动保存和加载功能。

```typescript
import { SharedContextPersistence } from './agents/index.js';

// 创建持久化包装器
const persistence = new SharedContextPersistence(sharedContext, 'user_123', {
  storagePath: './data/sessions',
  autoSaveInterval: 60000,
  saveImmediately: true,  // 每次修改后立即保存
});

// 加载现有会话
await persistence.load();

// 代理方法（修改后自动保存）
persistence.addConversation('user', '你好');
persistence.setWorkState('code', '代码已生成');
persistence.addFileReference('/path/to/file');

// 手动保存
await persistence.save();

// 清理资源
await persistence.cleanup();
```

### SharedContext

核心上下文管理类，存储对话历史、工作状态和文件引用。

```typescript
import { SharedContext } from './agents/index.js';

const context = new SharedContext({
  maxMessages: 100,
  maxAge: 60 * 60 * 1000,  // 1小时
});

// 添加对话
context.addConversation('user', '你好');
context.addConversation('assistant', '你好！有什么可以帮助你的？');

// 获取对话历史（Anthropic API 格式）
const messages = context.getAnthropicMessages();

// 工作状态
context.setWorkState('code', '代码生成完成');
const state = context.getWorkState('code');

// 文件引用
context.addFileReference('/path/to/file');
const files = context.getFileReferences();

// 清空
context.clearAll();
```

## 配置选项

### PersistenceOptions

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `storagePath` | string | `./data/sessions` | 持久化存储目录 |
| `autoSaveInterval` | number | `60000` | 自动保存间隔（毫秒），0 表示禁用 |
| `saveImmediately` | boolean | `false` | 是否在每次修改后立即保存 |
| `maxHistoryMessages` | number | `100` | 压缩历史消息时保留的最大数量 |

### SharedContextOptions

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxMessages` | number | `100` | 最大保留消息数 |
| `maxAge` | number | `3600000` | 消息最大保留时间（毫秒） |

## 存储格式

会话以 JSON 格式存储在文件系统中：

```json
{
  "version": "1.0",
  "savedAt": "2025-02-23T12:00:00.000Z",
  "conversationHistory": [
    {
      "role": "user",
      "content": "你好",
      "timestamp": "2025-02-23T12:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "你好！有什么可以帮助你的？",
      "timestamp": "2025-02-23T12:00:01.000Z",
      "agentId": "glm-coordinator"
    }
  ],
  "workStates": [
    [
      "code",
      {
        "agentId": "code",
        "result": "代码生成完成",
        "timestamp": "2025-02-23T12:00:02.000Z"
      }
    ]
  ],
  "fileReferences": [
    "/path/to/file.js"
  ]
}
```

## 使用场景

### 场景 1：多用户会话隔离

```typescript
// 为每个用户创建独立的会话
const userSession = await sessionManager.getOrCreateSession(`user_${userId}`);
const groupSession = await sessionManager.getOrCreateSession(`group_${groupId}`);

// 每个会话有独立的上下文
userSession.getContext().addConversation('user', message);
```

### 场景 2：服务重启后恢复

```typescript
// 服务启动时，恢复所有活跃会话
const activeSessionIds = getActiveSessionIds(); // 从你的存储中获取

for (const sessionId of activeSessionIds) {
  const session = await sessionManager.getOrCreateSession(sessionId);
  // 会话会自动从文件加载
  logger.info(`会话已恢复: ${sessionId}`);
}
```

### 场景 3：定期保存

```typescript
// 创建会话管理器，启用自动保存
const sessionManager = new SessionManager({
  autoSaveInterval: 60000,  // 每 60 秒自动保存
});

// 手动触发保存
await sessionManager.saveAll();
```

## 最佳实践

1. **会话 ID 设计**
   - 用户会话: `user_{userId}`
   - 群组会话: `group_{groupId}`
   - 确保唯一性和可读性

2. **保存策略**
   - 开发环境: 启用 `saveImmediately` 便于调试
   - 生产环境: 使用 `autoSaveInterval` 减少磁盘写入

3. **清理策略**
   - 定期清理不活跃的会话
   - 使用 `maxAge` 自动清理过期消息
   - 监控存储空间使用情况

4. **错误处理**
   - 加载失败时创建新会话
   - 保存失败时记录日志但不中断服务
   - 使用原子写入（临时文件 + 重命名）

## 故障排查

**问题：会话没有恢复**
- 检查 `storagePath` 是否正确
- 验证文件权限
- 查看加载日志

**问题：数据丢失**
- 检查 `autoSaveInterval` 设置
- 验证磁盘空间
- 查看保存日志

**问题：性能问题**
- 调整 `maxHistoryMessages` 限制
- 禁用 `saveImmediately`
- 考虑使用数据库而非文件系统
