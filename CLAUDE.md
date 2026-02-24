# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**QQ-Claude-Proxy** 是通过 QQ 远程控制本地 Claude Code CLI 的代理系统，支持多 Agent 协作、人格设定、分层记忆等高级功能。

## 核心架构

```
QQ Bot → QQ Gateway ──────┐
                          │
                    Internal Gateway (WS, port 18789)
                          │
                          ├──→ GLM Coordinator Agent (团队模式)
                          │       └──→ 专业 Agents (Code/Browser/Search/Data...)
                          │
                          └──→ Claude Code CLI (CLI 模式)
```

## 开发命令

```bash
# 开发模式（热重载）
npm run dev

# 编译
npm run build

# 生产运行
npm start

# 类型检查
npm run typecheck

# 测试
npm test              # 运行所有测试
npm run test:watch    # 监视模式
npm run test:coverage # 覆盖率报告
```

## Agent 系统（核心）

### 多 Agent 架构

项目支持**两种模式**：

| 模式 | 协调器 | 子 Agents | 适用场景 |
|------|--------|-----------|----------|
| **CLI 模式** | - | Claude Code CLI | 复杂代码任务 |
| **团队模式** | GLMCoordinatorAgent | Code/Browser/Shell/WebSearch/Data | 多步骤协作任务 |

### Agent 人格设定系统

**位置**: [src/agents/personas.ts](src/agents/personas.ts)

每个 Agent 都有人格设定，包含：
- **角色定位**: Agent 的身份和职责
- **核心职责**: 具体负责什么
- **性格特点**: 行为风格（简洁/详细/友好/专业）
- **工作原则**: 决策准则
- **协作方式**: 与其他 Agent 配合

**三种应用方案**：
1. **System Prompt 注入**: 将人格设定转换为 LLM System Prompt
2. **基类扩展**: PersonaAgent 提供人格默认实现
3. **通信风格**: Agent 间通信时传递人格标签

### 已注册 Agents

| Agent ID | 名称 | 能力 |
|----------|------|------|
| `glm-coordinator` | GLM 模型协调器 | 任务分发、队列管理、成本控制 |
| `coordinator` | 任务协调器 | 意图分析、策略规划、上下文管理 |
| `code-agent` | 代码专家 | Code, Analyze, Refactoring |
| `browser-agent` | 浏览器自动化 | Browser, Automation, Testing |
| `shell-agent` | 命令行专家 | Shell, System, File |
| `web-search-agent` | 网络搜索 | Web, Search, Info Retrieval |
| `tavily-search` | 深度搜索分析师 | Web, Deep Research, Vertical Search |
| `data-analysis-agent` | 数据分析专家 | Analysis, Data, Statistics |
| `vision-agent` | 视觉理解专家 | Vision, OCR, Image Analysis |
| `code-refactor-agent` | 代码重构专家 | Code, Refactoring, Quality |
| `skill-manager` | 技能管理员 | Skill Management, Installation |

**查看人格设定**: `node scripts/list-agents.ts`

## 分层记忆系统

**位置**: [src/agents/memory/](src/agents/memory/)

### L0/L1/L2 三层架构

| 层级 | 用途 | 保留时间 | 访问范围 |
|------|------|----------|----------|
| **L0** | 原始对话 | 7 天 | 仅当前 Agent |
| **L1** | 提炼摘要 | 30 天 | Agent 间共享 |
| **L2** | 知识沉淀 | 90 天 | 全局共享 |

**配置**: 在 `src/index.ts` 中初始化 `HierarchicalMemoryService`

## 技能管理系统

**位置**: [src/agents/SkillLoader.ts](src/agents/SkillLoader.ts), [src/agents/SkillInstaller.ts](src/agents/SkillInstaller.ts)

- **渐进式加载**: 只扫描 SKILL.md 元数据，按需加载完整代码
- **安装源**: 本地、GitHub、GitLab
- **管理接口**: SkillManagerAgent 提供安装/卸载/搜索/启用/禁用

## LLM Provider 系统

**位置**: [src/llm/providers.ts](src/llm/providers.ts)

统一接口支持多提供商：
- **OpenAI**: GPT-4 系列
- **Anthropic**: Claude 系列
- **GLM**: 智谱 AI GLM-4.7

## 重要约定

### ES Modules
- 项目使用 `"type": "module"`
- 所有 import 必须包含 `.js` 扩展名
- 动态 import: `await import('./agents/CodeAgent.js')`

### 日志
- 使用 `src/utils/logger.ts` 的 pino logger
- 结构化日志：`logger.info({ context }, 'message')`

### 配置加载
- 优先级: `.env` > `config.json` > `config/default.json`
- 配置 Schema: [src/config/schema.ts](src/config/schema.ts)

### 文件路径安全
- 用户输入文件名必须经过 `sanitizeFileName()` 清理
- 防止路径穿越攻击

### Agent 工具分类

**位置**: [src/agents/tools/](src/agents/tools/)

- **agent-tools**: Agent 调用相关
- **file-tools**: 文件操作相关
- **learning-tools**: 学习模块相关

## 扩展开发

### 添加新 Agent

1. 创建 `src/agents/NewAgent.ts`，实现 `IAgent` 接口
2. 在 `src/index.ts` 的 Agent 注册部分添加初始化代码
3. 在 `src/agents/personas.ts` 中添加人格设定
4. 在 `src/agents/AgentRegistryWithPersonas.ts` 中注册元数据

### 添加新技能

1. 在 `skills/` 目录创建技能文件夹
2. 创建 `SKILL.md` 元数据文件
3. 通过 Dashboard 或 QQ 命令安装

### 添加新 Channel

1. 创建 `src/channels/{name}/` 目录
2. 实现 Gateway WebSocket 连接
3. 实现 HTTP API（发送消息）
4. 在 Gateway Router 注册事件处理器

## Dashboard 功能

访问 **http://localhost:8080**

- **监控** (index.html): 实时任务进度、工具状态
- **Agents** (agents.html): Agent 管理、状态查看
- **Skills** (skills.html): 技能管理（安装/卸载/启用/禁用）
- **Tasks** (tasks.html): 定时任务管理
- **Config** (config.html): 系统配置
- **Logs** (logs.html): 日志查看

## 端口说明

| 端口 | 服务 |
|:----:|------|
| 18789 | Gateway WebSocket (内部通信) |
| 8080 | Dashboard HTTP |

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `QQ_BOT_APP_ID` | QQ 机器人 AppID | 是 |
| `QQ_BOT_SECRET` | QQ 机器人 AppSecret | 是 |
| `ALLOWED_USERS` | 用户白名单 | 否 |
| `GLM_API_KEY` | GLM API Key（团队模式） | 否 |
| `ANTHROPIC_API_KEY` | Anthropic API Key | 否 |
| `TAVILY_API_KEY` | Tavily Search API Key | 否 |
