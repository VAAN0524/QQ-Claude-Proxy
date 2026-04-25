# -*- coding: utf-8 -*-
"""
测试文档图构建器

This module tests the DocumentGraphBuilder class.
"""

import pytest
from pathlib import Path
from scripts.document_graph_builder import DocumentGraphBuilder


def test_extract_doc_id_from_contact(tmp_path):
    """测试从联系人文件提取文档 ID"""
    # 使用 tmp_path fixture 创建临时目录
    vault_path = tmp_path
    builder = DocumentGraphBuilder(vault_path)
    path = Path("references/contacts/Alice.md")
    doc_id = builder.extract_doc_id(path)
    assert doc_id == "references/contacts/Alice"


def test_extract_doc_id_from_project(tmp_path):
    """测试从项目文件提取文档 ID"""
    vault_path = tmp_path
    builder = DocumentGraphBuilder(vault_path)
    path = Path("projects/Project Alpha.md")
    doc_id = builder.extract_doc_id(path)
    assert doc_id == "projects/Project Alpha"
