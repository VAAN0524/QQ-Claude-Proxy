# QQ-Claude-Proxy 架构重新设计

## 🎯 设计目标

**核心理念**: 让 LLM 做最擅长的事，减少不必要的抽象和复杂性

### 两种模式对比

| 模式 | 定位 | 核心机制 | 适用场景 |
|------|------|----------|----------|
| **Team** | 复杂任务协作 | 总指挥 + 并行专家 | 多步骤、多领域的复杂任务 |
| **Simple** | 单兵作战 | Skills 动态切换 | 日常任务、快速响应 |

---

## 🏢 Team 模式 - 总指挥 + 专家团队

### 设计理念

**像真实的公司项目管理一样运作**：
- **总指挥 (Coordinator)**: 项目经理，负责拆解、派发、监督、汇总
- **专家 Agents**: 各领域专家，独立工作，专业能力

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Coordinator (总指挥)                       │
│                                                              │
│  职责：                                                        │
│  1. 接收用户任务                                              │
│  2. 分析任务复杂度和所需技能                                    │
│  3. 拆解为可并行执行的子任务                                    │
│  4. 识别需要的专家角色                                          │
│
│  任务拆解策略：                                                │
│  - 搜索类任务 → Search Expert                                  │
│  - 代码类任务 → Code Expert                                    │
│  - 网页类任务 → Browser Expert                                 │
│  - 数据类任务 → Data Expert                                   │
│  - 系统类任务 → Shell Expert                                  │
│                                                              │
│  执行流程：                                                    │
│  1. 派发任务 → 专家 Agents (并行执行)                         │
│  2. 监督进展 → 实时跟踪每个专家的状态                            │
│  3. 实时调配 → 根据进展动态调整                                  │
│  4. 结果汇总 → 整合各专家的输出                                  │
│  5. 质量检查 → 确保最终结果满足用户需求                            │
│                                                              │
└────────┬────────────┬────────────┬────────────┬──────────────┬───┘
         │            │            │            │              │
    ┌────▼────┐  ┌───▼────┐  ┌────▼─────┐  ┌─────────┐  ┌────────▼─┐
    │Code     │  │Browser│  │Shell    │  │Search   │  │Data      │
    │Expert   │  │Expert│  │Expert   │  │Expert   │  │Expert    │
    │         │  │      │  │         │  │         │  │          │
    │并行工作  │  │并行  │  │并行     │  │并行     │  │并行工作   │
    └────┬────┘  └───┬────┘  └────┬─────┘  └────┬────┘  └────┬───────┘
         │           │           │              │             │
         └───────────┴───────────┴──────────────┴─────────────┘
                            │
                    ┌───────▼────────┐
                    │   Coordinator   │
                    │   汇总结果      │
                    └─────────────────┘
```

### 工作流程

#### 阶段 1: 任务分析

```
用户输入: "帮我分析 GitHub 上的 myskills 项目，写一个使用指南，并生成演示视频脚本"

Coordinator 分析:
├─ 任务 1: 搜索 GitHub 项目信息 → Search Expert
├─ 任务 2: 读取代码库结构 → Code Expert
├─ 任务 3: 编写使用指南 → Code Expert
├─ 任务 4: 生成视频脚本 → Code Expert
└─ 任务 5: 整合最终输出 → Coordinator
```

#### 阶段 2: 并行派发

```typescript
// Coordinator 派发任务
const tasks = [
  {
    id: 'task-1',
    agent: 'search-expert',
    task: '搜索 VAAN0524/myskills GitHub 项目',
    priority: 'high'
  },
  {
    id: 'task-2',
    agent: 'code-expert',
    task: '读取项目结构和主要文件',
    priority: 'high',
    dependsOn: ['task-1']  // 等搜索完成后获取项目地址
  },
  {
    id: 'task-3',
    agent: 'code-expert',
    task: '分析项目功能并编写使用指南',
    priority: 'medium',
    dependsOn: ['task-2']
  },
  {
    id: 'task-4',
    agent: 'code-expert',
    task: '生成演示视频脚本',
    priority: 'medium',
    dependsOn: ['task-3']
  }
];

// 并行执行
const results = await Promise.all([
  expertAgent1.execute(task1),
  expertAgent2.execute(task2),
  // ...
]);
```

#### 阶段 3: 进度监督

```typescript
// Coordinator 实时跟踪进度
interface TaskProgress {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  agent: string;
  progress: number;  // 0-100
  result?: any;
  error?: string;
}

// 监督逻辑
while (hasIncompleteTasks()) {
  const progress = await getAllProgress();

  // 实时调配
  if (progress['task-2'].failed) {
    // 任务 2 失败，影响任务 3 和 4
    logger.warn('任务 2 失败，调整计划');
    // 可以选择重试或使用备用方案
  }

  if (progress['task-1'].completed && progress['task-2'].running) {
    // 任务 1 完成，任务 2 需要任务 1 的结果
    const task1Result = progress['task-1'].result;
    await updateTask('task-2', { context: task1Result });
  }

  await sleep(1000); // 每秒检查一次
}
```

#### 阶段 4: 结果汇总

```typescript
// 汇总各专家的结果
function consolidateResults(results: Map<string, any>): string {
  let output = '# 项目分析报告\n\n';

  // 搜索专家的结果
  if (results.has('task-1')) {
    output += '## 项目概况\n' + results.get('task-1').summary + '\n\n';
  }

  // 代码专家的结果
  if (results.has('task-2')) {
    output += '## 代码结构\n' + results.get('task-2').structure + '\n\n';
  }

  // 使用指南
  if (results.has('task-3')) {
    output += '## 使用指南\n' + results.get('task-3').content + '\n\n';
  }

  // 视频脚本
  if (results.has('task-4')) {
    output += '## 演示脚本\n' + results.get('task-4').script + '\n\n';
  }

  return output;
}
```

### 关键设计原则

#### 1. 明确的职责划分

| 组件 | 职责 | 不负责 |
|------|------|--------|
| **Coordinator** | 任务拆解、派发、监督、汇总 | 具体执行 |
| **Expert Agents** | 具体领域执行 | 跨领域协调 |

#### 2. 标准化的通信协议

```typescript
// 从 Coordinator 到 Expert
interface TaskDispatch {
  taskId: string;
  task: string;
  context?: any;      // 来自其他专家的结果
  dependencies?: string[];  // 依赖的任务ID
  timeout: number;
}

// 从 Expert 到 Coordinator
interface TaskResult {
  taskId: string;
  status: 'success' | 'partial' | 'failed';
  result: any;
  progress?: number;
  nextTasks?: TaskDispatch[];  // 专家可以建议后续任务
}
```

#### 3. 错误处理和重试

```typescript
// Coordinator 的错误处理策略
async function handleTaskFailure(failedTask: TaskDispatch, error: string) {
  const dependentTasks = getDependentTasks(failedTask.taskId);

  // 策略 1: 重试
  if (error.retriable) {
    logger.info(`重试任务 ${failedTask.taskId}`);
    return await dispatchTask({ ...failedTask, retryCount: (failedTask.retryCount || 0) + 1 });
  }

  // 策略 2: 使用备用专家
  const backupExpert = findBackupExpert(failedTask.agent);
  if (backupExpert) {
    logger.info(`使用备用专家 ${backupExpert} 重新执行`);
    return await dispatchTask({ ...failedTask, agent: backupExpert });
  }

  // 策略 3: 调整计划
  const alternativePlan = generateAlternativePlan(failedTask);
  return await executeAlternativePlan(alternativePlan);
}
```

### 实现 API

```typescript
// 专家 Agent 接口
interface ExpertAgent {
  id: string;
  name: string;
  expertise: string[];

  // 执行任务
  execute(task: TaskDispatch): Promise<TaskResult>;

  // 能力检查
  canHandle(task: string): number;
}

// Coordinator 接口
interface TeamCoordinator {
  // 分析并拆解任务
  analyzeAndDecompose(userRequest: string): TaskDecomposition;

  // 派发任务
  dispatchTasks(tasks: TaskDispatch[]): Promise<void>;

  // 监督进度
  superviseProgress(): Promise<Map<string, TaskProgress>>;

  // 汇总结果
  consolidateResults(results: Map<string, any>): string;
}
```

---

## 🎭 Simple 模式 - 单 Agent + Skills 自主切换

### 设计理念

**像变色龙一样，根据环境改变能力和外貌**：
- 接收任务
- 识别任务类型
- 加载对应的 SKILL.md
- 切换身份和能力
- 直接执行
- 返回结果

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Simple Agent                              │
│                                                              │
│  核心：轻量、快速、灵活                                       │
│  - 无复杂推理，直接执行                                       │
│  - Skills 即插即用                                           │
│  - 根据任务自主切换                                         │
│                                                              │
│  决策流程：                                                    │
│  1. 接收任务 → 提取特征                                       │
│  2. 特征匹配 → 选择 SKILL.md                                   │
│  3. 加载技能 → 切换系统提示词                                   │
│  4. 执行能力 → 完成任务                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                    ↓
         根据任务类型动态加载 SKILL.md
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  skills/search.md     →  搜索专家身份                         │
│    - 系统提示: "你是网络搜索专家..."                        │
│    - 工具: tavily_search, web_search                         │
│    - 能力: 搜索、筛选、总结                                 │
│                                                              │
│  skills/code.md       →  编程专家身份                         │
│    - 系统提示: "你是编程助手..."                            │
│    - 工具: generate_code, explain_code                         │
│    - 能力: 编码、调试、重构                                     │
│                                                              │
│  skills/file.md       →  文件管理专家身份                       │
│    - 系统提示: "你是文件管理专家..."                        │
│    - 工具: read_file, write_file, list_files                      │
│    - 能力: 读取、编辑、管理文件                                 │
│                                                              │
│  skills/default.md    →  通用助手身份 (默认)                     │
│    - 系统提示: "你是一个智能助手..."                        │
│    - 工具: llm_chat (通用对话)                                   │
│    - 能力: 问答、建议、帮助                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 工作流程

#### 示例 1: 搜索任务

```
用户: "搜索 TypeScript 最新版本"

↓ Simple Agent 识别特征
特征: ['搜索', 'TypeScript', '版本']

↓ 匹配到 skills/search.md
技能: search
身份: 搜索专家

↓ 加载技能
系统提示: "你是网络搜索专家..."
工具: tavily_search

↓ 执行搜索
调用 tavily_search("TypeScript latest version")

↓ 返回结果
"TypeScript 5.7 是当前最新版本..."
```

#### 示例 2: 编程任务

```
用户: "帮我写一个 Python 斐波那契函数"

↓ Simple Agent 识别特征
特征: ['写', 'Python', '函数', '斐波那契']

↓ 匹配到 skills/code.md
技能: code
身份: 编程助手

↓ 加载技能
系统提示: "你是编程助手..."
工具: generate_code

↓ 执行编程
调用 generate_code("Python 斐波那契函数")

↓ 返回结果
完整的 Python 代码 + 使用说明
```

#### 示例 3: 文件任务

```
用户: "把 README.md 发给我"

↓ Simple Agent 识别特征
特征: ['发送', '文件']

↓ 匹配到 skills/file.md
技能: file
身份: 文件管理专家

↓ 加载技能
系统提示: "你是文件管理专家..."
工具: send_file

↓ 执行文件操作
调用 send_file("README.md")

↓ 返回结果
"文件已发送"
```

### 关键设计原则

#### 1. 特征提取简单有效

```typescript
// 特征关键词
const skillFeatures = {
  'search': ['搜索', 'search', '查找', 'find', 'tavily'],
  'code': ['代码', '编程', 'code', '函数', '写', '实现'],
  'file': ['文件', '发送', 'file', '下载', '保存'],
  'browser': ['网页', '访问', '打开', 'browser'],
  'default': [], // 默认匹配所有
};

// 评分算法
function scoreSkill(content: string, skill: string): number {
  const features = skillFeatures[skill] || [];
  let score = 0;

  for (const feature of features) {
    if (content.toLowerCase().includes(feature.toLowerCase())) {
      score += 10;
    }
  }

  // 如果有明确特征，优先级更高
  if (score > 0 && skill !== 'default') {
    score += 50;
  }

  return score;
}

// 选择最高分的技能
function selectSkill(content: string): string {
  let bestSkill = 'default';
  let bestScore = 0;

  for (const skill of Object.keys(skillFeatures)) {
    const score = scoreSkill(content, skill);
    if (score > bestScore) {
      bestScore = score;
      bestSkill = skill;
    }
  }

  return bestSkill;
}
```

#### 2. SKILL.md 结构标准化

```markdown
# 技能名称

## 身份提示
[描述这个身份的定位、核心能力和工作方式]

## 系统提示
[LLM 的行为指导]

## 工具配置
```json
{
  "tools": ["tool1", "tool2"],
  "primary_tool": "tool1"
}
```

## 规则
[这个身份需要遵守的规则]

## 示例
输入: [示例输入]
输出: [示例输出]
```

#### 3. 工具调用标准化

```typescript
// 工具执行接口
interface ToolExecution {
  toolName: string;
  params: Record<string, any>;
}

// 执行工具
async function executeTool(
  toolName: string,
  params: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case 'tavily_search':
      return await tavilySearch(params.query);
    case 'web_search':
      return await webSearch(params.query);
    case 'generate_code':
      return await generateCode(params.language, params.task);
    case 'send_file':
      return await sendFile(params.filePath);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
```

### 实现 API

```typescript
// Simple Agent 接口
interface SimpleAgent {
  // 识别技能
  identifySkill(content: string): string;

  // 加载技能
  loadSkill(skillName: string): Promise<void>;

  // 执行任务
  executeTask(content: string, context: AgentContext): Promise<string>;
}

// Skill 加载器
interface SkillLoader {
  // 读取 SKILL.md
  readSkill(skillName: string): Promise<SkillMetadata>;

  // 解析技能
  parseSkill(content: string): SkillMetadata;
}
```

---

## 📊 两种模式的完整对比

| 方面 | Team 模式 | Simple 模式 |
|------|----------|------------|
| **核心理念** | 协作分工 | 自主适应 |
| **任务类型** | 复杂、多步骤 | 简单、单步骤 |
| **Agent 数量** | 1 + N (Coordinator + Experts) | 1 (Simple) |
| **决策方式** | Coordinator 分析决策 | Simple Agent 直接决策 |
| **执行方式** | 并行执行 | 直接执行 |
| **Skills** | 固定在 Expert 中 | 动态切换 SKILL.md |
| **响应时间** | 较慢 (拆解+并行+汇总) | 快速 (直接执行) |
| **适用场景** | 复杂项目、多领域协作 | 日常任务、快速响应 |

---

## 🚀 实现路线图

### Phase 1: 简化 Simple 模式 (已完成基础)

- [x] 创建 SimpleCoordinatorAgent
- [x] 创建 SKILL.md 结构
- [ ] 连接实际工具 (Tavily, Zhipu, etc.)
- [ ] 优化特征识别算法

### Phase 2: 重新设计 Team 模式

- [ ] 设计 TaskDecomposition API
- [ ] 实现 TaskDispatcher (并行派发)
- [ ] 实现 ProgressSupervisor (进度监督)
- [ ] 实现 ResultConsolidator (结果汇总)
- [ ] 定义 Expert Agents 接口

### Phase 3: 创建 Expert Agents

- [ ] SearchExpert (搜索专家)
- [ ] CodeExpert (代码专家)
- [ ] BrowserExpert (浏览器专家)
- [ ] ShellExpert (系统专家)
- [ ] DataExpert (数据专家)

### Phase 4: 集成和测试

- [ ] 更新 ModeManager (支持三种模式)
- [ ] 集成到 index.ts
- [ ] 端到端测试
- [ ] 性能对比

---

## 📋 下一步行动

### 选项 1: 先完善 Simple 模式
- 连接实际工具
- 优化特征识别
- 添加更多 SKILL.md

### 选项 2: 重新设计 Team 模式
- 设计新的架构
- 实现并行派发
- 实现进度监督

### 选项 3: 两者并行推进
- 同时完善两种模式
- 确保 ModeManager 正确切换

你想要从哪个开始？
