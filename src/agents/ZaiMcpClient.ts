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
  /** 是否启用自动重连，默认 true */
  autoReconnect?: boolean;
  /** 最大重连次数，默认 5 */
  maxReconnectAttempts?: number;
  /** 重连基础延迟（毫秒），默认 1000 */
  reconnectBaseDelay?: number;
  /** 心跳间隔（毫秒），默认 30000 (30秒) */
  heartbeatInterval?: number;
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
 * 连接状态
 */
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * MCP 客户端类
 */
export class ZaiMcpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private apiKey: string;
  private mode: string;
  private connectionState: ConnectionState = 'disconnected';
  private requestTimeout: number;
  private autoReconnect: boolean;
  private maxReconnectAttempts: number;
  private reconnectBaseDelay: number;
  private heartbeatInterval: number;

  // 可用工具缓存
  private availableTools: Map<string, McpTool> = new Map();

  // 重连状态
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastHeartbeatTime: number = Date.now();

  constructor(options: ZaiMcpClientOptions) {
    this.apiKey = options.apiKey;
    this.mode = options.mode || 'ZHIPU';
    this.requestTimeout = options.requestTimeout || 300000; // 默认 5 分钟
    this.autoReconnect = options.autoReconnect ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.reconnectBaseDelay = options.reconnectBaseDelay ?? 1000;
    this.heartbeatInterval = options.heartbeatInterval ?? 30000; // 默认 30 秒
  }

  /**
   * 连接 MCP Server
   */
  async connect(): Promise<void> {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      logger.debug('[ZaiMcpClient] 已连接或正在连接中，跳过');
      return;
    }

    this.connectionState = 'connecting';

    try {
      logger.info('[ZaiMcpClient] 正在连接官方 MCP Server...');

      // 清理旧连接
      await this.cleanup();

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
      this.connectionState = 'connected';
      this.reconnectAttempts = 0; // 重置重连计数
      this.lastHeartbeatTime = Date.now();

      // 加载可用工具
      await this.loadTools();

      // 启动心跳
      this.startHeartbeat();

      logger.info('[ZaiMcpClient] 已连接到官方 MCP Server');
    } catch (error) {
      this.connectionState = 'disconnected';
      logger.error(`[ZaiMcpClient] 连接失败: ${error}`);

      // 尝试自动重连
      if (this.autoReconnect) {
        this.scheduleReconnect();
      }

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
    // 确保已连接
    if (this.connectionState !== 'connected' || !this.client) {
      logger.warn('[ZaiMcpClient] 客户端未连接，尝试重新连接...');
      await this.connect();
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

      this.lastHeartbeatTime = Date.now(); // 更新心跳时间
      logger.info(`[ZaiMcpClient] 工具调用成功: ${toolName}`);
      return result;
    } catch (error) {
      logger.error(`[ZaiMcpClient] 工具调用失败: ${error}`);

      // 连接错误，触发重连
      if (this.autoReconnect && this.isConnectionError(error)) {
        this.connectionState = 'disconnected';
        this.scheduleReconnect();
      }

      throw error;
    }
  }

  /**
   * 图像分析
   * @param imagePath 图片路径
   * @param prompt 分析提示词
   * @param model 模型名称（如 'glm-4.6v'），默认使用 MCP Server 配置的模型
   */
  async analyzeImage(imagePath: string, prompt?: string, model?: string): Promise<string> {
    const args: Record<string, any> = {
      image_source: imagePath,
      prompt: prompt || '请描述这张图片的内容',
    };
    // 支持指定模型
    if (model) {
      args.model = model;
    }
    const result = await this.callTool('analyze_image', args);

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
    this.connectionState = 'disconnected';
    await this.cleanup();
    logger.info('[ZaiMcpClient] 已断开连接');
  }

  /**
   * 检查连接状态
   */
  isClientConnected(): boolean {
    return this.connectionState === 'connected' && this.client !== null;
  }

  /**
   * 获取连接状态
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * 判断错误是否为连接错误
   */
  private isConnectionError(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      errorMessage.includes('EPIPE') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('disconnect') ||
      errorMessage.includes('closed')
    );
  }

  /**
   * 计算重连延迟（指数退避）
   */
  private calculateReconnectDelay(): number {
    return this.reconnectBaseDelay * Math.pow(2, Math.min(this.reconnectAttempts, 5));
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // 已有重连计划
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`[ZaiMcpClient] 达到最大重连次数 (${this.maxReconnectAttempts})，停止重连`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.calculateReconnectDelay();

    logger.info(
      `[ZaiMcpClient] 计划在 ${delay}ms 后进行第 ${this.reconnectAttempts} 次重连 ` +
      `(最大 ${this.maxReconnectAttempts} 次)`
    );

    this.connectionState = 'reconnecting';
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        // connect 方法已经处理了重连逻辑
      }
    }, delay);
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeat();
    }, this.heartbeatInterval);

    logger.debug(`[ZaiMcpClient] 心跳检测已启动 (间隔: ${this.heartbeatInterval}ms)`);
  }

  /**
   * 停止心跳检测
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.debug('[ZaiMcpClient] 心跳检测已停止');
    }
  }

  /**
   * 检查心跳
   */
  private checkHeartbeat(): void {
    const now = Date.now();
    const timeSinceLastHeartbeat = now - this.lastHeartbeatTime;

    // 如果距离上次心跳超过 2 倍心跳间隔，认为连接可能断开
    if (timeSinceLastHeartbeat > this.heartbeatInterval * 2) {
      logger.warn(
        `[ZaiMcpClient] 心跳超时 (距离上次: ${timeSinceLastHeartbeat}ms)，` +
        `尝试重新连接...`
      );

      this.connectionState = 'disconnected';
      this.stopHeartbeat();

      if (this.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        logger.debug('[ZaiMcpClient] 关闭客户端时出错: ' + String(error));
      }
      this.client = null;
    }

    if (this.transport) {
      this.transport = null;
    }

    this.availableTools.clear();
  }
}

export default ZaiMcpClient;
