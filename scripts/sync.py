# scripts/sync.py
from pathlib import Path
from typing import Optional, Dict, Any
from scripts.document_graph_builder import DocumentGraphBuilder
from scripts.vector_store import VectorStoreManager
from scripts.multimodal_extractor import MultimodalExtractor

class ObsidianOntologySync:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config if config else {}
        self.vault_path = Path(self.config['obsidian']['vault_path'])
        self.ontology_path = Path(self.config['ontology']['storage_path'])
        self.ontology_path.mkdir(parents=True, exist_ok=True)

        self.graph_file = self.ontology_path / 'graph.jsonl'
        self.doc_graph_file = self.ontology_path / 'doc_graph.jsonl'
        self.multimodal_file = self.ontology_path / 'multimodal.jsonl'

        self.entities = {}
        self.relations = []
        self.multimodal_results = []

        # 新增组件
        self.doc_graph_builder = DocumentGraphBuilder(self.vault_path)
        self.vector_store = VectorStoreManager()
        self.multimodal_extractor = MultimodalExtractor()

    def extract(self, dry_run=False, verbose=False):
        """提取实体、文档图和多模态内容"""
        print(f"🔍 Extracting entities from {self.vault_path}")

        # 1. 提取文档图
        print("\n📂 Building document graph...")
        self.doc_graph_builder.build()
        self.doc_graph_builder.save(self.doc_graph_file)
        print(f"  ✓ Saved {len(self.doc_graph_builder.documents)} documents")

        # 2. 原有的实体提取逻辑
        sources = self.config.get('obsidian', {}).get('sources', {})
        for source_name, source_config in sources.items():
            source_path = self.vault_path / source_config['path']
            if not source_path.exists():
                continue

            print(f"\n📂 Processing {source_name}")
            md_files = list(source_path.rglob('*.md'))
            print(f"  Found {len(md_files)} files")

            for md_file in md_files:
                try:
                    self.extract_from_file(md_file, source_config, verbose)
                except Exception as e:
                    if verbose:
                        print(f"  ❌ Error in {md_file.name}: {e}")

        # 3. 保存实体图
        self.save_graph()

        # 4. 生成向量
        print("\n📊 Generating vectors...")
        self._generate_vectors()
        print("  ✓ Vectors generated")

        # 5. 提取多模态内容
        print("\n🖼️  Extracting multimodal content...")
        self._extract_multimodal_content()
        print("  ✓ Multimodal content extracted")

    def extract_from_file(self, md_file: Path, source_config: Dict, verbose: bool):
        """从单个文件提取实体"""
        # 简化版：占位符
        pass

    def save_graph(self):
        """保存实体图到 JSONL 文件"""
        import json

        with open(self.graph_file, 'w', encoding='utf-8') as f:
            for entity_id, entity_data in self.entities.items():
                f.write(json.dumps({
                    'id': entity_id,
                    **entity_data
                }, ensure_ascii=False) + '\n')

            for relation in self.relations:
                f.write(json.dumps(relation, ensure_ascii=False) + '\n')

    def _generate_vectors(self):
        """生成向量嵌入"""
        # 为文档生成向量
        for doc in self.doc_graph_builder.documents:
            text = doc.get("title", "")
            if text:
                self.vector_store.add_doc_vector(doc["doc_id"], text)

        # 保存向量
        vectors_path = self.ontology_path / 'vectors.pkl'
        self.vector_store.save_vectors(vectors_path)

    def _extract_multimodal_content(self):
        """提取多模态内容"""
        for doc in self.doc_graph_builder.documents:
            doc_path = self.vault_path / doc["path"]

            # 检查文档中的图像
            images = self._find_images_in_doc(doc_path)
            for image_path in images:
                try:
                    result = self.multimodal_extractor.extract_image(
                        str(image_path),
                        doc["doc_id"]
                    )
                    self.multimodal_results.append(result)
                except Exception as e:
                    print(f"    ⚠ Failed to extract image {image_path.name}: {e}")

            # 检查文档中的表格
            tables = self._find_tables_in_doc(doc_path)
            for table_data in tables:
                try:
                    result = self.multimodal_extractor.extract_table(
                        table_data["content"],
                        doc["doc_id"],
                        table_data["position"]
                    )
                    self.multimodal_results.append(result)
                except Exception as e:
                    print(f"    ⚠ Failed to extract table: {e}")

        # 保存多模态结果
        if self.multimodal_results:
            self._save_multimodal_results()

    def _find_images_in_doc(self, doc_path: Path):
        """查找文档中的图像"""
        images = []
        doc_dir = doc_path.parent

        try:
            with open(doc_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # 查找图像引用 ![[image.png]]
            import re
            pattern = r'!\[\[([^\]]+)\]\]'
            matches = re.findall(pattern, content)

            for match in matches:
                image_file = doc_dir / match
                if image_file.exists():
                    images.append(image_file)
        except Exception:
            pass

        return images

    def _find_tables_in_doc(self, doc_path: Path):
        """查找文档中的表格"""
        tables = []

        try:
            with open(doc_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()

            i = 0
            while i < len(lines):
                line = lines[i].strip()

                # 检查是否是表格行
                if line.startswith('|') and '|' in line[1:]:
                    # 找到表格开始
                    table_lines = [line]
                    j = i + 1

                    # 收集连续的表格行
                    while j < len(lines) and lines[j].strip().startswith('|'):
                        table_lines.append(lines[j].strip())
                        j += 1

                    # 至少需要3行（表头、分隔符、数据）
                    if len(table_lines) >= 3:
                        tables.append({
                            "content": '\n'.join(table_lines),
                            "position": {"line": i, "end_line": j - 1}
                        })

                    i = j - 1

                i += 1
        except Exception:
            pass

        return tables

    def _save_multimodal_results(self):
        """保存多模态提取结果"""
        import json

        with open(self.multimodal_file, 'w', encoding='utf-8') as f:
            for result in self.multimodal_results:
                f.write(json.dumps(result, ensure_ascii=False, default=str) + '\n')
