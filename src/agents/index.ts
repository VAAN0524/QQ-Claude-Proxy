/**
 * Agent 系统导出
 */

// 基础接口
export * from './base/Agent.js';

// 核心组件
export { AgentRegistry } from './AgentRegistry.js';
export { AgentDispatcher } from './AgentDispatcher.js';
export { SharedContext } from './SharedContext.js';
export { modeManager, AgentMode } from './ModeManager.js';

// 内置 Agents
export { CodeAgent } from './CodeAgent.js';
export { BrowserAgent } from './BrowserAgent.js';
export { ShellAgent } from './ShellAgent.js';
export { WebSearchAgent } from './WebSearchAgent.js';
export { DataAnalysisAgent } from './DataAnalysisAgent.js';

// 主协调 Agent
export { CoordinatorAgent } from './CoordinatorAgent.js';
export type { CoordinatorAgentOptions } from './CoordinatorAgent.js';

// GLM 协调 Agent
export { GLMCoordinatorAgent } from './GLMCoordinatorAgent.js';
export type { GLMCoordinatorAgentOptions } from './GLMCoordinatorAgent.js';
