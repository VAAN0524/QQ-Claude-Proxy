# -*- coding: utf-8 -*-
"""
向量存储管理器

This module provides vector storage management for semantic retrieval.
"""

from pathlib import Path
from typing import Dict, List, Tuple
import pickle
from sentence_transformers import SentenceTransformer
import numpy as np
import faiss


class VectorStoreManager:
    def __init__(self, model_name: str = 'paraphrase-multilingual-mpnet-base-v2'):
        self.model_name = model_name
        self.model = None  # 延迟加载
        self.vectors = {
            "doc_vectors": {},
            "entity_vectors": {},
            "paragraph_vectors": {},
            "metadata": {
                "model": model_name,
                "dimension": 768,
                "last_updated": None
            }
        }
        # FAISS 索引（懒加载）
        self._doc_index = None
        self._entity_index = None
        self._paragraph_index = None
        self._index_ids = {
            "doc_ids": [],
            "entity_ids": [],
            "paragraph_ids": []
        }

    def _load_model(self):
        """延迟加载模型"""
        if self.model is None:
            self.model = SentenceTransformer(self.model_name)

    def encode_texts(self, texts: List[str]) -> np.ndarray:
        """编码文本列表为向量"""
        self._load_model()
        return self.model.encode(texts, convert_to_numpy=True)

    def encode_text(self, text: str) -> np.ndarray:
        """编码单个文本为向量"""
        return self.encode_texts([text])[0]

    def add_doc_vector(self, doc_id: str, text: str):
        """添加文档向量"""
        vector = self.encode_text(text)
        self.vectors["doc_vectors"][doc_id] = vector

    def add_entity_vector(self, entity_id: str, text: str):
        """添加实体向量"""
        vector = self.encode_text(text)
        self.vectors["entity_vectors"][entity_id] = vector

    def add_paragraph_vector(self, key: str, text: str):
        """添加段落向量"""
        vector = self.encode_text(text)
        self.vectors["paragraph_vectors"][key] = vector

    def save_vectors(self, output_path: Path):
        """保存向量到文件"""
        with open(output_path, 'wb') as f:
            pickle.dump(self.vectors, f)

    def load_vectors(self, input_path: Path):
        """从文件加载向量"""
        with open(input_path, 'rb') as f:
            self.vectors = pickle.load(f)

    # ==================== FAISS 索引方法 ====================

    def _build_index(self, vectors: Dict[str, np.ndarray], ids: List[str], dimension: int) -> faiss.Index:
        """构建 FAISS 索引"""
        if not vectors:
            return None

        # 准备向量矩阵
        vector_matrix = np.array(list(vectors.values())).astype('float32')

        # 归一化向量（用于内积相似度）
        faiss.normalize_L2(vector_matrix)

        # 创建索引（使用 Inner Product (IP) for cosine similarity）
        index = faiss.IndexFlatIP(dimension)

        # 添加向量到索引
        index.add(vector_matrix)

        return index

    def build_doc_index(self):
        """构建文档向量索引"""
        self._doc_index = self._build_index(
            self.vectors["doc_vectors"],
            list(self.vectors["doc_vectors"].keys()),
            self.vectors["metadata"]["dimension"]
        )
        self._index_ids["doc_ids"] = list(self.vectors["doc_vectors"].keys())

    def build_entity_index(self):
        """构建实体向量索引"""
        self._entity_index = self._build_index(
            self.vectors["entity_vectors"],
            list(self.vectors["entity_vectors"].keys()),
            self.vectors["metadata"]["dimension"]
        )
        self._index_ids["entity_ids"] = list(self.vectors["entity_vectors"].keys())

    def build_paragraph_index(self):
        """构建段落向量索引"""
        self._paragraph_index = self._build_index(
            self.vectors["paragraph_vectors"],
            list(self.vectors["paragraph_vectors"].keys()),
            self.vectors["metadata"]["dimension"]
        )
        self._index_ids["paragraph_ids"] = list(self.vectors["paragraph_vectors"].keys())

    def search_docs(self, query: str, top_k: int = 10) -> List[Tuple[str, float]]:
        """使用 FAISS 搜索文档"""
        if self._doc_index is None:
            self.build_doc_index()

        if self._doc_index is None:
            return []

        # 编码查询
        query_vector = self.encode_text(query).astype('float32').reshape(1, -1)

        # 归一化查询向量
        faiss.normalize_L2(query_vector)

        # 搜索
        scores, indices = self._doc_index.search(query_vector, top_k)

        # 转换结果
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < len(self._index_ids["doc_ids"]):
                doc_id = self._index_ids["doc_ids"][idx]
                results.append((doc_id, float(score)))

        return results

    def search_entities(self, query: str, top_k: int = 10) -> List[Tuple[str, float]]:
        """使用 FAISS 搜索实体"""
        if self._entity_index is None:
            self.build_entity_index()

        if self._entity_index is None:
            return []

        # 编码查询
        query_vector = self.encode_text(query).astype('float32').reshape(1, -1)

        # 归一化查询向量
        faiss.normalize_L2(query_vector)

        # 搜索
        scores, indices = self._entity_index.search(query_vector, top_k)

        # 转换结果
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < len(self._index_ids["entity_ids"]):
                entity_id = self._index_ids["entity_ids"][idx]
                results.append((entity_id, float(score)))

        return results

    def search_paragraphs(self, query: str, top_k: int = 10) -> List[Tuple[str, float]]:
        """使用 FAISS 搜索段落"""
        if self._paragraph_index is None:
            self.build_paragraph_index()

        if self._paragraph_index is None:
            return []

        # 编码查询
        query_vector = self.encode_text(query).astype('float32').reshape(1, -1)

        # 归一化查询向量
        faiss.normalize_L2(query_vector)

        # 搜索
        scores, indices = self._paragraph_index.search(query_vector, top_k)

        # 转换结果
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < len(self._index_ids["paragraph_ids"]):
                paragraph_id = self._index_ids["paragraph_ids"][idx]
                results.append((paragraph_id, float(score)))

        return results
