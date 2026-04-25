# tests/test_graph_expander.py
import pytest
from scripts.graph_expander import GraphExpander

def test_expand_query():
    """测试查询扩展"""
    expander = GraphExpander()

    # 设置测试图谱
    expander.entity_graph = {
        "alice": {"relations": [{"to": "acme", "type": "works_at"}]},
        "acme": {"relations": [{"to": "project_alpha", "type": "has_project"}]},
        "project_alpha": {"relations": []}
    }

    expanded = expander.expand_query("alice", depth=2)
    assert "alice" in expanded
    assert "acme" in expanded  # 1-hop
    assert "project_alpha" in expanded  # 2-hop

def test_rank_entities():
    """测试实体排序"""
    expander = GraphExpander()
    entities = ["alice", "acme", "project_alpha"]
    query = "alice"

    ranked = expander.rank_by_relevance(entities, query)
    assert ranked[0] == "alice"  # 查询中的实体应该排第一
