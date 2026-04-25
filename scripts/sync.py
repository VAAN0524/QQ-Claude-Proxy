# scripts/sync.py
from pathlib import Path
from typing import Optional, Dict, Any
from scripts.document_graph_builder import DocumentGraphBuilder
from scripts.vector_store import VectorStoreManager

class ObsidianOntologySync:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config if config else {}
        self.vault_path = Path(self.config['obsidian']['vault_path'])
        self.ontology_path = Path(self.config['ontology']['storage_path'])
        self.ontology_path.mkdir(parents=True, exist_ok=True)

        self.graph_file = self.ontology_path / 'graph.jsonl'
        self.doc_graph_file = self.ontology_path / 'doc_graph.jsonl'

        self.entities = {}
        self.relations = []

        # 新增组件
        self.doc_graph_builder = DocumentGraphBuilder(self.vault_path)
        self.vector_store = VectorStoreManager()

    def extract(self, dry_run=False, verbose=False):
        """提取实体和文档图"""
        print(f"🔍 Extracting entities from {self.vault_path}")

        # 1. 提取文档图（新增）
        print("\n📂 Building document graph...")
        self.doc_graph_builder.build()
        self.doc_graph_builder.save(self.doc_graph_file)
        print(f"  ✓ Saved {len(self.doc_graph_builder.documents)} documents")

        # 2. 原有的实体提取逻辑
        sources = self.config['obsidian']['sources']
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

        # 4. 生成向量（新增）
        print("\n📊 Generating vectors...")
        self._generate_vectors()
        print("  ✓ Vectors generated")

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
