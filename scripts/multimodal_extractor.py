# scripts/multimodal_extractor.py
from pathlib import Path
from typing import Dict, Any
import subprocess
import json
import hashlib
import numpy as np
import pandas as pd
import io

class MultimodalExtractor:
    def __init__(self):
        self.zhipu_vision_skill_path = Path.home() / ".claude" / "skills" / "zhipu-vision"

    def extract_image(self, image_path: str, source_doc: str) -> Dict[str, Any]:
        """使用 zhipu-vision 提取图像内容"""

        # 调用 zhipu-vision skill
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
                vlm_analysis = json.loads(result.stdout)
            else:
                vlm_analysis = {"error": result.stderr}

        except subprocess.TimeoutExpired:
            vlm_analysis = {"error": "Timeout after 30 seconds"}
        except json.JSONDecodeError as e:
            vlm_analysis = {"error": f"Failed to parse JSON: {e}"}
        except Exception as e:
            vlm_analysis = {"error": str(e)}

        # 生成 CLIP 向量（占位符）
        clip_vector = self._encode_image_clip(image_path)

        # 生成语义向量（占位符）
        description = vlm_analysis.get("description", "")
        semantic_vector = self._encode_text(description)

        return {
            "image_id": self._generate_image_id(source_doc, image_path),
            "source_doc": source_doc,
            "image_path": image_path,
            "vlm_analysis": vlm_analysis,
            "clip_vector": clip_vector,
            "semantic_vector": semantic_vector
        }

    def extract_table(self, markdown_table: str, source_doc: str, position: dict) -> Dict[str, Any]:
        """解析 Markdown 表格"""

        # 解析 markdown 表格
        lines = markdown_table.strip().split('\n')
        lines = [line.strip() for line in lines if line.strip()]

        # 分隔符行
        separator_line = lines[1]
        columns = [col.strip() for col in lines[0].split('|') if col.strip()]
        rows = []

        # 解析数据行
        for line in lines[2:]:
            values = [val.strip() for val in line.split('|') if val.strip()]
            if values:
                row_dict = {}
                for i, col in enumerate(columns):
                    if i < len(values):
                        row_dict[col] = values[i]
                rows.append(row_dict)

        return {
            "table_id": self._generate_table_id(source_doc, position),
            "source_doc": source_doc,
            "table_position": position,
            "markdown_table": markdown_table,
            "structured_data": {
                "columns": columns,
                "rows": rows
            },
            "entity_mentions": []
        }

    def _generate_image_id(self, source_doc: str, image_path: str) -> str:
        """生成图像 ID"""
        key = f"{source_doc}:{image_path}"
        return hashlib.md5(key.encode()).hexdigest()

    def extract_formula(self, text: str, source_doc: str, metadata: dict) -> Dict[str, Any]:
        """解析 LaTeX 公式"""

        import re

        # 提取行内公式 $...$
        inline_patterns = re.findall(r'\$([^$]+)\$', text)
        inline_formulas = []

        for formula in inline_patterns:
            inline_formulas.append({
                "latex": formula,
                "type": "inline"
            })

        # 提取块级公式 $$...$$ 或 \[...\]
        block_patterns = re.findall(r'\$\$([^$]+)\$\$', text, re.DOTALL)
        block_patterns.extend(re.findall(r'\\\[([^\\]+)\\\]', text, re.DOTALL))

        block_formulas = []
        for formula in block_patterns:
            block_formulas.append({
                "latex": formula.strip(),
                "type": "block"
            })

        # 根据类型返回
        formula_type = metadata.get("type", "inline")

        if formula_type == "inline" and inline_formulas:
            formula_data = inline_formulas[0]
        elif formula_type == "block" and block_formulas:
            formula_data = block_formulas[0]
        elif inline_formulas:
            formula_data = inline_formulas[0]
            formula_type = "inline"
        elif block_formulas:
            formula_data = block_formulas[0]
            formula_type = "block"
        else:
            return {"error": "No formula found"}

        return {
            "formula_id": self._generate_formula_id(source_doc, metadata),
            "source_doc": source_doc,
            "formula_type": formula_type,
            "latex": formula_data["latex"],
            "metadata": metadata,
            # 简化的语义表示
            "semantic_representation": self._parse_formula_semantics(formula_data["latex"])
        }

    def _generate_formula_id(self, source_doc: str, metadata: dict) -> str:
        """生成公式 ID"""
        position = metadata.get("position", 0)
        key = f"{source_doc}:formula:{position}"
        return hashlib.md5(key.encode()).hexdigest()

    def _generate_table_id(self, source_doc: str, position: dict) -> str:
        """生成表格 ID"""
        key = f"{source_doc}:{position['line']}"
        return hashlib.md5(key.encode()).hexdigest()

    def _parse_formula_semantics(self, latex: str) -> Dict[str, Any]:
        """解析公式的语义表示（简化版）"""
        semantics = {
            "variables": [],
            "operators": [],
            "functions": [],
            "type": "unknown"
        }

        # 识别变量（单个字母）
        import re
        variables = re.findall(r'\b[a-zA-Z]\b', latex)
        semantics["variables"] = list(set(variables))

        # 识别运算符
        operators = re.findall(r'[+\-*/=^_\{\}]', latex)
        semantics["operators"] = list(set(operators))

        # 识别函数（\命令）
        functions = re.findall(r'\\([a-zA-Z]+)', latex)
        semantics["functions"] = list(set(functions))

        # 简单分类
        if r"\int" in latex:
            semantics["type"] = "integral"
        elif r"\sum" in latex:
            semantics["type"] = "summation"
        elif r"\frac" in latex:
            semantics["type"] = "fraction"
        elif "=" in latex and not semantics["functions"]:
            semantics["type"] = "equation"

        return semantics

    def _encode_image_clip(self, image_path: str):
        """使用 CLIP 编码图像"""
        # TODO: 集成 CLIP 模型
        # Phase 2 占位符：返回随机向量
        return np.random.rand(512)  # CLIP 使用 512 维

    def _encode_text(self, text: str):
        """编码文本为向量"""
        # TODO: 使用 sentence-transformers
        # Phase 2 占位符：返回随机向量
        return np.random.rand(768)
