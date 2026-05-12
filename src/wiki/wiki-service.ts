/**
 * LLM Wiki - 知识库管理系统
 *
 * 整合 Karpathy Wiki 架构与三层标签体系
 * 适配 sql.js 版本
 */

import initSqlJs, { Database } from 'sql.js';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface WikiItem {
  id: string;
  type: 'entity' | 'concept' | 'summary';
  slug: string;
  title: string;
  content: string;
  tags: {
    level1: string;
    level2: string;
    level3: string;
  };
  source?: string;
  metadata?: {
    originalFile?: string;
    sourceLines?: string;
  };
  usageCount: number;
  importanceScore: number;
  createdAt: number;
  updatedAt: number;
}

export interface WikiLink {
  fromSlug: string;
  toSlug: string;
}

export interface LintResult {
  contradictions: Array<{ page: string; issue: string }>;
  outdated: Array<{ page: string; lastUpdate: number; sourceUpdate: number }>;
  orphans: string[];
  brokenLinks: Array<{ from: string; to: string }>;
  drift: Array<{ page: string; issue: string }>;
  coverage: string[];
}

/**
 * Wiki 服务类（sql.js 版本）
 */
export class WikiService {
  private db: Database | null = null;
  private wikiRoot: string;
  private sourcesDir: string;
  private wikiDir: string;
  private dbPath: string;
  private initialized = false;

  constructor(wikiRoot: string = path.join(process.env.HOME || '', 'wiki')) {
    this.wikiRoot = wikiRoot;
    this.sourcesDir = path.join(wikiRoot, 'sources');
    this.wikiDir = path.join(wikiRoot, 'wiki');
    this.dbPath = path.join(wikiRoot, 'knowledge.db');
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 初始化 sql.js
    const SQL = await initSqlJs();

    // 确保目录存在
    await fs.mkdir(this.sourcesDir, { recursive: true });
    await fs.mkdir(this.wikiDir, { recursive: true });
    await fs.mkdir(path.join(this.wikiDir, 'entities'), { recursive: true });
    await fs.mkdir(path.join(this.wikiDir, 'concepts'), { recursive: true });
    await fs.mkdir(path.join(this.wikiDir, 'summaries'), { recursive: true });

    // 加载或创建数据库
    if (await this.fileExists(this.dbPath)) {
      const buffer = await fs.readFile(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
      this.initDatabase();
      await this.saveToFile();
    }

    this.initialized = true;
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 保存数据库到文件
   */
  private async saveToFile(): Promise<void> {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    await fs.writeFile(this.dbPath, buffer);
  }

  /**
   * 初始化数据库表
   */
  private initDatabase(): void {
    if (!this.db) throw new Error('Database not initialized');

    // 知识条目表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS wiki_items (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags_level1 TEXT,
        tags_level2 TEXT,
        tags_level3 TEXT,
        source TEXT,
        metadata_original_file TEXT,
        metadata_source_lines TEXT,
        usage_count INTEGER DEFAULT 0,
        importance_score INTEGER DEFAULT 5,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 引用关系表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS wiki_links (
        from_slug TEXT NOT NULL,
        to_slug TEXT NOT NULL,
        PRIMARY KEY (from_slug, to_slug)
      )
    `);

    // 创建索引
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_items_type ON wiki_items(type);
      CREATE INDEX IF NOT EXISTS idx_items_slug ON wiki_items(slug);
      CREATE INDEX IF NOT EXISTS idx_items_updated ON wiki_items(updated_at);
    `);
  }

  /**
   * 保存/更新知识条目
   */
  async save(item: Omit<WikiItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');
    await this.initialize();

    const now = Date.now();
    const id = item.slug;

    const existing = this.getBySlug(item.slug);

    if (existing) {
      // 更新
      const stmt = this.db.prepare(`
        UPDATE wiki_items
        SET type = ?, title = ?, content = ?,
            tags_level1 = ?, tags_level2 = ?, tags_level3 = ?,
            source = ?, metadata_original_file = ?, metadata_source_lines = ?,
            importance_score = ?, updated_at = ?
        WHERE slug = ?
      `);
      stmt.run([
        item.type, item.title, item.content,
        item.tags.level1, item.tags.level2, item.tags.level3,
        item.source || null, item.metadata?.originalFile || null, item.metadata?.sourceLines || null,
        item.importanceScore, now,
        item.slug
      ]);
      stmt.free();
    } else {
      // 新增
      const stmt = this.db.prepare(`
        INSERT INTO wiki_items
        (id, type, slug, title, content, tags_level1, tags_level2, tags_level3,
         source, metadata_original_file, metadata_source_lines,
         usage_count, importance_score, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([
        id, item.type, item.slug, item.title, item.content,
        item.tags.level1, item.tags.level2, item.tags.level3,
        item.source || null, item.metadata?.originalFile || null, item.metadata?.sourceLines || null,
        0, item.importanceScore, now, now
      ]);
      stmt.free();
    }

    await this.saveToFile();

    // 同时写入 Markdown 文件
    await this.writeMarkdownFile({ ...item, id, createdAt: now, updatedAt: now });

    return id;
  }

  /**
   * 写入 Markdown 文件
   */
  private async writeMarkdownFile(item: WikiItem): Promise<void> {
    const typeDir = item.type === 'entity' ? 'entities' :
                    item.type === 'concept' ? 'concepts' : 'summaries';
    const filePath = path.join(this.wikiDir, typeDir, `${item.slug}.md`);

    const metadata = `---
title: ${item.title}
type: ${item.type}
tags: ${item.tags.level1}/${item.tags.level2}/${item.tags.level3}
importance: ${item.importanceScore}/10
usage_count: ${item.usageCount}
created_at: ${new Date(item.createdAt).toISOString()}
updated_at: ${new Date(item.updatedAt).toISOString()}
---

`;

    await fs.writeFile(filePath, metadata + item.content, 'utf-8');
  }

  /**
   * 根据 slug 获取条目
   */
  getBySlug(slug: string): WikiItem | null {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('SELECT * FROM wiki_items WHERE slug = ?');
    stmt.bind([slug]);
    if (stmt.step()) {
      const result = stmt.getAsObject() as any;
      stmt.free();
      return this.rowToItem(result);
    }
    stmt.free();
    return null;
  }

  /**
   * 根据 ID 获取条目
   */
  get(id: string): WikiItem | null {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('SELECT * FROM wiki_items WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) {
      const result = stmt.getAsObject() as any;
      stmt.free();
      return this.rowToItem(result);
    }
    stmt.free();
    return null;
  }

  /**
   * 搜索条目
   */
  search(query: string, options?: { type?: string; tags?: { level1?: string; level2?: string; level3?: string } }): WikiItem[] {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM wiki_items WHERE 1=1';
    const params: any[] = [];

    if (options?.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }
    if (options?.tags?.level1) {
      sql += ' AND tags_level1 = ?';
      params.push(options.tags.level1);
    }
    if (options?.tags?.level2) {
      sql += ' AND tags_level2 = ?';
      params.push(options.tags.level2);
    }
    if (options?.tags?.level3) {
      sql += ' AND tags_level3 = ?';
      params.push(options.tags.level3);
    }

    // 文本搜索（使用 LIKE）
    if (query) {
      sql += ' AND (title LIKE ? OR content LIKE ?)';
      params.push(`%${query}%`, `%${query}%`);
    }

    sql += ' ORDER BY usage_count DESC, importance_score DESC';

    const stmt = this.db.prepare(sql);
    stmt.bind(params);

    const results: WikiItem[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push(this.rowToItem(row));
    }
    stmt.free();

    return results;
  }

  /**
   * 列出所有条目
   */
  list(options?: { type?: string; limit?: number; offset?: number }): WikiItem[] {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM wiki_items WHERE 1=1';
    const params: any[] = [];

    if (options?.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }
    sql += ' ORDER BY updated_at DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(sql);
    stmt.bind(params);

    const results: WikiItem[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push(this.rowToItem(row));
    }
    stmt.free();

    return results;
  }

  /**
   * 删除条目
   */
  async delete(slug: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM wiki_items WHERE slug = ?');
    stmt.run([slug]);
    stmt.free();

    const linkStmt = this.db.prepare('DELETE FROM wiki_links WHERE from_slug = ? OR to_slug = ?');
    linkStmt.run([slug, slug]);
    linkStmt.free();

    await this.saveToFile();
  }

  /**
   * 增加使用次数
   */
  async incrementUsage(slug: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('UPDATE wiki_items SET usage_count = usage_count + 1 WHERE slug = ?');
    stmt.run([slug]);
    stmt.free();

    await this.saveToFile();
  }

  /**
   * 保存引用关系
   */
  async saveLink(fromSlug: string, toSlug: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('INSERT OR IGNORE INTO wiki_links (from_slug, to_slug) VALUES (?, ?)');
    stmt.run([fromSlug, toSlug]);
    stmt.free();

    await this.saveToFile();
  }

  /**
   * 获取所有标签
   */
  getAllTags(): { level1: string[]; level2: string[]; level3: string[] } {
    if (!this.db) throw new Error('Database not initialized');

    const stmt1 = this.db.prepare('SELECT DISTINCT tags_level1 FROM wiki_items ORDER BY tags_level1');
    const level1: string[] = [];
    while (stmt1.step()) {
      const row = stmt1.getAsObject() as any;
      if (row.tags_level1) level1.push(row.tags_level1);
    }
    stmt1.free();

    const stmt2 = this.db.prepare('SELECT DISTINCT tags_level2 FROM wiki_items ORDER BY tags_level2');
    const level2: string[] = [];
    while (stmt2.step()) {
      const row = stmt2.getAsObject() as any;
      if (row.tags_level2) level2.push(row.tags_level2);
    }
    stmt2.free();

    const stmt3 = this.db.prepare('SELECT DISTINCT tags_level3 FROM wiki_items ORDER BY tags_level3');
    const level3: string[] = [];
    while (stmt3.step()) {
      const row = stmt3.getAsObject() as any;
      if (row.tags_level3) level3.push(row.tags_level3);
    }
    stmt3.free();

    return { level1, level2, level3 };
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalItems: number;
    byType: Record<string, number>;
    byTag: Record<string, number>;
    mostUsed: WikiItem[];
    recentUpdates: WikiItem[];
  } {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM wiki_items');
    stmt.step();
    const totalResult = stmt.getAsObject() as any;
    const totalItems = totalResult.count;
    stmt.free();

    const byTypeStmt = this.db.prepare('SELECT type, COUNT(*) as count FROM wiki_items GROUP BY type');
    const byType: Record<string, number> = {};
    while (byTypeStmt.step()) {
      const row = byTypeStmt.getAsObject() as any;
      byType[row.type] = row.count;
    }
    byTypeStmt.free();

    const byTagStmt = this.db.prepare(`
      SELECT tags_level1 || '/' || tags_level2 as tag, COUNT(*) as count
      FROM wiki_items
      GROUP BY tags_level1 || '/' || tags_level2
    `);
    const byTag: Record<string, number> = {};
    while (byTagStmt.step()) {
      const row = byTagStmt.getAsObject() as any;
      byTag[row.tag] = row.count;
    }
    byTagStmt.free();

    const mostUsedStmt = this.db.prepare('SELECT * FROM wiki_items ORDER BY usage_count DESC LIMIT 10');
    const mostUsed: WikiItem[] = [];
    while (mostUsedStmt.step()) {
      const row = mostUsedStmt.getAsObject() as any;
      mostUsed.push(this.rowToItem(row));
    }
    mostUsedStmt.free();

    const recentStmt = this.db.prepare('SELECT * FROM wiki_items ORDER BY updated_at DESC LIMIT 10');
    const recentUpdates: WikiItem[] = [];
    while (recentStmt.step()) {
      const row = recentStmt.getAsObject() as any;
      recentUpdates.push(this.rowToItem(row));
    }
    recentStmt.free();

    return {
      totalItems,
      byType,
      byTag,
      mostUsed,
      recentUpdates,
    };
  }

  /**
   * Lint 健康检查
   */
  async lint(): Promise<LintResult> {
    await this.initialize();
    const result: LintResult = {
      contradictions: [],
      outdated: [],
      orphans: [],
      brokenLinks: [],
      drift: [],
      coverage: [],
    };

    if (!this.db) return result;

    // 1. 孤岛检测
    const allSlugsStmt = this.db.prepare('SELECT slug FROM wiki_items');
    const allSlugs: string[] = [];
    while (allSlugsStmt.step()) {
      const row = allSlugsStmt.getAsObject() as any;
      allSlugs.push(row.slug);
    }
    allSlugsStmt.free();

    const linkedSlugsStmt = this.db.prepare('SELECT DISTINCT to_slug FROM wiki_links');
    const linkedSet = new Set<string>();
    while (linkedSlugsStmt.step()) {
      const row = linkedSlugsStmt.getAsObject() as any;
      linkedSet.add(row.to_slug);
    }
    linkedSlugsStmt.free();

    allSlugs.forEach(slug => {
      if (!linkedSet.has(slug)) {
        result.orphans.push(slug);
      }
    });

    // 2. 断链检测
    const linksStmt = this.db.prepare('SELECT * FROM wiki_links');
    while (linksStmt.step()) {
      const link = linksStmt.getAsObject() as any;
      const existsStmt = this.db.prepare('SELECT 1 FROM wiki_items WHERE slug = ?');
      existsStmt.bind([link.to_slug]);
      const exists = existsStmt.step();
      existsStmt.free();

      if (!exists) {
        result.brokenLinks.push({ from: link.from_slug, to: link.to_slug });
      }
    }
    linksStmt.free();

    // 3. 覆盖率检测
    try {
      const sourceFiles = await fs.readdir(this.sourcesDir);
      const mdFiles = sourceFiles.filter(f => f.endsWith('.md'));

      for (const file of mdFiles) {
        const stmt = this.db.prepare('SELECT 1 FROM wiki_items WHERE metadata_original_file = ?');
        stmt.bind([file]);
        const isProcessed = stmt.step();
        stmt.free();

        if (!isProcessed) {
          result.coverage.push(file);
        }
      }
    } catch (e) {
      // sources 目录可能不存在
    }

    return result;
  }

  /**
   * 深度 Lint（防漂移检查）
   */
  async deepLint(sampleCount: number = 5): Promise<Array<{ page: string; issues: string[] }>> {
    await this.initialize();
    const results: Array<{ page: string; issues: string[] }> = [];

    if (!this.db) return results;

    // 随机抽取页面
    const allItems = this.list();
    const sampleSize = Math.min(sampleCount, allItems.length);

    for (let i = 0; i < sampleSize; i++) {
      const item = allItems[Math.floor(Math.random() * allItems.length)];
      const issues: string[] = [];

      // 检查数字是否标注来源
      const numberPattern = /\d+\.?\d*[%亿万千]/g;
      const numbers = item.content.match(numberPattern) || [];

      for (const num of numbers) {
        const hasSource = item.content.includes('(sources/') || item.content.includes('(→ [[');
        if (!hasSource) {
          issues.push(`数字 "${num}" 未标注来源`);
        }
      }

      // 检查是否有元数据
      if (!item.metadata?.originalFile && !item.metadata?.sourceLines) {
        issues.push('缺少来源元数据');
      }

      if (issues.length > 0) {
        results.push({ page: item.slug, issues });
      }
    }

    return results;
  }

  /**
   * 生成索引内容
   */
  generateIndex(): string {
    const stats = this.getStats();
    const entities = this.list({ type: 'entity' });
    const concepts = this.list({ type: 'concept' });
    const summaries = this.list({ type: 'summary' });
    const tags = this.getAllTags();

    let md = `# Wiki 索引\n\n`;
    md += `_最后更新: ${new Date().toISOString().split('T')[0]} — ${stats.totalItems} 页_\n\n`;

    // 统计
    md += `## 统计\n\n`;
    md += `- 总页面数: ${stats.totalItems}\n`;
    md += `- 实体页面: ${stats.byType.entity || 0}\n`;
    md += `- 概念页面: ${stats.byType.concept || 0}\n`;
    md += `- 来源摘要: ${stats.byType.summary || 0}\n\n`;

    // 实体
    md += `## 实体（Entities）\n\n`;
    md += `| 页面 | 摘要 | 标签 | 更新 | 重要性 |\n`;
    md += `|------|------|------|------|--------|\n`;
    for (const item of entities.slice(0, 20)) {
      const summary = item.content.split('\n')[0].substring(0, 30);
      const tags = `${item.tags.level1}/${item.tags.level2}`;
      const updated = new Date(item.updatedAt).toISOString().split('T')[0];
      md += `| [[${item.slug}]] | ${summary} | ${tags} | ${updated} | ${item.importanceScore} |\n`;
    }

    // 概念
    md += `\n## 概念（Concepts）\n\n`;
    md += `| 页面 | 摘要 | 标签 | 更新 | 使用次数 |\n`;
    md += `|------|------|------|------|----------|\n`;
    for (const item of concepts.slice(0, 20)) {
      const summary = item.content.split('\n')[0].substring(0, 30);
      const tags = `${item.tags.level1}/${item.tags.level2}`;
      const updated = new Date(item.updatedAt).toISOString().split('T')[0];
      md += `| [[${item.slug}]] | ${summary} | ${tags} | ${updated} | ${item.usageCount} |\n`;
    }

    // 标签云
    md += `\n## 标签云\n\n`;
    md += `**一级标签**: `;
    md += tags.level1.map(t => `${t}(${stats.byTag[t] || 0})`).join(' | ');
    md += `\n\n`;

    return md;
  }

  /**
   * 追加日志
   */
  async appendLog(entry: string): Promise<void> {
    const logPath = path.join(this.wikiDir, 'log.md');
    const timestamp = new Date().toISOString();
    const logEntry = `\n## [${timestamp.split('T')[0]}] ${entry}\n`;
    await fs.appendFile(logPath, logEntry, 'utf-8');
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.saveToFile();
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
  }

  /**
   * 将数据库行转换为 WikiItem
   */
  private rowToItem(row: any): WikiItem {
    return {
      id: row.id,
      type: row.type,
      slug: row.slug,
      title: row.title,
      content: row.content,
      tags: {
        level1: row.tags_level1 || '',
        level2: row.tags_level2 || '',
        level3: row.tags_level3 || '',
      },
      source: row.source,
      metadata: {
        originalFile: row.metadata_original_file,
        sourceLines: row.metadata_source_lines,
      },
      usageCount: row.usage_count,
      importanceScore: row.importance_score,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export default WikiService;
