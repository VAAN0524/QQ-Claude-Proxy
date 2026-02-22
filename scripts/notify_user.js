// -*- coding: utf-8 -*-
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:18789');

const userId = '9F876637318A3309060486DF5DF0CF8C';
const filePath = 'C:\\Test\\bot\\workspace\\uploaded_image.jpg';

ws.on('open', () => {
  console.log('[OK] Connected to Gateway');

  // 尝试通过 Gateway 发送消息
  const notifyRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'channel.sendMessage',
    params: {
      channel: 'qqbot',
      userId: userId,
      content: `文件已准备好: uploaded_image.jpg\n路径: ${filePath}\n\n请在 QQ 中回复"把 uploaded_image.jpg 发给我"来接收文件。`
    }
  };

  console.log('[SEND] Notify request');
  ws.send(JSON.stringify(notifyRequest));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('[RECV]', JSON.stringify(msg).substring(0, 500));
});

ws.on('error', (err) => {
  console.error('[ERROR]', err.message);
});

ws.on('close', () => {
  console.log('[INFO] Connection closed');
  process.exit(0);
});

setTimeout(() => ws.close(), 5000);
