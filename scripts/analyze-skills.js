#!/usr/bin/env node
/**
 * Skills 分析脚本
 * 分析所有 skills 的使用情况、功能重复度、是否过时
 */

import { readFile, readdir, stat, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SKILLS_DIR = join(process.cwd(), 'skills');

// Skill 分析结果
const analysis = {
  total: 0,
  active: 0,
  deprecated: 0,
  duplicates: [],
  mergeRecommendations: [],
  deleteRecommendations: [],
  keep: []
};

/**
 * 解析 SKILL.md 的 frontmatter
 */
function parseSkillFrontmatter(content) {
  const lines = content.split('\n');
  const frontmatter = {};
  let inFrontmatter = false;

  for (const line of lines) {
    if (line.trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      } else {
        break;
      }
    }

    if (inFrontmatter) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        frontmatter[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  }

  return frontmatter;
}

/**
 * 分析单个 skill
 */
async function analyzeSkill(skillPath, skillName) {
  const skillFile = join(skillPath, 'SKILL.md');

  if (!existsSync(skillFile)) {
    return {
      name: skillName,
      status: 'missing',
      reason: 'SKILL.md 文件不存在'
    };
  }

  const content = await readFile(skillFile, 'utf-8');
  const frontmatter = parseSkillFrontmatter(content);

  // 检查是否过时
  const deprecatedIndicators = [
    'deprecated', 'obsolete', 'legacy', '旧版', '已弃用', '待删除'
  ];

  const isDeprecated =
    frontmatter.status === 'deprecated' ||
    deprecatedIndicators.some(indicator =>
      content.toLowerCase().includes(indicator)
    );

  // 检查是否有代码文件
  const hasCode = existsSync(join(skillPath, 'index.js')) ||
                  existsSync(join(skillPath, 'index.py')) ||
                  existsSync(join(skillPath, 'scripts'));

  // 检查最后更新时间
  const stats = await stat(skillFile);
  const lastUpdated = stats.mtime;
  const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

  return {
    name: skillName,
    title: frontmatter.title || frontmatter.name || skillName,
    description: frontmatter.description || '',
    version: frontmatter.version || 'unknown',
    status: frontmatter.status || 'unknown',
    category: frontmatter.category || 'uncategorized',
    author: frontmatter.author || 'unknown',
    isDeprecated,
    hasCode,
    daysSinceUpdate: Math.floor(daysSinceUpdate),
    lastUpdated: lastUpdated.toISOString().split('T')[0]
  };
}

/**
 * 检测功能重复
 */
function detectDuplicates(skills) {
  const duplicates = [];

  // 按类别分组
  const byCategory = {};
  skills.forEach(skill => {
    const category = skill.category || 'other';
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(skill);
  });

  // 查找重复的功能描述
  const descriptions = {};
  skills.forEach(skill => {
    if (!skill.description) return;

    const keywords = skill.description.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 5);

    keywords.forEach(keyword => {
      if (!descriptions[keyword]) {
        descriptions[keyword] = [];
      }
      descriptions[keyword].push(skill.name);
    });
  });

  // 找出有重复关键词的 skill
  Object.entries(descriptions).forEach(([keyword, skillNames]) => {
    if (skillNames.length > 1) {
      const existing = duplicates.find(d =>
        d.skills.length === skillNames.length &&
        d.skills.every(s => skillNames.includes(s))
      );

      if (!existing) {
        duplicates.push({
          keyword,
          skills: skillNames,
          count: skillNames.length
        });
      }
    }
  });

  return duplicates.filter(d => d.count > 1);
}

/**
 * 生成合并建议
 */
function generateMergeRecommendations(skills, duplicates) {
  const recommendations = [];

  // 1. Git 相关 skills
  const gitSkills = skills.filter(s =>
    s.name.includes('git') ||
    (s.description && s.description.toLowerCase().includes('git'))
  );

  if (gitSkills.length > 1) {
    recommendations.push({
      type: 'merge',
      skills: gitSkills.map(s => s.name),
      into: 'git-workflow',
      reason: 'Git 相关功能可以合并到一个统一的 skill 中',
      priority: 'medium'
    });
  }

  // 2. Agent 运行器 skills
  const agentRunners = skills.filter(s =>
    s.name.startsWith('run_') && s.name.includes('_agent')
  );

  // 3. 搜索 skills
  const searchSkills = skills.filter(s =>
    s.name.includes('search') ||
    (s.description && s.description.toLowerCase().includes('search'))
  );

  if (searchSkills.length > 2) {
    recommendations.push({
      type: 'merge',
      skills: searchSkills.map(s => s.name),
      into: 'universal-search',
      reason: '多个搜索功能可以合并为一个统一的搜索接口',
      priority: 'medium'
    });
  }

  // 4. Docker skills
  const dockerSkills = skills.filter(s =>
    s.name.includes('docker')
  );

  if (dockerSkills.length > 1) {
    recommendations.push({
      type: 'merge',
      skills: dockerSkills.map(s => s.name),
      into: 'docker',
      reason: 'Docker 相关功能可以合并',
      priority: 'low'
    });
  }

  return recommendations;
}

/**
 * 生成删除建议
 */
function generateDeleteRecommendations(skills) {
  const recommendations = [];

  skills.forEach(skill => {
    let shouldDelete = false;
    let reasons = [];

    // 1. 过时的 skill
    if (skill.isDeprecated) {
      shouldDelete = true;
      reasons.push('已标记为过时');
    }

    // 2. 长期未更新且无代码
    if (skill.daysSinceUpdate > 365 && !skill.hasCode) {
      shouldDelete = true;
      reasons.push('长期未更新（>1年）且无代码实现');
    }

    // 3. 空的描述
    if (!skill.description || skill.description.length < 10) {
      reasons.push('缺少有效描述');
    }

    // 4. 状态为 unknown
    if (skill.status === 'unknown' && !skill.hasCode) {
      reasons.push('未完成且无代码');
    }

    if (shouldDelete || reasons.length >= 2) {
      recommendations.push({
        skill: skill.name,
        reasons,
        lastUpdated: skill.lastUpdated,
        priority: shouldDelete ? 'high' : 'medium'
      });
    }
  });

  return recommendations;
}

/**
 * 主分析流程
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Skills 分析工具                                        ║');
  console.log('║     Skills Analysis Tool                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 1. 扫描所有 skills
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skillDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);

  console.log(`📂 发现 ${skillDirs.length} 个 skills\n`);

  // 2. 分析每个 skill
  const skills = [];
  for (const skillName of skillDirs) {
    const skillPath = join(SKILLS_DIR, skillName);
    const skill = await analyzeSkill(skillPath, skillName);
    skills.push(skill);
    analysis.total++;
  }

  // 3. 统计
  analysis.active = skills.filter(s => !s.isDeprecated).length;
  analysis.deprecated = skills.filter(s => s.isDeprecated).length;

  // 4. 检测重复
  analysis.duplicates = detectDuplicates(skills);

  // 5. 生成建议
  analysis.mergeRecommendations = generateMergeRecommendations(skills, analysis.duplicates);
  analysis.deleteRecommendations = generateDeleteRecommendations(skills);

  // 6. 找出应该保留的 skills
  analysis.keep = skills.filter(s => {
    const toDelete = analysis.deleteRecommendations.find(d => d.skill === s.name);
    const toMerge = analysis.mergeRecommendations.find(m => m.skills.includes(s.name));
    return !toDelete && !toMerge;
  });

  // 7. 输出报告
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  分析报告                                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 总览:`);
  console.log(`   总数: ${analysis.total}`);
  console.log(`   活跃: ${analysis.active}`);
  console.log(`   过时: ${analysis.deprecated}\n`);

  // 合并建议
  if (analysis.mergeRecommendations.length > 0) {
    console.log(`🔄 建议合并 (${analysis.mergeRecommendations.length}):\n`);

    analysis.mergeRecommendations.forEach(rec => {
      const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      console.log(`   ${priorityIcon} 合并到: ${rec.into}`);
      console.log(`   来源: ${rec.skills.join(', ')}`);
      console.log(`   原因: ${rec.reason}\n`);
    });
  }

  // 删除建议
  if (analysis.deleteRecommendations.length > 0) {
    console.log(`🗑️  建议删除 (${analysis.deleteRecommendations.length}):\n`);

    analysis.deleteRecommendations.forEach(rec => {
      const priorityIcon = rec.priority === 'high' ? '🔴' : '🟡';
      console.log(`   ${priorityIcon} ${rec.skill}`);
      console.log(`   原因: ${rec.reasons.join(', ')}`);
      console.log(`   最后更新: ${rec.lastUpdated}\n`);
    });
  }

  // 功能重复
  if (analysis.duplicates.length > 0) {
    console.log(`⚠️  功能重复 (${analysis.duplicates.length}):\n`);

    analysis.duplicates.slice(0, 10).forEach(dup => {
      console.log(`   "${dup.keyword}" 相关:`);
      console.log(`   ${dup.skills.join(', ')}\n`);
    });
  }

  // 应该保留的
  console.log(`✅ 建议保留 (${analysis.keep.length}):\n`);
  const keepByCategory = {};
  analysis.keep.forEach(skill => {
    const cat = skill.category || 'other';
    if (!keepByCategory[cat]) {
      keepByCategory[cat] = [];
    }
    keepByCategory[cat].push(skill);
  });

  Object.entries(keepByCategory).forEach(([category, skills]) => {
    console.log(`   ${category}:`);
    skills.forEach(s => {
      const desc = s.description || '(无描述)';
      console.log(`     - ${s.name}: ${desc.substring(0, 50)}...`);
    });
    console.log('');
  });

  // 8. 生成 Markdown 报告
  const reportPath = join(process.cwd(), 'docs', 'skills-analysis-report.md');
  await generateMarkdownReport(reportPath, analysis, skills);
  console.log(`📄 详细报告已生成: ${reportPath}\n`);
}

/**
 * 生成 Markdown 报告
 */
async function generateMarkdownReport(outputPath, analysis, skills) {
  const report = `# Skills 分析报告

**生成时间**: ${new Date().toISOString()}
**分析工具**: Skills Analysis Tool

---

## 📊 总览

| 指标 | 数值 |
|------|------|
| 总数 | ${analysis.total} |
| 活跃 | ${analysis.active} |
| 过时 | ${analysis.deprecated} |
| 建议合并 | ${analysis.mergeRecommendations.length} |
| 建议删除 | ${analysis.deleteRecommendations.length} |
| 建议保留 | ${analysis.keep.length} |

---

## 🔄 合并建议 (${analysis.mergeRecommendations.length})

${analysis.mergeRecommendations.map(rec => `
### ${rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢'} 合并到 \`${rec.into}\`

**来源**: ${rec.skills.map(s => `\`${s}\``).join(', ')}

**原因**: ${rec.reason}

**优先级**: ${rec.priority}
`).join('\n')}

---

## 🗑️ 删除建议 (${analysis.deleteRecommendations.length})

${analysis.deleteRecommendations.map(rec => `
### ${rec.priority === 'high' ? '🔴' : '🟡'} \`${rec.skill}\`

**删除原因**:
${rec.reasons.map(r => `- ${r}`).join('\n')}

**最后更新**: ${rec.lastUpdated}

**优先级**: ${rec.priority}
`).join('\n')}

---

## ✅ 保留的 Skills (${analysis.keep.length})

${analysis.keep.reduce((byCategory, skill) => {
  const cat = skill.category || 'other';
  if (!byCategory[cat]) {
    byCategory[cat] = [];
  }
  byCategory[cat].push(skill);
  return byCategory;
}, {}

)}

${Object.entries(analysis.keep.reduce((byCategory, skill) => {
  const cat = skill.category || 'other';
  if (!byCategory[cat]) {
    byCategory[cat] = [];
  }
  byCategory[cat].push(skill);
  return byCategory;
}, {})).map(([category, skills]) => `
### ${category}

${skills.map(s => `
- **\`${s.name}\`**: ${s.description}
  - 版本: ${s.version}
  - 状态: ${s.status}
  - 最后更新: ${s.lastUpdated}
`).join('')}
`).join('\n')}

---

## 📋 详细清单

### 所有 Skills

${skills.map(s => `
| ${s.name} | ${s.title || '-'} | ${s.category || '-'} | ${s.status} | ${s.version} | ${s.lastUpdated} |
`).join('')}

---

## 🎯 行动计划

### 立即执行（高优先级）

${analysis.deleteRecommendations.filter(r => r.priority === 'high').map(rec =>
  `- 删除 \`${rec.skill}\` (${rec.reasons.join(', ')})`
).join('\n') || '- 无'}

${analysis.mergeRecommendations.filter(m => m.priority === 'high').map(rec =>
  `- 合并 ${rec.skills.map(s => `\`${s}\``).join(', ')} 到 \`${rec.into}\``
).join('\n') || '- 无'}

### 本周执行（中优先级）

${analysis.deleteRecommendations.filter(r => r.priority === 'medium').map(rec =>
  `- 删除 \`${rec.skill}\``
).join('\n') || '- 无'}

${analysis.mergeRecommendations.filter(m => m.priority === 'medium').map(rec =>
  `- 合并 ${rec.skills.map(s => `\`${s}\``).join(', ')} 到 \`${rec.into}\``
).join('\n') || '- 无'}

### 本月执行（低优先级）

${analysis.deleteRecommendations.filter(r => r.priority === 'low').map(rec =>
  `- 删除 \`${rec.skill}\``
).join('\n') || '- 无'}

${analysis.mergeRecommendations.filter(m => m.priority === 'low').map(rec =>
  `- 合并 ${rec.skills.map(s => `\`${s}\``).join(', ')} 到 \`${rec.into}\``
).join('\n') || '- 无'}

---

**报告生成**: 自动化分析工具
**下次分析**: 建议每月执行一次
`;

  await writeFile(outputPath, report, 'utf-8');
}

// 执行分析
main();
