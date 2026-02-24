#!/usr/bin/env node
/**
 * Agent 人格设定查看器
 *
 * 用法:
 *   node scripts/list-agents.ts              # 列出所有 Agent
 *   node scripts/list-agents.ts <id>         # 显示指定 Agent 的人格设定
 *   node scripts/list-agents.ts --persona    # 只显示人格设定
 *   node scripts/list-agents.ts --deps       # 显示依赖关系
 */

import { REGISTERED_AGENTS, getAgentMetadata, getDependencyTree, printRegistrySummary } from '../src/agents/AgentRegistryWithPersonas.js';

const args = process.argv.slice(2);
const agentId = args.find(arg => !arg.startsWith('--'));
const showPersona = args.includes('--persona');
const showDeps = args.includes('--deps');

function printPersona(agentId: string): void {
  const agent = getAgentMetadata(agentId);
  if (!agent || !agent.persona) {
    console.log(`No persona found for agent: ${agentId}`);
    return;
  }

  const p = agent.persona;
  console.log(`\n┌─────────────────────────────────────────────────────────────┐`);
  console.log(`│  ${agent.displayName} - 人格设定`);
  console.log(`└─────────────────────────────────────────────────────────────┘\n`);

  console.log(`# 你是谁`);
  console.log(`你是**${p.role}**，属于 ${agent.description}。\n`);

  console.log(`## 核心职责`);
  p.responsibilities.forEach(r => console.log(`1. ${r}`));
  console.log(``);

  console.log(`## 性格特点`);
  p.traits.forEach(t => console.log(`- **${t.split('：')[0]}**：${t.split('：')[1] || ''}`));
  console.log(``);

  console.log(`## 工作原则`);
  p.principles.forEach((pr, i) => console.log(`${i + 1}. ${pr}`));
  console.log(``);

  if (p.collaboration) {
    console.log(`## 协作方式`);
    console.log(p.collaboration);
    console.log(``);
  }
}

function printAgentList(): void {
  console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║                    Agent 注册表                              ║`);
  console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

  const sorted = [...REGISTERED_AGENTS].sort((a, b) => a.priority - b.priority);

  for (const agent of sorted) {
    const status = agent.enabled ? '✓' : '✗';
    const capabilities = agent.capabilities.slice(0, 3).join(', ');
    const more = agent.capabilities.length > 3 ? ` +${agent.capabilities.length - 3}` : '';

    console.log(`${status} [${agent.priority.toString().padStart(2)}] **${agent.displayName}** (\`${agent.id}\`)`);
    console.log(`    ${agent.description}`);
    if (agent.capabilities.length > 0) {
      console.log(`    能力: ${capabilities}${more}`);
    }
    if (agent.dependencies && agent.dependencies.length > 0) {
      console.log(`    依赖: ${agent.dependencies.join(', ')}`);
    }
    console.log(``);
  }

  console.log(`总计: ${REGISTERED_AGENTS.length} 个 Agent，${REGISTERED_AGENTS.filter(a => a.enabled).length} 个已启用`);
}

function printDependencies(agentId: string): void {
  const deps = getDependencyTree(agentId);
  if (deps.length === 0) {
    console.log(`No dependencies found for: ${agentId}`);
    return;
  }

  console.log(`\n依赖关系树: ${agentId}\n`);
  deps.forEach((agent, index) => {
    const indent = '  '.repeat(index);
    console.log(`${indent}${index === 0 ? '└─' : '├─'} ${agent.displayName} (${agent.id})`);
  });
}

// 主逻辑
if (agentId) {
  if (showPersona) {
    printPersona(agentId);
  } else if (showDeps) {
    printDependencies(agentId);
  } else {
    const agent = getAgentMetadata(agentId);
    if (agent) {
      console.log(`\n### ${agent.displayName} (\`${agent.id}\`)`);
      console.log(`**描述**: ${agent.description}`);
      console.log(`**状态**: ${agent.enabled ? '已启用' : '未启用'}`);
      console.log(`**优先级**: ${agent.priority}`);
      console.log(`**超时**: ${agent.timeout}ms`);
      console.log(`**能力**: ${agent.capabilities.join(', ')}`);
      if (agent.dependencies?.length) {
        console.log(`**依赖**: ${agent.dependencies.join(', ')}`);
      }
      console.log(`**类名**: ${agent.className}`);
      console.log(`**路径**: ${agent.importPath}`);
      printPersona(agentId);
    } else {
      console.log(`Agent not found: ${agentId}`);
    }
  }
} else {
  printAgentList();
}
