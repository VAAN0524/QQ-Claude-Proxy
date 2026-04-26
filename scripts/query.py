# scripts/query.py
from pathlib import Path
from typing import Dict, Any, List, Union
import hashlib
import json
from scripts.query_classifier import QueryClassifier
from scripts.graph_expander import GraphExpander
from scripts.multi_granularity_matcher import MultiGranularityMatcher
from scripts.cross_modal_retriever import CrossModalRetriever
from scripts.vlm_query_enhancer import VLMQueryEnhancer

class QueryEngine:
    def __init__(self, ontology_path: str, cache_size: int = 128):
        self.ontology_path = Path(ontology_path)
        self.classifier = QueryClassifier()
        self.expander = GraphExpander()
        self.matcher = MultiGranularityMatcher()
        self.cross_modal = CrossModalRetriever()
        self.vlm_enhancer = VLMQueryEnhancer()
        self.cache_size = cache_size

        # 缓存存储（使用字典实现 LRU）
        self._cache = {}
        self._cache_order = []

        # 缓存统计
        self._cache_hits = 0
        self._cache_misses = 0

        # 加载数据
        self._load_data()

    def _load_data(self):
        """加载图谱和向量数据"""
        # 加载实体图
        graph_file = self.ontology_path / "graph.jsonl"
        if graph_file.exists():
            # 加载实体名称
            entity_names = set()
            # TODO: 从 graph.jsonl 提取实体名称
            self.classifier.load_entity_names(list(entity_names))

        # 加载文档图
        doc_graph_file = self.ontology_path / "doc_graph.jsonl"
        if doc_graph_file.exists():
            # TODO: 加载文档图
            pass

        # 加载向量
        vectors_file = self.ontology_path / "vectors.pkl"
        if vectors_file.exists():
            self.matcher.vectors = self._load_vectors(vectors_file)

        # 加载多模态数据
        multimodal_file = self.ontology_path / "multimodal.jsonl"
        if multimodal_file.exists():
            self._load_multimodal_data(multimodal_file)

    def _load_multimodal_data(self, multimodal_file: Path):
        """加载多模态数据"""
        import json

        with open(multimodal_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    data = json.loads(line)

                    # 加载图像数据
                    if "vlm_analysis" in data:
                        self.cross_modal.images.append(data)

                    # 加载表格数据
                    if "structured_data" in data and "columns" in data.get("structured_data", {}):
                        self.cross_modal.tables.append(data)

    def query(self, query: Union[str, Dict[str, Any]], top_k: int = 10, mode: str = "auto", use_cache: bool = True):
        """
        执行查询

        Args:
            query: 查询文本或查询字典（多模态）
            top_k: 返回结果数量
            mode: 查询模式 ("auto", "text", "multimodal", "visual")
            use_cache: 是否使用缓存

        Returns:
            查询结果列表
        """

        # 生成缓存键
        cache_key = self._generate_cache_key(query, top_k, mode)

        # 检查缓存
        if use_cache:
            cached_result = self._get_from_cache(cache_key)
            if cached_result is not None:
                self._cache_hits += 1
                return cached_result
            else:
                self._cache_misses += 1

        # 自动模式：根据查询类型选择
        if mode == "auto":
            if isinstance(query, dict):
                mode = "multimodal"
            else:
                # 分类查询
                query_type = self.classifier.classify(query)

                if query_type == "factual":
                    mode = "text"  # 事实性查询使用文本检索
                elif query_type == "relational":
                    mode = "text"  # 关系性查询使用文本检索
                else:
                    mode = "text"  # 默认文本检索

        # 文本查询模式
        if mode == "text":
            result = self._text_query(query, top_k)

        # 多模态查询模式
        elif mode == "multimodal":
            result = self._multimodal_query(query, top_k)

        # 视觉查询模式
        elif mode == "visual":
            result = self._visual_query(query, top_k)

        else:
            result = []

        # 保存到缓存
        if use_cache:
            self._save_to_cache(cache_key, result)

        return result

    def _text_query(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        """文本查询"""

        # 图谱扩展（如果是事实性查询）
        query_type = self.classifier.classify(query)
        if query_type == "factual":
            # TODO: 提取实体并扩展
            pass

        # 多粒度匹配
        results = self.matcher.search(query, top_k)

        return results

    def _multimodal_query(self, query: Dict[str, Any], top_k: int) -> List[Dict[str, Any]]:
        """多模态查询"""

        # 使用跨模态检索器
        results = self.cross_modal.search(query, query_type="multimodal", top_k=top_k)

        return results

    def _visual_query(self, query: Dict[str, Any], top_k: int) -> List[Dict[str, Any]]:
        """视觉查询"""

        # 如果包含图像，使用 VLM 增强
        if "image" in query:
            enhanced = self.vlm_enhancer.enhance_query_with_image(
                query.get("text", ""),
                query["image"]
            )

            # 使用增强后的查询进行检索
            text_results = self._text_query(enhanced["enhanced_query_text"], top_k)

            # 添加视觉上下文
            for result in text_results:
                result["visual_context"] = enhanced.get("image_analysis", {})

            return text_results

        return []

    def _load_vectors(self, vectors_path: Path):
        """加载向量数据"""
        import pickle
        with open(vectors_path, 'rb') as f:
            return pickle.load(f)

    def setup_test_data(self):
        """设置测试数据"""
        import numpy as np
        import tempfile
        import json

        # 创建测试图谱
        self.matcher.document_graph = [
            {"doc_id": "doc1", "title": "Alice Johnson Profile"},
            {"doc_id": "doc2", "title": "Project Alpha"}
        ]

        self.matcher.vectors = {
            "doc_vectors": {
                "doc1": np.random.rand(768),
                "doc2": np.random.rand(768)
            },
            "paragraph_vectors": {
                "doc1:para_0": np.random.rand(768),
                "doc1:para_1": np.random.rand(768)
            }
        }

        # 加载实体名称
        self.classifier.load_entity_names(["Alice Johnson", "Bob Smith"])

    # ==================== 缓存管理方法 ====================

    def _generate_cache_key(self, query: Union[str, Dict[str, Any]], top_k: int, mode: str) -> str:
        """生成缓存键"""
        # 将查询转换为可哈希的字符串
        if isinstance(query, dict):
            query_str = json.dumps(query, sort_keys=True)
        else:
            query_str = str(query)

        # 组合键：query + top_k + mode
        key_str = f"{query_str}|{top_k}|{mode}"

        # 生成哈希
        return hashlib.md5(key_str.encode()).hexdigest()

    def _get_from_cache(self, cache_key: str) -> Any:
        """从缓存获取结果"""
        return self._cache.get(cache_key)

    def _save_to_cache(self, cache_key: str, result: Any):
        """保存结果到缓存（LRU）"""
        # 如果缓存已满，删除最旧的项
        if len(self._cache) >= self.cache_size and cache_key not in self._cache:
            oldest_key = self._cache_order.pop(0)
            del self._cache[oldest_key]

        # 保存到缓存
        self._cache[cache_key] = result

        # 更新顺序（如果已存在，先移除）
        if cache_key in self._cache_order:
            self._cache_order.remove(cache_key)

        # 添加到末尾（最新使用）
        self._cache_order.append(cache_key)

    def clear_cache(self):
        """清空缓存"""
        self._cache.clear()
        self._cache_order.clear()
        self._cache_hits = 0
        self._cache_misses = 0

    def get_cache_stats(self) -> Dict[str, Any]:
        """获取缓存统计"""
        total_requests = self._cache_hits + self._cache_misses
        hit_rate = self._cache_hits / total_requests if total_requests > 0 else 0

        return {
            "cache_size": len(self._cache),
            "max_cache_size": self.cache_size,
            "cache_hits": self._cache_hits,
            "cache_misses": self._cache_misses,
            "hit_rate": hit_rate
        }
