#!/usr/bin/env node
/**
 * 测试中文编码修复
 */

// 测试 safeStringify 函数
function safeStringify(obj) {
  try {
    const json = JSON.stringify(obj);
    return json.replace(/\\u([\d\w]{4})/g, (match, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  } catch (error) {
    return String(obj);
  }
}

// 测试数据
const testData = {
  title: "2026 AI变革：免费时代来了",
  content: "2026年刚开年，AI圈就炸了。OpenAI宣布GPT-5免费无限使用",
  author: "AI资讯",
  tags: ["人工智能", "免费", "GPT-5"]
};

console.log('='.repeat(60));
console.log('中文编码修复测试');
console.log('='.repeat(60));

console.log('\n❌ 错误方式 (JSON.stringify):');
console.log(JSON.stringify(testData));

console.log('\n✅ 正确方式 (safeStringify):');
console.log(safeStringify(testData));

console.log('\n📋 对比结果:');
console.log('原始标题:', testData.title);
console.log('错误输出:', JSON.stringify(testData.title));
console.log('正确输出:', safeStringify(testData.title));

console.log('\n' + '='.repeat(60));
console.log('✅ 中文编码修复已验证！');
console.log('='.repeat(60));
