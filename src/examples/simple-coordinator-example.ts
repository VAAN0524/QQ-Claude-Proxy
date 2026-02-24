/**
 * SimpleCoordinator 使用示例
 *
 * 展示如何使用 SimpleCoordinatorAgent 替代复杂的多 Agent 系统
 */

import { SimpleCoordinatorAgent } from '../agents/SimpleCoordinatorAgent.js';
import { logger } from '../utils/logger.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // 初始化 SimpleCoordinator
  const coordinator = new SimpleCoordinatorAgent({
    skillsPath: path.join(__dirname, '../skills/simple'),
    memoryPath: path.join(__dirname, '../memory/simple'),
    rulesPath: path.join(__dirname, '../rules/simple'),
  });

  await coordinator.initialize();

  // 示例 1: 搜索请求
  const searchMessage = {
    channel: 'qqbot',
    userId: 'test-user',
    content: '搜索 TypeScript 最新版本',
    timestamp: new Date(),
  };

  logger.info('=== 示例 1: 搜索请求 ===');
  const searchResult = await coordinator.process(searchMessage, {
    workspacePath: process.cwd(),
    storagePath: './uploads',
    allowedUsers: [],
  });
  console.log('结果:', searchResult.content);

  // 示例 2: 代码请求
  const codeMessage = {
    channel: 'qqbot',
    userId: 'test-user',
    content: '帮我写一个 Python 斐波那契函数',
    timestamp: new Date(),
  };

  logger.info('\n=== 示例 2: 代码请求 ===');
  const codeResult = await coordinator.process(codeMessage, {
    workspacePath: process.cwd(),
    storagePath: './uploads',
    allowedUsers: [],
  });
  console.log('结果:', codeResult.content);

  // 示例 3: 通用请求
  const generalMessage = {
    channel: 'qqbot',
    userId: 'test-user',
    content: '今天天气怎么样？',
    timestamp: new Date(),
  };

  logger.info('\n=== 示例 3: 通用请求 ===');
  const generalResult = await coordinator.process(generalMessage, {
    workspacePath: process.cwd(),
    storagePath: './uploads',
    allowedUsers: [],
  });
  console.log('结果:', generalResult.content);
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
