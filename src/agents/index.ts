/**
 * Agent 系统导出
 *
 * 简化架构（工具层模式）：
 * - Simple 模式：使用 SimpleCoordinatorAgent（单 Agent + 工具层）
 * - CLI 模式：直接调用本地 Claude Code CLI
 */

// 基础接口
export * from './base/Agent.js';

// 核心组件
export { AgentRegistry } from './AgentRegistry.js';
export { AgentDispatcher } from './AgentDispatcher.js';
export { SharedContext } from './SharedContext.js';
export { SharedContextPersistence, SessionManager } from './SharedContextPersistence.js';
export { modeManager, AgentMode } from './ModeManager.js';

// 技能系统（Simple 模式使用）
export { SkillLoader } from './SkillLoader.js';
export type { SkillMetadata, SkillDefinition } from './SkillLoader.js';
export { SkillInstaller, SkillSource } from './SkillInstaller.js';
export type {
  SkillSearchResult,
  SkillInstallOptions,
  SkillInstallResult,
} from './SkillInstaller.js';

// 记忆服务
export { MemoryService, RAGService, HierarchicalMemoryService, KnowledgeCache } from './memory/index.js';
export type {
  MemoryEntry,
  MemoryRetrieveOptions,
  MemoryServiceOptions,
  MemoryType,
  RetrievalResult,
  RAGRetrieveOptions,
  AugmentedContext,
  RAGServiceOptions,
  MemoryLayer,
  HierarchicalMemoryEntry,
  AgentMemoryConfig,
  SharedMemoryConfig,
  HierarchicalMemoryOptions,
  AbstractIndex,
  KnowledgeCacheOptions,
} from './memory/index.js';

// 学习模块
export { LearningModule } from './learning/index.js';

// ============================================
// 优化组件（轻量化与智能化）
// ============================================
export { AgentLoader, registerAgent, getAgent, unloadAgent } from './AgentLoader.js';
export type { AgentFactory, AgentLoadStatus } from './AgentLoader.js';

export { LazyAgentProxy, createLazyAgent, registerLazyAgent } from './LazyAgentProxy.js';
export type { ProxyFactoryOptions } from './LazyAgentProxy.js';

export { ContextCompressor } from './ContextCompressor.js';
export type { Message, MessageRole, CompressionOptions, CompressionStats } from './ContextCompressor.js';

export { ResourceMonitor } from './ResourceMonitor.js';
export type { MemoryUsageInfo, SystemInfo, ProcessSnapshot, ResourceTrend } from './ResourceMonitor.js';

// ============================================
// 工具层（新架构）
// ============================================
export * from './tools-layer/index.js';

// ============================================
// 核心 Agents
// ============================================

// SimpleCoordinatorAgent - 单 Agent 模式的核心
export { SimpleCoordinatorAgent } from './SimpleCoordinatorAgent.js';
export type { SimpleCoordinatorConfig } from './SimpleCoordinatorAgent.js';

// SkillManagerAgent - 技能管理
export { SkillManagerAgent } from './SkillManagerAgent.js';

// ============================================
// 注意：专业 Agents 已整合到工具层
// ============================================
// - 搜索功能 → tools-layer/search-tools.ts
// - Shell 功能 → tools-layer/shell-tools.ts
// - Web 功能 → tools-layer/web-tools.ts
//
// 如果需要复杂的多 Agent 协作，请使用 CLI 模式调用本地 Claude Code CLI

// 工具定义（避免重复导出）
export * from './tools/agent-tools.js';
export * from './tools/file-tools.js';
export * from './tools/learning-tools.js';
export * from './tools/network_tool.js';

// 技能管理器
export { SkillManager } from '../skills/SkillManager.js';
export type { SkillMetadata as SkillManagerMetadata } from '../skills/SkillManager.js';

// Agent 注册中心
export {
  REGISTERED_AGENTS,
  getAgentMetadata,
  getEnabledAgents,
  getAgentsByIds,
  getAgentsByCapability,
  getDependencyTree,
  validateAgentConfig,
  printRegistrySummary,
} from './AgentRegistryWithPersonas.js';
export type { AgentMetadata } from './AgentRegistryWithPersonas.js';
