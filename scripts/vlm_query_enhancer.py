# scripts/vlm_query_enhancer.py
from pathlib import Path
from typing import Dict, Any, List
import subprocess
import json
import numpy as np

class VLMQueryEnhancer:
    def __init__(self):
        self.zhipu_vision_skill_path = Path.home() / ".claude" / "skills" / "zhipu-vision"

    def enhance_query_with_image(self, query: str, image_path: str) -> Dict[str, Any]:
        """使用图像增强查询理解"""

        # 调用 zhipu-vision 分析图像
        cmd = [
            "python",
            str(self.zhipu_vision_skill_path / "scripts" / "vision.py"),
            "image", "analyze", image_path
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                cwd=str(self.zhipu_vision_skill_path)
            )

            if result.returncode == 0:
                image_analysis = json.loads(result.stdout)
            else:
                image_analysis = {"error": result.stderr}

        except Exception as e:
            image_analysis = {"error": str(e)}

        # 组合查询和图像分析
        enhanced_query = {
            "original_query": query,
            "image_path": image_path,
            "image_analysis": image_analysis,
            "enhanced_query_text": self._combine_query_and_image(query, image_analysis),
            "query_type": "visual" if image_analysis else "text"
        }

        return enhanced_query

    def _combine_query_and_image(self, query: str, image_analysis: Dict) -> str:
        """组合文本查询和图像分析"""

        if not image_analysis or "error" in image_analysis:
            return query

        description = image_analysis.get("description", "")
        tags = image_analysis.get("tags", [])

        # 构建增强查询
        enhanced_parts = [query]

        if description:
            enhanced_parts.append(f"Context from image: {description}")

        if tags:
            enhanced_parts.append(f"Visual elements: {', '.join(tags)}")

        return " | ".join(enhanced_parts)

    def answer_visual_question(self, image_path: str, question: str) -> Dict[str, Any]:
        """基于图像回答问题"""

        # 使用 zhipu-vision 的诊断功能
        cmd = [
            "python",
            str(self.zhipu_vision_skill_path / "scripts" / "vision.py"),
            "diagnose", image_path
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                cwd=str(self.zhipu_vision_skill_path),
                input=question  # 将问题作为输入
            )

            if result.returncode == 0:
                answer = result.stdout
            else:
                answer = f"Error: {result.stderr}"

        except Exception as e:
            answer = f"Error: {str(e)}"

        return {
            "question": question,
            "image_path": image_path,
            "answer": answer,
            "answer_type": "visual_qa"
        }

    def extract_visual_context(self, image_path: str) -> Dict[str, Any]:
        """从图像中提取视觉上下文"""

        context = {
            "objects": [],
            "text": [],
            "colors": [],
            "layout": None,
            "scene_type": None
        }

        # 调用图像分析
        cmd = [
            "python",
            str(self.zhipu_vision_skill_path / "scripts" / "vision.py"),
            "image", "analyze", image_path
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                cwd=str(self.zhipu_vision_skill_path)
            )

            if result.returncode == 0:
                analysis = json.loads(result.stdout)

                # 提取结构化信息
                description = analysis.get("description", "")

                # 简单的关键词提取（占位符）
                context["scene_type"] = self._classify_scene(description)
                context["objects"] = self._extract_objects(description)

        except Exception as e:
            context["error"] = str(e)

        return context

    def _classify_scene(self, description: str) -> str:
        """分类场景类型（简化版）"""

        description_lower = description.lower()

        # 按优先级检查
        if any(word in description_lower for word in ["chart", "graph", "plot", "diagram", "data"]):
            return "data_visualization"
        elif any(word in description_lower for word in ["text", "document", "code", "writing"]):
            return "document"
        elif any(word in description_lower for word in ["building", "house", "architecture"]):
            return "architecture"
        elif any(word in description_lower for word in ["person", "people", "face"]):
            return "portrait"
        elif any(word in description_lower for word in ["nature", "tree", "mountain", "sky", "outdoor"]):
            return "nature"
        else:
            return "general"

    def _extract_objects(self, description: str) -> List[str]:
        """提取对象（简化版）"""
        # 简化实现：返回一些常见对象
        # 实际应用中应该使用更复杂的 NLP 或目标检测
        common_objects = ["person", "car", "tree", "building", "table", "chair"]
        found = [obj for obj in common_objects if obj in description.lower()]
        return found[:5]  # 最多返回 5 个对象
