import initSqlJs, { Database } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import { KnowledgeItem, SearchQuery, UsageStats, TagHierarchy } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 知识库存储层 - SQLite + sql.js
 * 支持全局数据存储，跨项目共享
 */
export class Storage {
  private db: Database | null = null;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    // 初始化 sql.js
    const SQL = await initSqlJs();

    // 确保数据目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 加载或创建数据库
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
      this.createTables();
      this.saveToFile();
    }

    this.initialized = true;
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    // 知识条目表（Phase 2：添加摘要和向量列）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS knowledge_items (
        id TEXT PRIMARY KEY,
        content_type TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        level1_tag TEXT,
        level2_tag TEXT,
        level3_tag TEXT,
        source TEXT,
        metadata TEXT,
        usage_count INTEGER DEFAULT 0,
        importance_score INTEGER DEFAULT 5,
        embedding TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 创建索引（Phase 2：添加性能优化索引）
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_level1_tag ON knowledge_items(level1_tag);
      CREATE INDEX IF NOT EXISTS idx_level2_tag ON knowledge_items(level2_tag);
      CREATE INDEX IF NOT EXISTS idx_level3_tag ON knowledge_items(level3_tag);
      CREATE INDEX IF NOT EXISTS idx_created_at ON knowledge_items(created_at);
      CREATE INDEX IF NOT EXISTS idx_updated_at ON knowledge_items(updated_at);
      CREATE INDEX IF NOT EXISTS idx_usage_count ON knowledge_items(usage_count);
      CREATE INDEX IF NOT EXISTS idx_importance_score ON knowledge_items(importance_score);
    `);

    // Phase 2: 升级数据库（添加新列）
    this.upgradeSchema();
  }

  /**
   * 升级数据库schema（Phase 2）
   */
  private upgradeSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // 添加summary列（如果不存在）
      this.db.run(`ALTER TABLE knowledge_items ADD COLUMN summary TEXT`);
    } catch (e) {
      // 列已存在，忽略错误
    }

    try {
      // 添加embedding列（如果不存在）
      this.db.run(`ALTER TABLE knowledge_items ADD COLUMN embedding TEXT`);
    } catch (e) {
      // 列已存在，忽略错误
    }
  }

  private saveToFile(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  async saveItem(item: KnowledgeItem): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO knowledge_items (
        id, content_type, content, summary,
        level1_tag, level2_tag, level3_tag,
        source, metadata,
        usage_count, importance_score, embedding,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      item.id,
      item.contentType,
      item.content,
      item.summary || null,
      item.tags.level1,
      item.tags.level2,
      item.tags.level3,
      item.source || null,
      item.metadata ? JSON.stringify(item.metadata) : null,
      item.usageCount,
      item.importanceScore,
      item.embedding ? JSON.stringify(item.embedding) : null,
      item.createdAt,
      item.updatedAt
    );

    stmt.free();
    this.saveToFile();
    return item.id;
  }

  async getItem(id: string): Promise<KnowledgeItem | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM knowledge_items WHERE id = ?');
    stmt.bind([id]);
    const result = stmt.getAsObject() as any;

    stmt.free();

    if (!result || Object.keys(result).length === 0) return null;

    return this.mapRowToItem(result);
  }

  async searchItems(query: SearchQuery): Promise<KnowledgeItem[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM knowledge_items WHERE 1=1';
    const params: any[] = [];

    // 文本搜索（使用 LIKE）
    if (query.text) {
      sql += ' AND content LIKE ?';
      params.push(`%${query.text}%`);
    }

    // 标签过滤
    if (query.tags?.level1) {
      sql += ' AND level1_tag = ?';
      params.push(query.tags.level1);
    }
    if (query.tags?.level2) {
      sql += ' AND level2_tag = ?';
      params.push(query.tags.level2);
    }
    if (query.tags?.level3) {
      sql += ' AND level3_tag = ?';
      params.push(query.tags.level3);
    }

    // 排序和限制
    sql += ' ORDER BY usage_count DESC, importance_score DESC';
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    const stmt = this.db.prepare(sql);
    stmt.bind(params);

    const results: KnowledgeItem[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push(this.mapRowToItem(row));
    }

    stmt.free();

    // 去重
    const deduplicatedResults = this.deduplicateSearchResults(results);

    // 如果有limit限制，再次限制
    if (query.limit) {
      return deduplicatedResults.slice(0, query.limit);
    }

    return deduplicatedResults;
  }

  /**
   * 去重搜索结果
   */
  private deduplicateSearchResults(items: KnowledgeItem[]): KnowledgeItem[] {
    const unique = new Map<string, KnowledgeItem>();
    const seen = new Set<string>();

    for (const item of items) {
      const fingerprint = this.generateContentFingerprint(item.content);

      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        unique.set(item.id, item);
      } else {
        // 如果内容相似，保留使用次数多的
        const existing = Array.from(unique.values()).find(i =>
          this.generateContentFingerprint(i.content) === fingerprint
        );
        if (existing && item.usageCount > existing.usageCount) {
          unique.delete(existing.id);
          unique.set(item.id, item);
        }
      }
    }

    return Array.from(unique.values());
  }

  async updateItem(id: string, updates: Partial<KnowledgeItem>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const params: any[] = [];

    if (updates.content !== undefined) {
      fields.push('content = ?');
      params.push(updates.content);
    }
    if (updates.tags !== undefined) {
      fields.push('level1_tag = ?, level2_tag = ?, level3_tag = ?');
      params.push(updates.tags.level1, updates.tags.level2, updates.tags.level3);
    }
    if (updates.importanceScore !== undefined) {
      fields.push('importance_score = ?');
      params.push(updates.importanceScore);
    }

    fields.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);

    const sql = `UPDATE knowledge_items SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...params);
    stmt.free();
    this.saveToFile();
  }

  async deleteItem(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM knowledge_items WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    this.saveToFile();
  }

  async incrementUsage(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE knowledge_items
      SET usage_count = usage_count + 1, updated_at = ?
      WHERE id = ?
    `);
    stmt.run([Date.now(), id]);
    stmt.free();
    this.saveToFile();
  }

  async getAllTags(): Promise<TagHierarchy[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT DISTINCT level1_tag, level2_tag, level3_tag
      FROM knowledge_items
      ORDER BY level1_tag, level2_tag, level3_tag
    `);

    const results: TagHierarchy[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push({
        level1: row.level1_tag,
        level2: row.level2_tag,
        level3: row.level3_tag
      });
    }

    stmt.free();
    return results;
  }

  async getUsageStats(): Promise<UsageStats> {
    if (!this.db) throw new Error('Database not initialized');

    // 总条目数
    let stmt = this.db.prepare('SELECT COUNT(*) as count FROM knowledge_items');
    stmt.step();
    const totalResult = stmt.getAsObject() as any;
    const totalItems = totalResult.count;
    stmt.free();

    // 按类型统计
    stmt = this.db.prepare(`
      SELECT content_type, COUNT(*) as count
      FROM knowledge_items
      GROUP BY content_type
    `);
    const itemsByType: Record<string, number> = {};
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      itemsByType[row.content_type] = row.count;
    }
    stmt.free();

    // 按标签统计
    stmt = this.db.prepare(`
      SELECT level1_tag, COUNT(*) as count
      FROM knowledge_items
      GROUP BY level1_tag
    `);
    const itemsByTag: Record<string, number> = {};
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      itemsByTag[row.level1_tag] = row.count;
    }
    stmt.free();

    // 最常用条目
    stmt = this.db.prepare(`
      SELECT * FROM knowledge_items
      ORDER BY usage_count DESC
      LIMIT 10
    `);
    const mostUsedItems: KnowledgeItem[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      mostUsedItems.push(this.mapRowToItem(row));
    }
    stmt.free();

    // 最近使用条目
    stmt = this.db.prepare(`
      SELECT * FROM knowledge_items
      ORDER BY updated_at DESC
      LIMIT 10
    `);
    const recentlyUsedItems: KnowledgeItem[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      recentlyUsedItems.push(this.mapRowToItem(row));
    }
    stmt.free();

    return {
      totalItems,
      itemsByType,
      itemsByTag,
      mostUsedItems,
      recentlyUsedItems
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      this.saveToFile();
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
  }

  // Phase 2: 语义搜索方法

  /**
   * 获取所有知识条目（用于语义搜索）
   */
  async getAllItems(): Promise<KnowledgeItem[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM knowledge_items ORDER BY usage_count DESC');
    const results: KnowledgeItem[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push(this.mapRowToItem(row));
    }

    stmt.free();
    return results;
  }

  /**
   * 去重知识条目（基于内容相似度）
   * 返回去重后的条目列表
   */
  async deduplicateItems(): Promise<{ removed: number; remaining: number }> {
    if (!this.db) throw new Error('Database not initialized');

    const allItems = await this.getAllItems();
    const uniqueItems = new Map<string, KnowledgeItem>();
    const duplicates: string[] = [];
    const seen = new Set<string>();

    // 生成指纹并去重
    for (const item of allItems) {
      const fingerprint = this.generateContentFingerprint(item.content);

      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        uniqueItems.set(item.id, item);
      } else {
        duplicates.push(item.id);
      }
    }

    // 删除重复项
    for (const id of duplicates) {
      await this.deleteItem(id);
    }

    return {
      removed: duplicates.length,
      remaining: uniqueItems.size
    };
  }

  /**
   * 生成内容指纹（用于去重）
   */
  private generateContentFingerprint(content: string): string {
    // 移除空格、标点，转换为小写，取前50个字符
    const cleaned = content
      .replace(/\s+/g, '')
      .replace(/[^一-龥a-zA-Z0-9]/g, '')
      .toLowerCase();

    return cleaned.substring(0, 50);
  }

  /**
   * 批量更新向量嵌入
   */
  async updateEmbeddings(embeddings: Map<string, number[]>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('UPDATE knowledge_items SET embedding = ? WHERE id = ?');

    for (const [id, embedding] of embeddings.entries()) {
      stmt.run([JSON.stringify(embedding), id]);
    }

    stmt.free();
    this.saveToFile();
  }

  /**
   * 分页查询
   */
  async getItemsPaginated(page: number = 1, pageSize: number = 20): Promise<{
    items: KnowledgeItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    // 获取总数
    let stmt = this.db.prepare('SELECT COUNT(*) as count FROM knowledge_items');
    stmt.step();
    const totalResult = stmt.getAsObject() as any;
    const total = totalResult.count;
    stmt.free();

    // 计算分页
    const offset = (page - 1) * pageSize;
    const totalPages = Math.ceil(total / pageSize);

    // 获取数据
    stmt = this.db.prepare(`
      SELECT * FROM knowledge_items
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);
    stmt.bind([pageSize, offset]);

    const items: KnowledgeItem[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      items.push(this.mapRowToItem(row));
    }

    stmt.free();

    return {
      items,
      total,
      page,
      pageSize,
      totalPages
    };
  }

  private mapRowToItem(row: any): KnowledgeItem {
    return {
      id: row.id,
      contentType: row.content_type,
      content: row.content,
      summary: row.summary || undefined,
      tags: {
        level1: row.level1_tag,
        level2: row.level2_tag,
        level3: row.level3_tag
      },
      source: row.source,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      usageCount: row.usage_count,
      importanceScore: row.importance_score,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
