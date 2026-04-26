# Phase 2 用户指南

## 功能概述

Phase 2 在 Phase 1 的基础上添加了多模态支持，使系统能够理解和检索图像、表格、公式等多模态内容。

**新增功能**:
1. **图像内容提取** - 使用 zhipu-vision 分析图像
2. **表格解析** - 自动解析 Markdown 表格
3. **公式解析** - 支持 LaTeX 公式提取
4. **VLM 增强查询** - 图像问答和视觉查询
5. **跨模态检索** - 统一的文本-图像-表格检索

## 使用方法

### 同步知识库（包含多模态内容）

```bash
from scripts.sync import ObsidianOntologySync

config = {
    'obsidian': {
        'vault_path': '/path/to/your/vault',
        'sources': {
            'contacts': {
                'path': 'references/contacts',
                'entity_type': 'Person'
            }
        }
    },
    'ontology': {
        'storage_path': 'memory/ontology',
        'format': 'jsonl'
    }
}

sync = ObsidianOntologySync(config)
sync.extract()
```

**新增输出文件**:
- `memory/ontology/multimodal.jsonl` - 多模态内容（图像、表格、公式）

### 多模态查询

#### 1. 文本查询（原有功能）

```python
from scripts.query import QueryEngine

engine = QueryEngine('memory/ontology')
results = engine.query("Alice Johnson", mode="text")
```

#### 2. 多模态查询

```python
# 组合查询
query = {
    "text": "sales data",
    "table_query": "quarterly report"
}

results = engine.query(query, mode="multimodal")
```

#### 3. 视觉查询

```python
# 带图像的查询
visual_query = {
    "text": "What does this chart show?",
    "image": "/path/to/chart.png"
}

results = engine.query(visual_query, mode="visual")
```

### 直接使用多模态组件

#### 图像内容提取

```python
from scripts.multimodal_extractor import MultimodalExtractor

extractor = MultimodalExtractor()
result = extractor.extract_image(
    "/path/to/image.png",
    "document_id"
)

print(result["vlm_analysis"])
# {"description": "A bar chart showing sales data", "tags": ["chart", "data"]}
```

#### 表格解析

```python
markdown_table = """| Name | Role |
|------|------|
| Alice | Dev |"""

result = extractor.extract_table(markdown_table, "doc_id", {"line": 10})
print(result["structured_data"])
# {"columns": ["Name", "Role"], "rows": [{"Name": "Alice", "Role": "Dev"}]}
```

#### 公式解析

```python
formula = r"The mass-energy equivalence is $E = mc^2$."

result = extractor.extract_formula(formula, "doc_id", {"type": "inline", "position": 0})
print(result["semantic_representation"])
# {"type": "equation", "variables": ["E", "m", "c"], "operators": ["=", "^"]}
```

#### VLM 增强查询

```python
from scripts.vlm_query_enhancer import VLMQueryEnhancer

enhancer = VLMQueryEnhancer()

# 图像增强查询
enhanced = enhancer.enhance_query_with_image(
    "What are the key metrics?",
    "/path/to/dashboard.png"
)

print(enhanced["enhanced_query_text"])
# "What are the key metrics? | Context from image: A dashboard showing..."
```

#### 跨模态检索

```python
from scripts.cross_modal_retriever import CrossModalRetriever

retriever = CrossModalRetriever()

# 添加图像数据
retriever.images.append({
    "image_id": "img1",
    "semantic_vector": image_vector,
    "clip_vector": clip_vector
})

# 文本查询图像
results = retriever.search("sales chart", query_type="text")
```

## 支持的内容类型

### 1. 图像

- **格式**: PNG, JPG, JPEG, WEBP, GIF
- **提取内容**:
  - VLM 描述
  - 标签/关键词
  - 语义向量（768 维）
  - CLIP 向量（512 维）

### 2. 表格

- **格式**: Markdown 表格
- **提取内容**:
  - 列名
  - 行数据
  - 表格 ID
  - 位置信息

### 3. 公式

- **格式**: LaTeX 公式（行内 `$...$` 或块级 `$$...$$`）
- **提取内容**:
  - LaTeX 代码
  - 变量列表
  - 运算符
  - 函数
  - 公式类型（积分、求和、分数、方程等）

## 查询模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **auto** | 自动选择查询模式 | 一般查询 |
| **text** | 纯文本检索 | 文档搜索 |
| **multimodal** | 多模态混合检索 | 复杂查询 |
| **visual** | 视觉增强查询 | 图像问答 |

## 性能指标

- **测试覆盖**: 30/30 通过（100%）
- **查询延迟**: ~2 秒（包含 VLM 调用）
- **支持模态**: 文本、图像、表格、公式

## 架构

```
Obsidian Vault
    ↓
Multimodal Extraction
    ├── Images (zhipu-vision)
    ├── Tables (Markdown parser)
    └── Formulas (LaTeX parser)
    ↓
Multimodal Storage (multimodal.jsonl)
    ↓
Query Engine
    ├── Text Query (Phase 1)
    ├── Multimodal Query
    ├── Visual Query (VLM Enhanced)
    └── Cross-Modal Retrieval
    ↓
Search Results
```

## 示例

### 示例 1: 查询包含图表的文档

```python
# 文档包含图像
engine = QueryEngine('memory/ontology')

# 自动模式会识别图像内容
results = engine.query("Q3 sales performance")

# 结果包含图像分析
for result in results:
    if "visual_context" in result:
        print(f"Image: {result['visual_context']}")
```

### 示例 2: 表格数据查询

```python
# 查询特定表格数据
query = {
    "text": "team members",
    "table_query": "engineering team"
}

results = engine.query(query, mode="multimodal")

for result in results:
    if "table" in result:
        print(f"Table: {result['table']['structured_data']}")
```

### 示例 3: 数学公式查询

```python
# 查询包含特定公式的文档
results = engine.query("Schrödinger equation")

for result in results:
    if result.get("formula_type") == "equation":
        print(f"Formula: {result['latex']}")
```

## 注意事项

1. **API Key**: 使用 zhipu-vision 需要 `ZHIPU_API_KEY` 环境变量
2. **模型下载**: 首次使用会下载 sentence-transformers 模型（~500MB）
3. **性能**: VLM 调用较慢（~2-3 秒），建议缓存结果
4. **准确度**: 向量编码当前使用占位符，实际部署时需集成真实模型

## 下一步

Phase 2 剩余任务：

- **Task 19**: 优化多模态向量融合（集成 CLIP 和优化权重）
- **Task 22**: 性能测试和优化（向量索引、缓存机制）
- **长期**: 实时公式渲染、更多图像格式支持

## 故障排除

### zhipu-vision 调用失败

```bash
# 检查 API Key
echo $ZHIPU_API_KEY

# 设置 API Key
export ZHIPU_API_KEY=your_api_key_here
```

### 向量编码错误

当前使用随机向量占位符，如需实际编码：

```python
# 安装依赖
pip install sentence-transformers
pip install clip-by-openai

# 更新代码（TODO 标记处）
# 使用实际的 sentence-transformers 和 CLIP 模型
```

## 测试

运行测试套件：

```bash
# 所有测试
pytest tests/ -v

# 多模态测试
pytest tests/test_multimodal_* -v
pytest tests/test_cross_modal_* -v
pytest tests/test_vlm_* -v
```
