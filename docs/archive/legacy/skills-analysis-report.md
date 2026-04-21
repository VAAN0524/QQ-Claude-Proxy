# Skills 分析报告

**生成时间**: 2026-03-16T13:46:19.300Z
**分析工具**: Skills Analysis Tool

---

## 📊 总览

| 指标 | 数值 |
|------|------|
| 总数 | 37 |
| 活跃 | 37 |
| 过时 | 0 |
| 建议合并 | 3 |
| 建议删除 | 2 |
| 建议保留 | 26 |

---

## 🔄 合并建议 (3)


### 🟡 合并到 `git-workflow`

**来源**: `code-share`, `git-essentials`, `git-workflows`, `network-solutions`

**原因**: Git 相关功能可以合并到一个统一的 skill 中

**优先级**: medium


### 🟡 合并到 `universal-search`

**来源**: `run_websearch_agent`, `smart-search`, `tavily-search`, `web-search`, `zhipu-search`

**原因**: 多个搜索功能可以合并为一个统一的搜索接口

**优先级**: medium


### 🟢 合并到 `docker`

**来源**: `docker-compose`, `docker-essentials`

**原因**: Docker 相关功能可以合并

**优先级**: low


---

## 🗑️ 删除建议 (2)


### 🟡 `smart-search`

**删除原因**:
- 缺少有效描述
- 未完成且无代码

**最后更新**: 2026-03-04

**优先级**: medium


### 🟡 `tavily-search`

**删除原因**:
- 缺少有效描述
- 未完成且无代码

**最后更新**: 2026-02-27

**优先级**: medium


---

## ✅ 保留的 Skills (26)

[object Object]


### uncategorized


- **`agent-coordination`**: Agent 协调模式技能。使用此技能当需要设计多 Agent 系统或协调多个子 Agent 时。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-22

- **`agent-debugging`**: Agent 系统调试技能。使用此技能当 Agent 出现错误、行为异常或需要排查问题时。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-22

- **`agent-memory`**: Agent 记忆管理技能。使用此技能当需要处理会话持久化、上下文管理或知识存储时。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-22

- **`auto-error-resolver`**: 自动错误解决技能。使用此技能当遇到 TypeScript 编译错误、测试失败、运行时错误或需要系统化调试时。自动分析错误、定位根因、应用修复、验证结果。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-22

- **`code`**: Coding workflow with planning, implementation, verification, and testing for clean software development.
  - 版本: 1.0.4
  - 状态: unknown
  - 最后更新: 2026-02-23

- **`code-stats`**: Visualizes repository complexity by counting files, lines of code, and grouping by extension. Use to assess project size or growth.
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-23

- **`default-skill`**: 默认通用技能。处理各种通用问题，提供帮助和建议。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-03-15

- **`glm-vision`**: GLM 视觉理解技能。使用此技能当需要分析图片、截图、OCR 文字提取、理解技术图表或诊断错误截图时。使用智谱 AI GLM-4V 的视觉理解能力。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-22

- **`Image`**: AI 图像生成 skill - 支持流程图、LOGO、海报、数据可视化、角色设计等多种场景的智能图像生成
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-03-16

- **`node-transfer`**: 高速、内存高效的 OpenClaw 节点间文件传输，使用原生 Node.js 流。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-24

- **`nodejs`**: Write reliable Node.js avoiding event loop blocking, async pitfalls, ESM gotchas, and memory leaks.
  - 版本: 1.0.1
  - 状态: unknown
  - 最后更新: 2026-02-23

- **`parallel-agents`**: 并行 Agent 调度技能。使用此技能当有多个独立任务需要同时处理、多个子问题需要并行解决、或需要同时调用多个 Agent 协作时。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-22

- **`pm2`**: Manage Node.js applications with PM2 process manager. Use for deploying, monitoring, and auto-restarting Node apps in production. Covers starting apps, viewing logs, setting up auto-start on boot, and managing multiple processes.
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-23

- **`run_browser_agent`**: 网页操作专家。使用此技能当用户需要访问网页、截图、提取信息或填充表单时。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-23

- **`run_code_agent`**: 执行代码相关任务的专业助手。使用此技能当用户需要编写、分析、调试或优化代码时。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-23

- **`run_data_analysis_agent`**: 数据分析专业助手。使用此技能当用户需要分析文件、统计数据或生成报告时。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-23

- **`run_refactor_agent`**: 代码重构专家助手。使用此技能当用户需要分析代码结构、重构代码、优化文件组织时。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-23

- **`run_shell_agent`**: 执行系统命令的专业助手。使用此技能当用户需要运行 shell 命令、操作文件系统或执行脚本时。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-23

- **`run_vision_agent`**: 图片分析专家。使用此技能当用户需要分析图片、提取文字、识别截图内容、诊断错误或理解图表时。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-23

- **`skill-creator`**: 创建新技能的指南。使用此技能当需要创建新技能、更新现有技能或扩展 Agent 能力时。技能让 Agent 从通用助手转变为具备专业领域知识的专家。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-22

- **`skill-manager`**: 技能管理专家。使用此技能当用户需要安装、搜索、列出或卸载技能时。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-23

- **`smart-code`**: 智能代码技能。帮助用户编写、分析和优化代码，支持多种编程语言和框架。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-24

- **`test-case-generator`**: 根据代码自动生成单元测试用例，支持 Jest、Mocha、Pytest 等框架。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-24

- **`test-runner`**: 编写和运行测试，支持多种语言和框架。
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-02-24

- **`wechat-publisher`**: 微信公众号发文工作流 - 从热点搜索、文章撰写、封面图生成到草稿发布的一站式解决方案
  - 版本: unknown
  - 状态: unknown
  - 最后更新: 2026-03-16



### other


- **`local`**: undefined
  - 版本: undefined
  - 状态: missing
  - 最后更新: undefined



---

## 📋 详细清单

### 所有 Skills


| agent-coordination | agent_coordination | uncategorized | unknown | unknown | 2026-02-22 |

| agent-debugging | agent_debugging | uncategorized | unknown | unknown | 2026-02-22 |

| agent-memory | agent_memory | uncategorized | unknown | unknown | 2026-02-22 |

| auto-error-resolver | auto_error_resolver | uncategorized | unknown | unknown | 2026-02-22 |

| code | Code | uncategorized | unknown | 1.0.4 | 2026-02-23 |

| code-share | code-share | uncategorized | unknown | unknown | 2026-02-23 |

| code-stats | code-stats | uncategorized | unknown | unknown | 2026-02-23 |

| default-skill | default | uncategorized | unknown | unknown | 2026-03-15 |

| docker-compose | Docker Compose | uncategorized | unknown | unknown | 2026-02-23 |

| docker-essentials | docker-essentials | uncategorized | unknown | unknown | 2026-02-23 |

| git-essentials | git-essentials | uncategorized | unknown | unknown | 2026-02-23 |

| git-workflows | git-workflows | uncategorized | unknown | unknown | 2026-02-23 |

| glm-vision | glm_vision | uncategorized | unknown | unknown | 2026-02-22 |

| Image | Image | uncategorized | unknown | unknown | 2026-03-16 |

| local | - | - | missing | undefined | undefined |

| network-solutions | network_solutions | uncategorized | unknown | unknown | 2026-02-22 |

| node-transfer | node-transfer | uncategorized | unknown | unknown | 2026-02-24 |

| nodejs | NodeJS | uncategorized | unknown | 1.0.1 | 2026-02-23 |

| parallel-agents | parallel_agents | uncategorized | unknown | unknown | 2026-02-22 |

| pm2 | pm2 | uncategorized | unknown | unknown | 2026-02-23 |

| run_browser_agent | run_browser_agent | uncategorized | unknown | unknown | 2026-02-23 |

| run_code_agent | run_code_agent | uncategorized | unknown | unknown | 2026-02-23 |

| run_data_analysis_agent | run_data_analysis_agent | uncategorized | unknown | unknown | 2026-02-23 |

| run_refactor_agent | run_refactor_agent | uncategorized | unknown | unknown | 2026-02-23 |

| run_shell_agent | run_shell_agent | uncategorized | unknown | unknown | 2026-02-23 |

| run_vision_agent | run_vision_agent | uncategorized | unknown | unknown | 2026-02-23 |

| run_websearch_agent | run_websearch_agent | uncategorized | unknown | unknown | 2026-02-23 |

| skill-creator | skill_creator | uncategorized | unknown | unknown | 2026-02-22 |

| skill-manager | skill-manager | uncategorized | unknown | unknown | 2026-02-23 |

| smart-code | smart_code | uncategorized | unknown | unknown | 2026-02-24 |

| smart-search | smart-search | uncategorized | unknown | unknown | 2026-03-04 |

| tavily-search | tavily-search | uncategorized | unknown | unknown | 2026-02-27 |

| test-case-generator | test-case-generator | uncategorized | unknown | unknown | 2026-02-24 |

| test-runner | test-runner | uncategorized | unknown | unknown | 2026-02-24 |

| web-search | web_search | uncategorized | unknown | unknown | 2026-02-22 |

| wechat-publisher | wechat-publisher | uncategorized | unknown | unknown | 2026-03-16 |

| zhipu-search | zhipu-search | uncategorized | unknown | unknown | 2026-03-15 |


---

## 🎯 行动计划

### 立即执行（高优先级）

- 无

- 无

### 本周执行（中优先级）

- 删除 `smart-search`
- 删除 `tavily-search`

- 合并 `code-share`, `git-essentials`, `git-workflows`, `network-solutions` 到 `git-workflow`
- 合并 `run_websearch_agent`, `smart-search`, `tavily-search`, `web-search`, `zhipu-search` 到 `universal-search`

### 本月执行（低优先级）

- 无

- 合并 `docker-compose`, `docker-essentials` 到 `docker`

---

**报告生成**: 自动化分析工具
**下次分析**: 建议每月执行一次
