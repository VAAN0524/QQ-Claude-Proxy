#!/usr/bin/env node
/**
 * 发送AI资讯到QQ
 */

import { QQBotAPI } from '../dist/channels/qqbot/api.js';

const config = {
  appId: process.env.QQ_BOT_APP_ID || 'your_app_id_here',
  appSecret: process.env.QQ_BOT_SECRET || 'your_app_secret_here',
  sandbox: process.env.QQ_BOT_SANDBOX === 'true',
};

const userOpenId = process.env.ALLOWED_USERS?.split(',')[0] || 'your_user_openid_here';

// AI资讯摘要 (最新热门资讯 - 2026年2月23日)
const newsSummary = `
📰 【AI 热门资讯摘要】${new Date().toLocaleDateString('zh-CN')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 【头条】OpenAI 天价融资！估值突破8500亿美元

💰 融资详情：
• 新一轮融资额有望突破 1000亿美元
• 整体估值可能超过 8500亿美元
• 较去年底飙涨 70%

📈 市场影响：
• 美国"AI恐慌交易"：投资者抛售软件公司
• 中国投资者大举追捧AI概念股
• MiniMax和智谱AI股价在2月翻倍

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 【重磅】SpaceX 收购 xAI！

🤝 马斯克旗下两家公司正式合并
• 整合资源加速AI发展
• 优势互补推进技术突破

🌍 其他重大合作：
• 印度塔塔集团与 OpenAI 合作共建AI基础设施
• 阿里与奥运会达成历史性合作

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🇨🇳 【国产突破】中国AI产业迅猛发展

📊 核心数据：
• AI企业数量：超过6000家
• 核心产业规模：突破1.2万亿元
• 同比增长：近30%
• 国产开源大模型下载量：全球累计突破100亿次
• AI专利：中国稳坐全球最大来源国宝座

💻 技术突破：
• 谷歌 Gemini 3.1 Pro 发布：推理能力翻倍
• 阿里通义千问：新一代视觉大模型，支持生成2K分辨率高质感图像
• 腾讯混元：发布业界首个0.3B端侧模型（30亿参数），可在手机高效运行
• 阿里平头哥："真武810E" AI芯片上线，适配国内主流大模型

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏢 【政策与产业】地方AI发展加速

📍 杭州：
• AI领域营收超百亿元企业达7家
• 算力水平位居全国第二

📍 雄安新区：
• 发布"极数"数据大模型

📍 福建省：
• 出台人工智能项目实施方案
• 最高千万元补助培育优质行业垂直模型

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 【国际会议】慕尼黑安全会议首办AI论坛

📅 2月13日：首次举办AI主题论坛
• 傅莹率中国学者代表团出席
• 讨论"AI竞赛的风险与回报"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 总结：
2026年2月AI领域竞争白热化！OpenAI天价融资引领行业热潮，SpaceX与xAI合并重塑竞争格局，中国AI产业规模突破1.2万亿元。技术层面，端侧模型和视觉AI成为新热点，政策支持持续加码。

📅 发送时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
`;

async function sendNews() {
  const api = new QQBotAPI(config);

  try {
    console.log('正在发送AI资讯到QQ...');
    const result = await api.sendC2CMessage(userOpenId, newsSummary);
    console.log('✅ 发送成功！', result);
  } catch (error) {
    console.error('❌ 发送失败：', error.message);
    process.exit(1);
  }
}

sendNews();
