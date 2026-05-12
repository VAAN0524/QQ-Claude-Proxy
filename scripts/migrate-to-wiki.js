#!/usr/bin/env node
import { KnowledgeService } from '../dist/agent/knowledge-service/skill/index.js';
import { WikiService } from '../dist/wiki/wiki-service.js';
import path from 'path';

const knowledgeDbPath = `${process.env.HOME || process.env.USERPROFILE}/.claude/data/knowledge/knowledge.db`;
const wikiRoot = process.env.WIKI_ROOT || path.join(process.env.HOME || process.env.USERPROFILE || '', 'wiki');

async function migrate() {
  console.log('🔄 开始迁移知识库...\n');

  // 初始化旧知识库
  console.log('📦 打开旧知识库...');
  const oldService = new KnowledgeService({ dbPath: knowledgeDbPath });
  await oldService.initialize();
  const oldItems = await oldService.list();
  console.log(`✓ 旧知识库共有 ${oldItems.length} 条\n`);

  // 初始化新 Wiki
  console.log('📚 打开新 Wiki...');
  const wiki = new WikiService(wikiRoot);
  await wiki.initialize();
  console.log(`✓ Wiki 已初始化\n`);

  // 迁移数据
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('开始迁移...\n');

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of oldItems) {
    try {
      // 生成 slug（使用内容前20个字符）
      const slug = item.content
        .substring(0, 20)
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w一-龥-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      // 生成标题（内容前50个字符）
      const title = item.content.substring(0, 50);

      // 映射类型
      let type = 'concept';
      if (item.contentType === 'image') type = 'entity';
      else if (item.contentType === 'file') type = 'summary';

      // 构建内容
      let content = item.content;
      if (item.summary) {
        content = `> ${item.summary}\n\n${item.content}`;
      }

      // 保存到 Wiki
      await wiki.save({
        type,
        slug,
        title,
        content,
        tags: {
          level1: item.tags.level1 || '未分类',
          level2: item.tags.level2 || '其他',
          level3: item.tags.level3 || '通用'
        },
        source: item.source || 'knowledge-service',
        metadata: {
          originalFile: item.metadata?.originalFile,
          sourceLines: item.metadata?.sourceLines
        },
        usageCount: item.usageCount,
        importanceScore: item.importanceScore
      });

      migrated++;
      console.log(`✓ [${migrated}] ${title} (${item.contentType})`);

    } catch (error) {
      errors++;
      console.error(`✗ 迁移失败: ${item.content.substring(0, 30)}... - ${error.message}`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 迁移统计:');
  console.log(`  成功: ${migrated}`);
  console.log(`  跳过: ${skipped}`);
  console.log(`  失败: ${errors}`);
  console.log('');

  // 显示新 Wiki 统计
  const wikiStats = wiki.getStats();
  console.log('📚 新 Wiki 统计:');
  console.log(`  总条目: ${wikiStats.totalItems}`);
  console.log(`  按类型: ${JSON.stringify(wikiStats.byType)}`);
  console.log('');

  // 关闭服务
  await oldService.close();
  await wiki.close();

  console.log('✅ 迁移完成！');
}

migrate().catch(error => {
  console.error('❌ 迁移失败:', error);
  process.exit(1);
});
