/**
 * Agent 系统导出
 *
 * 简化架构：
 * - Simple 模式：使用 SimpleCoordinatorAgent（万金油 agent，支持 SKILL.md）
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

// 记忆服务（CLI 模式使用）
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

// 内置 Agents（保留用于 CLI 模式的特殊任务）
export { CodeAgent } from './CodeAgent.js';
export { BrowserAgent } from './BrowserAgent.js';
export { ShellAgent } from './ShellAgent.js';
export { WebSearchAgent } from './WebSearchAgent.js';
export { DataAnalysisAgent } from './DataAnalysisAgent.js';
export { VisionAgent } from './VisionAgent.js';
export { CodeRefactorAgent } from './CodeRefactorAgent.js';
export { SkillManagerAgent } from './SkillManagerAgent.js';
export { TavilySearchAgent } from './TavilySearchAgent.js';
export { DuckSearchAgent } from './DuckSearchAgent.js';

// 简化协调 Agent（Simple 模式的核心）
export { SimpleCoordinatorAgent } from './SimpleCoordinatorAgent.js';
export type { SimpleCoordinatorConfig } from './SimpleCoordinatorAgent.js';

// 工具定义
export * from './tools/index.js';

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
