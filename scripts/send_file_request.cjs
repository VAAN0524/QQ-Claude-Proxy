const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:18789');
let closed = false;

ws.on('open', () => {
  console.log('[OK] Connected to Gateway');

  // 发送消息给 Agent
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'call',
    params: {
      method: 'agent.handleMessage',
      params: {
        userId: '9F876637318A3309060486DF5DF0CF8C',
        content: '把 uploaded_image.jpg 发给我',
        timestamp: Date.now()
      }
    }
  };

  console.log('[SEND] Request:', JSON.stringify(request, null, 2));
  ws.send(JSON.stringify(request));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('[RECV]', JSON.stringify(msg, null, 2));

  // 如果收到响应，关闭连接
  if (msg.result || msg.error) {
    if (!closed) {
      closed = true;
      setTimeout(() => ws.close(), 500);
    }
  }
});

ws.on('error', (err) => {
  console.error('[ERROR]', err.message);
});

ws.on('close', () => {
  console.log('[INFO] Connection closed');
  process.exit(0);
});

setTimeout(() => {
  if (!closed) {
    console.log('[TIMEOUT] No response, closing...');
    ws.close();
  }
}, 15000);
