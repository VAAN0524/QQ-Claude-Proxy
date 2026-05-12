#!/usr/bin/env node
/**
 * Wiki 初始化脚本
 *
 * 创建 Wiki 所需的目录结构
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wikiRoot = process.env.WIKI_ROOT || path.join(process.env.HOME || process.env.USERPROFILE || '', 'wiki');

async function main() {
  console.log(`📁 初始化 Wiki 目录结构...`);
  console.log(`根目录: ${wikiRoot}\n`);

  // 创建目录结构
  const dirs = [
    path.join(wikiRoot, 'sources'),
    path.join(wikiRoot, 'sources/assets'),
    path.join(wikiRoot, 'wiki'),
    path.join(wikiRoot, 'wiki/entities'),
    path.join(wikiRoot, 'wiki/concepts'),
    path.join(wikiRoot, 'wiki/summaries'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✓ 创建: ${path.relative(wikiRoot, dir)}`);
    } else {
      console.log(`- 已存在: ${path.relative(wikiRoot, dir)}`);
    }
  }

  // 创建 SKILL.md 规则文件
  const skillMdPath = path.join(wikiRoot, 'wiki', 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    const skillContent = `# Wiki SKILL 规则

## 核心原则

> **"AI 是园丁。你是园主。"**

- AI 可以浇水、除草、修枝
- 但种什么花、开什么园、哪棵该留哪棵该剪——还是你说了算
- **Human owns verification**

## 三层架构

\`\`
sources/（原始素材，不可变）
  ↓ 摄入
wiki/（AI 维护的 Wiki）
  ↓ 提炼
SKILL.md（规则，人工审核）
\`\`

## 页面类型

- **entity**: 实体页面（如：人物、公司、产品）
- **concept**: 概念页面（如：技术、方法、理论）
- **summary**: 来源摘要（从 sources 摘要而来）

## 三层标签

- **一级**: 大类目（工作、学习、项目、个人）
- **二级**: 语义脉络（前端、后端、调试、优化）
- **三级**: 具体关键词（WebSocket、React、性能）

## Wiki 链接格式

使用 \`\`[[slug]]\`\` 格式引用其他页面。

## Lint 规则

1. **孤岛检测**: 没有任何入链的页面
2. **断链检测**: 指向不存在页面的链接
3. **覆盖率检测**: sources 中未摄入的文件
4. **防漂移检查**: 数字未标注来源、缺少元数据

## 命令

- \`/wiki save <内容> <一级> <二级> <三级>\` - 保存知识
- \`/wiki search <查询>\` - 搜索知识
- \`/wiki get <slug>\` - 获取页面详情
- \`/wiki list [标签]\` - 列出页面
- \`/wiki tags\` - 查看所有标签
- \`/wiki lint\` - 健康检查
- \`/wiki deep-lint\` - 深度检查
- \`/wiki stats\` - 查看统计信息
`;

    fs.writeFileSync(skillMdPath, skillContent, 'utf-8');
    console.log(`✓ 创建: wiki/SKILL.md`);
  } else {
    console.log(`- 已存在: wiki/SKILL.md`);
  }

  // 创建 log.md
  const logMdPath = path.join(wikiRoot, 'wiki', 'log.md');
  if (!fs.existsSync(logMdPath)) {
    const logContent = `# Wiki 操作日志

## 初始化
- ${new Date().toISOString().split('T')[0]}: Wiki 目录结构创建完成

`;
    fs.writeFileSync(logMdPath, logContent, 'utf-8');
    console.log(`✓ 创建: wiki/log.md`);
  } else {
    console.log(`- 已存在: wiki/log.md`);
  }

  // 创建示例 sources 文件
  const exampleSourcePath = path.join(wikiRoot, 'sources', 'example.md');
  if (!fs.existsSync(exampleSourcePath)) {
    const exampleContent = `# 示例素材

这是一个示例 sources 文件，可以用来测试 Wiki 的摄入功能。

## 重要概念

这里是内容的主体部分。

- 要点1
- 要点2
- 要点3
`;
    fs.writeFileSync(exampleSourcePath, exampleContent, 'utf-8');
    console.log(`✓ 创建: sources/example.md`);
  } else {
    console.log(`- 已存在: sources/example.md`);
  }

  console.log(`\n✅ Wiki 初始化完成！`);
  console.log(`\n下一步:`);
  console.log(`1. 将素材放入 ${path.join(wikiRoot, 'sources')} 目录`);
  console.log(`2. 使用 /wiki save 命令保存知识`);
  console.log(`3. 使用 /wiki lint 进行健康检查`);
}

main().catch(console.error);
