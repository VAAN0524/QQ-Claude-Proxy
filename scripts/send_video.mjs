import { QQBotAPI } from '../src/channels/qqbot/api.ts';

// 修复 token expires_in 类型问题
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (args[0]?.includes('getAppAccessToken')) {
    const originalJson = response.json.bind(response);
    response.json = async () => {
      const data = await originalJson();
      if (data.expires_in) {
        data.expires_in = Number(data.expires_in);
      }
      return data;
    };
  }
  return response;
};

const api = new QQBotAPI({
  appId: '102862558',
  clientSecret: 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu',
  sandbox: false
});

const fs = await import('fs');
const buffer = fs.readFileSync('workspace/01-intro.mp4');
const userId = '9F876637318A3309060486DF5DF0CF8C';

console.log('[INFO] File size:', buffer.length, 'bytes');
console.log('[1/2] Uploading video...');

try {
  // fileType: 1=图片, 2=视频, 3=语音, 4=文件
  const uploadResult = await api.uploadC2CFile(userId, buffer, 2, 'mp4', false);
  console.log('[OK] Upload result:', JSON.stringify(uploadResult, null, 2));

  if (uploadResult.file_info) {
    console.log('[2/2] Sending media message...');
    const sendResult = await api.sendC2CMediaMessage(userId, [{
      type: 'video',
      content: uploadResult.file_info
    }]);
    console.log('[OK] Send result:', JSON.stringify(sendResult, null, 2));
    console.log('\n[SUCCESS] Video sent!');
  }
} catch (err) {
  console.error('[ERROR]', err.message);
  if (err.cause) {
    console.error('[CAUSE]', err.cause);
  }
}
