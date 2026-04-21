#!/usr/bin/env node
import { QQBotAPI } from '../dist/channels/qqbot/api.js';

const config = {
  appId: '102862558',
  appSecret: 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu',
  sandbox: false
};

const userOpenId = '9F876637318A3309060486DF5DF0CF8C';

async function sendNotification() {
  const api = new QQBotAPI(config);

  const message = `
📢 AI资讯周期任务规则更新

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 新配图规则已生效（从第二轮开始）

配图数量：总计3张
  • 封面图：1张（900×500）
  • 章节配图：1-2张（1920×1080）

文章结构：
  • 导语（50-100字）
  • 第01章（配图1）
  • 第02章（配图2，可选）
  • 结语

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

完整流程：
1. 搜索最新AI热点
2. 选取最热门一条
3. 撰写文章（2-3章节）
4. 生成配图（总计3张）
5. 上传到公众号草稿箱
6. 通过QQ Bot发送配图

执行间隔：每2小时

下一轮任务：2026-03-15 15:45

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim();

  try {
    console.log('发送规则更新通知到QQ...');
    await api.sendC2CMessage(userOpenId, message);
    console.log('✓ 通知已发送');
  } catch (error) {
    console.error('✗ 发送失败:', error.message);
  }
}

sendNotification();
