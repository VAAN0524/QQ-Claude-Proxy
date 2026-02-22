import { Config, defaultConfig } from './schema.js';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import { logger } from '../utils/logger.js';

// 获取项目根目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');

// 显式指定 .env 文件路径并立即读取环境变量
const envPath = resolve(projectRoot, '.env');
dotenvConfig({ path: envPath, debug: false });

export function loadConfig(): Config {
  // 调试：打印环境变量状态
  logger.info(`[Config] QQ_BOT_APP_ID = "${process.env.QQ_BOT_APP_ID || 'NOT SET'}"`);
  logger.info(`[Config] QQ_BOT_SECRET = ${process.env.QQ_BOT_SECRET ? 'SET (***)' : 'NOT SET'}`);
  logger.info(`[Config] ANTHROPIC_API_KEY = ${process.env.ANTHROPIC_API_KEY ? 'SET (***)' : 'NOT SET'}`);
  logger.info(`[Config] GLM_API_KEY = ${process.env.GLM_API_KEY ? 'SET (***)' : 'NOT SET'}`);
  logger.info(`[Config] GLM_BASE_URL = "${process.env.GLM_BASE_URL || 'NOT SET'}"`);

  const configPath = process.env.QQ_CLAUDE_CONFIG || resolve(process.cwd(), 'config.json');

  // 从环境变量获取凭证
  const envConfig = {
    appId: process.env.QQ_BOT_APP_ID || '',
    appSecret: process.env.QQ_BOT_SECRET || '',
    token: process.env.QQ_BOT_ACCESS_TOKEN || '',
    sandbox: process.env.QQ_BOT_SANDBOX !== 'false'  // 默认开启沙箱模式
  };

  if (existsSync(configPath)) {
    try {
      const fileContent = readFileSync(configPath, 'utf-8');
      const userConfig = JSON.parse(fileContent);

      // 合并配置，环境变量优先
      const merged = mergeConfig(defaultConfig, userConfig);

      // 应用环境变量中的凭证（优先级最高）
      if (envConfig.appId) merged.channels.qqbot.appId = envConfig.appId;
      if (envConfig.appSecret) merged.channels.qqbot.clientSecret = envConfig.appSecret;
      if (envConfig.token) merged.channels.qqbot.token = envConfig.token;

      // 环境变量中的 sandbox 设置优先
      merged.channels.qqbot.sandbox = envConfig.sandbox;

      return merged;
    } catch (error) {
      logger.warn(`Failed to load config file, using defaults: ${error}`);
    }
  }

  // 没有配置文件时，使用默认配置 + 环境变量
  return {
    ...defaultConfig,
    channels: {
      qqbot: {
        ...defaultConfig.channels.qqbot,
        ...envConfig,
        clientSecret: envConfig.appSecret  // 映射 appSecret -> clientSecret
      }
    },
    agent: {
      ...defaultConfig.agent,
      allowedUsers: process.env.ALLOWED_USERS?.split(',').map(s => s.trim()) || []
    }
  };
}

export function mergeConfig(defaults: any, user: any): Config {
  return {
    ...defaults,
    ...user,
    gateway: { ...defaults.gateway, ...user.gateway },
    channels: {
      qqbot: { ...defaults.channels.qqbot, ...(user.channels?.qqbot || {}) }
    },
    agent: {
      ...defaults.agent,
      ...user.agent
    },
    storage: { ...defaults.storage, ...user.storage }
  };
}
