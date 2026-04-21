#!/usr/bin/env node
import { QQBotAPI } from '../dist/channels/qqbot/api.js';

const config = {
  appId: process.env.QQ_BOT_APP_ID || '102862558',
  appSecret: process.env.QQ_BOT_SECRET || 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu',
  sandbox: process.env.QQ_BOT_SANDBOX === 'true',
};

const userOpenId = '9F876637318A3309060486DF5DF0CF8C';

const report = `
🔥 【AI 每周劲爆热点报告】2026-03-15

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 本周5大劲爆事件：

1️⃣ Claude登顶App Store，ChatGPT遭遇"最大背叛"
   - Claude 3.7 Sonnet发布后下载量首次超越ChatGPT
   - 日活增长347%，ChatGPT下降12%

2️⃣ OpenAI 1100亿美元融资"数字游戏"
   - 估值飙升至1100亿美元
   - 业内质疑：估值泡沫还是真实价值？

3️⃣ GPT-5.4百万Token军备竞赛
   - 上下文窗口突破100万token
   - 相当于100本《三体》小说

4️⃣ Claude Code让程序员"不再写代码"
   - 自动完成80%编码任务
   - 编码效率提升300%，Bug减少65%

5️⃣ Claude Marketplace - 企业级"App Store"
   - 首周上线500+专业Agent
   - Agent定价99-999美元/月

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📸 已为您生成5张专业配图！

配图位置：
C:\Users\USER939479\.claude\skills\Image\

1. illustration_20260315_124107_5870339.png (Claude登顶)
2. illustration_20260315_124159_5870344.png (融资泡沫)
3. illustration_20260315_124255_5870350.png (Token军备)
4. illustration_20260315_124347_5870358.png (编码革命)
5. illustration_20260315_124443_5870364.png (Marketplace)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 完整报告：
C:\Test\bot\workspace\ai_news_final_report.md

🤖 生成工具：Claude Code + Image Skill V2.0
📊 数据来源：Tavily API + ModelScope Qwen-Image-2512

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

async function sendReport() {
  const api = new QQBotAPI(config);

  try {
    console.log('正在发送AI热点报告到QQ...');
    const result = await api.sendC2CMessage(userOpenId, report);
    console.log('✅ 发送成功！', result);
  } catch (error) {
    console.error('❌ 发送失败：', error.message);
    process.exit(1);
  }
}

sendReport();
