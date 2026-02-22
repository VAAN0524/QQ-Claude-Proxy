/**
 * 简单测试脚本 - 测试 Claude Code CLI 执行
 * 运行: npx tsx test-cli.ts
 */

import { ClaudeCodeCli } from './src/agent/claude-cli.js';
import { FileStorage } from './src/agent/file-storage.js';

async function testClaudeCli() {
  console.log('=== 测试 Claude Code CLI ===\n');

  const cli = new ClaudeCodeCli({
    cwd: process.cwd(),
  });

  // 测试 1: 简单问答
  console.log('测试 1: 简单问答');
  console.log('发送: "请用一句话介绍你自己"');
  console.log('等待响应...\n');

  const result = await cli.execute('请用一句话介绍你自己，然后告诉我你现在能访问哪些工具。');

  console.log('执行结果:');
  console.log('- 成功:', result.success);
  console.log('- 输出长度:', result.output.length, '字符');
  console.log('- 输出预览:', result.output.substring(0, 200) + '...');
  if (result.error) {
    console.log('- 错误:', result.error);
  }

  console.log('\n=== 测试完成 ===');
}

async function testFileStorage() {
  console.log('\n=== 测试 FileStorage ===\n');

  const storage = new FileStorage('./uploads');

  // 测试存储一个简单文件
  const testContent = '这是一个测试文件\n创建时间: ' + new Date().toISOString();
  const stored = await storage.storeFile(
    Buffer.from(testContent),
    'test.txt',
    'text/plain'
  );

  console.log('文件存储结果:');
  console.log('- ID:', stored.id);
  console.log('- 路径:', stored.path);
  console.log('- 文件名:', stored.originalName);
  console.log('- MIME类型:', stored.mimeType);

  // 读取文件验证
  const filePath = storage.getFilePath(stored.id);
  console.log('- 文件存在:', !!filePath);

  console.log('\n=== FileStorage 测试完成 ===');
}

// 运行测试
async function main() {
  try {
    await testFileStorage();
    console.log('\n' + '='.repeat(50) + '\n');
    await testClaudeCli();
  } catch (error) {
    console.error('测试失败:', error);
    process.exit(1);
  }
}

main();
