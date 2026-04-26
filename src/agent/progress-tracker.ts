/**
 * Progress Tracker - 智能进度追踪器
 *
 * 功能：
 * 1. 接收 CLI 流式输出
 * 2. 智能检测关键状态变化
 * 3. 节流控制发送频率
 * 4. 内容优化和去重
 * 5. VSCode 风格进度展示
 */

import { logger } from '../utils/logger.js';
import type { DashboardState, TaskInfo } from '../gateway/dashboard-api.js';
import type { DashboardStateStore } from '../gateway/dashboard-state-store.js';
import { ProgressFormatter } from './progress-formatter.js';

/**
 * 进度事件类型
 */
export enum ProgressEventType {
  /** 普通进度更新 */
  UPDATE = 'update',
  /** 关键状态变化 */
  MILESTONE = 'milestone',
  /** 错误/警告 */
  ERROR = 'error',
  /** 任务完成 */
  COMPLETE = 'complete',
}

/**
 * 进度追踪器配置
 */
export interface ProgressTrackerOptions {
  /** 节流间隔 (ms)，默认 5000 (5秒) */
  throttleInterval?: number;
  /** 智能触发最小间隔 (ms)，默认 2000 (2秒) */
  smartTriggerInterval?: number;
  /** QQ 消息最大长度 */
  maxMessageLength?: number;
  /** 发送回调 */
  sendCallback: (userId: string, content: string, groupId?: string) => Promise<void>;
  /** Dashboard 状态 (可选) */
  dashboardState?: DashboardState;
  /** 持久化存储 (可选) */
  stateStore?: DashboardStateStore;
}

/**
 * 智能进度追踪器
 *
 * 核心功能：
 * 1. 接收流式输出
 * 2. 分析关键状态
 * 3. 节流控制发送频率
 * 4. 内容优化和合并
 */
export class ProgressTracker {
  private buffer: string[] = [];
  private lastSendTime: Map<string, number> = new Map();
  private taskStartTime: Map<string, number> = new Map();
  private throttleInterval: number;
  private smartTriggerInterval: number;
  private maxMessageLength: number;
  private sendCallback: (userId: string, content: string, groupId?: string) => Promise<void>;
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastHeartbeatContent: Map<string, string> = new Map();
  private taskPrompts: Map<string, string> = new Map();  // 存储用户请求
  private userTaskIds: Map<string, string> = new Map();  // 用户 -> 当前任务ID
  private dashboardState?: DashboardState;  // Dashboard 状态 (可选)
  private taskMeta: Map<string, { userId: string; groupId?: string }> = new Map();  // 任务元数据
  private stateStore?: DashboardStateStore;  // 持久化存储 (可选)
  private lastMilestone: Map<string, string> = new Map();  // 最后检测到的关键状态
  private lastSmartSend: Map<string, number> = new Map();  // 最后智能发送时间（防止智能消息轰炸）
  private spinnerFrameIndex: Map<string, number> = new Map();  // 旋转动画帧索引
  private lastSentContent: Map<string, string> = new Map();  // 最后发送的内容（用于去重）

  // 关键词模式 - 匹配 Claude CLI 的实际输出（大幅增强）
  private readonly milestonePatterns = [
    // ===== 工具调用相关 =====
    /Using \w+ tool/i,            // "Using Read tool", "Using Bash tool"
    /Called \w+ tool/i,           // "Called Read tool"
    /Called the \w+ tool/i,       // "Called the Edit tool"
    /Tool runs:/i,                // "Tool runs:"
    /Calling \w+ tool/i,          // "Calling Read tool"
    /tool use:/i,                 // "tool use:"

    // ===== 更多工具名称检测 =====
    /Using (?:Read|Write|Edit|Bash|Grep|Glob|Task|Skill|WebFetch|WebSearch) tool/i,
    /Called (?:Read|Write|Edit|Bash|Grep|Glob|NotebookEdit) tool/i,

    // ===== 任意工具名称（更宽松的匹配）=====
    /Using [\w-]+ tool/i,
    /Called [\w-]+ tool/i,
    /tool: [\w-]+/i,

    // ===== 文件操作相关 =====
    /reading \S+/i,               // "reading file"
    /Writing to/i,                // "Writing to file"
    /Edit(ed|ing)?/i,             // "Edited", "Editing"
    /Read(ing)?/i,                // "Reading", "Read"
    /Grep(ing|ped)?/i,            // "Greping", "Greped"
    /Glob(bing)?/i,               // "Globbing"
    /NotebookEdit/i,              // "NotebookEdit"

    // ===== 搜索相关 =====
    /search(ed|ing)?/i,           // "searched", "searching"
    /found \d+ (files|matches|results|items)/i,
    /looking for/i,               // "looking for"
    /Search(ing)?/i,              // "Searching"
    /analyzing \S+/i,             // "analyzing codebase"

    // ===== 执行/运行相关 =====
    /Executing:/i,                // "Executing: command"
    /Running:/i,                  // "Running: command"
    /running\s+\S+/i,             // "running tests"
    /executed/i,                  // "executed command"
    /bash command/i,              // "bash command"

    // ===== 构建/测试/安装 =====
    /building\s+/i,               // "building project"
    /compiling\s+/i,              // "compiling code"
    /install(ing|ed)/i,           // "installing", "installed"
    /test(ing|s)?\s+/i,           // "testing", "tests"
    /npm install/i,
    /npm run/i,
    /npm build/i,

    // ===== 思考/推理/规划 =====
    /thinking/i,                  // "Thinking..."
    /reasoning/i,                 // "Reasoning..."
    /planning/i,                  // "Planning..."
    /Analyz(ing|ed)/i,            // "Analyzing", "Analyzed"
    /Consider(ing)?/i,            // "Considering"

    // ===== Skill 使用 =====
    /Using \w+ skill/i,           // "Using brainstorming skill"
    /skill:/i,                    // "skill: xxx"
    /Invoking skill/i,            // "Invoking skill"
    /Invoked \w+ skill/i,         // "Invoked brainstorming skill"
    /Invoking \w+ skill/i,        // "Invoking xxx skill"
    /Skill tool/i,                // "Skill tool"

    // ===== 任务/步骤 =====
    /step \d+\/\d+/i,             // "Step 1/5"
    /^\s*[\-\*]\s+\[.+\]\s+.+/,  // "-] [task] description"
    /TODO:/i,                     // "TODO:"

    // ===== 进度/结果 =====
    /Success:?\s*\w+/i,           // "Success: created"
    /Completed:?\s*\w+/i,         // "Completed: task"
    /Finished:?\s*\w+/i,          // "Finished: task"
    /Done\./i,                    // "Done."
    /^\s*\d+%/,                  // 进度百分比
    /\[\d+\/\d+\]/,               // "[1/5]", "[3/10]"
    /\(\d+%\)/,                   // "(50%)", "(100%)"

    // ===== Agent 相关 =====
    /Agent:/i,                    // "Agent: xxx"
    /agent/i,                     // "agent is"
    /Task tool/i,                 // "Task tool"
    /Launch(ing)? \w+ agent/i,    // "Launching xxx agent"
    /agent-type/i,                // "agent-type: xxx"
    /Teammate/i,                  // "Teammate: xxx"
    /agent-type:\s*["']?([\w-]+)["']?/i,  // "agent-type: 'code-reviewer'"

    // ===== Web/网络 =====
    /WebSearch/i,                 // "WebSearch"
    /WebFetch/i,                  // "WebFetch"
    /Fetching/i,                  // "Fetching URL"
    /http/i,                      // 包含 URL
    /browser/i,                   // "browser"

    // ===== 中文模式 =====
    /正在\s+(读取|写入|创建|删除|分析|编译|测试|部署|执行|生成|处理|安装|运行|搜索|查找)/,
    /开始\s+\S+/,
    /完成\s+\S+/,
    /调用\s+\S+/,
    /使用\s+\S+/,
    /搜索\s+/,
    /查找\s+/,
    /分析\s+/,

    // ===== 钩子/插件 =====
    /hook/i,                      // "hook"
    /PreTool|PostTool/i,          // "PreTool", "PostTool"
    /plugin/i,                    // "plugin"

    // ===== 其他活动指示 =====
    /Working on/i,                // "Working on"
    /Processing/i,                // "Processing"
    /Checking/i,                  // "Checking"
    /Validat(ing|ed)/i,           // "Validating", "Validated"

    // ===== 任意包含关键动词的行（更宽松的匹配）=====
    /\b(?:calling|invoking|launching|starting|running|executing)\b/i,
    /\b(?:reading|writing|editing|searching|analyzing)\b/i,
  ];

  private readonly errorPatterns = [
    /error/i,
    /错误/i,
    /failed/i,
    /失败/i,
    /warning/i,
    /警告/i,
    /exception/i,
    /异常/i,
  ];

  // 详细模式：显示所有输出（不只是关键状态）
  private verboseMode: boolean = false;

  // 详细模式的消息缓冲区（用于批量发送，避免 QQ 限流）
  private verboseBuffer: Map<string, string[]> = new Map();
  private verboseFlushTimer: Map<string, NodeJS.Timeout> = new Map();

  constructor(options: ProgressTrackerOptions, verboseMode: boolean = false) {
    this.verboseMode = verboseMode;
    this.throttleInterval = options.throttleInterval ?? 5000;
    this.smartTriggerInterval = options.smartTriggerInterval ?? 2000;
    this.maxMessageLength = options.maxMessageLength ?? 1900;
    this.sendCallback = options.sendCallback;
    this.dashboardState = options.dashboardState;
    this.stateStore = options.stateStore;

    logger.info(`[ProgressTracker] 初始化完成: throttle=${this.throttleInterval}ms, smartTriggerInterval=${this.smartTriggerInterval}ms, persistence=${!!this.stateStore}, verbose=${verboseMode}`);
  }

  /**
   * 设置详细模式
   */
  setVerboseMode(verbose: boolean): void {
    this.verboseMode = verbose;
    logger.info(`[ProgressTracker] 详细模式: ${verbose ? '启用' : '禁用'}`);
  }

  /**
   * 获取详细模式状态
   */
  isVerboseMode(): boolean {
    return this.verboseMode;
  }

  /**
   * 开始追踪新任务
   */
  startTask(taskId: string, userId: string, groupId?: string, prompt?: string): void {
    const userKey = this.getUserKey(userId, groupId);

    // 清除同一用户的旧任务心跳（防止多重心跳）
    const oldTaskId = this.userTaskIds.get(userKey);
    if (oldTaskId && oldTaskId !== taskId) {
      const oldInterval = this.heartbeatIntervals.get(oldTaskId);
      if (oldInterval) {
        clearInterval(oldInterval);
        this.heartbeatIntervals.delete(oldTaskId);
        logger.info(`[ProgressTracker] 清除旧任务心跳: ${oldTaskId}`);
      }
    }

    this.taskStartTime.set(taskId, Date.now());
    this.lastSendTime.set(userKey, 0);
    this.buffer = [];

    // 存储任务元数据
    this.taskMeta.set(taskId, { userId, groupId });

    // 存储用户请求，用于心跳显示
    if (prompt) {
      const shortPrompt = prompt.length > 50 ? prompt.substring(0, 47) + '...' : prompt;
      this.taskPrompts.set(taskId, shortPrompt);
    }

    // 记录用户 -> 任务映射
    this.userTaskIds.set(userKey, taskId);

    // 启动心跳定时器，每 20 秒发送一次心跳
    const heartbeatInterval = setInterval(() => {
      this.sendHeartbeat(taskId, userId, groupId);
    }, 20000);
    this.heartbeatIntervals.set(taskId, heartbeatInterval);

    // 添加任务到 Dashboard 状态
    if (this.dashboardState) {
      const taskInfo: TaskInfo = {
        id: taskId,
        userId,
        groupId,
        prompt: this.taskPrompts.get(taskId) || '',
        startTime: Date.now(),
        elapsed: 0,
        status: 'running',
      };
      this.dashboardState.tasks.set(taskId, taskInfo);
      this.dashboardState.stats.totalTasks = this.dashboardState.tasks.size;
      this.dashboardState.stats.runningTasks = Array.from(this.dashboardState.tasks.values())
        .filter(t => t.status === 'running').length;

      // 标记状态为脏，触发持久化
      if (this.stateStore) {
        this.stateStore.markDirty();
      }
    }

    logger.info(`[ProgressTracker] 开始任务: ${taskId}, user=${userId}, group=${groupId || 'none'}`);
  }

  /**
   * 接收进度数据 - 智能分析并发送关键状态更新
   *
   * 工作流程：
   * 1. 分析 chunk，检测事件类型（UPDATE/MILESTONE/ERROR）
   * 2. 如果是 MILESTONE 或 ERROR，立即发送（绕过节流，但有防轰炸保护）
   * 3. 如果是 UPDATE，记录到 buffer，等待心跳时发送
   * 4. 如果启用详细模式（verbose），发送所有输出
   */
  async onProgress(taskId: string, chunk: string, userId: string, groupId?: string): Promise<void> {
    // 记录原始输出到 buffer
    this.buffer.push(chunk);

    // 清理 ANSI 码并分析
    const cleanChunk = chunk.replace(/\x1b\[[0-9;]*m/g, '').trim();

    // 调试日志：记录收到的数据
    logger.info(`[ProgressTracker] onProgress: taskId=${taskId}, chunk.length=${chunk.length}, clean.length=${cleanChunk.length}, verbose=${this.verboseMode}`);

    // 🔒 强制禁用：不发送超过500字符的大块内容（由 Agent 负责发送最终响应）
    if (this.verboseMode && chunk.length > 500) {
      logger.info(`[ProgressTracker] 跳过大块内容发送（${chunk.length}字符，由 Agent 负责最终响应）`);
      // 清空缓冲区，不发送
      const buffer = this.verboseBuffer.get(taskId);
      if (buffer) {
        buffer.length = 0;
      }
      // 继续处理其他逻辑（milestone 检测等）
    }

    // 提取关键行（用于智能触发）
    const lines = cleanChunk.split('\n').filter(line => line.trim().length > 0);

    // 详细模式：只发送短内容（进度消息、工具调用等）
    if (this.verboseMode && lines.length > 0 && chunk.length <= 500) {
      // 初始化缓冲区
      if (!this.verboseBuffer.has(taskId)) {
        this.verboseBuffer.set(taskId, []);
      }
      const buffer = this.verboseBuffer.get(taskId)!;

      // 添加新行到缓冲区
      for (const line of lines) {
        if (line.trim().length > 0) {
          const truncatedLine = line.length > 200 ? line.substring(0, 197) + '...' : line;
          buffer.push(truncatedLine);
        }
      }

      // 如果缓冲区已满（超过 10 条）或已达到发送间隔，则发送
      const shouldFlush = buffer.length >= 10;
      const lastSendTime = this.lastSmartSend.get(taskId) ?? 0;
      const now = Date.now();
      const shouldSend = now - lastSendTime >= 3000; // 3 秒发送一次

      if (shouldFlush || shouldSend) {
        // 清除旧的定时器
        const oldTimer = this.verboseFlushTimer.get(taskId);
        if (oldTimer) {
          clearTimeout(oldTimer);
          this.verboseFlushTimer.delete(taskId);
        }

        // 合并发送
        if (buffer.length > 0) {
          const combinedMessage = buffer.join('\n');
          const finalMessage = combinedMessage.length > 1800
            ? combinedMessage.substring(0, 1800) + '\n... (更多内容已省略)'
            : combinedMessage;

          // 去重检查：如果与上次发送的内容相同，则跳过
          const lastContent = this.lastSentContent.get(taskId);
          if (lastContent === finalMessage) {
            logger.debug(`[ProgressTracker] 跳过重复内容发送`);
            buffer.length = 0;
            return;
          }

          try {
            await this.sendCallback(userId, finalMessage, groupId);
            this.lastSentContent.set(taskId, finalMessage); // 记录已发送的内容
            logger.debug(`[ProgressTracker] 详细模式批量发送: ${buffer.length}条消息`);
          } catch (error) {
            logger.error(`[ProgressTracker] 详细模式批量发送失败: ${error}`);
          }

          // 清空缓冲区
          buffer.length = 0;
          this.lastSmartSend.set(taskId, now);
        }
      } else {
        // 如果缓冲区未满且未到发送时间，设置定时器确保最终发送
        if (!this.verboseFlushTimer.has(taskId)) {
          const timer = setTimeout(async () => {
            if (buffer.length > 0) {
              const combinedMessage = buffer.join('\n');
              const finalMessage = combinedMessage.length > 1800
                ? combinedMessage.substring(0, 1800) + '\n... (更多内容已省略)'
                : combinedMessage;

              try {
                await this.sendCallback(userId, finalMessage, groupId);
                logger.debug(`[ProgressTracker] 详细模式定时发送: ${buffer.length}条消息`);
              } catch (error) {
                logger.error(`[ProgressTracker] 详细模式定时发送失败: ${error}`);
              }

              buffer.length = 0;
              this.verboseFlushTimer.delete(taskId);
            }
          }, 3000); // 3 秒后发送

          this.verboseFlushTimer.set(taskId, timer);
        }
      }
    }

    let milestoneDetected = false;
    for (const line of lines) {
      const eventType = this.analyzeChunk(line);

      // 如果检测到关键状态变化
      if (eventType === ProgressEventType.MILESTONE || eventType === ProgressEventType.ERROR) {
        milestoneDetected = true;
        logger.info(`[ProgressTracker] 检测到关键状态: type=${eventType}, line="${line.substring(0, 50)}..."`);

        // 防轰炸保护：使用配置的智能触发间隔
        const lastSmartSendTime = this.lastSmartSend.get(taskId) ?? 0;
        const now = Date.now();

        if (now - lastSmartSendTime >= this.smartTriggerInterval) {
          // 记录最后检测到的关键状态（用于心跳显示）
          this.lastMilestone.set(taskId, line);

          // 保存里程碑到 Dashboard 状态
          if (this.dashboardState && this.dashboardState.tasks.has(taskId)) {
            const task = this.dashboardState.tasks.get(taskId);
            if (task) {
              if (!task.milestones) task.milestones = [];
              // 限制最多保存 20 个里程碑
              if (task.milestones.length < 20) {
                task.milestones.push({
                  timestamp: now,
                  message: line,
                  type: eventType === ProgressEventType.ERROR ? 'error' : 'milestone',
                });
              }
              // 标记状态为脏，触发持久化
              if (this.stateStore) {
                this.stateStore.markDirty();
              }
            }
          }

          // 去重检查：如果与详细模式已发送的内容相同，则跳过
          const lastSentContent = this.lastSentContent.get(taskId);
          if (lastSentContent && (lastSentContent === line || lastSentContent.includes(line.substring(0, 100)))) {
            logger.debug(`[ProgressTracker] 跳过关键状态重复发送: "${line.substring(0, 50)}..."`);
            this.lastSmartSend.set(taskId, now);
            return;
          }

          // 立即发送关键状态更新
          await this.sendSmartUpdate(taskId, line, eventType, userId, groupId);
          this.lastSentContent.set(taskId, line); // 记录单行关键状态
          this.lastSmartSend.set(taskId, now);
        } else {
          logger.info(`[ProgressTracker] 智能发送被防轰炸保护跳过:距上次${Math.floor((now - lastSmartSendTime) / 1000)}秒`);
        }
      }
    }

    if (!milestoneDetected && !this.verboseMode && lines.length > 0) {
      logger.info(`[ProgressTracker] 未检测到关键状态，样例行: "${lines[0].substring(0, 50)}..."`);
    }

    // 记录最新的输出内容，用于心跳时显示
    if (cleanChunk.length > 0) {
      this.lastHeartbeatContent.set(taskId, cleanChunk);
    }
  }

  /**
   * 发送智能更新（关键状态变化 - VSCode 风格）
   */
  private async sendSmartUpdate(
    _taskId: string,
    milestone: string,
    eventType: ProgressEventType,
    userId: string,
    groupId?: string
  ): Promise<void> {
    let message: string;

    if (eventType === ProgressEventType.ERROR) {
      message = `❌ [ Error ]: ${milestone.substring(0, 80)}`;
    } else {
      // 智能解析活动类型
      const activityType = this.detectActivityType(milestone);

      switch (activityType) {
        case 'tool':
          // 工具调用 - VSCode 格式，工具名加粗
          const toolMatch = milestone.match(/(?:Using|Calling|Called) (\w+) tool/i);
          const toolName = toolMatch ? toolMatch[1] : null;
          message = toolName
            ? `🔧 [ Tool ]:[ ${toolName} ]`
            : `🔧 [ Tool ]: ${milestone.substring(0, 40)}`;
          break;

        case 'skill':
          // Skill 调用 - 加粗显示
          const skillMatch = milestone.match(/(?:Using|Invoked|Invoking) (\w+) skill/i);
          const skillName = skillMatch ? skillMatch[1] : null;
          message = skillName
            ? `⚡ [ skill ]:[ ${skillName} ] running...`
            : `⚡ [ skill ]: ${milestone.substring(0, 40)}`;
          break;

        case 'agent':
          // Agent 启动 - 加粗显示
          const agentMatch = milestone.match(/(?:Launching|Agent:|agent|Launch(?:ing)?) (\w+)/i);
          const agentName = agentMatch ? agentMatch[1] : null;
          message = agentName
            ? `🤖 [ agent ]:[ ${agentName} ] working...`
            : `🤖 [ agent ]: ${milestone.substring(0, 40)}`;
          break;

        case 'search':
          // 搜索操作 - 加粗工具名
          const grepMatch = milestone.match(/Grep(?:ed|ing)??\s+["']?(.+?)["']?\s+(?:in\s+)?(\S+)?/i);
          if (grepMatch) {
            const pattern = grepMatch[1]?.substring(0, 30);
            const searchPath = grepMatch[2];
            message = searchPath
              ? `🔍 [ Grep ]: "${pattern}"\n   └ in ${searchPath}`
              : `🔍 [ Grep ]: "${pattern}"`;
          } else {
            const globMatch = milestone.match(/Glob(?:bing)??\s+["']?(.+?)["']?(?:\s+in\s+(\S+))?/i);
            if (globMatch) {
              const pattern = globMatch[1]?.substring(0, 30);
              const globPath = globMatch[2];
              message = globPath
                ? `🔍 [ Glob ]: "${pattern}"\n   └ in ${globPath}`
                : `🔍 [ Glob ]: "${pattern}"`;
            } else {
              message = `🔍 [ Searching ]...`;
            }
          }
          break;

        case 'read':
          // 读取文件 - 加粗工具名
          const readFileMatch = milestone.match(/(?:reading|Read(?:ing)?)\s+(\S+)/i);
          const readPath = readFileMatch ? readFileMatch[1] : null;
          message = readPath
            ? `📖 [ Read ]: ${readPath}`
            : `📖 [ Reading ]...`;
          break;

        case 'write':
        case 'edit':
          // 写入/编辑文件 - 加粗工具名
          const editFileMatch = milestone.match(/(?:Writing|Edit(?:ing)?)\s+(?:to\s+)?(\S+)/i);
          const editPath = editFileMatch ? editFileMatch[1] : null;
          const action = activityType === 'write' ? 'Write' : 'Edit';
          message = editPath
            ? `✏️ [ ${action} ]: ${editPath}`
            : `✏️ [ ${action}ing ]...`;
          break;

        case 'execute':
        case 'run':
          // 执行命令 - 加粗工具名
          const cmdMatch = milestone.match(/(?:Executing|Running)(?:\s+command)?:?\s*(.+?)(?:\.\.\.|$)/i);
          const cmd = cmdMatch ? cmdMatch[1].trim().substring(0, 60) : null;
          message = cmd
            ? `⚙️ [ Bash ]: ${cmd}`
            : `⚙️ [ Bash ]: running command...`;
          break;

        case 'test':
          // 测试 - 加粗
          message = `🧪 [ Test ]: running...`;
          break;

        case 'build':
        case 'compile':
        case 'install':
          // 构建/编译/安装 - 加粗
          const pkgMatch = milestone.match(/(?:installing|building)\s+(\S+)/i);
          const pkg = pkgMatch ? pkgMatch[1] : null;
          const actionVerb = activityType === 'install' ? 'Install' : activityType === 'compile' ? 'Compile' : 'Build';
          message = pkg
            ? `📦 [ ${actionVerb} ]: ${pkg}`
            : `📦 [ ${actionVerb}ing ]...`;
          break;

        case 'web':
          // Web 请求 - 加粗
          const urlMatch = milestone.match(/(?:https?:\/\/[^\s]+|www\.[^\s]+)/i);
          const url = urlMatch ? urlMatch[1]?.substring(0, 40) : null;
          message = url
            ? `🌐 [ Web ]: ${url}`
            : `🌐 [ Web ]: fetching...`;
          break;

        case 'think':
          // 思考中 - 加粗
          const thinkContent = milestone.substring(0, 40);
          message = `💭 [ Thinking ]: ${thinkContent}...`;
          break;

        case 'plan':
          // 规划中 - 加粗
          const planContent = milestone.substring(0, 40);
          message = `📋 [ Planning ]: ${planContent}...`;
          break;

        case 'complete':
          // 完成 - 加粗
          message = `✅ [ Complete ]`;
          break;

        default:
          // 通用格式：尝试提取动作和目标
          const parts = milestone.split(/[:：]/);
          if (parts.length >= 2) {
            const action = parts[0].trim().substring(0, 20);
            const target = parts.slice(1).join(':').trim().substring(0, 60);
            message = `⚙️ [ ${action} ]: ${target}`;
          } else {
            // 简单显示
            const truncated = milestone.length > 60 ? milestone.substring(0, 57) + '...' : milestone;
            message = `⚙️ ${truncated}`;
          }
      }
    }

    try {
      await this.sendCallback(userId, message, groupId);
      logger.info(`[ProgressTracker] 智能触发: type=${eventType}, message="${message}"`);
    } catch (error) {
      logger.error(`[ProgressTracker] 智能发送失败: ${error}`);
    }
  }

  /**
   * 检测活动类型
   */
  private detectActivityType(text: string): string {
    const lower = text.toLowerCase();

    // 按优先级检测
    if (/skill/i.test(text)) return 'skill';
    if (/agent/i.test(text)) return 'agent';
    if (/tool/i.test(text)) return 'tool';
    if (/search|found|grep|glob/i.test(lower)) return 'search';
    if (/reading|read/i.test(lower)) return 'read';
    if (/writing|edit|wrote/i.test(lower)) return 'edit';
    if (/web|http|fetch|browser/i.test(lower)) return 'web';
    if (/executing|running|bash|npm run/i.test(lower)) return 'execute';
    if (/test|spec/i.test(lower)) return 'test';
    if (/compile/i.test(lower)) return 'compile';
    if (/install/i.test(lower)) return 'install';
    if (/build/i.test(lower)) return 'build';
    if (/thinking|reasoning/i.test(lower)) return 'think';
    if (/planning|plan/i.test(lower)) return 'plan';
    if (/complete|done|finished|success/i.test(lower)) return 'complete';

    return 'generic';
  }

  /**
   * 检测是否是最终输出（包含总结性关键词的长文本）
   * 最终输出的特征：
   * 1. 长度 > 500 字符
   * 2. 包含总结性关键词
   * 3. 包含结构化内容（如"##"、"**"、编号列表等）
   */
  private detectFinalOutput(chunk: string): boolean {
    // 如果内容太短，不是最终输出
    if (chunk.length < 500) {
      return false;
    }

    // 总结性关键词模式
    const finalOutputPatterns = [
      /已成功读取.*张图片/,
      /## .*内容汇总/,
      /## .*图片内容/,
      /这些图片涵盖了/,
      /请告诉我你希望如何处理/,
      /我可以帮你/,
      /---/m,  // markdown 分隔线
    ];

    // 检查是否包含至少一个总结性关键词
    const matchCount = finalOutputPatterns.filter(pattern => pattern.test(chunk)).length;

    // 如果匹配2个或以上模式，认为是最终输出
    return matchCount >= 2;
  }

  /**
   * 分析输出块，检测事件类型
   */
  private analyzeChunk(chunk: string): ProgressEventType {
    // 检查错误/警告
    for (const pattern of this.errorPatterns) {
      if (pattern.test(chunk)) {
        return ProgressEventType.ERROR;
      }
    }

    // 检查关键状态变化
    for (const pattern of this.milestonePatterns) {
      if (pattern.test(chunk)) {
        return ProgressEventType.MILESTONE;
      }
    }

    return ProgressEventType.UPDATE;
  }

  /**
   * 刷新缓冲区，发送消息
   */
  async flush(userId: string, groupId?: string, type: ProgressEventType = ProgressEventType.UPDATE): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const content = this.optimizeContent(this.buffer.join(''), type);
    this.buffer = [];

    const key = this.getUserKey(userId, groupId);
    this.lastSendTime.set(key, Date.now());

    try {
      await this.sendCallback(userId, content, groupId);
      logger.info(`[ProgressTracker] 发送进度: type=${type}, length=${content.length}`);
    } catch (error) {
      logger.error(`[ProgressTracker] 发送失败: ${error}`);
      // 不中断任务，继续追踪
    }
  }

  /**
   * 优化内容（清理、截断、格式化）
   */
  private optimizeContent(raw: string, type: ProgressEventType): string {
    // 清理 ANSI 颜色码
    let cleaned = raw.replace(/\x1b\[[0-9;]*m/g, '');

    // 移除重复行
    const lines = cleaned.split('\n').filter(line => line.trim());
    const uniqueLines = new Set(lines);
    cleaned = Array.from(uniqueLines).join('\n');

    // 添加前缀
    const prefix = this.getPrefix(type);

    // 截断
    const maxLength = this.maxMessageLength - prefix.length - 10; // 预留空间
    if (cleaned.length > maxLength) {
      // 尝试在合适的位置截断
      const breakPoints = ['\n\n', '\n', '。', '；', ';', '！', '!', '？', '?', '，', ',', ' '];
      let truncated = cleaned.substring(0, maxLength);

      for (const breakPoint of breakPoints) {
        const lastIndex = truncated.lastIndexOf(breakPoint);
        if (lastIndex > maxLength * 0.7) {
          truncated = truncated.substring(0, lastIndex + breakPoint.length);
          break;
        }
      }

      cleaned = truncated + '\n... (内容过长，已截断)';
    }

    return prefix + cleaned;
  }

  /**
   * 获取消息前缀
   */
  private getPrefix(type: ProgressEventType): string {
    switch (type) {
      case ProgressEventType.MILESTONE:
        return '⚡ 关键更新:\n';
      case ProgressEventType.ERROR:
        return '⚠️ 警告/错误:\n';
      case ProgressEventType.COMPLETE:
        return '✅ 任务完成:\n';
      default:
        return '📋 执行进度:\n';
    }
  }

  /**
   * 发送心跳消息（VSCode 风格）
   * 当有活跃的工具使用时，淡化心跳消息
   */
  private async sendHeartbeat(taskId: string, userId: string, groupId?: string): Promise<void> {
    const startTime = this.taskStartTime.get(taskId);
    if (!startTime) return;

    const elapsed = Date.now() - startTime;
    const elapsedSeconds = Math.floor(elapsed / 1000);

    // 检查最近是否有智能触发（工具使用）
    const lastSmartSendTime = this.lastSmartSend.get(taskId) ?? 0;
    const now = Date.now();
    const timeSinceSmartTrigger = now - lastSmartSendTime;

    // 如果 5 秒内有智能触发，跳过心跳消息（工具消息已经展示了活动状态）
    if (timeSinceSmartTrigger < 5000 && lastSmartSendTime > 0) {
      logger.debug(`[ProgressTracker] 跳过心跳：最近${Math.floor(timeSinceSmartTrigger / 1000)}秒有智能触发`);
      return;
    }

    // 获取当前旋转帧
    let frameIndex = this.spinnerFrameIndex.get(taskId) || 0;
    this.spinnerFrameIndex.set(taskId, frameIndex + 1);

    // 使用 VSCode 风格格式化
    const heartbeatMessage = ProgressFormatter.formatHeartbeat(
      elapsedSeconds,
      undefined,  // 不显示当前动作，保持简洁
      frameIndex
    );

    try {
      await this.sendCallback(userId, heartbeatMessage, groupId);
      logger.debug(`[ProgressTracker] 发送心跳: taskId=${taskId}, elapsed=${elapsed}ms`);
    } catch (error) {
      logger.error(`[ProgressTracker] 发送心跳失败: ${error}`);
    }

    // 更新 Dashboard 状态
    if (this.dashboardState) {
      const taskInfo = this.dashboardState.tasks.get(taskId);
      if (taskInfo) {
        taskInfo.elapsed = elapsed;
      }
    }
  }

  /**
   * 结束任务（失败/错误）
   * 用于任务异常结束时调用，将任务状态标记为 error
   */
  async failTask(taskId: string, error: string, userId: string, groupId?: string): Promise<void> {
    // 清除心跳定时器
    const heartbeatInterval = this.heartbeatIntervals.get(taskId);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      this.heartbeatIntervals.delete(taskId);
    }

    // 清除详细模式定时器和缓冲区
    const flushTimer = this.verboseFlushTimer.get(taskId);
    if (flushTimer) {
      clearTimeout(flushTimer);
      this.verboseFlushTimer.delete(taskId);
    }
    this.verboseBuffer.delete(taskId);

    // 更新 Dashboard 状态 - 标记任务为错误
    if (this.dashboardState) {
      const taskInfo = this.dashboardState.tasks.get(taskId);
      if (taskInfo) {
        taskInfo.status = 'error';
        taskInfo.output = error;
        taskInfo.elapsed = Date.now() - taskInfo.startTime;
        taskInfo.completedAt = Date.now();

        // 更新统计
        this.dashboardState.stats.runningTasks = Array.from(this.dashboardState.tasks.values())
          .filter(t => t.status === 'running').length;

        // 标记状态为脏，触发持久化
        if (this.stateStore) {
          this.stateStore.markDirty();
        }
      }
    }

    // 清理
    this.buffer = [];
    const key = this.getUserKey(userId, groupId);
    this.lastSendTime.delete(key);
    this.taskStartTime.delete(taskId);
    this.lastHeartbeatContent.delete(taskId);
    this.taskPrompts.delete(taskId);
    this.userTaskIds.delete(key);
    this.taskMeta.delete(taskId);
    this.lastMilestone.delete(taskId);
    this.lastSmartSend.delete(taskId);
    this.spinnerFrameIndex.delete(taskId);

    logger.info(`[ProgressTracker] 任务失败: ${taskId}, error="${error.substring(0, 100)}"`);
  }

  /**
   * 结束任务
   * 注意：这里不发送最终结果，因为 Agent 的 process() 方法会返回完整输出
   */
  async endTask(taskId: string, finalOutput: string, userId: string, groupId?: string): Promise<void> {
    // 清除心跳定时器
    const heartbeatInterval = this.heartbeatIntervals.get(taskId);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      this.heartbeatIntervals.delete(taskId);
    }

    // 清除详细模式定时器和缓冲区
    const flushTimer = this.verboseFlushTimer.get(taskId);
    if (flushTimer) {
      clearTimeout(flushTimer);
      this.verboseFlushTimer.delete(taskId);
    }
    this.verboseBuffer.delete(taskId);

    // 更新 Dashboard 状态 - 标记任务为已完成
    if (this.dashboardState) {
      const taskInfo = this.dashboardState.tasks.get(taskId);
      if (taskInfo) {
        taskInfo.status = 'completed';
        taskInfo.output = finalOutput;
        taskInfo.elapsed = Date.now() - taskInfo.startTime;
        taskInfo.completedAt = Date.now();

        // 更新统计
        this.dashboardState.stats.completedTasks = Array.from(this.dashboardState.tasks.values())
          .filter(t => t.status === 'completed').length;
        this.dashboardState.stats.runningTasks = Array.from(this.dashboardState.tasks.values())
          .filter(t => t.status === 'running').length;

        // 标记状态为脏，触发持久化
        if (this.stateStore) {
          this.stateStore.markDirty();
        }
      }
    }

    // 清理
    this.buffer = [];
    const key = this.getUserKey(userId, groupId);
    this.lastSendTime.delete(key);
    this.taskStartTime.delete(taskId);
    this.lastHeartbeatContent.delete(taskId);
    this.taskPrompts.delete(taskId);
    this.userTaskIds.delete(key);  // 清除用户->任务映射
    this.taskMeta.delete(taskId);
    this.lastMilestone.delete(taskId);
    this.lastSmartSend.delete(taskId);
    this.spinnerFrameIndex.delete(taskId);

    logger.info(`[ProgressTracker] 结束任务: ${taskId}, output.length=${finalOutput.length}`);
  }

  /**
   * 获取用户键
   */
  private getUserKey(userId: string, groupId?: string): string {
    return groupId ? `group_${groupId}` : `user_${userId}`;
  }

  /**
   * 清理僵尸任务（运行时间过长但实际已死亡的任务）
   *
   * 僵尸任务判断标准：
   * 1. 任务状态为 'running'
   * 2. 没有对应的心跳定时器（说明进程已死亡）← 最可靠的判断
   *
   * 注意：不再使用运行时长作为判断标准，避免误杀真正需要长时间运行的任务
   *
   * @returns 清理的任务数量
   */
  cleanupZombieTasks(): number {
    if (!this.dashboardState) {
      return 0;
    }

    let cleanedCount = 0;

    for (const [taskId, taskInfo] of this.dashboardState.tasks.entries()) {
      // 只处理运行中的任务
      if (taskInfo.status !== 'running') {
        continue;
      }

      // 僵尸任务判定：没有心跳定时器（说明进程已死亡）
      // 这是可靠的判断，因为：
      // - 活跃任务每 20 秒发送心跳
      // - 心跳定时器在 startTask() 时创建
      // - 心跳定时器在 endTask()/failTask() 时清除
      const hasHeartbeat = this.heartbeatIntervals.has(taskId);

      if (!hasHeartbeat) {
        const elapsed = Date.now() - taskInfo.startTime;
        logger.warn(`[ProgressTracker] 发现僵尸任务: ${taskId}, elapsed=${Math.floor(elapsed / 60000)}分钟, 无心跳定时器`);

        // 标记为错误状态
        taskInfo.status = 'error';
        taskInfo.elapsed = elapsed;
        taskInfo.completedAt = Date.now();
        taskInfo.output = '任务进程异常终止（无心跳）';

        // 清理内部状态
        this.taskStartTime.delete(taskId);
        this.lastHeartbeatContent.delete(taskId);
        this.taskPrompts.delete(taskId);
        this.taskMeta.delete(taskId);
        this.lastMilestone.delete(taskId);
        this.lastSmartSend.delete(taskId);
        this.spinnerFrameIndex.delete(taskId);

        // 清理用户->任务映射
        if (taskInfo.groupId) {
          this.userTaskIds.delete(`group_${taskInfo.groupId}`);
        } else {
          this.userTaskIds.delete(`user_${taskInfo.userId}`);
        }

        cleanedCount++;
      }
    }

    // 更新统计
    this.dashboardState.stats.runningTasks = Array.from(this.dashboardState.tasks.values())
      .filter(t => t.status === 'running').length;

    // 标记状态为脏，触发持久化
    if (cleanedCount > 0 && this.stateStore) {
      this.stateStore.markDirty();
      logger.info(`[ProgressTracker] 清理了 ${cleanedCount} 个僵尸任务`);
    }

    return cleanedCount;
  }
}
