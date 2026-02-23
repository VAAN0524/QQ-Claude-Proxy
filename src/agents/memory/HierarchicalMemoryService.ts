/**
 * HierarchicalMemoryService - OpenViking 风格的分层记忆存储
 *
 * 分层架构：
 * - L0 (Abstract): ~100 tokens，快速检索索引
 * - L1 (Overview): ~2000 tokens，内容导航
 * - L2 (Detail): 无限，完整数据
 *
 * 核心特性：
 * 1. 自动分层：添加记忆时自动生成 L0/L1/L2
 * 2. 按层加载：只加载需要的层
 * 3. 跨 Agent 共享：shared-memory/ 共享记忆层
 * 4. 定期归档：自动清理过期记忆
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger.js';
import { MemoryService, MemoryType, MemoryMetadata, MemoryRetrieveOptions } from './MemoryService.js';

/**
 * 记忆层级
 */
export enum MemoryLayer {
  /** L0: 抽象索引 (~100 tokens) */
  L0 = 'L0',
  /** L1: 概览 (~2000 tokens) */
  L1 = 'L1',
  /** L2: 完整详情 (无限) */
  L2 = 'L2',
}

/**
 * 分层记忆条目
 */
export interface HierarchicalMemoryEntry {
  /** 记忆 ID */
  id: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 记忆层级 */
  layer: MemoryLayer;
  /** 关联的父记忆 ID (L1 关联 L0, L2 关联 L1) */
  parentId?: string;

  /** L0: 抽象摘要 (~100 tokens) */
  L0?: {
    /** 一句话摘要 */
    summary: string;
    /** 关键词列表 */
    keywords: string[];
    /** 时间戳 */
    timestamp: string;
  };

  /** L1: 概览内容 (~2000 tokens) */
  L1?: {
    /** 结构化概览 */
    overview: string;
    /** 关键点列表 */
    keyPoints: string[];
    /** 上下文信息 */
    context: string;
  };

  /** L2: 完整内容 */
  L2?: {
    /** 完整数据 */
    content: string;
    /** 原始数据引用 */
    rawReference?: string;
  };

  /** 元数据 */
  metadata: MemoryMetadata;

  /** 创建时间 */
  createdAt: Date;
  /** 最后访问时间 */
  lastAccessedAt: Date;
  /** 访问次数 */
  accessCount: number;

  /** 生命周期标签 */
  lifecycle: 'active' | 'archived' | 'expired';
}

/**
 * Agent 记忆目录配置
 */
export interface AgentMemoryConfig {
  /** Agent ID */
  agentId: string;
  /** 记忆目录路径 */
  memoryPath: string;
  /** 是否启用分层 */
  enableHierarchical: boolean;
}

/**
 * 共享记忆配置
 */
export interface SharedMemoryConfig {
  /** 是否启用共享记忆 */
  enabled?: boolean;
  /** 共享记忆目录路径 */
  sharedPath: string;
  /** 参与的 Agent 列表 */
  participatingAgents: string[];
  /** 同步间隔 (毫秒) */
  syncInterval?: number;
}

/**
 * 分层记忆服务选项
 */
export interface HierarchicalMemoryOptions {
  /** 基础存储路径 */
  storagePath?: string;
  /** Agent 记忆配置 */
  agentConfigs?: AgentMemoryConfig[];
  /** 共享记忆配置 */
  sharedConfig?: SharedMemoryConfig;
  /** 是否自动清理 */
  autoCleanup?: boolean;
  /** 记忆保留时间 (毫秒) */
  retentionTime?: number;
}

/**
 * L0 抽象索引文件
 */
export interface AbstractIndex {
  /** Agent ID */
  agentId: string;
  /** 记忆数量 */
  count: number;
  /** 最后更新时间 */
  lastUpdated: string;
  /** L0 索引条目 */
  entries: Array<{
    id: string;
    summary: string;
    keywords: string[];
    timestamp: string;
    layer: MemoryLayer;
  }>;
}

/**
 * 分层记忆存储
 */
class HierarchicalMemoryStore {
  private l0Index: Map<string, HierarchicalMemoryEntry> = new Map();
  private l1Index: Map<string, HierarchicalMemoryEntry> = new Map();
  private l2Index: Map<string, HierarchicalMemoryEntry> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();
  private agentIndex: Map<string, Set<string>> = new Map();

  add(entry: HierarchicalMemoryEntry): void {
    // 按层索引
    switch (entry.layer) {
      case MemoryLayer.L0:
        this.l0Index.set(entry.id, entry);
        break;
      case MemoryLayer.L1:
        this.l1Index.set(entry.id, entry);
        break;
      case MemoryLayer.L2:
        this.l2Index.set(entry.id, entry);
        break;
    }

    // 关键词索引
    if (entry.L0?.keywords) {
      for (const keyword of entry.L0.keywords) {
        if (!this.keywordIndex.has(keyword)) {
          this.keywordIndex.set(keyword, new Set());
        }
        this.keywordIndex.get(keyword)!.add(entry.id);
      }
    }

    // Agent 索引
    if (entry.metadata.taskId) {
      const agentId = entry.metadata.taskId.split(':')[0];
      if (!this.agentIndex.has(agentId)) {
        this.agentIndex.set(agentId, new Set());
      }
      this.agentIndex.get(agentId)!.add(entry.id);
    }
  }

  get(id: string, layer: MemoryLayer): HierarchicalMemoryEntry | undefined {
    switch (layer) {
      case MemoryLayer.L0:
        return this.l0Index.get(id);
      case MemoryLayer.L1:
        return this.l1Index.get(id);
      case MemoryLayer.L2:
        return this.l2Index.get(id);
    }
  }

  getByKeyword(keyword: string): HierarchicalMemoryEntry[] {
    const ids = this.keywordIndex.get(keyword);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.l0Index.get(id))
      .filter((e): e is HierarchicalMemoryEntry => e !== undefined);
  }

  getByAgent(agentId: string): HierarchicalMemoryEntry[] {
    const ids = this.agentIndex.get(agentId);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.l0Index.get(id))
      .filter((e): e is HierarchicalMemoryEntry => e !== undefined);
  }

  delete(id: string): boolean {
    let deleted = false;

    if (this.l0Index.has(id)) {
      const entry = this.l0Index.get(id)!;
      // 清理关键词索引
      if (entry.L0?.keywords) {
        for (const keyword of entry.L0.keywords) {
          this.keywordIndex.get(keyword)?.delete(id);
        }
      }
      this.l0Index.delete(id);
      deleted = true;
    }

    this.l1Index.delete(id);
    this.l2Index.delete(id);
    return deleted;
  }

  getAllL0(): HierarchicalMemoryEntry[] {
    return Array.from(this.l0Index.values());
  }

  size(): { l0: number; l1: number; l2: number } {
    return {
      l0: this.l0Index.size,
      l1: this.l1Index.size,
      l2: this.l2Index.size,
    };
  }
}

/**
 * 分层记忆服务
 */
export class HierarchicalMemoryService extends MemoryService {
  private hierarchicalStore: HierarchicalMemoryStore;
  private agentConfigs: Map<string, AgentMemoryConfig>;
  private sharedConfig?: SharedMemoryConfig;
  private sharedMemoryPath: string;
  private syncTimer?: NodeJS.Timeout;

  constructor(options: HierarchicalMemoryOptions = {}) {
    super(options);

    this.hierarchicalStore = new HierarchicalMemoryStore();
    this.agentConfigs = new Map();
    this.sharedMemoryPath = options.sharedConfig?.sharedPath ||
      path.join(process.cwd(), 'data', 'shared-memory');

    // 初始化 Agent 配置
    if (options.agentConfigs) {
      for (const config of options.agentConfigs) {
        this.agentConfigs.set(config.agentId, config);
      }
    }

    this.sharedConfig = options.sharedConfig;

    logger.info('[HierarchicalMemoryService] 分层记忆服务初始化完成');
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    await super.initialize();

    // 创建共享记忆目录
    await fs.mkdir(this.sharedMemoryPath, { recursive: true });

    // 初始化各 Agent 记忆目录
    for (const [agentId, config] of this.agentConfigs) {
      await fs.mkdir(config.memoryPath, { recursive: true });

      // 加载或创建 .abstract 索引文件
      await this.loadOrCreateAbstractIndex(agentId, config.memoryPath);
    }

    // 启动共享记忆同步
    if (this.sharedConfig) {
      this.startSharedMemorySync();
    }

    logger.info('[HierarchicalMemoryService] 服务启动完成');
  }

  /**
   * 添加分层记忆
   */
  async addHierarchicalMemory(
    type: MemoryType,
    content: string,
    layer: MemoryLayer,
    metadata: MemoryMetadata = {}
  ): Promise<string> {
    const id = this.generateHierarchicalMemoryId();
    const now = new Date();

    // 生成 L0 抽象
    const L0 = this.generateL0Abstract(content, metadata);

    // 生成 L1 概览
    const L1 = this.generateL1Overview(content, metadata);

    const entry: HierarchicalMemoryEntry = {
      id,
      type,
      layer,
      L0,
      L1,
      L2: { content },
      metadata,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      lifecycle: 'active',
    };

    this.hierarchicalStore.add(entry);

    // 异步保存
    this.saveHierarchicalMemory(entry).catch(error => {
      logger.error(`[HierarchicalMemoryService] 保存失败: ${error}`);
    });

    // 更新 .abstract 索引
    if (metadata.taskId) {
      const agentId = metadata.taskId.split(':')[0];
      await this.updateAbstractIndex(agentId, entry);
    }

    logger.debug(`[HierarchicalMemoryService] 添加分层记忆: ${id} (${layer})`);
    return id;
  }

  /**
   * 获取分层记忆（按层加载）
   */
  getHierarchicalMemory(
    id: string,
    layer: MemoryLayer
  ): HierarchicalMemoryEntry | undefined {
    const entry = this.hierarchicalStore.get(id, layer);
    if (entry) {
      entry.lastAccessedAt = new Date();
      entry.accessCount++;
    }
    return entry;
  }

  /**
   * 搜索分层记忆（L0 快速检索）
   */
  searchHierarchicalMemories(
    query: string,
    options: MemoryRetrieveOptions = {}
  ): HierarchicalMemoryEntry[] {
    // 从 L0 索引开始搜索
    let results = this.hierarchicalStore.getAllL0();

    // 关键词匹配
    const keywords = this.extractKeywords(query);
    for (const keyword of keywords) {
      const keywordResults = this.hierarchicalStore.getByKeyword(keyword);
      results = results.concat(keywordResults);
    }

    // Agent 过滤
    if (options.userId) {
      const config = this.agentConfigs.get(options.userId);
      if (config) {
        results = results.concat(this.hierarchicalStore.getByAgent(options.userId));
      }
    }

    // 去重
    const unique = new Map<string, HierarchicalMemoryEntry>();
    for (const result of results) {
      unique.set(result.id, result);
    }

    return Array.from(unique.values());
  }

  /**
   * 生成 L0 抽象 (~100 tokens)
   */
  private generateL0Abstract(
    content: string,
    metadata: MemoryMetadata
  ): HierarchicalMemoryEntry['L0'] {
    // 提取关键信息生成摘要
    const summary = content.substring(0, 100).trim();
    const keywords = this.extractKeywords(content);

    return {
      summary,
      keywords,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 生成 L1 概览 (~2000 tokens)
   */
  private generateL1Overview(
    content: string,
    metadata: MemoryMetadata
  ): HierarchicalMemoryEntry['L1'] {
    // 结构化内容
    const lines = content.split('\n');
    const keyPoints: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // 提取关键点（以 -、*、数字开头的行）
      if (/^[-*•]\s/.test(trimmed) || /^\d+[.)]\s/.test(trimmed)) {
        keyPoints.push(trimmed);
      }
    }

    // 生成上下文
    const context = metadata.tags?.join(', ') || '';

    return {
      overview: content.substring(0, 2000).trim(),
      keyPoints: keyPoints.slice(0, 20),
      context,
    };
  }

  /**
   * 提取关键词
   */
  private extractKeywords(content: string): string[] {
    // 简单的关键词提取
    const words = content.toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    // 统计词频
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    // 返回高频词
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * 加载或创建 .abstract 索引文件
   */
  private async loadOrCreateAbstractIndex(
    agentId: string,
    memoryPath: string
  ): Promise<void> {
    const abstractPath = path.join(memoryPath, '.abstract');

    try {
      await fs.access(abstractPath);
      const content = await fs.readFile(abstractPath, 'utf-8');
      const index: AbstractIndex = JSON.parse(content);

      logger.debug(`[HierarchicalMemoryService] 加载索引: ${agentId} (${index.count} 条)`);
    } catch {
      // 创建新索引
      const newIndex: AbstractIndex = {
        agentId,
        count: 0,
        lastUpdated: new Date().toISOString(),
        entries: [],
      };

      await fs.writeFile(abstractPath, JSON.stringify(newIndex, null, 2));
      logger.debug(`[HierarchicalMemoryService] 创建索引: ${agentId}`);
    }
  }

  /**
   * 更新 .abstract 索引文件
   */
  private async updateAbstractIndex(
    agentId: string,
    entry: HierarchicalMemoryEntry
  ): Promise<void> {
    const config = this.agentConfigs.get(agentId);
    if (!config) return;

    const abstractPath = path.join(config.memoryPath, '.abstract');

    try {
      const content = await fs.readFile(abstractPath, 'utf-8');
      const index: AbstractIndex = JSON.parse(content);

      // 添加 L0 条目
      if (entry.L0) {
        index.entries.push({
          id: entry.id,
          summary: entry.L0.summary,
          keywords: entry.L0.keywords,
          timestamp: entry.L0.timestamp,
          layer: entry.layer,
        });
        index.count++;
        index.lastUpdated = new Date().toISOString();
      }

      await fs.writeFile(abstractPath, JSON.stringify(index, null, 2));
    } catch (error) {
      logger.error(`[HierarchicalMemoryService] 更新索引失败: ${error}`);
    }
  }

  /**
   * 启动共享记忆同步
   */
  private startSharedMemorySync(): void {
    if (!this.sharedConfig) return;

    const interval = this.sharedConfig.syncInterval || 5 * 60 * 1000; // 默认 5 分钟

    this.syncTimer = setInterval(() => {
      this.syncSharedMemory().catch(error => {
        logger.error(`[HierarchicalMemoryService] 共享记忆同步失败: ${error}`);
      });
    }, interval);

    logger.info(`[HierarchicalMemoryService] 共享记忆同步已启动 (间隔: ${interval}ms)`);
  }

  /**
   * 同步共享记忆
   */
  private async syncSharedMemory(): Promise<void> {
    if (!this.sharedConfig) return;

    const sharedIndexPath = path.join(this.sharedMemoryPath, '.shared-abstract');

    // 收集所有 Agent 的记忆
    const allEntries: HierarchicalMemoryEntry[] = [];

    for (const agentId of this.sharedConfig.participatingAgents) {
      const agentEntries = this.hierarchicalStore.getByAgent(agentId);
      allEntries.push(...agentEntries);
    }

    // 生成共享索引
    const sharedIndex: AbstractIndex = {
      agentId: 'shared',
      count: allEntries.length,
      lastUpdated: new Date().toISOString(),
      entries: allEntries
        .filter(e => e.L0)
        .map(e => ({
          id: e.id,
          summary: e.L0!.summary,
          keywords: e.L0!.keywords,
          timestamp: e.L0!.timestamp,
          layer: e.layer,
        })),
    };

    await fs.writeFile(sharedIndexPath, JSON.stringify(sharedIndex, null, 2));

    logger.debug(`[HierarchicalMemoryService] 共享记忆同步完成 (${allEntries.length} 条)`);
  }

  /**
   * 保存分层记忆
   */
  private async saveHierarchicalMemory(entry: HierarchicalMemoryEntry): Promise<void> {
    const agentId = entry.metadata.taskId?.split(':')[0] || 'shared';
    const config = this.agentConfigs.get(agentId);
    const memoryPath = config?.memoryPath || this.sharedMemoryPath;

    const layerPath = path.join(memoryPath, entry.layer);
    await fs.mkdir(layerPath, { recursive: true });

    const filePath = path.join(layerPath, `${entry.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
  }

  /**
   * 生成唯一 ID
   */
  private generateHierarchicalMemoryId(): string {
    return `hmem_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 获取统计信息
   */
  getHierarchicalStats() {
    const size = this.hierarchicalStore.size();
    return {
      ...super.getStats(),
      hierarchical: {
        L0: size.l0,
        L1: size.l1,
        L2: size.l2,
      },
      agents: Array.from(this.agentConfigs.keys()),
      sharedMemory: this.sharedConfig?.enabled ?? false,
    };
  }

  /**
   * 关闭服务
   */
  async shutdown(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    await super.shutdown();

    // 最后一次同步共享记忆
    if (this.sharedConfig) {
      await this.syncSharedMemory();
    }

    logger.info('[HierarchicalMemoryService] 服务已关闭');
  }
}

export default HierarchicalMemoryService;
