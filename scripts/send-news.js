/**
 * 发送AI资讯到QQ
 */

import { QQBotAPI } from '../dist/channels/qqbot/api.js';
import { logger } from '../dist/utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

// 配置
const config = {
  appId: process.env.QQ_BOT_APP_ID || '102862558',
  appSecret: process.env.QQ_BOT_SECRET || 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu',
  sandbox: process.env.QQ_BOT_SANDBOX === 'true',
  allowedUser: process.env.ALLOWED_USERS || '9F876637318A3309060486DF5DF0CF8C'
};

async function sendAINews() {
  const api = new QQBotAPI({
    appId: config.appId,
    appSecret: config.appSecret,
    sandbox: config.sandbox
  });

  // 读取摘要内容
  const summaryPath = path.join(process.cwd(), 'workspace', 'ai_news_summary.md');
  let content = '';

  try {
    content = fs.readFileSync(summaryPath, 'utf-8');
  } catch (error) {
    logger.error(`读取摘要文件失败: ${error}`);
    process.exit(1);
  }

  try {
    logger.info(`发送AI资讯到用户: ${config.allowedUser}`);

    // 发送消息
    const response = await api.sendC2CMessage(config.allowedUser, content);

    logger.info('消息发送成功!');
    logger.info(`响应: ${JSON.stringify(response, null, 2)}`);

    console.log('\n✅ AI资讯已发送到您的QQ!');
    console.log(`用户ID: ${config.allowedUser}`);

  } catch (error) {
    logger.error(`发送消息失败: ${error}`);
    console.error('\n❌ 发送失败:', error.message);
    process.exit(1);
  }
}

// 运行
sendAINews();
