/**
 * 测试导入工具
 * 添加简单的测试数据验证知识库功能
 */

import { KnowledgeService } from '../skill/index.js';

export class TestDataImporter {
  /**
   * 导入测试数据
   */
  static async importTestData(knowledgeService: KnowledgeService): Promise<{
    success: number;
    failed: number;
    report: string;
  }> {
    let success = 0;
    let failed = 0;

    const testData = [
      {
        content: '# WebSocket连接超时\n\n## 解决方法\n\n1. 检查网络连接\n2. 调整超时时间\n3. 添加心跳机制',
        tags: { level1: '工作', level2: '调试', level3: 'WebSocket' },
        source: '测试数据',
        importanceScore: 8
      },
      {
        content: '# React Hooks性能优化\n\n## 优化技巧\n\n1. 使用useMemo缓存计算结果\n2. 使用useCallback优化回调函数\n3. 避免不必要的重渲染',
        tags: { level1: '工作', level2: '开发', level3: 'React' },
        source: '测试数据',
        importanceScore: 7
      },
      {
        content: '# 三分治七分养\n\n## 核心理念\n\n药物治疗只能控制症状，营养支持才能修复组织。',
        tags: { level1: '学习', level2: '医学', level3: '营养' },
        source: '测试数据',
        importanceScore: 9
      }
    ];

    for (const data of testData) {
      try {
        await knowledgeService.save(
          data.content,
          data.tags,
          {
            source: data.source,
            importanceScore: data.importanceScore
          }
        );
        success++;
        console.log(`✅ 测试数据导入成功: ${data.content.substring(0, 30)}...`);
      } catch (error) {
        failed++;
        console.error(`❌ 测试数据导入失败: ${error}`);
      }
    }

    let report = `📊 测试数据导入报告\n\n`;
    report += `✅ 成功: ${success} 条\n`;
    if (failed > 0) {
      report += `❌ 失败: ${failed} 条\n`;
    }
    report += `\n💡 提示: 使用 "帮我看看知识库里有什么" 查看导入的内容`;

    return { success, failed, report };
  }
}
