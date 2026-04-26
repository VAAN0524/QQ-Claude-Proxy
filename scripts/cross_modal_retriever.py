# scripts/cross_modal_retriever.py
from typing import List, Dict, Any
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

class CrossModalRetriever:
    def __init__(self):
        self.images = []
        self.texts = []
        self.tables = []

    def search(self, query, query_type="text", top_k=10):
        """跨模态检索"""

        if query_type == "text":
            return self._text_to_image_search(query, top_k)
        elif query_type == "image":
            return self._image_to_image_search(query, top_k)
        elif query_type == "multimodal":
            return self._multimodal_search(query, top_k)
        else:
            return []

    def _text_to_image_search(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        """文本查询图像"""

        if not self.images:
            return []

        # 编码查询文本
        query_vector = self._encode_text(query)

        results = []
        for image in self.images:
            # 计算语义向量相似度
            semantic_sim = cosine_similarity(
                [query_vector],
                [image["semantic_vector"]]
            )[0][0]

            # 计算 CLIP 向量相似度（如果有）
            if "clip_vector" in image:
                clip_sim = cosine_similarity(
                    [query_vector[:512]],  # CLIP 是 512 维
                    [image["clip_vector"]]
                )[0][0]
            else:
                clip_sim = 0

            # 综合分数
            final_score = 0.7 * semantic_sim + 0.3 * clip_sim

            results.append({
                "image": image,
                "score": final_score,
                "similarity_type": "text_to_image"
            })

        # 排序
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def _image_to_image_search(self, image_path: str, top_k: int) -> List[Dict[str, Any]]:
        """图像查询图像"""

        # 编码查询图像
        query_vector = self._encode_image(image_path)

        results = []
        for image in self.images:
            # 计算 CLIP 向量相似度
            if "clip_vector" not in image:
                continue

            similarity = cosine_similarity(
                [query_vector],
                [image["clip_vector"]]
            )[0][0]

            results.append({
                "image": image,
                "score": similarity,
                "similarity_type": "image_to_image"
            })

        # 排序
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def _multimodal_search(self, query: Dict[str, Any], top_k: int) -> List[Dict[str, Any]]:
        """多模态混合检索"""

        results = []

        # 文本查询图像
        if "text" in query:
            text_results = self._text_to_image_search(query["text"], top_k)
            results.extend(text_results)

        # 图像查询图像
        if "image" in query:
            image_results = self._image_to_image_search(query["image"], top_k)
            results.extend(image_results)

        # 表格查询
        if "table_query" in query:
            table_results = self._search_tables(query["table_query"], top_k)
            results.extend(table_results)

        # 去重和重新排序
        unique_results = self._deduplicate_results(results)
        unique_results.sort(key=lambda x: x["score"], reverse=True)

        return unique_results[:top_k]

    def _search_tables(self, table_query: str, top_k: int) -> List[Dict[str, Any]]:
        """搜索表格"""

        query_vector = self._encode_text(table_query)

        results = []
        for table in self.tables:
            # 简单的文本匹配（实际应用中应该更复杂）
            table_text = str(table["structured_data"])
            similarity = cosine_similarity(
                [query_vector],
                [self._encode_text(table_text)]
            )[0][0]

            results.append({
                "table": table,
                "score": similarity,
                "similarity_type": "text_to_table"
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def _deduplicate_results(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """去重结果"""

        seen = set()
        unique_results = []

        for result in results:
            # 生成唯一标识
            if "image" in result:
                key = ("image", result["image"]["image_id"])
            elif "table" in result:
                key = ("table", result["table"]["table_id"])
            else:
                continue

            if key not in seen:
                seen.add(key)
                unique_results.append(result)

        return unique_results

    def _encode_text(self, text: str) -> np.ndarray:
        """编码文本"""
        # TODO: 使用 sentence-transformers
        return np.random.rand(768)

    def _encode_image(self, image_path: str) -> np.ndarray:
        """编码图像"""
        # TODO: 使用 CLIP
        return np.random.rand(512)
