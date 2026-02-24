/**
 * Agent 系统导出
 *
 * 简化架构（工具层模式）：
 * - Simple 模式：使用 SimpleCoordinatorAgent（单 Agent + 工具层）
 * - CLI 模式：直接调用本地 Claude Code CLI
 *
 * 专业 Agents 已移动到 legacy/ 目录，功能已整合到工具层
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
// Legacy Agents（已整合到工具层）
// ============================================
// 以下 Agents 已被工具层替代，保留仅为向后兼容
//
// @deprecated 使用 tools-layer/search.ts 中的 smartSearch 代替
export { WebSearchAgent } from './legacy/WebSearchAgent.js';
//
// @deprecated 使用 tools-layer/web-tools.ts 中的 fetchWebContent 代替
export { BrowserAgent } from './legacy/BrowserAgent.js';
//
// @deprecated 使用 tools-layer/shell-tools.ts 中的 executeCommand 代替
export { ShellAgent } from './legacy/ShellAgent.js';
//
// @deprecated 功能已整合到 SimpleCoordinatorAgent
export { CodeAgent } from './legacy/CodeAgent.js';
export { CodeRefactorAgent } from './legacy/CodeRefactorAgent.js';
export { DataAnalysisAgent } from './legacy/DataAnalysisAgent.js';
export { VisionAgent } from './legacy/VisionAgent.js';
//
// @deprecated 使用 tools-layer/search.ts 中的 tavilySearch 代替
export { TavilySearchAgent } from './legacy/TavilySearchAgent.js';
export { DuckSearchAgent } from './legacy/DuckSearchAgent.js';

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
