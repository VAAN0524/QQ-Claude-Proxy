/**
 * Agent 系统导出
 */

// 基础接口
export * from './base/Agent.js';
export * from './base/PersonaAgent.js';

// Agent 通信风格处理（方案3）
export {
  PersonaTagExtractor,
  AgentMessageEnhancer,
  AgentCollaborationStyleAdapter,
  StyleConsistencyChecker,
} from './AgentCommunication.js';

// 核心组件
export { AgentRegistry } from './AgentRegistry.js';
export { AgentDispatcher } from './AgentDispatcher.js';
export { SharedContext } from './SharedContext.js';
export { SharedContextPersistence, SessionManager } from './SharedContextPersistence.js';
export { modeManager, AgentMode } from './ModeManager.js';

// 技能系统
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

// 内置 Agents
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

// 主协调 Agent
export { CoordinatorAgent } from './CoordinatorAgent.js';
export type { CoordinatorAgentOptions } from './CoordinatorAgent.js';

// GLM 协调 Agent
export { GLMCoordinatorAgent } from './GLMCoordinatorAgent.js';
export type { GLMCoordinatorAgentOptions } from './GLMCoordinatorAgent.js';

// 真正的团队协调器
export { TeamCoordinator } from './TeamCoordinator.js';
export type { SubAgentConfig, TeamTask, TeamCoordinatorOptions } from './TeamCoordinator.js';

// 技能管理器
export { SkillManager } from '../skills/SkillManager.js';
export type { SkillMetadata as SkillManagerMetadata } from '../skills/SkillManager.js';

// 工具定义（简化 API）
export * from './tools/index.js';

// Agent 人格设定
export { AGENT_PERSONAS, getAgentPersona, getAllAgentPersonas, getPersonasByCapability } from './personas.js';
export type { AgentPersona } from './personas.js';

// 人格设定 Prompt 构建器
export {
  buildPersonaPrompt,
  buildResponseStyleGuide,
  buildFullPersonaPrompt,
  buildTeamCollaborationPrompt,
} from './PersonaPromptBuilder.js';

// MCP 客户端
export { ZaiMcpClient } from './ZaiMcpClient.js';
export type { ZaiMcpClientOptions, McpTool } from './ZaiMcpClient.js';

// Agent 注册中心（带人格设定）
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
