#!/usr/bin/env node
/**
 * Wiki 调试脚本 - 检查数据库内容
 */

import { WikiService } from '../dist/wiki/wiki-service.js';
import path from 'path';

const wikiRoot = process.env.WIKI_ROOT || path.join(process.env.HOME || process.env.USERPROFILE || '', 'wiki');

async function debugWiki() {
  console.log('🔍 Wiki 调试模式...\n');

  const wiki = new WikiService(wikiRoot);
  await wiki.initialize();
  console.log('✓ Wiki 服务初始化成功\n');

  // 保存一条测试数据
  console.log('--- 保存测试数据 ---');
  await wiki.save({
    type: 'concept',
    slug: 'debug-test',
    title: '调试测试',
    content: '# 调试测试\n\n这是一条测试数据',
    tags: { level1: '测试', level2: '调试', level3: '测试' },
    source: 'debug',
    usageCount: 0,
    importanceScore: 5,
  });
  console.log('✓ 数据已保存\n');

  // 立即查询
  console.log('--- 立即查询 ---');
  const item = wiki.getBySlug('debug-test');
  console.log('查询结果:', item ? JSON.stringify(item, null, 2) : 'null');
  console.log('');

  // 列出所有数据
  console.log('--- 列出所有数据 ---');
  const allItems = wiki.list();
  console.log(`总数: ${allItems.length}`);
  allItems.forEach(i => console.log(`  - ${i.slug}: ${i.title}`));
  console.log('');

  // 搜索
  console.log('--- 搜索测试 ---');
  const results = wiki.search('调试');
  console.log(`搜索结果: ${results.length} 条`);
  results.forEach(i => console.log(`  - ${i.slug}: ${i.title}`));
  console.log('');

  // 统计
  console.log('--- 统计信息 ---');
  const stats = wiki.getStats();
  console.log(`总页面数: ${stats.totalItems}`);
  console.log(`按类型:`, JSON.stringify(stats.byType));
  console.log('');

  await wiki.close();
  
  // 重新打开数据库检查持久化
  console.log('--- 重新打开数据库检查持久化 ---');
  const wiki2 = new WikiService(wikiRoot);
  await wiki2.initialize();
  const item2 = wiki2.getBySlug('debug-test');
  console.log('持久化后查询:', item2 ? `✓ 找到: ${item2.title}` : '✗ 未找到');
  
  await wiki2.close();
}

debugWiki().catch(error => {
  console.error('❌ 调试失败:', error);
  process.exit(1);
});
