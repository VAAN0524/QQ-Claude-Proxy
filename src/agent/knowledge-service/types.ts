/**
 * 知识库服务类型定义
 */

// 三层标签体系
export interface TagHierarchy {
  level1: string;  // 一级大类目（工作、学习、项目、个人）
  level2: string;  // 二级语义脉络（前端开发、调试、2026年4月）
  level3: string;  // 三级关键词章节（WebSocket、连接超时、React Hooks）
}

// 知识条目
export interface KnowledgeItem {
  id: string;                    // 唯一标识
  contentType: 'text' | 'code' | 'image' | 'file';  // 内容类型
  content: string;               // 主要内容
  tags: TagHierarchy;            // 三层标签
  source?: string;               // 来源：qq, code, doc, manual
  metadata?: Record<string, any>; // 元数据（JSON）
  usageCount: number;            // 使用次数
  importanceScore: number;       // 重要性评分 0-10
  createdAt: number;             // 创建时间戳
  updatedAt: number;             // 更新时间戳
}

// 保存选项
export interface SaveOptions {
  source?: string;
  metadata?: Record<string, any>;
  importanceScore?: number;
}

// 搜索查询
export interface SearchQuery {
  text?: string;                 // 文本搜索
  tags?: Partial<TagHierarchy>;  // 标签过滤
  taskType?: string;             // 任务类型
  limit?: number;                // 结果数量限制
}

// 搜索上下文
export interface SearchContext {
  taskType?: string;             // 当前任务类型
  recentQueries?: string[];      // 最近的查询
  userId?: string;               // 用户ID
}

// 服务配置
export interface KnowledgeServiceConfig {
  dbPath: string;                // 数据库路径
  enableAutoExtraction?: boolean; // 是否启用自动经验提取
}

// 统计信息
export interface UsageStats {
  totalItems: number;
  itemsByType: Record<string, number>;
  itemsByTag: Record<string, number>;
  mostUsedItems: KnowledgeItem[];
  recentlyUsedItems: KnowledgeItem[];
}
