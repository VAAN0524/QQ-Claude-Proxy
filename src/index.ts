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
import { promises as fsp } from 'fs';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 自重启函数
 * 等待新进程启动完成后再退出当前进程
 */
async function selfRestart(): Promise<void> {
  logger.info('[重启] 准备启动新进程...');

  try {
    if (process.platform === 'win32') {
      // Windows: 直接使用现有的 Start.bat 文件
      const projectDir = process.cwd();
      const startBat = path.join(projectDir, 'Start.bat');

      // 检查 Start.bat 是否存在
      if (!fs.existsSync(startBat)) {
        logger.error('[重启] Start.bat 文件不存在');
        process.exit(1);
        return;
      }

      logger.info('[重启] 使用 Start.bat 启动新窗口');

      // 正确的 Windows start 命令语法：
      // start "窗口标题" cmd /c 命令
      // 这会打开一个新窗口执行命令
      logger.info('[重启] 启动新进程...');

      const { spawn } = await import('child_process');

      // 使用 spawn 直接启动新进程，不打开新窗口
      // 这样可以更好地控制进程和错误处理
      const child = spawn('npm', ['run', 'dev'], {
        cwd: projectDir,
        stdio: 'ignore',  // 不继承 stdio，避免输出混乱
        detached: true,    // 独立进程组
        shell: true,       // 使用 shell 以支持 npm 命令
        env: { ...process.env },
      });

      child.once('spawn', () => {
        logger.info(`[重启] 新进程已启动 (PID: ${child.pid})`);
        // unref() 让父进程不等待子进程
        child.unref();
        // 退出当前进程
        process.exit(0);
      });

      child.once('error', (err) => {
        logger.error(`[重启] 启动失败: ${err.message}`);
        process.exit(1);
      });

    } else {
      // Unix/Linux/macOS: 使用 stdio: 'inherit' 实现无缝重启
      const child = spawn(process.execPath, [
        'node_modules/.bin/tsx',
        'watch',
        'src/index.ts'
      ], {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: { ...process.env, TSX_WATCH: '1' },
        detached: true,
      });

      child.once('spawn', () => {
        logger.info('[重启] 新进程已启动');
        child.unref();
        process.exit(0);
      });

      child.once('error', (err) => {
        logger.error(`[重启] 启动失败: ${err.message}`);
        process.exit(1);
      });
    }

  } catch (error) {
    logger.error(`[重启] 重启失败: ${error}`);
    process.exit(1);
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

/**
 * 预处理消息中的文件
 * 1. 下载附件到工作区
 * 2. 解析并保存嵌入在 content 中的图片 (file:// 协议)
 * 3. 返回更新后的 content 和 attachments
 */
async function preprocessFiles(
  content: string,
  attachments: Array<{ type: string; url: string; filename: string }> | undefined,
  workspacePath: string
): Promise<{ content: string; attachments: Array<{ type: 'image' | 'video' | 'audio' | 'file'; path: string; name: string }> }> {
  const processedAttachments: Array<{ type: 'image' | 'video' | 'audio' | 'file'; path: string; name: string }> = [];
  let processedContent = content;

  // 确保工作区存在
  await fsp.mkdir(workspacePath, { recursive: true });

  // 1. 处理附件数组中的文件
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      try {
        logger.info(`[文件预处理] 处理附件: ${att.filename || '(unnamed)'} (${att.type || 'unknown'})`);

        // 下载文件
        const response = await fetch(att.url);
        if (!response.ok) {
          throw new Error(`HTTP 错误: ${response.status}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());

        // 根据文件内容检测真实类型（magic bytes）
        const detectedType = detectFileTypeFromBuffer(buffer);

        // 尝试从文件名获取扩展名，如果失败则使用检测结果
        let ext = path.extname(att.filename || '');
        if (!ext) {
          ext = getFileExtension(att.type || '');
        }
        // 如果仍然没有有效的扩展名，使用检测到的类型
        if (!ext || ext === '.bin') {
          ext = detectedType.ext;
        }

        // 生成唯一的文件名（使用 hash 和日期时间）
        const hash = createHash('md5').update(att.url + Date.now()).digest('hex').substring(0, 8);
        // 添加日期时间字段：yyyyMMdd_HHmmss
        const now = new Date();
        const dateStr = now.getFullYear().toString() +
          (now.getMonth() + 1).toString().padStart(2, '0') +
          now.getDate().toString().padStart(2, '0') + '_' +
          now.getHours().toString().padStart(2, '0') +
          now.getMinutes().toString().padStart(2, '0') +
          now.getSeconds().toString().padStart(2, '0');
        const storedFileName = `qq_${hash}_${dateStr}${ext}`;
        const storedPath = path.join(workspacePath, storedFileName);

        await fsp.writeFile(storedPath, buffer);

        logger.info(`[文件预处理] 附件已保存: ${storedPath} (检测类型: ${detectedType.mime})`);

        // 使用检测到的类型或原始类型
        const fileType = (att.type || detectedType.type) as 'image' | 'video' | 'audio' | 'file';

        // 使用相对路径（从工作区开始的相对路径）
        processedAttachments.push({
          type: fileType,
          path: storedFileName,  // 相对于 workspace 的路径
          name: att.filename || storedFileName,
        });
      } catch (error) {
        logger.error(`[文件预处理] 附件处理失败: ${att.filename} - ${error}`);
        // 失败时保留原始 URL
        processedAttachments.push({
          type: 'file',
          path: att.url,
          name: att.filename || 'unknown',
        });
      }
    }
  }

  // 2. 解析并处理嵌入在 content 中的图片 (<img src="file://..." />)
  const embeddedImageRegex = /<img\s+src="file:\/\/([^"]+)"\s*\/?>/gi;
  const embeddedImages: Array<{ originalPath: string; storedFileName: string }> = [];

  let match;
  while ((match = embeddedImageRegex.exec(content)) !== null) {
    const originalPath = match[1];
    // Windows 路径处理
    const normalizedPath = originalPath.replace(/\\/g, '/');
    const originalFileName = normalizedPath.split('/').pop() || 'image';

    try {
      logger.info(`[文件预处理] 处理嵌入图片: ${originalFileName}`);

      // 生成唯一的文件名（添加日期时间）
      const ext = path.extname(originalFileName) || '.png';
      const hash = createHash('md5').update(originalPath + Date.now()).digest('hex').substring(0, 8);
      // 添加日期时间字段：yyyyMMdd_HHmmss
      const now = new Date();
      const dateStr = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') + '_' +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');
      const storedFileName = `embedded_${hash}_${dateStr}${ext}`;
      const storedPath = path.join(workspacePath, storedFileName);

      // 复制本地文件到工作区
      await fsp.copyFile(originalPath, storedPath);

      logger.info(`[文件预处理] 嵌入图片已保存: ${storedPath}`);

      embeddedImages.push({
        originalPath: originalPath,
        storedFileName: storedFileName,
      });

      // 添加到附件列表
      processedAttachments.push({
        type: 'image',
        path: storedFileName,
        name: originalFileName,
      });
    } catch (error) {
      logger.error(`[文件预处理] 嵌入图片处理失败: ${originalPath} - ${error}`);
    }
  }

  // 清理 content 中的嵌入图片标签
  if (embeddedImages.length > 0) {
    processedContent = content.replace(embeddedImageRegex, '').trim();
    // 如果清理后内容为空，添加默认提示
    if (!processedContent || processedContent.trim() === '') {
      processedContent = '请帮我查看这张图片';
    }
    logger.info(`[文件预处理] 清理后的 content: ${processedContent.substring(0, 50)}...`);
  }

  logger.info(`[文件预处理] 完成: ${processedAttachments.length} 个文件, ${embeddedImages.length} 个嵌入图片`);

  return {
    content: processedContent,
    attachments: processedAttachments,
  };
}

/**
 * 根据 MIME 类型获取文件扩展名
 */
function getFileExtension(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'application/pdf': '.pdf',
  };
  return mimeMap[mimeType] || '.bin';
}

/**
 * 根据文件内容（magic bytes）检测文件类型
 */
function detectFileTypeFromBuffer(buffer: Buffer): { ext: string; mime: string; type: 'image' | 'video' | 'audio' | 'file' } {
  // 检查常见的图片格式
  const magicBytes = buffer.subarray(0, Math.min(12, buffer.length));

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4E && magicBytes[3] === 0x47) {
    return { ext: '.png', mime: 'image/png', type: 'image' };
  }

  // JPEG: FF D8 FF
  if (magicBytes[0] === 0xFF && magicBytes[1] === 0xD8 && magicBytes[2] === 0xFF) {
    return { ext: '.jpg', mime: 'image/jpeg', type: 'image' };
  }

  // GIF: 47 49 46 38 (GIF8)
  if (magicBytes[0] === 0x47 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46 && magicBytes[3] === 0x38) {
    return { ext: '.gif', mime: 'image/gif', type: 'image' };
  }

  // WebP: 52 49 46 46 ... 57 57 41
  if (magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46 && magicBytes[3] === 0x46) {
    return { ext: '.webp', mime: 'image/webp', type: 'image' };
  }

  // BMP: 42 4D
  if (magicBytes[0] === 0x42 && magicBytes[1] === 0x4D) {
    return { ext: '.bmp', mime: 'image/bmp', type: 'image' };
  }

  // MP4: 检查 ftyp box (通常在文件开头附近)
  if (buffer.length > 12) {
    const str = buffer.toString('ascii', 4, 8);
    if (str === 'ftyp') {
      return { ext: '.mp4', mime: 'video/mp4', type: 'video' };
    }
  }

  // 默认返回未知文件类型
  return { ext: '.bin', mime: 'application/octet-stream', type: 'file' };
}

async function main(): Promise<void> {
  // 声明 shutdown 函数变量（在后面定义）
  let shutdown: (signal: string) => Promise<void>;

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

  logger.info('初始化 QQ Bot Channel...');
  const qqChannel = new QQBotChannel({
    appId: config.channels.qqbot.appId,
    appSecret: config.channels.qqbot.clientSecret,
    token: config.channels.qqbot.token,
    sandbox: config.channels.qqbot.sandbox,
  });

  // 初始化 Claude Code Agent (纯 CLI 模式)
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

  // 创建 Dashboard HTTP Server
  const httpServer = new HttpServer({
    port: 8080,
    host: '0.0.0.0',
    staticPath: publicPath,
    apiHandlers,
  });

  // 设置文件发送回调（CLI 模式）
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

        // 转换消息格式
        const qqData = data as any;
        const content = qqData.content;

        // 预处理文件：下载附件到工作区，解析嵌入图片
        logger.info(`[DEBUG] 准备调用 preprocessFiles: content="${content.substring(0, 30)}...", attachments=${qqData.attachments?.length || 0}`);
        const { content: processedContent, attachments: processedAttachments } = await preprocessFiles(
          content,
          qqData.attachments,
          workspacePath
        );
        logger.info(`[DEBUG] preprocessFiles 完成: processedAttachments.length=${processedAttachments.length}`);

        // 直接调用 Claude Code Agent 处理消息
        logger.info('[消息处理] 调用 Claude Code Agent...');
        const response = await agent.process({
          channel: 'qqbot',
          userId: qqData.userId,
          groupId: qqData.groupId,
          content: processedContent,
          attachments: processedAttachments,
          timestamp: new Date(),
          rawData: data,
        }, {
          workspacePath,
          storagePath,
          allowedUsers: config.agent.allowedUsers || [],
        });

        // 检查响应是否有效
        if (!response) {
          logger.error('[消息处理] Agent 返回了 null 响应');
          await qqChannel.send({
            userId: qqData.userId,
            groupId: qqData.groupId,
            content: '处理消息时发生错误：Agent 返回空响应',
          });
          return;
        }

        logger.info(`[消息处理] Agent 处理完成`);

        // 转换回原有响应格式
        const legacyResponse = {
          userId: response.userId || qqData.userId,
          groupId: response.groupId || qqData.groupId,
          msgId: response.msgId,
          content: response.content,
          filesToSend: response.filesToSend,
        };

        logger.info(`[消息处理] 准备发送响应: userId=${legacyResponse.userId}, content=${legacyResponse.content.substring(0, 50)}...`);
        await qqChannel.send(legacyResponse);
        logger.info(`[消息处理] 响应已发送`);

        // 处理文件发送（私聊和群聊都支持）
        if (legacyResponse.filesToSend && legacyResponse.filesToSend.length > 0) {
          logger.info(`[文件发送] 检测到 ${legacyResponse.filesToSend.length} 个待发送文件`);

          const targetId = legacyResponse.groupId || legacyResponse.userId;

          // 确保 targetId 存在
          if (targetId) {
            const isGroup = !!legacyResponse.groupId;
            logger.info(`[文件发送] 目标: ${targetId}, 是否群聊: ${isGroup}`);

            for (const filePath of legacyResponse.filesToSend) {
              try {
                logger.info(`[文件发送] 开始发送: ${filePath}`);
                await qqChannel.sendFile(targetId, filePath, isGroup);
                logger.info(`[文件发送] 成功: ${filePath} -> ${targetId}`);
              } catch (error) {
                logger.error(`[文件发送] 失败: ${filePath}, 错误: ${error}`);
              }
            }
          } else {
            logger.warn(`[文件发送] 无效的 targetId`);
          }
        } else {
          logger.debug(`[文件发送] 无待发送文件`);
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
  shutdown = async (signal: string) => {
    logger.info(`收到 ${signal} 信号，正在关闭...`);

    // 创建超时保护机制
    const SHUTDOWN_TIMEOUT = 15000; // 15秒超时
    let shutdownCompleted = false;

    // 设置超时定时器
    const timeoutHandle = setTimeout(() => {
      if (!shutdownCompleted) {
        logger.error(`关闭超时 (${SHUTDOWN_TIMEOUT}ms)，强制退出`);
        process.exit(1);
      }
    }, SHUTDOWN_TIMEOUT);

    try {
      // 停止调度器（带超时）
      if (scheduler) {
        logger.info('停止定时任务调度器...');
        await Promise.race([
          scheduler.stop(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('调度器停止超时')), 5000)
          )
        ]).catch(err => logger.warn(`调度器停止警告: ${err.message}`));
      }

      // 保存最终状态（带超时）
      await Promise.race([
        stateStore.destroy(dashboardState),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('状态保存超时')), 3000)
        )
      ]).catch(err => logger.warn(`状态保存警告: ${err.message}`));
      logger.info('Dashboard 状态已保存');

      // 停止服务（带超时）
      await Promise.race([
        Promise.all([
          qqChannel.stop(),
          gateway.stop(),
          httpServer.stop(),
        ]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('服务停止超时')), 5000)
        )
      ]).catch(err => logger.warn(`服务停止警告: ${err.message}`));

      logger.info('服务已关闭');
    } catch (error) {
      logger.error(`关闭时发生错误: ${error}`);
    }

    // 清除超时定时器
    clearTimeout(timeoutHandle);
    shutdownCompleted = true;

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
