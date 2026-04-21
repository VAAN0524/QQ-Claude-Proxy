/**
 * 智能指令验证系统测试脚本
 *
 * 用于快速测试智能指令理解和执行系统的各项功能
 */

import { Validator } from '../src/agents/intelligent/Validator.js';
import { ContextAnalyzer } from '../src/agents/intelligent/ContextAnalyzer.js';
import type { IntelligentConfig, TaskContext } from '../src/agents/intelligent/types.js';

/**
 * 测试用例定义
 */
interface TestCase {
  name: string;
  instruction: string;
  expectedValid: boolean;
  expectedConflicts: number;
  expectedSuggestions: number;
  description: string;
}

const testCases: TestCase[] = [
  {
    name: '最新图片缺少年份',
    instruction: '使用最新图片生成文章',
    expectedValid: false,
    expectedConflicts: 2,
    expectedSuggestions: 1,
    description: '应该检测到"最新"缺少年份和可能的旧年份问题',
  },
  {
    name: '最新图片包含年份',
    instruction: '使用 2026 最新图片生成文章',
    expectedValid: true,
    expectedConflicts: 0,
    expectedSuggestions: 0,
    description: '包含当前年份应该通过验证',
  },
  {
    name: '最新与指定日期冲突',
    instruction: '使用最新图片，日期 2026-02-25',
    expectedValid: false,
    expectedConflicts: 1,
    expectedSuggestions: 0,
    description: '应该检测到"最新"和"指定日期"的冲突',
  },
  {
    name: '使用旧年份',
    instruction: '使用 2025 年的图片',
    expectedValid: false,
    expectedConflicts: 1,
    expectedSuggestions: 1,
    description: '应该检测到旧年份',
  },
  {
    name: '生成与使用现有冲突',
    instruction: '生成新图片，使用现有的 logo.png',
    expectedValid: false,
    expectedConflicts: 1,
    expectedSuggestions: 0,
    description: '应该检测到"生成"和"使用现有"的冲突',
  },
  {
    name: '正确的完整指令',
    instruction: '使用 2026 最新图片生成 AI 技术文章',
    expectedValid: true,
    expectedConflicts: 0,
    expectedSuggestions: 0,
    description: '完整正确的指令应该通过验证',
  },
];

/**
 * 执行测试
 */
async function runTests(): Promise<void> {
  console.log('🧪 智能指令验证系统测试\n');
  console.log('='.repeat(50));

  const config: IntelligentConfig = {
    mode: 'validation',
    enabled: true,
    autoFix: false,
    confidenceThreshold: 0.9,
    continuousLearning: false,
    maxHistorySize: 1000,
    cacheTTL: 3600,
  };

  const validator = new Validator(config);
  const analyzer = new ContextAnalyzer();

  const now = new Date();
  const taskContext: TaskContext = {
    taskId: 'test-' + Date.now(),
    taskName: 'intelligent-system-test',
    executionTime: now,
    currentYear: now.getFullYear(),
    currentMonth: now.getMonth() + 1,
    currentDay: now.getDate(),
    metadata: {},
  };

  let passed = 0;
  let failed = 0;
  const results: Array<{
    name: string;
    passed: boolean;
    details: string;
  }> = [];

  for (const testCase of testCases) {
    console.log(`\n📋 测试: ${testCase.name}`);
    console.log(`   指令: "${testCase.instruction}"`);
    console.log(`   说明: ${testCase.description}`);

    try {
      const startTime = Date.now();

      // 执行验证
      const validationResult = await validator.validate(
        testCase.instruction,
        taskContext
      );

      const duration = Date.now() - startTime;

      // 检查结果
      const validMatch = validationResult.isValid === testCase.expectedValid;
      const conflictsMatch = validationResult.conflicts.length === testCase.expectedConflicts;
      const suggestionsMatch = validationResult.suggestions.length >= testCase.expectedSuggestions;

      const testPassed = validMatch && conflictsMatch && suggestionsMatch;

      if (testPassed) {
        passed++;
        console.log(`   ✅ 通过 (${duration}ms)`);
        console.log(`      - 验证状态: ${validationResult.isValid ? '有效' : '无效'}`);
        console.log(`      - 冲突数量: ${validationResult.conflicts.length}`);
        console.log(`      - 建议数量: ${validationResult.suggestions.length}`);
        console.log(`      - 置信度: ${(validationResult.confidence * 100).toFixed(1)}%`);
      } else {
        failed++;
        console.log(`   ❌ 失败`);
        console.log(`      - 预期有效: ${testCase.expectedValid}, 实际: ${validationResult.isValid}`);
        console.log(`      - 预期冲突数: ${testCase.expectedConflicts}, 实际: ${validationResult.conflicts.length}`);
        console.log(`      - 预期建议数: ${testCase.expectedSuggestions}, 实际: ${validationResult.suggestions.length}`);

        // 显示实际的冲突和建议
        if (validationResult.conflicts.length > 0) {
          console.log(`      - 实际冲突:`);
          validationResult.conflicts.forEach(c => {
            console.log(`        • [${c.severity.toUpperCase()}] ${c.description}`);
          });
        }
        if (validationResult.suggestions.length > 0) {
          console.log(`      - 实际建议:`);
          validationResult.suggestions.forEach(s => {
            console.log(`        • ${s.suggestion}`);
          });
        }
      }

      results.push({
        name: testCase.name,
        passed: testPassed,
        details: testPassed ?
          `通过 (置信度: ${(validationResult.confidence * 100).toFixed(1)}%)` :
          `失败 - 验证:${validationResult.isValid}, 冲突:${validationResult.conflicts.length}, 建议:${validationResult.suggestions.length}`
      });

    } catch (error) {
      failed++;
      console.log(`   ❌ 错误: ${error}`);
      results.push({
        name: testCase.name,
        passed: false,
        details: `异常: ${error}`
      });
    }
  }

  // 输出测试总结
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试总结\n');
  console.log(`总测试数: ${testCases.length}`);
  console.log(`通过: ${passed} (${((passed / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`失败: ${failed} (${((failed / testCases.length) * 100).toFixed(1)}%)`);

  if (failed === 0) {
    console.log('\n✅ 所有测试通过！智能指令验证系统工作正常。');
  } else {
    console.log('\n⚠️  部分测试失败，请检查上述详情。');
  }

  // 详细结果
  console.log('\n📋 详细结果:');
  results.forEach(result => {
    console.log(`  ${result.passed ? '✅' : '❌'} ${result.name}: ${result.details}`);
  });
}

// 执行测试
runTests().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
