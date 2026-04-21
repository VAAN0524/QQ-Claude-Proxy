# 技能管理指南

## 通过 QQ 管理技能

### 安装技能

#### 方式一：按 URL 安装

```
帮我把这个技能安装一下
https://github.com/anthropics/claude-code-skills/blob/main/skills/web-search/SKILL.md
```

支持的来源：
- **GitHub**: 任何 GitHub 上的 SKILL.md 文件
- **GitLab**: 任何 GitLab 上的 SKILL.md 文件
- **直接 URL**: 任何公开可访问的 URL

#### 方式二：按名称搜索

```
搜索有关于"代码生成"的技能
```

```
查找 web-search 技能
```

#### 方式三：按功能描述搜索

```
找一个能帮我分析图片的技能
```

```
我需要一个处理网络请求的技能
```

### 列出已安装的技能

```
列出所有已安装的技能
```

```
已安装了哪些技能？
```

### 卸载技能

```
卸载 skill-creator
```

```
删除 web-search 技能
```

## 技能目录结构

```
skills/                    # 统一的技能目录
├── skill-manager/         # 技能管理（本技能）
├── web-search/            # 网页搜索技能
├── glm-vision/            # GLM-4V 视觉理解
├── skill-creator/         # 创建新技能
└── ...                    # 其他技能
```

## 技能格式规范

每个技能必须包含 `SKILL.md` 文件，格式如下：

```markdown
---
name: skill-name
description: 技能的简短描述
---

# 技能标题

## Quick Start
使用场景说明

## Capabilities
能力列表

## Parameters
参数说明

## Examples
使用示例

## Notes
注意事项
```

## 让 Agent 帮你创建新技能

```
帮我创建一个 xxx 技能，放在 skills/ 目录下
```

Agent 会：
1. 在 `skills/` 目录下创建新技能目录
2. 生成符合格式的 SKILL.md 文件
3. 自动重新扫描并加载新技能

## 技能发现

### 官方技能库

- [Anthropic 官方技能](https://github.com/anthropics/claude-code-skills)
- [社区技能合集](https://github.com/topics/claude-code-skill)

### 推荐技能

| 技能 | 功能 | 来源 |
|------|------|------|
| web-search | 网页搜索和信息检索 | 内置 |
| glm-vision | GLM-4V 图像理解 | 内置 |
| skill-creator | 创建新技能的向导 | 内置 |
| auto-error-resolver | 自动错误诊断和修复 | 内置 |

## 故障排查

### 技能安装失败

1. **检查 URL 是否正确**：确保链接指向 SKILL.md 文件
2. **检查网络连接**：确保能访问 GitHub/GitLab
3. **检查技能格式**：技能文件必须符合格式规范

### 技能未生效

1. **重启服务**：安装新技能后需要重启服务
2. **检查技能目录**：确认技能在 `skills/` 目录下
3. **查看日志**：检查是否有加载错误

## 技能开发

### 创建新技能

告诉 Agent：

```
帮我创建一个翻译技能
要求：
1. 支持中英文互译
2. 可以翻译段落
3. 使用百度翻译 API
```

Agent 会自动：
1. 在 `skills/` 下创建 `translator/` 目录
2. 生成 `SKILL.md` 文件
3. 包含完整的参数说明和使用示例

### 技能最佳实践

1. **清晰的描述**：frontmatter 中的 description 要简短明确
2. **使用场景**：列出 3-5 个典型使用场景
3. **参数说明**：明确标注 required/optional
4. **示例完整**：提供可直接运行的示例
5. **注意事项**：说明限制和特殊要求

## API 参考

### 技能安装器

```typescript
import { SkillInstaller, SkillSource } from './agents/index.js';

const installer = new SkillInstaller('./skills');

// 按 URL 安装
await installer.installFromUrl('https://...');

// 搜索技能
const results = await installer.searchByName('web-search');

// 列出已安装
const installed = await installer.listInstalled();

// 卸载技能
await installer.uninstall('skill-name');
```

### 技能加载器

```typescript
import { SkillLoader } from './agents/index.js';

const loader = new SkillLoader('./skills');

// 扫描所有技能元数据
await loader.scanSkillsMetadata();

// 按需加载完整技能
const skill = await loader.loadSkillFullContent('skill-name');

// 构建系统提示词
const prompt = loader.buildMetadataSystemPrompt(basePrompt);
```
