# tests/test_vlm_query_enhancer.py
import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
from scripts.vlm_query_enhancer import VLMQueryEnhancer

def test_enhance_query_with_image():
    """测试使用图像增强查询"""
    enhancer = VLMQueryEnhancer()

    # 创建测试图像文件
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = Path(tmp.name)
        tmp_path.write_bytes(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)

    try:
        # Mock subprocess.run
        with patch('scripts.vlm_query_enhancer.subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout='{"description": "A chart showing sales data", "tags": ["chart", "data"]}'
            )

            result = enhancer.enhance_query_with_image("What are the sales figures?", str(tmp_path))

            assert result["original_query"] == "What are the sales figures?"
            assert result["query_type"] == "visual"
            assert "sales data" in result["enhanced_query_text"]
    finally:
        tmp_path.unlink()

def test_extract_visual_context():
    """测试提取视觉上下文"""
    enhancer = VLMQueryEnhancer()

    # 创建测试图像文件
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = Path(tmp.name)
        tmp_path.write_bytes(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)

    try:
        # Mock subprocess.run
        with patch('scripts.vlm_query_enhancer.subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout='{"description": "A person standing in front of a building"}'
            )

            result = enhancer.extract_visual_context(str(tmp_path))

            assert result["scene_type"] == "architecture"
            assert "person" in result["objects"]
    finally:
        tmp_path.unlink()
