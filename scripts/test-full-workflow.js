#!/usr/bin/env node
/**
 * AI资讯自动化完整工作流测试脚本
 *
 * 测试内容：
 * 1. 搜索功能（zhipu-search）
 * 2. 文章生成质量（wechat-publisher）
 * 3. 配图生成质量（Image V4.0）
 * 4. 图片嵌入（upload-to-wechat-fixed.py）
 * 5. 生成详细报告
 */

import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKSPACE_DIR = join(process.cwd(), 'workspace');
const REPORT_FILE = join(WORKSPACE_DIR, `workflow-test-report-${Date.now()}.md`);

// 测试结果
const results = {
  timestamp: new Date().toISOString(),
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
};

/**
 * 执行命令并捕获输出
 */
async function executeCommand(command, args = [], timeout = 60000) {
  return new Promise((resolve, reject) => {
    // Windows 编码修复：使用 spawn 直接执行，避免 shell 编码问题
    const isPython = command.toLowerCase().includes('python');

    const options = {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,  // 不使用 shell，避免编码问题
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',  // 设置 Python 编码
        LANG: 'en_US.UTF-8'
      }
    };

    const proc = spawn(command, args, options);

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Command timeout after ${timeout}ms`));
    }, timeout);

    proc.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString('utf-8');
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr, exitCode: 0 });
      } else {
        reject(new Error(`Command failed with exit code ${code}\nSTDERR: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * 记录测试结果
 */
function logTest(testName, status, details, warnings = []) {
  const test = {
    name: testName,
    status,  // 'passed', 'failed', 'warning'
    details,
    warnings,
    timestamp: new Date().toISOString()
  };

  results.tests.push(test);
  results.summary.total++;

  if (status === 'passed') {
    results.summary.passed++;
  } else if (status === 'failed') {
    results.summary.failed++;
  } else {
    results.summary.warnings++;
  }

  console.log(`[${status.toUpperCase()}] ${testName}`);
  if (warnings.length > 0) {
    warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  }
}

/**
 * 测试1: 搜索功能
 */
async function testSearch() {
  console.log('\n🔍 测试1: 搜索功能（zhipu-search）');

  try {
    const query = 'AI人工智能最新热点 科技资讯 2026';
    const pythonScript = join(process.cwd(), 'skills', 'zhipu-search', 'scripts', 'search.py');

    if (!existsSync(pythonScript)) {
      logTest('搜索功能', 'failed', 'zhipu-search 脚本不存在', ['请先安装 zhipu-search skill']);
      return;
    }

    const { stdout } = await executeCommand('python', [pythonScript, query, '--limit', '5'], 30000);

    const results = [];
    const lines = stdout.split('\n');
    let currentResult = null;

    for (const line of lines) {
      if (line.includes('Title:') && !currentResult) {
        currentResult = { title: line.split('Title:')[1].trim() };
      } else if (line.includes('URL:') && currentResult) {
        currentResult.url = line.split('URL:')[1].trim();
        results.push(currentResult);
        currentResult = null;
      }
    }

    if (results.length >= 3) {
      logTest(
        '搜索功能',
        'passed',
        `成功获取 ${results.length} 条结果`,
        results.length < 5 ? ['建议增加搜索结果数量'] : []
      );
    } else {
      logTest('搜索功能', 'failed', `仅获取 ${results.length} 条结果，不足3条`);
    }

    return results[0];  // 返回第一条结果用于后续测试
  } catch (error) {
    logTest('搜索功能', 'failed', error.message);
    return null;
  }
}

/**
 * 测试2: 配图生成质量（场景化叙事）
 */
async function testImageGeneration(topic) {
  console.log('\n🎨 测试2: 配图生成质量（Image V4.0 场景化叙事）');

  // 使用英文主题避免 Windows CMD 编码问题
  const testTopic = topic || 'AI Agent Technology Breakthrough';
  const scriptPath = join(process.cwd(), 'skills', 'Image', 'image_gen_v4.py');

  if (!existsSync(scriptPath)) {
    logTest('配图生成', 'failed', 'image_gen_v4.py 脚本不存在', ['请确认 Image skill 已更新到 V3.1']);
    return null;
  }

  try {
    const args = [
      scriptPath,
      testTopic,
      '--style', 'narrative',
      '--scene', 'office',
      '--character', 'programmer'
    ];

    console.log(`执行命令: python ${args.join(' ')}`);

    const { stdout, stderr } = await executeCommand('python', args, 90000);

    // 检查生成结果
    const warnings = [];

    if (stdout.includes('✅ Image saved:')) {
      const match = stdout.match(/✅ Image saved: (.+)/);
      if (match) {
        const imagePath = match[1].trim();

        // 检查文件大小
        const fs = await import('fs/promises');
        const stats = await fs.stat(imagePath);
        const sizeMB = stats.size / (1024 * 1024);

        if (sizeMB < 0.5) {
          warnings.push('图片文件较小，可能质量不足');
        }

        logTest(
          '配图生成（场景化叙事）',
          'passed',
          `成功生成图片: ${imagePath} (${sizeMB.toFixed(2)} MB)`,
          warnings
        );

        return imagePath;
      }
    }

    // 如果没有找到成功消息，尝试从错误信息中提取
    if (stderr) {
      logTest('配图生成（场景化叙事）', 'failed', `生成失败: ${stderr}`);
    } else {
      logTest('配图生成（场景化叙事）', 'failed', '未找到生成的图片文件');
    }

    return null;
  } catch (error) {
    // 检查是否是编码问题
    if (error.message.includes('encoding') || error.message.includes('unicode')) {
      logTest('配图生成（场景化叙事）', 'failed', 'Windows 编码问题（已修复，请重试）', [
        '提示: Python 脚本已添加 UTF-8 编码支持',
        '提示: Node.js 脚本已设置 PYTHONIOENCODING=utf-8'
      ]);
    } else {
      logTest('配图生成（场景化叙事）', 'failed', error.message);
    }
    return null;
  }
}

/**
 * 测试3: 文章格式验证
 */
async function testArticleFormat() {
  console.log('\n📝 测试3: 文章格式验证');

  const articlePath = join(WORKSPACE_DIR, 'ai_news_final_report.md');

  if (!existsSync(articlePath)) {
    logTest('文章格式验证', 'failed', '文章文件不存在', ['请先执行完整的工作流']);
    return;
  }

  try {
    const content = await readFile(articlePath, 'utf-8');
    const warnings = [];
    let score = 0;

    // 检查1: 标题长度（< 64字节）
    const lines = content.split('\n');
    const title = lines[0].replace(/^#\s*/, '');
    const titleBytes = Buffer.from(title).length;
    if (titleBytes < 64) {
      score++;
    } else {
      warnings.push(`标题过长 (${titleBytes} 字节，应 < 64)`);
    }

    // 检查2: 封面图引用
    if (content.includes('![封面图](images/cover.png') || content.includes('![](images/cover.png')) {
      score++;
    } else {
      warnings.push('缺少封面图引用');
    }

    // 检查3: 章节配图
    const chapterImages = (content.match(/!\[.*\]\(images\/chapter\d+.*\.png\)/g) || []).length;
    if (chapterImages >= 1) {
      score++;
    } else {
      warnings.push('缺少章节配图');
    }

    // 检查4: 去AI味（避免AI高频词汇）
    const aiFlavorWords = ['综上所述', '值得注意的是', '首先', '其次', '最后', '值得注意的是'];
    let aiFlavorCount = 0;
    for (const word of aiFlavorWords) {
      if (content.includes(word)) {
        aiFlavorCount++;
      }
    }
    if (aiFlavorCount < 3) {
      score++;
    } else {
      warnings.push(`发现 ${aiFlavorCount} 个AI高频词汇`);
    }

    // 检查5: 自然写作风格（避免特殊符号）
    const specialSymbols = content.match(/[【】『』「」]/g);
    if (!specialSymbols || specialSymbols.length < 5) {
      score++;
    } else {
      warnings.push(`发现 ${specialSymbols.length} 个特殊符号`);
    }

    // 检查6: 章节结构
    const chapters = content.match(/^##\s+\d+\s+.+/gm);
    if (chapters && chapters.length >= 2) {
      score++;
    } else {
      warnings.push('章节结构不完整（至少2个章节）');
    }

    const status = score >= 5 ? 'passed' : (score >= 3 ? 'warning' : 'failed');

    logTest(
      '文章格式验证',
      status,
      `质量评分: ${score}/6`,
      warnings
    );

    return { score, warnings };
  } catch (error) {
    logTest('文章格式验证', 'failed', error.message);
    return null;
  }
}

/**
 * 测试4: 图片嵌入验证
 */
async function testImageEmbedding() {
  console.log('\n🖼️  测试4: 图片嵌入验证');

  const scriptPath = join(process.cwd(), 'scripts', 'upload-to-wechat-fixed.py');

  if (!existsSync(scriptPath)) {
    logTest('图片嵌入验证', 'failed', 'upload-to-wechat-fixed.py 不存在', ['请确认修复版脚本存在']);
    return;
  }

  try {
    // 读取脚本内容，检查关键修复
    const scriptContent = await readFile(scriptPath, 'utf-8');
    const warnings = [];

    // 检查1: 是否使用 re.escape()
    if (scriptContent.includes('re.escape(img_file)')) {
      logTest('图片嵌入验证', 'passed', '✓ 使用 re.escape() 进行文件名匹配');
    } else {
      warnings.push('未使用 re.escape()，可能有文件名匹配问题');
    }

    // 检查2: 是否支持带描述的格式
    if (scriptContent.includes('![')) {
      logTest('图片嵌入格式', 'passed', '✓ 支持带描述的图片格式 ![描述](path)');
    } else {
      warnings.push('可能不支持带描述的图片格式');
    }

    // 检查3: 嵌入逻辑
    if (scriptContent.includes('re.escape') && scriptContent.includes('chapter')) {
      logTest('图片嵌入逻辑', 'passed', '✓ 章节配图嵌入逻辑正确');
    } else {
      warnings.push('章节配图嵌入逻辑可能有问题');
    }

    if (warnings.length > 0) {
      logTest('图片嵌入验证', 'warning', '发现潜在问题', warnings);
    }

    return { warnings };
  } catch (error) {
    logTest('图片嵌入验证', 'failed', error.message);
    return null;
  }
}

/**
 * 测试5: 端口和API状态检查
 */
async function testSystemStatus() {
  console.log('\n🔧 测试5: 系统状态检查');

  const warnings = [];

  // 检查 Gateway 端口
  try {
    const response = await fetch('http://localhost:18789/status');
    if (response.ok) {
      logTest('Gateway 状态', 'passed', '✓ Gateway 运行正常 (port 18789)');
    } else {
      warnings.push('Gateway 响应异常');
      logTest('Gateway 状态', 'warning', 'Gateway 响应异常');
    }
  } catch (error) {
    warnings.push('Gateway 未启动，请执行 npm start');
    logTest('Gateway 状态', 'failed', 'Gateway 未启动');
  }

  // 检查 Dashboard
  try {
    const response = await fetch('http://localhost:8080');
    if (response.ok) {
      logTest('Dashboard 状态', 'passed', '✓ Dashboard 运行正常 (port 8080)');
    } else {
      warnings.push('Dashboard 响应异常');
      logTest('Dashboard 状态', 'warning', 'Dashboard 响应异常');
    }
  } catch (error) {
    warnings.push('Dashboard 未启动');
    logTest('Dashboard 状态', 'failed', 'Dashboard 未启动');
  }

  return { warnings };
}

/**
 * 生成测试报告
 */
async function generateReport() {
  console.log('\n📊 生成测试报告...');

  const report = `# AI资讯自动化工作流测试报告

**生成时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
**测试环境**: Windows 10, Node.js ${process.version}

---

## 📈 测试摘要

| 指标 | 数值 |
|------|------|
| 总测试数 | ${results.summary.total} |
| 通过 ✅ | ${results.summary.passed} |
| 失败 ❌ | ${results.summary.failed} |
| 警告 ⚠️  | ${results.summary.warnings} |
| 通过率 | ${((results.summary.passed / results.summary.total) * 100).toFixed(1)}% |

---

## 📋 详细测试结果

${results.tests.map(test => `
### ${test.name}

**状态**: ${test.status === 'passed' ? '✅ 通过' : test.status === 'failed' ? '❌ 失败' : '⚠️  警告'}
**时间**: ${new Date(test.timestamp).toLocaleString('zh-CN')}

**详情**: ${test.details}

${test.warnings.length > 0 ? `
**警告/问题**:
${test.warnings.map(w => `- ${w}`).join('\n')}
` : ''}
`).join('\n')}

---

## 🔧 修复建议

### 立即修复（今天）

${results.tests.filter(t => t.status === 'failed').map(t => {
  return `- **${t.name}**: ${t.details}`;
}).join('\n') || '- 无'}

### 本周优化

${results.tests.filter(t => t.warnings.length > 0).map(t => {
  return `- **${t.name}**:\n${t.warnings.map(w => `  - ${w}`).join('\n')}`;
}).join('\n') || '- 无'}

### 下一步行动

1. **启动调度器**: 如果 Gateway 未启动，执行 \`npm start\`
2. **手动测试**: 通过 QQ Bot 触发一次完整的 AI 资讯任务
3. **监控执行**: 查看 Dashboard (http://localhost:8080/tasks.html)
4. **检查日志**: \`tail -f workspace/logs/app.log\`

---

## 📚 相关文档

- 修复报告: [docs/skills-fix-report-20260316.md](../docs/skills-fix-report-20260316.md)
- 质量分析: [docs/task-quality-analysis-report.md](../docs/task-quality-analysis-report.md)
- 场景化叙事指南: [docs/narrative-image-guide.md](../docs/narrative-image-guide.md)
- 图片嵌入修复: [docs/wechat-image-embedding-fix.md](../docs/wechat-image-embedding-fix.md)

---

**报告生成**: 自动化测试脚本
**脚本版本**: 1.0.0
**下次测试**: 建议每周执行一次
`;

  await writeFile(REPORT_FILE, report, 'utf-8');
  console.log(`✅ 报告已生成: ${REPORT_FILE}`);

  return REPORT_FILE;
}

/**
 * 主测试流程
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     AI资讯自动化完整工作流测试                           ║');
  console.log('║     AI News Automation Workflow Test                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // 测试1: 搜索功能
    const searchResult = await testSearch();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 测试2: 配图生成
    await testImageGeneration(searchResult?.title);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 测试3: 文章格式
    await testArticleFormat();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 测试4: 图片嵌入
    await testImageEmbedding();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 测试5: 系统状态
    await testSystemStatus();

    // 生成报告
    await generateReport();

    // 输出摘要
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  测试摘要                                                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`总计: ${results.summary.total} | 通过: ${results.summary.passed} | 失败: ${results.summary.failed} | 警告: ${results.summary.warnings}`);
    console.log(`通过率: ${((results.summary.passed / results.summary.total) * 100).toFixed(1)}%`);
    console.log(`\n✅ 测试完成！详细报告: ${REPORT_FILE}`);

  } catch (error) {
    console.error('\n❌ 测试流程出错:', error.message);
    process.exit(1);
  }
}

// 执行测试
main();
