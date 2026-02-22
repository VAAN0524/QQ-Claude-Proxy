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
import { Config } from '../config/schema.js';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { Scheduler } from '../scheduler/index.js';

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
 * Create API handlers map
 */
export function createApiHandlers(context: ApiHandlerContext): Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> {
  const handlers = new Map();

  /**
   * GET /api/stats - Get dashboard stats
   */
  handlers.set('/api/stats', async (req, res) => {
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
  handlers.set('/api/tasks', async (req, res) => {
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
  handlers.set('/api/tasks/current', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return;
    }

    const tasks = Array.from(context.dashboardState.tasks.values());
    const running = tasks.filter(t => t.status === 'running');
    sendJson(res, { tasks: running });
  });

  /**
   * GET/PUT /api/config - Get or update config
   */
  handlers.set('/api/config', async (req, res) => {
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
  });

  /**
   * POST /api/restart - Restart service
   */
  handlers.set('/api/restart', async (req, res) => {
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
  handlers.set('/api/tasks/clear', async (req, res) => {
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
  handlers.set('/api/scheduled-tasks', async (req, res) => {
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
  handlers.set('/api/scheduled-tasks', async (req, res) => {
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
  handlers.set('/api/scheduled-tasks/get', async (req, res) => {
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
  handlers.set('/api/scheduled-tasks/update', async (req, res) => {
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
  handlers.set('/api/scheduled-tasks/delete', async (req, res) => {
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
  handlers.set('/api/scheduled-tasks/pause', async (req, res) => {
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
  handlers.set('/api/scheduled-tasks/resume', async (req, res) => {
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
  handlers.set('/api/scheduled-tasks/execute', async (req, res) => {
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
   * GET /api/scheduled-tasks/stats - 获取定时任务统计
   */
  handlers.set('/api/scheduled-tasks/stats', async (req, res) => {
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
