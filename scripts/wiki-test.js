#!/usr/bin/env node
/**
 * Wiki 功能测试脚本
 */

import { WikiService } from '../dist/wiki/wiki-service.js';
import { WikiCommands } from '../dist/wiki/wiki-commands.js';
import path from 'path';

const wikiRoot = process.env.WIKI_ROOT || path.join(process.env.HOME || process.env.USERPROFILE || '', 'wiki');

async function testWiki() {
  console.log('🧪 开始测试 Wiki 功能...\n');

  const wiki = new WikiService(wikiRoot);
  await wiki.initialize();
  console.log('✓ Wiki 服务初始化成功\n');

  // 测试保存
  console.log('--- 测试 1: 保存知识 ---');
  await wiki.save({
    type: 'concept',
    slug: 'test-websocket',
    title: 'WebSocket 连接超时',
    content: '# WebSocket 连接超时\n\n解决方法：检查防火墙设置',
    tags: { level1: '工作', level2: '调试', level3: 'WebSocket' },
    source: 'test',
    usageCount: 0,
    importanceScore: 7,
  });
  console.log('✓ 保存成功\n');

  // 测试搜索
  console.log('--- 测试 2: 搜索知识 ---');
  const results = wiki.search('WebSocket');
  console.log(`✓ 搜索结果: ${results.length} 条`);
  if (results.length > 0) {
    console.log(`  - ${results[0].title}`);
  }
  console.log('');

  // 测试获取
  console.log('--- 测试 3: 获取页面 ---');
  const item = wiki.getBySlug('test-websocket');
  if (item) {
    console.log(`✓ 获取成功: ${item.title}`);
    console.log(`  标签: ${item.tags.level1}/${item.tags.level2}/${item.tags.level3}`);
  }
  console.log('');

  // 测试列表
  console.log('--- 测试 4: 列出页面 ---');
  const items = wiki.list({ limit: 10 });
  console.log(`✓ 列表: ${items.length} 页\n`);

  // 测试统计
  console.log('--- 测试 5: 获取统计 ---');
  const stats = wiki.getStats();
  console.log(`✓ 统计:`);
  console.log(`  总页面数: ${stats.totalItems}`);
  console.log(`  按类型: ${JSON.stringify(stats.byType)}`);
  console.log('');

  // 测试命令处理器
  console.log('--- 测试 6: 命令处理器 ---');
  const commands = new WikiCommands(wikiRoot);
  const saveResult = await commands.handleCommand({
    userId: 'test-user',
    args: ['save', '测试内容2', '学习', '编程', 'Python'],
  });
  console.log(`✓ save 命令:\n${saveResult.substring(0, 100)}...\n`);

  const searchResult = await commands.handleCommand({
    userId: 'test-user',
    args: ['search', '测试'],
  });
  console.log(`✓ search 命令:\n${searchResult.substring(0, 100)}...\n`);

  const statsResult = await commands.handleCommand({
    userId: 'test-user',
    args: ['stats'],
  });
  console.log(`✓ stats 命令:\n${statsResult.substring(0, 200)}...\n`);

  // 测试 Lint
  console.log('--- 测试 7: Lint 检查 ---');
  const lintResult = await wiki.lint();
  console.log(`✓ Lint 结果:`);
  console.log(`  孤岛: ${lintResult.orphans.length} 页`);
  console.log(`  断链: ${lintResult.brokenLinks.length} 处`);
  console.log(`  未摄入: ${lintResult.coverage.length} 个`);
  console.log('');

  await wiki.close();

  console.log('✅ 所有测试完成！');
}

testWiki().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
