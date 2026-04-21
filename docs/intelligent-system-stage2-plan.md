# 智能指令理解系统 - 阶段2 实施计划

**计划阶段**: 阶段2 - 半自动模式
**计划日期**: 2026-03-17
**预计实施**: 2026-03-20 至 2026-03-23
**依赖条件**: 阶段1 稳定运行 3 天

---

## 🎯 阶段2 目标

### 核心功能

在阶段1验证能力的基础上，增加以下能力：

1. **自动修正**: 高置信度 (>0.9) 的建议自动应用
2. **请求确认**: 中置信度 (0.7-0.9) 的建议请求用户确认
3. **模式学习**: 从成功执行中提取成功模式
4. **结果分析**: 识别隐性失败和异常情况

### 模式配置

```json
{
  "mode": "semi-auto",
  "enabled": true,
  "autoFix": true,
  "confidenceThreshold": 0.9,
  "continuousLearning": false,
  "maxHistorySize": 1000,
  "cacheTTL": 3600
}
```

---

## 📦 新增组件

### 1. PatternLearner（模式学习器）

**文件**: `src/agents/intelligent/PatternLearner.ts`

**职责**:
- 从成功执行中学习成功模式
- 从失败执行中提取失败模式
- 建立执行模式数据库
- 提供模式匹配和建议

**核心接口**:
```typescript
export class PatternLearner {
  // 从执行结果中学习
  learnFromExecution(
    instruction: string,
    result: ExecutionResult,
    context: TaskContext
  ): void;

  // 匹配相似模式
  matchPatterns(
    instruction: string,
    context: TaskContext
  ): PatternMatch[];

  // 获取成功建议
  getSuccessPatterns(
    instruction: string
  ): SuccessPattern[];

  // 获取失败警告
  getFailureWarnings(
    instruction: string
  ): FailureWarning[];
}
```

**数据结构**:
```typescript
interface ExecutionPattern {
  id: string;
  instruction: string;
  intent: Intent;
  success: boolean;
  confidence: number;
  timestamp: Date;
  outcome: {
    duration: number;
    quality: number;
    errors?: string[];
  };
  context: TaskContext;
}

interface SuccessPattern {
  id: string;
  pattern: string;
  frequency: number;
  avgConfidence: number;
  lastUsed: Date;
  examples: string[];
}

interface FailurePattern {
  id: string;
  pattern: string;
  frequency: number;
  commonErrors: string[];
  lastOccurred: Date;
  avoidanceStrategies: string[];
}
```

**学习算法**:
```typescript
private learnSuccess(
  instruction: string,
  result: ExecutionResult,
  context: TaskContext
): void {
  // 1. 提取意图特征
  const intent = this.extractIntent(instruction);

  // 2. 记录成功模式
  const pattern: ExecutionPattern = {
    id: this.generateId(),
    instruction,
    intent,
    success: true,
    confidence: result.confidence || 1.0,
    timestamp: new Date(),
    outcome: {
      duration: result.duration,
      quality: this.calculateQuality(result),
    },
    context,
  };

  // 3. 存储到模式数据库
  this.patternDatabase.push(pattern);

  // 4. 更新频率统计
  this.updatePatternFrequency(pattern);
}

private learnFailure(
  instruction: string,
  error: Error,
  context: TaskContext
): void {
  // 1. 分析失败原因
  const failureReason = this.analyzeFailure(error);

  // 2. 提取失败模式
  const pattern: ExecutionPattern = {
    id: this.generateId(),
    instruction,
    intent: this.extractIntent(instruction),
    success: false,
    confidence: 0,
    timestamp: new Date(),
    outcome: {
      duration: 0,
      quality: 0,
      errors: [failureReason],
    },
    context,
  };

  // 3. 存储并标记
  this.patternDatabase.push(pattern);

  // 4. 生成避免策略
  this.generateAvoidanceStrategies(pattern);
}
```

### 2. ResultAnalyzer（结果分析器）

**文件**: `src/agents/intelligent/ResultAnalyzer.ts`

**职责**:
- 分析执行结果的质量
- 检测隐性失败（表面成功但实际效果差）
- 生成改进建议
- 评估结果满意度

**核心接口**:
```typescript
export class ResultAnalyzer {
  // 分析执行结果
  analyze(
    result: ExecutionResult,
    expectedOutcome?: ExpectedOutcome
  ): AnalysisReport;

  // 检测隐性失败
  detectImplicitFailure(
    result: ExecutionResult,
    context: TaskContext
  ): ImplicitFailure | null;

  // 计算质量分数
  calculateQualityScore(
    result: ExecutionResult
  ): QualityScore;

  // 生成改进建议
  generateImprovements(
    analysis: AnalysisReport
  ): Improvement[];
}
```

**数据结构**:
```typescript
interface AnalysisReport {
  overallQuality: QualityScore;
  explicitSuccess: boolean;
  implicitSuccess: boolean;
  issues: Issue[];
  improvements: Improvement[];
  confidence: number;
  analysisTime: Date;
}

interface QualityScore {
  overall: number;  // 0-1
  accuracy: number;  // 准确性
  completeness: number;  // 完整性
  relevance: number;  // 相关性
  timeliness: number;  // 时效性
}

interface Issue {
  severity: 'low' | 'medium' | 'high';
  type: string;
  description: string;
  suggestion: string;
  autoFixable: boolean;
}

interface Improvement {
  category: string;
  description: string;
  priority: number;
  estimatedImpact: number;
  implementation: string;
}
```

**隐性失败检测**:
```typescript
detectImplicitFailure(
  result: ExecutionResult,
  context: TaskContext
): ImplicitFailure | null {
  const issues: string[] = [];

  // 1. 检查执行时间（过长表示低效）
  if (result.duration > context.expectedDuration * 2) {
    issues.push('执行时间超出预期 2 倍以上');
  }

  // 2. 检查结果质量（分数过低）
  const qualityScore = this.calculateQualityScore(result);
  if (qualityScore.overall < 0.7) {
    issues.push(`结果质量分数过低: ${qualityScore.overall.toFixed(2)}`);
  }

  // 3. 检查资源使用（内存/CPU 异常）
  if (result.memoryUsage > context.memoryLimit * 0.9) {
    issues.push('内存使用接近上限');
  }

  // 4. 检查输出内容（空内容、过短等）
  if (result.output && result.output.length < 100) {
    issues.push('输出内容过短，可能质量不佳');
  }

  // 5. 检查时间一致性（使用了旧数据）
  if (context.requiresFreshData && !this.isDataFresh(result)) {
    issues.push('可能使用了过时的数据');
  }

  return issues.length > 0 ? {
    detected: true,
    issues,
    severity: this.calculateSeverity(issues),
  } : null;
}
```

---

## 🔧 系统集成

### SimpleCoordinatorAgent 修改

**修改位置**: `src/agents/SimpleCoordinatorAgent.ts`

**新增功能**:
```typescript
// 在 process() 方法中，验证逻辑之后

// 1. 应用自动修正（阶段2新增）
if (validationResult.correctedInstruction &&
    this.intelligentConfig.autoFix &&
    validationResult.confidence >= this.intelligentConfig.confidenceThreshold) {
  logger.info(`[SimpleCoordinator] 自动应用修正: ${originalInstruction} → ${correctedInstruction}`);
  content = validationResult.correctedInstruction;
}

// 2. 请求确认（阶段2新增）
else if (!validationResult.isValid &&
    validationResult.confidence >= 0.7 &&
    validationResult.confidence < this.intelligentConfig.confidenceThreshold) {
  // 返回确认请求给用户
  return this.generateConfirmationRequest(validationResult);
}

// 3. 记录执行结果用于学习（阶段2新增）
const executionResult = await this.executeContent(content, context);
this.recordExecutionForLearning(content, executionResult, context);
```

**新增方法**:
```typescript
private async generateConfirmationRequest(
  validationResult: ValidationResult
): Promise<string> {
  const suggestions = validationResult.suggestions
    .map(s => `• ${s.suggestion}`)
    .join('\n');

  return `⚠️ 指令验证发现问题，请确认是否继续：

${validationResult.conflicts.map(c => `[${c.severity.toUpperCase()}] ${c.description}`).join('\n')}

💡 建议：
${suggestions}

回复 "确认" 继续执行，或发送修正后的指令。`;
}

private recordExecutionForLearning(
  instruction: string,
  result: any,
  context: TaskContext
): void {
  if (!this.patternLearner || !this.intelligentConfig.continuousLearning) {
    return;
  }

  // 异步学习，不阻塞主流程
  setImmediate(() => {
    try {
      this.patternLearner!.learnFromExecution(
        instruction,
        this.normalizeExecutionResult(result),
        context
      );
    } catch (error) {
      logger.error(`[SimpleCoordinator] 记录执行结果失败: ${error}`);
    }
  });
}
```

---

## 🧪 测试计划

### 单元测试

**PatternLearner 测试** (`tests/agents/intelligent/PatternLearner.test.ts`):
```typescript
describe('PatternLearner', () => {
  it('应该从成功执行中学习模式');
  it('应该从失败执行中提取教训');
  it('应该匹配相似的成功模式');
  it('应该警告重复的失败模式');
  it('应该计算模式频率');
  it('应该清理过期的模式');
});
```

**ResultAnalyzer 测试** (`tests/agents/intelligent/ResultAnalyzer.test.ts`):
```typescript
describe('ResultAnalyzer', () => {
  it('应该正确计算质量分数');
  it('应该检测隐性失败');
  it('应该生成改进建议');
  it('应该识别执行时间异常');
  it('应该检测资源使用问题');
  it('应该评估结果满意度');
});
```

### 集成测试

**场景1: 自动修正高置信度指令**:
```typescript
it('应该自动修正高置信度指令', async () => {
  const instruction = '使用最新图片生成文章';
  const result = await coordinator.process(instruction, context);

  // 验证自动应用了修正
  expect(result).toContain('2026');
  expect(result).not.toContain('警告');
});
```

**场景2: 请求确认中置信度指令**:
```typescript
it('应该请求确认中置信度指令', async () => {
  const instruction = '使用图片生成文章'; // 缺少"最新"但也明确
  const result = await coordinator.process(instruction, context);

  // 验证返回了确认请求
  expect(result).toContain('请确认');
  expect(result).toContain('建议');
});
```

**场景3: 从失败中学习**:
```typescript
it('应该从失败中学习并避免重复', async () => {
  // 第一次执行失败
  await coordinator.process('使用 2025 图片', context);

  // 第二次尝试相同指令
  const result = await coordinator.process('使用 2025 图片', context);

  // 验证系统警告了重复失败
  expect(result).toContain('之前失败');
});
```

### 性能测试

**目标**:
- 学习延迟: <100ms（异步执行）
- 分析延迟: <50ms
- 内存增长: <10MB/天

---

## 📊 成功标准

### 功能标准

| 功能 | 目标 | 验收标准 |
|------|------|----------|
| **自动修正** | 高置信度指令自动修正 | 准确率 >95% |
| **请求确认** | 中置信度请求确认 | 确认率 >80% |
| **模式学习** | 从执行中学习 | 学习准确率 >90% |
| **结果分析** | 检测隐性失败 | 检测率 >85% |

### 性能标准

| 指标 | 目标 | 验收标准 |
|------|------|----------|
| **学习延迟** | <100ms | 异步执行，不阻塞 |
| **分析延迟** | <50ms | 实际 <30ms |
| **内存增长** | <10MB/天 | 自动清理 |
| **CPU 开销** | <3% | 异步处理 |

### 稳定性标准

- ✅ 连续运行 7 天无崩溃
- ✅ 无内存泄漏
- ✅ 无数据损坏
- ✅ 零误报（正确指令被错误修正）

---

## 📅 实施时间线

### Day 1 (2026-03-20)

**上午** (4小时):
- [ ] 创建 PatternLearner 基础结构
- [ ] 实现模式提取算法
- [ ] 实现模式数据库

**下午** (4小时):
- [ ] 实现 ResultAnalyzer 基础结构
- [ ] 实现质量分数计算
- [ ] 实现隐性失败检测

### Day 2 (2026-03-21)

**上午** (4小时):
- [ ] 完成模式学习逻辑
- [ ] 完成结果分析逻辑
- [ ] 单元测试编写

**下午** (4小时):
- [ ] 集成到 SimpleCoordinatorAgent
- [ ] 实现自动修正功能
- [ ] 实现确认请求功能

### Day 3 (2026-03-22)

**上午** (4小时):
- [ ] 集成测试编写
- [ ] 性能测试和优化
- [ ] 错误处理完善

**下午** (4小时):
- [ ] 文档更新
- [ ] 部署指南更新
- [ ] 代码审查和重构

### Day 4 (2026-03-23)

**全天** (8小时):
- [ ] 阶段2部署
- [ ] 生产环境验证
- [ ] 问题修复和调优
- [ ] 阶段验收

---

## 🚨 风险和缓解措施

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| **自动修正误操作** | 中 | 高 | 保守阈值 (0.9)，可回滚 |
| **模式学习偏差** | 低 | 中 | 人工审核，限制学习范围 |
| **性能影响大** | 低 | 中 | 异步执行，缓存优化 |
| **隐性失败漏检** | 中 | 中 | 多维度检测，持续优化 |
| **数据存储增长** | 高 | 低 | 自动清理过期模式 |

---

## 📝 验收清单

### 开发完成

- [ ] PatternLearner 实现完成
- [ ] ResultAnalyzer 实现完成
- [ ] SimpleCoordinatorAgent 集成完成
- [ ] 配置文件更新完成
- [ ] 单元测试全部通过
- [ ] 集成测试全部通过

### 性能验证

- [ ] 学习延迟 <100ms
- [ ] 分析延迟 <50ms
- [ ] 内存增长 <10MB/天
- [ ] CPU 开销 <3%

### 文档完整

- [ ] 实施计划文档
- [ ] API 文档更新
- [ ] 部署指南更新
- [ ] 测试报告完成

### 生产就绪

- [ ] 部署到测试环境
- [ ] 功能验证通过
- [ ] 性能验证通过
- [ ] 稳定性验证通过

---

## 🎯 阶段2 预期成果

### 功能增强

1. **智能修正**: 高置信度指令自动修正，减少用户干预
2. **模式学习**: 从历史执行中学习，持续优化
3. **质量保障**: 检测隐性失败，提升整体质量
4. **用户友好**: 中等置信度时请求确认，避免误操作

### 性能目标

- 验证 + 修正总延迟: <10ms
- 学习延迟: <100ms (异步)
- 分析延迟: <30ms
- 内存占用: <15MB

### 质量目标

- 自动修正准确率: >95%
- 隐性失败检测率: >85%
- 模式学习准确率: >90%
- 用户满意度: >90%

---

**计划版本**: 2.0
**创建日期**: 2026-03-17
**预计完成**: 2026-03-23
**负责人**: Claude Code
**依赖**: 阶段1 稳定运行 3 天
