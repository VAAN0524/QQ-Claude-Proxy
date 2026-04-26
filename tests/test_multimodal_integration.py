# tests/test_multimodal_integration.py
import pytest
import tempfile
from pathlib import Path
from scripts.sync import ObsidianOntologySync

def test_multimodal_extraction_in_sync(tmp_path):
    """测试同步脚本中的多模态提取"""
    # 创建测试 vault
    vault_path = tmp_path / "vault"
    vault_path.mkdir()

    # 创建包含图像和表格的测试文件
    test_file = vault_path / "test.md"
    test_file.write_text("""# Test Document

This is a test image:
![test.png](test.png)

This is a test table:

| Name | Role |
|------|------|
| Alice | Dev |
| Bob   | PM |
""")

    # 创建一个假的图像文件
    (vault_path / "test.png").write_bytes(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)

    # 执行同步
    config = {
        'obsidian': {
            'vault_path': str(vault_path),
            'sources': {}
        },
        'ontology': {
            'storage_path': str(tmp_path / "ontology"),
            'format': 'jsonl'
        }
    }

    sync = ObsidianOntologySync(config)
    sync.extract()

    # 验证多模态文件已创建
    assert (tmp_path / "ontology" / "multimodal.jsonl").exists()
