# -*- coding: utf-8 -*-
"""
向量存储管理器

This module provides vector storage management for semantic retrieval.
"""

from pathlib import Path
from typing import Dict, List
import pickle
from sentence_transformers import SentenceTransformer
import numpy as np


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
