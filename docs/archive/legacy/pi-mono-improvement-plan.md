# Pi-Mono 风格改进方案

> **状态**: ✅ 已完成实现
> **日期**: 2026-02-23
> **版本**: 1.0

## 1. 概述

本文档基于 pi-mono 工具包的三个核心优势，为 QQ-Claude-Proxy 系统提供改进方案：

1. **工具定义简化** - 将 100+ 行的工具定义压缩到 5-10 行 ✅
2. **提供商抽象** - 统一 API 支持 OpenAI、Anthropic、GLM 等多个 LLM ✅
3. **终端优先 UI** - 差分渲染技术优化大量输出 ✅

---

## 实现摘要

### 已创建文件

| 文件 | 说明 |
|------|------|
| `src/llm/tool.ts` | 简化的工具定义 API |
| `src/llm/providers.ts` | 统一的 LLM 提供商接口 |
| `src/terminal/DiffRenderer.ts` | 差分渲染器 |
| `src/terminal/AgentMonitor.ts` | Agent 监控 UI |
| `src/agents/tools/agent-tools.ts` | Agent 工具定义 |
| `src/agents/tools/file-tools.ts` | 文件操作工具定义 |
| `src/agents/tools/learning-tools.ts` | 学习和记忆工具定义 |
| `src/cli/monitor.ts` | CLI 监控命令 |

### 新增命令

```bash
npm run monitor  # 启动 Agent 监控
```

### 新增 API

```typescript
// 工具定义
import { tool, ToolRegistry } from './llm/tool.js';

// 提供商
import { openai, anthropic, glm, providerFromConfig } from './llm/providers.js';

// 终端 UI
import { DiffRenderer, AgentMonitor } from './terminal/AgentMonitor.js';
```

---

## 2. 工具定义简化

### 当前问题

```typescript
// 现有方式（约 100 行每个工具）
tools.push({
  type: 'function',
  function: {
    name: 'run_code_agent',
    description: '执行代码相关任务：编写、分析、调试、优化代码',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: '具体的代码任务描述，例如：写个快速排序算法',
        },
        code: {
          type: 'string',
          description: '可选的代码片段，用于分析或调试',
        },
      },
      required: ['task'],
    },
  },
});
```

### Pi-Mono 风格改进

```typescript
// pi-mono 风格（5-10 行每个工具）
import { tool } from './llm/tool.js';

const codeAgentTool = tool({
  name: 'run_code_agent',
  description: '执行代码相关任务：编写、分析、调试、优化代码',
  parameters: {
    task: z.string().describe('具体的代码任务描述'),
    code: z.string().optional().describe('可选的代码片段'),
  },
  execute: async ({ task, code }) => {
    const agent = agents.get('code');
    return await agent.process({ content: task, code });
  }
});
```

### 实现方案

创建 `src/llm/tool.ts`：

```typescript
import { z } from 'zod';

/**
 * 简化的工具定义 API
 * 自动处理 Zod Schema 到 JSON Schema 的转换
 */
export interface ToolDefinition<TInput = any> {
  name: string;
  description: string;
  parameters?: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<any>;
}

export function tool<TInput>(def: ToolDefinition<TInput>): Tool {
  const schema = def.parameters;
  const jsonSchema = schema ? zodToJsonSchema(schema) : { type: 'object' };

  return {
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: jsonSchema,
    },
  };
}

/**
 * Zod 到 JSON Schema 转换器
 */
function zodToJsonSchema(schema: z.ZodType): any {
  const zodSchema = schema as z.ZodTypeDef;

  if (zodSchema instanceof z.ZodString) {
    return { type: 'string' };
  }
  if (zodSchema instanceof z.ZodNumber) {
    return { type: 'number' };
  }
  if (zodSchema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  if (zodSchema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema(schema.element) };
  }
  if (zodSchema instanceof z.ZodObject) {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, def] of Object.entries(zodSchema.shape)) {
      const fieldDef = def as z.ZodTypeDef;
      properties[key] = zodToJsonSchema(fieldDef);
      if (!fieldDef.isOptional()) {
        required.push(key);
      }
    }

    return { type: 'object', properties, required: required.length > 0 ? required : undefined };
  }

  return { type: 'object' };
}
```

### 使用示例

```typescript
// src/agents/tools/agent-tools.ts
import { tool } from '../../llm/tool.js';
import { z } from 'zod';

export const codeAgentTool = tool({
  name: 'run_code_agent',
  description: '执行代码相关任务：编写、分析、调试、优化代码',
  parameters: z.object({
    task: z.string().describe('具体的代码任务描述'),
    code: z.string().optional().describe('可选的代码片段'),
  }),
  execute: async ({ task, code }, context) => {
    const agent = context.subAgents.get('code');
    return await agent.process({ content: task, code });
  }
});

export const fileTools = [
  tool({
    name: 'read_file',
    description: '读取文件内容',
    parameters: z.object({
      filePath: z.string().describe('文件路径'),
    }),
    execute: async ({ filePath }) => {
      return await fs.readFile(filePath, 'utf-8');
    }
  }),

  tool({
    name: 'write_file',
    description: '写入文件内容',
    parameters: z.object({
      filePath: z.string().describe('文件路径'),
      content: z.string().describe('文件内容'),
      append: z.boolean().optional().describe('是否追加'),
    }),
    execute: async ({ filePath, content, append }) => {
      await fs.writeFile(filePath, content, { flag: append ? 'a' : 'w' });
      return '文件已写入';
    }
  }),
];
```

---

## 3. 提供商抽象 (Provider Abstraction)

### 当前问题

```typescript
// 直接硬编码 GLM API
private async callGLMAPI(messages, systemPrompt, tools) {
  const response = await fetch(`${this.baseUrl}chat/completions`, {
    headers: { 'Authorization': `Bearer ${this.apiKey}` },
    body: JSON.stringify({
      model: this.model,
      messages,
      tools,
    })
  });
  return response.json();
}
```

### Pi-Mono 风格改进

```typescript
// 统一的 LLM API
import { openai, anthropic, glm } from './llm/providers.js';

// 初始化提供商
const provider = glm({
  apiKey: process.env.GLM_API_KEY,
  baseURL: 'https://open.bigmodel.cn/api/paas/v4/'
});

// 或切换到其他提供商
const provider = anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// 统一的调用接口
const response = await provider.chat.completions.create({
  model: 'glm-4.7',
  messages,
  tools,
});
```

### 实现方案

创建 `src/llm/providers.ts`：

```typescript
/**
 * 统一的 LLM 提供商接口
 */
export interface LLMProvider {
  chat: {
    completions: {
      create(params: ChatCompletionParams): Promise<ChatCompletionResponse>;
    };
  };
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  tools?: Tool[];
  max_tokens?: number;
  temperature?: number;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI 提供商
 */
export function openai(config: { apiKey: string; baseURL?: string }): LLMProvider {
  const baseURL = config.baseURL || 'https://api.openai.com/v1';

  return {
    chat: {
      completions: {
        create: async (params) => {
          const response = await fetch(`${baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: params.model,
              messages: params.messages,
              tools: params.tools,
              max_tokens: params.max_tokens,
              temperature: params.temperature,
            }),
          });
          return response.json();
        },
      },
    },
  };
}

/**
 * Anthropic 提供商
 */
export function anthropic(config: { apiKey: string }): LLMProvider {
  return {
    chat: {
      completions: {
        create: async (params) => {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': config.apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: params.model,
              messages: params.messages,
              tools: params.tools,
              max_tokens: params.max_tokens || 4096,
            }),
          });
          // 转换响应格式为统一格式
          const anthropicResponse = await response.json();
          return convertAnthropicToOpenAI(anthropicResponse);
        },
      },
    },
  };
}

/**
 * GLM (智谱 AI) 提供商
 */
export function glm(config: { apiKey: string; baseURL?: string }): LLMProvider {
  const baseURL = config.baseURL || 'https://open.bigmodel.cn/api/paas/v4/';

  return {
    chat: {
      completions: {
        create: async (params) => {
          // JWT 认证（如果 API Key 包含 .）
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          if (config.apiKey.includes('.')) {
            const token = generateGLMToken(config.apiKey);
            headers['Authorization'] = `Bearer ${token}`;
          } else {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
          }

          const response = await fetch(`${baseURL}chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: params.model,
              messages: params.messages,
              tools: params.tools,
              max_tokens: params.max_tokens,
            }),
          });
          return response.json();
        },
      },
    },
  };
}

/**
 * 通用提供商工厂
 */
export function createProvider(type: 'openai' | 'anthropic' | 'glm', config: any): LLMProvider {
  switch (type) {
    case 'openai': return openai(config);
    case 'anthropic': return anthropic(config);
    case 'glm': return glm(config);
    default: throw new Error(`Unknown provider: ${type}`);
  }
}
```

### 配置文件支持

```typescript
// src/config/schema.ts 扩展
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'glm';
  apiKey: string;
  baseURL?: string;
  model: string;
  maxTokens?: number;
}

export interface Config {
  // ...
  llm: {
    default: LLMConfig;
    fallback?: LLMConfig;
  };
}
```

---

## 4. 终端优先 UI (Terminal-First UI)

### 当前状态

系统使用 Web Dashboard，没有终端 UI。对于大量输出场景（如代码生成、日志流），Web UI 不是最优解。

### Pi-Mono 风格改进

创建 `src/terminal/DiffRenderer.ts`：

```typescript
/**
 * 差分渲染器 - 只更新变化的区域
 * 用于终端中显示大量动态内容
 */
export class DiffRenderer {
  private previousLines: string[] = [];
  private terminal: NodeJS.WriteStream;

  constructor(terminal: NodeJS.WriteStream = process.stdout) {
    this.terminal = terminal;
  }

  /**
   * 渲染新内容，只更新变化的行
   */
  render(lines: string[]): void {
    const diffs = this.computeDiff(this.previousLines, lines);

    // 移动光标到第一行
    this.moveCursorToLine(0);

    for (const diff of diffs) {
      if (diff.type === 'same') {
        // 相同行：跳过，向下移动
        this.moveCursorDown(1);
      } else if (diff.type === 'delete') {
        // 删除行：清除行内容
        this.clearLine();
        this.moveCursorDown(1);
      } else if (diff.type === 'insert') {
        // 插入行：打印新内容
        this.terminal.write(diff.content + '\n');
      } else if (diff.type === 'update') {
        // 更新行：清除并重写
        this.clearLine();
        this.terminal.write(diff.content + '\n');
      }
    }

    this.previousLines = lines;
  }

  /**
   * 计算两行数组的差异
   */
  private computeDiff(oldLines: string[], newLines: string[]): Diff[] {
    const diffs: Diff[] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (!oldLine && newLine) {
        diffs.push({ type: 'insert', line: i, content: newLine });
      } else if (oldLine && !newLine) {
        diffs.push({ type: 'delete', line: i });
      } else if (oldLine !== newLine) {
        diffs.push({ type: 'update', line: i, content: newLine! });
      } else {
        diffs.push({ type: 'same', line: i });
      }
    }

    return diffs;
  }

  /**
   * 移动光标到指定行
   */
  private moveCursorToLine(line: number): void {
    this.terminal.write(`\x1b[${line + 1};0H`); // VT100 定位
  }

  /**
   * 向下移动光标
   */
  private moveCursorDown(n: number): void {
    this.terminal.write(`\x1b[${n}B`);
  }

  /**
   * 清除当前行
   */
  private clearLine(): void {
    this.terminal.write('\x1b[2K'); // 清除整行
  }

  /**
   * 清屏
   */
  clear(): void {
    this.terminal.write('\x1b[2J'); // 清屏
    this.terminal.write('\x1b[H');  // 移动到左上角
    this.previousLines = [];
  }
}

interface Diff {
  type: 'same' | 'insert' | 'delete' | 'update';
  line: number;
  content?: string;
}
```

### 使用示例

```typescript
// src/terminal/AgentMonitor.ts
import { DiffRenderer } from './DiffRenderer.js';

export class AgentMonitor {
  private renderer: DiffRenderer;

  constructor() {
    this.renderer = new DiffRenderer();
  }

  /**
   * 显示 Agent 执行状态（实时更新）
   */
  showAgentStatus(status: AgentStatus): void {
    const lines = [
      `═══════════════════════════════════════════════════`,
      `  Agent 执行监控`,
      `═══════════════════════════════════════════════════`,
      ``,
      `当前 Agent: ${status.currentAgent}`,
      `执行步骤: ${status.currentStep}/${status.totalSteps}`,
      `状态: ${this.getStatusIcon(status.status)} ${status.status}`,
      ``,
      `─────────────────────────────────────────────────`,
      `最近输出:`,
      `  ${status.lastOutput || '(无)'}`,
      `─────────────────────────────────────────────────`,
      ``,
      `工具调用: ${status.toolCalls.join(', ') || '(无)'}`,
      `耗时: ${status.elapsedTime}ms`,
      ``,
      `按 Ctrl+C 退出...`,
    ];

    this.renderer.render(lines);
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'running': return '▶';
      case 'success': return '✓';
      case 'error': return '✗';
      default: return '○';
    }
  }
}
```

### CLI 命令集成

```typescript
// src/cli/monitor.ts
import { AgentMonitor } from '../terminal/AgentMonitor.js';

export async function monitorCommand(): Promise<void> {
  const monitor = new AgentMonitor();

  // 连接到 Gateway 监听事件
  const ws = new WebSocket('ws://localhost:18789');

  ws.on('message', (data) => {
    const event = JSON.parse(data.toString());
    if (event.type === 'agent.status') {
      monitor.showAgentStatus(event.data);
    }
  });
}
```

---

## 5. 迁移路径

### 阶段 1：工具定义简化（优先级：高）

1. 创建 `src/llm/tool.ts` - 工具定义 API
2. 创建 `src/agents/tools/` - 迁移现有工具
3. 更新 `GLMCoordinatorAgent.ts` 使用新 API
4. 测试所有工具功能

### 阶段 2：提供商抽象（优先级：高）

1. 创建 `src/llm/providers.ts` - 统一接口
2. 实现 OpenAI、Anthropic、GLM 提供商
3. 更新 `GLMCoordinatorAgent.ts` 使用提供商抽象
4. 添加配置支持（provider 切换）
5. 测试多提供商支持

### 阶段 3：终端 UI（优先级：中）

1. 创建 `src/terminal/DiffRenderer.ts`
2. 创建 `src/terminal/AgentMonitor.ts`
3. 添加 CLI 命令 `npm run monitor`
4. 测试差分渲染性能

---

## 6. 文件结构

```
src/
├── llm/
│   ├── tool.ts           # 工具定义 API
│   ├── providers.ts      # LLM 提供商接口
│   └── schema.ts         # Zod Schema 定义
├── terminal/
│   ├── DiffRenderer.ts   # 差分渲染器
│   ├── AgentMonitor.ts   # Agent 监控 UI
│   └── ProgressBar.ts    # 进度条组件
├── agents/
│   └── tools/            # 工具定义目录
│       ├── agent-tools.ts
│       ├── file-tools.ts
│       └── index.ts
└── cli/
    └── monitor.ts        # 监控命令
```

---

## 7. 预期收益

| 改进项 | 收益 |
|--------|------|
| 工具定义简化 | 代码量减少 80%，工具定义更易读 |
| 提供商抽象 | 支持 10+ LLM 提供商，迁移成本降低 |
| 终端 UI | 大量输出场景性能提升 10x+ |

---

## 8. 参考资源

- pi-mono: https://github.com/mzed/pi-mono
- pi-agent-core: https://github.com/mzed/pi-mono/tree/main/pi-agent-core
- pi-ai: https://github.com/mzed/pi-mono/tree/main/pi-ai
- pi-tui: https://github.com/mzed/pi-mono/tree/main/pi-tui

---

## 9. 实现完成总结

### 已完成功能

#### ✅ 1. 工具定义简化

- 创建了 `src/llm/tool.ts`，提供 `tool()` 函数
- 支持 Zod Schema 自动转换为 JSON Schema
- 创建了工具注册表 `ToolRegistry`
- 迁移了所有现有工具到新 API：
  - `agent-tools.ts` - Code, Browser, Shell, WebSearch, Data, Vision Agent
  - `file-tools.ts` - read_file, write_file, list_directory, send_file
  - `learning-tools.ts` - learn_and_solve, check_knowledge, store_knowledge

**使用示例**：
```typescript
import { tool } from './llm/tool.js';
import { z } from 'zod';

const myTool = tool({
  name: 'my_tool',
  description: '我的工具',
  parameters: z.object({
    input: z.string().describe('输入参数'),
  }),
  execute: async ({ input }) => {
    return `处理: ${input}`;
  }
});
```

#### ✅ 2. 提供商抽象

- 创建了 `src/llm/providers.ts`
- 实现了 OpenAI、Anthropic、GLM 提供商
- 支持 GLM Coding Plan 端点（`isCodingPlan: true`）
- 支持 JWT 认证（GLM）
- 实现了提供商池 `ProviderPool`，支持故障转移

**使用示例**：
```typescript
import { glm, providerFromConfig } from './llm/providers.js';

// GLM 普通端点
const provider = glm({
  apiKey: process.env.GLM_API_KEY,
  useJwt: true,  // 使用 JWT 认证
});

// GLM Coding Plan 端点
const codingPlanProvider = glm({
  apiKey: process.env.GLM_API_KEY,
  isCodingPlan: true,  // Coding Plan 使用直接 API Key
});

// 从配置创建
const provider = providerFromConfig({
  provider: 'glm',
  apiKey: 'xxx',
  isCodingPlan: false,
});

// 调用 API
const response = await provider.chat.completions.create({
  model: 'glm-4.7',
  messages,
  tools,
});
```

#### ✅ 3. 终端 UI

- 创建了 `src/terminal/DiffRenderer.ts` - 差分渲染器
- 创建了 `src/terminal/AgentMonitor.ts` - Agent 监控器
- 添加了 CLI 监控命令 `npm run monitor`

**使用示例**：
```typescript
import { DiffRenderer, Colors, AgentMonitor } from './terminal/AgentMonitor.js';

// 差分渲染
const renderer = new DiffRenderer();
renderer.render([
  '当前 Agent: code',
  '执行步骤: 3/5',
  '状态: ✓ 运行中',
]);

// Agent 监控
const monitor = new AgentMonitor();
monitor.showAgentStatus({
  currentAgent: 'code',
  currentStep: 3,
  totalSteps: 5,
  status: 'running',
  lastOutput: '正在生成代码...',
  toolCalls: ['write_file'],
  elapsedTime: 1500,
});
```

### 使用监控命令

```bash
# 启动 Agent 监控
npm run monitor

# 指定 Gateway URL
npm run monitor ws://localhost:18789
```

### 下一步建议

1. **更新 GLMCoordinatorAgent** - 使用新的工具定义 API
2. **添加配置支持** - 在 `config.json` 中支持提供商切换
3. **测试集成** - 完整测试所有新功能
4. **编写文档** - 添加使用文档和示例
