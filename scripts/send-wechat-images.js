#!/usr/bin/env node
import { QQBotAPI } from '../dist/channels/qqbot/api.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const config = {
  appId: '102862558',
  appSecret: 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu',
  sandbox: false
};

const userOpenId = '9F876637318A3309060486DF5DF0CF8C';

// 自动查找最新的任务目录
function findLatestTaskDir() {
  const parentDir = 'C:/Test';

  // 读取所有匹配的目录
  const dirs = readdirSync(parentDir)
    .filter(name => name.startsWith('wechat_article_'))
    .map(name => join(parentDir, name))
    .filter(path => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    });

  if (dirs.length === 0) {
    throw new Error('未找到任务目录');
  }

  // 按修改时间排序，返回最新的
  const latestDir = dirs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  console.log(`[INFO] 使用最新任务目录: ${latestDir}`);
  return latestDir;
}

// 自动查找任务目录中的所有图片
function findImages(taskDir) {
  const imagesDir = join(taskDir, 'images');
  const images = [];

  try {
    const files = readdirSync(imagesDir).filter(f => f.endsWith('.png'));

    // 按文件名排序
    files.sort();

    // 封面图
    if (files.includes('cover.png')) {
      images.push({
        file: join(imagesDir, 'cover.png'),
        title: '封面图：AI资讯'
      });
    }

    // 章节配图
    const chapterFiles = files.filter(f => f.startsWith('chapter'));
    for (const f of chapterFiles) {
      const chapterNum = f.match(/chapter(\d+)/)?.[1] || '?';
      images.push({
        file: join(imagesDir, f),
        title: `章节${chapterNum}配图`
      });
    }
  } catch (error) {
    console.error('[ERROR] 读取图片目录失败:', error.message);
  }

  return images;
}

const taskDir = findLatestTaskDir();
const images = findImages(taskDir);

console.log(`[INFO] 找到 ${images.length} 张图片`);

async function sendImages() {
  const api = new QQBotAPI(config);

  try {
    console.log('开始发送AI资讯文章配图到QQ...');

    await api.sendC2CMessage(userOpenId, `📸 AI资讯文章配图（${images.length}张）`);

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      console.log(`发送第${i+1}张: ${img.title}`);

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

    await api.sendC2CMessage(userOpenId, 'AI资讯文章配图发送完成！');
    console.log('Done!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

sendImages();
