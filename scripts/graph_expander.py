# scripts/graph_expander.py
from typing import List, Dict, Set

class GraphExpander:
    def __init__(self):
        self.entity_graph: Dict = {}

    def expand_query(self, query: str, depth: int = 2) -> List[str]:
        """扩展查询，返回相关实体列表"""
        # 提取查询中的实体（简化版：假设查询本身就是实体 ID）
        query_entities = [query]

        # 图谱遍历
        expanded_entities: Set[str] = set(query_entities)

        for entity in query_entities:
            if entity in self.entity_graph:
                # 1-hop 邻居
                neighbors_1 = self._get_neighbors(entity, depth=1)
                expanded_entities.update(neighbors_1)

                # 2-hop 邻居
                for neighbor in neighbors_1:
                    if neighbor in self.entity_graph:
                        neighbors_2 = self._get_neighbors(neighbor, depth=1)
                        expanded_entities.update(neighbors_2)

        return list(expanded_entities)

    def _get_neighbors(self, entity: str, depth: int) -> List[str]:
        """获取实体的邻居"""
        if entity not in self.entity_graph:
            return []

        neighbors = []
        for rel in self.entity_graph[entity].get("relations", []):
            neighbors.append(rel["to"])

        return neighbors

    def rank_by_relevance(self, entities: List[str], query: str) -> List[str]:
        """根据相关性排序实体"""
        scores = []
        for entity in entities:
            score = 0.0

            # 直接提及
            if entity == query:
                score += 1.0

            # 1-hop 关系
            if entity in self._get_neighbors(query, 1):
                score += 0.5

            # 2-hop 关系
            if entity in self._get_neighbors(query, 2):
                score += 0.2

            scores.append((entity, score))

        # 排序
        scores.sort(key=lambda x: x[1], reverse=True)
        return [entity for entity, score in scores]
