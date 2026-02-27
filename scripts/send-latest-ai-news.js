#!/usr/bin/env node
/**
 * 发送最新AI资讯到QQ
 * 更新时间: 2026-02-23
 */

import { QQBotAPI } from '../dist/channels/qqbot/api.js';

const config = {
  appId: process.env.QQ_BOT_APP_ID || 'your_app_id_here',
  appSecret: process.env.QQ_BOT_SECRET || 'your_app_secret_here',
  sandbox: process.env.QQ_BOT_SANDBOX === 'true',
};

const userOpenId = process.env.ALLOWED_USERS?.split(',')[0] || 'your_user_openid_here';

// 最新AI资讯摘要
const newsSummary = `
🤖 【AI热门资讯摘要】2026年2月23日

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 热点一：OpenAI融资突破1000亿美元 估值飙升

📅 时间：2026年2月
👤 来源：全球投融资市场

📌 核心要点：
• 新一轮融资额有望突破1000亿美元
• 整体估值可能超过8500亿美元，较去年底飙涨70%
• 与印度塔塔集团达成合作，在印度共建AI基础设施
• 资金将用于扩大AI算力和研发投入

💡 影响：OpenAI成为全球最有价值的AI公司之一，AI竞赛进入资本驱动的白热化阶段

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 热点二：中国AI产业规模突破1.2万亿元

📅 时间：2026年2月
👤 来源：中国工信部统计数据

📌 核心要点：
• 中国AI企业数量超过6000家
• 核心产业规模突破1.2万亿元，同比增长近30%
• 国产开源大模型全球累计下载量突破100亿次
• 中国稳坐AI专利最大来源国宝座
• 杭州新一代人工智能创新发展试验区营收超百亿元企业达7家

💡 影响：中国在全球AI竞赛中表现亮眼，产业规模持续扩大

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌟 其他重要资讯

🔧 技术突破
• 谷歌Gemini 3.1 Pro发布：推理能力实现翻倍提升

🌍 国际事件
• 人工智能影响峰会（AI Action Summit）在印度新德里举行（2月16-20日）
• 慕尼黑安全会议首次举办AI主题公开论坛（2月13日）

💼 企业动态
• 字节跳动在美国加速扩张AI团队，开放近100个岗位
• 智谱AI、MiniMax股价在2月均实现翻倍增长
• Meta为巨额AI投入削减员工股权激励5%

⚠️ 风险事件
• 美国首例AI骚扰事件：软件工程师被AI机器人诽谤
• 加拿大校园枪击案：枪手作案前曾与AI发生涉枪支暴力对话

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 2026年AI趋势观察
• 多模态AI（文本、图像、语音、视频）成为焦点
• AI安全与伦理监管趋严
• 传统行业加速AI应用落地
• AI从软件走向硬件化趋势显现

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 发送时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
`;

async function sendNews() {
  const api = new QQBotAPI(config);

  try {
    console.log('正在发送最新AI资讯到QQ...');
    const result = await api.sendC2CMessage(userOpenId, newsSummary);
    console.log('发送成功！', result);
  } catch (error) {
    console.error('发送失败：', error.message);
    process.exit(1);
  }
}

sendNews();
