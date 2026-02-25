/**
 * Agent 延迟加载器
 *
 * 只在需要时加载 Agent，减少启动时间和内存占用。
 *
 * @example
 * ```typescript
 * // 注册 Agent 工厂函数
 * AgentLoader.register('code', async () => {
 *   const { CodeAgent } = await import('./CodeAgent.js');
 *   return new CodeAgent();
 * });
 *
 * // 获取 Agent（延迟加载）
 * const agent = await AgentLoader.get('code');
 *
 * // 预热加载（可选）
 * await AgentLoader.warmup(['code', 'browser']);
 *
 * // 卸载 Agent（释放内存）
 * await AgentLoader.unload('code');
 * ```
 */

import { logger } from '../utils/logger.js';
import type { IAgent } from './base/Agent.js';

/**
 * Agent 工厂函数类型
 */
export type AgentFactory = () => Promise<IAgent>;

/**
 * Agent 加载状态
 */
export interface AgentLoadStatus {
  id: string;
  loaded: boolean;
  loadTime?: number;
  memoryUsage?: number;
}

/**
 * Agent 延迟加载器
 */
export class AgentLoaderClass {
  private agents = new Map<string, IAgent>();
  private factories = new Map<string, AgentFactory>();
  private loadTimes = new Map<string, number>();

  /**
   * 注册 Agent 工厂函数
   *
   * @param id - Agent ID
   * @param factory - 返回 Agent 实例的异步函数
   */
  register(id: string, factory: AgentFactory): void {
    if (this.factories.has(id)) {
      logger.warn(`[AgentLoader] Agent ${id} 已注册，将被覆盖`);
    }
    this.factories.set(id, factory);
    logger.debug(`[AgentLoader] 已注册 Agent 工厂: ${id}`);
  }

  /**
   * 批量注册 Agent
   *
   * @param registrations - Agent ID 和工厂函数的映射
   */
  registerAll(registrations: Record<string, AgentFactory>): void {
    for (const [id, factory] of Object.entries(registrations)) {
      this.register(id, factory);
    }
  }

  /**
   * 获取 Agent（延迟加载）
   *
   * - 如果已加载，直接返回缓存的实例
   * - 如果未加载，使用工厂函数创建并缓存
   *
   * @param id - Agent ID
   * @returns Agent 实例，如果未注册则返回 undefined
   */
  async get(id: string): Promise<IAgent | undefined> {
    // 已缓存，直接返回
    if (this.agents.has(id)) {
      logger.debug(`[AgentLoader] 返回缓存的 Agent: ${id}`);
      return this.agents.get(id);
    }

    // 未注册
    if (!this.factories.has(id)) {
      logger.warn(`[AgentLoader] 未注册的 Agent: ${id}`);
      return undefined;
    }

    // 延迟加载
    const startTime = Date.now();
    logger.info(`[AgentLoader] 延迟加载 Agent: ${id}`);

    try {
      const factory = this.factories.get(id)!;
      const agent = await factory();

      this.agents.set(id, agent);
      const loadTime = Date.now() - startTime;
      this.loadTimes.set(id, loadTime);

      logger.info(`[AgentLoader] Agent ${id} 加载完成 (${loadTime}ms)`);
      return agent;
    } catch (error) {
      logger.error(`[AgentLoader] Agent ${id} 加载失败: ${error}`);
      return undefined;
    }
  }

  /**
   * 批量获取 Agent
   *
   * @param ids - Agent ID 列表
   * @returns Agent 实例数组
   */
  async getAll(ids: string[]): Promise<Array<IAgent | undefined>> {
    return await Promise.all(ids.map(id => this.get(id)));
  }

  /**
   * 预热加载（启动时可选调用）
   *
   * @param ids - 需要预热的 Agent ID 列表
   */
  async warmup(ids: string[]): Promise<void> {
    logger.info(`[AgentLoader] 预热加载 ${ids.length} 个 Agent: ${ids.join(', ')}`);

    const startTime = Date.now();
    let loaded = 0;
    let failed = 0;

    for (const id of ids) {
      const agent = await this.get(id);
      if (agent) {
        loaded++;
      } else {
        failed++;
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info(`[AgentLoader] 预热完成: ${loaded} 成功, ${failed} 失败, 耗时 ${elapsed}ms`);
  }

  /**
   * 卸载 Agent（释放内存）
   *
   * @param id - Agent ID
   * @returns 是否成功卸载
   */
  async unload(id: string): Promise<boolean> {
    const agent = this.agents.get(id);
    if (!agent) {
      logger.warn(`[AgentLoader] Agent ${id} 未加载，无需卸载`);
      return false;
    }

    logger.info(`[AgentLoader] 卸载 Agent: ${id}`);

    try {
      // 调用 cleanup 方法（如果存在）
      if (typeof agent.cleanup === 'function') {
        await agent.cleanup();
      }

      this.agents.delete(id);
      this.loadTimes.delete(id);

      logger.info(`[AgentLoader] Agent ${id} 已卸载`);
      return true;
    } catch (error) {
      logger.error(`[AgentLoader] Agent ${id} 卸载失败: ${error}`);
      return false;
    }
  }

  /**
   * 批量卸载 Agent
   *
   * @param ids - Agent ID 列表
   * @returns 卸载结果映射
   */
  async unloadAll(ids?: string[]): Promise<Map<string, boolean>> {
    const targets = ids || Array.from(this.agents.keys());
    const results = new Map<string, boolean>();

    for (const id of targets) {
      results.set(id, await this.unload(id));
    }

    return results;
  }

  /**
   * 卸载所有 Agent
   */
  async unloadAllLoaded(): Promise<void> {
    const ids = Array.from(this.agents.keys());
    await this.unloadAll(ids);
  }

  /**
   * 检查 Agent 是否已加载
   *
   * @param id - Agent ID
   * @returns 是否已加载
   */
  isLoaded(id: string): boolean {
    return this.agents.has(id);
  }

  /**
   * 检查 Agent 是否已注册
   *
   * @param id - Agent ID
   * @returns 是否已注册
   */
  isRegistered(id: string): boolean {
    return this.factories.has(id);
  }

  /**
   * 获取已加载的 Agent 列表
   *
   * @returns 已加载的 Agent ID 数组
   */
  getLoaded(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * 获取已注册的 Agent 列表
   *
   * @returns 已注册的 Agent ID 数组
   */
  getRegistered(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * 获取加载状态
   *
   * @returns 所有 Agent 的加载状态
   */
  getStatus(): AgentLoadStatus[] {
    const status: AgentLoadStatus[] = [];

    for (const id of this.factories.keys()) {
      const loaded = this.agents.has(id);
      const loadTime = this.loadTimes.get(id);

      // 估算内存使用（粗略）
      let memoryUsage: number | undefined;
      if (loaded) {
        const usage = process.memoryUsage();
        // 假设平均每个 Agent 占用 10-30MB
        memoryUsage = Math.round((usage.heapUsed / 1024 / 1024) / this.agents.size);
      }

      status.push({
        id,
        loaded,
        loadTime,
        memoryUsage,
      });
    }

    return status;
  }

  /**
   * 获取统计信息
   *
   * @returns 统计数据
   */
  getStats(): {
    registered: number;
    loaded: number;
    avgLoadTime: number;
    totalLoadTime: number;
  } {
    const loadTimes = Array.from(this.loadTimes.values());
    const totalLoadTime = loadTimes.reduce((sum, t) => sum + t, 0);

    return {
      registered: this.factories.size,
      loaded: this.agents.size,
      avgLoadTime: loadTimes.length > 0 ? Math.round(totalLoadTime / loadTimes.length) : 0,
      totalLoadTime,
    };
  }

  /**
   * 清空所有（用于测试或重置）
   */
  clear(): void {
    logger.warn('[AgentLoader] 清空所有 Agent');
    this.agents.clear();
    this.loadTimes.clear();
    // 保留工厂函数，只清空已加载的实例
  }

  /**
   * 获取缓存的 Agent 实例数量
   */
  size(): number {
    return this.agents.size;
  }
}

/**
 * 单例实例
 */
export const AgentLoader = new AgentLoaderClass();

/**
 * 便捷函数：注册 Agent
 */
export function registerAgent(id: string, factory: AgentFactory): void {
  AgentLoader.register(id, factory);
}

/**
 * 便捷函数：获取 Agent
 */
export function getAgent(id: string): Promise<IAgent | undefined> {
  return AgentLoader.get(id);
}

/**
 * 便捷函数：卸载 Agent
 */
export function unloadAgent(id: string): Promise<boolean> {
  return AgentLoader.unload(id);
}

export default AgentLoader;
