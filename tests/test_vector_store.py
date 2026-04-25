# -*- coding: utf-8 -*-
"""
测试向量存储管理器

This module tests the VectorStoreManager class.
"""

import pytest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch
import numpy as np
from scripts.vector_store import VectorStoreManager


def test_vector_store_initialization():
    """测试向量存储管理器初始化"""
    manager = VectorStoreManager()
    assert manager.model is None  # 模型应该延迟加载
    assert manager.model_name == 'paraphrase-multilingual-mpnet-base-v2'
    assert "doc_vectors" in manager.vectors
    assert "entity_vectors" in manager.vectors
    assert "paragraph_vectors" in manager.vectors
    assert "metadata" in manager.vectors


def test_add_doc_vector():
    """测试添加文档向量（使用 mock 避免下载模型）"""
    with patch.object(VectorStoreManager, '_load_model'):
        manager = VectorStoreManager()
        # Mock 模型
        mock_model = Mock()
        mock_model.encode.return_value = np.array([[0.1, 0.2, 0.3]])
        manager.model = mock_model

        manager.add_doc_vector("doc1", "test content")

        assert "doc1" in manager.vectors["doc_vectors"]
        assert manager.vectors["doc_vectors"]["doc1"].shape == (3,)


def test_add_entity_vector():
    """测试添加实体向量"""
    with patch.object(VectorStoreManager, '_load_model'):
        manager = VectorStoreManager()
        mock_model = Mock()
        mock_model.encode.return_value = np.array([[0.4, 0.5, 0.6]])
        manager.model = mock_model

        manager.add_entity_vector("entity1", "entity content")

        assert "entity1" in manager.vectors["entity_vectors"]


def test_add_paragraph_vector():
    """测试添加段落向量"""
    with patch.object(VectorStoreManager, '_load_model'):
        manager = VectorStoreManager()
        mock_model = Mock()
        mock_model.encode.return_value = np.array([[0.7, 0.8, 0.9]])
        manager.model = mock_model

        manager.add_paragraph_vector("para1", "paragraph content")

        assert "para1" in manager.vectors["paragraph_vectors"]


def test_save_and_load_vectors():
    """测试向量保存和加载"""
    with tempfile.TemporaryDirectory() as tmpdir:
        manager = VectorStoreManager()
        vectors_path = Path(tmpdir) / "vectors.pkl"

        # 保存向量
        manager.save_vectors(vectors_path)

        # 加载向量
        new_manager = VectorStoreManager()
        new_manager.load_vectors(vectors_path)

        assert new_manager.vectors.keys() == manager.vectors.keys()
        assert new_manager.vectors["metadata"]["model"] == manager.vectors["metadata"]["model"]


def test_encode_texts():
    """测试文本批量编码（使用 mock）"""
    with patch.object(VectorStoreManager, '_load_model'):
        manager = VectorStoreManager()
        mock_model = Mock()
        mock_model.encode.return_value = np.array([[0.1, 0.2], [0.3, 0.4]])
        manager.model = mock_model

        vectors = manager.encode_texts(["text1", "text2"])

        assert vectors.shape == (2, 2)
        mock_model.encode.assert_called_once()


def test_encode_text():
    """测试单个文本编码（使用 mock）"""
    with patch.object(VectorStoreManager, '_load_model'):
        manager = VectorStoreManager()
        mock_model = Mock()
        mock_model.encode.return_value = np.array([[0.1, 0.2, 0.3]])
        manager.model = mock_model

        vector = manager.encode_text("test")

        assert vector.shape == (3,)
        mock_model.encode.assert_called_once_with(["test"], convert_to_numpy=True)

