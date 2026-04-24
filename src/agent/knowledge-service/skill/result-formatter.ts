/**
 * 搜索结果格式化器 - 图书馆目录式展示
 * 提供简洁的摘要列表，避免信息过载
 */

import { KnowledgeItem, TagHierarchy } from './types.js';

export interface CatalogEntry {
  id: string;
  title: string;          // 从内容提取的标题
  summary: string;        // 简短摘要（100字以内）
  tags: TagHierarchy;     // 三层标签
  type: string;           // 内容类型
  relevanceScore: number; // 相关性分数 0-1
}

export interface SearchResultGroup {
  category: string;       // 分类（按一级标签）
  count: number;          // 该分类下的条目数
  entries: CatalogEntry[]; // 条目列表
}

export class ResultFormatter {
  /**
   * 格式化为图书馆目录式输出
   */
  static formatAsCatalog(
    items: KnowledgeItem[],
    maxItems: number = 20
  ): string {
    // 1. 去重
    const uniqueItems = this.deduplicateItems(items);

    // 2. 限制数量
    const limitedItems = uniqueItems.slice(0, maxItems);

    // 3. 按标签分组
    const groups = this.groupByTag(limitedItems);

    // 4. 生成目录格式
    let output = `📚 知识库目录 (共 ${limitedItems.length} 条)\n`;
    output += `${'═'.repeat(40)}\n\n`;

    for (const group of groups) {
      output += `## 📂 ${group.category} (${group.count} 条)\n\n`;

      for (const entry of group.entries) {
        output += this.formatCatalogEntry(entry);
      }

      output += '\n';
    }

    if (uniqueItems.length > maxItems) {
      output += `... 还有 ${uniqueItems.length - maxItems} 条未显示\n`;
    }

    output += `${'═'.repeat(40)}\n`;
    output += `💡 提示: 使用 /kb get <ID> 查看完整内容\n`;

    return output;
  }

  /**
   * 格式化单条目录条目
   */
  private static formatCatalogEntry(entry: CatalogEntry): string {
    const tags = `${entry.tags.level1} > ${entry.tags.level2}`;
    const relevance = entry.relevanceScore > 0
      ? ` [${Math.round(entry.relevanceScore * 100)}%匹配]`
      : '';

    return `  📄 ${entry.title}${relevance}
     └─ ${entry.summary}
     └─ 🏷️ ${tags}
     └─ 🆔 ${entry.id.substring(0, 8)}...
     └─ 👁️ ${entry.type}
\n`;
  }

  /**
   * 格式化详情视图
   */
  static formatDetail(item: KnowledgeItem): string {
    let output = `📖 知识详情\n`;
    output += `${'═'.repeat(40)}\n\n`;

    // 标题
    const title = this.extractTitle(item.content);
    output += `## ${title}\n\n`;

    // 元数据
    output += `**标签**: ${item.tags.level1} > ${item.tags.level2} > ${item.tags.level3}\n`;
    output += `**类型**: ${item.contentType}\n`;
    output += `**重要性**: ${'⭐'.repeat(Math.ceil(item.importanceScore / 2))} (${item.importanceScore}/10)\n`;
    output += `**使用次数**: ${item.usageCount} 次\n`;
    output += `**创建时间**: ${new Date(item.createdAt).toLocaleString('zh-CN')}\n`;

    if (item.source) {
      output += `**来源**: ${item.source}\n`;
    }

    output += `\n${'─'.repeat(40)}\n\n`;

    // 内容
    output += `### 内容\n\n${item.content}\n`;

    // 摘要（如果有）
    if (item.summary) {
      output += `\n### 摘要\n\n${item.summary}\n`;
    }

    // 元数据（如果有）
    if (item.metadata && Object.keys(item.metadata).length > 0) {
      output += `\n### 附加信息\n\n`;
      for (const [key, value] of Object.entries(item.metadata)) {
        output += `- **${key}**: ${value}\n`;
      }
    }

    output += `\n${'═'.repeat(40)}`;

    return output;
  }

  /**
   * 去重（基于内容相似度）
   */
  private static deduplicateItems(items: KnowledgeItem[]): KnowledgeItem[] {
    const unique = new Map<string, KnowledgeItem>();
    const seen = new Set<string>();

    for (const item of items) {
      // 生成内容指纹（前100个字符作为key）
      const fingerprint = this.generateFingerprint(item.content);

      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        unique.set(item.id, item);
      } else {
        // 如果内容相似，保留使用次数多的
        const existing = unique.get(this.findSimilarId(unique, fingerprint));
        if (existing && item.usageCount > existing.usageCount) {
          unique.delete(existing.id);
          unique.set(item.id, item);
        }
      }
    }

    return Array.from(unique.values());
  }

  /**
   * 生成内容指纹
   */
  private static generateFingerprint(content: string): string {
    // 移除空格和标点，取前50个字符
    const cleaned = content
      .replace(/\s+/g, '')
      .replace(/[^一-龥a-zA-Z0-9]/g, '')
      .toLowerCase();

    return cleaned.substring(0, 50);
  }

  /**
   * 查找相似ID
   */
  private static findSimilarId(items: Map<string, KnowledgeItem>, fingerprint: string): string {
    for (const [id, item] of items.entries()) {
      const itemFingerprint = this.generateFingerprint(item.content);
      if (itemFingerprint === fingerprint) {
        return id;
      }
    }
    return '';
  }

  /**
   * 按标签分组
   */
  private static groupByTag(items: KnowledgeItem[]): SearchResultGroup[] {
    const groups = new Map<string, KnowledgeItem[]>();

    // 按一级标签分组
    for (const item of items) {
      const category = item.tags.level1 || '未分类';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(item);
    }

    // 转换为 SearchResultGroup
    return Array.from(groups.entries()).map(([category, items]) => ({
      category,
      count: items.length,
      entries: items.map(item => this.createCatalogEntry(item))
    }));
  }

  /**
   * 创建目录条目
   */
  private static createCatalogEntry(item: KnowledgeItem): CatalogEntry {
    return {
      id: item.id,
      title: this.extractTitle(item.content),
      summary: this.extractSummary(item),
      tags: item.tags,
      type: item.contentType,
      relevanceScore: this.calculateRelevance(item)
    };
  }

  /**
   * 提取标题（从内容的第一行或前30个字符）
   */
  private static extractTitle(content: string): string {
    const lines = content.split('\n');
    const firstLine = lines[0].trim();

    // 如果第一行是标题格式（以#开头或较短），则作为标题
    if (firstLine.startsWith('#') || firstLine.length < 50) {
      return firstLine.replace(/^#+\s*/, '').substring(0, 50);
    }

    // 否则取前30个字符作为标题
    return content.substring(0, 30) + '...';
  }

  /**
   * 提取摘要（优先使用摘要字段，否则生成简短摘要）
   */
  private static extractSummary(item: KnowledgeItem): string {
    // 如果有预生成的摘要，使用它
    if (item.summary) {
      return item.summary.length > 100
        ? item.summary.substring(0, 100) + '...'
        : item.summary;
    }

    // 否则生成简短摘要
    const content = item.content;
    if (content.length <= 100) {
      return content;
    }

    // 取前100个字符作为摘要
    return content.substring(0, 100) + '...';
  }

  /**
   * 计算相关性分数
   */
  private static calculateRelevance(item: KnowledgeItem): number {
    // 基于使用次数和重要性计算
    const usageFactor = Math.min(item.usageCount / 10, 1); // 最多使用10次
    const importanceFactor = item.importanceScore / 10;

    return (usageFactor * 0.6 + importanceFactor * 0.4);
  }

  /**
   * 格式化为简洁列表（用于小屏幕或快速浏览）
   */
  static formatAsCompactList(items: KnowledgeItem[], maxItems: number = 10): string {
    const uniqueItems = this.deduplicateItems(items);
    const limitedItems = uniqueItems.slice(0, maxItems);

    let output = `📋 快速列表 (${limitedItems.length} 条)\n\n`;

    limitedItems.forEach((item, index) => {
      const title = this.extractTitle(item.content);
      const tags = `${item.tags.level1} > ${item.tags.level2}`;
      output += `${index + 1}. ${title}\n`;
      output += `   🏷️ ${tags} | 🆔 ${item.id.substring(0, 8)}...\n\n`;
    });

    if (uniqueItems.length > maxItems) {
      output += `... 还有 ${uniqueItems.length - maxItems} 条\n`;
    }

    return output;
  }
}
