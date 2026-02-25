/**
 * Memory Module - 持久化记忆层
 */

export { MemoryService } from './MemoryService.js';
export { MemoryType, type MemoryEntry, type MemoryRetrieveOptions, type MemoryServiceOptions } from './MemoryService.js';
export { RAGService } from './RAGService.js';
export { type RetrievalResult, type RAGRetrieveOptions, type AugmentedContext, type RAGServiceOptions } from './RAGService.js';

// OpenViking 风格的分层记忆服务
export { HierarchicalMemoryService } from './HierarchicalMemoryService.js';
export {
  MemoryLayer,
  type HierarchicalMemoryEntry,
  type AgentMemoryConfig,
  type SharedMemoryConfig,
  type HierarchicalMemoryOptions,
  type AbstractIndex,
} from './HierarchicalMemoryService.js';

// 知识缓存服务
export { KnowledgeCache, KNOWLEDGE_TTL } from './KnowledgeCache.js';
export type { KnowledgeCacheOptions } from './KnowledgeCache.js';

// 搜索引擎
export { BM25SearchEngine, type SearchResult } from './SearchEngine.js';
export {
  HybridSearchEngine,
  type VectorSearchResult,
  type HybridSearchResult,
  type EmbeddingFn,
  type HybridSearchEngineOptions,
} from './HybridSearchEngine.js';

// 文档分块器
export { DocumentChunker, type Chunk, type ChunkerOptions } from './DocumentChunker.js';

// Embedding 缓存
export { EmbeddingCache, type CachedEmbedding, type EmbeddingCacheOptions } from './EmbeddingCache.js';

// 文件监听器
export { MemoryWatcher, createMemoryWatcher, type FileChangeEvent, type FileChangeType, type MemoryWatcherOptions } from './MemoryWatcher.js';
