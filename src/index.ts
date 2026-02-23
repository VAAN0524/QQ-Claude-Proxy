/**
 * QQ-Claude-Proxy 主入口
 * 通过 QQ 远程控制本地 Claude Code CLI
 */

import { Gateway } from './gateway/server.js';
import { QQBotChannel } from './channels/qqbot/index.js';
import { ClaudeCodeAgent } from './agent/index.js';
import { loadConfig } from './config/index.js';
import { modeManager, AgentMode } from './agents/ModeManager.js';
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

// Agent 系统导入
import {
  AgentRegistry,
  AgentDispatcher,
  CodeAgent,
  BrowserAgent,
  ShellAgent,
  CoordinatorAgent,
  GLMCoordinatorAgent,
  SharedContext,
  MemoryService,
  RAGService,
  type IAgent,
  type AgentMessage,
  type AgentContext,
  type AgentResponse,
} from './agents/index.js';

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

  // ========== Agent 系统 ==========
  // 初始化共享上下文
  logger.info('初始化共享上下文...');
  const sharedContext = new SharedContext({
    maxMessages: 100,
    maxAge: 60 * 60 * 1000, // 1 小时
  });

  // 初始化 Agent Registry
  logger.info('初始化 Agent 系统...');
  const agentRegistry = new AgentRegistry();

  // 注册 Claude Code Agent (作为备用 Agent)
  agentRegistry.register(agent);

  // 初始化并注册内置 Agent
  const apiKeys = {
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    glm: process.env.GLM_API_KEY || '',
    glmBaseUrl: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/',
  };

  // Code Agent（如果有 GLM API Key，可以不依赖 Anthropic）
  if (config.agents.code.enabled && (apiKeys.anthropic || apiKeys.glm)) {
    try {
      const codeAgent = new CodeAgent({
        apiKey: apiKeys.anthropic,
        glmApiKey: !apiKeys.anthropic ? apiKeys.glm : undefined,
        glmBaseUrl: !apiKeys.anthropic ? apiKeys.glmBaseUrl : undefined,
        model: (config.agents.code.options as any)?.model || 'claude-3-5-sonnet-20241022',
        maxTokens: (config.agents.code.options as any)?.maxTokens || 4096,
      });
      await codeAgent.initialize?.();
      agentRegistry.register(codeAgent);
      logger.info('[Agent 系统] Code Agent 已启用');
    } catch (error) {
      logger.warn(`[Agent 系统] Code Agent 初始化失败: ${error}`);
    }
  }

  // Browser Agent
  if (config.agents.browser.enabled) {
    try {
      const browserAgent = new BrowserAgent({
        headless: (config.agents.browser.options as any)?.headless ?? true,
        timeout: (config.agents.browser.options as any)?.timeout ?? 30000,
      });
      await browserAgent.initialize?.();
      agentRegistry.register(browserAgent);
      logger.info('[Agent 系统] Browser Agent 已启用');
    } catch (error) {
      logger.warn(`[Agent 系统] Browser Agent 初始化失败: ${error}`);
    }
  }

  // Shell Agent
  if (config.agents.shell.enabled) {
    try {
      const shellAgent = new ShellAgent({
        allowedCommands: (config.agents.shell.options as any)?.allowedCommands || [],
        blockedCommands: (config.agents.shell.options as any)?.blockedCommands || [],
        cwd: workspacePath,
        timeout: config.agents.shell.timeout,
      });
      await shellAgent.initialize?.();
      agentRegistry.register(shellAgent);
      logger.info('[Agent 系统] Shell Agent 已启用');
    } catch (error) {
      logger.warn(`[Agent 系统] Shell Agent 初始化失败: ${error}`);
    }
  }

  // Web Search Agent
  if (config.agents.websearch?.enabled) {
    try {
      const { WebSearchAgent } = await import('./agents/WebSearchAgent.js');
      const webSearchAgent = new WebSearchAgent({
        maxResults: (config.agents.websearch.options as any)?.maxResults || 10,
        timeout: config.agents.websearch.timeout,
      });
      await webSearchAgent.initialize?.();
      agentRegistry.register(webSearchAgent);
      logger.info('[Agent 系统] Web Search Agent 已启用');
    } catch (error) {
      logger.warn(`[Agent 系统] Web Search Agent 初始化失败: ${error}`);
    }
  }

  // Data Analysis Agent
  if (config.agents.data?.enabled) {
    try {
      const { DataAnalysisAgent } = await import('./agents/DataAnalysisAgent.js');
      const dataAnalysisAgent = new DataAnalysisAgent({
        supportedFileTypes: (config.agents.data.options as any)?.supportedFileTypes || ['.csv', '.json', '.txt'],
        maxFileSize: (config.agents.data.options as any)?.maxFileSize || 10,
      });
      await dataAnalysisAgent.initialize?.();
      agentRegistry.register(dataAnalysisAgent);
      logger.info('[Agent 系统] Data Analysis Agent 已启用');
    } catch (error) {
      logger.warn(`[Agent 系统] Data Analysis Agent 初始化失败: ${error}`);
    }
  }

  // Vision Agent (图像理解) - 使用官方 MCP Server
  if (config.agents.vision?.enabled ?? true) {
    try {
      const { VisionAgent } = await import('./agents/VisionAgent.js');
      const visionAgent = new VisionAgent({
        apiKey: apiKeys.glm,
        mode: 'ZHIPU', // 或 'ZAI'
        autoConnect: true,
      });
      await visionAgent.initialize();
      agentRegistry.register(visionAgent);
      logger.info('[Agent 系统] Vision Agent 已启用 (官方 MCP Server)');
    } catch (error) {
      logger.warn(`[Agent 系统] Vision Agent 初始化失败: ${error}`);
    }
  }

  // 初始化 Coordinator Agent 或 Agent Dispatcher
  let coordinatorAgent: CoordinatorAgent | GLMCoordinatorAgent | null = null;
  let agentDispatcher: AgentDispatcher | null = null;

  if (config.agents.useCoordinator && config.agents.coordinator.enabled) {
    // 使用协作式 Coordinator Agent
    logger.info('[Agent 系统] 尝试初始化 Coordinator Agent...');
    logger.info(`[Agent 系统] useCoordinator = ${config.agents.useCoordinator}`);
    logger.info(`[Agent 系统] coordinator.enabled = ${config.agents.coordinator.enabled}`);
    logger.info(`[Agent 系统] GLM_API_KEY 存在 = ${!!apiKeys.glm}`);
    logger.info(`[Agent 系统] ANTHROPIC_API_KEY 存在 = ${!!apiKeys.anthropic}`);

    try {
      const subAgentMap = new Map<string, IAgent>();

      // 添加已启用的子 Agent
      if (config.agents.coordinator.subAgents.code && agentRegistry.get('code')) {
        subAgentMap.set('code', agentRegistry.get('code')!);
      }
      if (config.agents.coordinator.subAgents.browser && agentRegistry.get('browser')) {
        subAgentMap.set('browser', agentRegistry.get('browser')!);
      }
      if (config.agents.coordinator.subAgents.shell && agentRegistry.get('shell')) {
        subAgentMap.set('shell', agentRegistry.get('shell')!);
      }
      // 添加 Vision Agent
      if (agentRegistry.get('vision')) {
        subAgentMap.set('vision', agentRegistry.get('vision')!);
      }
      // 添加 Web Search Agent
      if (agentRegistry.get('websearch')) {
        subAgentMap.set('websearch', agentRegistry.get('websearch')!);
      }
      // 添加 Data Analysis Agent
      if (agentRegistry.get('data')) {
        subAgentMap.set('data', agentRegistry.get('data')!);
      }

      // 优先使用 GLM API Key，否则使用 Anthropic
      if (apiKeys.glm) {
        logger.info('[Agent 系统] 使用 GLM API Key 初始化 GLMCoordinatorAgent...');

        // 初始化记忆服务
        const memoryService = new MemoryService({
          storagePath: path.join(process.cwd(), 'data', 'memory'),
          autoCleanup: true,
          retentionTime: 30 * 24 * 60 * 60 * 1000, // 30 天
        });
        await memoryService.initialize();

        // 初始化 RAG 服务
        const ragService = new RAGService({
          memoryService,
          defaultMaxResults: 10,
          defaultMinScore: 0.3,
        });

        // 获取 WebSearchAgent（如果有的话）
        const webSearchAgent = agentRegistry.get('websearch');

        // 初始化学习模块
        const { LearningModule } = await import('./agents/learning/index.js');
        const learningModule = new LearningModule({
          memoryService,
          webSearchAgent,
          maxResults: 5,
          knowledgeRetentionTime: 90 * 24 * 60 * 60 * 1000, // 90 天
        });

        coordinatorAgent = new GLMCoordinatorAgent({
          apiKey: apiKeys.glm,
          baseUrl: apiKeys.glmBaseUrl,
          model: 'glm-4.7', // Z.AI Coding Plan 模型名
          maxTokens: config.agents.coordinator.maxTokens,
          sharedContext,
          subAgents: subAgentMap,
          memoryService,
          ragService,
          learningModule,
          enableMemory: true,
          enableLearning: true,
        });

        await coordinatorAgent.initialize?.();
        logger.info('[Agent 系统] GLM Coordinator Agent 已启用 (协作模式 + 记忆服务 + 自主学习)');
      } else if (apiKeys.anthropic) {
        logger.info('[Agent 系统] 使用 Anthropic API Key 初始化 CoordinatorAgent...');
        coordinatorAgent = new CoordinatorAgent({
          apiKey: apiKeys.anthropic,
          model: config.agents.coordinator.model,
          maxTokens: config.agents.coordinator.maxTokens,
          sharedContext,
          subAgents: subAgentMap,
        });

        await coordinatorAgent.initialize?.();
        logger.info('[Agent 系统] Anthropic Coordinator Agent 已启用 (协作模式)');
      } else {
        logger.warn('[Agent 系统] 未配置 API Key (GLM_API_KEY 或 ANTHROPIC_API_KEY)，无法启用 Coordinator Agent');
      }

      if (coordinatorAgent) {
        logger.info(`[Agent 系统] 子 Agent 数量: ${subAgentMap.size}`);
      }
    } catch (error) {
      logger.error(`[Agent 系统] Coordinator Agent 初始化失败: ${error}`);
      logger.error(`[Agent 系统] 错误详情: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        logger.error(`[Agent 系统] 错误堆栈: ${error.stack}`);
      }
      logger.warn('[Agent 系统] 回退到 Dispatcher 模式');
      coordinatorAgent = null;
    }
  } else {
    logger.info('[Agent 系统] Coordinator 模式未启用，使用 Dispatcher 模式');
  }

  // 始终创建 Agent Dispatcher（CLI 模式需要使用）
  agentDispatcher = new AgentDispatcher(agentRegistry, agent);
  logger.info('[Agent 系统] Agent Dispatcher 已创建 (CLI 模式使用)');

  logger.info(`[Agent 系统] 已注册 ${agentRegistry.size} 个 Agent`);
  logger.info(`[Agent 系统] 默认 Agent: ${config.agents.default}`);
  // ===============================

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

        // 转换消息格式
        const qqData = data as any;
        const content = qqData.content;

        // 检查模式切换命令
        const modeResponse = await modeManager.handleModeCommand(content, qqData.userId, qqData.groupId);
        if (modeResponse) {
          await qqChannel.send({
            userId: qqData.userId,
            groupId: qqData.groupId,
            content: modeResponse.message,
          });
          return;
        }

        // 检查帮助命令
        if (content === '/mode' || content === '/模式' || content === '/help' || content === '/帮助') {
          await qqChannel.send({
            userId: qqData.userId,
            groupId: qqData.groupId,
            content: modeManager.getModeHelp(),
          });
          return;
        }

        // 预处理文件：下载附件到工作区，解析嵌入图片
        logger.info(`[DEBUG] 准备调用 preprocessFiles: content="${content.substring(0, 30)}...", attachments=${qqData.attachments?.length || 0}`);
        const { content: processedContent, attachments: processedAttachments } = await preprocessFiles(
          content,
          qqData.attachments,
          workspacePath
        );
        logger.info(`[DEBUG] preprocessFiles 完成: processedAttachments.length=${processedAttachments.length}`);

        const agentMessage: AgentMessage = {
          channel: 'qqbot',
          userId: qqData.userId,
          groupId: qqData.groupId,
          content: processedContent,
          attachments: processedAttachments,
          timestamp: new Date(),
          rawData: data,
        };

        const agentContext: AgentContext = {
          workspacePath,
          storagePath,
          allowedUsers: config.agent.allowedUsers || [],
        };

        // 根据用户模式选择处理方式
        const userMode = modeManager.getUserMode(qqData.userId, qqData.groupId);
        let response: AgentResponse | null = null;

        logger.info(`[模式检查] 用户模式: ${userMode}, coordinatorAgent 存在: ${!!coordinatorAgent}`);

        if (userMode === AgentMode.TEAM && coordinatorAgent) {
          // 团队模式：使用 GLM Coordinator
          logger.info(`[模式] 使用团队模式 (GLM Coordinator)`);
          response = await coordinatorAgent.process(agentMessage, agentContext);
        } else {
          // CLI 模式：使用 Agent Dispatcher (默认路由到 Claude Code CLI)
          if (userMode !== AgentMode.TEAM) {
            logger.info(`[模式] 使用 CLI 模式 (用户未切换到团队模式，发送 /mode team 切换)`);
          } else if (!coordinatorAgent) {
            logger.warn(`[模式] 用户请求团队模式，但 coordinatorAgent 未初始化，回退到 CLI 模式`);
          }
          response = await agentDispatcher!.dispatch(agentMessage, agentContext);
        }

        // 检查响应是否有效
        if (!response) {
          logger.error('[DIAG] Agent 返回了 null 响应');
          await qqChannel.send({
            userId: qqData.userId,
            groupId: qqData.groupId,
            content: '处理消息时发生错误：Agent 返回空响应',
          });
          return;
        }

        logger.info(`[DIAG] Agent 处理完成, agentId=${response.agentId || 'claude'}`);

        // 添加模式前缀到响应内容
        const modePrefix = modeManager.getModePrefix(qqData.userId, qqData.groupId);
        const prefixedContent = `${modePrefix} ${response.content}`;

        // 转换回原有响应格式
        const legacyResponse = {
          userId: response.userId || qqData.userId,
          groupId: response.groupId || qqData.groupId,
          msgId: response.msgId,
          content: prefixedContent,
          filesToSend: response.filesToSend,
        };

        logger.info(`[DIAG] 准备发送响应: userId=${legacyResponse.userId}, mode=${modePrefix}, content=${legacyResponse.content.substring(0, 50)}...`);
        await qqChannel.send(legacyResponse);
        logger.info(`[DIAG] 响应已发送`);

        // 处理文件发送（私聊和群聊都支持）
        if (legacyResponse.filesToSend && legacyResponse.filesToSend.length > 0) {
          const targetId = legacyResponse.groupId || legacyResponse.userId;

          // 确保 targetId 存在
          if (targetId) {
            const isGroup = !!legacyResponse.groupId;

            for (const filePath of legacyResponse.filesToSend) {
              try {
                await qqChannel.sendFile(targetId, filePath, isGroup);
                logger.info(`自动发送文件: ${filePath} -> ${targetId}`);
              } catch (error) {
                logger.error(`自动发送文件失败: ${error}`);
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
