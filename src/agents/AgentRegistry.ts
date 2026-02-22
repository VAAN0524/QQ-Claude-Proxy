/**
 * Agent 注册中心
 *
 * 负责管理所有可用 Agent，提供注册、查找和智能选择功能
 */

import { logger } from '../utils/logger.js';
import type { IAgent, AgentCapability, AgentMessage } from './base/Agent.js';

/**
 * Agent 注册中心
 */
export class AgentRegistry {
  private agents: Map<string, IAgent> = new Map();
  private capabilityIndex: Map<AgentCapability, IAgent[]> = new Map();

  /**
   * 注册 Agent
   */
  register(agent: IAgent): void {
    if (this.agents.has(agent.id)) {
      logger.warn(`[AgentRegistry] Agent "${agent.id}" 已存在，将被覆盖`);
    }

    this.agents.set(agent.id, agent);

    // 更新能力索引
    for (const cap of agent.capabilities) {
      if (!this.capabilityIndex.has(cap)) {
        this.capabilityIndex.set(cap, []);
      }
      this.capabilityIndex.get(cap)!.push(agent);
    }

    logger.info(`[AgentRegistry] 已注册 Agent: ${agent.name} (${agent.id})`);
  }

  /**
   * 注销 Agent
   */
  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    this.agents.delete(agentId);

    // 从能力索引中移除
    for (const cap of agent.capabilities) {
      const agents = this.capabilityIndex.get(cap);
      if (agents) {
        const index = agents.findIndex(a => a.id === agentId);
        if (index !== -1) {
          agents.splice(index, 1);
        }
      }
    }

    logger.info(`[AgentRegistry] 已注销 Agent: ${agentId}`);
    return true;
  }

  /**
   * 获取 Agent
   */
  get(id: string): IAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * 根据能力获取 Agent 列表
   */
  getByCapability(capability: AgentCapability): IAgent[] {
    return this.capabilityIndex.get(capability) || [];
  }

  /**
   * 获取所有 Agent
   */
  getAll(): IAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * 获取所有启用的 Agent
   */
  getAllEnabled(): IAgent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.config.enabled);
  }

  /**
   * 智能选择最合适的 Agent
   *
   * @param message 用户消息
   * @param minScore 最低匹配分数阈值 (默认 0.3)
   * @returns 最合适的 Agent，如果没有匹配则返回 null
   */
  async selectBest(message: AgentMessage, minScore: number = 0.3): Promise<IAgent | null> {
    const enabledAgents = this.getAllEnabled();
    if (enabledAgents.length === 0) {
      logger.warn('[AgentRegistry] 没有启用的 Agent');
      return null;
    }

    // 计算每个 Agent 的匹配分数
    const scores = await Promise.all(
      enabledAgents.map(async agent => {
        let score: number;
        if (typeof agent.canHandle === 'function') {
          const result = agent.canHandle(message);
          score = result instanceof Promise ? await result : result;
        } else {
          score = 0;
        }
        return { agent, score };
      })
    );

    // 按分数和优先级排序
    scores.sort((a, b) => {
      // 先按分数降序
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // 分数相同时按优先级降序
      return b.agent.config.priority - a.agent.config.priority;
    });

    const best = scores[0];
    if (best && best.score >= minScore) {
      logger.debug(`[AgentRegistry] 选择 Agent: ${best.agent.name} (分数: ${best.score}, 优先级: ${best.agent.config.priority})`);
      return best.agent;
    }

    logger.debug(`[AgentRegistry] 没有找到合适的 Agent (最高分数: ${scores[0]?.score || 0})`);
    return null;
  }

  /**
   * 获取注册的 Agent 数量
   */
  get size(): number {
    return this.agents.size;
  }

  /**
   * 清空所有 Agent
   */
  clear(): void {
    this.agents.clear();
    this.capabilityIndex.clear();
    logger.info('[AgentRegistry] 已清空所有 Agent');
  }

  /**
   * 获取所有 Agent 的信息摘要
   */
  getSummary(): Array<{ id: string; name: string; enabled: boolean; capabilities: string[] }> {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      enabled: agent.config.enabled,
      capabilities: agent.capabilities.map(cap => String(cap)),
    }));
  }
}
