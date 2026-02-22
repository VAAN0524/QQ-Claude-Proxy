import fs from 'fs';

// 获取 token
const tokenResp = await fetch('https://bots.qq.com/app/getAppAccessToken', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    appId: '102862558',
    clientSecret: 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu'
  })
});

const tokenData = await tokenResp.json();
const accessToken = tokenData.access_token;
console.log('[OK] Token obtained');

// 上传文件
const buffer = fs.readFileSync('workspace/01-intro.mp4');
const base64 = buffer.toString('base64');

console.log('[1/2] Uploading video...');
const uploadResp = await fetch('https://api.sgroup.qq.com/v2/users/9F876637318A3309060486DF5DF0CF8C/files', {
  method: 'POST',
  headers: {
    'Authorization': `QQBot ${accessToken}`,
    'X-Union-Appid': '102862558',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    file_type: 2,
    file_type_data: 'mp4',
    file_data: base64
  })
});

const uploadData = await uploadResp.json();
console.log('[Upload] file_info obtained, length:', uploadData.file_info?.length || 0);

// 发送消息 - 使用 srv_send_msg: true 让服务器自动发送
console.log('[2/2] Sending media message (auto)...');
const sendResp = await fetch('https://api.sgroup.qq.com/v2/users/9F876637318A3309060486DF5DF0CF8C/files', {
  method: 'POST',
  headers: {
    'Authorization': `QQBot ${accessToken}`,
    'X-Union-Appid': '102862558',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    file_type: 2,
    file_type_data: 'mp4',
    file_data: base64,
    srv_send_msg: true  // 让服务器自动发送
  })
});

const sendData = await sendResp.json();
console.log('[Send] Response:', JSON.stringify(sendData, null, 2));

if (sendData.code === 0 || sendData.file_uuid) {
  console.log('[SUCCESS] Video sent!');
} else {
  console.log('[ERROR] Code:', sendData.code, 'Message:', sendData.message);
}
