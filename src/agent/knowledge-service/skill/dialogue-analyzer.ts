/**
 * 对话分析器 - Phase 3
 * 自动识别对话中的有价值知识点
 */

import { TagHierarchy } from './types.js';

export interface DialogueTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface KnowledgeCandidate {
  content: string;
  confidence: number;
  source: 'user' | 'assistant';
  reason: string;
  suggestedTags: string[];  // 内部使用，简单的字符串数组
  suggestedTagsHierarchy: TagHierarchy;  // 规范的三层标签结构
  relatedTopics: string[];
}

export class DialogueAnalyzer {
  private patterns: {
    problemSolution: RegExp[];
    codeExample: RegExp[];
    bestPractice: RegExp[];
    troubleshooting: RegExp[];
  };

  constructor() {
    this.patterns = {
      problemSolution: [
        /(?:问题|bug|错误|error|失败).{0,50}?(?:解决|方法|办法|fix|solved)/i,
        /(?:如何|怎么|怎样).{0,100}?(?:解决|处理|应对)/i,
        /(?:解决|处理|应对).{0,50}?(?:方法|办法|步骤)/i
      ],
      codeExample: [
        /```[\s\S]*?```/,
        /(?:代码|code|函数|function).{0,20}?[:：]/i,
        /import.*from|export.*function|class.*extends/i
      ],
      bestPractice: [
        /(?:最佳实践|best.practice|建议|推荐|应该)/i,
        /(?:优化|optimization|提升|改善).{0,30}?(?:性能|效率|效果)/i,
        /(?:模式|pattern|架构|architecture).{0,30}?(?:设计|实现)/i
      ],
      troubleshooting: [
        /(?:调试|debug|排错).{0,50}?(?:方法|技巧|工具)/i,
        /(?:错误|error|问题).{0,50}?(?:排查|定位|解决)/i,
        /(?:检查|查看|verify).{0,30}?(?:是否|是否正确)/i
      ]
    };
  }

  /**
   * 分析对话回合
   */
  analyzeDialogue(turns: DialogueTurn[]): KnowledgeCandidate[] {
    const candidates: KnowledgeCandidate[] = [];

    for (const turn of turns) {
      // 分析assistant回复（更可能包含解决方案）
      if (turn.role === 'assistant') {
        const assistantCandidates = this.extractKnowledge(turn.content, 'assistant');
        candidates.push(...assistantCandidates);
      }

      // 分析用户提问（可能包含问题描述）
      if (turn.role === 'user') {
        const userCandidates = this.extractKnowledge(turn.content, 'user');
        candidates.push(...userCandidates);
      }
    }

    // 去重和排序
    return this.deduplicateAndRank(candidates);
  }

  /**
   * 从文本中提取知识
   */
  private extractKnowledge(text: string, source: 'user' | 'assistant'): KnowledgeCandidate[] {
    const candidates: KnowledgeCandidate[] = [];

    // 检测问题-解决方案模式
    for (const pattern of this.patterns.problemSolution) {
      const matches = text.match(pattern);
      if (matches) {
        const tags = this.inferTags(matches[0]);
        candidates.push({
          content: matches[0],
          confidence: 0.8,
          source,
          reason: '问题解决方案',
          suggestedTags: tags,
          suggestedTagsHierarchy: this.convertToTagHierarchy(tags),
          relatedTopics: this.extractTopics(matches[0])
        });
      }
    }

    // 检测代码示例
    for (const pattern of this.patterns.codeExample) {
      const matches = text.match(pattern);
      if (matches) {
        const tags = ['开发', '代码'];
        candidates.push({
          content: matches[0],
          confidence: 0.7,
          source,
          reason: '代码示例',
          suggestedTags: tags,
          suggestedTagsHierarchy: this.convertToTagHierarchy(tags),
          relatedTopics: this.extractCodeTopics(matches[0])
        });
      }
    }

    // 检测最佳实践
    for (const pattern of this.patterns.bestPractice) {
      const matches = text.match(pattern);
      if (matches) {
        const tags = this.inferTags(matches[0]);
        candidates.push({
          content: matches[0],
          confidence: 0.9,
          source,
          reason: '最佳实践',
          suggestedTags: tags,
          suggestedTagsHierarchy: this.convertToTagHierarchy(tags),
          relatedTopics: this.extractTopics(matches[0])
        });
      }
    }

    // 检测调试技巧
    for (const pattern of this.patterns.troubleshooting) {
      const matches = text.match(pattern);
      if (matches) {
        const tags = ['工作', '调试'];
        candidates.push({
          content: matches[0],
          confidence: 0.75,
          source,
          reason: '调试技巧',
          suggestedTags: tags,
          suggestedTagsHierarchy: this.convertToTagHierarchy(tags),
          relatedTopics: this.extractTopics(matches[0])
        });
      }
    }

    return candidates;
  }

  /**
   * 将标签数组转换为 TagHierarchy
   */
  private convertToTagHierarchy(tags: string[]): TagHierarchy {
    return {
      level1: tags[0] || '工作',
      level2: tags[1] || '通用',
      level3: tags[2] || '其他'
    };
  }

  /**
   * 推断标签
   */
  private inferTags(content: string): string[] {
    const tags: string[] = [];

    // 技术栈标签
    if (/React|Vue|Angular|Next/i.test(content)) tags.push('前端');
    if (/Node|Express|Koa|Fastify/i.test(content)) tags.push('后端');
    if (/Python|Java|Go|Rust/i.test(content)) tags.push('开发');
    if (/SQL|MongoDB|Redis|PostgreSQL/i.test(content)) tags.push('数据库');
    if (/Git|Docker|Kubernetes|CI\/CD/i.test(content)) tags.push('运维');

    // 活动类型标签
    if (/调试|debug|排查|定位/i.test(content)) tags.push('调试');
    if (/优化|性能|提升|改善/i.test(content)) tags.push('优化');
    if (/部署|发布|上线/i.test(content)) tags.push('部署');
    if (/测试|test|验证/i.test(content)) tags.push('测试');

    // 默认标签
    if (tags.length === 0) {
      tags.push('工作', '其他');
    }

    return tags.slice(0, 3);
  }

  /**
   * 提取主题
   */
  private extractTopics(content: string): string[] {
    const topics: string[] = [];

    // 技术关键词
    const techKeywords = content.match(/[A-Z][a-z]+|[a-z]+(?:[A-Z][a-z]+)+/g) || [];
    topics.push(...techKeywords.slice(0, 5));

    return [...new Set(topics)];
  }

  /**
   * 提取代码主题
   */
  private extractCodeTopics(content: string): string[] {
    const topics: string[] = [];

    // 提取函数名、类名等
    const functionPattern = /(?:function|class|const|let)\s+(\w+)/g;
    let match;
    while ((match = functionPattern.exec(content)) !== null) {
      topics.push(match[1]);
    }

    return topics.slice(0, 5);
  }

  /**
   * 去重和排序
   */
  private deduplicateAndRank(candidates: KnowledgeCandidate[]): KnowledgeCandidate[] {
    // 按内容去重
    const unique = new Map<string, KnowledgeCandidate>();

    for (const candidate of candidates) {
      const key = candidate.content.substring(0, 50); // 使用前50个字符作为key
      const existing = unique.get(key);

      if (!existing || candidate.confidence > existing.confidence) {
        unique.set(key, candidate);
      }
    }

    // 按置信度排序
    return Array.from(unique.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 计算对话价值分数
   */
  calculateDialogueValue(turns: DialogueTurn[]): {
    totalScore: number;
    knowledgeCount: number;
    problemSolved: boolean;
    hasCode: boolean;
  } {
    let totalScore = 0;
    let knowledgeCount = 0;
    let problemSolved = false;
    let hasCode = false;

    for (const turn of turns) {
      // 检查问题解决
      if (/解决|成功|完成|fixed|solved/i.test(turn.content)) {
        problemSolved = true;
        totalScore += 2;
      }

      // 检查代码
      if (/```|function|class|import/i.test(turn.content)) {
        hasCode = true;
        totalScore += 1;
      }

      // 检查长度和复杂性
      if (turn.content.length > 100) {
        totalScore += 0.5;
      }
    }

    // 分析知识候选
    const candidates = this.analyzeDialogue(turns);
    knowledgeCount = candidates.length;

    return {
      totalScore,
      knowledgeCount,
      problemSolved,
      hasCode
    };
  }

  /**
   * 生成保存建议
   */
  generateSaveSuggestions(candidates: KnowledgeCandidate[], context: {
    recentTopics: string[];
    userPreferences: string[];
  }): Array<{
    content: string;
    suggestedTags: string[];
    confidence: number;
    reason: string;
    autoSave: boolean;
  }> {
    const suggestions = candidates
      .slice(0, 5) // 只取前5个
      .map(candidate => ({
        content: candidate.content,
        suggestedTags: this.refineTags(candidate.suggestedTags, context),
        confidence: candidate.confidence,
        reason: candidate.reason,
        autoSave: candidate.confidence > 0.8 // 高置信度自动保存
      }));

    return suggestions;
  }

  /**
   * 优化标签
   */
  private refineTags(suggestedTags: string[], context: {
    recentTopics: string[];
    userPreferences: string[];
  }): string[] {
    const refined = [...suggestedTags];

    // 基于最近主题优化
    for (const topic of context.recentTopics) {
      if (suggestedTags.some(tag => tag.includes(topic))) {
        if (!refined.includes(topic)) {
          refined.push(topic);
        }
      }
    }

    // 确保至少有3个标签
    while (refined.length < 3) {
      refined.push('通用');
    }

    return refined.slice(0, 3);
  }
}
