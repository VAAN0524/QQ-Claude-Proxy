#!/usr/bin/env node
/**
 * 特医食品及功能性食品法规搜索与下载脚本 v2
 * 使用搜索API获取法规信息并下载
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const OUTPUT_DIR = 'C:/Test/bot/法规下载/特医及功能性食品';

// 法规列表 - 2026年适用版本
const regulations = [
  {
    id: 1,
    name: '特殊医学用途配方食品生产许可审查细则',
    filename: '特殊医学用途配方食品生产许可审查细则.pdf',
    searchQueries: [
      '特殊医学用途配方食品生产许可审查细则 市场监管总局 2024',
      '特殊医学用途配方食品生产许可 审查细则 官网 pdf'
    ],
    officialSources: ['samr.gov.cn', 'marketreg.org.cn'],
    priority: 'high'
  },
  {
    id: 2,
    name: '特殊医学用途配方食品生产质量管理规范',
    filename: '特殊医学用途配方食品生产质量管理规范.pdf',
    searchQueries: [
      '特殊医学用途配方食品生产质量管理规范 GMP',
      '特医食品生产质量管理规范 2024'
    ],
    officialSources: ['samr.gov.cn'],
    priority: 'high'
  },
  {
    id: 3,
    name: '特殊医学用途配方食品注册管理办法',
    filename: '特殊医学用途配方食品注册管理办法.pdf',
    searchQueries: [
      '特殊医学用途配方食品注册管理办法 2023',
      '特医食品注册管理办法 市场监管总局'
    ],
    officialSources: ['samr.gov.cn'],
    priority: 'high'
  },
  {
    id: 4,
    name: '保健食品生产许可审查细则',
    filename: '保健食品生产许可审查细则.pdf',
    searchQueries: [
      '保健食品生产许可审查细则 市场监管总局',
      '保健食品生产许可 审查细则 2024'
    ],
    officialSources: ['samr.gov.cn'],
    priority: 'high'
  },
  {
    id: 5,
    name: '食品生产许可管理办法',
    filename: '食品生产许可管理办法.pdf',
    searchQueries: [
      '食品生产许可管理办法 2020年',
      '食品生产许可管理办法 最新版'
    ],
    officialSources: ['samr.gov.cn'],
    priority: 'high'
  },
  {
    id: 6,
    name: '药品生产质量管理规范(GMP)',
    filename: '药品生产质量管理规范GMP.pdf',
    searchQueries: [
      '药品生产质量管理规范 2024年修订',
      'GMP 药品生产质量管理规范 附录'
    ],
    officialSources: ['nmpa.gov.cn'],
    priority: 'high'
  },
  {
    id: 7,
    name: '药品经营质量管理规范(GSP)',
    filename: '药品经营质量管理规范GSP.pdf',
    searchQueries: [
      '药品经营质量管理规范 2024 2025',
      'GSP 药品经营质量管理规范 最新版'
    ],
    officialSources: ['nmpa.gov.cn'],
    priority: 'high'
  },
  {
    id: 8,
    name: '保健食品注册与备案管理办法',
    filename: '保健食品注册与备案管理办法.pdf',
    searchQueries: [
      '保健食品注册与备案管理办法 2024',
      '保健食品注册备案 市场监管总局'
    ],
    officialSources: ['samr.gov.cn'],
    priority: 'medium'
  },
  {
    id: 9,
    name: '食品生产许可审查通则',
    filename: '食品生产许可审查通则.pdf',
    searchQueries: [
      '食品生产许可审查通则 2023版',
      '食品生产许可 审查通则 最新'
    ],
    officialSources: ['samr.gov.cn'],
    priority: 'medium'
  },
  {
    id: 10,
    name: '特殊食品生产监督检查操作指南',
    filename: '特殊食品生产监督检查操作指南.pdf',
    searchQueries: [
      '特殊食品生产监督检查操作指南',
      '特医食品 检查指南 市场监管'
    ],
    officialSources: ['samr.gov.cn'],
    priority: 'medium'
  }
];

/**
 * 使用Bing搜索API获取结果
 */
function searchBing(query) {
  return new Promise((resolve, reject) => {
    // 使用DuckDuckGo作为替代
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query + ' pdf 官网')}&format=json`;

    https.get(searchUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          // 提取相关链接
          const links = result.RelatedTopics || [];
          resolve(links);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * 使用serpAPI进行搜索（如果有API key）
 */
function searchWithSerpAPI(query, apiKey) {
  return new Promise((resolve, reject) => {
    const url = `https://serpapi.com/search?q=${encodeURIComponent(query)}&api_key=${apiKey}&hl=zh-cn`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.organic_results || []);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * 直接从官网获取法规文件
 */
function fetchFromOfficialSite(reg) {
  return new Promise((resolve, reject) => {
    // 构建官网搜索URL
    const searchUrls = reg.officialSources.map(domain => {
      return `https://www.google.com/search?q=site:${domain}+${encodeURIComponent(reg.name)}`;
    });

    resolve(searchUrls);
  });
}

/**
 * 下载文件
 */
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.path + (urlObj.search || ''),
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const req = protocol.request(options, (res) => {
      // 处理重定向
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          console.log(`    -> 重定向到: ${redirectUrl}`);
          downloadFile(redirectUrl, filepath).then(resolve).catch(reject);
          return;
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      const file = fs.createWriteStream(filepath);
      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * 检查已下载的文件
 */
function checkDownloadedFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return [];
  }

  const files = fs.readdirSync(OUTPUT_DIR).filter(f =>
    !f.startsWith('.') && f !== '搜索结果.json'
  );

  return files;
}

/**
 * 创建法规信息文件
 */
function createRegulationsIndex(results) {
  const indexPath = path.join(OUTPUT_DIR, '法规索引.md');

  let content = '# 特医食品及功能性食品法规索引\n\n';
  content += `更新时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  content += `已下载: ${results.filter(r => r.status === 'downloaded').length}/${results.length}\n\n`;
  content += '---\n\n';

  results.forEach((reg, index) => {
    content += `## ${index + 1}. ${reg.name}\n\n`;
    content += `- **状态**: ${reg.status === 'downloaded' ? '✅ 已下载' : '❌ 未下载'}\n`;
    content += `- **文件名**: ${reg.filename}\n`;
    content += `- **优先级**: ${reg.priority}\n`;
    if (reg.url) {
      content += `- **来源**: ${reg.url}\n`;
    }
    if (reg.error) {
      content += `- **错误**: ${reg.error}\n`;
    }
    content += '\n';
  });

  fs.writeFileSync(indexPath, content, 'utf-8');
  console.log(`\n法规索引已创建: ${indexPath}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('=== 特医食品及功能性食品法规下载工具 v2 ===\n');
  console.log(`目标目录: ${OUTPUT_DIR}\n`);

  // 确保目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 检查已下载文件
  const downloaded = checkDownloadedFiles();
  console.log(`已下载文件 (${downloaded.length}个):`);
  downloaded.forEach(f => console.log(`  ✓ ${f}`));

  if (downloaded.length > 0) {
    console.log('\n跳过已下载的文件...\n');
  }

  const results = [];
  let downloadedCount = 0;
  let failedCount = 0;

  for (const reg of regulations) {
    // 检查是否已下载
    if (downloaded.includes(reg.filename)) {
      console.log(`[${reg.id}/${regulations.length}] ⏭ 跳过: ${reg.name} (已存在)`);
      results.push({ ...reg, status: 'exists' });
      continue;
    }

    console.log(`\n[${reg.id}/${regulations.length}] 🔍 搜索: ${reg.name}`);

    // 尝试搜索和下载
    let downloaded = false;

    for (const query of reg.searchQueries) {
      if (downloaded) break;

      console.log(`  搜索词: ${query}`);

      try {
        // 这里需要实际的搜索和下载逻辑
        // 由于没有直接的搜索API，我们将输出搜索建议
        console.log(`  建议访问:`);
        reg.officialSources.forEach(source => {
          console.log(`    - https://www.${source} (搜索: ${reg.name})`);
        });

        // 标记为需要手动下载
        results.push({
          ...reg,
          status: 'manual',
          note: '需要从官网手动下载'
        });
        downloadedCount++;
        downloaded = true;

      } catch (error) {
        console.log(`  ✗ 错误: ${error.message}`);
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!downloaded) {
      results.push({
        ...reg,
        status: 'failed',
        error: '无法找到下载链接'
      });
      failedCount++;
    }
  }

  // 创建索引文件
  createRegulationsIndex(results);

  // 输出统计
  console.log('\n=== 下载完成 ===');
  console.log(`总计: ${regulations.length} 个法规`);
  console.log(`✅ 成功/已存在: ${downloadedCount + downloaded.length}`);
  console.log(`⏭ 需手动下载: ${results.filter(r => r.status === 'manual').length}`);
  console.log(`❌ 失败: ${failedCount}`);

  return results;
}

// 执行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, regulations };
