/**
 * Agent 调度器
 *
 * 负责将消息路由到合适的 Agent，支持显式指定和智能选择
 */

import { logger } from '../utils/logger.js';
import { AgentRegistry } from './AgentRegistry.js';
import type { IAgent, AgentMessage, AgentContext, AgentResponse } from './base/Agent.js';

/**
 * 支持的命令前缀映射
 */
const AGENT_PREFIXES: Record<string, string> = {
  '/code': 'code',
  '/browser': 'browser',
  '/shell': 'shell',
  '/claude': 'claude',
  '/general': 'general',
} as const;

/**
 * Agent 调度器
 */
export class AgentDispatcher {
  private registry: AgentRegistry;
  private fallbackAgent: IAgent;
  private userAgentMapping: Map<string, string> = new Map();

  constructor(registry: AgentRegistry, fallbackAgent: IAgent) {
    this.registry = registry;
    this.fallbackAgent = fallbackAgent;
    logger.info('[AgentDispatcher] 调度器已初始化');
  }

  /**
   * 路由消息到合适的 Agent
   *
   * 路由优先级:
   * 1. 显式指定 (前缀)
   * 2. 用户偏好
   * 3. 智能选择
   * 4. 默认 Agent (回退)
   */
  async dispatch(
    message: AgentMessage,
    context: AgentContext
  ): Promise<AgentResponse> {
    const originalContent = message.content;
    const userKey = this.getUserKey(message.userId, message.groupId);

    try {
      // 1. 检查是否显式指定 Agent
      const explicitAgentId = this.extractAgentPrefix(message.content);

      if (explicitAgentId) {
        // 移除前缀
        message.content = message.content.substring(explicitAgentId.length).trim();

        const agent = this.registry.get(explicitAgentId);
        if (agent && agent.config.enabled) {
          logger.info(`[AgentDispatcher] 显式指定 Agent: ${agent.name} (${explicitAgentId})`);
          const response = await agent.process(message, context);
          // 记录用户偏好
          this.setUserPreference(message.userId, message.groupId, explicitAgentId);
          return response;
        }

        // Agent 不存在或未启用，返回提示
        const availableAgents = this.registry.getAllEnabled()
          .map(a => a.id)
          .join(', ');
        return {
          content: `❌ Agent "${explicitAgentId}" 不存在或未启用。\n\n可用的 Agent: ${availableAgents || '无'}`,
          agentId: 'dispatcher',
        };
      }

      // 2. 检查用户是否有偏好的 Agent
      const preferredAgentId = this.userAgentMapping.get(userKey);
      if (preferredAgentId) {
        const agent = this.registry.get(preferredAgentId);
        if (agent && agent.config.enabled) {
          const score = typeof agent.canHandle === 'function'
            ? await Promise.resolve(agent.canHandle(message))
            : 0;

          if (score >= 0.3) {
            logger.info(`[AgentDispatcher] 使用用户偏好 Agent: ${agent.name} (${preferredAgentId})`);
            return agent.process(message, context);
          }
        }
      }

      // 3. 智能选择最合适的 Agent
      const bestAgent = await this.registry.selectBest(message);

      if (bestAgent) {
        logger.info(`[AgentDispatcher] 智能选择 Agent: ${bestAgent.name} (${bestAgent.id})`);
        const response = await bestAgent.process(message, context);
        // 记录用户偏好
        this.setUserPreference(message.userId, message.groupId, bestAgent.id);
        return response;
      }

      // 4. 回退到默认 Agent (ClaudeCodeAgent)
      logger.info(`[AgentDispatcher] 回退到默认 Agent: ${this.fallbackAgent.name} (${this.fallbackAgent.id})`);
      return this.fallbackAgent.process(message, context);

    } catch (error) {
      logger.error(`[AgentDispatcher] 处理消息失败: ${error}`);
      return {
        content: `处理消息时发生错误: ${error instanceof Error ? error.message : String(error)}`,
        agentId: 'dispatcher',
      };
    } finally {
      // 恢复原始内容
      message.content = originalContent;
    }
  }

  /**
   * 提取 Agent 前缀
   *
   * 支持的前缀: /code, /browser, /shell, /claude, /general
   *
   * @returns Agent ID 或 null
   */
  private extractAgentPrefix(content: string): string | null {
    const trimmedContent = content.trim().toLowerCase();

    for (const [prefix, agentId] of Object.entries(AGENT_PREFIXES)) {
      if (trimmedContent.startsWith(prefix)) {
        // 检查后面是否有空格或直接结束
        const rest = trimmedContent.substring(prefix.length);
        if (rest === '' || rest.startsWith(' ')) {
          return agentId;
        }
      }
    }

    return null;
  }

  /**
   * 设置用户偏好的 Agent
   */
  setUserPreference(userId: string, groupId: string | undefined, agentId: string): void {
    const userKey = this.getUserKey(userId, groupId);
    this.userAgentMapping.set(userKey, agentId);
    logger.debug(`[AgentDispatcher] 设置用户偏好: ${userKey} -> ${agentId}`);
  }

  /**
   * 获取用户偏好的 Agent
   */
  getUserPreference(userId: string, groupId?: string): string | undefined {
    const userKey = this.getUserKey(userId, groupId);
    return this.userAgentMapping.get(userKey);
  }

  /**
   * 清除用户偏好
   */
  clearUserPreference(userId: string, groupId?: string): void {
    const userKey = this.getUserKey(userId, groupId);
    this.userAgentMapping.delete(userKey);
    logger.debug(`[AgentDispatcher] 清除用户偏好: ${userKey}`);
  }

  /**
   * 生成用户键
   */
  private getUserKey(userId: string, groupId?: string): string {
    return groupId ? `group_${groupId}` : `user_${userId}`;
  }

  /**
   * 获取支持的命令前缀列表
   */
  getSupportedPrefixes(): string[] {
    return Object.keys(AGENT_PREFIXES);
  }

  /**
   * 检查前缀是否有效
   */
  isValidPrefix(prefix: string): boolean {
    return prefix in AGENT_PREFIXES;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalAgents: number;
    enabledAgents: number;
    userAgentPreferences: number;
  } {
    return {
      totalAgents: this.registry.size,
      enabledAgents: this.registry.getAllEnabled().length,
      userAgentPreferences: this.userAgentMapping.size,
    };
  }
}
