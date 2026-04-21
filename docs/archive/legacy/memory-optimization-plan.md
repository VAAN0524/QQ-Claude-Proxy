# Memory 系统优化方案 - 借鉴 OpenClaw

## 概述

借鉴 OpenClaw Memory 系统的优秀设计，优化当前 QQ-Claude-Proxy 的分层记忆系统。

## 优化目标

| 特性 | 当前状态 | 目标状态 |
|------|----------|----------|
| **搜索算法** | 纯 BM25 | 混合搜索 (70% 向量 + 30% BM25) |
| **Chunk 策略** | 不分块 | 400 tokens/chunk + 80 tokens 重叠 |
| **增量索引** | 手动刷新 | 文件监听自动更新 |
| **Embedding 缓存** | 无 | SHA-256 去重 |

---

## 1. 混合搜索（Hybrid Search）

### 架构设计

```
Query → TextProcessor (分词)
          ↓
    ┌─────────┴─────────┐
    ↓                   ↓
Vector Search         BM25 Search
(70% 权重)           (30% 权重)
    ↓                   ↓
    └─────────┬─────────┘
              ↓
        合并分数排序
              ↓
         返回结果
```

### 实现文件

**新建**: `src/agents/memory/HybridSearchEngine.ts`

```typescript
/**
 * 混合搜索引擎 - 向量搜索 + BM25
 *
 * 最终分数 = vectorWeight × 向量相似度 + textWeight × BM25 分数
 */

export class HybridSearchEngine {
  private vectorEngine: VectorSearchEngine;
  private bm25Engine: BM25SearchEngine;
  private vectorWeight: number = 0.7;
  private textWeight: number = 0.3;

  search(
    query: string,
    entries: HierarchicalMemoryEntry[],
    limit: number = 10
  ): SearchResult[] {
    // 1. 向量搜索
    const vectorResults = this.vectorEngine.search(query, entries, limit * 2);
    const vectorScores = new Map(vectorResults.map(r => [r.entry.id, r.score]));

    // 2. BM25 搜索
    const bm25Results = this.bm25Engine.search(query, entries, limit * 2);
    const bm25Scores = new Map(bm25Results.map(r => [r.entry.id, r.score]));

    // 3. 归一化并合并
    const combined = new Map<string, { entry: HierarchicalMemoryEntry; score: number }>();

    // 归一化向量分数
    const maxVector = Math.max(...vectorScores.values(), 1);
    for (const [id, score] of vectorScores) {
      combined.set(id, {
        entry: entries.find(e => e.id === id)!,
        score: (score / maxVector) * this.vectorWeight,
      });
    }

    // 归一化 BM25 分数并累加
    const maxBM25 = Math.max(...bm25Scores.values(), 1);
    for (const [id, score] of bm25Scores) {
      const existing = combined.get(id);
      const bm25Normalized = (score / maxBM25) * this.textWeight;
      if (existing) {
        existing.score += bm25Normalized;
      } else {
        combined.set(id, {
          entry: entries.find(e => e.id === id)!,
          score: bm25Normalized,
        });
      }
    }

    // 4. 排序返回
    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
```

### 需要的依赖

```json
{
  "dependencies": {
    "@ai-sdk/openai": "^1.0.0",  // 或使用其他 embedding provider
    "ollama": "^0.5.0"            // 本地 embedding 选项
  }
}
```

---

## 2. Chunk 策略

### 架构设计

```
长文档 (2000+ tokens)
    ↓
Sliding Window 切分
    ↓
┌─────────────────────────────────────┐
│ Chunk 1 (tokens 0-400)              │
│ Chunk 2 (tokens 320-720)  ← 重叠 80 │
│ Chunk 3 (tokens 640-1040) ← 重叠 80 │
│ ...                                  │
└─────────────────────────────────────┘
    ↓
每个 Chunk 独立索引
```

### 实现文件

**新建**: `src/agents/memory/Chunker.ts`

```typescript
/**
 * 文档分块器
 *
 * 策略:
 * - 目标大小: ~400 tokens (~1600 字符)
 * - 重叠大小: ~80 tokens (~320 字符)
 * - 保持句子边界完整
 */

export interface Chunk {
  id: string;
  parentId: string;  // 所属的记忆条目 ID
  content: string;
  startLine: number;
  endLine: number;
  tokenEstimate: number;
}

export class DocumentChunker {
  private static readonly TARGET_TOKENS = 400;
  private static readonly OVERLAP_TOKENS = 80;
  private static readonly CHARS_PER_TOKEN = 4;  // 粗略估计

  /**
   * 分块文档
   */
  static chunk(
    parentId: string,
    content: string,
    metadata: { sourceLine?: number } = {}
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const targetChars = this.TARGET_TOKENS * this.CHARS_PER_TOKEN;
    const overlapChars = this.OVERLAP_TOKENS * this.CHARS_PER_TOKEN;

    // 按句子分割
    const sentences = this.splitIntoSentences(content);

    let currentChunk = '';
    let chunkIndex = 0;
    let startLine = metadata.sourceLine || 0;
    let lineOffset = 0;

    for (const sentence of sentences) {
      const wouldExceed = currentChunk.length + sentence.length > targetChars;

      if (wouldExceed && currentChunk.length > 0) {
        // 保存当前 chunk
        chunks.push({
          id: `${parentId}_chunk${chunkIndex}`,
          parentId,
          content: currentChunk.trim(),
          startLine,
          endLine: startLine + lineOffset,
          tokenEstimate: Math.ceil(currentChunk.length / this.CHARS_PER_TOKEN),
        });

        // 开始新 chunk，保留重叠内容
        const overlapContent = this.getOverlapContent(currentChunk, overlapChars);
        currentChunk = overlapContent + sentence;
        startLine += lineOffset - this.countLines(overlapContent);
        chunkIndex++;
      } else {
        currentChunk += sentence;
      }

      lineOffset += this.countLines(sentence);
    }

    // 保存最后一个 chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: `${parentId}_chunk${chunkIndex}`,
        parentId,
        content: currentChunk.trim(),
        startLine,
        endLine: startLine + lineOffset,
        tokenEstimate: Math.ceil(currentChunk.length / this.CHARS_PER_TOKEN),
      });
    }

    return chunks;
  }

  /**
   * 按句子分割（支持中英文标点）
   */
  private static splitIntoSentences(text: string): string[] {
    const sentences: string[] = [];
    const parts = text.split(/([。！？.!?\n])/);

    for (let i = 0; i < parts.length - 1; i += 2) {
      const sentence = parts[i] + (parts[i + 1] || '');
      if (sentence.trim().length > 0) {
        sentences.push(sentence);
      }
    }

    // 处理剩余部分
    if (parts.length % 2 === 1 && parts[parts.length - 1].trim().length > 0) {
      sentences.push(parts[parts.length - 1]);
    }

    return sentences;
  }

  /**
   * 获取重叠内容（保留末尾 N 个字符）
   */
  private static getOverlapContent(content: string, overlapChars: number): string {
    if (content.length <= overlapChars) return content;

    // 尝试在句子边界处切割
    const fromEnd = content.substring(content.length - overlapChars);
    const sentenceBoundary = fromEnd.search(/[。！？.!?\n]/);

    if (sentenceBoundary > 0) {
      return content.substring(content.length - overlapChars + sentenceBoundary + 1);
    }

    return fromEnd;
  }

  /**
   * 计算行数
   */
  private static countLines(text: string): number {
    return (text.match(/\n/g) || []).length + 1;
  }
}
```

---

## 3. 增量索引

### 架构设计

```
文件监听 (chokidar)
      ↓
检测变化 (debounce 1.5s)
      ↓
┌─────┴─────┬─────────┐
↓           ↓         ↓
新增文件    修改文件   删除文件
↓           ↓         ↓
索引新增    重新索引   删除索引
```

### 实现文件

**新建**: `src/agents/memory/MemoryWatcher.ts`

```typescript
/**
 * 记忆文件监听器
 *
 * 监听 memory 目录变化，自动更新索引
 */

import chokidar from 'chokidar';
import path from 'path';
import { promises as fs } from 'fs';
import { logger } from '../../utils/logger.js';

export interface MemoryWatcherOptions {
  /** 监听路径 */
  watchPath: string;
  /** 防抖延迟（毫秒） */
  debounce?: number;
  /** 变化回调 */
  onChange: (type: 'add' | 'change' | 'unlink', filePath: string) => void | Promise<void>;
}

export class MemoryWatcher {
  private watcher?: chokidar.FSWatcher;
  private debounceTimer?: NodeJS.Timeout;
  private pendingChanges = new Set<string>();
  private readonly debounceMs: number;

  constructor(private options: MemoryWatcherOptions) {
    this.debounceMs = options.debounce || 1500;
  }

  /**
   * 启动监听
   */
  start(): void {
    logger.info(`[MemoryWatcher] 启动监听: ${this.options.watchPath}`);

    this.watcher = chokidar.watch(this.options.watchPath, {
      ignored: /(^|[\/\\])\../,  // 忽略隐藏文件
      persistent: true,
      ignoreInitial: true,       // 忽略初始扫描
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (path) => this.scheduleChange('add', path))
      .on('change', (path) => this.scheduleChange('change', path))
      .on('unlink', (path) => this.scheduleChange('unlink', path))
      .on('error', (error) => logger.error(`[MemoryWatcher] 错误: ${error}`));
  }

  /**
   * 调度变更（防抖）
   */
  private scheduleChange(type: 'add' | 'change' | 'unlink', filePath: string): void {
    this.pendingChanges.add(filePath);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      for (const path of this.pendingChanges) {
        try {
          await this.options.onChange(type, path);
        } catch (error) {
          logger.error(`[MemoryWatcher] 处理失败: ${path} - ${error}`);
        }
      }
      this.pendingChanges.clear();
    }, this.debounceMs);
  }

  /**
   * 停止监听
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}
```

### 需要的依赖

```json
{
  "dependencies": {
    "chokidar": "^4.0.0"
  }
}
```

---

## 4. Embedding 缓存

### 架构设计

```
文本内容
    ↓
计算 SHA-256 哈希
    ↓
检查缓存
    ↓
┌─────┴─────┐
↓           ↓
缓存命中    缓存未命中
↓           ↓
返回缓存    计算 embedding
              ↓
         存入缓存 (limit 50000)
              ↓
         返回结果
```

### 实现文件

**新建**: `src/agents/memory/EmbeddingCache.ts`

```typescript
/**
 * Embedding 缓存
 *
 * 使用 SHA-256 哈希去重，避免重复计算
 */

import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger.js';

export interface CachedEmbedding {
  hash: string;
  embedding: number[];
  createdAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
}

export interface EmbeddingCacheOptions {
  /** 缓存目录 */
  cacheDir?: string;
  /** 最大缓存条目数 */
  maxEntries?: number;
  /** 缓存文件名 */
  cacheFileName?: string;
}

export class EmbeddingCache {
  private cache: Map<string, CachedEmbedding> = new Map();
  private readonly maxEntries: number;
  private readonly cachePath: string;
  private dirty = false;
  private saveTimer?: NodeJS.Timeout;

  constructor(options: EmbeddingCacheOptions = {}) {
    this.maxEntries = options.maxEntries || 50000;
    this.cachePath = path.join(
      options.cacheDir || path.join(process.cwd(), 'data'),
      options.cacheFileName || 'embedding-cache.json'
    );
  }

  /**
   * 初始化：加载缓存
   */
  async initialize(): Promise<void> {
    try {
      const content = await fs.readFile(this.cachePath, 'utf-8');
      const data = JSON.parse(content);

      for (const entry of data) {
        entry.createdAt = new Date(entry.createdAt);
        entry.lastAccessedAt = new Date(entry.lastAccessedAt);
        this.cache.set(entry.hash, entry);
      }

      logger.info(`[EmbeddingCache] 已加载 ${this.cache.size} 条缓存`);
    } catch {
      logger.info('[EmbeddingCache] 无现有缓存，创建新缓存');
      this.cache.clear();
    }
  }

  /**
   * 获取 embedding（带缓存）
   */
  async get(
    text: string,
    computeFn: (text: string) => Promise<number[]>
  ): Promise<number[]> {
    const hash = this.hash(text);
    const cached = this.cache.get(hash);

    if (cached) {
      // 更新访问统计
      cached.accessCount++;
      cached.lastAccessedAt = new Date();

      this.scheduleSave();
      return cached.embedding;
    }

    // 计算新 embedding
    const embedding = await computeFn(text);

    // 存入缓存
    const entry: CachedEmbedding = {
      hash,
      embedding,
      createdAt: new Date(),
      accessCount: 1,
      lastAccessedAt: new Date(),
    };

    this.cache.set(hash, entry);

    // 检查缓存大小，必要时清理
    if (this.cache.size > this.maxEntries) {
      this.evictLRU();
    }

    this.scheduleSave();
    return embedding;
  }

  /**
   * 计算 SHA-256 哈希
   */
  private hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * LRU 淘汰
   */
  private evictLRU(): void {
    const sorted = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessedAt.getTime() - b[1].lastAccessedAt.getTime());

    // 删除最旧的 10%
    const toDelete = Math.floor(this.maxEntries * 0.1);
    for (let i = 0; i < toDelete; i++) {
      this.cache.delete(sorted[i][0]);
    }

    logger.info(`[EmbeddingCache] LRU 淘汰: 删除 ${toDelete} 条`);
  }

  /**
   * 定时保存（防抖）
   */
  private scheduleSave(): void {
    this.dirty = true;

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.save().catch(error => {
        logger.error(`[EmbeddingCache] 保存失败: ${error}`);
      });
    }, 5000);  // 5 秒后保存
  }

  /**
   * 保存到磁盘
   */
  async save(): Promise<void> {
    if (!this.dirty) return;

    try {
      const data = Array.from(this.cache.values());
      await fs.writeFile(
        this.cachePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );

      this.dirty = false;
      logger.debug(`[EmbeddingCache] 已保存 ${data.length} 条缓存`);
    } catch (error) {
      logger.error(`[EmbeddingCache] 保存失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    size: number;
    hitRate: number;
    totalAccess: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalAccess = entries.reduce((sum, e) => sum + e.accessCount, 0);
    const hitRate = totalAccess > 0 ? (totalAccess - entries.length) / totalAccess : 0;

    return {
      size: this.cache.size,
      hitRate,
      totalAccess,
    };
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    this.cache.clear();
    await this.save();
  }

  /**
   * 关闭（保存）
   */
  async shutdown(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    await this.save();
  }
}
```

---

## 5. 集成到 HierarchicalMemoryService

### 修改文件

**文件**: `src/agents/memory/HierarchicalMemoryService.ts`

```typescript
// 新增导入
import { HybridSearchEngine } from './HybridSearchEngine.js';
import { DocumentChunker } from './Chunker.js';
import { MemoryWatcher } from './MemoryWatcher.js';
import { EmbeddingCache } from './EmbeddingCache.js';
import { generateEmbedding } from './embedding.js';  // 需要新建

export class HierarchicalMemoryService extends MemoryService {
  private hybridSearchEngine: HybridSearchEngine;
  private chunker: DocumentChunker;
  private memoryWatcher?: MemoryWatcher;
  private embeddingCache: EmbeddingCache;

  async initialize(): Promise<void> {
    // ... 现有初始化代码 ...

    // 初始化 Embedding 缓存
    this.embeddingCache = new EmbeddingCache({
      cacheDir: path.join(process.cwd(), 'data'),
      maxEntries: 50000,
    });
    await this.embeddingCache.initialize();

    // 初始化混合搜索引擎
    this.hybridSearchEngine = new HybridSearchEngine({
      embeddingCache: this.embeddingCache,
      vectorWeight: 0.7,
      textWeight: 0.3,
    });

    // 启动文件监听
    this.memoryWatcher = new MemoryWatcher({
      watchPath: this.sharedMemoryPath,
      debounce: 1500,
      onChange: async (type, filePath) => {
        await this.handleFileChange(type, filePath);
      },
    });
    this.memoryWatcher.start();
  }

  /**
   * 处理文件变化
   */
  private async handleFileChange(
    type: 'add' | 'change' | 'unlink',
    filePath: string
  ): Promise<void> {
    logger.info(`[MemoryService] 文件变化: ${type} - ${filePath}`);

    switch (type) {
      case 'add':
      case 'change':
        await this.reindexFile(filePath);
        break;
      case 'unlink':
        await this.unindexFile(filePath);
        break;
    }
  }

  /**
   * 重新索引文件
   */
  private async reindexFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const entry: HierarchicalMemoryEntry = JSON.parse(content);

      // 分块
      const chunks = DocumentChunker.chunk(entry.id, entry.L2?.content || '');

      // 为每个 chunk 生成 embedding 并索引
      for (const chunk of chunks) {
        const embedding = await this.embeddingCache.get(
          chunk.content,
          generateEmbedding
        );
        this.hybridSearchEngine.indexChunk(chunk, embedding);
      }
    } catch (error) {
      logger.error(`[MemoryService] 重新索引失败: ${filePath} - ${error}`);
    }
  }

  async shutdown(): Promise<void> {
    if (this.memoryWatcher) {
      await this.memoryWatcher.stop();
    }
    await this.embeddingCache.shutdown();
    // ... 现有清理代码 ...
  }
}
```

---

## 6. 新建 Embedding 生成器

**新建**: `src/agents/memory/embedding.ts`

```typescript
/**
 * Embedding 生成
 *
 * 支持多种 provider:
 * - OpenAI (text-embedding-3-small/large)
 * - Ollama (本地模型)
 * - 智谱 AI (embedding API)
 */

import { logger } from '../../utils/logger.js';

export type EmbeddingProvider = 'openai' | 'ollama' | 'zhipu';

export interface EmbeddingOptions {
  provider?: EmbeddingProvider;
  model?: string;
  dimensions?: number;
}

/**
 * 生成 embedding
 */
export async function generateEmbedding(
  text: string,
  options: EmbeddingOptions = {}
): Promise<number[]> {
  const provider = options.provider || (process.env.OPENAI_API_KEY ? 'openai' : 'ollama');

  switch (provider) {
    case 'openai':
      return generateOpenAIEmbedding(text, options);
    case 'ollama':
      return generateOllamaEmbedding(text, options);
    case 'zhipu':
      return generateZhipuEmbedding(text, options);
    default:
      throw new Error(`不支持的 provider: ${provider}`);
  }
}

/**
 * OpenAI Embedding
 */
async function generateOpenAIEmbedding(
  text: string,
  options: EmbeddingOptions
): Promise<number[]> {
  // 实现 OpenAI API 调用
  // ...
}

/**
 * Ollama Embedding (本地)
 */
async function generateOllamaEmbedding(
  text: string,
  options: EmbeddingOptions
): Promise<number[]> {
  // 实现 Ollama API 调用
  // ...
}

/**
 * 智谱 AI Embedding
 */
async function generateZhipuEmbedding(
  text: string,
  options: EmbeddingOptions
): Promise<number[]> {
  // 实现智谱 API 调用
  // ...
}
```

---

## 7. package.json 更新

```json
{
  "dependencies": {
    "chokidar": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "ollama": "^0.5.0"
  }
}
```

---

## 实施步骤

1. **Phase 1: 基础设施** (高优先级)
   - [ ] 安装依赖 (chokidar, @ai-sdk/openai)
   - [ ] 实现 EmbeddingCache
   - [ ] 实现 DocumentChunker

2. **Phase 2: 混合搜索** (高优先级)
   - [ ] 实现 VectorSearchEngine
   - [ ] 实现 HybridSearchEngine
   - [ ] 集成到 HierarchicalMemoryService

3. **Phase 3: 增量索引** (中优先级)
   - [ ] 实现 MemoryWatcher
   - [ ] 实现文件变化处理逻辑
   - [ ] 测试和调试

4. **Phase 4: 优化和测试** (低优先级)
   - [ ] 性能测试
   - [ ] 搜索质量评估
   - [ ] 文档更新

---

## 预期效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| **语义搜索准确率** | ~60% | ~85% |
| **长文档召回率** | ~50% | ~80% |
| **索引更新延迟** | 手动 | <2s 自动 |
| **Embedding 计算** | 每次计算 | 缓存命中率 ~70% |
| **内存占用** | ~50MB | ~150MB (含缓存) |
