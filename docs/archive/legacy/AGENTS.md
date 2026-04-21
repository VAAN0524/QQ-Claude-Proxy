# QQ-Claude-Proxy 多 Agent 系统文档

## 系统架构

本系统采用**协作式多 Agent 架构**，基于 OpenClaw 和 OpenViking 设计理念：

```
用户消息 → GLMCoordinatorAgent (主协调)
                ↓
        分析任务 → 分解为子任务
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

## 核心设计理念

### OpenClaw 风格 - 渐进式技能加载

- **L0 (Metadata)**: ~100 tokens/技能，始终加载
- **L1 (Full Content)**: <5k tokens/技能，触发时加载
- **L2 (Resources)**: 无限，按需加载

### OpenViking 风格 - 分层记忆存储

- **L0 (Abstract)**: ~100 tokens，快速检索索引
- **L1 (Overview)**: ~2000 tokens，内容导航
- **L2 (Detail)**: 无限，完整数据

## Agent 列表

### 主协调 Agent

| Agent ID | 名称 | 描述 | 模型 |
|---------|------|------|------|
| glm-coordinator | GLM Coordinator Agent | 智能任务协调助手，可调用专门的子 Agent 协助完成任务 | GLM-4.7 |

### 子 Agent

| Agent ID | 名称 | 描述 | 状态 |
|---------|------|------|------|
| code | Code Agent | 代码编写、分析、调试 | ✅ |
| browser | Browser Agent | 网页访问、截图、信息提取 | ✅ |
| shell | Shell Agent | 执行系统命令 | ✅ |
| websearch | WebSearch Agent | 网页搜索和信息检索 | ✅ |
| data | DataAnalysis Agent | 数据分析和可视化 | ✅ |
| vision | Vision Agent | 图像理解和分析 | ✅ |

## 分层记忆系统

### 记忆层级

| 层级 | 大小 | 用途 | 加载策略 |
|-----|------|------|----------|
| L0 (Abstract) | ~100 tokens | 快速检索索引 | 始终加载 |
| L1 (Overview) | ~2000 tokens | 内容导航 | 触发时加载 |
| L2 (Detail) | 无限 | 完整数据 | 按需加载 |

### 记忆目录结构

```
data/
├── memory/                      # 基础记忆存储
│   ├── memories.json            # 记忆数据
│   └── .abstract                # 抽象索引
├── agent-memory/                # Agent 专属记忆
│   ├── glm-coordinator/
│   │   ├── .abstract            # L0 索引
│   │   ├── L0/                  # L0 记忆
│   │   ├── L1/                  # L1 概览
│   │   └── L2/                  # L2 详情
│   ├── code/
│   │   └── .abstract
│   ├── browser/
│   │   └── .abstract
│   └── ...
└── shared-memory/               # 跨 Agent 共享记忆
    ├── .shared-abstract         # 共享索引
    ├── L0/
    ├── L1/
    └── L2/
```

## 记忆同步规则

### 同步策略

1. **实时同步**: Agent 将重要记忆实时写入 L0
2. **定期同步**: 每 5 分钟同步一次到共享记忆层
3. **触发同步**: 当任务完成时，生成完整的 L1/L2 记忆

### 跨 Agent 记忆共享

#### 读取规则

```typescript
// Agent 优先级：本地记忆 → 共享记忆 → 全局搜索

1. 首先查询本地 L0 索引
2. 如果未找到，查询共享记忆的 L0 索引
3. 如果需要更多细节，按需加载 L1/L2
```

#### 写入规则

```typescript
// 记忆分类写入

1. Agent 专属记忆 → agent-memory/{agentId}/
   - Agent 特定的执行状态
   - 工具使用偏好
   - 任务历史

2. 共享记忆 → shared-memory/
   - 跨 Agent 的任务上下文
   - 用户偏好设置
   - 通用知识和技能
```

### 记忆生命周期

| 阶段 | 标签 | 保留时间 | 清理策略 |
|-----|------|----------|----------|
| active | 活跃 | 无限期 | 保留 |
| archived | 归档 | 30 天 | 定期检查 |
| expired | 过期 | 7 天 | 自动清理 |

### .abstract 索引格式

```json
{
  "agentId": "glm-coordinator",
  "count": 42,
  "lastUpdated": "2026-02-23T12:00:00.000Z",
  "entries": [
    {
      "id": "hmem_1234567890_abc123",
      "summary": "用户询问如何使用 GLM-4V 进行图像分析",
      "keywords": ["GLM-4V", "图像分析", "视觉理解"],
      "timestamp": "2026-02-23T11:30:00.000Z",
      "layer": "L0"
    }
  ]
}
```

## 使用分层记忆服务

### 初始化

```typescript
import { HierarchicalMemoryService, MemoryLayer } from './memory/index.js';

const hierarchicalMemory = new HierarchicalMemoryService({
  storagePath: './data/memory',
  agentConfigs: [
    {
      agentId: 'glm-coordinator',
      memoryPath: './data/agent-memory/glm-coordinator',
      enableHierarchical: true,
    },
    {
      agentId: 'code',
      memoryPath: './data/agent-memory/code',
      enableHierarchical: true,
    },
  ],
  sharedConfig: {
    sharedPath: './data/shared-memory',
    participatingAgents: ['glm-coordinator', 'code', 'browser', 'shell'],
    syncInterval: 5 * 60 * 1000, // 5 分钟
  },
  autoCleanup: true,
  retentionTime: 30 * 24 * 60 * 60 * 1000, // 30 天
});

await hierarchicalMemory.initialize();
```

### 添加分层记忆

```typescript
// 添加 L0 记忆（快速索引）
await hierarchicalMemory.addHierarchicalMemory(
  MemoryType.MESSAGE,
  '用户消息内容',
  MemoryLayer.L0,
  {
    userId: 'user123',
    groupId: 'group456',
    taskId: 'glm-coordinator:session-001',
    tags: ['user-message', 'question'],
    importance: 0.7,
  }
);

// 添加 L1 记忆（内容概览）
await hierarchicalMemory.addHierarchicalMemory(
  MemoryType.CONTEXT,
  '任务上下文概览...',
  MemoryLayer.L1,
  {
    taskId: 'glm-coordinator:session-001',
    tags: ['context', 'overview'],
    importance: 0.8,
  }
);
```

### 搜索分层记忆

```typescript
// L0 快速搜索（关键词匹配）
const results = hierarchicalMemory.searchHierarchicalMemories(
  '图像分析 GLM-4V',
  {
    userId: 'user123',
    types: [MemoryType.MESSAGE],
    limit: 10,
  }
);

// 按层获取记忆
const l0Entry = hierarchicalMemory.getHierarchicalMemory('mem_id', MemoryLayer.L0);
const l1Entry = hierarchicalMemory.getHierarchicalMemory('mem_id', MemoryLayer.L1);
```

## 系统提示词设计

```
你是一个智能任务协调助手，可以调用专门的子 Agent 来协助完成任务。

### 可用的工具

1. run_code_agent - 处理代码编写、分析、调试任务
2. run_browser_agent - 网页访问、截图、信息提取
3. run_shell_agent - 执行系统命令（谨慎使用）
4. run_websearch_agent - 网页搜索和信息检索
5. run_data_analysis_agent - 数据分析和可视化
6. run_vision_agent - 图像理解和分析

### 工作流程

1. 理解用户需求
2. 判断是否需要调用子 Agent
3. 调用相应的工具
4. 汇总结果，返回给用户

### 注意事项

- 简单问题直接回答，无需调用工具
- 复杂任务可以多次调用工具
- 保持回答简洁明了
- 使用分层记忆系统保存重要信息
```

## 扩展开发

### 添加新的子 Agent

1. 在 `src/agents/` 下创建新的 Agent 类
2. 实现 `IAgent` 接口
3. 在 `GLMCoordinatorAgent` 的 `toolToAgentMap` 中注册
4. 在 `getAvailableTools()` 中添加工具定义

### 添加新的记忆类型

1. 在 `MemoryType` 枚举中添加新类型
2. 在 `HierarchicalMemoryService` 中实现对应的处理逻辑
3. 更新 `.abstract` 索引格式

## 配置示例

```json
{
  "glmCoordinator": {
    "apiKey": "your-glm-api-key",
    "model": "glm-4.7",
    "maxTokens": 8192,
    "enableMemory": true,
    "enableHierarchicalMemory": true,
    "enableLearning": true
  },
  "hierarchicalMemory": {
    "storagePath": "./data/memory",
    "sharedPath": "./data/shared-memory",
    "syncInterval": 300000,
    "autoCleanup": true,
    "retentionTime": 2592000000
  }
}
```

## 性能优化建议

1. **L0 索引缓存**: 将 L0 索引常驻内存
2. **按层加载**: 只在需要时加载 L1/L2
3. **批量写入**: 使用批量操作减少 I/O
4. **异步清理**: 在低峰期执行清理任务
5. **共享内存**: 使用 Redis 等实现跨进程共享

## 故障排查

### 记忆未同步

- 检查 `sharedConfig.participatingAgents` 配置
- 确认 `syncInterval` 设置正确
- 查看 `.shared-abstract` 文件是否存在

### .abstract 索引损坏

- 删除损坏的 `.abstract` 文件
- 重启服务，系统会自动重建索引

### 记忆占用过高

- 运行每日清理脚本
- 调整 `retentionTime` 参数
- 手动标记过期记忆为 `expired`
