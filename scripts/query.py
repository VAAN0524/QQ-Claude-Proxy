# scripts/query.py
from pathlib import Path
from typing import Dict, Any, List, Union
from scripts.query_classifier import QueryClassifier
from scripts.graph_expander import GraphExpander
from scripts.multi_granularity_matcher import MultiGranularityMatcher
from scripts.cross_modal_retriever import CrossModalRetriever
from scripts.vlm_query_enhancer import VLMQueryEnhancer

class QueryEngine:
    def __init__(self, ontology_path: str):
        self.ontology_path = Path(ontology_path)
        self.classifier = QueryClassifier()
        self.expander = GraphExpander()
        self.matcher = MultiGranularityMatcher()
        self.cross_modal = CrossModalRetriever()
        self.vlm_enhancer = VLMQueryEnhancer()

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

    def query(self, query: Union[str, Dict[str, Any]], top_k: int = 10, mode: str = "auto"):
        """
        执行查询

        Args:
            query: 查询文本或查询字典（多模态）
            top_k: 返回结果数量
            mode: 查询模式 ("auto", "text", "multimodal", "visual")

        Returns:
            查询结果列表
        """

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
            return self._text_query(query, top_k)

        # 多模态查询模式
        elif mode == "multimodal":
            return self._multimodal_query(query, top_k)

        # 视觉查询模式
        elif mode == "visual":
            return self._visual_query(query, top_k)

        else:
            return []

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
