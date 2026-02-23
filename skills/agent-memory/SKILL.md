---
name: agent_memory
description: Agent 记忆管理技能。使用此技能当需要处理会话持久化、上下文管理或知识存储时。
---

# Agent 记忆系统

## 概述

Agent 记忆系统提供跨会话的上下文持久化能力，支持对话历史、知识存储和 RAG 检索。

## 记忆层级

### 层级 1：工作记忆
- 当前会话的上下文窗口
- 实时对话历史
- 零延迟访问
- 会话结束后丢失

### 层级 2：短期记忆
- 单次会话内的持久化
- SharedContext 管理
- 支持检索和查询
- 会话结束后清理

### 层级 3：长期记忆
- 跨会话持久化
- MemoryService 管理
- 向量存储和知识图谱
- 支持知识检索

### 层级 4：RAG 增强
- 基于 LLM 的检索增强
- RAGService 管理
- 语义搜索和答案生成
- 支持复杂查询

## 组件说明

### SharedContext
```typescript
// 共享上下文管理
class SharedContext {
  // 添加对话
  addConversation(role: string, content: string): void

  // 获取对话历史
  getAnthropicMessages(): ChatMessage[]

  // 保存工作状态
  setWorkState(key: string, value: any): void

  // 清空上下文
  clear(): void
}
```

### MemoryService
```typescript
// 记忆服务
class MemoryService {
  // 存储记忆
  async store(type: MemoryType, content: string, metadata?: any): Promise<string>

  // 检索记忆
  async retrieve(query: string, limit?: number): Promise<MemoryItem[]>

  // 搜索相关记忆
  async search(query: string, threshold?: number): Promise<MemoryItem[]>
}
```

### RAGService
```typescript
// RAG 服务
class RAGService {
  // 添加文档
  async addDocument(content: string, metadata?: any): Promise<void>

  // 查询答案
  async query(query: string): Promise<RAGResult>

  // 语义搜索
  async semanticSearch(query: string, topK?: number): Promise<Document[]>
}
```

## 使用场景

**场景 1：对话历史管理**
```typescript
// 添加到上下文
sharedContext.addConversation('user', message.content);
sharedContext.addConversation('assistant', response.content);

// 获取历史
const history = sharedContext.getAnthropicMessages();
```

**场景 2：知识存储**
```typescript
// 存储学到的新知识
await memoryService.store(
  MemoryType.KNOWLEDGE,
  answer,
  { question, confidence: 0.8 }
);
```

**场景 3：RAG 检索**
```typescript
// 查询相关知识
const ragResult = await ragService.query(userQuery);
const context = ragResult.documents.map(d => d.content).join('\n');
```

## 配置

```json
{
  "memory": {
    "enabled": true,
    "type": "sqlite",
    "path": "./data/memory.db"
  },
  "rag": {
    "enabled": true,
    "embeddings": "text-embedding-3-small",
    "chunkSize": 500,
    "chunkOverlap": 50
  }
}
```

## 最佳实践

1. **分层存储**
   - 频繁访问的数据放在 SharedContext
   - 长期数据放在 MemoryService
   - 复杂查询使用 RAGService

2. **定期清理**
   - 清理过期的短期记忆
   - 归档不活跃的对话
   - 压缩冗余数据

3. **索引优化**
   - 为常用查询建立索引
   - 使用向量化加速搜索
   - 缓存热点数据

## 故障排查

**问题：记忆不持久**
- 检查存储路径权限
- 验证数据库连接
- 查看存储服务日志

**问题：检索不准确**
- 检查向量嵌入质量
- 调整相似度阈值
- 优化文档分块策略

**问题：性能慢**
- 启用缓存机制
- 优化数据库查询
- 考虑分布式存储
