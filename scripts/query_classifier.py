# scripts/query_classifier.py
from typing import Set

class QueryClassifier:
    def __init__(self):
        self.entity_names: Set[str] = set()
        self.relation_keywords = [
            "works at", "assigned to", "reports to",
            "part of", "member of", "belongs to",
            "connected to", "related to"
        ]

    def load_entity_names(self, entity_names: list):
        """加载已知实体名称"""
        self.entity_names = set(entity_names)

    def classify(self, query: str) -> str:
        """分类查询为 factual / semantic / relational"""
        query_lower = query.lower()

        # 1. 检查是否为关系性查询
        if self._contains_relation_words(query_lower):
            return "relational"

        # 2. 检查是否为事实性查询（包含实体名称）
        if self._contains_entity_names(query_lower):
            return "factual"

        # 3. 默认为语义性查询
        return "semantic"

    def _contains_entity_names(self, query: str) -> bool:
        """检查查询是否包含已知实体名称"""
        for entity in self.entity_names:
            if entity.lower() in query:
                return True
        return False

    def _contains_relation_words(self, query: str) -> bool:
        """检查查询是否包含关系词"""
        for keyword in self.relation_keywords:
            if keyword in query:
                return True
        return False
