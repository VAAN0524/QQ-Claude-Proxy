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
