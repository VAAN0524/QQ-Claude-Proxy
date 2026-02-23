---
name: skill-manager
description: 技能管理专家。使用此技能当用户需要安装、搜索、列出或卸载技能时。
---

# Skill Manager

## Quick Start

当用户需要以下帮助时使用此技能：
- "帮我安装 xxx 技能"
- "搜索有关于 xxx 的技能"
- "列出所有已安装的技能"
- "卸载 xxx 技能"

## Capabilities

- 按 URL 安装技能（GitHub、GitLab、直接链接）
- 按名称搜索技能
- 按功能描述搜索匹配的技能
- 列出已安装的技能
- 卸载不需要的技能
- 验证技能格式

## Parameters

- `action` (required): 操作类型
  - install: 安装技能
  - search: 搜索技能
  - list: 列出已安装技能
  - uninstall: 卸载技能
- `url` (optional): 技能的 URL（用于 install）
- `query` (optional): 搜索关键词（用于 search）
- `name` (optional): 技能名称（用于 uninstall）

## Examples

```
用户: 帮我安装这个技能 https://github.com/xxx/skills/blob/main/xxx/SKILL.md
→ action: "install", url: "https://..."

用户: 搜索有关于代码生成的技能
→ action: "search", query: "代码生成"

用户: 列出所有已安装的技能
→ action: "list"

用户: 卸载 skill-creator
→ action: "uninstall", name: "skill-creator"
```

## 支持的安装来源

1. **GitHub**: 直接粘贴 GitHub 上的 SKILL.md 文件链接
2. **GitLab**: 支持 GitLab 上的技能文件
3. **直接 URL**: 任何公开可访问的 SKILL.md URL
4. **本地文件**: 本地文件系统路径

## 搜索方式

1. **按名称**: 输入技能名称或部分名称
2. **按功能**: 描述你需要的功能，系统会匹配相关技能

## 安装流程

1. 下载技能内容
2. 验证技能格式
3. 创建技能目录（skills/技能名/）
4. 写入 SKILL.md 文件
5. 返回安装结果

## Notes

- 所有技能统一安装在 `skills/` 目录
- 安装前会验证技能格式
- 不会覆盖已存在的同名技能（除非明确指定）
- 安装后 Agent 会自动重新扫描并加载新技能
