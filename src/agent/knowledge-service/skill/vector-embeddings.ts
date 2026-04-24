/**
 * 向量嵌入模块 - TF-IDF轻量级方案
 * 零依赖，纯JavaScript实现
 */

export interface Vector {
  dimensions: number[];
  magnitude: number;
}

export interface TFIDFModel {
  idf: Map<string, number>;
  vocabulary: string[];
  documentCount: number;
}

/**
 * 文本分词 - 支持中文和英文
 */
export class Tokenizer {
  /**
   * 分词 - 中文按字符分割，英文按单词分割
   */
  static tokenize(text: string): string[] {
    const tokens: string[] = [];

    // 移除特殊字符，保留中英文、数字
    const cleanText = text.replace(/[^一-龥a-zA-Z0-9\s]/g, ' ');

    // 按空格分割
    const words = cleanText.split(/\s+/);

    for (const word of words) {
      if (!word.trim()) continue;

      // 判断是否为中文
      if (/[一-龥]/.test(word)) {
        // 中文按字符分割（每个字符作为一个token）
        for (const char of word) {
          if (/[一-龥]/.test(char)) {
            tokens.push(char);
          }
        }
      } else {
        // 英文转小写
        tokens.push(word.toLowerCase());
      }
    }

    return tokens;
  }

  /**
   * 提取关键词 - 基于频率和重要性
   */
  static extractKeywords(text: string, maxKeywords: number = 10): string[] {
    const tokens = this.tokenize(text);

    // 统计词频
    const frequency = new Map<string, number>();
    for (const token of tokens) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }

    // 按频率排序
    const sorted = Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([token]) => token);

    return sorted;
  }
}

/**
 * TF-IDF向量化器
 */
export class TFIDFVectorizer {
  private model: TFIDFModel;

  constructor() {
    this.model = {
      idf: new Map(),
      vocabulary: [],
      documentCount: 0
    };
  }

  /**
   * 训练模型 - 计算IDF
   */
  fit(documents: string[]): void {
    const docCount = documents.length;
    this.model.documentCount = docCount;

    // 统计每个词出现在多少文档中
    const docFrequency = new Map<string, number>();

    for (const doc of documents) {
      const tokens = new Set(Tokenizer.tokenize(doc));
      for (const token of tokens) {
        docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
      }
    }

    // 计算IDF = log(N / df)
    this.model.vocabulary = Array.from(docFrequency.keys());
    for (const [term, df] of docFrequency.entries()) {
      this.model.idf.set(term, Math.log(docCount / (df + 1)));
    }
  }

  /**
   * 将文本转换为向量
   */
  transform(text: string): Vector {
    const tokens = Tokenizer.tokenize(text);
    const termFreq = new Map<string, number>();

    // 计算词频
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    // 构建向量
    const dimensions: number[] = [];
    let magnitude = 0;

    for (const term of this.model.vocabulary) {
      const tf = termFreq.get(term) || 0;
      const idf = this.model.idf.get(term) || 0;
      const tfidf = tf * idf;
      dimensions.push(tfidf);
      magnitude += tfidf * tfidf;
    }

    magnitude = Math.sqrt(magnitude);

    return { dimensions, magnitude };
  }

  /**
   * 批量转换
   */
  fitTransform(documents: string[]): Vector[] {
    this.fit(documents);
    return documents.map(doc => this.transform(doc));
  }

  /**
   * 计算余弦相似度
   */
  static cosineSimilarity(vec1: Vector, vec2: Vector): number {
    if (vec1.dimensions.length !== vec2.dimensions.length) {
      return 0;
    }

    let dotProduct = 0;
    for (let i = 0; i < vec1.dimensions.length; i++) {
      dotProduct += vec1.dimensions[i] * vec2.dimensions[i];
    }

    const magnitude = vec1.magnitude * vec2.magnitude;
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * 序列化模型
   */
  serialize(): string {
    return JSON.stringify({
      idf: Array.from(this.model.idf.entries()),
      vocabulary: this.model.vocabulary,
      documentCount: this.model.documentCount
    });
  }

  /**
   * 反序列化模型
   */
  static deserialize(data: string): TFIDFVectorizer {
    const vectorizer = new TFIDFVectorizer();
    const parsed = JSON.parse(data);
    vectorizer.model = {
      idf: new Map(parsed.idf),
      vocabulary: parsed.vocabulary,
      documentCount: parsed.documentCount
    };
    return vectorizer;
  }

  /**
   * 获取词汇表大小
   */
  getVocabularySize(): number {
    return this.model.vocabulary.length;
  }
}

/**
 * 语义相似度计算器
 */
export class SemanticSimilarity {
  private vectorizer: TFIDFVectorizer;

  constructor(vectorizer: TFIDFVectorizer) {
    this.vectorizer = vectorizer;
  }

  /**
   * 计算两个文本的相似度
   */
  similarity(text1: string, text2: string): number {
    const vec1 = this.vectorizer.transform(text1);
    const vec2 = this.vectorizer.transform(text2);
    return TFIDFVectorizer.cosineSimilarity(vec1, vec2);
  }

  /**
   * 找到最相似的文本
   */
  findMostSimilar(
    query: string,
    documents: { id: string; content: string }[]
  ): Array<{ id: string; content: string; score: number }> {
    const queryVec = this.vectorizer.transform(query);

    const results = documents.map(doc => {
      const docVec = this.vectorizer.transform(doc.content);
      const score = TFIDFVectorizer.cosineSimilarity(queryVec, docVec);
      return {
        id: doc.id,
        content: doc.content,
        score
      };
    });

    // 按相似度排序
    return results.sort((a, b) => b.score - a.score);
  }
}
