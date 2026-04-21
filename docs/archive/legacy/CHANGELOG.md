# 更新日志

所有重要的项目变更都会记录在此文件中。

## [1.2.1] - 2026-02-23

### 新增功能

#### LLM Provider 系统
统一的多提供商 LLM 接口，支持：
- **OpenAI** (GPT-4, GPT-3.5) - 标准 OpenAI API
- **Anthropic** (Claude) - Claude 3 系列 API
- **GLM** (智谱 AI) - GLM-4 系列，支持 JWT 认证和 Coding Plan 端点

**核心特性**:
- 统一的 `ChatCompletionParams` 和 `ChatCompletionResponse` 接口
- 自动生成 GLM JWT Token
- Provider Pool 支持故障转移
- 自动转换 Anthropic 响应为 OpenAI 格式

**新增文件**:
- `src/llm/providers.ts` - Provider 实现
- `src/llm/index.ts` - LLM 模块导出
- `src/llm/tool.ts` - 工具类型定义

#### 终端监控系统
实时监控 CLI 进程和智能输出渲染：

**核心组件**:
- `AgentMonitor` - 进程监控器，跟踪 CLI 执行状态
- `DiffRenderer` - 智能渲染器，高亮显示代码变更

**新增文件**:
- `src/terminal/AgentMonitor.ts` - Agent 监控器
- `src/terminal/DiffRenderer.ts` - Diff 渲染器
- `src/terminal/index.ts` - 终端模块
- `src/cli/monitor.ts` - CLI 进程监控

#### Agent 工具分类系统
将 Agent 工具按功能分类组织：

**新增文件**:
- `src/agents/tools/index.ts` - 工具导出
- `src/agents/tools/agent-tools.ts` - Agent 相关工具
- `src/agents/tools/file-tools.ts` - 文件操作工具
- `src/agents/tools/learning-tools.ts` - 学习相关工具

#### Dashboard 扩展
从 3 个页面扩展到 5 个独立页面：

**新增页面**:
- `public/dashboard/agents.html` - Agent 管理页面
- `public/dashboard/logs.html` - 日志查看页面
- `public/dashboard/skills.html` - 技能管理页面

**更新页面**:
- `public/dashboard/config.html` - 独立配置页面

#### 新增技能
- `run_data_analysis_agent` - 数据分析 Agent
- `run_refactor_agent` - 代码重构 Agent
- `run_shell_agent` - Shell 命令执行 Agent
- `run_websearch_agent` - 网页搜索 Agent

### 项目统计更新

| 分类 | 文件数 | 代码行数 |
|------|-------|---------|
| **后端** (TypeScript) | 67 | 25,054 |
| **前端** (HTML/CSS/JS) | 15 | 8,917 |
| **配置** (JSON) | 16 | 7,768 |
| **总计** | 98 | 41,739 |

**估算有效代码**: 约 29,000+ 行（排除空行和注释）

---

## [1.2.0] - 2026-02-23

### 新增功能

#### 分层记忆系统 (Hierarchical Memory)
基于 OpenViking 设计理念的 L0/L1/L2 三层记忆架构：

**核心特性**
- **L0 (Abstract)**: ~100 tokens，快速检索索引，始终加载
- **L1 (Overview)**: ~2000 tokens，内容导航，触发时加载
- **L2 (Detail)**: 无限，完整数据，按需加载

**新增文件**
- `src/agents/memory/HierarchicalMemoryService.ts` - 分层记忆服务
- `src/agents/memory/MemoryStorage.ts` - 记忆存储
- `docs/AGENTS.md` - 多 Agent 系统文档（含记忆系统说明）

#### 技能管理系统
完整的技能安装、卸载、开发和管理功能：

**核心组件**
- `SkillInstaller` - 从 URL/GitHub/GitLab 安装技能
- `SkillLoader` - 技能元数据扫描和按需加载
- 统一的 `skills/` 目录管理

**新增文件**
- `src/agents/SkillInstaller.ts` - 技能安装器
- `src/agents/SkillLoader.ts` - 技能加载器
- `docs/SKILLS.md` - 技能管理指南
- `skills/` - 技能目录

#### 会话持久化系统
支持跨会话的上下文保存和恢复：

**核心组件**
- `SessionManager` - 管理多个用户/群组会话
- `SharedContextPersistence` - 自动保存/加载会话

**新增文件**
- `src/agents/SharedContextPersistence.ts` - 持久化包装层
- `docs/session-persistence.md` - 会话持久化文档

#### 新增 Agents
- `VisionAgent` - 图像理解和分析 Agent
- `CodeRefactorAgent` - 代码重构 Agent

#### MCP 客户端
- `ZaiMcpClient.ts` - MCP 协议客户端支持

#### 学习模块
- `src/agents/learning/` - Agent 学习和优化模块

#### 定时任务系统增强
**Dashboard 端设置定时任务**:
- 通过 Web 界面创建周期任务和定时任务
- 支持设置执行间隔（秒/分钟/小时/天）
- 支持立即执行或指定时间执行
- 任务执行状态实时监控
- 执行结果 QQ 通知

**重要修复**:
- **CLI 非交互模式**: 添加 `-p` 参数，避免任务阻塞等待输入
- **环境变量过滤**: 排除 `CLAUDECODE` 和 `VSCODE_*` 防止嵌套会话检测
- **间隔计算修复**: 修正分钟/小时/天的毫秒转换公式
- **QQ 通知验证**: 跳过无效通知目标（如 "dashboard"）
- **间隔人性化显示**: 自动转换为可读格式（如 "6 分钟"）

**修改文件**:
- `src/scheduler/task-runner.ts` - CLI 执行优化
- `public/dashboard/app.js` - 间隔计算和显示修复
- `src/scheduler/scheduler.ts` - QQ 通知逻辑优化

**QQ 对话管理定时任务** (`src/agents/GLMCoordinatorAgent.ts`):
- `list_scheduled_tasks` - 列出所有定时任务
- `create_scheduled_task` - 创建新的定时任务
- `update_scheduled_task` - 更新任务配置
- `delete_scheduled_task` - 删除任务
- `pause_scheduled_task` / `resume_scheduled_task` - 暂停/恢复任务
- `execute_scheduled_task_now` - 立即执行任务
- `get_task_statistics` - 获取任务统计信息

### 项目清理
删除以下无关文件和目录：
- 测试脚本 (`scripts/`)
- 测试文档 (`docs/plans/`)
- 临时配置 (`config/`)
- 测试文件 (`test-*.ts`, `test-*.txt`)
- 运行时日志 (`logs/`, `*.log`)
- 测试视频/语音文件

### 文档更新
- 新增 [AGENTS.md](docs/AGENTS.md) - 多 Agent 系统完整文档
- 新增 [SKILLS.md](docs/SKILLS.md) - 技能管理指南
- 新增 [session-persistence.md](docs/session-persistence.md) - 会话持久化说明

---

## [1.1.0] - 2026-02-22

### 新增功能

#### Agent 协作系统
全新的多 Agent 协作系统，支持智能任务分配和并行执行：

**核心组件**
- `AgentRegistry`: Agent 注册中心，管理所有可用 Agent
- `AgentDispatcher`: 任务分发器，根据任务类型自动选择合适的 Agent
- `SharedContext`: 共享上下文，支持 Agent 间数据交换
- `ModeManager`: 模式管理器，支持不同工作模式切换

**内置 Agents**
- `CoordinatorAgent`: 主协调器，使用 Claude 3.5 Sonnet
- `GLMCoordinatorAgent`: GLM-4.7 高性能协调器
- `CodeAgent`: 代码分析、生成和重构
- `BrowserAgent`: 浏览器自动化和网页操作
- `ShellAgent`: 命令行执行和系统操作
- `WebSearchAgent`: 网页搜索和信息收集
- `DataAnalysisAgent`: 数据分析和处理

**配置示例** (`config.json`):
```json
{
  "agents": {
    "useCoordinator": true,
    "default": "coordinator",
    "coordinator": {
      "enabled": true,
      "type": "glm",
      "maxTokens": 8192,
      "subAgents": {
        "code": true,
        "browser": true,
        "shell": true,
        "websearch": false
      }
    }
  }
}
```

#### 定时任务增强
- **CLI 非交互模式**: 自动添加 `-p` 参数，避免任务阻塞
- **环境变量过滤**: 排除 `CLAUDECODE` 和 `VSCODE_*` 变量
- **间隔修复**: 修正分钟/小时/天的毫秒转换
- **通知优化**: 跳过无效的通知目标
- **人性化显示**: 周期间隔自动转换为可读格式

### Bug 修复

| 问题 | 原因 | 修复方案 |
|------|------|----------|
| 任务永远不完成 | CLI 默认交互模式等待输入 | 添加 `-p` 参数强制非交互 |
| CLI 嵌套会话错误 | 环境变量传递 | 过滤 CLAUDECODE 和 VSCODE_* |
| 间隔计算错误 | 公式 `interval * unit / 60000` 错误 | 修正为 `interval * unit` |
| QQ 通知失败 | "dashboard" 不是真实 OpenID | 跳过无效目标 |
| Dashboard 缓存 | 浏览器缓存旧 JS 文件 | 版本号升级到 v4.0 |

### 配置变更

#### 新增环境变量 (`.env.example`)
```env
# GLM API 配置 (用于 GLMCoordinatorAgent)
GLM_API_KEY=your_glm_api_key
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4

# Anthropic API 配置 (备用)
ANTHROPIC_API_KEY=your_anthropic_api_key
```

#### 更新 .gitignore
```
# 新增排除项
data/              # 运行时数据
test*.txt          # 测试文件
test_folder/       # 测试目录
scripts/*.mjs      # 测试脚本 (可能含密钥)
*.mjs              # 其他 mjs 文件
```

### 技术改进

- **类型安全**: 为所有 Agent 添加完整的 TypeScript 类型定义
- **错误处理**: 改进 Agent 初始化失败的处理逻辑
- **日志优化**: 添加 Agent 系统的专用日志前缀
- **性能**: 优化 CLI 会话管理，减少进程启动开销

### 文档更新

- 更新 README.md 添加 Agent 系统说明
- 添加 CHANGELOG.md 记录详细变更
- 更新 .env.example 添加新配置项

---

## [1.0.0] - 2026-02-20

### 初始版本发布

#### 核心功能

**QQ Bot 集成**
- 通过手机 QQ 控制本地 Claude Code CLI
- 支持私聊和群聊
- 文件和图片双向传输
- 自动权限检查

**Web Dashboard**
- 实时任务监控
- 定时任务管理
- 系统配置界面
- 一键重启服务

**定时任务调度**
- 周期任务（按间隔重复）
- 定时任务（指定时间执行）
- QQ 通知执行结果
- 任务历史记录

**实时进度跟踪**
- VS Code 风格的任务状态
- 工具调用实时显示
- 流式输出支持

**架构设计**
- Gateway 消息总线 (Port: 18789)
- Channel 适配器模式
- CLI 会话队列管理
- 文件存储管理

#### 技术栈

- **后端**: Node.js + TypeScript
- **前端**: 原生 JavaScript + CSS
- **通信**: WebSocket + HTTP
- **日志**: Pino 结构化日志
- **存储**: JSON 文件持久化

---

## 版本说明

版本号格式: `主版本.次版本.修订版本`

- **主版本**: 重大架构变更或不兼容更新
- **次版本**: 新增功能或重要改进
- **修订版本**: Bug 修复和小改进
