#!/usr/bin/env node
import { KnowledgeService } from '../dist/agent/knowledge-service/index.js';

async function listKnowledge() {
  const service = new KnowledgeService();
  await service.initialize();

  const allItems = await service.list();
  const stats = await service.getStats();

  console.log(`📦 旧知识库 (KnowledgeService)\n`);
  console.log(`总计: ${allItems.length} 条\n`);

  if (allItems.length === 0) {
    console.log('旧知识库为空。');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  allItems.forEach((item, index) => {
    console.log(`${index + 1}. **${item.content.substring(0, 50)}**`);
    console.log(`   ID: ${item.id}`);
    console.log(`   类型: ${item.contentType}`);
    console.log(`   标签: ${item.tags.level1} / ${item.tags.level2} / ${item.tags.level3}`);
    console.log(`   重要性: ${item.importanceScore}/10 | 使用次数: ${item.usageCount}`);
    console.log(`   来源: ${item.source || '无'}`);
    console.log(`   更新: ${new Date(item.updatedAt).toLocaleString('zh-CN')}`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 按类型统计:');
  Object.entries(stats.itemsByType).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });

  console.log('\n🏷️ 按标签统计:');
  Object.entries(stats.itemsByTag).forEach(([tag, count]) => {
    console.log(`  - ${tag}: ${count}`);
  });

  await service.close();
}

listKnowledge().catch(error => {
  console.error('❌ 查询失败:', error);
  process.exit(1);
});
