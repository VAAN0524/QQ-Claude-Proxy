# QQ-Claude-Proxy 启动指南

## 快速启动

### 方式 1: 一键启动（推荐）

双击 `start-dashboard.bat` 文件：
- 自动启动后端服务
- 自动在浏览器中打开 Dashboard

### 方式 2: 后台启动

双击 `start.bat` 文件：
- 在终端窗口中运行服务
- 支持自动重启（退出码 42）
- 异常退出时自动重启（10秒延迟）

### 方式 3: 创建桌面快捷方式

1. 右键点击 `create-shortcut.bat`，选择"以管理员身份运行"
2. 桌面会出现 `QQ-Claude-Proxy.lnk` 快捷方式
3. 以后直接双击快捷方式即可启动

## Dashboard 功能

访问: http://localhost:8080

| 功能 | 说明 |
|------|------|
| **重启服务** | 点击右上角红色"重启服务"按钮 |
| **任务监控** | 实时查看运行中/已完成的任务 |
| **清除已完成** | 清除已完成/错误的任务记录 |
| **系统设置** | 配置 Gateway 端口、用户白名单等 |

## 启动脚本说明

| 文件 | 用途 |
|------|------|
| `start.bat` | 标准启动（带自动重启） |
| `start-dashboard.bat` | 快速启动（自动打开浏览器） |
| `create-shortcut.bat` | 创建桌面快捷方式 |

## 环境要求

- Node.js 18+
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
- 已配置 `.env` 文件

## 故障排查

### CLI 无输出问题

**原因**: 在 Claude Code 环境中嵌套运行会被检测到。

**解决**: 在 VSCode 外部的独立终端中运行 `start.bat`

### 服务无法启动

1. 检查端口 8080 和 18789 是否被占用
2. 检查 `.env` 配置是否正确
3. 查看终端日志输出

### Dashboard 无法访问

1. 确认服务已启动
2. 浏览器访问 http://localhost:8080
3. 检查防火墙设置
