# tests/test_cross_modal_retriever.py
import pytest
import numpy as np
from scripts.cross_modal_retriever import CrossModalRetriever

def test_text_to_image_search():
    """测试文本查询图像"""
    retriever = CrossModalRetriever()

    # 设置测试数据
    retriever.images = [
        {
            "image_id": "img1",
            "semantic_vector": np.random.rand(768),
            "clip_vector": np.random.rand(512)
        },
        {
            "image_id": "img2",
            "semantic_vector": np.random.rand(768),
            "clip_vector": np.random.rand(512)
        }
    ]

    results = retriever.search("test query", query_type="text")
    assert len(results) > 0
    assert all("score" in r for r in results)
    assert all("image" in r for r in results)

def test_multimodal_search():
    """测试多模态混合检索"""
    retriever = CrossModalRetriever()

    # 设置测试数据
    retriever.images = [
        {
            "image_id": "img1",
            "semantic_vector": np.random.rand(768),
            "clip_vector": np.random.rand(512)
        }
    ]

    retriever.tables = [
        {
            "table_id": "table1",
            "structured_data": {"columns": ["A", "B"], "rows": [{"A": 1, "B": 2}]}
        }
    ]

    query = {
        "text": "test query",
        "table_query": "data"
    }

    results = retriever.search(query, query_type="multimodal")
    assert len(results) > 0
