import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export interface CliSessionOptions {
  workspacePath: string;
  bypassPermissions?: boolean;
  sessionTimeout?: number;
}

export class CliSessionManager {
  private workspacePath: string;
  private bypassPermissions: boolean;
  private sessionTimeout: number;
  // 存储每个用户的会话 ID，用于长对话
  private userSessionIds: Map<string, string> = new Map();
  // 存储每个会话正在执行的任务，确保同一会话的请求串行执行
  private sessionPromises: Map<string, Promise<any>> = new Map();

  constructor(options: CliSessionOptions) {
    this.workspacePath = options.workspacePath;
    this.bypassPermissions = options.bypassPermissions !== false;
    this.sessionTimeout = options.sessionTimeout ?? 30 * 60 * 1000;

    logger.info('CLI 会话管理器已初始化');
  }

  /**
   * 获取或创建用户会话 ID
   * 改为：每次生成新的 session ID，避免 CLI 会话锁定冲突
   */
  private getOrCreateSessionId(userId: string, groupId?: string): string {
    // 不再复用 session ID，每次生成新的
    // CLI 的 --session-id 是用于恢复会话，但在我们的使用场景中会导致冲突
    const sessionId = uuidv4();
    const key = groupId ? `group_${groupId}` : `user_${userId}`;
    logger.info(`[CliSession] 生成新会话 ID: ${key} -> ${sessionId}`);
    return sessionId;
  }

  /**
   * 重置用户会话（开始新对话）
   */
  resetSession(userId: string, groupId?: string): void {
    const key = groupId ? `group_${groupId}` : `user_${userId}`;
    this.userSessionIds.delete(key);
    logger.info(`[CliSession] 重置会话: ${key}`);
  }

  /**
   * 执行 CLI 命令（支持长对话）
   * 每次调用启动新的 CLI 进程，但使用相同的 session ID 来保持上下文
   * 使用队列机制确保同一会话的请求串行执行，避免 session ID 冲突
   */
  async execute(
    prompt: string,
    options: {
      userId?: string;
      groupId?: string;
      imagePath?: string;
      attachmentPath?: string;
      onProgress?: (chunk: string) => void;
      timeout?: number;
    } = {}
  ): Promise<string> {
    const { userId = 'unknown', groupId, timeout = 600000 } = options;

    // 获取会话键（用于队列管理）
    const sessionKey = groupId ? `group_${groupId}` : `user_${userId}`;

    // 获取或创建会话 ID，用于长对话
    const sessionId = this.getOrCreateSessionId(userId, groupId);

    // 定义实际的执行函数
    const executeInternal = (): Promise<string> => {
      return new Promise((resolve, reject) => {
        const taskId = uuidv4().substring(0, 8);
        const isWindows = process.platform === 'win32';

        // 构建参数
        const args: string[] = [
          '--print',  // 一次性执行模式
          '--continue',  // 继续最近的对话（替代 --session-id，避免锁定冲突）
          '--no-chrome',  // 禁用 Chrome 集成
          '--output-format', 'stream-json',  // 流式 JSON 输出
          '--verbose',  // 详细输出（stream-json 需要）
        ];
        if (this.bypassPermissions) {
          args.push('--dangerously-skip-permissions');
        }

        // 清理环境变量
        const env: Record<string, string> = { ...process.env } as Record<string, string>;
        const deletedVars: string[] = [];
        for (const key of Object.keys(env)) {
          if (key.startsWith('CLAUDE') || key.startsWith('ANTHROPIC')) {
            delete env[key];
            deletedVars.push(key);
          }
        }
        logger.info(`[CliSession ${taskId}] 已清理环境变量: ${deletedVars.join(', ')}`);
        // 调试：确认清理后的状态
        const remainingClaudeVars = Object.keys(env).filter(k => k.startsWith('CLAUDE'));
        if (remainingClaudeVars.length > 0) {
          logger.warn(`[CliSession ${taskId}] 警告：仍有 Claude 变量: ${remainingClaudeVars.join(', ')}`);
        }

        logger.info(`[CliSession ${taskId}] 启动进程: claude ${args.join(' ')}`);

        // 启动 CLI 进程
        // 注意：确保 CLAUDECODE 环境变量已被清理，否则 CLI 会拒绝嵌套运行
        let cliProcess: ChildProcess;
        if (isWindows) {
          // Windows: 使用 npx 来运行 CLI，这样更可靠
          // npx 会自动找到正确的命令位置
          cliProcess = spawn('npx', ['claude', ...args], {
            cwd: this.workspacePath,
            shell: true,
            env: env,  // 已清理 Claude/Anthropic 相关变量
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
          });
        } else {
          // 非 Windows: 直接使用 env 参数清理环境变量
          cliProcess = spawn('claude', args, {
            cwd: this.workspacePath,
            env: env,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        }

        let output = '';
        let hasOutput = false;
        const startTime = Date.now();
        let rawBuffer = '';  // 用于缓冲不完整的 JSON 行

        // 超时定时器（只有当 timeout > 0 时才启用，0 表示禁用超时）
        let timeoutTimer: NodeJS.Timeout | null = null;
        if (timeout > 0) {
          timeoutTimer = setTimeout(() => {
            cliProcess.kill();
            reject(new Error(`CLI 执行超时 (${timeout}ms)`));
          }, timeout);
        } else {
          logger.info(`[CliSession ${taskId}] 超时已禁用，任务将一直运行直到完成`);
        }

        // 收集 stdout 输出（stream-json 格式）
        let finalResultReceived = false;  // 标记是否已收到最终结果

        cliProcess.stdout.on('data', (data: Buffer) => {
          const chunk = data.toString();
          logger.info(`[CliSession ${taskId}] stdout 收到数据 (${chunk.length} 字符)`);

          // 解析 stream-json 格式
          const lines = (rawBuffer + chunk).split('\n');
          rawBuffer = lines.pop() || '';  // 保留不完整的最后一行

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const json = JSON.parse(line);

              // 🔍 调试：记录所有事件类型（帮助诊断问题）
              const eventType = json.type;
              const subType = json.contentBlock?.type || json.delta?.type || json.message?.type || '';
              logger.info(`[CliSession ${taskId}] JSON事件: type="${eventType}"${subType ? `, sub="${subType}"` : ''}`);

              // 提取不同类型的内容
              if ((json.type === 'message' || json.type === 'assistant') && json.message?.content) {
                const content = json.message.content;

                // 检查是否包含工具调用（content 可能是数组）
                if (Array.isArray(content)) {
                  for (const item of content) {
                    if (item.type === 'tool_use') {
                      // 提取工具调用信息
                      const toolName = item.name;
                      const toolInput = item.input;

                      logger.info(`[CliSession ${taskId}] 🔧 工具调用: ${toolName}`);

                      // 传递工具调用信息给 ProgressTracker
                      if (options.onProgress) {
                        const toolMessage = `Using ${toolName} tool`;
                        options.onProgress(toolMessage);
                      }
                    } else if (item.type === 'text' && item.text) {
                      // 文本内容
                      output += item.text;
                      hasOutput = true;

                      if (options.onProgress) {
                        options.onProgress(item.text);
                      }
                    }
                  }
                } else if (typeof content === 'string') {
                  // 字符串内容（直接文本）
                  output += content;
                  hasOutput = true;

                  if (options.onProgress) {
                    options.onProgress(content);
                  }
                }
              } else if (json.type === 'messageDelta' && json.delta?.content) {
                const content = json.delta.content;
                output += content;
                hasOutput = true;

                if (options.onProgress) {
                  options.onProgress(content);
                }
              } else if (json.type === 'contentBlockStart' && json.contentBlock?.type === 'tool_use') {
                // 工具调用开始 - 只记录日志，不调用onProgress（避免与message事件重复）
                const toolName = json.contentBlock.name;
                const toolInput = json.contentBlock.input;
                logger.info(`[CliSession ${taskId}] 🔧 工具调用: ${toolName} - ${JSON.stringify(toolInput)}`);
              } else if (json.type === 'contentBlockDelta' && json.delta?.type === 'thinking') {
                // ✨ 思考过程 - 这是 Claude 的推理过程
                const thinkingContent = json.delta.content;
                if (thinkingContent && thinkingContent.length > 0) {
                  logger.info(`[CliSession ${taskId}] 💭 思考: ${thinkingContent.substring(0, 50)}...`);

                  // 传递思考内容给 ProgressTracker（在详细模式下会显示）
                  if (options.onProgress) {
                    options.onProgress(`💭 [ Thinking ]: ${thinkingContent}`);
                  }
                }
              } else if (json.type === 'contentBlockDelta' && json.delta?.type === 'tool_result') {
                // 工具执行输出
                const toolResult = json.delta.content;
                if (toolResult && toolResult.length > 0) {
                  logger.debug(`[CliSession ${taskId}] 工具输出: ${toolResult.substring(0, 50)}...`);
                }
              } else if (json.type === 'contentBlockStop') {
                // 内容块结束
                logger.debug(`[CliSession ${taskId}] 内容块结束`);
              } else if (json.type === 'result' && json.result) {
                // CLI 最终结果（stream-json 格式的 result 类型）
                // 这是 Claude Code CLI 返回的最终答案

                // 检查是否已经处理过最终结果（避免重复发送）
                if (finalResultReceived) {
                  logger.debug(`[CliSession ${taskId}] 最终结果已处理，跳过重复的 result 事件`);
                  continue;
                }

                const result = json.result;

                // 🔍 增强重复检测：检查是否与现有输出相同
                const isDuplicate = result === output ||
                  (output.length >= result.length && output.includes(result)) ||
                  (result.length >= 100 && output.length >= 100 &&
                   output.substring(0, 100) === result.substring(0, 100));

                if (result && !isDuplicate) {
                  output = result;  // 直接替换为最终结果
                  hasOutput = true;
                  finalResultReceived = true;  // 标记已处理

                  if (options.onProgress) {
                    options.onProgress(result);
                  }
                } else if (result && isDuplicate) {
                  // result 与 output 相同或已包含在 output 中
                  // 标记已处理，避免后续重复
                  finalResultReceived = true;
                  logger.debug(`[CliSession ${taskId}] result 重复（output=${output.length}, result=${result.length}），跳过 onProgress 避免重复发送`);
                }
              } else if (json.type === 'error') {
                const error = json.error || json.message;
                logger.warn(`[CliSession ${taskId}] CLI error: ${error}`);
                output += `\nError: ${error}`;
              }
            } catch (e) {
              // 不是 JSON 格式，可能是原始文本输出
              output += line + '\n';
              hasOutput = true;

              if (options.onProgress) {
                options.onProgress(line + '\n');
              }
            }
          }
        });

        // 收集 stderr 输出
        cliProcess.stderr.on('data', (data: Buffer) => {
          const chunk = data.toString();
          logger.info(`[CliSession ${taskId}] stderr: ${chunk.substring(0, 100)}...`);
          // stderr 包含工具使用信息等调试输出
          // 这些信息对进度追踪很重要
          output += chunk;
          hasOutput = true;

          // 将 stderr 输出也传递给进度追踪器
          // 工具使用信息通常在 stderr 中输出
          if (options.onProgress) {
            options.onProgress(chunk);
          }
        });

        // 进程退出处理
        cliProcess.on('close', (code: number | null) => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          const elapsed = Date.now() - startTime;

          logger.info(`[CliSession ${taskId}] 进程退出，code: ${code}, 耗时: ${elapsed}ms, output.length: ${output.length}`);

          if (code === 0 || code === null) {
            // 正常退出
            resolve(output || '[CLI 执行完成，无输出]');
          } else {
            // 异常退出
            resolve(output || `[CLI 异常退出，code: ${code}]`);
          }
        });

        // 进程错误处理
        cliProcess.on('error', (err: Error) => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          logger.error(`[CliSession ${taskId}] 进程错误: ${err.message}`);
          reject(err);
        });

        // 发送输入
        if (cliProcess.stdin) {
          try {
            // 构建完整输入
            let fullPrompt = prompt;
            if (options.imagePath) {
              fullPrompt = `[图片: ${options.imagePath}]\n${prompt}`;
            }
            if (options.attachmentPath) {
              fullPrompt = `[文件: ${options.attachmentPath}]\n${prompt}`;
            }

            cliProcess.stdin.write(fullPrompt + '\n');
            cliProcess.stdin.end();  // 发送完成，关闭 stdin 以触发 CLI 处理
            logger.info(`[CliSession ${taskId}] 发送消息 (${fullPrompt.length} 字符)`);
          } catch (error) {
            if (timeoutTimer) clearTimeout(timeoutTimer);
            logger.error(`[CliSession ${taskId}] stdin 写入错误: ${error}`);
            reject(new Error(`stdin 写入失败: ${error}`));
          }
        } else {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          reject(new Error('CLI 进程 stdin 不可用'));
        }
      });
    };

    // 检查是否有正在执行的任务
    const existingPromise = this.sessionPromises.get(sessionKey);
    if (existingPromise) {
      logger.info(`[CliSession] 会话 ${sessionKey} 有任务正在执行，排队等待...`);
      // 链接到现有任务，确保串行执行
      const chainedPromise = existingPromise.finally(() => {
        logger.info(`[CliSession] 会话 ${sessionKey} 前一任务完成，开始执行新任务`);
      }).then(() => executeInternal());

      // 存储新的 Promise
      this.sessionPromises.set(sessionKey, chainedPromise);

      // 完成后清理（无论成功或失败）
      const result = chainedPromise.finally(() => {
        // 只清理当前任务的 Promise，允许下一任务执行
        if (this.sessionPromises.get(sessionKey) === chainedPromise) {
          this.sessionPromises.delete(sessionKey);
        }
      });

      return result;
    } else {
      // 没有正在执行的任务，直接执行
      const promise = executeInternal().finally(() => {
        // 执行完成后清理
        if (this.sessionPromises.get(sessionKey) === promise) {
          this.sessionPromises.delete(sessionKey);
        }
      });

      this.sessionPromises.set(sessionKey, promise);
      return promise;
    }
  }

  /**
   * 发送消息（兼容接口）
   */
  async sendMessage(
    userId: string,
    prompt: string,
    groupId?: string,
    options: {
      imagePath?: string;
      attachmentPath?: string;
      onProgress?: (chunk: string) => void;
      timeout?: number;
    } = {}
  ): Promise<string> {
    return this.execute(prompt, {
      userId,
      groupId,
      ...options,
    });
  }

  /**
   * 清理资源（一次性模式无需清理）
   */
  cleanup(): void {
    logger.info('[CliSession] 清理完成');
  }

  /**
   * 获取统计信息（兼容接口）
   */
  getStats(): { totalSessions: number } {
    return { totalSessions: 0 };
  }

  /**
   * 创建新任务（重置会话，开始新对话）
   */
  async newTask(userId: string, groupId?: string): Promise<string> {
    // 重置会话，开始新的对话
    this.resetSession(userId, groupId);
    // 返回新会话 ID
    return this.getOrCreateSessionId(userId, groupId);
  }
}
