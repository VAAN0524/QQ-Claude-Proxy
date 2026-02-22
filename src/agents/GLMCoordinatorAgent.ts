/**
 * GLMCoordinatorAgent - 使用智谱AI GLM-4.7 的主协调 Agent
 *
 * 使用智谱AI API（OpenAI兼容格式），支持 Tool Use 调用子 Agent
 * 负责任务分解、协调、汇总
 */

import { logger } from '../utils/logger.js';
import { SharedContext } from './SharedContext.js';
import type {
  IAgent,
  AgentConfig,
  AgentMessage,
  AgentContext,
  AgentResponse,
} from './base/Agent.js';
import { AgentCapability } from './base/Agent.js';
import { createHmac, randomBytes, createSign } from 'crypto';
import { promises as fs, existsSync, mkdirSync } from 'fs';
import * as crypto from 'crypto';
import path from 'path';

// File Storage 处理图片下载和存储
interface StoredFile {
  id: string;
  originalName: string;
  storedPath: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

class ImageStorage {
  private basePath: string;
  private files: Map<string, StoredFile> = new Map();

  constructor(basePath: string) {
    this.basePath = basePath;
    // 确保 images 目录存在
    const imagesDir = path.join(basePath, 'images');
    if (!existsSync(imagesDir)) {
      mkdirSync(imagesDir, { recursive: true });
    }
  }

  /**
   * 从 URL 下载并存储图片
   * 支持 http(s):// 和 file:// 协议
   */
  async storeFromUrl(url: string, filename: string): Promise<StoredFile> {
    const id = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(filename) || '.jpg';
    const storedFileName = `${id}${ext}`;
    const storedPath = path.join(this.basePath, 'images', storedFileName);

    logger.info(`[ImageStorage] 处理图片: ${url} -> ${storedPath}`);

    let buffer: Buffer;

    // 检查是否是 file:// 协议
    if (url.startsWith('file://')) {
      // 从 file:// URL 提取文件路径
      const filePath = decodeURIComponent(url.substring(7)); // 移除 'file://' 前缀
      logger.info(`[ImageStorage] 读取本地文件: ${filePath}`);

      // 直接读取本地文件
      try {
        buffer = await fs.readFile(filePath);
      } catch (error) {
        throw new Error(`读取本地文件失败: ${filePath} - ${error}`);
      }
    } else {
      // 使用 fetch 下载 HTTP(S) 图片
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP 错误: ${response.status}`);
      }
      buffer = Buffer.from(await response.arrayBuffer());
    }

    // 保存到本地
    await fs.writeFile(storedPath, buffer);

    // 检测 MIME 类型
    const mimeType = this.detectMimeType(buffer, ext);

    const storedFile: StoredFile = {
      id,
      originalName: filename,
      storedPath,
      mimeType,
      size: buffer.length,
      createdAt: new Date(),
    };

    this.files.set(id, storedFile);
    return storedFile;
  }

  /**
   * 检测 MIME 类型
   */
  private detectMimeType(buffer: Buffer, ext: string): string {
    const extMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    return extMap[ext.toLowerCase()] || 'image/jpeg';
  }

  /**
   * 读取图片并转换为 base64
   */
  async readAsBase64(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('base64');
  }
}

/**
 * GLM Coordinator Agent 配置选项
 */
export interface GLMCoordinatorAgentOptions {
  /** 智谱AI API Key */
  apiKey: string;
  /** API Base URL */
  baseUrl?: string;
  /** 使用的模型 */
  model?: string;
  /** 最大 tokens */
  maxTokens?: number;
  /** 共享上下文 */
  sharedContext: SharedContext;
  /** 子 Agent 注册表 */
  subAgents: Map<string, IAgent>;
}

/**
 * 内容类型
 */
type ContentBlock = string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;

/**
 * 聊天消息
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: ContentBlock;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/**
 * 工具调用
 */
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 工具定义
 */
interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

/**
 * API 响应
 */
interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls: ToolCall[] | null;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * GLM Coordinator Agent - 主协调 Agent
 */
export class GLMCoordinatorAgent implements IAgent {
  readonly id = 'glm-coordinator';
  readonly name = 'GLM Coordinator Agent';
  readonly description = '智能任务协调助手（基于智谱AI GLM-4.7），可调用专门的子 Agent 协助完成任务';
  readonly capabilities: AgentCapability[] = [
    AgentCapability.General,
    AgentCapability.Complex,
    AgentCapability.Code,
    AgentCapability.Web,
  ];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 100,
    timeout: 300000,
  };

  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private sharedContext: SharedContext;
  private subAgents: Map<string, IAgent>;
  private imageStorage: ImageStorage;

  // 待发送的文件列表
  private pendingFiles: string[] = [];

  // 工具名称到 Agent ID 的映射
  private readonly toolToAgentMap: Record<string, string> = {
    'run_code_agent': 'code',
    'run_browser_agent': 'browser',
    'run_shell_agent': 'shell',
    'run_websearch_agent': 'websearch',
    'run_data_analysis_agent': 'data',
  };

  constructor(options: GLMCoordinatorAgentOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://open.bigmodel.cn/api/paas/v4/';
    this.model = options.model || 'glm-4.7';
    this.maxTokens = options.maxTokens || 8192;
    this.sharedContext = options.sharedContext;
    this.subAgents = options.subAgents;

    // 初始化图片存储（使用 workspace 作为存储路径）
    this.imageStorage = new ImageStorage(process.cwd());

    // 检查是否使用 Coding Plan 端点
    // Coding Plan 使用直接 API Key 认证，普通端点可能需要 JWT
    const isCodingPlan = this.baseUrl.includes('/coding/');
    this.useJwtAuth = !isCodingPlan && this.apiKey.includes('.');

    logger.info(`[GLMCoordinatorAgent] 初始化完成 (模型: ${this.model})`);
    logger.info(`[GLMCoordinatorAgent] API 地址: ${this.baseUrl}`);
    logger.info(`[GLMCoordinatorAgent] 认证方式: ${isCodingPlan ? 'Coding Plan (直接 API Key)' : (this.useJwtAuth ? 'JWT' : 'API Key')}`);
    logger.info(`[GLMCoordinatorAgent] 图片存储路径: ${process.cwd()}/images`);
    logger.info(`[GLMCoordinatorAgent] 已注册 ${this.subAgents.size} 个子 Agent`);
  }

  private useJwtAuth: boolean;

  /**
   * 检查是否能处理该任务
   */
  canHandle(message: AgentMessage): number {
    return 1.0;
  }

  /**
   * 生成智谱AI的 JWT Token
   * API Key 格式: id.secret
   */
  private generateToken(): string {
    const [id, secret] = this.apiKey.split('.');
    if (!id || !secret) {
      throw new Error('Invalid GLM API Key format. Expected: id.secret');
    }

    const now = Math.floor(Date.now() / 1000); // 秒级时间戳
    const exp = now + 3600; // 1小时后过期

    const header = {
      alg: 'HS256',
      sign_type: 'SIGN',
    };

    const payload = {
      api_key: id,
      exp: exp,
      timestamp: now,
    };

    // Base64Url 编码
    const base64UrlEncode = (str: string) => {
      return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));

    // 生成签名
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', secret)
      .update(dataToSign)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return `${dataToSign}.${signature}`;
  }

  /**
   * 从消息内容中解析嵌入的图片 (file:// 协议)
   */
  private parseEmbeddedImages(content: string): Array<{ path: string; name: string }> {
    const images: Array<{ path: string; name: string }> = [];
    // 匹配 <img src="file://..." /> 格式
    const imgRegex = /<img\s+src="file:\/\/([^"]+)"\s*\/?>/gi;
    let match;

    while ((match = imgRegex.exec(content)) !== null) {
      const filePath = match[1];
      // Windows 路径需要转换反斜杠
      const normalizedPath = filePath.replace(/\\/g, '/');
      const fileName = normalizedPath.split('/').pop() || 'image';
      images.push({ path: `file://${normalizedPath}`, name: fileName });
    }

    if (images.length > 0) {
      logger.info(`[GLMCoordinatorAgent] 从 content 中解析出 ${images.length} 个嵌入图片`);
    }

    return images;
  }

  /**
   * 处理消息
   */
  async process(
    message: AgentMessage,
    context: AgentContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    // 清空待发送文件列表
    this.pendingFiles = [];

    try {
      logger.info(`[GLMCoordinatorAgent] 处理消息: ${message.content.substring(0, 50)}...`);

      // 处理空内容情况（如只发送图片）
      let content = message.content;
      if (!content || content.trim() === '') {
        if (message.attachments && message.attachments.length > 0) {
          // 有附件但无文字内容，添加默认提示
          const attachmentTypes = message.attachments.map(a => a.type).join(', ');
          content = `请帮我查看这张${attachmentTypes}图片`;
        } else {
          // 完全空消息，返回提示
          return {
            content: '请发送文字内容或图片，我会帮你处理。',
            agentId: this.id,
          };
        }
      }

      // 检查是否有图片附件
      const imageAttachments = message.attachments?.filter(a =>
        a.type === 'image' ||
        ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(a.type)
      ) || [];

      // 检查 content 中是否有嵌入的图片
      const embeddedImages = this.parseEmbeddedImages(content);

      // 合并两种来源的图片
      const allImages = [
        ...imageAttachments.map(a => ({ path: a.path, name: a.name || 'image', type: a.type })),
        ...embeddedImages.map(img => ({ ...img, type: 'image' as const }))
      ];

      logger.info(`[GLMCoordinatorAgent] 图片统计: attachments=${imageAttachments.length}, embedded=${embeddedImages.length}, total=${allImages.length}`);

      // 如果有嵌入图片，从 content 中移除 <img> 标签，避免污染提示词
      if (embeddedImages.length > 0) {
        content = content.replace(/<img\s+src="file:\/\/[^"]+"\s*\/?>/gi, '').trim();
        // 如果清理后内容为空，添加默认提示
        if (!content || content.trim() === '') {
          content = '请帮我查看这张图片';
        }
        logger.info(`[GLMCoordinatorAgent] 清理后的 content: ${content.substring(0, 50)}...`);
      }

      // 如果有图片，使用GLM-4V模型
      let useVisionModel = allImages.length > 0;
      let visionContent: ContentBlock = content;

      if (useVisionModel) {
        logger.info(`[GLMCoordinatorAgent] 检测到 ${allImages.length} 个图片，使用视觉模型`);
        // 构建多模态内容
        const contentArray: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = [
          { type: 'text', text: content }
        ];

        // 处理图片：下载到本地，然后转换为 base64
        for (const imageInfo of allImages) {
          try {
            logger.info(`[GLMCoordinatorAgent] 处理图片: ${imageInfo.name || 'unnamed'}`);

            // 下载并存储图片
            const storedFile = await this.imageStorage.storeFromUrl(
              imageInfo.path,
              imageInfo.name || `image_${Date.now()}`
            );

            // 读取本地文件并转换为 base64
            const base64 = await this.imageStorage.readAsBase64(storedFile.storedPath);
            const mimeType = storedFile.mimeType;

            contentArray.push({
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` }
            });

            logger.info(`[GLMCoordinatorAgent] 图片已处理: ${storedFile.originalName} -> ${storedFile.storedPath}`);
          } catch (error) {
            logger.error(`[GLMCoordinatorAgent] 图片处理失败: ${error}`);
            // 继续处理其他图片
          }
        }

        visionContent = contentArray;
      }

      // 添加用户消息到共享上下文
      this.sharedContext.addConversation('user', content);

      // 构建消息历史（使用处理后的内容）
      const messages = this.buildMessages(message, visionContent);

      // 获取可用工具
      const tools = this.getAvailableTools();

      // 调用 GLM API
      const response = await this.callGLMAPI(messages, this.buildSystemPrompt(context), tools);

      // 处理响应
      let finalResponse: string;

      if (response.choices[0]?.finish_reason === 'tool_calls' && response.choices[0]?.message?.tool_calls) {
        // 需要调用工具
        logger.info(`[GLMCoordinatorAgent] 检测到工具调用请求`);
        const toolResults = await this.executeTools(response.choices[0].message.tool_calls, context);

        // 继续对话，传入工具结果
        finalResponse = await this.continueWithToolResults(messages, response.choices[0].message.tool_calls, toolResults, context);
      } else {
        // 直接返回文本响应
        finalResponse = response.choices[0]?.message?.content || '无响应';
      }

      // 添加助手响应到共享上下文
      this.sharedContext.addConversation('assistant', finalResponse, this.id);

      const elapsed = Date.now() - startTime;
      logger.info(`[GLMCoordinatorAgent] 处理完成，耗时: ${elapsed}ms`);

      return {
        content: finalResponse,
        agentId: this.id,
        filesToSend: this.pendingFiles.length > 0 ? [...this.pendingFiles] : undefined,
      };

    } catch (error) {
      logger.error(`[GLMCoordinatorAgent] 处理失败: ${error}`);
      return {
        content: `❌ [GLM Coordinator Agent] 处理失败: ${error instanceof Error ? error.message : String(error)}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 调用 GLM API
   */
  private async callGLMAPI(
    messages: ChatMessage[],
    systemPrompt: string,
    tools: Tool[]
  ): Promise<ChatCompletionResponse> {
    // 构建完整的消息数组（包含系统提示）
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const requestBody = {
      model: this.model,
      messages: fullMessages,
      temperature: 0.7,
      max_tokens: this.maxTokens,
      tools: tools.length > 0 ? tools : undefined,
    };

    logger.debug(`[GLMCoordinatorAgent] API 请求: ${JSON.stringify(requestBody).substring(0, 500)}...`);

    // 移除 baseUrl 末尾的斜杠，确保路径拼接正确
    const baseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const apiUrl = `${baseUrl}/chat/completions`;

    logger.debug(`[GLMCoordinatorAgent] API URL: ${apiUrl}`);
    logger.debug(`[GLMCoordinatorAgent] Model: ${this.model}`);

    // 根据认证方式生成 token
    let token: string;
    if (this.useJwtAuth) {
      token = this.generateToken();
      logger.debug(`[GLMCoordinatorAgent] Generated JWT token (length: ${token.length})`);
    } else {
      token = this.apiKey;
      logger.debug(`[GLMCoordinatorAgent] Using API Key directly (length: ${token.length})`);
    }

    // 检查是否需要使用视觉模型（消息中包含图片）
    const hasVisionContent = messages.some(msg =>
      Array.isArray(msg.content) && msg.content.some(block => block.type === 'image_url')
    );

    // 如果有视觉内容，使用 GLM-4V 模型
    const model = hasVisionContent ? 'glm-4v' : this.model;
    requestBody.model = model;

    logger.debug(`[GLMCoordinatorAgent] 使用模型: ${model}${hasVisionContent ? ' (视觉)' : ''}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[GLMCoordinatorAgent] API 错误响应 (${response.status}): ${errorText}`);
      throw new Error(`GLM API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json() as ChatCompletionResponse;
    logger.debug(`[GLMCoordinatorAgent] API 响应: ${JSON.stringify(data).substring(0, 500)}...`);
    return data;
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(context: AgentContext): string {
    const enabledAgents = this.getEnabledAgentNames();
    const platform = process.platform;
    const isWindows = platform === 'win32';

    return `你是一个智能任务协调助手，可以调用专门的子 Agent 来协助完成任务。

**当前工作目录**: ${context.workspacePath}
**存储目录**: ${context.storagePath}
**运行平台**: ${isWindows ? 'Windows' : platform}

**可用的子 Agent**:
${enabledAgents.map(name => `- ${name}`).join('\n')}

**工作流程**:
1. 首先理解用户需求
2. 判断是否需要调用子 Agent：
   - 简单问题直接回答，无需调用工具
   - 代码相关任务使用 run_code_agent
   - 网页相关任务使用 run_browser_agent
   - 命令执行使用 run_shell_agent
   - 搜索问题使用 run_websearch_agent
   - 数据分析使用 run_data_analysis_agent
3. 调用相应的工具（可以多次调用）
4. 汇总结果，返回给用户

**文件发送**:
- 如果用户请求发送文件（例如"把xxx发给我"），使用 send_file 工具
- send_file 参数 filePath 可以是：
  • 工作区文件：如 "workspace/01-intro.mp4" 或 "output/result.png"
  • 上传区文件：如 "uploads/document.pdf"
  • 相对路径：直接文件名如 "01-intro.mp4"

**图片理解**:
- 你支持直接理解图片内容，包括截图、照片等
- 用户发送图片时，请详细描述图片内容并根据用户需求提供帮助

**命令执行说明**:
${isWindows ? `- 在 Windows 上，优先使用 Node.js 风格的命令
- 查找文件：使用 find 命令（Git Bash）或 dir 命令
- 示例：find . -name "*.mp4" 或 dir /s /b *.mp4` : `- 在 Unix/Linux 上，使用标准 shell 命令
- 查找文件：find 命令
- 示例：find . -name "*.mp4"`}

**注意事项**:
- 保持回答简洁明了
- 如果子 Agent 的结果需要改进，可以在汇总时进行
- 对于复杂任务，可以分解后逐步执行
- 执行命令前要确保安全`;
  }

  /**
   * 构建消息历史
   */
  private buildMessages(message: AgentMessage, contentOverride?: ContentBlock): ChatMessage[] {
    // 使用 override 内容或原始内容
    const content = contentOverride !== undefined ? contentOverride : message.content;

    // 从共享上下文获取历史消息
    const historyMessages = this.sharedContext.getAnthropicMessages();

    // 如果历史消息为空，使用当前消息
    if (historyMessages.length === 0) {
      return [{ role: 'user', content }];
    }

    // 检查最后一条消息是否是当前用户的消息，避免重复
    const lastMsg = historyMessages[historyMessages.length - 1];
    // 对于图片消息，我们始终添加新的消息
    const isVisionContent = Array.isArray(content);
    if (!isVisionContent && lastMsg.role === 'user' && lastMsg.content === content) {
      return historyMessages as ChatMessage[];
    }

    // 添加当前用户消息
    return [
      ...historyMessages,
      { role: 'user', content },
    ] as ChatMessage[];
  }

  /**
   * 获取可用的工具定义
   */
  private getAvailableTools(): Tool[] {
    const tools: Tool[] = [];

    // Code Agent
    if (this.subAgents.has('code')) {
      tools.push({
        type: 'function',
        function: {
          name: 'run_code_agent',
          description: '执行代码相关任务：编写、分析、调试、优化代码',
          parameters: {
            type: 'object',
            properties: {
              task: {
                type: 'string',
                description: '具体的代码任务描述，例如：写个快速排序算法',
              },
              code: {
                type: 'string',
                description: '可选的代码片段，用于分析或调试',
              },
            },
            required: ['task'],
          },
        },
      });
    }

    // Browser Agent
    if (this.subAgents.has('browser')) {
      tools.push({
        type: 'function',
        function: {
          name: 'run_browser_agent',
          description: '网页操作：访问网页、截图、提取信息、填充表单',
          parameters: {
            type: 'object',
            properties: {
              task: {
                type: 'string',
                description: '具体的网页操作任务，例如：访问 https://github.com 并截图',
              },
              url: {
                type: 'string',
                description: '可选的 URL，如果是纯访问任务',
              },
            },
            required: ['task'],
          },
        },
      });
    }

    // Shell Agent
    if (this.subAgents.has('shell')) {
      tools.push({
        type: 'function',
        function: {
          name: 'run_shell_agent',
          description: '执行系统命令：谨慎使用，仅用于安全的命令操作',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: '要执行的命令，例如：npm install',
              },
            },
            required: ['command'],
          },
        },
      });
    }

    // Web Search Agent
    if (this.subAgents.has('websearch')) {
      tools.push({
        type: 'function',
        function: {
          name: 'run_websearch_agent',
          description: '网络搜索：搜索问题、查找资料、收集信息',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '搜索关键词或问题',
              },
            },
            required: ['query'],
          },
        },
      });
    }

    // Data Analysis Agent
    if (this.subAgents.has('data')) {
      tools.push({
        type: 'function',
        function: {
          name: 'run_data_analysis_agent',
          description: '数据分析：分析文件、统计数据、生成报告',
          parameters: {
            type: 'object',
            properties: {
              task: {
                type: 'string',
                description: '分析任务描述，例如：分析 data.csv 文件',
              },
              file: {
                type: 'string',
                description: '可选的文件路径',
              },
            },
            required: ['task'],
          },
        },
      });
    }

    // File Send Tool - 发送文件给用户
    tools.push({
      type: 'function',
      function: {
        name: 'send_file',
        description: '发送文件给用户：将工作区或存储区的文件发送到用户QQ',
        parameters: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: '要发送的文件路径，相对于工作区的路径，例如：output/result.png 或 uploads/document.pdf',
            },
          },
          required: ['filePath'],
        },
      },
    });

    // Read File Tool - 读取文件内容（支持图片和文本）
    tools.push({
      type: 'function',
      function: {
        name: 'read_file',
        description: '读取文件内容：支持文本文件和图片文件（图片以 base64 格式返回）',
        parameters: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: '文件的绝对路径或相对于工作区的路径',
            },
          },
          required: ['filePath'],
        },
      },
    });

    // Write File Tool - 写入文件内容
    tools.push({
      type: 'function',
      function: {
        name: 'write_file',
        description: '写入文件内容。如果文件不存在会创建，如果存在会覆盖。',
        parameters: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: '文件的绝对路径或相对于工作区的路径',
            },
            content: {
              type: 'string',
              description: '要写入的内容',
            },
            append: {
              type: 'boolean',
              description: '是否追加模式，默认 false（覆盖）',
            },
          },
          required: ['filePath', 'content'],
        },
      },
    });

    // List Directory Tool - 列出目录内容
    tools.push({
      type: 'function',
      function: {
        name: 'list_directory',
        description: '列出目录内容。返回目录中所有文件和子目录的列表。',
        parameters: {
          type: 'object',
          properties: {
            directoryPath: {
              type: 'string',
              description: '目录的绝对路径或相对于工作区的路径',
            },
            recursive: {
              type: 'boolean',
              description: '是否递归列出子目录，默认 false',
            },
          },
          required: ['directoryPath'],
        },
      },
    });

    return tools;
  }

  /**
   * 执行工具调用
   */
  private async executeTools(
    toolCalls: ToolCall[],
    context: AgentContext
  ): Promise<Array<{ toolCallId: string; result: string; agentId: string }>> {
    const results: Array<{ toolCallId: string; result: string; agentId: string }> = [];

    for (const toolCall of toolCalls) {
      // 处理 send_file 工具（特殊处理，不调用子Agent）
      if (toolCall.function.name === 'send_file') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const filePath = args.filePath as string;

          // 解析文件路径
          let fullPath: string;
          if (filePath.startsWith('uploads/') || filePath.startsWith('workspace/')) {
            // 相对路径，需要完整路径
            fullPath = path.join(process.cwd(), filePath);
          } else if (path.isAbsolute(filePath)) {
            fullPath = filePath;
          } else {
            // 默认从工作区查找
            fullPath = path.join(context.workspacePath, filePath);
          }

          // 检查文件是否存在
          try {
            await fs.access(fullPath);
            // 添加到待发送文件列表
            this.pendingFiles.push(fullPath);
            logger.info(`[GLMCoordinatorAgent] 添加文件到发送队列: ${fullPath}`);
            results.push({
              toolCallId: toolCall.id,
              result: `文件已添加到发送队列: ${path.basename(fullPath)}`,
              agentId: 'glm-coordinator',
            });
          } catch {
            results.push({
              toolCallId: toolCall.id,
              result: `错误：文件不存在 - ${filePath}`,
              agentId: 'glm-coordinator',
            });
          }
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] send_file 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 read_file 工具（本地文件读取）
      if (toolCall.function.name === 'read_file') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const filePath = args.filePath as string;

          // 解析文件路径
          let fullPath: string;
          if (filePath.startsWith('uploads/') || filePath.startsWith('workspace/') || filePath.startsWith('images/')) {
            // 相对路径，需要完整路径
            fullPath = path.join(process.cwd(), filePath);
          } else if (path.isAbsolute(filePath)) {
            fullPath = filePath;
          } else {
            // 默认从工作区查找
            fullPath = path.join(context.workspacePath, filePath);
          }

          // 检查文件是否存在
          try {
            await fs.access(fullPath);

            // 检查是否是图片文件
            const ext = path.extname(fullPath).toLowerCase();
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

            if (imageExtensions.includes(ext)) {
              // 读取图片并转换为 base64
              const buffer = await fs.readFile(fullPath);
              const base64 = buffer.toString('base64');
              const mimeType = this.getMimeType(ext);
              const result = `[Image file: ${path.basename(fullPath)}]\nData: data:${mimeType};base64,${base64}`;
              results.push({
                toolCallId: toolCall.id,
                result,
                agentId: 'glm-coordinator',
              });
              logger.info(`[GLMCoordinatorAgent] read_file 成功读取图片: ${fullPath}`);
            } else {
              // 读取文本文件
              const content = await fs.readFile(fullPath, 'utf-8');
              const stats = await fs.stat(fullPath);
              const result = `File: ${fullPath}\nSize: ${stats.size} bytes\n\n${content}`;
              results.push({
                toolCallId: toolCall.id,
                result,
                agentId: 'glm-coordinator',
              });
              logger.info(`[GLMCoordinatorAgent] read_file 成功读取文件: ${fullPath}`);
            }
          } catch {
            results.push({
              toolCallId: toolCall.id,
              result: `错误：文件不存在 - ${filePath}`,
              agentId: 'glm-coordinator',
            });
          }
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] read_file 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 write_file 工具（本地文件写入）
      if (toolCall.function.name === 'write_file') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const filePath = args.filePath as string;
          const content = args.content as string;
          const append = args.append as boolean;

          // 解析文件路径
          let fullPath: string;
          if (filePath.startsWith('uploads/') || filePath.startsWith('workspace/') || filePath.startsWith('images/')) {
            fullPath = path.join(process.cwd(), filePath);
          } else if (path.isAbsolute(filePath)) {
            fullPath = filePath;
          } else {
            fullPath = path.join(context.workspacePath, filePath);
          }

          // 确保目录存在
          const dir = path.dirname(fullPath);
          try {
            await fs.access(dir);
          } catch {
            await fs.mkdir(dir, { recursive: true });
          }

          // 写入文件
          if (append) {
            await fs.appendFile(fullPath, content, 'utf-8');
          } else {
            await fs.writeFile(fullPath, content, 'utf-8');
          }

          const stats = await fs.stat(fullPath);
          const result = `File written successfully: ${fullPath}\nSize: ${stats.size} bytes`;
          results.push({
            toolCallId: toolCall.id,
            result,
            agentId: 'glm-coordinator',
          });
          logger.info(`[GLMCoordinatorAgent] write_file 成功写入文件: ${fullPath}`);
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] write_file 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理 list_directory 工具（列出目录内容）
      if (toolCall.function.name === 'list_directory') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const directoryPath = args.directoryPath as string;
          const recursive = args.recursive as boolean;

          // 解析目录路径
          let fullPath: string;
          if (directoryPath.startsWith('uploads/') || directoryPath.startsWith('workspace/') || directoryPath.startsWith('images/')) {
            fullPath = path.join(process.cwd(), directoryPath);
          } else if (path.isAbsolute(directoryPath)) {
            fullPath = directoryPath;
          } else {
            fullPath = path.join(context.workspacePath, directoryPath);
          }

          // 检查目录是否存在
          try {
            const stats = await fs.stat(fullPath);
            if (!stats.isDirectory()) {
              results.push({
                toolCallId: toolCall.id,
                result: `错误：路径不是目录 - ${directoryPath}`,
                agentId: 'glm-coordinator',
              });
              continue;
            }
          } catch {
            results.push({
              toolCallId: toolCall.id,
              result: `错误：目录不存在 - ${directoryPath}`,
              agentId: 'glm-coordinator',
            });
            continue;
          }

          // 列出目录内容
          const items = await this.listDirRecursive(fullPath, recursive ? 3 : 1, 0);
          const result = `Directory: ${fullPath}\n\n${items.join('\n')}`;
          results.push({
            toolCallId: toolCall.id,
            result,
            agentId: 'glm-coordinator',
          });
          logger.info(`[GLMCoordinatorAgent] list_directory 成功列出目录: ${fullPath}`);
        } catch (error) {
          logger.error(`[GLMCoordinatorAgent] list_directory 工具执行失败: ${error}`);
          results.push({
            toolCallId: toolCall.id,
            result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            agentId: 'glm-coordinator',
          });
        }
        continue;
      }

      // 处理子Agent工具
      const agentId = this.toolToAgentMap[toolCall.function.name];

      if (!agentId) {
        logger.warn(`[GLMCoordinatorAgent] 未知的工具: ${toolCall.function.name}`);
        results.push({
          toolCallId: toolCall.id,
          result: `错误：未知的工具 ${toolCall.function.name}`,
          agentId: 'unknown',
        });
        continue;
      }

      const agent = this.subAgents.get(agentId);
      if (!agent) {
        logger.warn(`[GLMCoordinatorAgent] 子 Agent 未找到: ${agentId}`);
        results.push({
          toolCallId: toolCall.id,
          result: `错误：子 Agent ${agentId} 未找到`,
          agentId,
        });
        continue;
      }

      try {
        logger.info(`[GLMCoordinatorAgent] 调用子 Agent: ${agentId}`);

        // 解析工具参数
        const args = JSON.parse(toolCall.function.arguments);

        // 构建子 Agent 消息
        const subMessage: AgentMessage = {
          channel: 'coordinator',
          userId: 'coordinator',
          content: this.buildSubAgentPrompt(toolCall.function.name, args),
          timestamp: new Date(),
        };

        // 调用子 Agent
        const subResponse = await agent.process(subMessage, context);

        // 保存工作状态到共享上下文
        this.sharedContext.setWorkState(agentId, subResponse.content);

        results.push({
          toolCallId: toolCall.id,
          result: subResponse.content,
          agentId,
        });

        logger.info(`[GLMCoordinatorAgent] 子 Agent ${agentId} 执行完成`);

      } catch (error) {
        logger.error(`[GLMCoordinatorAgent] 子 Agent ${agentId} 执行失败: ${error}`);
        results.push({
          toolCallId: toolCall.id,
          result: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
          agentId,
        });
      }
    }

    return results;
  }

  /**
   * 构建子 Agent 提示词
   */
  private buildSubAgentPrompt(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case 'run_code_agent':
        return args.task as string;

      case 'run_browser_agent':
        if (args.url) {
          return `访问 ${args.url}：${args.task}`;
        }
        return args.task as string;

      case 'run_shell_agent':
        return `执行命令: ${args.command}`;

      case 'run_websearch_agent':
        return `搜索: ${args.query}`;

      case 'run_data_analysis_agent':
        if (args.file) {
          return `分析文件 ${args.file}：${args.task}`;
        }
        return args.task as string;

      default:
        return JSON.stringify(args);
    }
  }

  /**
   * 继续对话，传入工具结果
   */
  private async continueWithToolResults(
    originalMessages: ChatMessage[],
    originalToolCalls: ToolCall[],
    toolResults: Array<{ toolCallId: string; result: string; agentId: string }>,
    context: AgentContext
  ): Promise<string> {
    // 构建新的消息数组
    const newMessages: ChatMessage[] = [
      ...originalMessages,
    ];

    // 添加原始的 tool_calls 和结果
    for (const toolCall of originalToolCalls) {
      // 添加 assistant 的工具调用消息
      newMessages.push({
        role: 'assistant',
        content: '',
        tool_calls: [toolCall],
      });

      // 查找对应的工具结果
      const result = toolResults.find(r => r.toolCallId === toolCall.id);
      if (result) {
        newMessages.push({
          role: 'tool',
          content: result.result,
          tool_call_id: toolCall.id,
        });
      }
    }

    // 检查是否还有更多工具调用需要处理
    // 调用 API 继续对话
    const response = await this.callGLMAPI(newMessages, this.buildSystemPrompt(context), []);

    // 检查是否还有工具调用
    if (response.choices[0]?.finish_reason === 'tool_calls' && response.choices[0]?.message?.tool_calls) {
      const moreResults = await this.executeTools(response.choices[0].message.tool_calls, context);
      return await this.continueWithToolResults(newMessages, response.choices[0].message.tool_calls, moreResults, context);
    }

    // 返回最终文本
    return response.choices[0]?.message?.content || '处理完成';
  }

  /**
   * 获取已启用的子 Agent 名称列表
   */
  private getEnabledAgentNames(): string[] {
    const names: string[] = [];

    if (this.subAgents.has('code')) {
      names.push('Code Agent (代码)');
    }
    if (this.subAgents.has('browser')) {
      names.push('Browser Agent (网页)');
    }
    if (this.subAgents.has('shell')) {
      names.push('Shell Agent (命令)');
    }
    if (this.subAgents.has('websearch')) {
      names.push('Web Search Agent (搜索)');
    }
    if (this.subAgents.has('data')) {
      names.push('Data Analysis Agent (数据分析)');
    }

    return names;
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    // 验证 API 连接
    try {
      logger.info('[GLMCoordinatorAgent] 开始验证 API 连接...');
      logger.debug(`[GLMCoordinatorAgent] 使用模型: ${this.model}`);
      logger.debug(`[GLMCoordinatorAgent] API 地址: ${this.baseUrl}`);

      const testMessages: ChatMessage[] = [
        { role: 'user', content: 'Hi' }
      ];

      logger.debug('[GLMCoordinatorAgent] 发送测试请求...');
      await this.callGLMAPI(testMessages, '你是谁？', []);

      logger.info('[GLMCoordinatorAgent] API 连接验证成功');
    } catch (error) {
      logger.error(`[GLMCoordinatorAgent] API 连接验证失败: ${error}`);
      if (error instanceof Error) {
        logger.error(`[GLMCoordinatorAgent] 错误详情: ${error.message}`);
        logger.error(`[GLMCoordinatorAgent] 错误堆栈: ${error.stack}`);
      }
      throw new Error(`GLM Coordinator Agent 初始化失败: ${error}`);
    }
  }

  /**
   * 清理响应内容中的 Markdown 格式
   * 将 **xxx** 格式替换为 [ xxx ] 格式
   */
  private cleanMarkdownFormat(text: string): string {
    // 匹配 **xxx** 格式并替换为 [ xxx ]
    return text.replace(/\*\*([^*]+)\*\*/g, '[ $1 ]');
  }

  /**
   * 获取 MIME 类型
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 递归列出目录
   */
  private async listDirRecursive(dir: string, maxDepth: number, currentDepth: number): Promise<string[]> {
    const result: string[] = [];
    const indent = '  '.repeat(currentDepth);

    try {
      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        const prefix = item.isDirectory() ? '[DIR]  ' : '[FILE] ';
        const suffix = item.isDirectory() ? '/' : '';
        result.push(`${indent}${prefix}${item.name}${suffix}`);

        // 递归处理子目录
        if (item.isDirectory() && currentDepth < maxDepth - 1) {
          const subDir = path.join(dir, item.name);
          const subItems = await this.listDirRecursive(subDir, maxDepth, currentDepth + 1);
          result.push(...subItems);
        }
      }
    } catch (error) {
      result.push(`${indent}[ERROR] Cannot read directory`);
    }

    return result;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    logger.info('[GLMCoordinatorAgent] 已清理资源');
  }
}

export default GLMCoordinatorAgent;
