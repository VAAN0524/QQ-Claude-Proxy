# 知识库系统操作手册

## 📋 目录

1. [系统架构](#系统架构)
2. [知识库结构](#知识库结构)
3. [触发方式](#触发方式)
4. [调用接口](#调用接口)
5. [与 Skill/MCP 的关系](#与-skillmcp-的关系)
6. [完整操作流程](#完整操作流程)

---

## 系统架构

### 当前知识库系统架构

```
QQ Bot Message
    ↓
ClaudeCodeAgent (主 Agent)
    ↓
┌─────────────────────────────────┐
│   UnifiedKnowledgeEntrance        │
│   (统一入口 - 保守式路由)         │
│                                 │
│  ┌────────────────────────────┐ │
│  │ KnowledgeService (知识库)  │ │
│  │  - 三层标签体系            │  │
│  │  - 语义搜索                │  │
│  │  - 自动提取                │  │
│  └────────────────────────────┘ │
│                                 │
│  ┌────────────────────────────┐ │
│  │ MCP Memory (外部记忆)       │ │
│  │  - 通过 MemoryImporter     │ │
│  │  - 数据导入                │  │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
```

**核心组件**:
1. **KnowledgeService** - 本地知识库服务
2. **UnifiedKnowledgeEntrance** - 统一入口（保守式路由）
3. **MCP Memory** - 外部记忆服务（可选集成）

---

## 知识库结构

### 数据模型

```typescript
// 知识条目
interface KnowledgeItem {
  id: string;                    // 唯一标识
  contentType: 'text' | 'code' | 'image' | 'file';
  content: string;               // 主要内容
  tags: TagHierarchy;            // 三层标签体系
  source?: string;               // 来源：qq, code, doc, manual
  metadata?: Record<string, any>;
  usageCount: number;            // 使用次数（用于排序）
  importanceScore: number;       // 重要性评分 0-10
  createdAt: number;
  updatedAt: number;
}

// 三层标签体系
interface TagHierarchy {
  level1: string;  // 一级大类目（工作、学习、项目、个人）
  level2: string;  // 二级语义脉络（前端开发、调试、2026年4月）
  level3: string;  // 三级关键词章节（WebSocket、连接超时、React Hooks）
}
```

### 存储位置

```
C:\Test\bot\
├── data/
│   └── knowledge/
│       └── knowledge.db (SQLite 数据库)
├── src/agent/knowledge-service/
│   ├── storage.ts           # 数据库操作
│   ├── skill/
│   │   ├── index.ts         # 知识库核心逻辑
│   │   ├── semantic-search.ts
│   │   └── vector-embeddings.ts
│   └── tools/
│       ├── memory-importer.ts    # MCP Memory 导入
│       └── test-data-importer.ts
└── unified-entrance.ts    # 统一入口
```

---

## 触发方式

### 自动触发（保守式路由）

**触发条件**（必须同时满足）：

1. **消息中包含明确的知识库关键词**：
   - "知识库"、"知识"、"导入memory"、"启用自动提取" 等

2. **不包含文件路径**（避免干扰其他功能）：
   - 排除 `C:\`、`D:\`、`/`、`~/` 等路径

### 触发示例

| 用户消息 | 是否触发 | 原因 |
|---------|---------|------|
| "帮我看看知识库里有什么" | ✅ | 包含"知识库" |
| "导入memory数据" | ✅ | 包含"导入memory" |
| "搜索营养" | ❌ | 不包含知识库关键词 |
| "C:\work\file.txt 怎么办" | ❌ | 包含文件路径 |
| "启用自动提取" | ✅ | 包含"自动提取" |

---

## 调用接口

### 1. 查看知识库

**命令**:
```
"帮我看看知识库里有什么"
"知识库有哪些内容"
```

**响应**:
```
📚 知识库目录（最近 20 条）

┌────────────────────────────────────────┐
│ 💼 工作 > 前端开发 > WebSocket       │
│ 🔍 使用次数: 5  |  重要性: 8/10       │
│ 📝 WebSocket连接超时问题的解决...      │
└────────────────────────────────────────┘
```

### 2. 搜索知识

**命令**:
```
"搜索营养"
"找找关于调试的知识"
"知识库搜索"
```

**响应**:
```
🔍 搜索结果: "营养"

┌────────────────────────────────────────┐
│ 🏥️ 学习 > 营养 > 蛋白质               │
│ 🔍 使用次数: 3  |  重要性: 7/10       │
│ 📝 蛋白质的每日推荐摄入量...          │
└────────────────────────────────────────┘
```

### 3. 导入数据

#### 从 MCP Memory 导入

**命令**:
```
"导入memory数据"
"从memory导入"
"整合知识库"
```

**流程**:
1. 连接 MCP Memory 服务
2. 读取所有记忆数据
3. 批量导入到知识库
4. 显示导入结果

**响应**:
```
🔄 正在从 MCP Memory 导入数据...

✅ 成功导入 15 条知识！

现在你可以：
- 说 "帮我看看知识库里有什么" 查看内容
- 说 "搜索测试" 查找特定知识
```

#### 导入测试数据

**命令**:
```
"导入测试数据"
"测试导入"
```

**响应**:
```
📊 测试数据导入

✅ 成功导入 5 条测试知识！

现在你可以：
- 说 "帮我看看知识库里有什么" 查看内容
- 说 "搜索测试" 查找测试数据
```

### 4. 自动提取

#### 启用自动提取

**命令**:
```
"启用自动提取"
"开启自动保存"
"auto save"
```

**效果**:
- 系统会自动分析对话内容
- 识别有价值的知识点
- 在适当时机提示保存
- 推荐合适的标签

**关闭**:
```
"关闭自动保存"
"禁用自动提取"
```

### 5. 查看统计

**命令**:
```
"查看统计"
"知识库统计"
"知识库概况"
```

**响应**:
```
📊 知识库统计

═══════════════════════════════════════
总条目数: 45

按类型:
  - text: 40
  - code: 5

按分类:
  - 工作 > 前端开发: 15
  - 学习 > 营养: 8
  - 项目 > 调试: 12

最常用:
  1. WebSocket超时解决 (12次)
  2. React Hooks使用 (8次)
  3. 蛋白质摄入 (7次)
═══════════════════════════════════════
```

---

## 与 Skill/MCP 的关系

### 架构关系

```
┌─────────────────────────────────────┐
│        QQ-Claude-Proxy 系统         │
│                                         │
│  ┌──────────────┐  ┌─────────────┐  │
│  │   Skills     │  │    MCPs      │  │
│  │              │  │              │  │
│  │  (技能插件)   │  │ (服务插件)   │  │
│  │              │  │              │  │
│  │  - 工作流自动化 │  │  - Memory MCP  │  │
│  │  - 验证测试   │  │  - Search MCP │  │
│  │  - 文档生成   │  │  - Tool MCP  │  │
│  │               │  │               │  │
│  │  ~/.claude/   │  │  mcp_servers/│  │
│  │   skills/     │  │               │  │
│  └──────────────┘  └─────────────┘  │
│                                         │
│  ┌───────────────────────────────┐  │
│  │  Knowledge Service            │  │
│  │  (知识库服务 - 内置功能)      │  │
│  └───────────────────────────────┘  │
│                                         │
│  三个系统是独立但可以协作：          │
│  - Knowledge Service: 本地知识库    │
│  - Skills: 自动化工作流              │
│  - MCPs: 外部服务集成               │
└─────────────────────────────────────┘
```

### 关系说明

| 系统 | 类型 | 与知识库的关系 | 状态 |
|------|------|---------------|------|
| **Knowledge Service** | 内置功能 | **就是知识库本身** | ✅ 已集成 |
| **Skills** | 插件系统 | 可以调用知识库 API | 🔄 可扩展 |
| **MCP Memory** | 外部服务 | 可以导入数据到知识库 | 🔄 可扩展 |

### 协作示例

#### 1. Skill 调用知识库

```typescript
// Skill 中调用知识库
import { KnowledgeService } from '../knowledge-service/skill/index.js';

const knowledgeService = new KnowledgeService({ dbPath: './data/knowledge/knowledge.db' });

// 搜索知识
const results = await knowledgeService.search("WebSocket");
```

#### 2. MCP Memory 导入到知识库

```typescript
// 已实现：MemoryImporter
const result = await MemoryImporter.oneClickImport(knowledgeService);
// 自动从 MCP Memory 读取并导入
```

#### 3. 知识库数据导出到 Skill

```typescript
// 可以创建一个 Tool 导出知识库数据给 Skill 使用
import { MemoryExporter } from './tools/memory-exporter.js';

const exportData = await MemoryExporter.exportToMCP(knowledgeService);
```

---

## 完整操作流程

### 场景 1: 首次使用 - 导入测试数据

```
用户: "导入测试数据"
   ↓
系统: 调用 TestDataImporter
   ↓
系统: 创建 5 条测试知识
   ↓
用户: "帮我看看知识库里有什么"
   ↓
系统: 显示知识库目录
```

### 场景 2: 搜索知识

```
用户: "搜索 WebSocket"
   ↓
系统: 解析关键词（提取 "WebSocket"）
   ↓
系统: 执行语义搜索
   ↓
系统: 返回相关结果（按使用次数排序）
   ↓
用户: 查看详情
   ↓
系统: 显示完整内容
```

### 场景 3: 自动保存知识

```
用户: "启用自动提取"
   ↓
系统: 启用 autoSave 模式
   ↓
[对话进行中...]
   ↓
系统: 检测到有价值内容
   ↓
系统: 提示保存建议
   ↓
用户: 确认保存
   ↓
系统: 保存到知识库
```

### 场景 4: Skill 调用知识库

```
[Skill 执行中...]
   ↓
Skill: 调用 knowledgeService.search()
   ↓
KnowledgeService: 返回相关知识
   ↓
Skill: 使用知识内容生成回复
   ↓
系统: 返回增强的回复
```

---

## 配置文件

### 知识库配置（当前未在 config.json 中）

```json
{
  "knowledge": {
    "enabled": true,
    "dbPath": "./data/knowledge/knowledge.db",
    "enableAutoExtraction": false,
    "autoExtractionThreshold": 0.7
  }
}
```

### 启用知识库服务

在 `src/agent/index.ts` 中，知识库服务已默认初始化：

```typescript
// Phase 3: 知识库服务（自动保存建议）
private knowledgeService: any = null;

// 初始化
this.knowledgeService = new KnowledgeService({
  dbPath: path.join(config.workspacePath, 'data', 'knowledge', 'knowledge.db')
});

// 统一入口
this.unifiedKnowledgeEntrance = new UnifiedKnowledgeEntrance(this.knowledgeService);
```

---

## 常用命令参考

### 查看类

| 命令 | 说明 | 示例 |
|------|------|------|
| 查看知识 | 查看知识库内容 | "知识库有哪些" |
| 搜索知识 | 搜索特定知识 | "搜索 WebSocket" |
| 导入数据 | 从 MCP Memory 导入 | "导入memory数据" |
| 测试导入 | 导入测试数据 | "导入测试数据" |
| 启用自动提取 | 开启自动保存 | "启用自动提取" |
| 查看统计 | 查看知识库统计 | "查看统计" |
| 查看帮助 | 显示帮助信息 | 其他消息 |

### 保存知识

**直接保存**:
```
"保存：WebSocket连接超时的解决方法"
```

**NLP 解析保存**（自动提取）:
```
"刚才那个问题的解决方法很有价值，帮我保存一下"
```

---

## 故障排除

### 问题 1: 知识库不响应

**原因**: 消息不包含知识库关键词

**解决**:
- 确保消息包含"知识库"、"知识"等关键词
- 避免使用文件路径（会优先作为文件处理）

### 问题 2: 导入失败

**原因**: MCP Memory 服务未启动或无数据

**解决**:
1. 检查 MCP Memory 是否启动
2. 尝试"导入测试数据"验证功能
3. 查看日志获取详细错误信息

### 问题 3: 搜索结果为空

**原因**:
- 知识库为空
- 搜索词不匹配
- 语义相似度阈值过高

**解决**:
- 导入测试数据
- 尝试其他关键词
- 调整语义相似度阈值

---

## 开发指南

### 添加新的知识库命令

在 `src/agent/knowledge-service/unified-entrance.ts` 中：

```typescript
// 1. 添加命令检测
private isMyNewCommand(input: string): boolean {
  const keywords = ['我的新命令', 'my new command'];
  return keywords.some(keyword => input.toLowerCase().includes(keyword));
}

// 2. 在 handleNaturalInput 中添加处理
async handleNaturalInput(input: string): Promise<string> {
  // ...
  if (this.isMyNewCommand(input)) {
    return await this.handleMyNewCommand(input);
  }
  // ...
}
```

### 集成新的数据源

创建新的导入器（参考 `MemoryImporter`）：

```typescript
// tools/my-importer.ts
export class MyImporter {
  static async import(knowledgeService: KnowledgeService) {
    // 1. 连接数据源
    // 2. 提取数据
    // 3. 批量保存
  }
}
```

---

## 总结

### 知识库系统特点

1. **保守式路由**: 只处理明确的知识库命令，避免干扰其他功能
2. **三层标签**: 结构化的知识组织
3. **语义搜索**: 基于内容相似度的智能检索
4. **自动提取**: 可选的对话知识自动记录
5. **MCP 集成**: 支持从外部记忆服务导入数据

### 与 Skill/MCP 的关系

- **独立系统**: 知识库是内置功能，不依赖 Skill/MCP
- **可扩展**: Skill 和 MCP 可以调用知识库 API
- **数据流**: MCP Memory → Knowledge Service → Skills
- **互补关系**: 各司其职，协同工作

### 快速开始

```bash
# 1. 导入测试数据
"导入测试数据"

# 2. 查看知识
"帮我看看知识库里有什么"

# 3. 搜索知识
"搜索 WebSocket"

# 4. （可选）启用自动提取
"启用自动提取"
```

---

**版本**: v2.0.0
**更新时间**: 2026-04-26
**维护者**: Vaan
