import { v4 as uuidv4 } from 'uuid';
import { Storage } from './storage.js';
import { SemanticSearchEngine } from './semantic-search.js';
import { AutoSaveSuggester } from './auto-save-suggester.js';
import {
  KnowledgeItem,
  TagHierarchy,
  SaveOptions,
  SearchQuery,
  SearchContext,
  KnowledgeServiceConfig,
  UsageStats,
  SemanticSearchResult,
  SaveSuggestion
} from './types.js';

/**
 * 知识库服务主类
 * 全局Skill服务，可在任何Claude Code会话中使用
 * Phase 2: 集成语义搜索
 * Phase 3: 集成自动保存建议
 */
export class KnowledgeService {
  private storage: Storage;
  private config: KnowledgeServiceConfig;
  private semanticEngine: SemanticSearchEngine;
  private autoSaveSuggester?: AutoSaveSuggester;
  private initialized = false;

  constructor(config?: Partial<KnowledgeServiceConfig>) {
    // 默认配置：使用全局数据目录
    const defaultConfig: KnowledgeServiceConfig = {
      dbPath: process.env.KNOWLEDGE_DB_PATH ||
             `${process.env.HOME || process.env.USERPROFILE}/.claude/data/knowledge/knowledge.db`,
      enableAutoExtraction: true, // Phase 3: 默认启用自动提取
      enableSemantic: true // Phase 2: 默认启用语义搜索
    };

    this.config = { ...defaultConfig, ...config };
    this.storage = new Storage(this.config.dbPath);
    this.semanticEngine = new SemanticSearchEngine();

    // Phase 3: 初始化自动保存建议系统
    if (this.config.enableAutoExtraction) {
      this.autoSaveSuggester = new AutoSaveSuggester(this);
    }
  }

  async initialize(): Promise<void> {
    await this.storage.initialize();

    // Phase 2: 初始化语义搜索引擎
    if (this.config.enableSemantic) {
      const items = await this.storage.getAllItems();
      await this.semanticEngine.initialize(items);
    }

    this.initialized = true;
  }

  /**
   * 保存知识
   * @param content 知识内容
   * @param tags 三层标签
   * @param options 可选参数（来源、元数据、重要性）
   * @returns 知识ID
   */
  async save(content: string, tags: TagHierarchy, options?: SaveOptions): Promise<string> {
    const now = Date.now();

    // Phase 2: 生成摘要
    let summary: string | undefined;
    if (options?.enableSummary !== false && this.config.enableSemantic) {
      summary = this.semanticEngine.generateSummary(content, 100);
    }

    const item: KnowledgeItem = {
      id: uuidv4(),
      contentType: 'text',
      content,
      summary,
      tags,
      source: options?.source,
      metadata: options?.metadata,
      usageCount: 0,
      importanceScore: options?.importanceScore ?? 5,
      createdAt: now,
      updatedAt: now
    };

    return await this.storage.saveItem(item);
  }

  /**
   * 搜索知识（Phase 2: 支持语义搜索）
   * @param query 搜索查询
   * @param context 搜索上下文（可选）
   * @returns 匹配的知识条目
   */
  async search(query: string, context?: SearchContext): Promise<KnowledgeItem[]> {
    const useSemantic = context?.useSemantic !== false && this.config.enableSemantic;

    if (useSemantic && this.initialized) {
      // Phase 2: 混合检索
      const items = await this.storage.getAllItems();
      const semanticResults = await this.semanticEngine.hybridSearch(query, items);

      // 更新使用统计
      for (const result of semanticResults) {
        await this.storage.incrementUsage(result.item.id);
      }

      return semanticResults.map(r => r.item);
    } else {
      // Phase 1: 关键词搜索
      const searchQuery: SearchQuery = {
        text: query,
        taskType: context?.taskType,
        limit: 20
      };

      const results = await this.storage.searchItems(searchQuery);

      // 更新使用统计
      for (const item of results) {
        await this.storage.incrementUsage(item.id);
      }

      return results;
    }
  }

  /**
   * Phase 2: 语义搜索（返回相似度分数）
   * @param query 搜索查询
   * @param options 搜索选项
   * @returns 语义搜索结果
   */
  async semanticSearch(
    query: string,
    options: {
      minSimilarity?: number;
      limit?: number;
    } = {}
  ): Promise<SemanticSearchResult[]> {
    if (!this.config.enableSemantic) {
      throw new Error('语义搜索未启用');
    }

    const items = await this.storage.getAllItems();
    return await this.semanticEngine.semanticSearch(query, items, options);
  }

  /**
   * Phase 2: 智能标签建议
   * @param content 知识内容
   * @returns 建议的标签
   */
  async suggestTags(content: string): Promise<string[]> {
    if (!this.config.enableSemantic) {
      return [];
    }

    const allTags = await this.storage.getAllTags();
    const tagLists = allTags.map(tags => [tags.level1, tags.level2, tags.level3]);
    return this.semanticEngine.suggestTags(content, tagLists);
  }

  /**
   * 获取知识详情
   * @param id 知识ID
   * @returns 知识条目或null
   */
  async get(id: string): Promise<KnowledgeItem | null> {
    const item = await this.storage.getItem(id);
    if (item) {
      await this.storage.incrementUsage(id);
    }
    return item;
  }

  /**
   * 更新知识
   * @param id 知识ID
   * @param updates 更新内容
   */
  async update(id: string, updates: Partial<KnowledgeItem>): Promise<void> {
    await this.storage.updateItem(id, updates);
  }

  /**
   * 删除知识
   * @param id 知识ID
   */
  async delete(id: string): Promise<void> {
    await this.storage.deleteItem(id);
  }

  /**
   * 获取所有标签
   * @returns 所有标签层级
   */
  async getAllTags(): Promise<TagHierarchy[]> {
    return await this.storage.getAllTags();
  }

  /**
   * 获取统计信息
   * @returns 使用统计
   */
  async getStats(): Promise<UsageStats> {
    return await this.storage.getUsageStats();
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    await this.storage.close();
  }

  /**
   * 列出所有知识（可选标签过滤）
   * @param tagFilter 标签过滤（可选）
   * @returns 知识条目列表
   */
  async list(tagFilter?: Partial<TagHierarchy>): Promise<KnowledgeItem[]> {
    const searchQuery: SearchQuery = {
      tags: tagFilter,
      limit: 100 // 默认限制100条
    };

    return await this.storage.searchItems(searchQuery);
  }

  // Phase 2: 新增方法

  /**
   * 分页获取知识
   * @param page 页码（从1开始）
   * @param pageSize 每页大小
   * @returns 分页结果
   */
  async listPaginated(page: number = 1, pageSize: number = 20): Promise<{
    items: KnowledgeItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    return await this.storage.getItemsPaginated(page, pageSize);
  }

  /**
   * 重建搜索索引
   * 当添加大量知识后调用，以更新语义搜索模型
   */
  async rebuildIndex(): Promise<void> {
    if (!this.config.enableSemantic) {
      return;
    }

    const items = await this.storage.getAllItems();
    await this.semanticEngine.initialize(items);

    // 更新所有条目的向量
    const embeddings = new Map<string, number[]>();
    for (const item of items) {
      if (item.embedding) {
        embeddings.set(item.id, item.embedding);
      }
    }

    await this.storage.updateEmbeddings(embeddings);
  }

  /**
   * 清理搜索缓存
   */
  clearCache(): void {
    this.semanticEngine.clearCache();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return this.semanticEngine.getCacheStats();
  }

  // Phase 3: 自动保存建议方法

  /**
   * 记录对话（用于自动提取）
   * @param role 角色（user/assistant）
   * @param content 对话内容
   */
  async recordDialogue(role: 'user' | 'assistant', content: string): Promise<void> {
    if (!this.autoSaveSuggester || !this.config.enableAutoExtraction) {
      return;
    }

    await this.autoSaveSuggester.recordDialogue(role, content);
  }

  /**
   * 检查是否应该建议保存
   * @returns 是否应该建议
   */
  shouldSuggestSave(): boolean {
    if (!this.autoSaveSuggester || !this.config.enableAutoExtraction) {
      return false;
    }

    return this.autoSaveSuggester.shouldSuggestSave();
  }

  /**
   * 生成保存建议
   * @returns 保存建议列表
   */
  async generateSaveSuggestions(): Promise<SaveSuggestion[]> {
    if (!this.autoSaveSuggester || !this.config.enableAutoExtraction) {
      return [];
    }

    return await this.autoSaveSuggester.generateSuggestions();
  }

  /**
   * 生成建议消息（用户友好格式）
   * @param suggestions 保存建议
   * @returns 格式化的消息
   */
  generateSuggestionMessage(suggestions: SaveSuggestion[]): string {
    if (!this.autoSaveSuggester) {
      return '';
    }

    return this.autoSaveSuggester.generateSuggestionMessage(suggestions);
  }

  /**
   * 处理用户对建议的响应
   * @param response 用户响应
   * @param suggestions 建议列表
   * @returns 保存结果和消息
   */
  async handleSuggestionResponse(
    response: string,
    suggestions: SaveSuggestion[]
  ): Promise<{
    saved: number;
    message: string;
  }> {
    if (!this.autoSaveSuggester) {
      return { saved: 0, message: '自动保存功能未启用' };
    }

    return await this.autoSaveSuggester.handleUserResponse(response, suggestions);
  }

  /**
   * 自动保存高置信度知识
   * @param suggestions 保存建议
   * @returns 保存结果
   */
  async autoSaveHighConfidence(suggestions: SaveSuggestion[]): Promise<{
    saved: number;
    skipped: number;
    ids: string[];
  }> {
    if (!this.autoSaveSuggester) {
      return { saved: 0, skipped: suggestions.length, ids: [] };
    }

    return await this.autoSaveSuggester.autoSaveHighConfidence(suggestions);
  }

  /**
   * 启用/禁用自动保存
   * @param enabled 是否启用
   */
  setAutoSaveEnabled(enabled: boolean): void {
    if (this.autoSaveSuggester) {
      this.autoSaveSuggester.setAutoSaveEnabled(enabled);
    }
  }

  /**
   * 重置对话历史
   */
  resetDialogueHistory(): void {
    if (this.autoSaveSuggester) {
      this.autoSaveSuggester.resetDialogue();
    }
  }

  /**
   * 获取自动保存统计
   * @returns 统计信息
   */
  getAutoSaveStats(): {
    dialogueTurns: number;
    suggestionsMade: number;
    autoSaveEnabled: boolean;
  } | null {
    if (!this.autoSaveSuggester) {
      return null;
    }

    return this.autoSaveSuggester.getStats();
  }
}
