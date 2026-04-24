/**
 * 自然语言接口 - Phase 2
 * 支持大白话操作，意图识别和自动标签提取
 */

import { Intent, TagHierarchy, KnowledgeItem } from './types.js';

export interface IntentPattern {
  pattern: RegExp;
  type: Intent['type'];
  extractors: {
    content?: RegExp;
    tags?: RegExp;
    id?: RegExp;
    query?: RegExp;
  };
}

export class NaturalLanguageInterface {
  private patterns: IntentPattern[];

  constructor() {
    this.patterns = this.initPatterns();
  }

  /**
   * 初始化意图模式
   */
  private initPatterns(): IntentPattern[] {
    return [
      // 保存知识意图
      {
        pattern: /保存|记录|记下|添加|新增|add|save/i,
        type: 'save',
        extractors: {
          content: /(?:保存|记录|记下|添加|新增)[：:：\s]*(.+?)(?:\s|$|，|,|标签|分类)/i,
          tags: /(?:标签|分类)[：:：\s]*(.+)/i
        }
      },

      // 搜索意图
      {
        pattern: /搜索|查找|找|寻找|查查|看看|search|find/i,
        type: 'search',
        extractors: {
          query: /(?:搜索|查找|找|寻找|查查|看看)[：:：\s]*(.+)/i
        }
      },

      // 获取详情意图
      {
        pattern: /详情|详细|完整内容|查看|get|detail/i,
        type: 'get',
        extractors: {
          id: /(?:[ID|id]*)[：:：\s]*([a-f0-9-]{36})/i
        }
      },

      // 列表意图
      {
        pattern: /列出|列表|所有|看看|list|show|all/i,
        type: 'list',
        extractors: {
          query: /(?:列出|列表|所有|看看|显示)[：:：\s]*(.+)?/i
        }
      },

      // 标签意图
      {
        pattern: /标签|分类|tags|categories/i,
        type: 'tags',
        extractors: {}
      },

      // 统计意图
      {
        pattern: /统计|信息|状态|数据|stats|status/i,
        type: 'stats',
        extractors: {}
      },

      // 删除意图
      {
        pattern: /删除|移除|去掉|delete|remove/i,
        type: 'delete',
        extractors: {
          id: /(?:[ID|id]*)[：:：\s]*([a-f0-9-]{36})/i
        }
      },

      // 更新意图
      {
        pattern: /更新|修改|编辑|update|edit/i,
        type: 'update',
        extractors: {
          id: /(?:[ID|id]*)[：:：\s]*([a-f0-9-]{36})/i,
          content: /(?:内容|改为|更新为)[：:：\s]*(.+)/i
        }
      }
    ];
  }

  /**
   * 解析自然语言输入
   *
   * 保守策略：只返回明确匹配的意图，不匹配时返回 unknown
   */
  parse(input: string): Intent {
    const trimmedInput = input.trim();

    // 尝试匹配每个意图模式
    for (const pattern of this.patterns) {
      if (pattern.pattern.test(trimmedInput)) {
        const extracted = this.extractInformation(trimmedInput, pattern);
        const confidence = this.calculateConfidence(trimmedInput, pattern);

        // 只返回高置信度的匹配（>= 0.7）
        if (confidence >= 0.7) {
          return {
            type: pattern.type,
            confidence,
            extracted
          };
        }
      }
    }

    // 不匹配任何模式或置信度过低：返回 unknown 意图
    return {
      type: 'unknown' as Intent['type'],
      confidence: 0,
      extracted: {}
    };
  }

  /**
   * 提取信息
   */
  private extractInformation(input: string, pattern: IntentPattern): Intent['extracted'] {
    const extracted: Intent['extracted'] = {};

    // 提取内容
    if (pattern.extractors.content) {
      const match = input.match(pattern.extractors.content);
      if (match && match[1]) {
        extracted.content = match[1].trim();
      }
    }

    // 提取标签
    if (pattern.extractors.tags) {
      const match = input.match(pattern.extractors.tags);
      if (match && match[1]) {
        const tags = this.parseTags(match[1]);
        if (tags) {
          extracted.tags = tags;
        }
      }
    }

    // 提取ID
    if (pattern.extractors.id) {
      const match = input.match(pattern.extractors.id);
      if (match && match[1]) {
        extracted.id = match[1];
      }
    }

    // 提取查询
    if (pattern.extractors.query) {
      const match = input.match(pattern.extractors.query);
      if (match && match[1]) {
        extracted.query = match[1].trim();
      }
    }

    return extracted;
  }

  /**
   * 解析标签
   */
  private parseTags(tagString: string): TagHierarchy | undefined {
    const parts = tagString.split(/[,，、\s]+/).filter(p => p.trim());

    if (parts.length >= 3) {
      return {
        level1: parts[0].trim(),
        level2: parts[1].trim(),
        level3: parts[2].trim()
      };
    } else if (parts.length === 2) {
      return {
        level1: parts[0].trim(),
        level2: parts[1].trim(),
        level3: '通用'
      };
    } else if (parts.length === 1) {
      return {
        level1: parts[0].trim(),
        level2: '通用',
        level3: '通用'
      };
    }

    return undefined;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(input: string, pattern: IntentPattern): number {
    let confidence = 0.5; // 基础置信度

    // 如果包含明确的动词
    if (/[保存|记录|搜索|查找|删除|更新]/.test(input)) {
      confidence += 0.2;
    }

    // 如果有明确的标点符号
    if (/[：:：,，]/.test(input)) {
      confidence += 0.1;
    }

    // 如果提取到了所需信息
    const extracted = this.extractInformation(input, pattern);
    const hasRequiredInfo = Object.keys(extracted).some(key =>
      extracted[key as keyof Intent['extracted']] !== undefined
    );

    if (hasRequiredInfo) {
      confidence += 0.2;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * 生成友好的回复
   */
  generateResponse(intent: Intent, result: any): string {
    switch (intent.type) {
      case 'save':
        return `✅ 已保存知识！\n${result}`;

      case 'search':
        if (result.length === 0) {
          return `📭 没有找到相关知识\n💡 试试换个说法或添加新知识`;
        }
        return `🔍 找到 ${result.length} 条相关知识\n\n${this.formatSearchResults(result)}`;

      case 'get':
        if (!result) {
          return `❌ 没有找到这个知识`;
        }
        return `📚 知识详情\n\n${this.formatKnowledgeDetail(result)}`;

      case 'list':
        return `📋 知识列表\n\n${this.formatListResults(result)}`;

      case 'tags':
        return `🏷️ 标签分类\n\n${this.formatTags(result)}`;

      case 'stats':
        return `📊 统计信息\n\n${this.formatStats(result)}`;

      case 'delete':
        return `🗑️ 已删除知识`;

      case 'update':
        return `✏️ 已更新知识`;

      default:
        return `❓ 不太明白你的意思，可以说得更具体点吗？`;
    }
  }

  /**
   * 格式化搜索结果
   */
  private formatSearchResults(results: KnowledgeItem[]): string {
    return results.slice(0, 5).map((item, index) => {
      const preview = item.summary || item.content.substring(0, 50);
      return `${index + 1}. [${item.tags.level1}] ${preview}...
   ID: ${item.id}`;
    }).join('\n\n');
  }

  /**
   * 格式化知识详情
   */
  private formatKnowledgeDetail(item: KnowledgeItem): string {
    return `内容: ${item.content}
标签: ${item.tags.level1} > ${item.tags.level2} > ${item.tags.level3}
类型: ${item.contentType}
重要性: ${item.importanceScore}/10
使用次数: ${item.usageCount}`;
  }

  /**
   * 格式化列表结果
   */
  private formatListResults(results: KnowledgeItem[]): string {
    return results.slice(0, 10).map((item, index) => {
      const preview = item.content.substring(0, 40);
      return `${index + 1}. ${preview}...
   ${item.tags.level1} > ${item.tags.level2}`;
    }).join('\n\n');
  }

  /**
   * 格式化标签
   */
  private formatTags(tags: TagHierarchy[]): string {
    const level1Tags = [...new Set(tags.map(t => t.level1))];

    return level1Tags.map(level1 => {
      const level2Tags = [...new Set(tags.filter(t => t.level1 === level1).map(t => t.level2))];
      return `${level1} (${level2Tags.length} 个二级标签)
${level2Tags.slice(0, 3).map(l2 => `  └─ ${l2}`).join('\n')}`;
    }).join('\n\n');
  }

  /**
   * 格式化统计
   */
  private formatStats(stats: any): string {
    return `总条目数: ${stats.totalItems}

按类型:
${Object.entries(stats.itemsByType).map(([type, count]) => `  - ${type}: ${count}`).join('\n')}

最常用:
${stats.mostUsedItems.slice(0, 5).map((item: KnowledgeItem, index: number) =>
  `  ${index + 1}. ${item.content.substring(0, 30)}... (${item.usageCount}次)`
).join('\n')}`;
  }

  /**
   * 生成帮助文本
   */
  getHelpText(): string {
    return `💬 你可以这样跟我说：

【保存知识】
"保存一下：WebSocket超时的解决方法，标签是工作、调试、WebSocket"
"记下来：React Hooks最佳实践，分类是开发、React、Hooks"

【搜索知识】
"帮我找找关于WebSocket的知识"
"我记得有个调试问题的解决方法"
"搜索 React 相关的内容"

【查看详情】
"看看这个知识的详细内容：ID"
"显示完整的知识信息"

【列表和统计】
"列出所有工作相关的知识"
"看看我都有哪些标签分类"
"给我看看统计信息"

【其他操作】
"删除这个知识：ID"
"更新知识的内容：ID"

💡 提示：说大白话就行，我会理解你的意思！`;
  }
}
