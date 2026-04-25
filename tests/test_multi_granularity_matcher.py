# tests/test_multi_granularity_matcher.py
import pytest
import numpy as np
from scripts.multi_granularity_matcher import MultiGranularityMatcher

def test_multi_granularity_search():
    """测试多粒度搜索"""
    matcher = MultiGranularityMatcher()

    # 设置测试数据
    matcher.document_graph = [
        {
            "doc_id": "doc1",
            "title": "Test Document"
        }
    ]
    matcher.vectors = {
        "doc_vectors": {
            "doc1": np.random.rand(768)
        },
        "paragraph_vectors": {
            "doc1:para_0": np.random.rand(768),
            "doc1:para_1": np.random.rand(768)
        }
    }

    results = matcher.search("test query", top_k=1)
    assert len(results) == 1
    assert "score" in results[0]
    assert "match_level" in results[0]
