/**
 * 配置写入器
 *
 * 功能：
 * 1. 安全写入配置到 config.json
 * 2. 自动备份现有配置
 * 3. 配置验证
 * 4. 检测需要重启的配置变更
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { logger } from '../utils/logger.js';
import type { Config } from './schema.js';

/**
 * 配置验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}

/**
 * 配置写入选项
 */
export interface ConfigWriterOptions {
  /** 配置文件路径 */
  configPath?: string;
  /** 备份目录路径 */
  backupDir?: string;
  /** 是否自动备份 */
  autoBackup?: boolean;
  /** 最大备份数量 */
  maxBackups?: number;
}

/**
 * 配置写入器类
 */
export class ConfigWriter {
  private configPath: string;
  private backupDir: string;
  private autoBackup: boolean;
  private maxBackups: number;

  constructor(options: ConfigWriterOptions = {}) {
    this.configPath = options.configPath || resolve(process.cwd(), 'config.json');
    this.backupDir = options.backupDir || resolve(process.cwd(), 'config-backups');
    this.autoBackup = options.autoBackup !== false;
    this.maxBackups = options.maxBackups || 10;

    // 确保备份目录存在
    fs.mkdir(this.backupDir, { recursive: true }).catch(() => {});
  }

  /**
   * 写入配置到文件
   */
  async writeConfig(config: Partial<Config>): Promise<void> {
    // 验证配置
    const validation = await this.validateConfig(config);
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => `- ${e.field}: ${e.message}`).join('\n');
      throw new Error(`配置验证失败:\n${errorMessages}`);
    }

    // 显示警告
    if (validation.warnings.length > 0) {
      const warningMessages = validation.warnings.map(w => `- ${w.field}: ${w.message}`).join('\n');
      logger.warn(`[ConfigWriter] 配置警告:\n${warningMessages}`);
    }

    // 备份现有配置
    let backupPath: string | null = null;
    if (this.autoBackup) {
      backupPath = await this.backupConfig();
    }

    try {
      // 写入新配置
      await fs.writeFile(
        this.configPath,
        JSON.stringify(config, null, 2),
        'utf-8'
      );
      logger.info(`[ConfigWriter] 配置已写入: ${this.configPath}`);
    } catch (error) {
      // 写入失败，恢复备份
      if (backupPath) {
        logger.error(`[ConfigWriter] 配置写入失败，正在恢复备份...`);
        await this.restoreBackup(backupPath);
      }
      throw error;
    }
  }

  /**
   * 验证配置
   */
  async validateConfig(config: Partial<Config>): Promise<ValidationResult> {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // 验证 Gateway 配置
    if (config.gateway) {
      if (config.gateway.port !== undefined) {
        if (typeof config.gateway.port !== 'number' || config.gateway.port < 1 || config.gateway.port > 65535) {
          errors.push({ field: 'gateway.port', message: '端口必须在 1-65535 之间' });
        }
      }
      if (config.gateway.host !== undefined) {
        if (typeof config.gateway.host !== 'string' || !config.gateway.host) {
          errors.push({ field: 'gateway.host', message: '主机地址不能为空' });
        }
      }
    }

    // 验证 QQ Bot 配置
    if (config.channels?.qqbot) {
      const { qqbot } = config.channels;
      if (qqbot.appId !== undefined && (!qqbot.appId || typeof qqbot.appId !== 'string')) {
        errors.push({ field: 'channels.qqbot.appId', message: 'AppID 不能为空' });
      }
      if (qqbot.clientSecret !== undefined && (!qqbot.clientSecret || typeof qqbot.clientSecret !== 'string')) {
        errors.push({ field: 'channels.qqbot.clientSecret', message: 'ClientSecret 不能为空' });
      }
    }

    // 验证 Agent 配置
    if (config.agents) {
      const validAgentIds = ['code', 'browser', 'shell', 'websearch', 'data', 'vision', 'claude', 'coordinator'];
      for (const [agentId, agentConfig] of Object.entries(config.agents)) {
        if (agentId === 'coordinator') continue;
        if (agentConfig && typeof agentConfig === 'object' && 'enabled' in agentConfig) {
          if (typeof agentConfig.enabled !== 'boolean') {
            errors.push({ field: `agents.${agentId}.enabled`, message: '必须是布尔值' });
          }
        }
        if (agentConfig && typeof agentConfig === 'object' && 'priority' in agentConfig) {
          const priority = (agentConfig as any).priority;
          if (typeof priority !== 'number' || priority < 1 || priority > 100) {
            errors.push({ field: `agents.${agentId}.priority`, message: '优先级必须在 1-100 之间' });
          }
        }
        if (agentConfig && typeof agentConfig === 'object' && 'timeout' in agentConfig) {
          const timeout = (agentConfig as any).timeout;
          if (typeof timeout !== 'number' || timeout < 1000) {
            errors.push({ field: `agents.${agentId}.timeout`, message: '超时时间必须至少 1000ms' });
          }
        }
      }
    }

    // 验证存储路径
    if (config.storage) {
      const pathFields = ['downloadPath', 'uploadPath'];
      for (const field of pathFields) {
        const pathValue = (config.storage as any)[field];
        if (pathValue !== undefined) {
          if (typeof pathValue !== 'string' || !pathValue) {
            errors.push({ field: `storage.${field}`, message: '路径不能为空' });
          } else {
            // 检查路径是否包含非法字符
            if (pathValue.includes('..') || /[<>:"|?*]/.test(pathValue)) {
              errors.push({ field: `storage.${field}`, message: '路径包含非法字符' });
            }
          }
        }
      }
    }

    // 验证调度器配置
    if (config.scheduler) {
      if (config.scheduler.maxConcurrentTasks !== undefined) {
        if (typeof config.scheduler.maxConcurrentTasks !== 'number' || config.scheduler.maxConcurrentTasks < 1) {
          errors.push({ field: 'scheduler.maxConcurrentTasks', message: '必须至少为 1' });
        }
      }
      if (config.scheduler.taskTimeout !== undefined) {
        if (typeof config.scheduler.taskTimeout !== 'number' || config.scheduler.taskTimeout < 1000) {
          errors.push({ field: 'scheduler.taskTimeout', message: '超时时间必须至少 1000ms' });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 备份现有配置
   */
  async backupConfig(): Promise<string> {
    try {
      const configExists = await fs.access(this.configPath).then(() => true).catch(() => false);
      if (!configExists) {
        logger.info(`[ConfigWriter] 配置文件不存在，跳过备份`);
        return '';
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `config-backup-${timestamp}.json`;
      const backupPath = resolve(this.backupDir, backupFileName);

      await fs.copyFile(this.configPath, backupPath);
      logger.info(`[ConfigWriter] 配置已备份: ${backupPath}`);

      // 清理旧备份
      await this.cleanupOldBackups();

      return backupPath;
    } catch (error) {
      logger.error(`[ConfigWriter] 备份失败: ${error}`);
      throw error;
    }
  }

  /**
   * 恢复备份
   */
  async restoreBackup(backupPath: string): Promise<void> {
    try {
      await fs.copyFile(backupPath, this.configPath);
      logger.info(`[ConfigWriter] 配置已从备份恢复: ${backupPath}`);
    } catch (error) {
      logger.error(`[ConfigWriter] 恢复备份失败: ${error}`);
      throw error;
    }
  }

  /**
   * 清理旧备份
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFileData = files
        .filter(f => f.startsWith('config-backup-') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: resolve(this.backupDir, f),
        }));

      // 获取所有文件的修改时间
      const backupFiles = await Promise.all(
        backupFileData.map(async f => ({
          ...f,
          time: await fs.stat(f.path).then(s => s.mtimeMs).catch(() => 0),
        }))
      );

      // 按时间降序排序
      backupFiles.sort((a, b) => b.time - a.time);

      // 保留最新的 N 个备份，删除其余的
      if (backupFiles.length > this.maxBackups) {
        const toDelete = backupFiles.slice(this.maxBackups);
        for (const file of toDelete) {
          await fs.unlink(file.path).catch(() => {});
          logger.debug(`[ConfigWriter] 删除旧备份: ${file.name}`);
        }
      }
    } catch (error) {
      logger.warn(`[ConfigWriter] 清理旧备份失败: ${error}`);
    }
  }

  /**
   * 获取需要重启的配置变更
   */
  getRestartRequired(changedFields: string[]): string[] {
    // 这些配置变更需要重启服务才能生效
    const restartRequiredFields = [
      'gateway.port',
      'gateway.host',
      'channels.qqbot.appId',
      'channels.qqbot.clientSecret',
      'storage.downloadPath',
      'storage.uploadPath',
      'scheduler.storagePath',
      'scheduler.resultDir',
    ];

    const restartRequired = changedFields.filter(field =>
      restartRequiredFields.some(required => field.startsWith(required))
    );

    return restartRequired;
  }

  /**
   * 读取现有配置
   */
  async readConfig(): Promise<Partial<Config>> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // 文件不存在或读取失败，返回空配置
      return {};
    }
  }

  /**
   * 检查配置文件是否存在
   */
  async configExists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 导出配置（隐藏敏感信息）
   */
  exportSafeConfig(config: Partial<Config>): Partial<Config> {
    const safe = { ...config };

    // 隐藏 API Keys
    if (safe.channels?.qqbot?.clientSecret) {
      (safe.channels as any).qqbot.clientSecret = this.maskSecret((safe.channels as any).qqbot.clientSecret);
    }

    // 隐藏其他敏感配置
    // 可以根据需要添加更多

    return safe;
  }

  /**
   * 遮罩密钥
   */
  private maskSecret(secret: string, visibleChars = 8): string {
    if (!secret || secret.length <= visibleChars) {
      return '***';
    }
    return secret.substring(0, visibleChars) + '...';
  }
}

export default ConfigWriter;
