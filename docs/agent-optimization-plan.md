# Agent 轻量化与智能化优化方案

## 当前架构分析

### 现有组件

```
src/agents/
├── SimpleCoordinatorAgent.ts    # 主协调器
├── CodeAgent.ts                 # 代码专家
├── BrowserAgent.ts              # 浏览器自动化
├── ShellAgent.ts                # 命令行专家
├── WebSearchAgent.ts            # 网络搜索
├── TavilySearchAgent.ts         # 深度搜索
├── DataAgent.ts                 # 数据分析
├── VisionAgent.ts               # 视觉理解
├── RefactorAgent.ts             # 代码重构
├── SkillManagerAgent.ts         # 技能管理
├── ModeManager.ts               # 模式管理
├── SharedContext.ts             # 对话上下文
├── HierarchicalMemoryService.ts # 分层记忆
├── ZaiMcpClient.ts              # MCP 客户端
├── SkillLoader.ts               # 技能加载
├── SkillInstaller.ts            # 技能安装
└── tools-layer/                 # 工具层
```

### 问题诊断

| 问题 | 现象 | 根因 |
|------|------|------|
| **启动慢** | 所有 Agent 同时初始化 | 无延迟加载机制 |
| **内存占用高** | 10+ Agent 常驻内存 | Agent 未按需加载 |
| **路由不准确** | 错误分配任务给 Agent | 关键词匹配过于简单 |
| **上下文冗余** | 每次都传递完整历史 | 无上下文压缩 |
| **重复初始化** | MCP/工具重复创建 | 无单例缓存 |
| **搜索慢** | 每次重新计算 embedding | 无缓存机制 |

---

## 优化方案

### 阶段 1: 轻量化重构（高优先级）

#### 1.1 Agent 延迟加载

**目标**: 只在需要时加载 Agent，不启动时不占用资源

**实现**: 创建 `AgentLoader.ts`

```typescript
/**
 * Agent 延迟加载器
 *
 * 只在首次调用时加载 Agent，之后缓存实例
 */

interface AgentFactory {
  (): Promise<IAgent>;
}

export class AgentLoader {
  private static agents = new Map<string, IAgent>();
  private static factories = new Map<string, AgentFactory>();

  /**
   * 注册 Agent 工厂函数
   */
  static register(id: string, factory: AgentFactory): void {
    this.factories.set(id, factory);
  }

  /**
   * 获取 Agent（延迟加载）
   */
  static async get(id: string): Promise<IAgent | undefined> {
    // 已缓存，直接返回
    if (this.agents.has(id)) {
      return this.agents.get(id);
    }

    // 未注册
    if (!this.factories.has(id)) {
      return undefined;
    }

    // 延迟加载
    const factory = this.factories.get(id)!;
    const agent = await factory();
    this.agents.set(id, agent);
    return agent;
  }

  /**
   * 预热加载（启动时可选调用）
   */
  static async warmup(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.get(id);
    }
  }

  /**
   * 卸载 Agent（释放内存）
   */
  static async unload(id: string): Promise<boolean> {
    const agent = this.agents.get(id);
    if (agent && typeof agent.cleanup === 'function') {
      await agent.cleanup();
    }
    return this.agents.delete(id);
  }

  /**
   * 卸载所有 Agent
   */
  static async unloadAll(): Promise<void> {
    for (const id of this.agents.keys()) {
      await this.unload(id);
    }
  }

  /**
   * 获取已加载的 Agent 列表
   */
  static getLoaded(): string[] {
    return Array.from(this.agents.keys());
  }
}

// 使用示例
AgentLoader.register('code', async () => {
  const { CodeAgent } = await import('./CodeAgent.js');
  return new CodeAgent();
});

AgentLoader.register('browser', async () => {
  const { BrowserAgent } = await import('./BrowserAgent.js');
  return new BrowserAgent();
});
```

**修改 AgentDispatcher**: 使用延迟加载

```typescript
// 修改前
private agents: Map<string, IAgent> = new Map();
// 启动时创建所有 Agent

// 修改后
async getAgent(id: string): Promise<IAgent | undefined> {
  return await AgentLoader.get(id);
}
```

---

#### 1.2 MCP 客户端单例化

**目标**: 复用 MCP 连接，避免重复启动

```typescript
/**
 * MCP 客户端单例管理器
 */

class MCPClientManager {
  private static clients = new Map<string, ZaiMcpClient>();

  static async getClient(config: {
    apiKey: string;
    mode?: 'ZHIPU' | 'ZAI';
  }): Promise<ZaiMcpClient> {
    const key = `${config.mode || 'ZHIPU'}:${config.apiKey.substring(0, 8)}`;

    if (this.clients.has(key)) {
      return this.clients.get(key)!;
    }

    const client = new ZaiMcpClient(config);
    await client.connect();
    this.clients.set(key, client);
    return client;
  }

  static async closeAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }
}
```

---

#### 1.3 工具按需注册

**目标**: 只注册当前可用的工具

```typescript
/**
 * 工具管理器优化
 */

export class ToolManager {
  private tools: Map<string, Tool> = new Map();
  private initialized = false;

  /**
   * 延迟初始化工具
   */
  async lazyInitialize(): Promise<void> {
    if (this.initialized) return;

    // 检查环境变量，决定注册哪些工具
    const hasTavily = !!process.env.TAVILY_API_KEY;
    const hasGLM = !!process.env.GLM_API_KEY;

    this.register({
      name: 'duckduckgo_search',
      description: '使用 DuckDuckGo 进行网络搜索',
      category: 'search',
      execute: async (params) => { /* ... */ },
    });

    if (hasTavily) {
      this.register({
        name: 'tavily_search',
        description: '使用 Tavily 进行深度搜索',
        category: 'search',
        execute: async (params) => { /* ... */ },
      });
    }

    this.initialized = true;
  }

  /**
   * 获取工具（自动初始化）
   */
  async get(name: string): Promise<Tool | undefined> {
    await this.lazyInitialize();
    return this.tools.get(name);
  }
}
```

---

### 阶段 2: 智能化升级（高优先级）

#### 2.1 智能路由器

**目标**: 使用 LLM 进行 Agent 路由决策，而非简单关键词匹配

**新建**: `src/agents/SmartRouter.ts`

```typescript
/**
 * 智能路由器
 *
 * 使用 LLM 分析用户意图，选择最合适的 Agent
 */

export interface RouteDecision {
  agentId: string;
  confidence: number;
  reasoning: string;
}

export class SmartRouter {
  private llmClient: any; // 你的 LLM 客户端
  private cache = new Map<string, RouteDecision>();

  constructor(llmClient: any) {
    this.llmClient = llmClient;
  }

  /**
   * 路由决策（带缓存）
   */
  async route(
    query: string,
    availableAgents: Array<{ id: string; name: string; capabilities: string[] }>
  ): Promise<RouteDecision> {
    // 检查缓存
    const cacheKey = query.substring(0, 50);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // 构建 Agent 描述
    const agentDescriptions = availableAgents.map(a =>
      `- ${a.id}: ${a.capabilities.join(', ')}`
    ).join('\n');

    // LLM 路由提示词
    const prompt = `你是一个路由专家。根据用户查询，选择最合适的 Agent。

可用 Agents:
${agentDescriptions}

用户查询: ${query}

请以 JSON 格式返回:
{
  "agentId": "最合适的 Agent ID",
  "confidence": 0.0-1.0 的置信度,
  "reasoning": "选择理由（简短）"
}`;

    const response = await this.llmClient.generate(prompt);
    const decision: RouteDecision = JSON.parse(response);

    // 缓存决策
    this.cache.set(cacheKey, decision);

    return decision;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}
```

---

#### 2.2 上下文压缩

**目标**: 减少传递给 LLM 的 token 数量

**新建**: `src/agents/ContextCompressor.ts`

```typescript
/**
 * 上下文压缩器
 *
 * 策略:
 * 1. 移除重复内容
 * 2. 摘要旧消息
 * 3. 保留最近 N 条完整消息
 */

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

export class ContextCompressor {
  /**
   * 压缩上下文
   *
   * @param messages - 原始消息列表
   * @param maxTokens - 最大 token 数量（估计）
   * @returns 压缩后的消息列表
   */
  static compress(messages: Message[], maxTokens: number = 8000): Message[] {
    if (messages.length === 0) return [];

    // 1. 估算 token（粗略：中文 1 char = 1 token, 英文 4 chars = 1 token）
    const estimateTokens = (text: string) => {
      const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const other = text.length - chinese;
      return chinese + Math.ceil(other / 4);
    };

    // 2. 保留最近的完整消息（约 50% 预算）
    const recentBudget = Math.floor(maxTokens * 0.5);
    const recent: Message[] = [];
    let recentTokens = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const tokens = estimateTokens(msg.content);

      if (recentTokens + tokens > recentBudget) break;

      recent.unshift(msg);
      recentTokens += tokens;
    }

    // 3. 压缩旧消息（摘要）
    const oldMessages = messages.slice(0, messages.length - recent.length);
    const compressed: Message[] = [];

    if (oldMessages.length > 0) {
      // 每 10 条消息生成一个摘要
      for (let i = 0; i < oldMessages.length; i += 10) {
        const batch = oldMessages.slice(i, i + 10);
        const summary = this.summarizeBatch(batch);
        compressed.push({
          role: 'system',
          content: `[历史摘要] ${summary}`,
        });
      }
    }

    return [...compressed, ...recent];
  }

  /**
   * 摘要一批消息
   */
  private static summarizeBatch(messages: Message[]): string {
    const keyPoints: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        keyPoints.push(`用户: ${msg.content.substring(0, 50)}...`);
      } else {
        // 提取助手回复的关键信息
        const lines = msg.content.split('\n').filter(l =>
          l.includes('✅') || l.includes('完成') || l.includes('结果')
        );
        if (lines.length > 0) {
          keyPoints.push(lines[0].substring(0, 50));
        }
      }
    }

    return keyPoints.join('; ');
  }
}
```

---

#### 2.3 工具调用优化（智能批处理）

**目标**: 减少不必要的 LLM 调用

```typescript
/**
 * 智能工具执行器
 *
 * 策略:
 * 1. 直接执行简单操作（如 read_file）
 * 2. 批处理相似操作
 * 3. 缓存频繁操作的结果
 */

export class SmartToolExecutor {
  private cache = new Map<string, { result: any; expiry: number }>();
  private pendingBatch = new Map<string, any[]>();

  /**
   * 执行工具（带缓存和批处理）
   */
  async execute(toolName: string, params: any): Promise<any> {
    // 1. 检查缓存
    const cacheKey = `${toolName}:${JSON.stringify(params)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.result;
    }

    // 2. 执行工具
    const result = await this.executeTool(toolName, params);

    // 3. 缓存结果（某些工具）
    if (['read_file', 'get_file_info'].includes(toolName)) {
      this.cache.set(cacheKey, {
        result,
        expiry: Date.now() + 60000, // 1 分钟
      });
    }

    return result;
  }

  /**
   * 添加到批处理队列
   */
  async addToBatch(operation: string, params: any): Promise<void> {
    if (!this.pendingBatch.has(operation)) {
      this.pendingBatch.set(operation, []);
    }
    this.pendingBatch.get(operation)!.push(params);
  }

  /**
   * 执行批处理
   */
  async flushBatch(): Promise<void> {
    for (const [operation, items] of this.pendingBatch) {
      // 批量执行
      await this.executeBatch(operation, items);
    }
    this.pendingBatch.clear();
  }
}
```

---

### 阶段 3: 性能优化（中优先级）

#### 3.1 并行处理

```typescript
/**
 * 并行任务执行器
 */

export class ParallelExecutor {
  /**
   * 并行执行多个 Agent 任务
   */
  static async executeAll<T>(
    tasks: Array<() => Promise<T>>,
    options: { concurrency?: number } = {}
  ): Promise<T[]> {
    const { concurrency = 3 } = options;
    const results: T[] = [];
    const executing: Promise<void>[] = [];

    for (const task of tasks) {
      const promise = task().then(result => {
        results.push(result);
      });

      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
        // 移除已完成的
        const settled = executing.map(p =>
          p.then(() => 'settled', () => 'settled')
        );
        await Promise.any(settled);
      }
    }

    await Promise.all(executing);
    return results;
  }
}
```

---

#### 3.2 资源监控

```typescript
/**
 * 资源监控器
 *
 * 监控内存和 CPU 使用情况
 */

import * as os from 'os';

export class ResourceMonitor {
  private static baseline = process.memoryUsage();

  /**
   * 获取当前内存使用
   */
  static getMemoryUsage(): {
    heapUsed: string;
    heapTotal: string;
    rss: string;
    external: string;
  } {
    const usage = process.memoryUsage();
    return {
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
    };
  }

  /**
   * 检查内存是否过高
   */
  static isMemoryHigh(thresholdMB: number = 500): boolean {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024 > thresholdMB;
  }

  /**
   * 获取 CPU 核心数
   */
  static getCPUCores(): number {
    return os.cpus().length;
  }

  /**
   * 获取系统负载
   */
  static getLoadAverage(): number[] {
    return os.loadavg();
  }
}
```

---

## 实施计划

### Week 1: 轻量化重构

| 任务 | 文件 | 预期效果 |
|------|------|----------|
| 实现 AgentLoader | `src/agents/AgentLoader.ts` | 启动时间 -60% |
| MCP 客户端单例化 | `src/agents/MCPClientManager.ts` | 内存 -30MB |
| 工具按需注册 | `src/agents/tools-layer/index.ts` | 初始化 -2s |

### Week 2: 智能化升级

| 任务 | 文件 | 预期效果 |
|------|------|----------|
| 实现智能路由器 | `src/agents/SmartRouter.ts` | 路由准确率 +30% |
| 上下文压缩器 | `src/agents/ContextCompressor.ts` | Token 使用 -40% |
| 智能工具执行器 | `src/agents/SmartToolExecutor.ts` | 响应时间 -20% |

### Week 3: 性能优化

| 任务 | 文件 | 预期效果 |
|------|------|----------|
| 并行执行器 | `src/agents/ParallelExecutor.ts` | 并发处理能力 3x |
| 资源监控器 | `src/agents/ResourceMonitor.ts` | 可观测性 +100% |

---

## 预期效果

| 指标 | 优化前 | 优化后 | 改进 |
|------|--------|--------|------|
| **启动时间** | ~8s | ~3s | -62% |
| **内存占用** | ~350MB | ~180MB | -48% |
| **Token 使用** | ~8000/轮 | ~4800/轮 | -40% |
| **路由准确率** | ~65% | ~85% | +31% |
| **响应时间** | ~3s | ~2s | -33% |

---

## 快速开始

### 1. 安装新组件

```bash
# 无需新依赖，使用现有技术栈
```

### 2. 更新 AgentDispatcher

```typescript
// 修改 src/agents/AgentDispatcher.ts
import { AgentLoader } from './AgentLoader.js';

async getAgent(id: string): Promise<IAgent | undefined> {
  return await AgentLoader.get(id);
}
```

### 3. 启用智能路由（可选）

```typescript
// 在 src/agents/AgentDispatcher.ts 中
import { SmartRouter } from './SmartRouter.js';

private router = new SmartRouter(this.llmClient);

async dispatch(message: string): Promise<IAgent> {
  const decision = await this.router.route(message, this.availableAgents);
  return await this.getAgent(decision.agentId);
}
```

---

## 注意事项

1. **向后兼容**: 所有改动向后兼容，可逐步迁移
2. **可观测性**: 添加日志监控优化效果
3. **A/B 测试**: 可对比新旧方案效果
4. **回滚方案**: 保留原有代码，出现问题可快速回滚
