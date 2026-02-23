/**
 * 配置验证器
 *
 * 功能：
 * 1. 验证配置格式和值的有效性
 * 2. 检查路径是否存在和可访问
 * 3. 测试 API 连接
 * 4. 验证技能文件格式
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { logger } from '../utils/logger.js';
import type { Config } from './schema.js';
import { ConfigWriter, ValidationResult } from './writer.js';

/**
 * API 连接测试结果
 */
export interface ApiTestResult {
  success: boolean;
  provider: string;
  error?: string;
  latency?: number;
}

/**
 * 路径验证结果
 */
export interface PathValidationResult {
  valid: boolean;
  exists: boolean;
  writable: boolean;
  error?: string;
}

/**
 * 配置验证器类
 */
export class ConfigValidator {
  private configWriter: ConfigWriter;

  constructor(options?: { configPath?: string }) {
    this.configWriter = new ConfigWriter({ configPath: options?.configPath });
  }

  /**
   * 全面验证配置
   */
  async validateFull(config: Partial<Config>): Promise<{
    validation: ValidationResult;
    paths: Record<string, PathValidationResult>;
    apis: Record<string, ApiTestResult>;
  }> {
    const validation = await this.configWriter.validateConfig(config);
    const paths: Record<string, PathValidationResult> = {};
    const apis: Record<string, ApiTestResult> = {};

    // 验证路径
    if (config.storage) {
      if (config.storage.downloadPath) {
        paths['storage.downloadPath'] = await this.validatePath(config.storage.downloadPath, true);
      }
      if (config.storage.uploadPath) {
        paths['storage.uploadPath'] = await this.validatePath(config.storage.uploadPath, true);
      }
    }

    if (config.scheduler) {
      if (config.scheduler.storagePath) {
        paths['scheduler.storagePath'] = await this.validatePath(config.scheduler.storagePath, true);
      }
      if (config.scheduler.resultDir) {
        paths['scheduler.resultDir'] = await this.validatePath(config.scheduler.resultDir, true);
      }
    }

    // 测试 API 连接（如果提供了密钥）
    if (process.env.ANTHROPIC_API_KEY || (config as any).anthropicApiKey) {
      // 可以在这里添加实际的 API 测试
      // 目前只做格式验证
    }

    return { validation, paths, apis };
  }

  /**
   * 验证路径
   */
  async validatePath(path: string, shouldBeWritable = false): Promise<PathValidationResult> {
    try {
      const absolutePath = resolve(process.cwd(), path);

      // 检查路径是否存在
      const exists = await fs.access(absolutePath).then(() => true).catch(() => false);

      if (!exists) {
        // 尝试创建目录
        await fs.mkdir(absolutePath, { recursive: true });
        logger.info(`[ConfigValidator] 创建目录: ${absolutePath}`);
      }

      // 检查是否可写
      const writable = await this.testWrite(absolutePath);

      return {
        valid: true,
        exists: true,
        writable,
      };
    } catch (error) {
      return {
        valid: false,
        exists: false,
        writable: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 测试路径是否可写
   */
  private async testWrite(absolutePath: string): Promise<boolean> {
    try {
      const testFile = resolve(absolutePath, '.write-test');
      await fs.writeFile(testFile, Date.now().toString(), 'utf-8');
      await fs.unlink(testFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 验证 API Key 格式
   */
  validateApiKeyFormat(provider: 'anthropic' | 'glm' | 'qq', apiKey: string): boolean {
    switch (provider) {
      case 'anthropic':
        // Anthropic API Key 格式: sk-ant-...
        return /^sk-ant-[a-zA-Z0-9_-]{95,}$/.test(apiKey);

      case 'glm':
        // GLM API Key 格式: id.secret (JWT 格式)
        const parts = apiKey.split('.');
        return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;

      case 'qq':
        // QQ Bot AppID 格式: 数字字符串
        return /^\d+$/.test(apiKey);

      default:
        return false;
    }
  }

  /**
   * 获取配置 Schema（用于前端生成表单）
   */
  getConfigSchema(): {
    fields: Record<string, {
      type: string;
      label: string;
      description: string;
      required: boolean;
      defaultValue?: any;
      options?: any[];
      min?: number;
      max?: number;
      pattern?: string;
      sensitive?: boolean;
    }>;
  } {
    return {
      fields: {
        // Gateway 配置
        'gateway.port': {
          type: 'number',
          label: 'Gateway 端口',
          description: 'WebSocket Gateway 监听端口',
          required: false,
          defaultValue: 18789,
          min: 1024,
          max: 65535,
        },
        'gateway.host': {
          type: 'string',
          label: 'Gateway 主机地址',
          description: 'WebSocket Gateway 监听地址',
          required: false,
          defaultValue: '127.0.0.1',
          pattern: '^[\\w\\.-]+$',
        },
        // QQ Bot 配置
        'channels.qqbot.appId': {
          type: 'string',
          label: 'QQ Bot AppID',
          description: 'QQ 机器人 AppID（从 QQ 开放平台获取）',
          required: false,
          sensitive: false,
        },
        'channels.qqbot.clientSecret': {
          type: 'string',
          label: 'QQ Bot 密钥',
          description: 'QQ 机器人 AppSecret（从 QQ 开放平台获取）',
          required: false,
          sensitive: true,
        },
        'channels.qqbot.sandbox': {
          type: 'boolean',
          label: '沙箱模式',
          description: '启用 QQ 机器人沙箱模式（开发环境）',
          required: false,
          defaultValue: true,
        },
        // API Keys
        'anthropicApiKey': {
          type: 'string',
          label: 'Anthropic API Key',
          description: 'Claude API 密钥（sk-ant-... 格式）',
          required: false,
          sensitive: true,
        },
        'glmApiKey': {
          type: 'string',
          label: 'GLM API Key',
          description: '智谱 AI API 密钥（id.secret 格式）',
          required: false,
          sensitive: true,
        },
        'glmBaseUrl': {
          type: 'string',
          label: 'GLM API Base URL',
          description: 'GLM API 基础 URL（自定义 API 端点）',
          required: false,
          defaultValue: 'https://api.z.ai/api/coding/paas/v4/',
        },
        // Agent 配置
        'agents.code.enabled': {
          type: 'boolean',
          label: '启用 Code Agent',
          description: '是否启用代码编写和分析 Agent',
          required: false,
          defaultValue: true,
        },
        'agents.browser.enabled': {
          type: 'boolean',
          label: '启用 Browser Agent',
          description: '是否启用网页操作 Agent',
          required: false,
          defaultValue: true,
        },
        'agents.shell.enabled': {
          type: 'boolean',
          label: '启用 Shell Agent',
          description: '是否启用命令执行 Agent（谨慎使用）',
          required: false,
          defaultValue: false,
        },
        'agents.vision.enabled': {
          type: 'boolean',
          label: '启用 Vision Agent',
          description: '是否启用图片分析 Agent',
          required: false,
          defaultValue: true,
        },
        // 存储配置
        'storage.downloadPath': {
          type: 'string',
          label: '工作目录',
          description: 'Claude Code 工作目录路径',
          required: false,
          defaultValue: './workspace',
        },
        'storage.uploadPath': {
          type: 'string',
          label: '上传目录',
          description: '用户上传文件存储目录',
          required: false,
          defaultValue: './uploads',
        },
        // 调度器配置
        'scheduler.enabled': {
          type: 'boolean',
          label: '启用调度器',
          description: '是否启用定时任务调度器',
          required: false,
          defaultValue: true,
        },
        'scheduler.maxConcurrentTasks': {
          type: 'number',
          label: '最大并发任务数',
          description: '同时执行的最大任务数量',
          required: false,
          defaultValue: 3,
          min: 1,
          max: 10,
        },
        // 安全配置
        'agent.allowedUsers': {
          type: 'array',
          label: '允许的用户',
          description: '允许使用机器人的用户 OpenID 列表（留空则允许所有）',
          required: false,
          defaultValue: [],
        },
      },
    };
  }
}

export default ConfigValidator;
