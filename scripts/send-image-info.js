#!/usr/bin/env node
import { QQBotAPI } from '../dist/channels/qqbot/api.js';

const config = {
  appId: process.env.QQ_BOT_APP_ID || '102862558',
  appSecret: process.env.QQ_BOT_SECRET || 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu',
  sandbox: process.env.QQ_BOT_SANDBOX === 'true',
};

const userOpenId = '9F876637318A3309060486DF5DF0CF8C';

const images = [
  {
    title: '🔥 热点1: Claude 登顶 App Store',
    file: 'illustration_20260315_124107_5870339.png',
    desc: 'Claude 3.7 Sonnet发布后App Store下载量首次超越ChatGPT'
  },
  {
    title: '💰 热点2: OpenAI 1100亿美元融资',
    file: 'illustration_20260315_124159_5870344.png',
    desc: '估值飙升至1100亿美元，业内质疑估值泡沫'
  },
  {
    title: '🚀 热点3: GPT-5.4 百万Token军备竞赛',
    file: 'illustration_20260315_124255_5870350.png',
    desc: '上下文窗口突破100万token，相当于100本《三体》'
  },
  {
    title: '💻 热点4: Claude Code 编码革命',
    file: 'illustration_20260315_124347_5870358.png',
    desc: '自动完成80%编码任务，效率提升300%'
  },
  {
    title: '🏪 热点5: Claude Marketplace',
    file: 'illustration_20260315_124443_5870364.png',
    desc: '首周上线500+专业Agent，企业级App Store'
  }
];

async function sendImages() {
  const api = new QQBotAPI(config);

  try {
    console.log('正在发送配图信息到QQ...');
    
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const msg = `
${img.title}

📖 ${img.desc}

📁 文件：${img.file}
💾 大小：约1.3 MB
📂 路径：C:\Users\USER939479\.claude\skills\Image\${img.file}
`;
      
      console.log(`发送第${i+1}张配图信息...`);
      await api.sendC2CMessage(userOpenId, msg);
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log('✅ 所有配图信息发送完成！');
    
  } catch (error) {
    console.error('❌ 发送失败：', error.message);
    process.exit(1);
  }
}

sendImages();
