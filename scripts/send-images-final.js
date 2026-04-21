#!/usr/bin/env node
import { QQBotAPI } from '../dist/channels/qqbot/api.js';
import { readFileSync } from 'fs';

const config = {
  appId: '102862558',
  appSecret: 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu',
  sandbox: false
};

const userOpenId = '9F876637318A3309060486DF5DF0CF8C';

const images = [
  { file: 'C:/Users/USER939479/.claude/skills/Image/illustration_20260315_124107_5870339.png', title: '热点1' },
  { file: 'C:/Users/USER939479/.claude/skills/Image/illustration_20260315_124159_5870344.png', title: '热点2' },
  { file: 'C:/Users/USER939479/.claude/skills/Image/illustration_20260315_124255_5870350.png', title: '热点3' },
  { file: 'C:/Users/USER939479/.claude/skills/Image/illustration_20260315_124347_5870358.png', title: '热点4' },
  { file: 'C:/Users/USER939479/.claude/skills/Image/illustration_20260315_124443_5870364.png', title: '热点5' }
];

async function main() {
  const api = new QQBotAPI(config);
  
  console.log('Sending images...');
  
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    console.log(`Image ${i+1}: ${img.title}`);
    
    try {
      await api.sendC2CMessage(userOpenId, img.title);
      await new Promise(r => setTimeout(r, 500));
      
      const buf = readFileSync(img.file);
      await api.uploadC2CFile(userOpenId, buf, 1, 'png', true);
      
      console.log(`OK ${i+1}`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`Fail ${i+1}:`, e.message);
    }
  }
  
  await api.sendC2CMessage(userOpenId, 'All images sent!');
  console.log('Done!');
}

main();
