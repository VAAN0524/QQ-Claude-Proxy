#!/usr/bin/env node
/**
 * 特医食品及功能性食品法规搜索与下载脚本
 * 搜索GMP、GSP等相关质量管理体系和厂房车间认证规定
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 目标文件夹
const OUTPUT_DIR = 'C:/Test/bot/法规下载/特医及功能性食品';

// 法规搜索列表（包含官方来源）
const regulations = [
  {
    name: '特殊医学用途配方食品生产许可审查细则',
    keyword: '特殊医学用途配方食品生产许可审查细则 国家市场监督管理总局',
    source: 'SAMR'
  },
  {
    name: '特殊医学用途配方食品注册管理办法',
    keyword: '特殊医学用途配方食品注册管理办法 2023',
    source: 'SAMR'
  },
  {
    name: '保健食品生产许可审查细则',
    keyword: '保健食品生产许可审查细则 市场监管总局',
    source: 'SAMR'
  },
  {
    name: '食品生产许可管理办法',
    keyword: '食品生产许可管理办法 2020',
    source: 'SAMR'
  },
  {
    name: '药品生产质量管理规范(GMP)',
    keyword: '药品生产质量管理规范 2024年修订',
    source: 'NMPA'
  },
  {
    name: '药品经营质量管理规范(GSP)',
    keyword: '药品经营质量管理规范 最新版',
    source: 'NMPA'
  },
  {
    name: '特殊食品生产监督检查操作指南',
    keyword: '特殊食品生产监督检查操作指南',
    source: 'SAMR'
  },
  {
    name: '食品安全管理体系认证实施规则',
    keyword: '食品安全管理体系认证实施规则 HACCP',
    source: 'CNCA'
  },
  {
    name: '保健食品注册与备案管理办法',
    keyword: '保健食品注册与备案管理办法 2024',
    source: 'SAMR'
  },
  {
    name: '食品生产许可审查通则',
    keyword: '食品生产许可审查通则 2023版',
    source: 'SAMR'
  }
];

/**
 * 使用DuckDuckGo搜索法规
 */
function searchDuckDuckGo(query) {
  return new Promise((resolve, reject) => {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * 下载文件
 */
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const file = fs.createWriteStream(filepath);

    protocol.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // 跟随重定向
        downloadFile(res.headers.location, filepath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('=== 特医食品及功能性食品法规搜索与下载 ===\n');
  console.log(`目标目录: ${OUTPUT_DIR}\n`);

  // 确保目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 检查已下载的文件
  const existingFiles = fs.existsSync(OUTPUT_DIR)
    ? fs.readdirSync(OUTPUT_DIR)
    : [];

  console.log(`已下载文件 (${existingFiles.length}个):`);
  existingFiles.forEach(f => console.log(`  - ${f}`));
  console.log('');

  const results = [];

  for (const reg of regulations) {
    console.log(`\n搜索: ${reg.name}`);
    console.log(`关键词: ${reg.keyword}`);

    try {
      const searchResult = await searchDuckDuckGo(reg.keyword + ' pdf 官网');
      results.push({
        name: reg.name,
        status: 'searched',
        data: searchResult
      });
      console.log('✓ 搜索完成');
    } catch (error) {
      console.log(`✗ 搜索失败: ${error.message}`);
      results.push({
        name: reg.name,
        status: 'failed',
        error: error.message
      });
    }

    // 避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 保存搜索结果
  const resultPath = path.join(OUTPUT_DIR, '搜索结果.json');
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n搜索结果已保存到: ${resultPath}`);

  return results;
}

// 执行
main().catch(console.error);
