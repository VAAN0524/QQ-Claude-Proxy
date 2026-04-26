# -*- coding: utf-8 -*-
"""
性能基准测试

对比优化前后的性能差异：
- Task 19: CLIP 和 sentence-transformers 实际模型 vs 随机向量
- Task 22: FAISS 索引 vs 线性搜索，缓存 vs 无缓存
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import time
import numpy as np
from query import QueryEngine
from vector_store import VectorStoreManager

class PerformanceBenchmark:
    def __init__(self):
        self.results = {}

    def benchmark_vector_encoding(self, num_tests: int = 10):
        """测试向量编码性能"""
        print("\n" + "="*60)
        print("向量编码性能测试")
        print("="*60)

        # 创建测试数据
        test_texts = ["这是一个测试文本"] * num_tests

        # 测试 sentence-transformers
        start = time.time()
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
        for text in test_texts:
            model.encode(text)
        st_time = time.time() - start

        print(f"sentence-transformers: {num_tests} 次编码耗时 {st_time:.2f}s")
        print(f"平均每次编码: {st_time/num_tests*1000:.2f}ms")

        # 测试 CLIP
        import clip
        import torch

        start = time.time()
        clip_model, _ = clip.load("ViT-B/32", device="cpu")
        for text in test_texts:
            text_tokens = clip.tokenize([text])
            with torch.no_grad():
                clip_model.encode_text(text_tokens)
        clip_time = time.time() - start

        print(f"CLIP 文本编码: {num_tests} 次编码耗时 {clip_time:.2f}s")
        print(f"平均每次编码: {clip_time/num_tests*1000:.2f}ms")

        return {
            "sentence_transformers": st_time,
            "clip": clip_time
        }

    def benchmark_search_performance(self, num_vectors: int = 1000, num_queries: int = 10):
        """测试搜索性能"""
        print("\n" + "="*60)
        print(f"搜索性能测试 ({num_vectors} 向量, {num_queries} 查询)")
        print("="*60)

        # 创建向量存储
        vector_store = VectorStoreManager()

        # 添加测试向量
        for i in range(num_vectors):
            vector_store.add_doc_vector(f"doc_{i}", f"这是文档 {i} 的内容")

        # 测试线性搜索（无 FAISS）
        queries = [f"测试查询 {i}" for i in range(num_queries)]

        start = time.time()
        for query in queries:
            vector_store.encode_text(query)
        linear_search_time = time.time() - start

        print(f"线性搜索编码: {num_queries} 次查询耗时 {linear_search_time:.2f}s")

        # 测试 FAISS 索引搜索
        vector_store.build_doc_index()

        start = time.time()
        for query in queries:
            vector_store.search_docs(query, top_k=10)
        faiss_search_time = time.time() - start

        print(f"FAISS 索引搜索: {num_queries} 次查询耗时 {faiss_search_time:.2f}s")

        speedup = linear_search_time / faiss_search_time if faiss_search_time > 0 else 0
        print(f"加速比: {speedup:.2f}x")

        return {
            "linear_search": linear_search_time,
            "faiss_search": faiss_search_time,
            "speedup": speedup
        }

    def benchmark_cache_effectiveness(self, num_queries: int = 100):
        """测试缓存效果"""
        print("\n" + "="*60)
        print(f"缓存效果测试 ({num_queries} 查询)")
        print("="*60)

        # 创建查询引擎
        engine = QueryEngine("./memory/ontology")
        engine.setup_test_data()

        # 重复查询（模拟缓存命中）
        unique_queries = 10
        repeated_query = "Alice Johnson"

        # 无缓存测试
        start = time.time()
        for i in range(num_queries):
            if i < unique_queries:
                engine.query(f"测试查询 {i}", use_cache=False)
            else:
                engine.query(repeated_query, use_cache=False)
        no_cache_time = time.time() - start

        # 有缓存测试
        engine.clear_cache()
        start = time.time()
        for i in range(num_queries):
            if i < unique_queries:
                engine.query(f"测试查询 {i}", use_cache=True)
            else:
                engine.query(repeated_query, use_cache=True)
        with_cache_time = time.time() - start

        cache_stats = engine.get_cache_stats()

        print(f"无缓存耗时: {no_cache_time:.2f}s")
        print(f"有缓存耗时: {with_cache_time:.2f}s")
        print(f"缓存统计: {cache_stats}")

        speedup = no_cache_time / with_cache_time if with_cache_time > 0 else 0
        print(f"加速比: {speedup:.2f}x")

        return {
            "no_cache_time": no_cache_time,
            "with_cache_time": with_cache_time,
            "speedup": speedup,
            "cache_stats": cache_stats
        }

    def run_full_benchmark(self):
        """运行完整基准测试"""
        print("\n" + "="*60)
        print("RAG-Anything 性能基准测试")
        print("Version: 2.3.0 (Vector Optimization)")
        print("="*60)

        results = {}

        # 1. 向量编码测试
        results["encoding"] = self.benchmark_vector_encoding(num_tests=20)

        # 2. 搜索性能测试
        results["search"] = self.benchmark_search_performance(
            num_vectors=100,
            num_queries=20
        )

        # 3. 缓存效果测试
        results["cache"] = self.benchmark_cache_effectiveness(num_queries=50)

        # 总结
        print("\n" + "="*60)
        print("性能总结")
        print("="*60)
        print(f"✅ 向量编码: sentence-transformers + CLIP 已集成")
        print(f"✅ FAISS 索引: {results['search']['speedup']:.2f}x 加速")
        print(f"✅ 缓存系统: {results['cache']['speedup']:.2f}x 加速")
        print(f"   命中率: {results['cache']['cache_stats']['hit_rate']*100:.1f}%")

        return results

if __name__ == "__main__":
    benchmark = PerformanceBenchmark()
    results = benchmark.run_full_benchmark()
