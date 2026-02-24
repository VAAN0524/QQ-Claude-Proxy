/**
 * 模式对比测试脚本
 *
 * 用于对比 CLI、Team、Simple 三种模式的效果
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 测试用例
const testCases = [
  {
    name: '搜索测试',
    input: '搜索 TypeScript 最新版本',
    expectedMode: 'simple',
    description: '测试搜索功能的响应速度和准确性',
  },
  {
    name: '代码测试',
    input: '帮我写一个 Python 斐波那契函数',
    expectedMode: 'team',
    description: '测试代码生成能力',
  },
  {
    name: '文件操作测试',
    input: '列出 README.md 文件',
    expectedMode: 'cli',
    description: '测试文件操作能力',
  },
  {
    name: '复杂查询测试',
    input: '用 tavily 搜索 GitHub 上的 myskills 项目',
    expectedMode: 'simple',
    description: '测试特定工具指定是否生效',
  },
];

// 模式对比结果
interface ModeResult {
  mode: string;
  testCase: string;
  input: string;
  responseTime: number;
  success: boolean;
  response: string;
  error?: string;
}

const results: ModeResult[] = [];

/**
 * 模拟测试（实际使用时需要真实的 Agent 调用）
 */
async function runTest(mode: string, testCase: typeof testCases[0]): Promise<ModeResult> {
  const startTime = Date.now();

  try {
    // 这里是模拟的响应，实际使用时需要真实的 Agent 调用
    const mockResponses: Record<string, string> = {
      'cli': `[CLI] 模拟响应: ${testCase.input}`,
      'team': `[Team] 模拟响应: ${testCase.input}`,
      'simple': `[Simple] 模拟响应: ${testCase.input}`,
    };

    // 模拟不同模式的响应时间
    const mockDelay = {
      'cli': 2000,
      'team': 5000,
      'simple': 1000,
    };

    await new Promise(resolve => setTimeout(resolve, mockDelay[mode as keyof typeof mockDelay] || 2000));

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    return {
      mode,
      testCase: testCase.name,
      input: testCase.input,
      responseTime,
      success: true,
      response: mockResponses[mode],
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      mode,
      testCase: testCase.name,
      input: testCase.input,
      responseTime: endTime - startTime,
      success: false,
      response: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 生成对比报告
 */
function generateReport(): string {
  let report = '# 模式对比测试报告\n\n';
  report += `测试时间: ${new Date().toISOString()}\n\n`;
  report += '---\n\n';

  // 按测试用例分组
  for (const testCase of testCases) {
    report += `## ${testCase.name}\n\n`;
    report += `**输入**: ${testCase.input}\n\n`;
    report += `**描述**: ${testCase.description}\n\n`;
    report += `**推荐模式**: ${testCase.expectedMode}\n\n`;

    const modeResults = results.filter(r => r.testCase === testCase.name);

    // 创建对比表格
    report += '| 模式 | 响应时间 | 成功 | 响应摘要 |\n';
    report += '|------|----------|------|----------|\n';

    for (const result of modeResults) {
      const success = result.success ? '✅' : '❌';
      const responseSummary = result.response
        ? result.response.substring(0, 50) + '...'
        : (result.error || '无响应');
      report += `| ${result.mode} | ${result.responseTime}ms | ${success} | ${responseSummary} |\n`;
    }

    report += '\n---\n\n';
  }

  // 统计汇总
  report += '## 统计汇总\n\n';

  for (const mode of ['cli', 'team', 'simple']) {
    const modeResults = results.filter(r => r.mode === mode);
    const successCount = modeResults.filter(r => r.success).length;
    const avgResponseTime = modeResults.reduce((sum, r) => sum + r.responseTime, 0) / modeResults.length;

    report += `**${mode.toUpperCase()} 模式**:\n`;
    report += `- 成功率: ${successCount}/${modeResults.length}\n`;
    report += `- 平均响应时间: ${Math.round(avgResponseTime)}ms\n\n`;
  }

  return report;
}

/**
 * 保存报告
 */
async function saveReport(report: string): Promise<void> {
  const reportPath = path.join(__dirname, '../docs/mode-comparison-report.md');
  await fs.writeFile(reportPath, report, 'utf-8');
  console.log(`报告已保存到: ${reportPath}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('开始模式对比测试...\n');

  // 为每个模式运行所有测试
  for (const mode of ['cli', 'team', 'simple']) {
    console.log(`\n测试 ${mode.toUpperCase()} 模式...`);

    for (const testCase of testCases) {
      console.log(`  - ${testCase.name}...`);
      const result = await runTest(mode, testCase);
      results.push(result);
      console.log(`    完成 (${result.responseTime}ms, ${result.success ? '成功' : '失败'})`);
    }
  }

  // 生成并保存报告
  console.log('\n生成报告...');
  const report = generateReport();
  await saveReport(report);

  console.log('\n测试完成！');
  console.log('\n总结:');
  console.log('- CLI 模式: 适合文件操作和复杂任务');
  console.log('- Team 模式: 适合需要多 Agent 协作的复杂任务');
  console.log('- Simple 模式: 适合日常任务，响应最快');
}

// 运行测试
main().catch(console.error);
