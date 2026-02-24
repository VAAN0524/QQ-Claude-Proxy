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
  {
    id: 'code-agent',
    className: 'CodeAgent',
    displayName: '代码专家',
    description: '编写高质量的代码实现，进行代码审查和优化',
    importPath: './agents/CodeAgent.js',
    enabled: true,
    priority: 10,
    timeout: 120000,
    capabilities: ['code', 'code-review', 'debugging', 'refactoring'],
    persona: AGENT_PERSONAS['code-agent'],
    dependencies: []
  },
  {
    id: 'browser-agent',
    className: 'BrowserAgent',
    displayName: '浏览器自动化专家',
    description: '自动化浏览器操作，网页内容提取和解析',
    importPath: './agents/BrowserAgent.js',
    enabled: true,
    priority: 11,
    timeout: 60000,
    capabilities: ['browser', 'automation', 'web-scraping', 'testing'],
    persona: AGENT_PERSONAS['browser-agent'],
    dependencies: []
  },
  {
    id: 'shell-agent',
    className: 'ShellAgent',
    displayName: '命令行专家',
    description: '执行 shell 命令和脚本，系统监控和诊断',
    importPath: './agents/ShellAgent.js',
    enabled: true,
    priority: 12,
    timeout: 30000,
    capabilities: ['shell', 'system', 'file-management', 'process-control'],
    persona: AGENT_PERSONAS['shell-agent'],
    dependencies: []
  },
  {
    id: 'web-search-agent',
    className: 'WebSearchAgent',
    displayName: '网络搜索专家',
    description: '执行网络搜索获取实时信息',
    importPath: './agents/WebSearchAgent.js',
    enabled: true,
    priority: 13,
    timeout: 30000,
    capabilities: ['web', 'search', 'information-retrieval'],
    persona: AGENT_PERSONAS['web-search-agent'],
    dependencies: []
  },
  {
    id: 'tavily-search',
    className: 'TavilySearchAgent',
    displayName: '深度搜索分析师',
    description: '使用 Tavily API 进行深度网络搜索',
    importPath: './agents/TavilySearchAgent.js',
    enabled: true,
    priority: 14,
    timeout: 45000,
    capabilities: ['web', 'search', 'deep-research', 'vertical-search'],
    persona: AGENT_PERSONAS['tavily-search'],
    dependencies: []
  },
  {
    id: 'ducksearch',
    className: 'DuckSearchAgent',
    displayName: 'DuckSearch 搜索',
    description: '使用 DuckDuckGo 搜索网络，获取网页内容',
    importPath: './agents/DuckSearchAgent.js',
    enabled: true,
    priority: 13,
    timeout: 30000,
    capabilities: ['web', 'search', 'content-extraction'],
    persona: AGENT_PERSONAS['ducksearch'],
    dependencies: []
  },
  {
    id: 'data-analysis-agent',
    className: 'DataAnalysisAgent',
    displayName: '数据分析专家',
    description: '处理和分析结构化数据，生成统计报告',
    importPath: './agents/DataAnalysisAgent.js',
    enabled: true,
    priority: 15,
    timeout: 60000,
    capabilities: ['analysis', 'data', 'statistics', 'visualization'],
    persona: AGENT_PERSONAS['data-analysis-agent'],
    dependencies: []
  },
  {
    id: 'vision-agent',
    className: 'VisionAgent',
    displayName: '视觉理解专家',
    description: '图像内容识别和理解，文字提取',
    importPath: './agents/VisionAgent.js',
    enabled: true,
    priority: 16,
    timeout: 45000,
    capabilities: ['vision', 'ocr', 'image-analysis', 'visual-qa'],
    persona: AGENT_PERSONAS['vision-agent'],
    dependencies: []
  },
  {
    id: 'code-refactor-agent',
    className: 'CodeRefactorAgent',
    displayName: '代码重构专家',
    description: '分析代码质量问题，执行安全的代码重构',
    importPath: './agents/CodeRefactorAgent.js',
    enabled: true,
    priority: 17,
    timeout: 90000,
    capabilities: ['code', 'refactoring', 'quality-analysis', 'architecture'],
    persona: AGENT_PERSONAS['code-refactor-agent'],
    dependencies: ['code-agent']
  },
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
