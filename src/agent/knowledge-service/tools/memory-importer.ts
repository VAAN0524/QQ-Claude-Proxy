/**
 * 数据导入工具
 * 将 MCP Memory 数据导入到知识库
 */

import { KnowledgeService } from '../skill/index.js';
import { MemoryExporter, ExportedKnowledge } from './memory-exporter.js';

export class MemoryImporter {
  private knowledgeService: KnowledgeService;

  constructor(knowledgeService: KnowledgeService) {
    this.knowledgeService = knowledgeService;
  }

  /**
   * 从 MCP Memory 导入数据到知识库
   */
  async importFromMCPMemory(): Promise<{
    imported: number;
    skipped: number;
    errors: number;
    report: string;
    errorDetails: string[];
  }> {
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    try {
      console.log('🔄 开始从 MCP Memory 导入数据...');

      // 1. 导出数据
      const exportedItems = await MemoryExporter.exportFromMCPMemory();

      if (exportedItems.length === 0) {
        return {
          imported: 0,
          skipped: 0,
          errors: 0,
          errorDetails: [],
          report: '⚠️ MCP Memory 中没有数据可导入'
        };
      }

      console.log(`📦 准备导入 ${exportedItems.length} 条知识...`);

      // 2. 导入到知识库
      const existingItems = await this.knowledgeService.list();
      const existingContent = new Set(
        existingItems.map(item => this.generateContentFingerprint(item.content))
      );

      console.log(`🔍 检查到 ${existingItems.length} 条现有知识`);

      for (let i = 0; i < exportedItems.length; i++) {
        const item = exportedItems[i];

        try {
          // 检查是否已存在
          const fingerprint = this.generateContentFingerprint(item.content);
          if (existingContent.has(fingerprint)) {
            skipped++;
            console.log(`⏭️ [${i + 1}/${exportedItems.length}] 跳过重复: ${item.content.substring(0, 30)}...`);
            continue;
          }

          // 验证数据
          if (!item.content || item.content.trim().length === 0) {
            errors++;
            const error = `内容为空: ${item.tags.level1} > ${item.tags.level2}`;
            errorDetails.push(error);
            console.error(`❌ [${i + 1}/${exportedItems.length}] ${error}`);
            continue;
          }

          if (!item.tags || !item.tags.level1 || !item.tags.level2 || !item.tags.level3) {
            errors++;
            const error = `标签不完整: ${item.content.substring(0, 30)}...`;
            errorDetails.push(error);
            console.error(`❌ [${i + 1}/${exportedItems.length}] ${error}`);
            continue;
          }

          // 保存到知识库
          console.log(`💾 [${i + 1}/${exportedItems.length}] 正在保存: ${item.content.substring(0, 30)}...`);

          await this.knowledgeService.save(
            item.content,
            item.tags,
            {
              source: item.source,
              metadata: item.metadata,
              importanceScore: item.importanceScore
            }
          );

          imported++;
          existingContent.add(fingerprint);
          console.log(`✅ [${i + 1}/${exportedItems.length}] 导入成功: ${item.content.substring(0, 30)}...`);

        } catch (error) {
          errors++;
          const errorMsg = `导入失败 [${i + 1}/${exportedItems.length}]: ${error}`;
          errorDetails.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }

      console.log(`🎉 导入完成！成功: ${imported}, 跳过: ${skipped}, 失败: ${errors}`);

      // 3. 生成报告
      const report = this.generateReport(imported, skipped, errors, exportedItems, errorDetails);

      return { imported, skipped, errors, report, errorDetails };

    } catch (error) {
      const errorMsg = `❌ 导入失败: ${error}`;
      console.error(errorMsg);
      errorDetails.push(errorMsg);

      return {
        imported: 0,
        skipped: 0,
        errors: 1,
        errorDetails,
        report: errorMsg
      };
    }
  }

  /**
   * 生成内容指纹（用于去重）
   */
  private generateContentFingerprint(content: string): string {
    const cleaned = content
      .replace(/\s+/g, '')
      .replace(/[^一-龥a-zA-Z0-9]/g, '')
      .toLowerCase();
    return cleaned.substring(0, 50);
  }

  /**
   * 生成导入报告
   */
  private generateReport(
    imported: number,
    skipped: number,
    errors: number,
    items: ExportedKnowledge[],
    errorDetails: string[]
  ): string {
    let report = '📊 数据导入完成报告\n\n';
    report += `${'═'.repeat(50)}\n\n`;

    report += `### 导入结果\n\n`;
    report += `- ✅ 成功导入: ${imported} 条\n`;
    if (skipped > 0) {
      report += `- ⏭️ 跳过重复: ${skipped} 条\n`;
    }
    if (errors > 0) {
      report += `- ❌ 导入失败: ${errors} 条\n`;
    }

    // 显示错误详情
    if (errorDetails.length > 0) {
      report += `\n### ❌ 错误详情\n\n`;
      errorDetails.forEach(error => {
        report += `- ${error}\n`;
      });
      report += '\n';
    }

    if (imported > 0) {
      report += `\n### ✅ 成功导入的数据\n\n`;

      // 按标签分组
      const byTag = new Map<string, ExportedKnowledge[]>();
      items.forEach(item => {
        const key = `${item.tags.level1} > ${item.tags.level2}`;
        if (!byTag.has(key)) {
          byTag.set(key, []);
        }
        byTag.get(key)!.push(item);
      });

      for (const [tag, tagItems] of byTag.entries()) {
        report += `#### ${tag} (${tagItems.length} 条)\n\n`;
        tagItems.slice(0, 5).forEach(item => {
          const title = item.content.split('\n')[0].replace(/^#+\s*/, '').substring(0, 40);
          report += `- ${title}\n`;
        });
        if (tagItems.length > 5) {
          report += `- ... 还有 ${tagItems.length - 5} 条\n`;
        }
        report += '\n';
      }
    }

    report += `${'═'.repeat(50)}\n`;
    report += `\n💡 提示: 使用 "帮我看看知识库里有什么" 查看导入的内容\n`;

    return report;
  }

  /**
   * 一键导入（便捷方法）
   */
  static async oneClickImport(knowledgeService: KnowledgeService): Promise<{
    imported: number;
    skipped: number;
    errors: number;
    report: string;
    errorDetails: string[];
  }> {
    const importer = new MemoryImporter(knowledgeService);
    const result = await importer.importFromMCPMemory();
    return result;
  }
}
