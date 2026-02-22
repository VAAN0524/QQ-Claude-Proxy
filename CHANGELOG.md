# 更新日志

所有重要的项目变更都会记录在此文件中。

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
