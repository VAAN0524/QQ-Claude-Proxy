# 自主Agent系统 - 完整架构设计

**设计日期**: 2026-03-17
**设计目标**: 实现完全自主的Simple模式Agent
**核心理念**: Agent具备分层记忆、上下文感知、自主决策能力

---

## 🎯 核心设计理念

### Agent自主性

Agent不是简单的指令执行器，而是具备：
1. **自我认知**：知道"我是谁"（身份、人格、能力）
2. **记忆能力**：短中长期分层记忆系统
3. **上下文感知**：整合所有信息理解当前状态
4. **自主决策**：通过LLM分析并制定执行计划
5. **自我改进**：从执行结果中学习和优化

### 与CLI模式的关系

```
┌─────────────────────────────────────────────────┐
│                   QQ Gateway                    │
└─────────────────────────────────────────────────┘
              ↓                    ↓
    ┌──────────────────┐  ┌──────────────────┐
    │   Simple模式     │  │    CLI模式       │
    │  （自主Agent）   │  │ （Claude Code CLI）│
    │                  │  │                  │
    │ - 独立Agent      │  │ - 本地CLI调用    │
    │ - 分层记忆       │  │ - 本地配置       │
    │ - 自主决策       │  │ - 定时任务依赖   │
    │ - MCP/Skills     │  │                  │
    └──────────────────┘  └──────────────────┘
```

**关键设计原则**：
- CLI模式：**完全独立**，不依赖任何Agent系统
- Simple模式：**完全自主**，有自己的记忆、工具、决策系统

---

## 📚 分层记忆系统

### 记忆分层架构

```
┌─────────────────────────────────────────────────┐
│                  记忆系统                        │
├─────────────────────────────────────────────────┤
│  短期记忆（当天）                                │
│  - 时间范围：0-24小时                            │
│  - 容量：约100条记录                             │
│  - 内容：完整的执行记录、指令、结果              │
│  - 用途：快速检索、上下文构建                    │
├─────────────────────────────────────────────────┤
│  中期记忆（3天）                                 │
│  - 时间范围：1-3天                               │
│  - 容量：约300条记录                             │
│  - 内容：压缩的交互摘要、关键事件、模式识别      │
│  - 用途：趋势分析、模式匹配                      │
├─────────────────────────────────────────────────┤
│  长期记忆（7-30天）                              │
│  - 时间范围：7-30天                              │
│  - 容量：约1000条记录（高度压缩）                │
│  - 内容：高度抽象的知识、长期模式、能力图谱      │
│  - 用途：长期学习、能力进化、人格塑造            │
└─────────────────────────────────────────────────┘
```

### 数据结构设计

#### 短期记忆（ShortTermMemory）

```typescript
interface ShortTermMemory {
  id: string;
  timestamp: Date;
  type: 'command' | 'instruction' | 'result' | 'error';
  content: {
    instruction: string;
    response: string;
    duration: number;
    success: boolean;
    toolsUsed: string[];
  };
  metadata: {
    userId: string;
    sessionId: string;
    confidence: number;
  };
  tags: string[];
}

class ShortTermMemory {
  private memories: Map<string, ShortTermMemory> = new Map();
  private maxAge: number = 24 * 60 * 60 * 1000; // 24小时
  private maxSize: number = 100;

  add(memory: ShortTermMemory): void;
  getRecent(limit: number): ShortTermMemory[];
  getByTag(tag: string): ShortTermMemory[];
  cleanup(): void; // 自动清理过期记忆
  compressToMidTerm(): CompressedMemory[];
}
```

#### 中期记忆（MidTermMemory）

```typescript
interface MidTermMemory {
  id: string;
  dateRange: {
    start: Date;
    end: Date;
  };
  compressed: {
    summary: string;  // 压缩的摘要
    keyEvents: KeyEvent[];
    patterns: Pattern[];
    statistics: Statistics;
  };
  sourceCount: number;  // 来源于多少条短期记忆
}

interface KeyEvent {
  timestamp: Date;
  type: string;
  description: string;
  importance: number;  // 0-1
}

interface Pattern {
  type: string;
  frequency: number;
  confidence: number;
  examples: string[];
}

class MidTermMemory {
  private memories: Map<string, MidTermMemory> = new Map();
  private maxDays: number = 3;

  addFromShortTerm(shortMemories: ShortTermMemory[]): void;
  compressToLongTerm(): LongTermMemory[];
  getPatterns(patternType: string): Pattern[];
  getTrends(): Trend[];
}
```

#### 长期记忆（LongTermMemory）

```typescript
interface LongTermMemory {
  id: string;
  dateRange: {
    start: Date;
    end: Date;
  };
  abstract: {
    knowledgeGraph: KnowledgeNode[];
    capabilities: Capability[];
    personalityTraits: PersonalityTrait[];
    learnedLessons: Lesson[];
  };
  evolution: {
    capabilityGrowth: CapabilityGrowth[];
    interestShift: InterestShift[];
    performanceTrend: PerformanceTrend[];
  };
}

interface KnowledgeNode {
  id: string;
  type: 'skill' | 'preference' | 'habit' | 'knowledge';
  content: string;
  confidence: number;
  lastUsed: Date;
  relatedNodes: string[];
}

interface Capability {
  name: string;
  level: number;  // 0-1
  trend: 'improving' | 'stable' | 'declining';
  lastUsed: Date;
}

class LongTermMemory {
  private memories: Map<string, LongTermMemory> = new Map();
  private maxDays: number = 30;

  addFromMidTerm(midMemories: MidTermMemory[]): void;
  getCapabilities(): Capability[];
  getKnowledgeGraph(): KnowledgeNode[];
  getPersonalityTraits(): PersonalityTrait[];
  evolve(): void;  // 自我进化
}
```

### 记忆压缩算法

```typescript
class MemoryCompressor {
  // 短期 → 中期压缩
  compressShortToMid(
    memories: ShortTermMemory[]
  ): MidTermMemory {
    // 1. 按时间分组
    const groups = this.groupByTime(memories, 24 * 60 * 60 * 1000);

    // 2. 提取关键事件
    const keyEvents = this.extractKeyEvents(memories);

    // 3. 识别模式
    const patterns = this.identifyPatterns(memories);

    // 4. 生成摘要
    const summary = this.generateSummary(memories);

    // 5. 计算统计
    const statistics = this.calculateStatistics(memories);

    return {
      id: this.generateId(),
      dateRange: { start, end },
      compressed: { summary, keyEvents, patterns, statistics },
      sourceCount: memories.length,
    };
  }

  // 中期 → 长期压缩
  compressMidToLong(
    memories: MidTermMemory[]
  ): LongTermMemory {
    // 1. 提取知识图谱
    const knowledgeGraph = this.extractKnowledgeGraph(memories);

    // 2. 识别能力变化
    const capabilities = this.identifyCapabilities(memories);

    // 3. 识别人格特质
    const personalityTraits = this.identifyPersonality(memories);

    // 4. 提取经验教训
    const learnedLessons = this.extractLessons(memories);

    // 5. 分析进化趋势
    const evolution = this.analyzeEvolution(memories);

    return {
      id: this.generateId(),
      dateRange: { start, end },
      abstract: { knowledgeGraph, capabilities, personalityTraits, learnedLessons },
      evolution,
    };
  }

  private extractKeyEvents(memories: ShortTermMemory[]): KeyEvent[] {
    return memories
      .filter(m => m.metadata.confidence > 0.8 || !m.content.success)
      .map(m => ({
        timestamp: m.timestamp,
        type: m.type,
        description: `${m.type}: ${m.content.instruction.substring(0, 50)}...`,
        importance: this.calculateImportance(m),
      }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 20);  // 只保留最重要的20个事件
  }

  private identifyPatterns(memories: ShortTermMemory[]): Pattern[] {
    const patterns: Pattern[] = [];

    // 1. 时间模式（什么时间最活跃）
    const timePattern = this.analyzeTimePatterns(memories);
    if (timePattern) patterns.push(timePattern);

    // 2. 工具使用模式
    const toolPattern = this.analyzeToolPatterns(memories);
    if (toolPattern) patterns.push(toolPattern);

    // 3. 成功/失败模式
    const successPattern = this.analyzeSuccessPatterns(memories);
    if (successPattern) patterns.push(successPattern);

    // 4. 用户偏好模式
    const preferencePattern = this.analyzePreferencePatterns(memories);
    if (preferencePattern) patterns.push(preferencePattern);

    return patterns;
  }
}
```

---

## 🧠 上下文收集器

### 上下文结构

```typescript
interface AgentContext {
  // 1. Agent身份
  identity: {
    name: string;
    role: string;
    persona: string;
    capabilities: string[];
    limitations: string[];
  };

  // 2. 用户指令
  instruction: {
    raw: string;
    type: string;
    urgency: 'low' | 'medium' | 'high';
    context: string;
  };

  // 3. 记忆状态
  memories: {
    shortTerm: ShortTermMemorySummary;
    midTerm: MidTermMemorySummary;
    longTerm: LongTermMemorySummary;
  };

  // 4. 工具清单
  tools: {
    mcpServers: MCPTool[];
    skills: Skill[];
    availableActions: string[];
  };

  // 5. 能力矩阵
  capabilities: {
    canDo: string[];
    cannotDo: string[];
    learning: string[];
  };

  // 6. 当前状态
  currentState: {
    lastActivity: Date;
    activeTasks: string[];
    systemStatus: string;
    resources: ResourceStatus;
  };
}
```

### 上下文收集器实现

```typescript
class ContextCollector {
  private memorySystem: HierarchicalMemory;
  private toolRegistry: ToolRegistry;
  private capabilityAnalyzer: CapabilityAnalyzer;

  async collect(instruction: string, userId: string): Promise<AgentContext> {
    // 1. 收集Agent身份
    const identity = await this.collectIdentity();

    // 2. 分析用户指令
    const parsedInstruction = await this.analyzeInstruction(instruction);

    // 3. 收集记忆状态
    const memories = await this.collectMemoryState();

    // 4. 收集工具清单
    const tools = await this.collectTools();

    // 5. 分析能力矩阵
    const capabilities = await this.analyzeCapabilities();

    // 6. 收集当前状态
    const currentState = await this.collectCurrentState();

    return {
      identity,
      instruction: parsedInstruction,
      memories,
      tools,
      capabilities,
      currentState,
    };
  }

  private async collectIdentity(): Promise<AgentContext['identity']> {
    return {
      name: 'SimpleCoordinator',
      role: '自主智能助手',
      persona: '我是一个具备分层记忆和自主决策能力的AI助手。我能够记住我们的交互历史，理解你的真实意图，并自主规划执行步骤。',
      capabilities: await this.getCapabilities(),
      limitations: [
        '无法访问外部网络（除非配置了相关工具）',
        '记忆容量有限，会自动清理过期内容',
        '无法执行违反安全策略的操作',
      ],
    };
  }

  private async collectMemoryState(): Promise<AgentContext['memories']> {
    // 短期记忆：完整的当天记录
    const shortTerm = this.memorySystem.getShortTerm();
    const shortSummary = {
      totalCount: shortTerm.length,
      recentActivities: shortTerm.slice(0, 10).map(m => ({
        time: m.timestamp,
        instruction: m.content.instruction,
        success: m.content.success,
      })),
      summary: this.summarizeShortTerm(shortTerm),
    };

    // 中期记忆：近3天的压缩摘要
    const midTerm = this.memorySystem.getMidTerm();
    const midSummary = {
      daysCovered: midTerm.length,
      keyEvents: midTerm.flatMap(m => m.compressed.keyEvents),
      patterns: midTerm.flatMap(m => m.compressed.patterns),
      summary: this.summarizeMidTerm(midTerm),
    };

    // 长期记忆：7-30天的高度抽象
    const longTerm = this.memorySystem.getLongTerm();
    const longSummary = {
      daysCovered: longTerm.length,
      knowledge: longTerm.flatMap(m => m.abstract.knowledgeGraph),
      capabilities: longTerm.flatMap(m => m.abstract.capabilities),
      learnedLessons: longTerm.flatMap(m => m.abstract.learnedLessons),
      summary: this.summarizeLongTerm(longTerm),
    };

    return {
      shortTerm: shortSummary,
      midTerm: midSummary,
      longTerm: longSummary,
    };
  }

  private async collectTools(): Promise<AgentContext['tools']> {
    // 1. 获取已安装的MCP服务器
    const mcpServers = await this.toolRegistry.getMCP Servers();

    // 2. 获取已安装的Skills
    const skills = await this.toolRegistry.getSkills();

    // 3. 生成可执行动作列表
    const availableActions = [
      ...mcpServers.flatMap(mcp => mcp.tools.map(t => `${mcp.name}:${t.name}`)),
      ...skills.map(skill => skill.name),
      'search', 'web_fetch', 'file_read', 'file_write', 'command_execute',
    ];

    return {
      mcpServers,
      skills,
      availableActions,
    };
  }

  private async analyzeCapabilities(): Promise<AgentContext['capabilities']> {
    const longTerm = this.memorySystem.getLongTerm();
    const capabilities = longTerm.flatMap(m => m.abstract.capabilities);

    return {
      canDo: capabilities
        .filter(c => c.level > 0.7)
        .map(c => c.name),
      cannotDo: capabilities
        .filter(c => c.level < 0.3)
        .map(c => c.name),
      learning: capabilities
        .filter(c => c.level >= 0.3 && c.level <= 0.7)
        .map(c => c.name),
    };
  }
}
```

---

## 🛠️ 工具清单管理器

### MCP服务器管理

```typescript
class MCPToolRegistry {
  private installedServers: Map<string, MCPServer> = new Map();

  async discoverInstalled(): Promise<MCPServer[]> {
    // 扫描 .claude/servers/ 目录
    const serversDir = path.join(os.homedir(), '.claude', 'servers');
    const serverConfigs = await this.loadServerConfigs(serversDir);

    const servers: MCPServer[] = [];
    for (const config of serverConfigs) {
      const server = await this.initializeServer(config);
      servers.push(server);
      this.installedServers.set(config.name, server);
    }

    return servers;
  }

  private async initializeServer(config: any): Promise<MCPServer> {
    // 获取服务器提供的工具
    const tools = await this.getServerTools(config);

    return {
      name: config.name,
      description: config.description,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      status: 'active',
    };
  }

  getToolList(): string {
    const servers = Array.from(this.installedServers.values());
    let output = '已安装的MCP服务器：\n\n';

    for (const server of servers) {
      output += `## ${server.name}\n`;
      output += `描述: ${server.description}\n`;
      output += `工具列表:\n`;
      for (const tool of server.tools) {
        output += `  - ${tool.name}: ${tool.description}\n`;
      }
      output += '\n';
    }

    return output;
  }
}
```

### Skills管理

```typescript
class SkillRegistry {
  private installedSkills: Map<string, Skill> = new Map();

  async discoverInstalled(): Promise<Skill[]> {
    // 扫描 skills/ 目录
    const skillsDir = path.join(process.cwd(), 'skills');
    const skillDirs = await fs.readdir(skillsDir);

    const skills: Skill[] = [];
    for (const dir of skillDirs) {
      const skillPath = path.join(skillsDir, dir);
      const skill = await this.loadSkill(skillPath);
      if (skill) {
        skills.push(skill);
        this.installedSkills.set(dir, skill);
      }
    }

    return skills;
  }

  private async loadSkill(skillPath: string): Promise<Skill | null> {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillMdPath)) {
      return null;
    }

    const content = await fs.readFile(skillMdPath, 'utf-8');
    const { data, content: description } = parseFrontMatter(content);

    return {
      name: data.name || path.basename(skillPath),
      description: data.description || description,
      category: data.category || 'general',
      capabilities: data.capabilities || [],
      usage: data.usage || '',
    };
  }

  getSkillList(): string {
    const skills = Array.from(this.installedSkills.values());
    let output = '已安装的Skills：\n\n';

    // 按分类分组
    const grouped = skills.reduce((acc, skill) => {
      if (!acc[skill.category]) {
        acc[skill.category] = [];
      }
      acc[skill.category].push(skill);
      return acc;
    }, {} as Record<string, Skill[]>);

    for (const [category, categorySkills] of Object.entries(grouped)) {
      output += `## ${category}\n`;
      for (const skill of categorySkills) {
        output += `  - ${skill.name}: ${skill.description}\n`;
        if (skill.capabilities.length > 0) {
          output += `    能力: ${skill.capabilities.join(', ')}\n`;
        }
      }
      output += '\n';
    }

    return output;
  }
}
```

---

## 💬 结构化提示词生成器

### 提示词模板

```typescript
class PromptGenerator {
  generate(context: AgentContext): string {
    return `
# 我是谁

${context.identity.persona}

**名称**: ${context.identity.name}
**角色**: ${context.identity.role}
**核心能力**: ${context.identity.capabilities.join(', ')}

**当前限制**:
${context.identity.limitations.map(l => `- ${l}`).join('\n')}

---

# 主人提了什么问题

**原始指令**: ${context.instruction.raw}

**指令类型**: ${context.instruction.type}
**紧急程度**: ${context.instruction.urgency}
**上下文**: ${context.instruction.context || '无'}

---

# 最近记忆（今天）

**今日活动总数**: ${context.memories.shortTerm.totalCount}

**最近10次活动**:
${context.memories.shortTerm.recentActivities.map((activity, i) =>
  `${i + 1}. [${formatTime(activity.time)}] ${activity.instruction} - ${activity.success ? '✅成功' : '❌失败'}`
).join('\n')}

**今日摘要**: ${context.memories.shortTerm.summary}

---

# 历史记忆（近3天）

**覆盖天数**: ${context.memories.midTerm.daysCovered}天

**关键事件**:
${context.memories.midTerm.keyEvents.slice(0, 10).map(event =>
  `- [${formatDateTime(event.timestamp)}] ${event.description} (重要度: ${(event.importance * 100).toFixed(0)}%)`
).join('\n')}

**识别的模式**:
${context.memories.midTerm.patterns.map(pattern =>
  `- ${pattern.type}: 频率${pattern.frequency}次, 置信度${(pattern.confidence * 100).toFixed(0)}%`
).join('\n')}

**3日摘要**: ${context.memories.midTerm.summary}

---

# 长期记忆（7-30天）

**覆盖天数**: ${context.memories.longTerm.daysCovered}天

**当前能力水平**:
${context.memories.longTerm.capabilities.map(cap =>
  `- ${cap.name}: Level ${(cap.level * 100).toFixed(0)}% [${cap.trend === 'improving' ? '↗提升' : cap.trend === 'declining' ? '↘下降' : '→稳定'}]`
).join('\n')}

**掌握的知识**:
${context.memories.longTerm.knowledge.slice(0, 10).map(node =>
  `- ${node.type}: ${node.content} (置信度: ${(node.confidence * 100).toFixed(0)}%)`
).join('\n')}

**经验教训**:
${context.memories.longTerm.learnedLessons.slice(0, 5).map(lesson =>
  `- ${lesson.description}\n  应用: ${lesson.application}`
).join('\n')}

**长期摘要**: ${context.memories.longTerm.summary}

---

# 我有什么工具

${this.formatTools(context.tools)}

---

# 我目前能做什么

## ✅ 能力范围内
${context.capabilities.canDo.map(c => `- ${c}`).join('\n')}

## 📚 正在学习
${context.capabilities.learning.map(c => `- ${c}`).join('\n')}

## ❌ 能力范围外
${context.capabilities.cannotDo.map(c => `- ${c}`).join('\n')}

---

# 当前状态

**最后活动**: ${formatDateTime(context.currentState.lastActivity)}
**活跃任务**: ${context.currentState.activeTasks.length > 0 ? context.currentState.activeTasks.join(', ') : '无'}
**系统状态**: ${context.currentState.systemStatus}
**资源状态**:
- CPU: ${context.currentState.resources.cpu}%
- Memory: ${context.currentState.resources.memory}MB
- Disk: ${context.currentState.resources.disk}GB可用

---

# 请帮我分析

请基于以上信息，回答以下问题：

1. **主人的真实目的是什么？**
   - 深入分析用户的真实意图
   - 识别显性和隐性需求
   - 判断是否需要澄清

2. **我目前的工具和能力能否解决这个问题？**
   - 检查现有工具是否足够
   - 评估能力水平是否达标
   - 识别可能的限制和风险

3. **我该怎么一步步执行？**
   - 提供详细的执行计划
   - 指定每一步使用的工具
   - 说明预期结果和验证方法

4. **如果无法执行，该怎么改进？**
   - 识别缺失的能力或工具
   - 提供替代方案
   - 建议能力提升路径

请以结构化的方式回复，便于我理解和执行。
    `.trim();
  }

  private formatTools(tools: AgentContext['tools']): string {
    let output = '';

    // MCP服务器
    output += '## MCP服务器\n\n';
    if (tools.mcpServers.length === 0) {
      output += '暂未安装MCP服务器\n\n';
    } else {
      for (const server of tools.mcpServers) {
        output += `### ${server.name}\n`;
        output += `${server.description}\n\n`;
        output += '**工具列表**:\n';
        for (const tool of server.tools) {
          output += `- \`${tool.name}\`: ${tool.description}\n`;
        }
        output += '\n';
      }
    }

    // Skills
    output += '## Skills\n\n';
    if (tools.skills.length === 0) {
      output += '暂未安装Skills\n\n';
    } else {
      for (const skill of tools.skills) {
        output += `### ${skill.name}\n`;
        output += `${skill.description}\n`;
        if (skill.capabilities.length > 0) {
          output += `**能力**: ${skill.capabilities.join(', ')}\n`;
        }
        output += '\n';
      }
    }

    // 内置工具
    output += '## 内置工具\n\n';
    output += tools.availableActions.filter(a => !a.includes(':')).map(t => `- \`${t}\``).join('\n');
    output += '\n';

    return output;
  }
}
```

---

## 🎯 LLM响应解析和执行器

### 响应结构

```typescript
interface LLMResponse {
  // 1. 用户意图分析
  intent: {
    understood: boolean;
    realPurpose: string;
    explicitNeeds: string[];
    implicitNeeds: string[];
    requiresClarification: boolean;
    clarificationQuestions?: string[];
  };

  // 2. 能力评估
  capability: {
    canHandle: boolean;
    confidence: number;
    availableTools: string[];
    missingTools: string[];
    limitations: string[];
    risks: string[];
  };

  // 3. 执行计划
  plan?: {
    steps: ExecutionStep[];
    estimatedDuration: number;
    successCriteria: string[];
    fallbackPlan?: string;
  };

  // 4. 改进建议（如果无法执行）
  improvements?: {
    missingCapabilities: string[];
    alternativeApproaches: string[];
    learningPath: string[];
    toolRecommendations: string[];
  };
}

interface ExecutionStep {
  step: number;
  description: string;
  tool: string;
  parameters: Record<string, any>;
  expectedResult: string;
  validation: string;
}
```

### 响应执行器

```typescript
class ResponseExecutor {
  async execute(response: LLMResponse, context: AgentContext): Promise<ExecutionResult> {
    // 1. 检查是否需要澄清
    if (response.intent.requiresClarification) {
      return this.requestClarification(response.intent.clarificationQuestions!);
    }

    // 2. 检查是否能处理
    if (!response.capability.canHandle) {
      return this.suggestImprovements(response.improvements!);
    }

    // 3. 执行计划
    if (response.plan) {
      return await this.executePlan(response.plan, context);
    }

    throw new Error('无效的LLM响应');
  }

  private async executePlan(
    plan: LLMResponse['plan']!,
    context: AgentContext
  ): Promise<ExecutionResult> {
    const results: StepResult[] = [];
    let success = true;
    let errorMessage = '';

    for (const step of plan.steps) {
      try {
        logger.info(`[Agent] 执行步骤${step.step}: ${step.description}`);

        // 执行工具
        const result = await this.executeStep(step, context);

        results.push({
          step: step.step,
          success: true,
          result,
        });

        // 验证结果
        if (!this.validateResult(result, step.validation)) {
          throw new Error(`步骤${step.step}验证失败: ${step.validation}`);
        }

        logger.info(`[Agent] 步骤${step.step}完成`);

      } catch (error) {
        success = false;
        errorMessage = `步骤${step.step}执行失败: ${error.message}`;
        logger.error(`[Agent] ${errorMessage}`);

        // 尝试回退计划
        if (plan.fallbackPlan) {
          logger.info(`[Agent] 尝试回退计划`);
          return await this.executeFallbackPlan(plan.fallbackPlan, context);
        }

        break;
      }
    }

    return {
      success,
      errorMessage,
      steps: results,
      duration: Date.now() - context.currentState.lastActivity.getTime(),
    };
  }

  private async executeStep(
    step: ExecutionStep,
    context: AgentContext
  ): Promise<any> {
    // 根据工具类型路由
    if (step.tool.includes(':')) {
      // MCP工具
      return await this.executeMCPTool(step.tool, step.parameters);
    } else if (context.tools.skills.some(s => s.name === step.tool)) {
      // Skill
      return await this.executeSkill(step.tool, step.parameters);
    } else {
      // 内置工具
      return await this.executeBuiltinTool(step.tool, step.parameters);
    }
  }
}
```

---

## 🏗️ 完整的Agent架构

### SimpleCoordinatorAgent 重构

```typescript
class AutonomousSimpleCoordinator {
  // 核心组件
  private memorySystem: HierarchicalMemory;  // 分层记忆
  private contextCollector: ContextCollector;  // 上下文收集
  private toolRegistry: ToolRegistry;  // 工具注册表
  private promptGenerator: PromptGenerator;  // 提示词生成
  private responseExecutor: ResponseExecutor;  // 响应执行
  private llmProvider: LLMProvider;  // LLM提供者

  // Agent状态
  private state: AgentState;

  async process(instruction: string, userId: string): Promise<string> {
    logger.info(`[Agent] 收到指令: ${instruction}`);

    // 1. 记录指令到短期记忆
    this.memorySystem.addToShortTerm({
      type: 'instruction',
      content: { instruction },
      timestamp: new Date(),
    });

    // 2. 收集完整上下文
    const context = await this.contextCollector.collect(instruction, userId);

    // 3. 生成结构化提示词
    const prompt = this.promptGenerator.generate(context);

    // 4. 发送给LLM分析
    const llmResponse = await this.llmProvider.complete(prompt, {
      temperature: 0.7,
      responseFormat: 'json',
    });

    // 5. 解析LLM响应
    const response: LLMResponse = JSON.parse(llmResponse);

    // 6. 执行响应
    const result = await this.responseExecutor.execute(response, context);

    // 7. 记录结果到短期记忆
    this.memorySystem.addToShortTerm({
      type: 'result',
      content: {
        instruction,
        response: result.success ? '成功' : result.errorMessage,
        duration: result.duration,
        success: result.success,
      },
      timestamp: new Date(),
    });

    // 8. 返回结果
    if (result.success) {
      return this.formatSuccessResponse(result);
    } else {
      return this.formatErrorResponse(result);
    }
  }

  // 定期记忆压缩
  @ScheduleEvery('1h')
  private async compressMemories(): Promise<void> {
    // 短期 → 中期
    const oldShortTerm = this.memorySystem.getShortTerm()
      .filter(m => Date.now() - m.timestamp.getTime() > 24 * 60 * 60 * 1000);

    if (oldShortTerm.length > 0) {
      const midTerm = this.memoryCompressor.compressShortToMid(oldShortTerm);
      this.memorySystem.addToMidTerm(midTerm);
      this.memorySystem.removeFromShortTerm(oldShortTerm);
    }

    // 中期 → 长期
    const oldMidTerm = this.memorySystem.getMidTerm()
      .filter(m => Date.now() - m.dateRange.end.getTime() > 3 * 24 * 60 * 60 * 1000);

    if (oldMidTerm.length > 0) {
      const longTerm = this.memoryCompressor.compressMidToLong(oldMidTerm);
      this.memorySystem.addToLongTerm(longTerm);
      this.memorySystem.removeFromMidTerm(oldMidTerm);
    }
  }
}
```

---

## 📊 实施计划

### 阶段1: 核心架构 (3天)

- [ ] 实现分层记忆系统（短期/中期/长期）
- [ ] 实现记忆压缩算法
- [ ] 实现上下文收集器
- [ ] 单元测试

### 阶段2: 工具集成 (2天)

- [ ] 实现MCP服务器发现和管理
- [ ] 实现Skills发现和管理
- [ ] 实现工具清单生成器
- [ ] 集成测试

### 阶段3: 智能决策 (3天)

- [ ] 实现结构化提示词生成器
- [ ] 实现LLM响应解析器
- [ ] 实现响应执行器
- [ ] 端到端测试

### 阶段4: Agent重构 (2天)

- [ ] 重构SimpleCoordinatorAgent
- [ ] 移除旧的验证器系统
- [ ] 性能优化和调试
- [ ] 文档编写

**总计**: 10天

---

**设计版本**: 1.0
**创建日期**: 2026-03-17
**设计人**: Claude Code
**状态**: 待用户确认
