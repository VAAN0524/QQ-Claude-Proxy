#!/usr/bin/env node
/**
 * 图片生成编码测试脚本
 *
 * 测试 Python 脚本是否能正确处理中文参数
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 测试用例
const testCases = [
  {
    name: '英文主题（无特殊字符）',
    topic: 'AI Agent Breakthrough',
    expected: 'success'
  },
  {
    name: '中文主题（简体）',
    topic: 'AI智能助手',
    expected: 'success'
  },
  {
    name: '中文主题（复杂句子）',
    topic: '程序员使用AI写代码效率提升',
    expected: 'success'
  },
  {
    name: '混合中英文',
    topic: 'AI Agent 技术突破 2026',
    expected: 'success'
  }
];

/**
 * 执行图片生成测试
 */
async function testImageGeneration(testCase) {
  const scriptPath = join(process.cwd(), 'skills', 'Image', 'image_gen_v4.py');

  return new Promise((resolve) => {
    const args = [
      scriptPath,
      testCase.topic,
      '--style', 'narrative',
      '--size', '900x500'
    ];

    console.log(`\n执行命令: python ${args.join(' ')}`);
    console.log(`主题: ${testCase.topic}`);

    const proc = spawn('python', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        LANG: 'en_US.UTF-8'
      }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString('utf-8');
    });

    proc.on('close', (code) => {
      const success = code === 0 && stdout.includes('✅');

      resolve({
        name: testCase.name,
        topic: testCase.topic,
        exitCode: code,
        success,
        stdout: stdout.substring(0, 200),  // 只保留前200字符
        stderr: stderr.substring(0, 200)
      });
    });

    // 30秒超时
    setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({
        name: testCase.name,
        topic: testCase.topic,
        exitCode: -1,
        success: false,
        stdout: '',
        stderr: 'Timeout after 30s'
      });
    }, 30000);
  });
}

/**
 * 主测试流程
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     图片生成编码测试                                      ║');
  console.log('║     Image Generation Encoding Test                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results = [];

  for (const testCase of testCases) {
    console.log(`\n────────────────────────────────────────────────────────────`);
    console.log(`测试: ${testCase.name}`);
    console.log(`主题: ${testCase.topic}`);

    const result = await testImageGeneration(testCase);
    results.push(result);

    if (result.success) {
      console.log(`✅ 通过`);
    } else {
      console.log(`❌ 失败`);
      console.log(`退出码: ${result.exitCode}`);
      if (result.stderr) {
        console.log(`错误: ${result.stderr}`);
      }
    }

    // 等待1秒再测试下一个
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 生成报告
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  测试报告                                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n总计: ${results.length} | 通过: ${passed} | 失败: ${failed}`);
  console.log(`通过率: ${((passed / results.length) * 100).toFixed(1)}%\n`);

  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.name}`);
    console.log(`   主题: ${result.topic}`);
    console.log(`   状态: ${result.success ? '✅ 通过' : '❌ 失败'}`);
    if (!result.success && result.stderr) {
      console.log(`   错误: ${result.stderr.substring(0, 100)}`);
    }
  });

  // 建议
  if (failed > 0) {
    console.log('\n📋 修复建议:');

    const failedTests = results.filter(r => !r.success);
    if (failedTests.some(t => t.topic.includes('中文') || /[\u4e00-\u9fa5]/.test(t.topic))) {
      console.log('  - 检查 Python 脚本是否添加了 UTF-8 编码支持');
      console.log('  - 确认环境变量 PYTHONIOENCODING=utf-8 已设置');
      console.log('  - 尝试使用英文主题作为临时解决方案');
    }

    if (failedTests.some(t => !t.topic.includes('中文') && !/[\u4e00-\u9fa5]/.test(t.topic))) {
      console.log('  - 检查 Python 脚本是否有语法错误');
      console.log('  - 确认 ZHIPU_API_KEY 环境变量已设置');
      console.log('  - 检查网络连接到智谱 AI API');
    }
  } else {
    console.log('\n✅ 所有测试通过！编码问题已解决。');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// 执行测试
main();
