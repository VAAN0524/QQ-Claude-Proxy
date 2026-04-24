/**
 * 自动保存建议系统 - Phase 3
 * 智能分析对话，在适当时机建议保存知识
 */

import { DialogueAnalyzer, DialogueTurn, KnowledgeCandidate } from './dialogue-analyzer.js';
import { KnowledgeService } from './index.js';
import { SaveSuggestion, TagHierarchy } from './types.js';

export interface SuggestionContext {
  dialogueHistory: DialogueTurn[];
  recentSuggestions: number;
  lastSuggestionTime: number;
  userPreferences: string[];
  autoSaveEnabled: boolean;
}

export class AutoSaveSuggester {
  private analyzer: DialogueAnalyzer;
  private knowledgeService: KnowledgeService;
  private context: SuggestionContext;

  constructor(knowledgeService: KnowledgeService) {
    this.analyzer = new DialogueAnalyzer();
    this.knowledgeService = knowledgeService;
    this.context = {
      dialogueHistory: [],
      recentSuggestions: 0,
      lastSuggestionTime: 0,
      userPreferences: [],
      autoSaveEnabled: false // 默认不自动保存，需要用户确认
    };
  }

  /**
   * 记录对话回合
   */
  async recordDialogue(role: 'user' | 'assistant', content: string): Promise<void> {
    const turn: DialogueTurn = {
      role,
      content,
      timestamp: Date.now()
    };

    this.context.dialogueHistory.push(turn);

    // 保持最近20条对话
    if (this.context.dialogueHistory.length > 20) {
      this.context.dialogueHistory = this.context.dialogueHistory.slice(-20);
    }
  }

  /**
   * 检查是否应该建议保存
   */
  shouldSuggestSave(): boolean {
    // 检查时间间隔（避免频繁提示）
    const timeSinceLastSuggestion = Date.now() - this.context.lastSuggestionTime;
    if (timeSinceLastSuggestion < 5 * 60 * 1000) { // 5分钟间隔
      return false;
    }

    // 检查对话数量（至少有3轮对话）
    if (this.context.dialogueHistory.length < 3) {
      return false;
    }

    // 分析对话价值
    const value = this.analyzer.calculateDialogueValue(this.context.dialogueHistory);

    // 阈值：总分>3 或 有知识候选
    return value.totalScore > 3 || value.knowledgeCount > 0;
  }

  /**
   * 生成保存建议
   */
  async generateSuggestions(): Promise<SaveSuggestion[]> {
    const candidates = this.analyzer.analyzeDialogue(this.context.dialogueHistory);

    if (candidates.length === 0) {
      return [];
    }

    // 获取最近的主题
    const recentTopics = this.extractRecentTopics();

    // 生成建议
    const rawSuggestions = this.analyzer.generateSaveSuggestions(candidates, {
      recentTopics,
      userPreferences: this.context.userPreferences
    });

    // 转换为SaveSuggestion格式
    const suggestions: SaveSuggestion[] = rawSuggestions.map(s => ({
      content: s.content,
      suggestedTags: this.refineTagsToHierarchy(s.suggestedTags, { recentTopics, userPreferences: this.context.userPreferences }),
      confidence: s.confidence,
      reason: s.reason
    }));

    // 更新上下文
    this.context.lastSuggestionTime = Date.now();
    this.context.recentSuggestions++;

    return suggestions;
  }

  /**
   * 自动保存高置信度知识
   */
  async autoSaveHighConfidence(suggestions: SaveSuggestion[]): Promise<{
    saved: number;
    skipped: number;
    ids: string[];
  }> {
    let saved = 0;
    let skipped = 0;
    const ids: string[] = [];

    for (const suggestion of suggestions) {
      // 自动保存高置信度（>0.8）的知识
      if (suggestion.confidence > 0.8 && this.context.autoSaveEnabled) {
        const id = await this.knowledgeService.save(
          suggestion.content,
          suggestion.suggestedTags,
          {
            source: 'auto-save',
            metadata: {
              confidence: suggestion.confidence,
              reason: suggestion.reason,
              timestamp: Date.now()
            }
          }
        );

        saved++;
        ids.push(id);
      } else {
        skipped++;
      }
    }

    return { saved, skipped, ids };
  }

  /**
   * 生成用户友好的建议消息
   */
  generateSuggestionMessage(suggestions: SaveSuggestion[]): string {
    if (suggestions.length === 0) {
      return '';
    }

    let message = '💡 我发现了一些有价值的知识，建议保存：\n\n';

    suggestions.slice(0, 3).forEach((suggestion, index) => {
      const preview = suggestion.content.substring(0, 60);
      const tags = `${suggestion.suggestedTags.level1} > ${suggestion.suggestedTags.level2} > ${suggestion.suggestedTags.level3}`;

      message += `${index + 1}. ${preview}...\n`;
      message += `   📌 推荐标签: ${tags}\n`;
      message += `   ✅ 置信度: ${Math.round(suggestion.confidence * 100)}%\n`;

      // 高置信度知识自动保存提示
      if (suggestion.confidence > 0.8) {
        message += `   🤖 高质量知识，将自动保存\n`;
      }

      message += '\n';
    });

    message += '💬 回复 "保存" 或 "全部保存" 来保存这些知识';

    return message;
  }

  /**
   * 处理用户响应
   */
  async handleUserResponse(response: string, suggestions: SaveSuggestion[]): Promise<{
    saved: number;
    message: string;
  }> {
    let savedCount = 0;
    let message = '';

    if (response.includes('全部保存') || response.includes('都保存')) {
      // 保存所有建议
      for (const suggestion of suggestions) {
        await this.knowledgeService.save(
          suggestion.content,
          suggestion.suggestedTags,  // 已经是 TagHierarchy 类型
          { source: 'user-approved' }
        );
        savedCount++;
      }

      message = `✅ 已保存 ${savedCount} 条知识！`;

    } else if (response.includes('保存') || response.includes('好的')) {
      // 保存第一个建议
      const suggestion = suggestions[0];
      await this.knowledgeService.save(
        suggestion.content,
        suggestion.suggestedTags,  // 已经是 TagHierarchy 类型
        { source: 'user-approved' }
      );
      savedCount = 1;

      message = `✅ 已保存知识！\n\n${suggestion.content.substring(0, 50)}...`;

    } else {
      message = '❌ 没有保存任何知识。如果下次有合适的知识，我会继续提醒你。';
    }

    // 清空对话历史
    this.context.dialogueHistory = [];

    return { saved: savedCount, message };
  }

  /**
   * 提取最近主题
   */
  private extractRecentTopics(): string[] {
    const topics: string[] = [];

    for (const turn of this.context.dialogueHistory) {
      // 提取关键词
      const keywords = turn.content.match(/[A-Z][a-z]+|[一-龥]{2,}/g) || [];
      topics.push(...keywords.slice(0, 3));
    }

    // 去重并返回前10个
    return [...new Set(topics)].slice(0, 10);
  }

  /**
   * 将标签数组优化并转换为 TagHierarchy
   */
  private refineTagsToHierarchy(suggestedTags: string[], context: {
    recentTopics: string[];
    userPreferences: string[];
  }): TagHierarchy {
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

    const tags = refined.slice(0, 3);
    return {
      level1: tags[0] || '工作',
      level2: tags[1] || '通用',
      level3: tags[2] || '其他'
    };
  }

  /**
   * 启用/禁用自动保存
   */
  setAutoSaveEnabled(enabled: boolean): void {
    this.context.autoSaveEnabled = enabled;
  }

  /**
   * 更新用户偏好
   */
  updateUserPreferences(preferences: string[]): void {
    this.context.userPreferences = preferences;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    dialogueTurns: number;
    suggestionsMade: number;
    autoSaveEnabled: boolean;
  } {
    return {
      dialogueTurns: this.context.dialogueHistory.length,
      suggestionsMade: this.context.recentSuggestions,
      autoSaveEnabled: this.context.autoSaveEnabled
    };
  }

  /**
   * 重置对话历史
   */
  resetDialogue(): void {
    this.context.dialogueHistory = [];
  }
}
