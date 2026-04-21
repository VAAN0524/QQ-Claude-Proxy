# Shell Agent 安装完成

## ✅ 已完成

Shell Agent 已启用并配置为**充分权限模式**。

## 🔧 配置变更

### config.json 更新

```json
{
  "agents": {
    "shell": {
      "enabled": true,          // ✅ 已启用
      "priority": 7,
      "timeout": 60000,         // 60 秒超时
      "options": {
        "allowedCommands": [],  // 空列表 = 允许所有命令
        "blockedCommands": []   // 空列表 = 不阻止任何命令
      }
    }
  }
}
```

## 🚀 使用方式

### 触发关键词

```
运行 ls -la
执行 npm install
脚本测试
terminal git status
```

### 直接命令

```
ls -la
npm run build
git status
pwd
```

## ⚠️ 安全警告

**充分权限模式已启用**：
- ✅ 允许执行所有系统命令
- ✅ 不阻止任何危险操作
- ⚠️ 请确保：
  - 用户白名单已配置
  - 工作目录受控
  - 数据备份已做好

## 📋 安全建议

如果需要限制权限，可修改 `config.json`：

```json
{
  "agents": {
    "shell": {
      "options": {
        "allowedCommands": ["ls", "pwd", "cat", "npm"],
        "blockedCommands": ["rm -rf", "shutdown", "format"]
      }
    }
  }
}
```

## 🔄 重启服务

```bash
npm start
```

重启后 Shell Agent 将自动启用！
