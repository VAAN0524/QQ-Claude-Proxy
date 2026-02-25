/**
 * 延迟加载 Agent 代理
 *
 * 实现 IAgent 接口，但在首次调用时才真正加载 Agent
 * 用于减少启动时间和内存占用
 */

import { logger } from '../utils/logger.js';
import { AgentLoader } from './AgentLoader.js';
import type {
  IAgent,
  AgentMessage,
  AgentContext,
  AgentResponse,
  AgentConfig,
  AgentCapability,
} from './base/Agent.js';
import type { AgentPersona } from './personas.js';

/**
 * 代理工厂配置
 */
export interface ProxyFactoryOptions {
  /** Agent ID */
  agentId: string;
  /** Agent 工厂函数 */
  factory: () => Promise<IAgent>;
  /** 是否立即预热加载 */
  warmup?: boolean;
}

/**
 * 延迟加载 Agent 代理
 *
 * 实现了 IAgent 接口，首次调用任何方法时才会加载真正的 Agent
 */
export class LazyAgentProxy implements IAgent {
  readonly id: string;
  // 使用 getter 动态获取代理 Agent 的属性
  get name(): string {
    return this._agent?.name || `Lazy(${this.agentId})`;
  }
  get description(): string {
    return this._agent?.description || '延迟加载 Agent 代理';
  }
  get capabilities(): AgentCapability[] {
    return this._agent?.capabilities || [];
  }
  get config(): AgentConfig {
    return this._agent?.config || this._defaultConfig;
  }
  get persona(): AgentPersona | undefined {
    return this._agent?.persona;
  }

  private agentId: string;
  private factory: () => Promise<IAgent>;
  private _agent: IAgent | null = null;
  private _loading: Promise<IAgent> | null = null;
  private _defaultConfig: AgentConfig = {
    enabled: true,
    priority: 50,
    timeout: 60000, // 默认 60 秒超时
  };

  constructor(options: ProxyFactoryOptions) {
    this.agentId = options.agentId;
    this.factory = options.factory;
    this.id = options.agentId;

    // 如果需要立即预热
    if (options.warmup) {
      this.loadAgent();
    }
  }

  /**
   * 获取实际的 Agent（延迟加载）
   */
  private async getAgent(): Promise<IAgent> {
    // 已加载，直接返回
    if (this._agent) {
      return this._agent;
    }

    // 正在加载中，等待加载完成
    if (this._loading) {
      return this._loading;
    }

    // 开始加载
    this._loading = this.loadAgent();
    return this._loading;
  }

  /**
   * 加载实际的 Agent
   */
  private async loadAgent(): Promise<IAgent> {
    const startTime = Date.now();
    logger.info(`[LazyAgentProxy] 开始加载 Agent: ${this.agentId}`);

    try {
      // 使用工厂函数创建 Agent
      const agent = await this.factory();

      this._agent = agent;
      const loadTime = Date.now() - startTime;
      logger.info(`[LazyAgentProxy] Agent ${this.agentId} 加载完成 (${loadTime}ms)`);

      return agent;
    } catch (error) {
      logger.error(`[LazyAgentProxy] Agent ${this.agentId} 加载失败: ${error}`);
      throw error;
    } finally {
      this._loading = null;
    }
  }

  /**
   * 检查是否已加载
   */
  isLoaded(): boolean {
    return this._agent !== null;
  }

  /**
   * 卸载 Agent
   */
  async unload(): Promise<void> {
    if (this._agent && typeof this._agent.cleanup === 'function') {
      await this._agent.cleanup();
    }
    this._agent = null;
    this._loading = null;
    logger.info(`[LazyAgentProxy] Agent ${this.agentId} 已卸载`);
  }

  // ==================== IAgent 接口实现 ====================

  async process(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    const agent = await this.getAgent();
    return agent.process(message, context);
  }

  canHandle(message: AgentMessage): Promise<number> | number {
    // 注意：这里不使用 async，因为 canHandle 返回 Promise<number> | number
    // 使用 Promise.resolve 包装异步操作
    return (async () => {
      const agent = await this.getAgent();
      if (typeof agent.canHandle === 'function') {
        const result = agent.canHandle(message);
        return result instanceof Promise ? await result : result;
      }
      return 0;
    })();
  }

  async initialize(): Promise<void> {
    const agent = await this.getAgent();
    if (typeof agent.initialize === 'function') {
      await agent.initialize();
    }
  }

  async cleanup(): Promise<void> {
    if (this._agent && typeof this._agent.cleanup === 'function') {
      await this._agent.cleanup();
    }
  }

  getPersona(): AgentPersona {
    if (this._agent && typeof this._agent.getPersona === 'function') {
      return this._agent.getPersona();
    }
    // 返回默认人格
    return {
      id: this.agentId,
      role: 'agent',
      responsibilities: [],
      traits: [],
      principles: [],
    };
  }

  applyPersonaStyle(
    content: string,
    styleOptions?: { tone?: string; verbosity?: 'concise' | 'normal' | 'detailed' }
  ): string {
    if (this._agent && typeof this._agent.applyPersonaStyle === 'function') {
      return this._agent.applyPersonaStyle(content, styleOptions);
    }
    return content;
  }
}

/**
 * 创建延迟加载 Agent 代理
 *
 * @param agentId - Agent ID
 * @param factory - Agent 工厂函数
 * @param warmup - 是否立即预热加载
 * @returns LazyAgentProxy 实例
 */
export function createLazyAgent(
  agentId: string,
  factory: () => Promise<IAgent>,
  warmup: boolean = false
): LazyAgentProxy {
  return new LazyAgentProxy({ agentId, factory, warmup });
}

/**
 * 注册延迟加载 Agent
 *
 * 便捷函数，同时注册到 AgentLoader 和创建代理
 *
 * @param agentId - Agent ID
 * @param factory - Agent 工厂函数
 * @returns LazyAgentProxy 实例
 */
export function registerLazyAgent(
  agentId: string,
  factory: () => Promise<IAgent>
): LazyAgentProxy {
  // 注册到 AgentLoader
  AgentLoader.register(agentId, factory);

  // 创建并返回代理
  return createLazyAgent(agentId, factory);
}

export default LazyAgentProxy;
