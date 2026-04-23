import { v4 as uuidv4 } from 'uuid';
import { Storage } from './storage.js';
import {
  KnowledgeItem,
  TagHierarchy,
  SaveOptions,
  SearchQuery,
  SearchContext,
  KnowledgeServiceConfig,
  UsageStats
} from './types.js';

export class KnowledgeService {
  private storage: Storage;
  private config: KnowledgeServiceConfig;

  constructor(config: KnowledgeServiceConfig) {
    this.config = config;
    this.storage = new Storage(config.dbPath);
  }

  async initialize(): Promise<void> {
    await this.storage.initialize();
  }

  async save(content: string, tags: TagHierarchy, options?: SaveOptions): Promise<string> {
    const now = Date.now();
    const item: KnowledgeItem = {
      id: uuidv4(),
      contentType: 'text',
      content,
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

  async search(query: string, context?: SearchContext): Promise<KnowledgeItem[]> {
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

  async get(id: string): Promise<KnowledgeItem | null> {
    const item = await this.storage.getItem(id);
    if (item) {
      await this.storage.incrementUsage(id);
    }
    return item;
  }

  async update(id: string, updates: Partial<KnowledgeItem>): Promise<void> {
    await this.storage.updateItem(id, updates);
  }

  async delete(id: string): Promise<void> {
    await this.storage.deleteItem(id);
  }

  async getAllTags(): Promise<TagHierarchy[]> {
    return await this.storage.getAllTags();
  }

  async getStats(): Promise<UsageStats> {
    return await this.storage.getUsageStats();
  }

  async close(): Promise<void> {
    await this.storage.close();
  }
}
