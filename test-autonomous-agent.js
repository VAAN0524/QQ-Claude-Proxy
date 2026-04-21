/**
 * 自主Agent系统测试
 *
 * 测试分层记忆、上下文收集、提示词生成等核心功能
 */

import { createAutonomousAgent } from './dist/agents/autonomous/index.js';
import { logger } from './dist/utils/logger.js';

async function testAutonomousAgent() {
  logger.info('=== 开始测试自主Agent系统 ===\n');

  // 创建自主Agent（现在工厂函数是异步的）
  const agent = await createAutonomousAgent({
    memoryEnabled: true,
    learningEnabled: true,
    llmProvider: 'glm',
    llmModel: 'glm-4.5',
  });

  logger.info('✅ 自主Agent创建成功');

  // 测试1: 处理简单指令
  logger.info('\n--- 测试1: 处理简单指令 ---');
  const result1 = await agent.process(
    '使用2026最新图片生成AI技术文章',
    'test-user-001'
  );
  console.log('结果:', result1);

  // 等待一下，让记忆系统处理
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 测试2: 获取统计信息
  logger.info('\n--- 测试2: 获取统计信息 ---');
  const stats = agent.getStatistics();
  console.log('记忆统计:', JSON.stringify(stats.memory, null, 2));
  console.log('能力矩阵:', JSON.stringify(stats.capabilities, null, 2));

  // 测试3: 处理第二个指令（测试记忆关联）
  logger.info('\n--- 测试3: 处理第二个指令 ---');
  const result2 = await agent.process(
    '再次生成关于AI的文章',
    'test-user-001'
  );
  console.log('结果:', result2);

  // 测试4: 测试记忆压缩
  logger.info('\n--- 测试4: 测试记忆压缩 ---');
  const compressionResult = await agent.memoryManager.compressAll();
  console.log('压缩结果:', compressionResult);

  // 测试5: 自我进化
  logger.info('\n--- 测试5: 自我进化 ---');
  agent.evolve();
  console.log('✅ 自我进化完成');

  // 最终统计
  logger.info('\n--- 最终统计 ---');
  const finalStats = agent.getStatistics();
  console.log('总记忆数:', finalStats.totalMemories);
  console.log('短期记忆:', finalStats.memory.shortTerm.count);
  console.log('中期记忆:', finalStats.memory.midTerm.count);
  console.log('长期记忆:', finalStats.memory.longTerm.count);

  logger.info('\n=== 自主Agent系统测试完成 ===');
}

// 运行测试
testAutonomousAgent().catch(error => {
  logger.error('测试失败:', error);
  process.exit(1);
});
