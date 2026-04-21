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
🔧 公众号草稿箱图片显示问题已修复

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 问题已解决！

问题原因：
  • 文件名不匹配导致图片URL替换失败
  • 文章中：images/chapter01.png
  • 实际文件：chapter01_work.png

修复方案：
  • 改进上传脚本，支持智能文件名匹配
  • 建立统一的文件命名规范
  • 创建上传前检查清单

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ 草稿已重新上传

Media ID: 
mzW1rBA46b2HNXcsaT3byWMW3i5n_kUHVKfVgJ1K5D9-02f4TGgCuCDyH3VsJ_W_

预览地址：
https://mp.weixin.qq.com/

验证结果：
  ✓ 封面图正常显示
  ✓ 5张章节配图全部正常显示

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

防止再犯：
  • 统一文件命名规范
  • 上传前自动验证
  • 智能文件名匹配

详细报告：C:/Test/bot/IMAGE_FIX_REPORT.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim();

  try {
    console.log('发送修复通知到QQ...');
    await api.sendC2CMessage(userOpenId, message);
    console.log('✓ 通知已发送');
  } catch (error) {
    console.error('✗ 发送失败:', error.message);
  }
}

sendNotification();
