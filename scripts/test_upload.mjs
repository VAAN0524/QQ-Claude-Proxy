import { QQBotAPI } from '../src/channels/qqbot/api.ts';

const api = new QQBotAPI({
  appId: '102862558',
  clientSecret: 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu',
  sandbox: false
});

const fs = await import('fs');
const buffer = fs.readFileSync('workspace/uploaded_image.jpg');
const userId = '9F876637318A3309060486DF5DF0CF8C';

console.log('[1/2] Uploading image...');
try {
  const result = await api.uploadC2CFile(userId, buffer, 1, 'jpg', false);
  console.log('[OK] Upload result:', JSON.stringify(result, null, 2));
} catch (err) {
  console.error('[ERROR]', err.message);
  console.error(err.stack);
}
