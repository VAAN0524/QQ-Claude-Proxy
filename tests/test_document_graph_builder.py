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


def test_extract_wikilinks():
    """测试 Wiki 链接提取"""
    builder = DocumentGraphBuilder(Path("/test"))
    content = "See [[Project Alpha]] for details and [[Bob]] for contact"
    links = builder.extract_wikilinks(content)
    assert len(links) == 2
    assert links[0]["target"] == "Project Alpha"
    assert links[1]["target"] == "Bob"


def test_extract_wikilinks_with_alias():
    """测试带别名的 Wiki 链接"""
    builder = DocumentGraphBuilder(Path("/test"))
    content = "Click [[Project Alpha|here]] for info"
    links = builder.extract_wikilinks(content)
    assert len(links) == 1
    assert links[0]["target"] == "Project Alpha"
    assert links[0]["alias"] == "here"
