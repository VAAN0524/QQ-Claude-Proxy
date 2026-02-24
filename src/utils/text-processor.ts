/**
 * 文本处理器 - 中文分词和关键词提取
 * 使用纯正则表达式进行分词（无需额外依赖）
 */

/**
 * 文本处理器 - 中文分词和关键词提取
 */
export class TextProcessor {
  /**
   * 中文分词（使用正则表达式）
   */
  static tokenize(text: string): string[] {
    const words: string[] = [];

    // 提取连续的中文词（2个或以上汉字）
    const chineseMatches = text.match(/[\u4e00-\u9fa5]{2,}/g);
    if (chineseMatches) {
      words.push(...chineseMatches);
    }

    // 提取英文单词
    const englishMatches = text.match(/[a-zA-Z]{2,}/g);
    if (englishMatches) {
      words.push(...englishMatches.map(w => w.toLowerCase()));
    }

    // 提取数字
    const numberMatches = text.match(/\d{3,}/g);
    if (numberMatches) {
      words.push(...numberMatches);
    }

    return words;
  }

  /**
   * 提取关键词（带权重）
   */
  static extractKeywords(text: string, topK: number = 10): Array<{ word: string; weight: number }> {
    const words = this.tokenize(text);
    return this.calculateKeywordWeights(words, topK);
  }

  /**
   * 计算关键词权重
   */
  private static calculateKeywordWeights(words: string[], topK: number): Array<{ word: string; weight: number }> {
    // 统计词频
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    // 转换为数组并按频率排序
    const sorted = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    // 计算权重（归一化到 0-1）
    const maxFreq = sorted.length > 0 ? sorted[0][1] : 1;
    return sorted.map(([word, freq]) => ({
      word,
      weight: freq / maxFreq,
    }));
  }

  /**
   * 提取关键句子（用于摘要生成）
   */
  static extractKeySentences(text: string, count: number = 3): string[] {
    // 按句子分割（支持中英文标点）
    const sentences = text.split(/([。！？.!?])/);
    const validSentences: string[] = [];

    // 重建完整句子
    for (let i = 0; i < sentences.length - 1; i += 2) {
      const sentence = sentences[i] + (sentences[i + 1] || '');
      if (sentence.trim().length > 5) {
        validSentences.push(sentence.trim());
      }
    }

    // 如果没有有效句子，返回原文的前几句
    if (validSentences.length === 0) {
      const chunks: string[] = [];
      let current = '';
      for (const char of text) {
        current += char;
        if (current.length >= 50) {
          chunks.push(current);
          current = '';
        }
      }
      if (current) chunks.push(current);
      return chunks.slice(0, count);
    }

    // 按关键词密度排序
    const scored = validSentences.map(sentence => {
      const keywords = this.extractKeywords(sentence, 5);
      const score = keywords.reduce((sum, k) => sum + k.weight, 0);
      // 考虑句子长度（适中长度的句子更重要）
      const lengthScore = 1 - Math.abs(sentence.length - 30) / 100;
      return { sentence, score: score * lengthScore };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count).map(s => s.sentence);
  }

  /**
   * 清理文本前缀（移除 "用户:" 或 "助手:"）
   */
  static cleanContentPrefix(content: string): string {
    return content
      .replace(/^(用户|助手|user|assistant):\s*/i, '')
      .trim();
  }
}

export default TextProcessor;
