# tests/test_multimodal_query.py
import pytest
import tempfile
import numpy as np
from pathlib import Path
from scripts.query import QueryEngine

def test_multimodal_query_interface():
    """测试多模态查询接口"""
    with tempfile.TemporaryDirectory() as tmpdir:
        engine = QueryEngine(tmpdir)
        engine.setup_test_data()

        # 测试文本查询
        text_results = engine.query("Alice Johnson", mode="text")
        assert len(text_results) > 0

        # 测试多模态查询
        multimodal_query = {
            "text": "test query",
            "table_query": "data"
        }
        multimodal_results = engine.query(multimodal_query, mode="multimodal")
        assert isinstance(multimodal_results, list)

def test_visual_query_with_image():
    """测试带图像的视觉查询"""
    with tempfile.TemporaryDirectory() as tmpdir:
        engine = QueryEngine(tmpdir)
        engine.setup_test_data()

        # 创建测试图像文件
        test_image = Path(tmpdir) / "test.png"
        test_image.write_bytes(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)

        # 视觉查询（需要 mock，这里只测试接口）
        from unittest.mock import patch, MagicMock

        with patch('scripts.query.VLMQueryEnhancer.enhance_query_with_image') as mock_enhance:
            mock_enhance.return_value = {
                "original_query": "What is this?",
                "enhanced_query_text": "What is this? | Context: test image",
                "image_analysis": {"description": "test image"}
            }

            visual_query = {
                "text": "What is this?",
                "image": str(test_image)
            }

            results = engine.query(visual_query, mode="visual")
            assert isinstance(results, list)
