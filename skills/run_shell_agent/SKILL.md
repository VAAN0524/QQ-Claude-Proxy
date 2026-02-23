---
name: run_shell_agent
description: 执行系统命令的专业助手。使用此技能当用户需要运行 shell 命令、操作文件系统或执行脚本时。
---

# Shell Agent Skill

## Quick Start

当用户需要以下帮助时使用此技能：
- "列出当前目录的文件"
- "查看文件内容"
- "运行 git 命令"
- "执行测试脚本"
- "检查系统状态"

## Capabilities

- 执行 shell 命令（Windows 和 Linux/macOS）
- 列出目录内容（ls/dir）
- 查看文件内容（cat/type）
- 运行脚本和程序
- Git 操作（clone、pull、push、status 等）
- 文件搜索和查找
- 系统信息查询

## Parameters

- `command` (required): 要执行的 shell 命令

## Examples

```
用户: 列出当前目录文件
→ command: "ls -la" (Linux/Mac) 或 "dir" (Windows)

用户: 查看 package.json 内容
→ command: "cat package.json" (Linux/Mac) 或 "type package.json" (Windows)

用户: 克隆一个 GitHub 仓库
→ command: "git clone https://github.com/user/repo.git"

用户: 查看当前 git 分支
→ command: "git branch"
```

## Output Format

提供：
1. 命令执行结果
2. 必要的结果解释
3. 错误信息（如果执行失败）

## Security Notes

- 某些危险命令可能被拦截
- 避免执行破坏性操作（如 rm -rf /）
- 文件操作会在项目目录内进行
- 遵循系统安全策略

## Platform Differences

**Windows (CMD/PowerShell)**:
- 列出文件: `dir` 或 `ls` (Git Bash)
- 查看文件: `type` 或 `cat` (Git Bash)
- 清屏: `cls` 或 `clear` (Git Bash)

**Linux/macOS**:
- 列出文件: `ls -la`
- 查看文件: `cat`
- 清屏: `clear`
