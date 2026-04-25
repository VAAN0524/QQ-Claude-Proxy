# scripts/multi_granularity_matcher.py
from typing import List, Dict, Any
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

class MultiGranularityMatcher:
    def __init__(self):
        self.document_graph = []
        self.vectors = {}

    def search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """执行多粒度搜索"""
        if not self.vectors.get("doc_vectors"):
            return []

        # 编码查询
        query_vector = self._encode_query(query)

        results = []

        for doc in self.document_graph:
            doc_id = doc["doc_id"]

            if doc_id not in self.vectors["doc_vectors"]:
                continue

            # 1. 文档级匹配
            doc_vector = self.vectors["doc_vectors"][doc_id]
            doc_score = cosine_similarity([query_vector], [doc_vector])[0][0]

            # 2. 段落级匹配
            para_scores = []
            for key, vector in self.vectors["paragraph_vectors"].items():
                if key.startswith(f"{doc_id}:para_"):
                    para_score = cosine_similarity([query_vector], [vector])[0][0]
                    para_scores.append(para_score)

            best_para_score = max(para_scores) if para_scores else 0

            # 3. 综合分数
            final_score = (
                0.3 * doc_score +
                0.5 * best_para_score
            )

            results.append({
                "doc": doc,
                "score": final_score,
                "match_level": "paragraph" if best_para_score > doc_score else "document"
            })

        # 排序
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def _encode_query(self, query: str) -> np.ndarray:
        """编码查询（简化版：随机向量）"""
        # TODO: 集成实际的向量编码
        return np.random.rand(768)
