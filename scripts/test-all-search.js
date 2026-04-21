#!/usr/bin/env node
/**
 * 搜索功能测试脚本
 * 测试所有可用的搜索方式并记录结果
 */

import { tavilySearch, exaSearch, jinaRead, youtubeSearch, bilibiliSearch, smart_search_v2, exaCodeSearch } from '../dist/agents/tools-layer/search-tools.js';
import { logger } from '../dist/utils/logger.js';

// 测试结果记录
const results = {
  timestamp: new Date().toISOString(),
  tests: []
};

/**
 * 测试单个搜索功能
 */
async function testSearch(name, testFn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 测试: ${name}`);
  console.log(`${'='.repeat(60)}`);

  const startTime = Date.now();
  const testResult = {
    name,
    status: 'pending',
    duration: 0,
    error: null,
    data: null
  };

  try {
    const result = await Promise.race([
      testFn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout after 30s')), 30000)
      )
    ]);

    testResult.status = 'success';
    testResult.data = typeof result === 'object' ? JSON.stringify(result, null, 2).substring(0, 500) : String(result).substring(0, 500);
    console.log(`✅ 成功`);
    if (result) {
      console.log(`📊 结果: ${testResult.data}`);
    }
  } catch (error) {
    testResult.status = error.message === 'Timeout after 30s' ? 'timeout' : 'error';
    testResult.error = error.message;
    console.log(`❌ 失败: ${error.message}`);
  }

  testResult.duration = Date.now() - startTime;
  results.tests.push(testResult);
  console.log(`⏱️  耗时: ${testResult.duration}ms`);
}

/**
 * 主测试函数
 */
async function main() {
  console.log(`🔍 搜索功能测试开始`);
  console.log(`时间: ${results.timestamp}`);
  console.log(`环境检查:`);

  // 检查环境变量
  const envChecks = {
    TAVILY_API_KEY: process.env.TAVILY_API_KEY ? '✅ 已配置' : '❌ 未配置',
    GLM_API_KEY: process.env.GLM_API_KEY ? '✅ 已配置' : '❌ 未配置',
    HTTP_PROXY: process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '未设置'
  };

  Object.entries(envChecks).forEach(([key, value]) => {
    console.log(`  - ${key}: ${value}`);
  });

  // 工具层搜索测试
  console.log(`\n\n📦 工具层搜索测试`);

  // 1. Tavily 搜索
  await testSearch('Tavily 搜索', async () => {
    return await tavilySearch('人工智能 2026', 3);
  });

  // 2. Exa 搜索
  await testSearch('Exa 搜索', async () => {
    return await exaSearch('人工智能最新进展', { numResults: 3 });
  });

  // 3. Exa Code 搜索
  await testSearch('Exa Code 搜索', async () => {
    return await exaCodeSearch('React useEffect hook', 1000);
  });

  // 4. Jina Reader
  await testSearch('Jina Reader', async () => {
    return await jinaRead('https://example.com');
  });

  // 5. YouTube 搜索（使用一个简短的测试 URL）
  await testSearch('YouTube 搜索', async () => {
    // 使用一个简短的测试 URL，不进行实际搜索
    return await youtubeSearch('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  // 6. Bilibili 搜索（使用一个简短的测试 URL）
  await testSearch('Bilibili 搜索', async () => {
    // 使用一个测试 URL
    return await bilibiliSearch('https://www.bilibili.com/video/BV1xx411c7mD');
  });

  // 7. 智能搜索 V2
  await testSearch('智能搜索 V2', async () => {
    return await smart_search_v2('最新科技新闻');
  });

  // 汇总结果
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`📊 测试结果汇总`);
  console.log(`${'='.repeat(60)}`);

  const successCount = results.tests.filter(t => t.status === 'success').length;
  const errorCount = results.tests.filter(t => t.status === 'error').length;
  const timeoutCount = results.tests.filter(t => t.status === 'timeout').length;

  console.log(`\n总计: ${results.tests.length} 个测试`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${errorCount}`);
  console.log(`⏱️  超时: ${timeoutCount}`);

  console.log(`\n\n详细结果:`);
  console.log(`\n| 搜索方式 | 状态 | 耗时 | 说明 |`);
  console.log(`|---------|------|------|------|`);

  for (const test of results.tests) {
    const statusIcon = test.status === 'success' ? '✅' : test.status === 'timeout' ? '⏱️' : '❌';
    const errorMsg = test.error ? test.error.substring(0, 30) : '-';
    console.log(`| ${test.name} | ${statusIcon} | ${test.duration}ms | ${errorMsg} |`);
  }

  // 保存结果到文件
  const fs = await import('fs');
  const resultsPath = './search-test-results.json';
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n\n💾 详细结果已保存到: ${resultsPath}`);
}

main().catch(console.error);
