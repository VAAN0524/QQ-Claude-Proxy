# 系统记忆

## 用户偏好

- 代码示例使用 TypeScript
- 喜欢简洁的回答，不要冗长
- 偏好使用中文
- 对 Python 和 JavaScript 的问题较多

## 常用操作

### 搜索相关
- 用户经常搜索 GitHub 项目
- 需要最新的技术信息
- 关注 AI 和编程相关内容

### 代码相关
- 主要使用 TypeScript 和 Python
- 需要实际可运行的代码
- 重视代码质量

## 重要上下文

- 用户工作目录: c:\Test\bot
- 用户在开发 QQ-Claude-Proxy 项目
- 项目使用 TypeScript，ES Modules
- 关注系统简化和性能优化

## 历史问题

### 问题: 系统过于复杂
- 用户认为多 Agent 系统过于复杂
- ReAct 循环导致响应空缺
- 需要简化为单一协调者模式

### 解决方案
- 采用 SimpleCoordinatorAgent
- 技能通过 SKILL.md 动态加载
- 记忆通过 MEMORY.md 管理
- 移除复杂的 ReAct 循环

## 技术栈

### 前端
- TypeScript
- React (如需要)

### 后端
- Node.js + TypeScript
- Express (如需要)

### 工具
- Vitest (测试)
- tsx (开发)
- pnpm (包管理)
