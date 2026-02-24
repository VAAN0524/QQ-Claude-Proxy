/**
 * Agent 注册中心 - 带人格设定版本
 *
 * 统一管理所有 Agent 的注册、人格设定和元数据
 */

import type { AgentPersona } from './personas.js';
import { AGENT_PERSONAS, getAgentPersona } from './personas.js';

/**
 * Agent 元数据
 */
export interface AgentMetadata {
  /** Agent ID */
  id: string;
  /** Agent 类名 */
  className: string;
  /** 显示名称 */
  displayName: string;
  /** 描述 */
  description: string;
  /** 模块路径 */
  importPath: string;
  /** 是否已启用 */
  enabled: boolean;
  /** 优先级（数字越小优先级越高） */
  priority: number;
  /** 超时时间（毫秒） */
  timeout: number;
  /** 能力标签 */
  capabilities: string[];
  /** 人格设定 */
  persona?: AgentPersona;
  /** 依赖的其他 Agent */
  dependencies?: string[];
}

/**
 * 所有已注册 Agent 的元数据
 */
export const REGISTERED_AGENTS: AgentMetadata[] = [
  // ============================================
  // 团队协调层
  // ============================================
  {
    id: 'team-coordinator',
    className: 'TeamCoordinator',
    displayName: '团队总指挥',
    description: '负责整个 Agent 团队的战略规划和任务分发',
    importPath: './agents/TeamCoordinator.js',
    enabled: true,
    priority: 1,
    timeout: 120000,
    capabilities: ['coordination', 'task-distribution', 'team-management'],
    persona: AGENT_PERSONAS['team-coordinator'],
    dependencies: []
  },
  {
    id: 'glm-coordinator',
    className: 'GLMCoordinatorAgent',
    displayName: 'GLM 模型协调器',
    description: '管理 GLM 模型的调用和响应处理',
    importPath: './agents/GLMCoordinatorAgent.js',
    enabled: true,
    priority: 2,
    timeout: 60000,
    capabilities: ['coordination', 'llm-management', 'queue-management'],
    persona: AGENT_PERSONAS['glm-coordinator'],
    dependencies: []
  },
  {
    id: 'coordinator',
    className: 'CoordinatorAgent',
    displayName: '任务协调器',
    description: '分析用户意图，选择合适的执行策略',
    importPath: './agents/CoordinatorAgent.js',
    enabled: true,
    priority: 3,
    timeout: 90000,
    capabilities: ['coordination', 'intent-analysis', 'context-management'],
    persona: AGENT_PERSONAS['coordinator'],
    dependencies: []
  },

  // ============================================
  // 专业能力层
  // ============================================
  // 注意：专业 Agents 功能已整合到 SimpleCoordinatorAgent 的工具层
  // - 搜索功能 → tools-layer/search-tools.ts
  // - Shell 功能 → tools-layer/shell-tools.ts
  // - Web 功能 → tools-layer/web-tools.ts
  //
  {
    id: 'skill-manager',
    className: 'SkillManagerAgent',
    displayName: '技能管理员',
    description: '管理技能的安装、卸载和更新',
    importPath: './agents/SkillManagerAgent.js',
    enabled: true,
    priority: 20,
    timeout: 60000,
    capabilities: ['skill-management', 'package-management', 'installation'],
    persona: AGENT_PERSONAS['skill-manager'],
    dependencies: []
  },

  // ============================================
  // 支持服务层（非直接 Agent，但作为服务提供）
  // ============================================
  {
    id: 'zai-mcp-client',
    className: 'ZaiMcpClient',
    displayName: '智谱 MCP 客户端',
    description: '连接智谱 AI 官方 MCP Server，提供图像理解等能力',
    importPath: './agents/ZaiMcpClient.js',
    enabled: true,
    priority: 30,
    timeout: 300000,
    capabilities: ['mcp', 'vision', 'ocr', 'ui-analysis'],
    dependencies: []
  },

  // ============================================
  // 未来扩展（待实现）
  // ============================================
  {
    id: 'memory-agent',
    className: 'MemoryService',
    displayName: '记忆管理专家',
    description: '存储和检索对话历史，管理长期记忆和知识库',
    importPath: './agents/memory/MemoryService.js',
    enabled: false, // 待启用
    priority: 40,
    timeout: 30000,
    capabilities: ['memory', 'storage', 'retrieval', 'rag'],
    persona: AGENT_PERSONAS['memory-agent'],
    dependencies: []
  },
  {
    id: 'learning-agent',
    className: 'LearningModule',
    displayName: '学习进化专家',
    description: '从执行结果中学习和改进',
    importPath: './agents/learning/LearningModule.js',
    enabled: false, // 待启用
    priority: 41,
    timeout: 30000,
    capabilities: ['learning', 'optimization', 'pattern-recognition'],
    persona: AGENT_PERSONAS['learning-agent'],
    dependencies: ['memory-agent']
  }
];

/**
 * 根据 Agent ID 获取元数据
 */
export function getAgentMetadata(agentId: string): AgentMetadata | undefined {
  return REGISTERED_AGENTS.find(agent => agent.id === agentId);
}

/**
 * 获取所有已启用的 Agent
 */
export function getEnabledAgents(): AgentMetadata[] {
  return REGISTERED_AGENTS.filter(agent => agent.enabled);
}

/**
 * 根据 ID 列表获取 Agent 元数据
 */
export function getAgentsByIds(ids: string[]): AgentMetadata[] {
  return ids.map(id => getAgentMetadata(id)).filter(Boolean) as AgentMetadata[];
}

/**
 * 根据能力获取 Agent
 */
export function getAgentsByCapability(capability: string): AgentMetadata[] {
  return REGISTERED_AGENTS.filter(agent =>
    agent.capabilities.includes(capability) && agent.enabled
  );
}

/**
 * 获取 Agent 的依赖关系树
 */
export function getDependencyTree(agentId: string): AgentMetadata[] {
  const visited = new Set<string>();
  const result: AgentMetadata[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);

    const agent = getAgentMetadata(id);
    if (agent) {
      result.push(agent);
      if (agent.dependencies) {
        agent.dependencies.forEach(dep => visit(dep));
      }
    }
  }

  visit(agentId);
  return result;
}

/**
 * 验证 Agent 配置的完整性
 */
export function validateAgentConfig(agent: AgentMetadata): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!agent.id) errors.push('Agent ID is required');
  if (!agent.className) errors.push('Class name is required');
  if (!agent.displayName) errors.push('Display name is required');
  if (agent.priority < 0) errors.push('Priority must be non-negative');
  if (agent.timeout <= 0) errors.push('Timeout must be positive');

  // 检查依赖是否已注册
  if (agent.dependencies) {
    for (const dep of agent.dependencies) {
      if (!getAgentMetadata(dep)) {
        errors.push(`Dependency '${dep}' not found in registry`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 打印 Agent 注册表摘要
 */
export function printRegistrySummary(): void {
  console.log('=== Agent Registry Summary ===');
  console.log(`Total Agents: ${REGISTERED_AGENTS.length}`);
  console.log(`Enabled Agents: ${getEnabledAgents().length}`);
  console.log('\nAgents by priority:');

  const sorted = [...REGISTERED_AGENTS].sort((a, b) => a.priority - b.priority);
  for (const agent of sorted) {
    const status = agent.enabled ? '✓' : '✗';
    console.log(`  ${status} [${agent.priority.toString().padStart(2)}] ${agent.displayName} (${agent.id})`);
  }
}
