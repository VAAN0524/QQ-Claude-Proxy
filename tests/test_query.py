# tests/test_query.py
import pytest
import tempfile
from pathlib import Path
from scripts.query import QueryEngine

def test_query_execution():
    """测试查询执行"""
    with tempfile.TemporaryDirectory() as tmpdir:
        # 设置测试数据
        engine = QueryEngine(tmpdir)
        engine.setup_test_data()

        results = engine.query("Alice Johnson")
        assert len(results) > 0
        assert results[0]["score"] > 0
