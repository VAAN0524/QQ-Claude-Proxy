/**
 * Dashboard API Handlers
 *
 * REST API endpoints for:
 * - Stats and status
 * - Configuration management
 * - Service control (restart, stop)
 * - Task progress
 */

import { IncomingMessage, ServerResponse } from 'http';
import { logger } from '../utils/logger.js';
import { Config, defaultConfig } from '../config/schema.js';
import { existsSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import type { Scheduler } from '../scheduler/index.js';
import { ConfigWriter } from '../config/writer.js';
import { ConfigValidator } from '../config/validator.js';

/**
 * Dashboard state for real-time updates
 */
export interface DashboardState {
  tasks: Map<string, TaskInfo>;
  stats: StatsInfo;
}

export interface MilestoneInfo {
  timestamp: number;
  message: string;
  type: 'milestone' | 'progress' | 'error';
}

export interface TaskInfo {
  id: string;
  userId: string;
  groupId?: string;
  prompt: string;
  startTime: number;
  elapsed: number;
  status: 'running' | 'completed' | 'error';
  output?: string;
  completedAt?: number;
  milestones?: MilestoneInfo[];  // 中间进度/里程碑
}

export interface StatsInfo {
  totalTasks: number;
  runningTasks: number;
  completedTasks: number;
  uptime: number;
  startTime: number;
}

/**
 * API Handlers context
 */
export interface ApiHandlerContext {
  config: Config;
  dashboardState: DashboardState;
  restartCallback?: () => Promise<void>;
  scheduler?: Scheduler;
}

/**
 * Extended API Handlers context
 */
export interface ExtendedApiHandlerContext extends ApiHandlerContext {
  agentRegistry?: any;
  skillLoader?: any;
  logFilePath?: string;
}

/**
 * Get URL body helper
 */
async function getBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

/**
 * Helper function to mask sensitive values
 */
function maskSecret(value?: string): string | undefined {
  if (!value || value.length < 8) return value;
  return value.substring(0, 8) + '...' + value.substring(value.length - 4);
}

/**
 * Create API handlers map
 */
export function createApiHandlers(context: ApiHandlerContext): Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> {
  const handlers = new Map();

  /**
   * GET /api/health - Health check endpoint for watchdog
   */
  handlers.set('GET:/api/health', async (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const tasks = Array.from(context.dashboardState.tasks.values());
    const running = tasks.filter(t => t.status === 'running').length;
    const uptime = Date.now() - context.dashboardState.stats.startTime;

    // Memory usage
    const memUsage = process.memoryUsage();
    const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2);

    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime,
      uptime_seconds: Math.floor(uptime / 1000),
      pid: process.pid,
      memory: {
        heap_used_mb: parseFloat(heapUsedMB),
        heap_total_mb: parseFloat(heapTotalMB),
        rss_mb: parseFloat(rssMB),
      },
      tasks: {
        total: tasks.length,
        running,
      },
      gateway: {
        host: context.config.gateway.host,
        port: context.config.gateway.port,
      },
    };

    sendJson(res, health);
  });

  /**
   * GET /api/stats - Get dashboard stats
   */
  handlers.set('GET:/api/stats', async (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const tasks = Array.from(context.dashboardState.tasks.values());
    const running = tasks.filter(t => t.status === 'running').length;
    const completed = tasks.filter(t => t.status === 'completed').length;

    const stats = {
      totalTasks: tasks.length,
      runningTasks: running,
      completedTasks: completed,
      uptime: Date.now() - context.dashboardState.stats.startTime,
      startTime: context.dashboardState.stats.startTime,
      gateway: {
        host: context.config.gateway.host,
        port: context.config.gateway.port,
      },
      qqbot: {
        enabled: context.config.channels.qqbot.enabled,
        sandbox: context.config.channels.qqbot.sandbox,
      },
    };

    sendJson(res, stats);
  });

  /**
   * GET /api/tasks - Get all tasks
   */
  handlers.set('GET:/api/tasks', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    const tasks = Array.from(context.dashboardState.tasks.values());
    sendJson(res, { tasks });
  });

  /**
   * GET /api/tasks/:id - Get specific task
   */
  handlers.set('GET:/api/tasks/current', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    const tasks = Array.from(context.dashboardState.tasks.values());
    const running = tasks.filter(t => t.status === 'running');
    sendJson(res, { tasks: running });
  });

  /**
   * GET/PUT /api/config - Get or update safe config (no secrets)
   */
  const configHandler = async (req, res) => {
    if (req.method === 'GET') {
      // Return safe config (no secrets)
      const safeConfig = {
        gateway: context.config.gateway,
        channels: {
          qqbot: {
            enabled: context.config.channels.qqbot.enabled,
            sandbox: context.config.channels.qqbot.sandbox,
          },
        },
        agent: context.config.agent,
        storage: context.config.storage,
      };

      sendJson(res, safeConfig);
      return;
    }

    if (req.method === 'PUT') {
      try {
        const updates = await getBody(req);
        const configPath = resolve(process.cwd(), 'config.json');

        let currentConfig = {};
        if (existsSync(configPath)) {
          currentConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        }

        // Merge updates
        const newConfig = { ...currentConfig, ...updates };

        // Write to file
        writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');

        logger.info(`Config updated via Dashboard`);
        sendJson(res, { success: true, message: '配置已更新，需要重启生效' });
      } catch (error) {
        logger.error(`Failed to update config: ${error}`);
        sendJson(res, { error: '更新配置失败' }, 500);
      }
      return;
    }

    sendJson(res, { error: 'Method not allowed' }, 405);
  };

  /**
   * GET/PUT /api/config/full - Get or update full config (with masked secrets)
   */
  const configFullHandler = async (req, res) => {
    if (req.method === 'GET') {
      // Return full config with masked secrets
      const fullConfig = {
        gateway: context.config.gateway,
        channels: {
          qqbot: {
            enabled: context.config.channels.qqbot.enabled,
            appId: context.config.channels.qqbot.appId,
            clientSecret: maskSecret(context.config.channels.qqbot.clientSecret),
            token: context.config.channels.qqbot.token ? maskSecret(context.config.channels.qqbot.token) : undefined,
            sandbox: context.config.channels.qqbot.sandbox,
          },
        },
        agent: context.config.agent,
        agents: context.config.agents,
        storage: context.config.storage,
        scheduler: context.config.scheduler,
        llm: context.config.llm ? {
          provider: context.config.llm.provider,
          model: context.config.llm.model,
          maxTokens: context.config.llm.maxTokens,
          baseURL: context.config.llm.baseURL,
          apiKey: context.config.llm.apiKey ? maskSecret(context.config.llm.apiKey) : undefined,
          glm: context.config.llm.glm ? {
            apiKey: context.config.llm.glm.apiKey ? maskSecret(context.config.llm.glm.apiKey) : undefined,
            useJwt: context.config.llm.glm.useJwt,
            isCodingPlan: context.config.llm.glm.isCodingPlan,
          } : undefined,
          anthropic: context.config.llm.anthropic ? {
            apiKey: context.config.llm.anthropic.apiKey ? maskSecret(context.config.llm.anthropic.apiKey) : undefined,
            model: context.config.llm.anthropic.model,
            maxTokens: context.config.llm.anthropic.maxTokens,
          } : undefined,
          openai: context.config.llm.openai ? {
            apiKey: context.config.llm.openai.apiKey ? maskSecret(context.config.llm.openai.apiKey) : undefined,
            baseURL: context.config.llm.openai.baseURL,
            model: context.config.llm.openai.model,
            maxTokens: context.config.llm.openai.maxTokens,
          } : undefined,
        } : undefined,
      };

      sendJson(res, fullConfig);
      return;
    }

    if (req.method === 'PUT') {
      try {
        const updates = await getBody(req);
        const configPath = resolve(process.cwd(), 'config.json');

        let currentConfig: any = {};
        if (existsSync(configPath)) {
          currentConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        }

        // Deep merge for nested objects, using default config as fallback
        const newConfig = {
          ...defaultConfig,
          ...currentConfig,
          ...updates,
          gateway: { ...defaultConfig.gateway, ...currentConfig.gateway, ...updates.gateway },
          channels: {
            ...defaultConfig.channels,
            ...currentConfig.channels,
            qqbot: {
              ...defaultConfig.channels.qqbot,
              ...currentConfig.channels?.qqbot,
              ...updates.channels?.qqbot,
            },
          },
          agent: { ...defaultConfig.agent, ...currentConfig.agent, ...updates.agent },
          agents: { ...defaultConfig.agents, ...currentConfig.agents, ...updates.agents },
          storage: { ...defaultConfig.storage, ...currentConfig.storage, ...updates.storage },
          scheduler: { ...defaultConfig.scheduler, ...currentConfig.scheduler, ...updates.scheduler },
          llm: {
            ...defaultConfig.llm,
            ...currentConfig.llm,
            ...updates.llm,
            glm: {
              ...defaultConfig.llm?.glm,
              ...currentConfig.llm?.glm,
              ...updates.llm?.glm,
            },
            anthropic: {
              ...defaultConfig.llm?.anthropic,
              ...currentConfig.llm?.anthropic,
              ...updates.llm?.anthropic,
            },
            openai: {
              ...defaultConfig.llm?.openai,
              ...currentConfig.llm?.openai,
              ...updates.llm?.openai,
            },
          },
        };

        // Merge agents config if provided
        if (updates.agents) {
          newConfig.agents = { ...currentConfig.agents, ...updates.agents };
        }

        // Preserve existing secrets if not provided or if masked
        if (newConfig.channels.qqbot.clientSecret && newConfig.channels.qqbot.clientSecret.includes('...')) {
          newConfig.channels.qqbot.clientSecret = currentConfig.channels.qqbot.clientSecret;
        }
        if (newConfig.channels.qqbot.token && newConfig.channels.qqbot.token.includes('...')) {
          newConfig.channels.qqbot.token = currentConfig.channels.qqbot.token;
        }

        // Preserve LLM API keys if masked
        if (newConfig.llm?.apiKey && newConfig.llm.apiKey.includes('...')) {
          newConfig.llm.apiKey = currentConfig.llm?.apiKey;
        }
        if (newConfig.llm?.glm?.apiKey && newConfig.llm.glm.apiKey.includes('...')) {
          newConfig.llm.glm.apiKey = currentConfig.llm?.glm?.apiKey;
        }
        if (newConfig.llm?.anthropic?.apiKey && newConfig.llm.anthropic.apiKey.includes('...')) {
          newConfig.llm.anthropic.apiKey = currentConfig.llm?.anthropic?.apiKey;
        }
        if (newConfig.llm?.openai?.apiKey && newConfig.llm.openai.apiKey.includes('...')) {
          newConfig.llm.openai.apiKey = currentConfig.llm?.openai?.apiKey;
        }

        // Write to file
        writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');

        logger.info(`Full config updated via Dashboard`);
        sendJson(res, { success: true, message: '配置已更新，需要重启生效' });
      } catch (error) {
        logger.error(`Failed to update full config: ${error}`);
        sendJson(res, { error: '更新配置失败' }, 500);
      }
      return;
    }

    sendJson(res, { error: 'Method not allowed' }, 405);
  };

  // 注册 GET 和 PUT 方法
  handlers.set('GET:/api/config', configHandler);
  handlers.set('PUT:/api/config', configHandler);
  handlers.set('GET:/api/config/full', configFullHandler);
  handlers.set('PUT:/api/config/full', configFullHandler);

  /**
   * POST /api/restart - Restart service
   */
  handlers.set('POST:/api/restart', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      if (context.restartCallback) {
        // Send success response before restarting
        sendJson(res, { success: true, message: '服务正在重启...' });

        // Delay restart slightly to allow response to be sent
        setTimeout(() => {
          context.restartCallback!().catch((error) => {
            logger.error(`Restart failed: ${error}`);
          });
        }, 500);
      } else {
        sendJson(res, { error: '重启功能未配置' }, 501);
      }
    } catch (error) {
      logger.error(`Failed to restart: ${error}`);
      sendJson(res, { error: '重启失败' }, 500);
    }
  });

  /**
   * POST /api/tasks/clear - Clear completed tasks
   */
  handlers.set('POST:/api/tasks/clear', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    const before = context.dashboardState.tasks.size;
    for (const [id, task] of context.dashboardState.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'error') {
        context.dashboardState.tasks.delete(id);
      }
    }
    const cleared = before - context.dashboardState.tasks.size;

    logger.info(`Cleared ${cleared} completed tasks via Dashboard`);
    sendJson(res, { success: true, cleared });
  });

  // ==================== 定时任务 API ====================

  /**
   * GET /api/scheduled-tasks - 获取所有定时任务
   */
  handlers.set('GET:/api/scheduled-tasks', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.scheduler) {
      sendJson(res, { error: '调度器未启用' }, 503);
      return;
    }

    const tasks = context.scheduler.getAllTasks();
    sendJson(res, { tasks });
  });

  /**
   * POST /api/scheduled-tasks - 创建定时任务
   */
  handlers.set('POST:/api/scheduled-tasks', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.scheduler) {
      sendJson(res, { error: '调度器未启用' }, 503);
      return;
    }

    try {
      const params = await getBody(req);

      // 验证必需字段
      if (!params.name || !params.command || !params.type) {
        sendJson(res, { error: '缺少必需字段: name, command, type' }, 400);
        return;
      }

      // 验证类型
      if (params.type !== 'periodic' && params.type !== 'scheduled') {
        sendJson(res, { error: '无效的任务类型，必须是 periodic 或 scheduled' }, 400);
        return;
      }

      // 验证配置
      if (params.type === 'periodic' && !params.periodicConfig) {
        sendJson(res, { error: '周期任务必须提供 periodicConfig' }, 400);
        return;
      }

      if (params.type === 'scheduled' && !params.scheduledConfig) {
        sendJson(res, { error: '定时任务必须提供 scheduledConfig' }, 400);
        return;
      }

      const task = await context.scheduler.createTask({
        ...params,
        createdBy: 'dashboard', // Dashboard 创建的任务
      });

      logger.info(`创建定时任务: ${task.name} (${task.id})`);
      sendJson(res, { success: true, task });
    } catch (error) {
      logger.error(`创建定时任务失败: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '创建失败' }, 500);
    }
  });

  /**
   * GET /api/scheduled-tasks/:id - 获取单个任务
   */
  handlers.set('GET:/api/scheduled-tasks/get', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.scheduler) {
      sendJson(res, { error: '调度器未启用' }, 503);
      return;
    }

    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const taskId = url.searchParams.get('id');

    if (!taskId) {
      sendJson(res, { error: '缺少任务ID' }, 400);
      return;
    }

    const task = context.scheduler.getTask(taskId);
    if (!task) {
      sendJson(res, { error: '任务不存在' }, 404);
      return;
    }

    sendJson(res, { task });
  });

  /**
   * PUT /api/scheduled-tasks/:id - 更新任务
   */
  handlers.set('PUT:/api/scheduled-tasks/update', async (req, res) => {
    if (req.method !== 'PUT') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.scheduler) {
      sendJson(res, { error: '调度器未启用' }, 503);
      return;
    }

    try {
      const params = await getBody(req);
      const { taskId, ...updates } = params;

      if (!taskId) {
        sendJson(res, { error: '缺少任务ID' }, 400);
        return;
      }

      const task = await context.scheduler.updateTask(taskId, updates);
      if (!task) {
        sendJson(res, { error: '任务不存在' }, 404);
        return;
      }

      logger.info(`更新定时任务: ${task.name} (${taskId})`);
      sendJson(res, { success: true, task });
    } catch (error) {
      logger.error(`更新定时任务失败: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '更新失败' }, 500);
    }
  });

  /**
   * DELETE /api/scheduled-tasks/:id - 删除任务
   */
  handlers.set('DELETE:/api/scheduled-tasks/delete', async (req, res) => {
    if (req.method !== 'DELETE') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.scheduler) {
      sendJson(res, { error: '调度器未启用' }, 503);
      return;
    }

    try {
      const params = await getBody(req);
      const { taskId } = params;

      if (!taskId) {
        sendJson(res, { error: '缺少任务ID' }, 400);
        return;
      }

      const deleted = await context.scheduler.deleteTask(taskId);
      if (!deleted) {
        sendJson(res, { error: '任务不存在' }, 404);
        return;
      }

      logger.info(`删除定时任务: ${taskId}`);
      sendJson(res, { success: true });
    } catch (error) {
      logger.error(`删除定时任务失败: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '删除失败' }, 500);
    }
  });

  /**
   * POST /api/scheduled-tasks/:id/pause - 暂停周期任务
   */
  handlers.set('POST:/api/scheduled-tasks/pause', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.scheduler) {
      sendJson(res, { error: '调度器未启用' }, 503);
      return;
    }

    try {
      const params = await getBody(req);
      const { taskId } = params;

      if (!taskId) {
        sendJson(res, { error: '缺少任务ID' }, 400);
        return;
      }

      const success = await context.scheduler.pauseTask(taskId);
      if (!success) {
        sendJson(res, { error: '暂停失败，任务不存在或不是周期任务' }, 400);
        return;
      }

      logger.info(`暂停周期任务: ${taskId}`);
      sendJson(res, { success: true });
    } catch (error) {
      logger.error(`暂停周期任务失败: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '暂停失败' }, 500);
    }
  });

  /**
   * POST /api/scheduled-tasks/:id/resume - 恢复周期任务
   */
  handlers.set('POST:/api/scheduled-tasks/resume', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.scheduler) {
      sendJson(res, { error: '调度器未启用' }, 503);
      return;
    }

    try {
      const params = await getBody(req);
      const { taskId } = params;

      if (!taskId) {
        sendJson(res, { error: '缺少任务ID' }, 400);
        return;
      }

      const success = await context.scheduler.resumeTask(taskId);
      if (!success) {
        sendJson(res, { error: '恢复失败，任务不存在或不是周期任务' }, 400);
        return;
      }

      logger.info(`恢复周期任务: ${taskId}`);
      sendJson(res, { success: true });
    } catch (error) {
      logger.error(`恢复周期任务失败: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '恢复失败' }, 500);
    }
  });

  /**
   * POST /api/scheduled-tasks/:id/execute - 立即执行任务
   */
  handlers.set('POST:/api/scheduled-tasks/execute', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.scheduler) {
      sendJson(res, { error: '调度器未启用' }, 503);
      return;
    }

    try {
      const params = await getBody(req);
      const { taskId } = params;

      if (!taskId) {
        sendJson(res, { error: '缺少任务ID' }, 400);
        return;
      }

      const success = await context.scheduler.executeTaskNow(taskId);
      if (!success) {
        sendJson(res, { error: '执行失败，任务可能已在运行中' }, 400);
        return;
      }

      logger.info(`手动执行任务: ${taskId}`);
      sendJson(res, { success: true, message: '任务已开始执行' });
    } catch (error) {
      logger.error(`手动执行任务失败: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '执行失败' }, 500);
    }
  });

  /**
   * POST /api/scheduled-tasks/:id/reset - 重置任务状态
   */
  handlers.set('POST:/api/scheduled-tasks/reset', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.scheduler) {
      sendJson(res, { error: '调度器未启用' }, 503);
      return;
    }

    try {
      const params = await getBody(req);
      const { taskId } = params;

      if (!taskId) {
        sendJson(res, { error: '缺少任务ID' }, 400);
        return;
      }

      const task = context.scheduler.getTask(taskId);
      if (!task) {
        sendJson(res, { error: '任务不存在' }, 404);
        return;
      }

      // 重置任务状态
      await context.scheduler.updateTask(taskId, {
        status: 'pending' as any,
        // 清空执行历史和计数
        executionHistory: [] as any,
        executionCount: 0,
        failureCount: 0,
      } as any);

      // 重新计算下次执行时间
      if (task.type === 'periodic' && task.periodicConfig) {
        const nextTime = Date.now() + task.periodicConfig.interval;
        await context.scheduler.updateTask(taskId, {
          nextExecutionTime: nextTime as any,
        } as any);
      }

      logger.info(`重置任务状态: ${taskId} (${task.name})`);
      sendJson(res, { success: true });
    } catch (error) {
      logger.error(`重置任务状态失败: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '重置失败' }, 500);
    }
  });

  /**
   * GET /api/scheduled-tasks/stats - 获取定时任务统计
   */
  handlers.set('GET:/api/scheduled-tasks/stats', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.scheduler) {
      sendJson(res, { error: '调度器未启用' }, 503);
      return;
    }

    const stats = context.scheduler.getStatistics();
    sendJson(res, { stats });
  });

  return handlers;
}

/**
 * Send JSON response helper
 */
function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Create initial dashboard state
 */
export function createDashboardState(): DashboardState {
  return {
    tasks: new Map(),
    stats: {
      totalTasks: 0,
      runningTasks: 0,
      completedTasks: 0,
      uptime: 0,
      startTime: Date.now(),
    },
  };
}

// ==================== 扩展 API 端点 ====================

/**
 * 创建扩展的 API 处理器
 * 包含配置管理、Agent管理、技能管理、日志和系统API
 */
export function createExtendedApiHandlers(context: ExtendedApiHandlerContext): Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> {
  const handlers = new Map();
  const configWriter = new ConfigWriter();
  const configValidator = new ConfigValidator();

  // ==================== 配置管理 API ====================

  /**
   * GET /api/config/schema - 获取配置 Schema（用于前端生成表单）
   */
  handlers.set('GET:/api/config/schema', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    const schema = configValidator.getConfigSchema();
    sendJson(res, { schema });
  });

  /**
   * POST /api/config/validate - 验证配置是否有效
   */
  handlers.set('POST:/api/config/validate', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const config = await getBody(req);
      const validation = await configValidator.validateFull(config);

      sendJson(res, {
        valid: validation.validation.valid,
        errors: validation.validation.errors,
        warnings: validation.validation.warnings,
        paths: validation.paths,
        apis: validation.apis,
      });
    } catch (error) {
      logger.error(`Failed to validate config: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '验证配置失败' }, 500);
    }
  });

  /**
   * POST /api/config/test-connection - 测试 API 连接
   */
  handlers.set('POST:/api/config/test-connection', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const { provider, apiKey } = await getBody(req);

      if (!provider || !apiKey) {
        sendJson(res, { error: '缺少必需参数: provider, apiKey' }, 400);
        return;
      }

      // 验证 API Key 格式
      const isValidFormat = configValidator.validateApiKeyFormat(provider as any, apiKey);
      if (!isValidFormat) {
        sendJson(res, { success: false, error: 'API Key 格式无效' });
        return;
      }

      // TODO: 实际测试 API 连接（可以添加真实的 HTTP 请求）
      // 目前只返回格式验证结果
      sendJson(res, {
        success: true,
        provider,
        message: 'API Key 格式有效（实际连接测试待实现）',
      });
    } catch (error) {
      logger.error(`Failed to test connection: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '测试连接失败' }, 500);
    }
  });

  // ==================== Agent 管理 API ====================

  /**
   * GET /api/agents - 获取所有 Agent 列表和状态
   */
  handlers.set('GET:/api/agents', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.agentRegistry) {
      sendJson(res, { error: 'Agent Registry 未初始化' }, 503);
      return;
    }

    try {
      // 返回字典格式的 Agent 配置，前端期望的格式
      const agentsList = context.agentRegistry.getSummary();
      const agentsDict: Record<string, any> = {};

      for (const agent of agentsList) {
        const agentInstance = context.agentRegistry!.get(agent.id);
        if (agentInstance) {
          agentsDict[agent.id] = {
            id: agent.id,
            name: agent.name,
            enabled: agent.enabled,
            capabilities: agent.capabilities,
            // 从 config 中获取更多配置
            priority: (agentInstance.config as any).priority,
            timeout: (agentInstance.config as any).timeout,
            options: (agentInstance.config as any).options || {},
          };
        }
      }

      sendJson(res, { agents: agentsDict });
    } catch (error) {
      logger.error(`Failed to get agents: ${error}`);
      sendJson(res, { error: '获取 Agent 列表失败' }, 500);
    }
  });

  /**
   * PUT /api/agents/:id - 更新 Agent 配置
   */
  handlers.set('PUT:/api/agents/update', async (req, res) => {
    if (req.method !== 'PUT') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const { agentId, config: agentConfig } = await getBody(req);

      if (!agentId) {
        sendJson(res, { error: '缺少 Agent ID' }, 400);
        return;
      }

      if (!context.agentRegistry) {
        sendJson(res, { error: 'Agent Registry 未初始化' }, 503);
        return;
      }

      const agent = context.agentRegistry.get(agentId);
      if (!agent) {
        sendJson(res, { error: 'Agent 不存在' }, 404);
        return;
      }

      // 更新运行时配置（使用类型断言绕过 readonly）
      const config = agent.config as any;
      if (agentConfig.enabled !== undefined) config.enabled = agentConfig.enabled;
      if (agentConfig.priority !== undefined) config.priority = agentConfig.priority;
      if (agentConfig.timeout !== undefined) config.timeout = agentConfig.timeout;
      if (agentConfig.options) {
        config.options = { ...config.options, ...agentConfig.options };
      }

      // 同时持久化到 config.json
      const configPath = resolve(process.cwd(), 'config.json');
      let currentConfig: any = {};
      if (existsSync(configPath)) {
        currentConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      }

      // 确保 agents 配置存在
      if (!currentConfig.agents) {
        currentConfig.agents = {};
      }
      if (!currentConfig.agents[agentId]) {
        currentConfig.agents[agentId] = {};
      }

      // 更新配置文件
      currentConfig.agents[agentId] = {
        ...currentConfig.agents[agentId],
        ...agentConfig,
      };

      // 写入配置文件
      writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf-8');

      logger.info(`Agent config updated: ${agentId}`);
      sendJson(res, { success: true, agent: { id: agent.id, name: agent.name, config: agent.config } });
    } catch (error) {
      logger.error(`Failed to update agent: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '更新 Agent 失败' }, 500);
    }
  });

  /**
   * GET /api/agents/:id/stats - 获取 Agent 统计信息
   */
  handlers.set('GET:/api/agents/stats', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const agentId = url.searchParams.get('id');

      if (!agentId) {
        // 返回所有 Agent 的统计信息
        const allStats = context.dashboardState.tasks;
        const agentStats: Record<string, any> = {};

        for (const [taskId, task] of allStats) {
          if (!agentStats[task.userId]) {
            agentStats[task.userId] = { total: 0, completed: 0, running: 0, error: 0 };
          }
          agentStats[task.userId].total++;
          agentStats[task.userId][task.status]++;
        }

        sendJson(res, { stats: agentStats });
        return;
      }

      // 返回特定 Agent 的统计信息
      const agentTasks = Array.from(context.dashboardState.tasks.values())
        .filter(t => t.userId === agentId);

      const stats = {
        total: agentTasks.length,
        completed: agentTasks.filter(t => t.status === 'completed').length,
        running: agentTasks.filter(t => t.status === 'running').length,
        error: agentTasks.filter(t => t.status === 'error').length,
        recentTasks: agentTasks.slice(-10),
      };

      sendJson(res, { agentId, stats });
    } catch (error) {
      logger.error(`Failed to get agent stats: ${error}`);
      sendJson(res, { error: '获取统计信息失败' }, 500);
    }
  });

  /**
   * POST /api/agents/reload - 重新加载 Agent 配置
   */
  handlers.set('POST:/api/agents/reload', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      // TODO: 实现 Agent 重新加载逻辑
      // 这需要从配置文件重新读取并更新 AgentRegistry

      logger.info('Agent reload requested via Dashboard API');
      sendJson(res, { success: true, message: 'Agent 配置已重新加载（功能待实现）' });
    } catch (error) {
      logger.error(`Failed to reload agents: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '重新加载失败' }, 500);
    }
  });

  // ==================== 技能管理 API ====================

  /**
   * GET /api/skills - 获取所有技能列表
   */
  handlers.set('GET:/api/skills', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.skillLoader) {
      sendJson(res, { error: 'SkillLoader 未初始化' }, 503);
      return;
    }

    try {
      const metadata = context.skillLoader.getAllMetadata();
      const skills = Array.from(metadata.values()).map((skill: any) => ({
        name: skill.name,
        path: skill.path,
        trigger: skill.trigger,
        description: skill.description,
        fullyLoaded: skill.fullyLoaded,
        enabled: skill.enabled ?? false,
      }));

      sendJson(res, { skills, total: skills.length });
    } catch (error) {
      logger.error(`Failed to get skills: ${error}`);
      sendJson(res, { error: '获取技能列表失败' }, 500);
    }
  });

  /**
   * GET /api/skills/:name - 获取技能详情
   */
  handlers.set('GET:/api/skills/detail', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    if (!context.skillLoader) {
      sendJson(res, { error: 'SkillLoader 未初始化' }, 503);
      return;
    }

    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const name = url.searchParams.get('name');

      if (!name) {
        sendJson(res, { error: '缺少技能名称' }, 400);
        return;
      }

      const skill = await context.skillLoader.getSkill(name);
      if (!skill) {
        sendJson(res, { error: '技能不存在' }, 404);
        return;
      }

      sendJson(res, { skill });
    } catch (error) {
      logger.error(`Failed to get skill detail: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '获取技能详情失败' }, 500);
    }
  });

  /**
   * POST /api/skills/upload - 上传新技能
   */
  handlers.set('POST:/api/skills/upload', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const { name, content, source } = await getBody(req);

      if (!name || !content) {
        sendJson(res, { error: '缺少必需参数: name, content' }, 400);
        return;
      }

      // TODO: 实现技能上传逻辑
      // 这需要使用 SkillInstaller 或直接写入文件系统

      logger.info(`Skill upload requested: ${name}`);
      sendJson(res, { success: true, message: '技能上传功能待实现' });
    } catch (error) {
      logger.error(`Failed to upload skill: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '上传技能失败' }, 500);
    }
  });

  /**
   * DELETE /api/skills/:name - 删除技能
   */
  handlers.set('DELETE:/api/skills/delete', async (req, res) => {
    if (req.method !== 'DELETE') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const { name } = await getBody(req);

      if (!name) {
        sendJson(res, { error: '缺少技能名称' }, 400);
        return;
      }

      // TODO: 实现技能删除逻辑
      logger.info(`Skill deletion requested: ${name}`);
      sendJson(res, { success: true, message: '技能删除功能待实现' });
    } catch (error) {
      logger.error(`Failed to delete skill: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '删除技能失败' }, 500);
    }
  });

  /**
   * PUT /api/skills/:name/enable - 启用/禁用技能
   */
  handlers.set('PUT:/api/skills/enable', async (req, res) => {
    if (req.method !== 'PUT') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const { name, enabled } = await getBody(req);

      if (!name || typeof enabled !== 'boolean') {
        sendJson(res, { error: '缺少必需参数: name, enabled' }, 400);
        return;
      }

      if (!context.skillLoader) {
        sendJson(res, { error: 'SkillLoader 未初始化' }, 503);
        return;
      }

      const success = await context.skillLoader.setSkillEnabled(name, enabled);

      if (success) {
        sendJson(res, {
          success: true,
          message: `技能 ${name} 已${enabled ? '启用' : '禁用'}`,
          name,
          enabled
        });
      } else {
        sendJson(res, { error: `技能 ${name} 不存在` }, 404);
      }
    } catch (error) {
      logger.error(`Failed to toggle skill: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '切换技能状态失败' }, 500);
    }
  });

  /**
   * POST /api/skills/install - 从 GitHub 安装技能
   */
  handlers.set('POST:/api/skills/install', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const { url } = await getBody(req);

      if (!url || typeof url !== 'string') {
        sendJson(res, { error: '缺少必需参数: url' }, 400);
        return;
      }

      // 验证 GitHub URL 格式
      const githubUrlRegex = /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+(\.git)?$/;
      if (!githubUrlRegex.test(url)) {
        sendJson(res, { error: '无效的 GitHub URL，请输入有效的仓库地址' }, 400);
        return;
      }

      // 获取 skills 目录路径
      const skillsDir = resolve(process.cwd(), 'skills');

      // 确保 skills 目录存在
      if (!existsSync(skillsDir)) {
        mkdirSync(skillsDir, { recursive: true });
      }

      // 从 URL 提取仓库名称
      const urlParts = url.replace(/\.git$/, '').split('/');
      const repoName = urlParts[urlParts.length - 1];
      const targetPath = join(skillsDir, repoName);

      // 检查是否已存在同名目录
      if (existsSync(targetPath)) {
        sendJson(res, { error: `技能目录 "${repoName}" 已存在` }, 409);
        return;
      }

      logger.info(`[Dashboard] Installing skill from GitHub: ${url} -> ${targetPath}`);

      // 执行 git clone
      try {
        const { stdout, stderr } = await execAsync(`git clone "${url}" "${targetPath}"`, {
          cwd: process.cwd(),
          timeout: 60000, // 60 秒超时
        });

        logger.info(`[Dashboard] Git clone output: ${stdout}`);
        if (stderr) {
          logger.warn(`[Dashboard] Git clone stderr: ${stderr}`);
        }

        // 验证克隆的目录是否包含 SKILL.md
        const skillMdPath = join(targetPath, 'SKILL.md');
        if (!existsSync(skillMdPath)) {
          // 如果不是单个技能，可能是技能集合，检查目录结构
          const entries = readdirSync(targetPath, { withFileTypes: true });
          const hasSubdirectories = entries.some(e => e.isDirectory());

          if (hasSubdirectories) {
            sendJson(res, {
              success: true,
              message: `仓库 "${repoName}" 克隆成功，但未在根目录找到 SKILL.md。可能包含多个技能，请手动检查。`,
              path: targetPath,
              repoName
            });
          } else {
            // 不是有效的技能目录，清理
            await execAsync(`rm -rf "${targetPath}"`, { cwd: process.cwd() });
            sendJson(res, { error: `克隆的仓库不包含有效的 SKILL.md 文件` }, 400);
          }
          return;
        }

        // 重新扫描技能以刷新列表
        if (context.skillLoader) {
          await context.skillLoader.scanSkillsMetadata();
        }

        sendJson(res, {
          success: true,
          message: `技能 "${repoName}" 安装成功`,
          skill: {
            name: repoName,
            path: targetPath
          }
        });

      } catch (gitError: any) {
        logger.error(`[Dashboard] Git clone failed: ${gitError}`);

        // 清理可能残留的目录
        if (existsSync(targetPath)) {
          try {
            await execAsync(`rm -rf "${targetPath}"`, { cwd: process.cwd() });
          } catch (cleanupError) {
            logger.warn(`[Dashboard] Failed to cleanup: ${cleanupError}`);
          }
        }

        sendJson(res, {
          error: `克隆失败: ${gitError.message || '未知错误'}`
        }, 500);
      }

    } catch (error) {
      logger.error(`Failed to install skill: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '安装技能失败' }, 500);
    }
  });

  /**
   * GET /api/skills/schema - 获取技能元数据 Schema
   */
  handlers.set('GET:/api/skills/schema', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    const schema = {
      skillMetadata: {
        name: { type: 'string', description: '技能名称' },
        path: { type: 'string', description: '技能文件路径' },
        trigger: { type: 'string', description: '触发关键词' },
        description: { type: 'string', description: '技能描述' },
        fullyLoaded: { type: 'boolean', description: '是否已加载完整内容' },
      },
      skillDefinition: {
        capabilities: { type: 'array', items: 'string', description: '能力列表' },
        useCases: { type: 'array', items: 'string', description: '使用场景' },
        parameters: { type: 'object', description: '参数定义' },
        outputFormat: { type: 'string', description: '输出格式说明' },
        notes: { type: 'array', items: 'string', description: '注意事项' },
        fullDocumentation: { type: 'string', description: '完整文档' },
      },
    };

    sendJson(res, { schema });
  });

  // ==================== 日志 API ====================

  /**
   * GET /api/logs/stream - 获取实时日志流（SSE）
   */
  handlers.set('GET:/api/logs/stream', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      // 设置 SSE 响应头
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // 发送连接成功消息
      res.write('event: connected\ndata: {"status":"connected"}\n\n');

      // TODO: 实现实际的日志流
      // 这需要 tail -f 风格的日志文件监听
      const interval = setInterval(() => {
        res.write(`event: heartbeat\ndata: {"timestamp":${Date.now()}}\n\n`);
      }, 30000);

      req.on('close', () => {
        clearInterval(interval);
        logger.info('Log stream client disconnected');
      });

    } catch (error) {
      logger.error(`Failed to create log stream: ${error}`);
      if (!res.headersSent) {
        sendJson(res, { error: '创建日志流失败' }, 500);
      }
    }
  });

  /**
   * GET /api/logs/history - 获取历史日志
   */
  handlers.set('GET:/api/logs/history', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const level = url.searchParams.get('level') || 'info';
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      // TODO: 从日志文件读取历史日志
      // 目前返回模拟数据
      const logs = {
        entries: [],
        limit,
        offset,
        total: 0,
        level,
      };

      sendJson(res, { logs });
    } catch (error) {
      logger.error(`Failed to get log history: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '获取历史日志失败' }, 500);
    }
  });

  /**
   * GET /api/logs/levels - 可用的日志级别
   */
  handlers.set('GET:/api/logs/levels', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    const levels = [
      { value: 'trace', label: 'Trace', description: '最详细的日志信息' },
      { value: 'debug', label: 'Debug', description: '调试信息' },
      { value: 'info', label: 'Info', description: '一般信息' },
      { value: 'warn', label: 'Warning', description: '警告信息' },
      { value: 'error', label: 'Error', description: '错误信息' },
      { value: 'fatal', label: 'Fatal', description: '致命错误' },
    ];

    sendJson(res, { levels });
  });

  // ==================== 系统 API ====================

  /**
   * POST /api/system/export-config - 导出配置
   */
  handlers.set('POST:/api/system/export-config', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const { includeSecrets = false } = await getBody(req);
      const config = await configWriter.readConfig();

      // 遮罩敏感信息（如果不包含密钥）
      const exportData = includeSecrets ? config : configWriter.exportSafeConfig(config);

      // 设置下载响应头
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="config-export-${timestamp}.json"`);

      res.end(JSON.stringify(exportData, null, 2));
    } catch (error) {
      logger.error(`Failed to export config: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '导出配置失败' }, 500);
    }
  });

  /**
   * POST /api/system/import-config - 导入配置
   */
  handlers.set('POST:/api/system/import-config', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const { config, merge = true } = await getBody(req);

      if (!config) {
        sendJson(res, { error: '缺少配置数据' }, 400);
        return;
      }

      // 验证配置
      const validation = await configValidator.validateFull(config);
      if (!validation.validation.valid) {
        sendJson(res, { error: '配置验证失败', errors: validation.validation.errors }, 400);
        return;
      }

      // 合并或替换配置
      let finalConfig = config;
      if (merge) {
        const currentConfig = await configWriter.readConfig();
        finalConfig = { ...currentConfig, ...config };
      }

      await configWriter.writeConfig(finalConfig);

      logger.info('Config imported via Dashboard API');
      sendJson(res, { success: true, message: '配置导入成功，需要重启生效' });
    } catch (error) {
      logger.error(`Failed to import config: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '导入配置失败' }, 500);
    }
  });

  /**
   * GET /api/system/info - 获取系统信息（版本、环境等）
   */
  handlers.set('GET:/api/system/info', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      // 读取 package.json 获取版本信息
      const packagePath = resolve(process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const systemInfo = {
        version: packageJson.version,
        name: packageJson.name,
        description: packageJson.description,
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cwd: process.cwd(),
        },
        gateway: {
          host: context.config.gateway.host,
          port: context.config.gateway.port,
        },
        scheduler: context.scheduler ? {
          enabled: context.config.scheduler.enabled,
          maxConcurrentTasks: context.config.scheduler.maxConcurrentTasks,
        } : null,
      };

      sendJson(res, systemInfo);
    } catch (error) {
      logger.error(`Failed to get system info: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '获取系统信息失败' }, 500);
    }
  });

  /**
   * POST /api/system/validate - 验证配置完整性
   */
  handlers.set('POST:/api/system/validate', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    try {
      const validationResults = {
        config: null as any,
        paths: {} as any,
        agents: [] as any[],
        skills: null as any,
        overall: { valid: true, errors: [] as string[], warnings: [] as string[] },
      };

      // 验证配置
      const configValidation = await configValidator.validateFull(context.config);
      validationResults.config = configValidation.validation;
      validationResults.paths = configValidation.paths;

      if (!configValidation.validation.valid) {
        validationResults.overall.valid = false;
        validationResults.overall.errors.push(
          ...configValidation.validation.errors.map(e => `配置: ${e.field} - ${e.message}`)
        );
      }

      // 验证 Agent
      if (context.agentRegistry) {
        const agents = context.agentRegistry.getSummary();
        validationResults.agents = agents;

        if (agents.length === 0) {
          validationResults.overall.warnings.push('没有已注册的 Agent');
        }
      }

      // 验证技能
      if (context.skillLoader) {
        const skillStats = context.skillLoader.getStats();
        validationResults.skills = skillStats;

        if (skillStats.totalSkills === 0) {
          validationResults.overall.warnings.push('没有已加载的技能');
        }
      }

      sendJson(res, { validation: validationResults });
    } catch (error) {
      logger.error(`Failed to validate system: ${error}`);
      sendJson(res, { error: error instanceof Error ? error.message : '系统验证失败' }, 500);
    }
  });

  return handlers;
}
