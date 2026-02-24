# 系统简化对比

## 复杂系统 (GLMCoordinatorAgent) vs 简化系统 (SimpleCoordinatorAgent)

### 架构对比

| 方面 | 复杂系统 | 简化系统 |
|------|----------|----------|
| **Agent 数量** | 8+ 个专业 Agent | 1 个协调 Agent |
| **系统提示词** | ~100 行 | ~20 行 |
| **工具选择** | LLM ReAct 推理 | 关键词直接路由 |
| **执行模式** | 多步 ReAct 循环 | 直接执行 |
| **技能切换** | 子 Agent 调用 | SKILL.md 动态加载 |
| **记忆系统** | L0/L1/L2 分层 | Markdown 文档 |
| **快捷检测** | 多种快捷检测 | 无 (信任 LLM) |

### 流程对比

#### 复杂系统流程
```
用户请求 → GLMCoordinatorAgent
    ↓
1. ReAct 循环开始
2. LLM 选择工具 (5 步推理)
3. 调用子 Agent
4. 子 Agent 可能再调用工具
5. 判断是否成功
6. 生成最终答案 (可能为空)
```

#### 简化系统流程
```
用户请求 → SimpleCoordinatorAgent
    ↓
1. 识别技能类型 (关键词)
2. 加载对应 SKILL.md
3. 加载相关记忆
4. 直接执行工具
5. 返回结果
```

### 代码对比

#### 复杂系统 - 工具调用
```typescript
// 需要定义工具，让 LLM 选择
tools.push({
  type: 'function',
  function: {
    name: 'run_websearch_agent',
    description: '网络搜索：搜索问题、查找资料、收集信息',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
      },
      required: ['query'],
    },
  },
});

// LLM 需要理解并选择工具
// ReAct 循环可能失败
```

#### 简化系统 - 工具调用
```typescript
// 直接关键词路由
private async executeDirectly(content: string): Promise<string> {
  if (content.includes('搜索') || content.includes('search')) {
    return await this.tools.get('search').execute({ query });
  }
  if (content.includes('代码') || content.includes('code')) {
    return await this.tools.get('code').execute({ task: content });
  }
  return await this.callLLM(content);
}
```

### SKILL.md 对比

#### 复杂系统
- 每个子 Agent 需要定义人格
- 需要实现 IAgent 接口
- 需要在多个地方注册

#### 简化系统
- 简单的 Markdown 文档
- 即插即用
- 易于修改和测试

### 记忆系统对比

#### 复杂系统
```typescript
// L0/L1/L2 分层记忆
class HierarchicalMemoryService {
  private l0Memory: Map<string, MemoryEntry[]>;  // 7 天
  private l1Memory: Map<string, MemoryEntry[]>;  // 30 天
  private l2Memory: Map<string, MemoryEntry[]>;  // 90 天

  async retrieve(...): Promise<MemoryEntry[]> {
    // 复杂的检索逻辑
  }
}
```

#### 简化系统
```markdown
# MEMORY.md

## 用户偏好
- 喜欢简洁回答
- 使用 TypeScript

## 常用操作
- 经常搜索 GitHub 项目
- 关注 AI 相关内容
```

### 性能对比

| 指标 | 复杂系统 | 简化系统 |
|------|----------|----------|
| **响应时间** | 较长 (多步推理) | 较短 (直接执行) |
| **Token 使用** | 高 (长提示词) | 低 (精简提示词) |
| **成功率** | 较低 (可能返回空) | 较高 (直接返回) |
| **维护成本** | 高 (多文件) | 低 (MD 文档) |

### 实际案例对比

#### 用户请求: "用 tavily 搜索 GitHub 上的 myskills 项目"

**复杂系统**:
```
1. 用户请求到达 GLMCoordinatorAgent
2. GitHub URL 快捷检测被触发 ❌
3. 绕过 LLM，直接调用 smart_fetch
4. 用户明确说"用 tavily"，但被忽略
5. ReAct 循环 5 步，最终返回空结果
```

**简化系统**:
```
1. 用户请求到达 SimpleCoordinatorAgent
2. 识别为"搜索"技能
3. 加载 search.md SKILL
4. 检测到"tavily"关键词
5. 直接调用 Tavily 搜索 API
6. 返回格式化结果
```

## 迁移指南

### 从复杂系统迁移到简化系统

#### 1. 替换 Agent
```typescript
// 旧代码
import { GLMCoordinatorAgent } from './agents/GLMCoordinatorAgent.js';
const agent = new GLMCoordinatorAgent({...});

// 新代码
import { SimpleCoordinatorAgent } from './agents/SimpleCoordinatorAgent.js';
const agent = new SimpleCoordinatorAgent({
  skillsPath: './skills/simple',
  memoryPath: './memory/simple',
  rulesPath: './rules/simple',
});
```

#### 2. 转换人格设定
```typescript
// 旧方式: 在 personas.ts 中定义
export const AGENT_PERSONAS: Record<string, AgentPersona> = {
  'glm-coordinator': {
    role: '任务协调助手',
    responsibilities: [...],
    // ...
  },
};

// 新方式: 在 skills/simple/default.md 中定义
# 默认技能 - 通用智能助手

## 系统提示
你是一个智能助手...
```

#### 3. 转换记忆
```typescript
// 旧方式: 使用 HierarchicalMemoryService
await memoryService.store(userId, content, metadata);

// 新方式: 编辑 memory/simple/MEMORY.md
## 用户偏好
- 用户经常搜索...
```

## 总结

### 简化系统的优势

1. **更简单** - 单一 Agent，直接执行
2. **更快速** - 减少 ReAct 循环
3. **更可靠** - 直接路由，不依赖 LLM 推理
4. **更灵活** - SKILL.md 即插即用
5. **更易维护** - Markdown 文档易于编辑

### 何时使用简化系统

- ✅ 大部分常见任务（搜索、代码、文件操作）
- ✅ 需要快速响应的场景
- ✅ 技能频繁切换的场景
- ✅ 需要易于维护的系统

### 何时保留复杂系统

- ⚠️ 需要多步推理的复杂任务
- ⚠️ 需要 Agent 间协作的场景
- ⚠️ 需要持续学习的场景

对于大部分应用，**简化系统 + LLM 原生能力** 已经足够强大。
