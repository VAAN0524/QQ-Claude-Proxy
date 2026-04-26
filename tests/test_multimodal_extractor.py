# tests/test_multimodal_extractor.py
import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
from scripts.multimodal_extractor import MultimodalExtractor

def test_extract_image_content():
    """测试图像内容提取"""
    extractor = MultimodalExtractor()

    # 创建测试图像文件
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = Path(tmp.name)
        # 写入一些假数据（PNG 文件头）
        tmp_path.write_bytes(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)

    try:
        # Mock subprocess.run 以避免实际调用 zhipu-vision
        with patch('scripts.multimodal_extractor.subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout='{"description": "A test image", "tags": ["test"]}'
            )

            result = extractor.extract_image(str(tmp_path), "test_doc")

            assert result is not None
            assert "vlm_analysis" in result
            assert "clip_vector" in result
            assert result["source_doc"] == "test_doc"
    finally:
        # 清理临时文件
        tmp_path.unlink()

def test_extract_table():
    """测试表格解析"""
    extractor = MultimodalExtractor()

    markdown_table = """| Name | Role |
|------|------|
| Alice | Dev |"""

    result = extractor.extract_table(markdown_table, "test_doc", {"line": 10})
    assert result["structured_data"]["columns"] == ["Name", "Role"]
    assert len(result["structured_data"]["rows"]) == 1
