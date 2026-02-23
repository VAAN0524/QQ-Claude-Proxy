/**
 * ZaiMcpClient - 智谱 AI 官方 MCP Server 客户端
 *
 * 连接官方 @z_ai/mcp-server，提供以下工具：
 * - image_analysis: 通用图像理解
 * - extract_text_from_screenshot: OCR 文字提取
 * - diagnose_error_screenshot: 错误截图诊断
 * - understand_technical_diagram: 技术图表理解
 * - ui_to_artifact: UI 截图转代码
 * - analyze_data_visualization: 数据可视化分析
 * - ui_diff_check: UI 对比检查
 * - video_analysis: 视频场景解析
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { logger } from '../utils/logger.js';

/**
 * MCP 客户端配置
 */
export interface ZaiMcpClientOptions {
  /** 智谱 API Key */
  apiKey: string;
  /** 服务平台 (ZHIPU 或 ZAI) */
  mode?: 'ZHIPU' | 'ZAI';
  /** 请求超时时间（毫秒），默认 5 分钟 */
  requestTimeout?: number;
}

/**
 * MCP 工具定义
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCP 客户端类
 */
export class ZaiMcpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private apiKey: string;
  private mode: string;
  private isConnected: boolean = false;
  private requestTimeout: number;

  // 可用工具缓存
  private availableTools: Map<string, McpTool> = new Map();

  constructor(options: ZaiMcpClientOptions) {
    this.apiKey = options.apiKey;
    this.mode = options.mode || 'ZHIPU';
    this.requestTimeout = options.requestTimeout || 300000; // 默认 5 分钟
  }

  /**
   * 连接 MCP Server
   */
  async connect(): Promise<void> {
    try {
      logger.info('[ZaiMcpClient] 正在连接官方 MCP Server...');

      // 创建 stdio transport
      this.transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@z_ai/mcp-server'],
        env: {
          Z_AI_API_KEY: this.apiKey,
          Z_AI_MODE: this.mode,
        },
      });

      // 创建客户端
      this.client = new Client({
        name: 'qq-claude-proxy',
        version: '1.0.0',
      }, {
        capabilities: {}
      });

      // 连接
      await this.client.connect(this.transport);
      this.isConnected = true;

      // 加载可用工具
      await this.loadTools();

      logger.info('[ZaiMcpClient] 已连接到官方 MCP Server');
    } catch (error) {
      logger.error(`[ZaiMcpClient] 连接失败: ${error}`);
      throw error;
    }
  }

  /**
   * 加载可用工具
   */
  private async loadTools(): Promise<void> {
    if (!this.client) {
      throw new Error('MCP 客户端未连接');
    }

    try {
      const response = await this.client.listTools();
      this.availableTools.clear();

      for (const tool of response.tools) {
        this.availableTools.set(tool.name, tool as McpTool);
        logger.debug(`[ZaiMcpClient] 加载工具: ${tool.name}`);
      }

      logger.info(`[ZaiMcpClient] 已加载 ${this.availableTools.size} 个工具`);
    } catch (error) {
      logger.error(`[ZaiMcpClient] 加载工具失败: ${error}`);
      throw error;
    }
  }

  /**
   * 调用工具
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    if (!this.client || !this.isConnected) {
      throw new Error('MCP 客户端未连接');
    }

    const tool = this.availableTools.get(toolName);
    if (!tool) {
      throw new Error(`工具不存在: ${toolName}`);
    }

    logger.info(`[ZaiMcpClient] 调用工具: ${toolName}`);

    // 创建超时 Promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`工具调用超时 (${this.requestTimeout}ms): ${toolName}`));
      }, this.requestTimeout);
    });

    try {
      // 使用 Promise.race 实现超时控制
      const result = await Promise.race([
        this.client.callTool({
          name: toolName,
          arguments: args,
        }),
        timeoutPromise,
      ]) as any;

      logger.info(`[ZaiMcpClient] 工具调用成功: ${toolName}`);
      return result;
    } catch (error) {
      logger.error(`[ZaiMcpClient] 工具调用失败: ${error}`);
      throw error;
    }
  }

  /**
   * 图像分析
   */
  async analyzeImage(imagePath: string, prompt?: string): Promise<string> {
    const result = await this.callTool('analyze_image', {
      image_source: imagePath,
      prompt: prompt || '请描述这张图片的内容',
    });

    return this.extractTextContent(result);
  }

  /**
   * OCR 文字提取
   */
  async extractText(imagePath: string): Promise<string> {
    const result = await this.callTool('extract_text_from_screenshot', {
      image_source: imagePath,
    });

    return this.extractTextContent(result);
  }

  /**
   * 错误截图诊断
   */
  async diagnoseError(imagePath: string): Promise<string> {
    const result = await this.callTool('diagnose_error_screenshot', {
      image_source: imagePath,
    });

    return this.extractTextContent(result);
  }

  /**
   * 技术图表理解
   */
  async understandDiagram(imagePath: string): Promise<string> {
    const result = await this.callTool('understand_technical_diagram', {
      image_source: imagePath,
    });

    return this.extractTextContent(result);
  }

  /**
   * UI 截图转代码
   */
  async uiToArtifact(imagePath: string, outputFormat?: 'code' | 'prompt' | 'spec' | 'description'): Promise<string> {
    const result = await this.callTool('ui_to_artifact', {
      image_source: imagePath,
      output_format: outputFormat || 'code',
    });

    return this.extractTextContent(result);
  }

  /**
   * 数据可视化分析
   */
  async analyzeDataViz(imagePath: string): Promise<string> {
    const result = await this.callTool('analyze_data_visualization', {
      image_source: imagePath,
    });

    return this.extractTextContent(result);
  }

  /**
   * UI 对比检查
   */
  async uiDiffCheck(imageBefore: string, imageAfter: string): Promise<string> {
    const result = await this.callTool('ui_diff_check', {
      image_source_before: imageBefore,
      image_source_after: imageAfter,
    });

    return this.extractTextContent(result);
  }

  /**
   * 视频分析
   */
  async analyzeVideo(videoPath: string): Promise<string> {
    const result = await this.callTool('analyze_video', {
      video_source: videoPath,
    });

    return this.extractTextContent(result);
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): McpTool[] {
    return Array.from(this.availableTools.values());
  }

  /**
   * 检查工具是否可用
   */
  hasTool(toolName: string): boolean {
    return this.availableTools.has(toolName);
  }

  /**
   * 提取文本内容
   */
  private extractTextContent(result: any): string {
    if (result.content) {
      if (Array.isArray(result.content)) {
        return result.content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text)
          .join('\n');
      }
      if (typeof result.content === 'string') {
        return result.content;
      }
    }
    return JSON.stringify(result);
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.transport) {
      // stdio transport 会自动关闭子进程
      this.transport = null;
    }
    this.isConnected = false;
    this.availableTools.clear();

    logger.info('[ZaiMcpClient] 已断开连接');
  }

  /**
   * 检查连接状态
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }
}

export default ZaiMcpClient;
