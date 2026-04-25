# -*- coding: utf-8 -*-
"""
文档图构建器

This module builds a document graph from an Obsidian vault.
"""

from pathlib import Path
from typing import Dict, List, Any
import json
import re
from datetime import datetime


class DocumentGraphBuilder:
    """构建 Obsidian 文档图的类"""

    def __init__(self, vault_path: Path):
        """
        初始化文档图构建器

        Args:
            vault_path: Obsidian vault 的根目录路径
        """
        self.vault_path = vault_path
        self.documents = []

    def extract_doc_id(self, file_path: Path) -> str:
        """
        从文件路径提取文档 ID

        Args:
            file_path: 文件的绝对路径或相对路径

        Returns:
            文档 ID（相对路径，无 .md 扩展名）
        """
        # 如果是相对路径，直接使用；如果是绝对路径，转换为相对路径
        if file_path.is_absolute():
            relative_path = file_path.relative_to(self.vault_path)
        else:
            relative_path = file_path

        # 移除 .md 扩展名并统一使用正斜杠
        doc_id = str(relative_path).replace('.md', '').replace('\\', '/')
        return doc_id

    def extract_wikilinks(self, content: str) -> List[Dict[str, str]]:
        """
        从文本中提取 Wiki 链接

        Args:
            content: 要分析的文本内容

        Returns:
            Wiki 链接列表，每个链接包含 target 和可选的 alias
        """
        # 匹配 [[target]] 或 [[target|alias]]
        pattern = r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]'
        matches = re.findall(pattern, content)

        links = []
        for target, alias in matches:
            links.append({
                "target": target.strip(),
                "alias": alias.strip() if alias else None
            })

        return links

    def build(self):
        """
        构建文档图

        扫描 vault 中所有 markdown 文件并提取文档元数据
        """
        # 扫描所有 markdown 文件
        for md_file in self.vault_path.rglob('*.md'):
            doc = self.extract_document(md_file)
            if doc:
                self.documents.append(doc)

        return self.documents

    def extract_document(self, file_path: Path) -> Dict[str, Any]:
        """
        从单个文件提取文档元数据

        Args:
            file_path: markdown 文件路径

        Returns:
            包含文档元数据的字典
        """
        doc_id = self.extract_doc_id(file_path)

        # 读取文件内容
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            content = ""

        # 提取 Wiki 链接
        outbound_links = self.extract_wikilinks(content)

        return {
            "doc_id": doc_id,
            "type": self.map_path_to_type(file_path),
            "path": str(file_path.relative_to(self.vault_path)).replace('\\', '/'),
            "created_at": datetime.fromtimestamp(file_path.stat().st_ctime).isoformat(),
            "modified_at": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
            "outbound_links": outbound_links,
            "inbound_links": [],
            "entity_mentions": []
        }

    def map_path_to_type(self, file_path: Path) -> str:
        """
        根据路径映射文档类型

        Args:
            file_path: 文件路径

        Returns:
            文档类型字符串
        """
        # 获取相对路径字符串，统一使用正斜杠
        if file_path.is_absolute():
            path_str = str(file_path.relative_to(self.vault_path)).replace('\\', '/')
        else:
            path_str = str(file_path).replace('\\', '/')

        if path_str.startswith('references/contacts/'):
            return 'contact'
        elif path_str.startswith('references/clients/'):
            return 'client'
        elif path_str.startswith('references/team/'):
            return 'team'
        elif path_str.startswith('projects/'):
            return 'project'
        elif path_str.startswith('daily-status/'):
            return 'daily_status'
        else:
            return 'general'

    def save(self, output_path: Path):
        """
        保存文档图到 JSONL 文件

        Args:
            output_path: 输出文件路径
        """
        with open(output_path, 'w', encoding='utf-8') as f:
            for doc in self.documents:
                f.write(json.dumps(doc, ensure_ascii=False) + '\n')
