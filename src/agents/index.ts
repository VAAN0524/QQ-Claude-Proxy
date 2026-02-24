/**
 * Agent 系统导出
 */

// 基础接口
export * from './base/Agent.js';

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
export { MemoryService, RAGService } from './memory/index.js';

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
