# 知识库记忆管理系统 - 设计文档

**项目**: QQ-Claude-Proxy Knowledge Service
**日期**: 2026-04-23
**版本**: 1.0.0
**状态**: 📝 设计中

---

## 📋 执行摘要

构建一个智能知识库记忆管理系统，集成到 QQ-Claude-Proxy 中，提供：

- **三层标签体系**：一级大类目 → 二级语义脉络 → 三级关键词章节
- **智能检索**：基于任务类型、语义相似度、关键词的混合检索
- **经验自动提取**：从 Claude 对话中自动识别和提取有价值的知识
- **智能辅助**：在相关工作场景中主动提醒相关经验
- **零依赖**：使用 SQLite + Transformers.js，无需外部服务
- **安全隐私**：本地存储 + 字段级加密 + 自动脱敏

---

## 🎯 核心需求

### 功能需求

1. **知识存储**
   - 支持文本、图片、代码、结构化数据
   - 三层标签分类体系
   - 元数据管理（来源、时间、使用频率、重要性）

2. **智能检索**
   - 任务类型识别
   - 语义相似度匹配
   - 关键词过滤
   - 上下文感知排序

3. **经验提取**
   - 自动分析 Claude 对话
   - 识别知识点、解决方案、错误经验
   - 用户确认机制

4. **智能辅助**
   - 主动建议保存有价值的经验
   - 在相关场景提醒历史经验
   - 学习和优化推荐策略

5. **QQ 命令接口**
   - 保存知识
   - 搜索知识
   - 管理标签
   - 查看统计

### 非功能需求

- **零外部依赖**：所有功能使用本地资源
- **高性能**：检索响应 < 500ms
- **安全隐私**：本地存储、加密、脱敏
- **可扩展**：易于添加新的内容类型和检索策略
- **易维护**：模块化设计，清晰的接口

---

## 🏗️ 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        用户交互层                            │
├─────────────────────────────────────────────────────────────┤
│  QQ Bot 命令  │  (未来) CLI 命令  │  (未来) Web 界面      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    KnowledgeService                         │
│                   （知识库核心服务）                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Extractor   │  │ Retriever   │  │ Security    │        │
│  │ 经验提取器   │  │ 智能检索器   │  │ 安全模块     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      存储和计算层                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   SQLite    │  │ 向量模型     │  │  FTS5       │        │
│  │  知识库DB   │  │ Transformers│  │  全文搜索   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 模块化插件架构

**核心理念**：知识库作为独立的 Service，集成到现有系统中

```
QQ Bot → Gateway → ClaudeCodeAgent → Claude CLI
                    ↓
                KnowledgeService
                    ↓
                SQLite + 向量模型
```

### 目录结构

```
src/
├── agent/
│   ├── knowledge-service/          # 知识库服务
│   │   ├── index.ts                # 主入口
│   │   ├── types.ts                # 类型定义
│   │   ├── storage.ts              # SQLite 存储
│   │   ├── embedding.ts            # 向量模型
│   │   ├── retriever.ts            # 检索器
│   │   ├── extractor.ts            # 经验提取器
│   │   ├── security.ts             # 安全模块
│   │   └── commands.ts             # QQ 命令处理
│   └── index.ts                    # 集成 KnowledgeService
├── channels/qqbot/
│   └── index.ts                    # 添加知识库命令路由
└── knowledge/                      # 知识库数据目录
    ├── knowledge.db                # SQLite 数据库
    └── vectors/                    # 向量索引缓存
```

---

## 📊 数据模型

### 知识条目表 (knowledge_items)

```sql
CREATE TABLE knowledge_items (
    id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,        -- text, code, image, file
    content TEXT NOT NULL,             -- 主要内容
    level1_tag TEXT,                   -- 一级大类目
    level2_tag TEXT,                   -- 二级语义脉络
    level3_tag TEXT,                   -- 三级关键词章节
    source TEXT,                       -- 来源：qq, code, doc, manual
    metadata TEXT,                     -- JSON 元数据
    usage_count INTEGER DEFAULT 0,     -- 使用次数
    importance_score INTEGER DEFAULT 5, -- 重要性 0-10
    created_at INTEGER NOT NULL,       -- 创建时间戳
    updated_at INTEGER NOT NULL,       -- 更新时间戳
    vector_embedding BLOB,             -- 向量嵌入
    is_encrypted INTEGER DEFAULT 0     -- 是否加密
);
```

### 关联关系表 (knowledge_relations)

```sql
CREATE TABLE knowledge_relations (
    id TEXT PRIMARY KEY,
    from_item_id TEXT NOT NULL,
    to_item_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,       -- related, derived_from, reference
    strength REAL DEFAULT 1.0,         -- 关联强度 0-1
    created_at INTEGER NOT NULL,
    FOREIGN KEY (from_item_id) REFERENCES knowledge_items(id),
    FOREIGN KEY (to_item_id) REFERENCES knowledge_items(id)
);
```

### 使用历史表 (knowledge_usage)

```sql
CREATE TABLE knowledge_usage (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    task_type TEXT,                    -- 任务类型
    context TEXT,                      -- 使用上下文
    user_feedback INTEGER,             -- 用户反馈 -1/0/1
    used_at INTEGER NOT NULL,
    FOREIGN KEY (item_id) REFERENCES knowledge_items(id)
);
```

### 全文搜索索引

```sql
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
    content,
    level1_tag,
    level2_tag,
    level3_tag,
    content=knowledge_items,
    content_rowid=rowid
);
```

---

## 🔄 数据流设计

### 知识保存流程

```
用户操作 / Claude对话
    ↓
KnowledgeService.extractKnowledge()
    ↓
分析内容 → 识别知识点 → 提取元数据
    ↓
生成向量嵌入（Transformers.js）
    ↓
KnowledgeService.suggestSave()
    ↓ (QQ 询问用户)
用户确认 / 修改标签
    ↓
Security.encryptSensitiveFields()
    ↓
Storage.save()
    ↓ (SQLite + FTS5 索引)
完成
```

### 智能检索流程

```
用户查询 / 工作上下文
    ↓
Retriever.identifyTaskType()
    ↓
多层检索策略：
    1. 任务类型过滤
    2. 语义相似度匹配（向量）
    3. 关键词匹配（FTS5）
    4. 标签过滤
    ↓
上下文感知排序
    ↓
Security.decryptIfNeeded()
    ↓
Security.maskSensitiveInfo()
    ↓
返回结果
```

### 智能辅助流程

```
Claude 工作中（分析/调试/开发）
    ↓
Extractor.monitorContext()
    ↓
识别有价值的时刻：
    - 解决了问题
    - 发现了错误
    - 总结了经验
    ↓
Extractor.suggestSave()
    ↓ (QQ 提示用户)
"检测到有价值的经验，要保存吗？"
    ↓
用户确认 → 自动提取标签 → 保存
```

---

## 🎛️ QQ 命令接口

### 基础命令

```
/kb save <内容> [标签...]     - 保存知识到知识库
/kb search <查询>             - 搜索知识库
/kb get <ID>                  - 获取指定知识
/kb list [标签]               - 列出知识（支持标签过滤）
/kb tags                      - 查看所有标签
/kb stats                     - 查看统计信息
```

### 管理命令

```
/kb edit <ID>                 - 编辑知识内容
/kb delete <ID>               - 删除知识
/kb tag <ID> <标签>           - 添加/修改标签
/kb relate <ID1> <ID2>        - 建立关联
/kb export                    - 导出知识库（JSON）
/kb import                    - 导入知识库
```

### 高级命令

```
/kb search --similar <ID>     - 查找相似知识
/kb search --recent           - 最近添加的知识
/kb search --frequent         - 最常使用的知识
/kb feedback <ID> <评分>      - 对检索结果反馈
/kb enable-auto               - 启用自动经验提取
/kb disable-auto              - 禁用自动经验提取
```

---

## 🧠 核心组件设计

### KnowledgeService（主服务）

```typescript
class KnowledgeService {
  // 存储
  private storage: Storage;
  // 向量模型
  private embedding: EmbeddingModel;
  // 检索器
  private retriever: Retriever;
  // 提取器
  private extractor: Extractor;
  // 安全模块
  private security: Security;

  // 核心方法
  async save(content: string, tags: TagHierarchy, options?: SaveOptions): Promise<string>;
  async search(query: string, context: SearchContext): Promise<KnowledgeItem[]>;
  async get(id: string): Promise<KnowledgeItem>;
  async update(id: string, updates: Partial<KnowledgeItem>): Promise<void>;
  async delete(id: string): Promise<void>;

  // 智能辅助
  async extractFromConversation(messages: Message[]): Promise<ExtractedKnowledge[]>;
  async suggestSave(extracted: ExtractedKnowledge[]): Promise<void>;
  async provideAssistance(context: WorkContext): Promise<AssistanceSuggestion[]>;
}
```

### Storage（存储层）

```typescript
class Storage {
  private db: Database;

  async saveItem(item: KnowledgeItem): Promise<string>;
  async getItem(id: string): Promise<KnowledgeItem>;
  async searchItems(query: SearchQuery): Promise<KnowledgeItem[]>;
  async updateItem(id: string, updates: Partial<KnowledgeItem>): Promise<void>;
  async deleteItem(id: string): Promise<void>;
  async getUsageStats(): Promise<UsageStats>;

  // 标签管理
  async getAllTags(): Promise<TagHierarchy[]>;
  async getItemsByTag(level: number, tag: string): Promise<KnowledgeItem[]>;

  // 关联管理
  async createRelation(fromId: string, toId: string, type: RelationType): Promise<void>;
  async getRelatedItems(id: string): Promise<KnowledgeItem[]>;
}
```

### EmbeddingModel（向量模型）

```typescript
class EmbeddingModel {
  private model: any; // Transformers.js 模型

  async initialize(): Promise<void>;
  async generateEmbedding(text: string): Promise<number[]>;
  async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number>;

  // 批量处理
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}
```

### Retriever（检索器）

```typescript
class Retriever {
  private storage: Storage;
  private embedding: EmbeddingModel;

  async search(query: string, context: SearchContext): Promise<KnowledgeItem[]>;
  private identifyTaskType(context: SearchContext): TaskType;
  private multiStageRetrieval(query: string, taskType: TaskType): Promise<KnowledgeItem[]>;
  private contextAwareRanking(items: KnowledgeItem[], context: SearchContext): Promise<KnowledgeItem[]>;

  // 检索策略
  private semanticRetrieval(queryEmbedding: number[], threshold: number): Promise<KnowledgeItem[]>;
  private keywordRetrieval(query: string): Promise<KnowledgeItem[]>;
  private tagBasedRetrieval(tags: TagHierarchy): Promise<KnowledgeItem[]>;
}
```

### Extractor（经验提取器）

```typescript
class Extractor {
  private storage: Storage;
  private embedding: EmbeddingModel;

  async extractFromConversation(messages: Message[]): Promise<ExtractedKnowledge[]>;
  private identifyValueMoments(messages: Message[]): Promise<ValueMoment[]>;
  private extractKnowledge(moment: ValueMoment): Promise<ExtractedKnowledge>;
  private suggestTags(knowledge: ExtractedKnowledge): Promise<TagHierarchy>;

  // 监控和辅助
  async monitorConversation(messages: Message[]): Promise<AssistanceSuggestion[]>;
  async shouldProvideAssistance(context: WorkContext): Promise<boolean>;
}
```

### Security（安全模块）

```typescript
class Security {
  private encryptionKey: string;

  // 加密/解密
  async encryptField(field: string): Promise<string>;
  async decryptField(encrypted: string): Promise<string>;

  // 脱敏
  maskSensitiveInfo(text: string): string;
  private detectSensitivePatterns(text: string): SensitiveInfo[];

  // 访问控制
  async canAccess(userId: string, itemId: string): Promise<boolean>;
  async logAccess(userId: string, itemId: string, action: string): Promise<void>;
}
```

---

## 🔒 安全和隐私

### 数据安全措施

1. **本地存储**
   - 所有数据存储在本地 SQLite 文件
   - 不上传任何数据到云端

2. **字段级加密**
   ```typescript
   // 敏感字段自动加密
   const encrypted = await security.encryptField(notes);
   // 读取时解密
   const decrypted = await security.decryptField(encrypted);
   ```

3. **自动脱敏**
   ```typescript
   // 检测到的敏感模式
   const patterns = [
     /sk-ant-[a-zA-Z0-9_-]{32,}/,      // Anthropic API Key
     /AKIA[0-9A-Z]{16}/,               // AWS Access Key
     /password:\s*["']?[^"'\s]+/i,     // 密码
     /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, // JWT
   ];

   // 脱敏处理
   const masked = security.maskSensitiveInfo(text);
   // "API Key: sk-ant-xxx...xxx" → "API Key: ***"
   ```

4. **访问审计**
   ```sql
   -- 记录所有访问
   CREATE TABLE access_logs (
     id TEXT PRIMARY KEY,
     user_id TEXT,
     item_id TEXT,
     action TEXT,  -- read, update, delete
     timestamp INTEGER
   );
   ```

5. **备份加密**
   ```bash
   # 导出时加密
   /kb export --encrypt --output knowledge-backup.enc
   # 导入时解密
   /kb import --decrypt --input knowledge-backup.enc
   ```

---

## ⚡ 性能优化

### 检索性能

1. **分层检索策略**
   - 第一层：任务类型过滤（SQLite 索引，< 10ms）
   - 第二层：语义相似度（向量搜索，< 100ms）
   - 第三层：关键词匹配（FTS5，< 50ms）
   - 总响应时间：目标 < 500ms

2. **向量缓存**
   ```typescript
   // 缓存常用的向量
   private vectorCache = new Map<string, number[]>();
   // LRU 策略，最多缓存 1000 个向量
   ```

3. **异步索引**
   ```typescript
   // 保存后异步更新索引
   async save(item: KnowledgeItem) {
     await this.storage.saveItem(item);
     // 异步生成向量，不阻塞主流程
     this.embedding.generateEmbedding(item.content)
       .then(embedding => this.storage.updateVector(item.id, embedding));
   }
   ```

### 存储优化

1. **数据压缩**
   ```typescript
   // 大内容使用 gzip 压缩
   import { gzip, ungzip } from 'zlib';

   const compressed = await gzip(content);
   await db.run('INSERT INTO items (content) VALUES (?)', compressed);
   ```

2. **分表存储**
   ```sql
   -- 热数据（最近30天）单独存储
   CREATE TABLE knowledge_items_hot(...);
   -- 冷数据归档
   CREATE TABLE knowledge_items_archive(...);
   ```

3. **定期清理**
   ```typescript
   // 清理策略
   - 删除 1 年未使用的知识
   - 归档 6 个月未使用的知识
   - 定期优化数据库
   ```

---

## 🧪 测试策略

### 单元测试

```typescript
describe('KnowledgeService', () => {
  test('should save knowledge item', async () => {
    const service = new KnowledgeService(testConfig);
    const id = await service.save('测试内容', { level1: '测试', level2: '单元测试' });
    expect(id).toBeDefined();
  });

  test('should search by semantic similarity', async () => {
    const results = await service.search('如何调试 WebSocket');
    expect(results.length).toBeGreaterThan(0);
  });
});
```

### 集成测试

```typescript
describe('Knowledge Integration', () => {
  test('should extract and save from conversation', async () => {
    const messages = [
      { role: 'user', content: '如何解决 WebSocket 连接问题？' },
      { role: 'assistant', content: '检查端口是否被占用...' }
    ];

    const extracted = await service.extractFromConversation(messages);
    expect(extracted.length).toBeGreaterThan(0);
  });
});
```

### 性能测试

```typescript
describe('Performance', () => {
  test('search should respond within 500ms', async () => {
    const start = Date.now();
    await service.search('WebSocket 调试');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});
```

---

## 📊 监控和统计

### 使用统计

```typescript
interface UsageStats {
  totalItems: number;
  itemsByType: Record<string, number>;
  itemsByTag: Record<string, number>;
  mostUsedItems: KnowledgeItem[];
  recentlyUsedItems: KnowledgeItem[];
  searchQueries: SearchQueryStats[];
}
```

### QQ 命令

```
/kb stats

知识库统计：
- 总条目数：156
- 按类型：文本 120, 代码 25, 图片 11
- 按标签：
  - 一级：工作 89, 学习 42, 项目 25
  - 二级：前端 45, 后端 32, 调试 22
  - 三级：WebSocket 12, React 18
- 最常用：[显示前10]
- 最近使用：[显示前10]
```

---

## 🚀 实施路线图

### Phase 1: 核心功能（1-2周）

- [ ] KnowledgeService 基础架构
- [ ] SQLite 存储层
- [ ] 基础 CRUD 操作
- [ ] QQ 命令接口（save, search, get, list）
- [ ] 三层标签体系

### Phase 2: 智能检索（1周）

- [ ] Transformers.js 向量模型集成
- [ ] 语义相似度检索
- [ ] FTS5 全文搜索
- [ ] 上下文感知排序

### Phase 3: 经验提取（1周）

- [ ] 对话分析器
- [ ] 价值时刻识别
- [ ] 自动标签建议
- [ ] QQ 智能提示

### Phase 4: 安全和优化（1周）

- [ ] 字段级加密
- [ ] 自动脱敏
- [ ] 性能优化
- [ ] 访问审计

### Phase 5: 高级功能（可选）

- [ ] CLI 端支持
- [ ] Web 界面
- [ ] 知识图谱可视化
- [ ] 自动演化机制

---

## 📝 成功标准

### 功能验收

- [ ] 可以通过 QQ 保存、搜索、管理知识
- [ ] 三层标签体系正常工作
- [ ] 语义检索准确率 > 70%
- [ ] 智能辅助提示准确率 > 60%
- [ ] 响应时间 < 500ms

### 性能验收

- [ ] 检索响应 < 500ms
- [ ] 保存操作 < 1s
- [ ] 向量生成 < 2s
- [ ] 数据库大小 < 100MB（1000 条知识）

### 安全验收

- [ ] 敏感信息已加密
- [ ] 自动脱敏正常工作
- [ ] 访问日志完整
- [ ] 无数据泄露风险

---

## 🔄 后续优化方向

### 短期（1-2月）

1. **算法优化**
   - 改进向量模型（更大、更准确的模型）
   - 优化检索算法（近似最近邻搜索）
   - 增强任务类型识别

2. **用户体验**
   - 改进 QQ 提示时机和方式
   - 添加批量操作
   - 支持语音输入

### 中期（3-6月）

1. **多端支持**
   - CLI 命令行工具
   - Web 可视化界面
   - VSCode 扩展

2. **高级功能**
   - 知识图谱可视化
   - 自动关联发现
   - 学习曲线追踪

### 长期（6-12月）

1. **AI 增强**
   - 自动总结和提炼
   - 知识推理和衍生
   - 个性化推荐

2. **协作功能**
   - 知识库分享
   - 团队协作
   - 知识市场

---

**文档版本**: 1.0
**最后更新**: 2026-04-23
**状态**: 📝 设计完成，等待实施

**下一步**: 调用 `writing-plans` skill 创建详细实施计划
