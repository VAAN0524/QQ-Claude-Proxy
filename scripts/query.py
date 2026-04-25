# scripts/query.py
from pathlib import Path
from typing import Dict, Any, List
from scripts.query_classifier import QueryClassifier
from scripts.graph_expander import GraphExpander
from scripts.multi_granularity_matcher import MultiGranularityMatcher

class QueryEngine:
    def __init__(self, ontology_path: str):
        self.ontology_path = Path(ontology_path)
        self.classifier = QueryClassifier()
        self.expander = GraphExpander()
        self.matcher = MultiGranularityMatcher()

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

    def query(self, query: str, top_k: int = 10):
        """执行查询"""
        # 1. 分类查询
        query_type = self.classifier.classify(query)

        # 2. 图谱扩展（如果是事实性查询）
        if query_type == "factual":
            # TODO: 提取实体并扩展
            pass

        # 3. 多粒度匹配
        results = self.matcher.search(query, top_k)

        return results

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
