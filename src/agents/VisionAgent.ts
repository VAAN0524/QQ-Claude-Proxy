/**
 * VisionAgent - 使用智谱 AI 官方 MCP Server 进行图片分析
 *
 * 集成官方 @z_ai/mcp-server，提供以下功能：
 * - 图片内容分析
 * - OCR 文字提取
 * - 错误截图诊断
 * - 技术图表理解
 * - UI 界面分析
 * - 数据可视化分析
 * - UI 对比检查
 * - 视频场景解析
 */

import { logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import type {
  IAgent,
  AgentConfig,
  AgentMessage,
  AgentContext,
  AgentResponse,
} from './base/Agent.js';
import { AgentCapability } from './base/Agent.js';
import { ZaiMcpClient } from './ZaiMcpClient.js';

/**
 * Vision Agent 配置选项
 */
export interface VisionAgentOptions {
  /** 智谱 AI API Key */
  apiKey: string;
  /** 服务平台 (ZHIPU 或 ZAI) */
  mode?: 'ZHIPU' | 'ZAI';
  /** 是否自动连接 MCP Server */
  autoConnect?: boolean;
  /** 请求超时时间（毫秒） */
  requestTimeout?: number;
}

/**
 * Vision Agent - 图片分析专家
 */
export class VisionAgent implements IAgent {
  readonly id = 'vision';
  readonly name = 'Vision Agent';
  readonly description = '图片分析专家。使用智谱 AI 官方 MCP Server 进行图片内容分析、OCR 文字提取、错误诊断和图表理解。';
  readonly capabilities: AgentCapability[] = [
    AgentCapability.Analyze,
    AgentCapability.General,
  ];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 90,
    timeout: 120000, // 2 分钟
  };

  private apiKey: string;
  private mode: string;
  private mcpClient: ZaiMcpClient;
  private autoConnect: boolean;
  private requestTimeout: number;

  constructor(options: VisionAgentOptions) {
    this.apiKey = options.apiKey;
    this.mode = options.mode || 'ZHIPU';
    this.autoConnect = options.autoConnect !== false;
    this.requestTimeout = options.requestTimeout || 300000; // 默认 5 分钟

    // 创建 MCP 客户端
    this.mcpClient = new ZaiMcpClient({
      apiKey: this.apiKey,
      mode: this.mode as 'ZHIPU' | 'ZAI',
      requestTimeout: this.requestTimeout,
    });

    logger.info(`[VisionAgent] 初始化完成 (模式: ${this.mode}, MCP: 官方 Server, 超时: ${this.requestTimeout}ms)`);
  }

  /**
   * 初始化 - 连接 MCP Server
   */
  async initialize(): Promise<void> {
    if (this.autoConnect) {
      try {
        await this.mcpClient.connect();
        logger.info('[VisionAgent] MCP Server 连接成功');

        // 打印可用工具
        const tools = this.mcpClient.getAvailableTools();
        logger.info(`[VisionAgent] 可用工具: ${tools.map(t => t.name).join(', ')}`);
      } catch (error) {
        logger.error(`[VisionAgent] MCP Server 连接失败: ${error}`);
        throw error;
      }
    }
  }

  /**
   * 检查是否能处理该任务
   */
  canHandle(message: AgentMessage): number {
    const content = message.content;

    // 检查是否包含图片
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === 'image_url') {
          return 1.0;
        }
      }
    }

    // 检查附件
    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        if (attachment.type === 'image' ||
            ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(attachment.type)) {
          return 1.0;
        }
      }
    }

    // 检查文本内容是否提到图片相关任务
    if (typeof content === 'string') {
      const keywords = [
        '图片', '截图', '分析图片', '识别图片', 'OCR',
        '提取文字', '图片内容', '看这张图', '这张图片',
        'image', 'picture', 'screenshot', 'OCR'
      ];
      const lowerContent = content.toLowerCase();
      for (const keyword of keywords) {
        if (lowerContent.includes(keyword.toLowerCase())) {
          return 0.8;
        }
      }
    }

    return 0;
  }

  /**
   * 处理消息
   */
  async process(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    try {
      logger.info(`[VisionAgent] 处理消息`);

      // 确保 MCP 客户端已连接
      if (!this.mcpClient.isClientConnected()) {
        await this.mcpClient.connect();
      }

      // 提取图片和任务描述
      const { images, task } = await this.extractImagesAndTask(message, context);

      if (images.length === 0) {
        return {
          content: '未找到图片。请提供需要分析的图片。',
          agentId: this.id,
        };
      }

      // 分析第一张图片
      const imagePath = images[0];

      // 根据任务选择合适的分析方法
      const result = await this.analyzeImage(imagePath, task);

      return {
        content: result,
        agentId: this.id,
      };
    } catch (error) {
      logger.error(`[VisionAgent] 处理失败: ${error}`);
      return {
        content: `图片分析失败: ${error instanceof Error ? error.message : String(error)}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 提取图片和任务描述
   */
  private async extractImagesAndTask(
    message: AgentMessage,
    context: AgentContext
  ): Promise<{ images: string[]; task: string }> {
    const images: string[] = [];
    let task = '';

    const content = message.content;

    // 处理附件中的图片
    if (message.attachments && message.attachments.length > 0) {
      logger.info(`[VisionAgent] 处理 ${message.attachments.length} 个附件`);

      for (const attachment of message.attachments) {
        if (attachment.type === 'image' ||
            ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(attachment.type)) {
          const imagePath = attachment.path;
          if (imagePath) {
            const fullPath = path.isAbsolute(imagePath)
              ? imagePath
              : path.join(context.workspacePath || process.cwd(), imagePath);

            logger.info(`[VisionAgent] 加载附件图片: ${fullPath}`);

            // 验证文件存在
            try {
              await fs.access(fullPath);
              images.push(fullPath);
            } catch {
              logger.warn(`[VisionAgent] 图片文件不存在: ${fullPath}`);
            }
          }
        }
      }
    }

    // 处理 content 中的图片（数组格式）
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === 'image_url') {
          let imageUrl = item.image_url?.url || '';

          // 处理不同格式的图片路径
          if (imageUrl.startsWith('file://')) {
            const filePath = decodeURIComponent(imageUrl.substring(7));
            images.push(filePath);
          } else if (imageUrl.startsWith('data:image')) {
            // Base64 格式，保存为临时文件
            const tempPath = await this.saveBase64Image(imageUrl);
            images.push(tempPath);
          } else if (imageUrl.startsWith('/') || imageUrl.startsWith('.')) {
            // 相对路径
            const fullPath = path.join(context.workspacePath || process.cwd(), imageUrl);
            images.push(fullPath);
          }
        } else if (item.type === 'text') {
          task += item.text || '';
        }
      }
    } else if (typeof content === 'string') {
      // 提取任务描述
      task = content.replace(/^[图片:|分析图片:]?\s*/, '').trim();
    }

    // 如果没有明确任务，使用默认任务
    if (!task) {
      task = '请详细描述这张图片的内容';
    }

    logger.info(`[VisionAgent] 提取结果: ${images.length} 张图片, 任务: ${task.substring(0, 50)}...`);

    return { images, task };
  }

  /**
   * 保存 Base64 图片为临时文件
   */
  private async saveBase64Image(dataUrl: string): Promise<string> {
    const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error('无效的 Base64 图片格式');
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64 = matches[2];
    const buffer = Buffer.from(base64, 'base64');

    // 保存到临时目录
    const tempDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(tempDir, { recursive: true });

    const filename = `vision_${Date.now()}.${ext}`;
    const tempPath = path.join(tempDir, filename);

    await fs.writeFile(tempPath, buffer);
    logger.info(`[VisionAgent] 保存 Base64 图片: ${tempPath}`);

    return tempPath;
  }

  /**
   * 分析图片
   */
  private async analyzeImage(imagePath: string, task: string): Promise<string> {
    const lowerTask = task.toLowerCase();

    // 根据任务类型选择合适的 MCP 工具
    if (lowerTask.includes('ocr') || lowerTask.includes('提取文字') || lowerTask.includes('文字')) {
      if (this.mcpClient.hasTool('extract_text_from_screenshot')) {
        return await this.mcpClient.extractText(imagePath);
      }
    }

    if (lowerTask.includes('错误') || lowerTask.includes('error') || lowerTask.includes('bug')) {
      if (this.mcpClient.hasTool('diagnose_error_screenshot')) {
        return await this.mcpClient.diagnoseError(imagePath);
      }
    }

    if (lowerTask.includes('架构') || lowerTask.includes('流程') || lowerTask.includes('图表') ||
        lowerTask.includes('diagram') || lowerTask.includes('架构图')) {
      if (this.mcpClient.hasTool('understand_technical_diagram')) {
        return await this.mcpClient.understandDiagram(imagePath);
      }
    }

    if (lowerTask.includes('ui') || lowerTask.includes('界面') || lowerTask.includes('代码')) {
      if (this.mcpClient.hasTool('ui_to_artifact')) {
        const outputFormat = lowerTask.includes('代码') ? 'code' : 'description';
        return await this.mcpClient.uiToArtifact(imagePath, outputFormat);
      }
    }

    if (lowerTask.includes('数据') || lowerTask.includes('图表') || lowerTask.includes('统计')) {
      if (this.mcpClient.hasTool('analyze_data_visualization')) {
        return await this.mcpClient.analyzeDataViz(imagePath);
      }
    }

    // 默认使用通用图像分析
    if (this.mcpClient.hasTool('analyze_image')) {
      return await this.mcpClient.analyzeImage(imagePath, task);
    }

    throw new Error('没有可用的图像分析工具');
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.mcpClient.disconnect();
    logger.info('[VisionAgent] 已清理资源');
  }
}

export default VisionAgent;
