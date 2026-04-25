# tests/test_integration.py
import pytest
import tempfile
from pathlib import Path
from scripts.sync import ObsidianOntologySync

def test_full_sync_workflow(tmp_path):
    """测试完整的同步工作流"""
    # 创建测试 vault
    vault_path = tmp_path / "vault"
    vault_path.mkdir()

    # 创建测试文件
    contacts_dir = vault_path / "references" / "contacts"
    contacts_dir.mkdir(parents=True)
    (contacts_dir / "Alice.md").write_text("# Alice Johnson\n\nAssigned to [[Project Alpha]].")

    # 执行同步
    config = {
        'obsidian': {
            'vault_path': str(vault_path),
            'sources': {
                'contacts': {
                    'path': 'references/contacts',
                    'entity_type': 'Person'
                }
            }
        },
        'ontology': {
            'storage_path': str(tmp_path / "ontology"),
            'format': 'jsonl'
        }
    }

    sync = ObsidianOntologySync(config)
    sync.extract()

    # 验证输出
    assert (tmp_path / "ontology" / "graph.jsonl").exists()
    assert (tmp_path / "ontology" / "doc_graph.jsonl").exists()
