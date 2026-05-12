#!/usr/bin/env node
/**
 * 列出 Wiki 中的所有知识
 */

import { WikiService } from '../dist/wiki/wiki-service.js';
import path from 'path';

const wikiRoot = process.env.WIKI_ROOT || path.join(process.env.HOME || process.env.USERPROFILE || '', 'wiki');

async function listWiki() {
  const wiki = new WikiService(wikiRoot);
  await wiki.initialize();

  const allItems = wiki.list();
  const stats = wiki.getStats();

  console.log(`📚 Wiki 知识库\n`);
  console.log(`总计: ${allItems.length} 条\n`);

  if (allItems.length === 0) {
    console.log('暂无知识条目。使用 /wiki save 命令添加知识。');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  allItems.forEach((item, index) => {
    console.log(`${index + 1}. **${item.title}**`);
    console.log(`   Slug: ${item.slug}`);
    console.log(`   类型: ${item.type}`);
    console.log(`   标签: ${item.tags.level1} / ${item.tags.level2} / ${item.tags.level3}`);
    console.log(`   重要性: ${item.importanceScore}/10 | 使用次数: ${item.usageCount}`);
    console.log(`   更新: ${new Date(item.updatedAt).toLocaleString('zh-CN')}`);
    
    // 显示内容摘要
    const preview = item.content.split('\n').filter(line => line.trim()).slice(0, 2).join(' ');
    console.log(`   预览: ${preview.substring(0, 60)}...`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 按类型统计
  console.log('📊 按类型统计:');
  Object.entries(stats.byType).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });

  // 按标签统计
  console.log('\n🏷️ 按标签统计:');
  Object.entries(stats.byTag).forEach(([tag, count]) => {
    console.log(`  - ${tag}: ${count}`);
  });

  await wiki.close();
}

listWiki().catch(error => {
  console.error('❌ 查询失败:', error);
  process.exit(1);
});
