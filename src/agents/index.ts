/**
 * Agent 系统导出
 *
 * 纯 CLI 模式架构：
 * - 只保留 Claude Code Agent 相关的基础类型
 * - 移除所有已删除的 Agent 组件导出
 */

// 基础接口（被 ClaudeCodeAgent 使用）
export * from './base/Agent.js';

// 记忆服务（如果 ClaudeCodeAgent 使用）
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

// 现有工具和组件
export { AgentLoader, registerAgent, getAgent, unloadAgent } from './AgentLoader.js';
export type { AgentFactory, AgentLoadStatus } from './AgentLoader.js';

export { ResourceMonitor } from './ResourceMonitor.js';
export type { MemoryUsageInfo, SystemInfo, ProcessSnapshot, ResourceTrend } from './ResourceMonitor.js';

export { ToolCallTracker } from './ToolCallTracker.js';
export type { ToolCallLog, ToolStats } from './ToolCallTracker.js';

export { buildPersonaPrompt, buildResponseStyleGuide, buildFullPersonaPrompt, buildTeamCollaborationPrompt } from './PersonaPromptBuilder.js';

export { ZaiMcpClient } from './ZaiMcpClient.js';
export type { ZaiMcpClientOptions, McpTool } from './ZaiMcpClient.js';

// 工具定义
export * from './tools/agent-tools.js';
export * from './tools/file-tools.js';
export * from './tools/learning-tools.js';
export * from './tools/network_tool.js';
