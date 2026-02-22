import { QQBotAPI } from '../src/channels/qqbot/api.ts';

const api = new QQBotAPI({
  appId: '102862558',
  clientSecret: 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu',
  sandbox: false
});

const userId = '9F876637318A3309060486DF5DF0CF8C';
const imageUrl = 'https://picsum.photos/800/600';

console.log('[1/2] Sending image URL...');
try {
  const result = await api.sendC2CMediaMessage(userId, [{
    type: 'image',
    content: imageUrl
  }]);
  console.log('[OK] Send result:', JSON.stringify(result, null, 2));
} catch (err) {
  console.error('[ERROR]', err.message);
}
