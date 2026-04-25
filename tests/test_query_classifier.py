# tests/test_query_classifier.py
import pytest
from scripts.query_classifier import QueryClassifier

def test_classify_factual_query():
    """测试事实性查询分类"""
    classifier = QueryClassifier()
    classifier.load_entity_names(["Alice Johnson", "Bob Smith"])

    query_type = classifier.classify("Find Alice Johnson")
    assert query_type == "factual"

def test_classify_relational_query():
    """测试关系性查询分类"""
    classifier = QueryClassifier()

    query_type = classifier.classify("Who works at Acme Corp")
    assert query_type == "relational"

def test_classify_semantic_query():
    """测试语义性查询分类"""
    classifier = QueryClassifier()

    query_type = classifier.classify("What are the best practices for team management")
    assert query_type == "semantic"
