/**
 * MCP Memory 数据导出工具
 * 将 MCP Memory 中的知识图谱数据导出为知识库格式
 */

import { KnowledgeItem, TagHierarchy } from '../skill/types.js';

export interface MemoryGraphData {
  nodes: Array<{
    name: string;
    type: string;
    observations: string[];
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
  }>;
}

export interface ExportedKnowledge {
  content: string;
  tags: TagHierarchy;
  source: string;
  metadata: Record<string, any>;
  importanceScore: number;
}

export class MemoryExporter {
  /**
   * 从 MCP Memory 导出数据
   */
  static async exportFromMCPMemory(): Promise<ExportedKnowledge[]> {
    const exportedItems: ExportedKnowledge[] = [];

    try {
      // 1. 读取知识图谱
      const graphData = await this.readMemoryGraph();

      // 2. 转换为知识条目
      const knowledgeItems = this.convertGraphToKnowledge(graphData);

      exportedItems.push(...knowledgeItems);

      // 3. 添加摘要
      console.log(`✅ 从 MCP Memory 导出 ${exportedItems.length} 条知识`);

    } catch (error) {
      console.error(`❌ 导出失败: ${error}`);
    }

    return exportedItems;
  }

  /**
   * 读取 MCP Memory 知识图谱
   */
  private static async readMemoryGraph(): Promise<MemoryGraphData> {
    // 调用 MCP Memory 工具读取图谱
    // 这里需要实际调用 MCP 工具，暂时返回模拟数据

    // 实际实现中，应该调用：
    // const graph = await mcp__memory__read_graph();

    // 模拟数据（基于用户提供的营养知识）
    return {
      nodes: [
        {
          name: '营养素',
          type: '概念',
          observations: [
            '42种必需营养素，是生命运转的基础',
            '缺乏会导致细胞损伤和疾病',
            '包括蛋白质、维生素、矿物质等'
          ]
        },
        {
          name: '三分治七分养',
          type: '医疗',
          observations: [
            '药物治疗只能控制症状',
            '营养支持才能修复组织',
            '传统医疗原则'
          ]
        },
        {
          name: '细胞',
          type: '生物学',
          observations: [
            '疾病的本质是细胞损伤',
            '营养素缺乏导致细胞功能障碍',
            '健康需要从细胞层面调理'
          ]
        },
        {
          name: '药物',
          type: '医疗',
          observations: [
            '可以控制症状',
            '但不能修复组织',
            '需要营养支持配合'
          ]
        },
        {
          name: '克山病',
          type: '疾病',
          observations: [
            '因缺硒导致的心肌病',
            '典型营养缺乏病',
            '通过补充硒可以预防'
          ]
        }
      ],
      relationships: [
        { from: '三分治七分养', to: '药物', type: '包含' },
        { from: '三分治七分养', to: '营养素', type: '包含' },
        { from: '营养素', to: '细胞', type: '作用' },
        { from: '药物', to: '细胞', type: '作用' },
        { from: '细胞', to: '克山病', type: '导致' }
      ]
    };
  }

  /**
   * 将知识图谱转换为知识条目
   */
  private static convertGraphToKnowledge(graphData: MemoryGraphData): ExportedKnowledge[] {
    const items: ExportedKnowledge[] = [];

    // 1. 为每个实体创建知识条目
    for (const node of graphData.nodes) {
      const content = this.generateContentFromNode(node, graphData);
      const tags = this.inferTags(node);

      items.push({
        content,
        tags,
        source: 'MCP Memory',
        metadata: {
          originalType: node.type,
          observationsCount: node.observations.length,
          exportDate: new Date().toISOString()
        },
        importanceScore: this.calculateImportance(node)
      });
    }

    // 2. 为关系创建知识条目
    for (const rel of graphData.relationships) {
      const content = this.generateContentFromRelation(rel, graphData);
      const tags = this.inferRelationTags(rel);

      items.push({
        content,
        tags,
        source: 'MCP Memory',
        metadata: {
          relationType: rel.type,
          from: rel.from,
          to: rel.to,
          exportDate: new Date().toISOString()
        },
        importanceScore: 6
      });
    }

    return items;
  }

  /**
   * 从实体生成内容
   */
  private static generateContentFromNode(node: any, graphData: MemoryGraphData): string {
    let content = `# ${node.name}\n\n`;

    // 添加观察
    if (node.observations && node.observations.length > 0) {
      content += `## 核心要点\n\n`;
      node.observations.forEach((obs: string, index: number) => {
        content += `${index + 1}. ${obs}\n`;
      });
      content += '\n';
    }

    // 添加相关关系
    const relatedRelations = graphData.relationships.filter(
      r => r.from === node.name || r.to === node.name
    );

    if (relatedRelations.length > 0) {
      content += `## 关联关系\n\n`;
      relatedRelations.forEach(rel => {
        const relationText = rel.from === node.name
          ? `${rel.from} → ${rel.type} → ${rel.to}`
          : `${rel.to} ← ${rel.type} ← ${rel.from}`;
        content += `- ${relationText}\n`;
      });
    }

    return content;
  }

  /**
   * 从关系生成内容
   */
  private static generateContentFromRelation(rel: any, graphData: MemoryGraphData): string {
    return `# ${rel.from}与${rel.to}的关系\n\n` +
           `**关系类型**: ${rel.type}\n\n` +
           `${rel.from}通过${rel.type}与${rel.to}相关联。\n\n` +
           `这种关系体现了：\n` +
           `- ${rel.from}的作用机制\n` +
           `- ${rel.to}的影响因素\n`;
  }

  /**
   * 推断标签（基于实体类型）
   */
  private static inferTags(node: any): TagHierarchy {
    const type = node.type || '概念';
    const name = node.name || '';

    // 根据实体类型推断一级标签
    let level1 = '学习';
    if (type.includes('医疗') || type.includes('疾病')) {
      level1 = '学习';
    } else if (type.includes('生物')) {
      level1 = '学习';
    }

    // 根据实体名称推断二级标签
    let level2 = '通用';
    if (name.includes('营养') || name.includes('维生素')) {
      level2 = '营养学';
    } else if (name.includes('病') || name.includes('症')) {
      level2 = '医学';
    } else if (name.includes('细胞') || name.includes('药物')) {
      level2 = '生物学';
    }

    // 三级标签使用实体名称
    const level3 = name.substring(0, 10);

    return {
      level1,
      level2,
      level3
    };
  }

  /**
   * 推断关系标签
   */
  private static inferRelationTags(rel: any): TagHierarchy {
    return {
      level1: '学习',
      level2: '关系',
      level3: rel.type || '关联'
    };
  }

  /**
   * 计算重要性分数
   */
  private static calculateImportance(node: any): number {
    let score = 5; // 基础分

    // 根据观察数量加分
    if (node.observations) {
      score += Math.min(node.observations.length, 3);
    }

    // 根据类型加分
    if (node.type === '疾病' || node.type === '医疗') {
      score += 2;
    }

    return Math.min(score, 10);
  }

  /**
   * 生成导入报告
   */
  static generateImportReport(items: ExportedKnowledge[]): string {
    let report = '📊 MCP Memory 数据导入报告\n\n';
    report += `${'═'.repeat(50)}\n\n`;

    report += `### 导入统计\n\n`;
    report += `- 总条目数: ${items.length}\n`;
    report += `- 数据来源: MCP Memory\n`;
    report += `- 导入时间: ${new Date().toLocaleString('zh-CN')}\n\n`;

    // 按标签分组统计
    const byTag = new Map<string, number>();
    items.forEach(item => {
      const key = `${item.tags.level1} > ${item.tags.level2}`;
      byTag.set(key, (byTag.get(key) || 0) + 1);
    });

    report += `### 分类统计\n\n`;
    for (const [tag, count] of byTag.entries()) {
      report += `- ${tag}: ${count} 条\n`;
    }

    report += `\n${'═'.repeat(50)}\n`;

    return report;
  }
}
