/**
 * QQ-Claude-Proxy 主入口
 * 通过 QQ 远程控制本地 Claude Code CLI
 */

import { Gateway } from './gateway/server.js';
import { QQBotChannel } from './channels/qqbot/index.js';
import { ClaudeCodeAgent } from './agent/index.js';
import { loadConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { HttpServer } from './gateway/http-server.js';
import { createApiHandlers, createDashboardState, type DashboardState } from './gateway/dashboard-api.js';
import { createDashboardStateStore, type DashboardStateStore } from './gateway/dashboard-state-store.js';
import { createScheduler, type Scheduler } from './scheduler/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 自重启函数
 * 等待新进程启动完成后再退出当前进程
 */
async function selfRestart(): Promise<void> {
  const args = process.argv.slice(1);

  // 检测运行环境
  const isDev = process.env.TSX_WATCH !== undefined || args.some(a => a.includes('tsx'));

  logger.info('[重启] 准备启动新进程...');

  try {
    if (isDev) {
      // 开发模式：使用 tsx watch
      logger.info('[重启] 开发模式: tsx watch src/index.ts');
      const child = spawn(process.execPath, ['node_modules/.bin/tsx', 'watch', 'src/index.ts', ...args], {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: { ...process.env, TSX_WATCH: '1' },
        // 不使用 detached，保持父子关系
      });

      // 等待进程启动
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('进程启动超时')), 10000);

        child.once('spawn', () => {
          clearTimeout(timeout);
          logger.info(`[重启] 新进程已启动 (PID: ${child.pid})`);
          resolve();
        });

        child.once('error', (err) => {
          clearTimeout(timeout);
          reject(new Error(`进程启动失败: ${err.message}`));
        });
      });

      // 等待新进程初始化（绑定端口等）
      logger.info('[重启] 等待新进程初始化...');
      await new Promise(resolve => setTimeout(resolve, 3000));

    } else {
      // 生产模式：使用编译后的文件
      logger.info('[重启] 生产模式: node dist/index.js');
      const child = spawn(process.execPath, ['dist/index.js', ...args], {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: process.env,
        // 不使用 detached，保持父子关系
      });

      // 等待进程启动
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('进程启动超时')), 10000);

        child.once('spawn', () => {
          clearTimeout(timeout);
          logger.info(`[重启] 新进程已启动 (PID: ${child.pid})`);
          resolve();
        });

        child.once('error', (err) => {
          clearTimeout(timeout);
          reject(new Error(`进程启动失败: ${err.message}`));
        });
      });

      // 等待新进程初始化（绑定端口等）
      logger.info('[重启] 等待新进程初始化...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    logger.info('[重启] 新进程已就绪，退出当前进程');
    // 新进程会自动清理旧进程占用的端口（通过 killPort）
    process.exit(0);

  } catch (error) {
    logger.error(`[重启] 重启失败: ${error}`);
    // 重启失败，保持当前进程运行
    throw error;
  }
}

/**
 * 清理指定端口上的进程
 */
async function killPort(port: number): Promise<void> {
  try {
    // Windows: 使用 netstat 和 taskkill
    if (process.platform === 'win32') {
      const result = execSync(
        `netstat -ano | findstr :${port}`,
        { encoding: 'utf-8' }
      );

      const lines = result.trim().split('\n');
      const pids = new Set<string>();

      for (const line of lines) {
        // 解析 netstat 输出，提取 PID (最后一列)
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1]?.includes(`:${port}`) && parts[0] === 'TCP') {
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            pids.add(pid);
          }
        }
      }

      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          logger.info(`[启动] 已终止端口 ${port} 上的进程 PID: ${pid}`);
        } catch {
          // 进程可能已经终止
        }
      }
    } else {
      // Linux/Mac: 使用 lsof
      try {
        const result = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' });
        const pids = result.trim().split('\n').filter(Boolean);

        for (const pid of pids) {
          try {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
            logger.info(`[启动] 已终止端口 ${port} 上的进程 PID: ${pid}`);
          } catch {
            // 进程可能已经终止
          }
        }
      } catch {
        // 端口没有被占用
      }
    }

    // 等待端口释放
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch {
    // 端口没有被占用或命令失败，忽略
  }
}

async function main(): Promise<void> {
  // 自动清理可能被占用的端口
  logger.info('[启动] 检查并清理端口占用...');
  await killPort(18789);
  await killPort(8080);

  const config = loadConfig();

  logger.info('========================================');
  logger.info('  QQ-Claude-Proxy 正在启动...');
  logger.info('  (Claude Code CLI 模式)');
  logger.info('========================================');

  // 检查必要配置
  if (!config.channels.qqbot.appId || !config.channels.qqbot.clientSecret) {
    logger.error('错误: QQ Bot 凭证未配置');
    logger.error('请设置 QQ_BOT_APP_ID 和 QQ_BOT_SECRET 环境变量');
    logger.error('或在 config.json 中配置 channels.qqbot');
    process.exit(1);
  }

  // 检查 Claude Code CLI 是否可用
  const { execSync } = await import('child_process');
  try {
    execSync('claude --version', { stdio: 'ignore' });
    logger.info('Claude Code CLI 已就绪');
  } catch {
    logger.warn('警告: Claude Code CLI 未安装或不在 PATH 中');
    logger.warn('请先安装: npm install -g @anthropic-ai/claude-code');
  }

  // 设置工作目录
  const workspacePath = path.resolve(config.storage.downloadPath);
  const storagePath = path.resolve(config.storage.uploadPath);

  // 确保目录存在
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
    logger.info(`创建工作目录: ${workspacePath}`);
  }

  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
    logger.info(`创建存储目录: ${storagePath}`);
  }

  // 初始化 Dashboard 状态
  const dashboardState: DashboardState = createDashboardState();

  // 初始化持久化存储
  logger.info('初始化 Dashboard 状态持久化存储...');
  const stateStore: DashboardStateStore = createDashboardStateStore({
    storagePath: storagePath,
    enableAutoSnapshot: true,
    autoSnapshotInterval: 60000, // 1 分钟自动快照
  });

  // 加载历史状态
  await stateStore.initialize(dashboardState);

  // 初始化组件
  logger.info('初始化 Gateway...');
  const gateway = new Gateway({
    port: config.gateway.port,
    host: config.gateway.host,
  });

  // 初始化定时任务调度器
  let scheduler: Scheduler | null = null;
  if (config.scheduler.enabled) {
    logger.info('初始化定时任务调度器...');

    // 确保调度器目录存在
    const schedulerStoragePath = path.resolve(config.scheduler.storagePath);
    const schedulerResultDir = path.resolve(config.scheduler.resultDir);
    if (!fs.existsSync(schedulerStoragePath)) {
      fs.mkdirSync(schedulerStoragePath, { recursive: true });
    }
    if (!fs.existsSync(schedulerResultDir)) {
      fs.mkdirSync(schedulerResultDir, { recursive: true });
    }

    scheduler = createScheduler({
      ...config.scheduler,
      sendMessageCallback: async (userId: string, content: string, groupId?: string) => {
        try {
          await qqChannel.send({
            userId,
            groupId,
            content,
          });
          logger.info(`[Scheduler] QQ通知已发送: userId=${userId}, groupId=${groupId || 'none'}`);
        } catch (error) {
          logger.error(`[Scheduler] 发送QQ通知失败: ${error}`);
        }
      },
    });

    await scheduler.start();
  }

  logger.info('初始化 Dashboard API...');
  const apiHandlers = createApiHandlers({
    config,
    dashboardState,
    restartCallback: async () => {
      logger.info('Dashboard 请求重启服务...');
      await shutdown('RESTART');
    },
    scheduler: scheduler || undefined,
  });

  // Dashboard 静态文件路径
  const publicPath = path.resolve(__dirname, '../public/dashboard');

  logger.info('初始化 HTTP Dashboard 服务器...');
  const httpServer = new HttpServer({
    port: 8080,
    host: '0.0.0.0',
    staticPath: publicPath,
    apiHandlers,
  });

  logger.info('初始化 QQ Bot Channel...');
  const qqChannel = new QQBotChannel({
    appId: config.channels.qqbot.appId,
    appSecret: config.channels.qqbot.clientSecret,
    token: config.channels.qqbot.token,
    sandbox: config.channels.qqbot.sandbox,
  });

  logger.info('初始化 Claude Code Agent...');
  logger.info(`工作目录: ${workspacePath}`);
  logger.info(`存储目录: ${storagePath}`);

  const agent = new ClaudeCodeAgent({
    workspacePath,
    storagePath,
    allowedUsers: config.agent.allowedUsers,
    dashboardState,
    stateStore,
  });

  // 设置文件发送回调
  agent.setSendFileCallback(async (userId: string, filePath: string, groupId?: string) => {
    const fileName = path.basename(filePath);
    const targetId = groupId || userId;
    logger.info(`[SendFileCallback] Starting file send: ${filePath} -> ${targetId}`);
    try {
      await qqChannel.sendFile(targetId, filePath, !!groupId, fileName);
      logger.info(`[SendFileCallback] File sent successfully: ${filePath}`);
    } catch (error) {
      logger.error(`[SendFileCallback] File send FAILED: ${error}`);
      throw error;  // 向上抛出错误，让外层知道发送失败
    }
  });

  // 设置实时消息发送回调（用于任务进度更新）
  agent.setSendMessageCallback(async (userId: string, content: string, groupId?: string) => {
    try {
      await qqChannel.send({
        userId,
        groupId,
        content,
      });
      logger.info(`进度消息已发送: userId=${userId}, groupId=${groupId || 'none'}`);
    } catch (error) {
      logger.error(`发送进度消息失败: ${error}`);
    }
  });

  // 启动 Gateway
  logger.info(`启动 Gateway 于 ${config.gateway.host}:${config.gateway.port}...`);
  await gateway.start();

  // 启动 HTTP Dashboard 服务器
  logger.info(`启动 HTTP Dashboard 服务器于 0.0.0.0:8080...`);
  await httpServer.start();

  // 注册 Channel 和 Agent
  qqChannel.setGateway(gateway);
  agent.setGateway(gateway);

  // 清理僵尸任务（启动时）
  logger.info('清理僵尸任务...');
  const zombieCount = agent.cleanupZombieTasks();
  if (zombieCount > 0) {
    logger.info(`已清理 ${zombieCount} 个僵尸任务`);
  } else {
    logger.info('无僵尸任务需要清理');
  }

  // 设置定期清理僵尸任务（每 5 分钟）
  setInterval(() => {
    const count = agent.cleanupZombieTasks();
    if (count > 0) {
      logger.info(`定期清理: 清理了 ${count} 个僵尸任务`);
    }
  }, 5 * 60 * 1000);

  // 设置事件处理
  const router = gateway.getRouter();

  router.onEvent('qqbot', async (eventType: string, data: unknown, context: any) => {
    logger.info(`[DIAG] 收到事件: ${eventType}`);
    if (eventType === 'message' || eventType === 'group_message') {
      try {
        logger.info(`[DIAG] 开始处理消息...`);
        const response = await agent.process({
          type: 'event',
          channel: 'qqbot',
          event: eventType,
          data,
        });

        logger.info(`[DIAG] Agent 处理完成, response: ${response ? '存在' : 'null'}`);
        if (response) {
          logger.info(`[DIAG] 准备发送响应: userId=${response.userId}, content=${response.content.substring(0, 50)}...`);
          await qqChannel.send(response);
          logger.info(`[DIAG] 响应已发送`);

          // 处理文件发送（私聊和群聊都支持）
          if (response.filesToSend && response.filesToSend.length > 0) {
            const targetId = response.groupId || response.userId;

            // 确保 targetId 存在
            if (targetId) {
              const isGroup = !!response.groupId;

              for (const filePath of response.filesToSend) {
                try {
                  await qqChannel.sendFile(targetId, filePath, isGroup);
                  logger.info(`自动发送文件: ${filePath} -> ${targetId}`);
                } catch (error) {
                  logger.error(`自动发送文件失败: ${error}`);
                }
              }
            }
          }
        }
      } catch (error) {
        logger.error(`处理消息失败: ${error}`);
        await qqChannel.send({
          userId: (data as any).userId,
          groupId: (data as any).groupId,
          content: '处理消息时发生错误，请稍后重试。',
        });
      }
    }
  });

  // 启动 QQ Bot Channel
  logger.info('连接 QQ Bot Gateway...');
  await qqChannel.start();

  // 优雅退出
  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal} 信号，正在关闭...`);

    try {
      // 停止调度器
      if (scheduler) {
        logger.info('停止定时任务调度器...');
        await scheduler.stop();
      }

      // 保存最终状态
      await stateStore.destroy(dashboardState);
      logger.info('Dashboard 状态已保存');

      await qqChannel.stop();
      await gateway.stop();
      await httpServer.stop();
      logger.info('服务已关闭');
    } catch (error) {
      logger.error(`关闭时发生错误: ${error}`);
    }

    // 如果是重启请求，启动新进程后退出
    if (signal === 'RESTART') {
      await selfRestart();
      // selfRestart 内部会调用 process.exit(0)
      // 这里不应该执行到
    } else {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  logger.info('========================================');
  logger.info('  QQ-Claude-Proxy 启动成功!');
  logger.info('========================================');
  logger.info(`  Gateway: ${config.gateway.host}:${config.gateway.port}`);
  logger.info(`  Dashboard: http://localhost:8080`);
  logger.info(`  QQ Bot: ${qqChannel.isConnected() ? '已连接' : '连接中...'}`);
  logger.info(`  工作目录: ${workspacePath}`);
  logger.info(`  存储目录: ${storagePath}`);
  if (config.agent.allowedUsers && config.agent.allowedUsers.length > 0) {
    logger.info(`  允许用户: ${config.agent.allowedUsers.join(', ')}`);
  }
  if (scheduler) {
    const stats = scheduler.getStatistics();
    logger.info(`  定时任务: ${stats.totalTasks} 个任务 (周期: ${stats.periodicTasks}, 定时: ${stats.scheduledTasks})`);
  }
  logger.info('========================================');
  logger.info('');
  logger.info('使用方式:');
  logger.info('  1. 发送文本消息 -> Claude Code CLI 执行');
  logger.info('  2. 发送图片/文件 -> 自动保存到存储目录，路径传给 Claude');
  logger.info('  3. 说"把 xxx 文件发给我" -> 发送生成的文件');
  logger.info('  4. 说"列出文件" -> 查看工作区文件');
  logger.info('');
  logger.info('Dashboard: http://localhost:8080');
  logger.info('等待 QQ 消息...');
}

// 启动应用
main().catch((error) => {
  logger.error(`启动失败: ${error}`);
  process.exit(1);
});
