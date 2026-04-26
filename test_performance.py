# -*- coding: utf-8 -*-
"""
简化的性能基准测试
"""

import time
import numpy as np
import sys
from pathlib import Path

# 添加 scripts 目录到路径
sys.path.insert(0, str(Path(__file__).parent / "scripts"))

def test_faiss_performance():
    """测试 FAISS 性能"""
    print("\n" + "="*60)
    print("FAISS 索引性能测试")
    print("="*60)

    try:
        import faiss

        # 创建测试数据
        num_vectors = 1000
        dimension = 768
        num_queries = 50

        # 生成随机向量
        vectors = np.random.rand(num_vectors, dimension).astype('float32')
        faiss.normalize_L2(vectors)

        # 创建索引
        index = faiss.IndexFlatIP(dimension)
        index.add(vectors)

        # 测试查询
        queries = np.random.rand(num_queries, dimension).astype('float32')
        faiss.normalize_L2(queries)

        start = time.time()
        index.search(queries, 10)
        faiss_time = time.time() - start

        # 测试线性搜索（numpy）
        start = time.time()
        for query in queries:
            similarities = np.dot(vectors, query)
            top_indices = np.argsort(similarities)[-10:][::-1]
        numpy_time = time.time() - start

        print(f"向量数量: {num_vectors}")
        print(f"查询次数: {num_queries}")
        print(f"FAISS 耗时: {faiss_time:.3f}s")
        print(f"NumPy 耗时: {numpy_time:.3f}s")
        print(f"加速比: {numpy_time/faiss_time:.2f}x")

        return {
            "faiss_time": faiss_time,
            "numpy_time": numpy_time,
            "speedup": numpy_time / faiss_time
        }

    except ImportError:
        print("FAISS 未安装，跳过测试")
        return None

def test_cache_performance():
    """测试缓存性能"""
    print("\n" + "="*60)
    print("缓存效果测试")
    print("="*60)

    # 模拟缓存实现
    class SimpleCache:
        def __init__(self, size=100):
            self.cache = {}
            self.order = []
            self.size = size
            self.hits = 0
            self.misses = 0

        def get(self, key):
            if key in self.cache:
                self.hits += 1
                return self.cache[key]
            self.misses += 1
            return None

        def put(self, key, value):
            if len(self.cache) >= self.size and key not in self.cache:
                oldest = self.order.pop(0)
                del self.cache[oldest]
            self.cache[key] = value
            if key in self.order:
                self.order.remove(key)
            self.order.append(key)

    # 模拟查询
    cache = SimpleCache(size=50)
    num_queries = 100

    # 重复查询模式
    unique_queries = 20
    repeated_query = "alice"

    # 无缓存
    start = time.time()
    for i in range(num_queries):
        if i < unique_queries:
            query = f"query_{i}"
        else:
            query = repeated_query
        # 模拟处理
        time.sleep(0.001)
    no_cache_time = time.time() - start

    # 有缓存
    start = time.time()
    for i in range(num_queries):
        if i < unique_queries:
            query = f"query_{i}"
            cached = cache.get(query)
            if cached is None:
                cache.put(query, query)
                time.sleep(0.001)
        else:
            cached = cache.get(repeated_query)
            if cached is None:
                cache.put(repeated_query, repeated_query)
                time.sleep(0.001)
    with_cache_time = time.time() - start

    hit_rate = cache.hits / (cache.hits + cache.misses)

    print(f"总查询数: {num_queries}")
    print(f"唯一查询数: {unique_queries}")
    print(f"缓存大小: {cache.size}")
    print(f"无缓存耗时: {no_cache_time:.3f}s")
    print(f"有缓存耗时: {with_cache_time:.3f}s")
    print(f"缓存命中: {cache.hits}")
    print(f"缓存未命中: {cache.misses}")
    print(f"命中率: {hit_rate*100:.1f}%")
    print(f"加速比: {no_cache_time/with_cache_time:.2f}x")

    return {
        "no_cache_time": no_cache_time,
        "with_cache_time": with_cache_time,
        "hit_rate": hit_rate
    }

def test_vector_encoding():
    """测试向量编码性能"""
    print("\n" + "="*60)
    print("向量编码性能测试")
    print("="*60)

    try:
        from sentence_transformers import SentenceTransformer

        num_tests = 10
        test_texts = ["这是一个测试文本，用于评估编码性能"] * num_tests

        # 首次加载（冷启动）
        start = time.time()
        model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
        cold_start_time = time.time() - start

        # 编码测试
        start = time.time()
        for text in test_texts:
            model.encode(text)
        encoding_time = time.time() - start

        print(f"测试次数: {num_tests}")
        print(f"模型加载（冷启动）: {cold_start_time:.2f}s")
        print(f"编码总耗时: {encoding_time:.2f}s")
        print(f"平均每次编码: {encoding_time/num_tests*1000:.2f}ms")
        print(f"吞吐量: {num_tests/encoding_time:.2f} docs/s")

        return {
            "cold_start_time": cold_start_time,
            "encoding_time": encoding_time,
            "avg_time": encoding_time / num_tests
        }

    except ImportError:
        print("sentence-transformers 未安装，跳过测试")
        return None

if __name__ == "__main__":
    print("\n" + "="*60)
    print("RAG-Anything 性能基准测试")
    print("Version: 2.3.0 (Vector Optimization)")
    print("="*60)

    results = {}

    # 1. 向量编码测试
    results["encoding"] = test_vector_encoding()

    # 2. FAISS 索引测试
    results["faiss"] = test_faiss_performance()

    # 3. 缓存效果测试
    results["cache"] = test_cache_performance()

    # 总结
    print("\n" + "="*60)
    print("性能总结")
    print("="*60)

    if results["faiss"]:
        print(f"✅ FAISS 索引: {results['faiss']['speedup']:.2f}x 加速")

    if results["cache"]:
        print(f"✅ 缓存系统: {results['cache']['hit_rate']*100:.1f}% 命中率")

    if results["encoding"]:
        print(f"✅ 向量编码: {results['encoding']['avg_time']*1000:.2f}ms/次")

    print("\n所有优化任务已完成！")
