# Dashboard API Reference

## 概述

Dashboard API 提供了一套 RESTful 端点，用于管理 QQ-Claude-Proxy 系统的配置、Agent、技能、日志和系统功能。

**基础 URL**: `http://localhost:3000/api`

**响应格式**: JSON

**字符编码**: UTF-8

---

## 配置管理 API

### GET /api/config
获取安全配置（不包含敏感信息）

**响应示例**:
```json
{
  "gateway": {
    "port": 18789,
    "host": "127.0.0.1"
  },
  "channels": {
    "qqbot": {
      "enabled": true,
      "sandbox": true
    }
  },
  "storage": {
    "downloadPath": "./workspace",
    "uploadPath": "./uploads"
  }
}
```

### GET /api/config/full
获取完整配置（敏感信息已遮罩）

**响应示例**:
```json
{
  "gateway": {
    "port": 18789,
    "host": "127.0.0.1"
  },
  "channels": {
    "qqbot": {
      "enabled": true,
      "appId": "123456",
      "clientSecret": "sk-ant-...3kjs",
      "sandbox": true
    }
  },
  "agents": {
    "code": {
      "enabled": true,
      "priority": 10,
      "timeout": 60000
    }
  }
}
```

### PUT /api/config/full
更新完整配置

**请求体**:
```json
{
  "gateway": {
    "port": 18790
  },
  "channels": {
    "qqbot": {
      "sandbox": false
    }
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "配置已更新，需要重启生效"
}
```

### GET /api/config/schema
获取配置 Schema（用于前端生成表单）

**响应示例**:
```json
{
  "schema": {
    "fields": {
      "gateway.port": {
        "type": "number",
        "label": "Gateway 端口",
        "description": "WebSocket Gateway 监听端口",
        "required": false,
        "defaultValue": 18789,
        "min": 1024,
        "max": 65535
      },
      "channels.qqbot.clientSecret": {
        "type": "string",
        "label": "QQ Bot 密钥",
        "description": "QQ 机器人 AppSecret（从 QQ 开放平台获取）",
        "required": false,
        "sensitive": true
      }
    }
  }
}
```

### POST /api/config/validate
验证配置是否有效

**请求体**:
```json
{
  "gateway": {
    "port": 18789
  },
  "channels": {
    "qqbot": {
      "appId": "123456",
      "clientSecret": "secret"
    }
  }
}
```

**响应示例**:
```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "paths": {
    "storage.downloadPath": {
      "valid": true,
      "exists": true,
      "writable": true
    }
  },
  "apis": {}
}
```

### POST /api/config/test-connection
测试 API 连接

**请求体**:
```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-api03-..."
}
```

**响应示例**:
```json
{
  "success": true,
  "provider": "anthropic",
  "message": "API Key 格式有效（实际连接测试待实现）"
}
```

---

## Agent 管理 API

### GET /api/agents
获取所有 Agent 列表和状态

**响应示例**:
```json
{
  "agents": [
    {
      "id": "code",
      "name": "Code Agent",
      "enabled": true,
      "capabilities": ["code", "analysis", "refactoring"]
    },
    {
      "id": "browser",
      "name": "Browser Agent",
      "enabled": true,
      "capabilities": ["web", "automation", "testing"]
    }
  ],
  "total": 2
}
```

### PUT /api/agents/update
更新 Agent 配置

**请求体**:
```json
{
  "agentId": "code",
  "config": {
    "enabled": false,
    "priority": 5
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "agent": {
    "id": "code",
    "name": "Code Agent",
    "config": {
      "enabled": false,
      "priority": 5,
      "timeout": 60000
    }
  }
}
```

### GET /api/agents/stats
获取 Agent 统计信息

**查询参数**:
- `id` (可选): Agent ID

**响应示例** (所有 Agent):
```json
{
  "stats": {
    "user_123": {
      "total": 10,
      "completed": 8,
      "running": 1,
      "error": 1
    }
  }
}
```

**响应示例** (特定 Agent):
```json
{
  "agentId": "code",
  "stats": {
    "total": 5,
    "completed": 4,
    "running": 1,
    "error": 0,
    "recentTasks": [...]
  }
}
```

### POST /api/agents/reload
重新加载 Agent 配置

**响应示例**:
```json
{
  "success": true,
  "message": "Agent 配置已重新加载"
}
```

---

## 技能管理 API

### GET /api/skills
获取所有技能列表

**响应示例**:
```json
{
  "skills": [
    {
      "name": "brainstorming",
      "path": "/path/to/skills/brainstorming",
      "trigger": "brainstorming",
      "description": "创新思维和头脑风暴技能",
      "fullyLoaded": false
    }
  ],
  "total": 1
}
```

### GET /api/skills/detail
获取技能详情

**查询参数**:
- `name` (必需): 技能名称

**响应示例**:
```json
{
  "skill": {
    "name": "brainstorming",
    "trigger": "brainstorming",
    "description": "创新思维和头脑风暴技能",
    "capabilities": [
      "生成创意想法",
      "分析问题角度",
      "提供解决方案"
    ],
    "useCases": [
      "需求分析",
      "功能设计",
      "问题解决"
    ],
    "parameters": {
      "topic": {
        "description": "需要讨论的主题",
        "required": true
      }
    },
    "fullDocumentation": "..."
  }
}
```

### POST /api/skills/upload
上传新技能

**请求体**:
```json
{
  "name": "my-skill",
  "content": "# SKILL.md\n...",
  "source": "local"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "技能上传功能待实现"
}
```

### DELETE /api/skills/delete
删除技能

**请求体**:
```json
{
  "name": "my-skill"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "技能删除功能待实现"
}
```

### PUT /api/skills/enable
启用/禁用技能

**请求体**:
```json
{
  "name": "my-skill",
  "enabled": true
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "技能启用/禁用功能待实现"
}
```

### GET /api/skills/schema
获取技能元数据 Schema

**响应示例**:
```json
{
  "schema": {
    "skillMetadata": {
      "name": { "type": "string", "description": "技能名称" },
      "path": { "type": "string", "description": "技能文件路径" },
      "trigger": { "type": "string", "description": "触发关键词" },
      "description": { "type": "string", "description": "技能描述" },
      "fullyLoaded": { "type": "boolean", "description": "是否已加载完整内容" }
    },
    "skillDefinition": {
      "capabilities": { "type": "array", "items": "string", "description": "能力列表" },
      "useCases": { "type": "array", "items": "string", "description": "使用场景" },
      "parameters": { "type": "object", "description": "参数定义" },
      "outputFormat": { "type": "string", "description": "输出格式说明" },
      "notes": { "type": "array", "items": "string", "description": "注意事项" },
      "fullDocumentation": { "type": "string", "description": "完整文档" }
    }
  }
}
```

---

## 日志 API

### GET /api/logs/stream
获取实时日志流（SSE）

**响应类型**: `text/event-stream`

**事件类型**:
- `connected`: 连接成功
- `log`: 日志条目
- `heartbeat`: 心跳（每30秒）

### GET /api/logs/history
获取历史日志

**查询参数**:
- `limit` (可选): 返回条数，默认100
- `level` (可选): 日志级别，默认info
- `offset` (可选): 偏移量，默认0

**响应示例**:
```json
{
  "logs": {
    "entries": [],
    "limit": 100,
    "offset": 0,
    "total": 0,
    "level": "info"
  }
}
```

### GET /api/logs/levels
可用的日志级别

**响应示例**:
```json
{
  "levels": [
    { "value": "trace", "label": "Trace", "description": "最详细的日志信息" },
    { "value": "debug", "label": "Debug", "description": "调试信息" },
    { "value": "info", "label": "Info", "description": "一般信息" },
    { "value": "warn", "label": "Warning", "description": "警告信息" },
    { "value": "error", "label": "Error", "description": "错误信息" },
    { "value": "fatal", "label": "Fatal", "description": "致命错误" }
  ]
}
```

---

## 系统 API

### POST /api/system/export-config
导出配置

**请求体**:
```json
{
  "includeSecrets": false
}
```

**响应**: JSON 文件下载

### POST /api/system/import-config
导入配置

**请求体**:
```json
{
  "config": {
    "gateway": {
      "port": 18789
    }
  },
  "merge": true
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "配置导入成功，需要重启生效"
}
```

### GET /api/system/info
获取系统信息（版本、环境等）

**响应示例**:
```json
{
  "version": "1.0.0",
  "name": "qq-claude-proxy",
  "description": "QQ Remote Control for Claude Code",
  "environment": {
    "nodeVersion": "v20.10.0",
    "platform": "win32",
    "arch": "x64",
    "uptime": 3600.5,
    "memory": {
      "rss": 123456789,
      "heapTotal": 98765432,
      "heapUsed": 54321098
    },
    "cwd": "C:\\Test\\bot"
  },
  "gateway": {
    "host": "127.0.0.1",
    "port": 18789
  },
  "scheduler": {
    "enabled": true,
    "maxConcurrentTasks": 3
  }
}
```

### POST /api/system/validate
验证配置完整性

**响应示例**:
```json
{
  "validation": {
    "config": {
      "valid": true,
      "errors": [],
      "warnings": []
    },
    "paths": {
      "storage.downloadPath": {
        "valid": true,
        "exists": true,
        "writable": true
      }
    },
    "agents": [
      {
        "id": "code",
        "name": "Code Agent",
        "enabled": true,
        "capabilities": ["code", "analysis"]
      }
    ],
    "skills": {
      "totalSkills": 10,
      "loadedSkills": 2,
      "loadingRatio": "2/10"
    },
    "overall": {
      "valid": true,
      "errors": [],
      "warnings": []
    }
  }
}
```

---

## 错误响应

所有错误响应遵循以下格式：

```json
{
  "error": "错误描述信息"
}
```

**HTTP 状态码**:
- `200`: 成功
- `400`: 请求参数错误
- `404`: 资源不存在
- `405`: 方法不允许
- `500`: 服务器内部错误
- `503`: 服务不可用

---

## 集成说明

### 使用扩展 API 处理器

要使用扩展的 API 处理器，需要在创建 HTTP 服务器时传入 `ExtendedApiHandlerContext`:

```typescript
import { createExtendedApiHandlers, type ExtendedApiHandlerContext } from './gateway/dashboard-api.js';
import { AgentRegistry } from './agents/index.js';
import { SkillLoader } from './agents/SkillLoader.js';

// 创建上下文
const context: ExtendedApiHandlerContext = {
  config: loadedConfig,
  dashboardState: dashboardState,
  restartCallback: restartFunction,
  scheduler: schedulerInstance,
  agentRegistry: agentRegistry,  // 新增
  skillLoader: skillLoader,      // 新增
};

// 创建扩展的 API 处理器
const extendedHandlers = createExtendedApiHandlers(context);

// 合并基础和扩展的处理器
const allHandlers = new Map([
  ...createApiHandlers(context),
  ...extendedHandlers
]);
```

### CORS 支持

所有 API 端点都支持跨域请求。如需自定义 CORS 设置，请修改 HTTP 服务器配置。

### 敏感信息遮罩

敏感信息（如 API Keys）在返回时会自动遮罩，格式为：`前6位...后4位`。

例如：`sk-ant-api03-1234567890abcdef` → `sk-ant...cdef`
