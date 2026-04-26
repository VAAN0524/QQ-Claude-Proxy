# scripts/cross_modal_retriever.py
from typing import List, Dict, Any
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

class CrossModalRetriever:
    def __init__(self):
        self.images = []
        self.texts = []
        self.tables = []
        # CLIP 模型缓存
        self._clip_model = None
        self._clip_preprocess = None

    def _load_clip_model(self):
        """懒加载 CLIP 模型"""
        if self._clip_model is None:
            import clip
            import torch
            self._clip_model, self._clip_preprocess = clip.load("ViT-B/32", device="cpu")

    def _encode_text_clip(self, text: str) -> np.ndarray:
        """使用 CLIP 编码文本"""
        try:
            import clip
            import torch

            self._load_clip_model()

            # 使用 CLIP 的文本编码器
            text_tokens = clip.tokenize([text]).to("cpu")
            with torch.no_grad():
                text_features = self._clip_model.encode_text(text_tokens)

            # 归一化
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            return text_features.cpu().numpy().flatten()

        except Exception as e:
            import warnings
            warnings.warn(f"CLIP text encoding failed: {e}, falling back to sentence-transformers")
            # 降级：使用 sentence-transformers
            from sentence_transformers import SentenceTransformer
            model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
            return model.encode(text, convert_to_numpy=True)

    def _encode_image_clip(self, image_path: str) -> np.ndarray:
        """使用 CLIP 编码图像"""
        try:
            import clip
            import torch
            from PIL import Image

            self._load_clip_model()

            image = Image.open(image_path).convert("RGB")
            image_input = self._clip_preprocess(image).unsqueeze(0).to("cpu")

            with torch.no_grad():
                image_features = self._clip_model.encode_image(image_input)

            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            return image_features.cpu().numpy().flatten()

        except Exception as e:
            import warnings
            warnings.warn(f"CLIP image encoding failed: {e}, returning zero vector")
            return np.zeros(512)

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

        # 使用 CLIP 文本编码器（与图像在同一空间）
        query_clip_vector = self._encode_text_clip(query)

        results = []
        for image in self.images:
            # 计算 CLIP 向量相似度（同一空间，直接比较）
            if "clip_vector" in image:
                clip_sim = cosine_similarity(
                    [query_clip_vector],
                    [image["clip_vector"]]
                )[0][0]
            else:
                clip_sim = 0

            # 可选：计算语义向量相似度作为补充
            # 但由于 CLIP 已经包含了语义信息，可以降低其权重或省略
            if "semantic_vector" in image and clip_sim < 0.3:  # 只在 CLIP 分数低时使用语义补充
                query_semantic_vector = self._encode_text(query)
                semantic_sim = cosine_similarity(
                    [query_semantic_vector],
                    [image["semantic_vector"]]
                )[0][0]
                # 混合分数
                final_score = 0.3 * semantic_sim + 0.7 * clip_sim
            else:
                final_score = clip_sim

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

        # 使用 CLIP 编码查询图像
        query_vector = self._encode_image_clip(image_path)

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
        """编码文本（使用 sentence-transformers）"""
        try:
            from sentence_transformers import SentenceTransformer
            model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
            return model.encode(text, convert_to_numpy=True)
        except Exception as e:
            import warnings
            warnings.warn(f"sentence-transformers encoding failed: {e}, using random vector")
            return np.random.rand(768)

    def _encode_image(self, image_path: str) -> np.ndarray:
        """编码图像（使用 CLIP）"""
        # 直接使用已优化的 CLIP 编码器
        return self._encode_image_clip(image_path)
