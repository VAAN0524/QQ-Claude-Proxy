/**
 * Agent 基础接口定义
 *
 * 所有内置 Agent 必须实现此接口
 */

// 导入人格设定类型
import type { AgentPersona } from '../personas.js';

/**
 * Agent 能力标签
 */
export enum AgentCapability {
  Code = 'code',           // 代码编写和分析
  Web = 'web',             // 网页操作
  Shell = 'shell',         // 命令执行
  File = 'file',           // 文件操作
  Analyze = 'analyze',     // 代码分析
  Complex = 'complex',     // 复杂推理
  General = 'general',     // 通用对话
  TASK_COORDINATION = 'task_coordination', // 任务协调 🆕
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 优先级 (数字越大优先级越高) */
  priority: number;
  /** 最大执行时间 (毫秒) */
  timeout: number;
  /** 自定义配置 */
  options?: Record<string, unknown>;
}

/**
 * 附件信息
 */
export interface Attachment {
  type: 'image' | 'video' | 'audio' | 'file';
  path: string;
  name?: string;
  size?: number;
}

/**
 * Agent 消息
 */
export interface AgentMessage {
  /** 渠道类型 */
  channel: string;
  /** 用户 ID */
  userId: string;
  /** 群组 ID (可选) */
  groupId?: string;
  /** 消息内容 */
  content: string;
  /** 附件列表 */
  attachments?: Attachment[];
  /** 时间戳 */
  timestamp: Date;
  /** 原始数据 */
  rawData?: unknown;

  /** ========== 方案3：通信人格风格 ========== */
  /** 发送者的 Agent ID（Agent 间通信时使用） */
  fromAgentId?: string;
  /** 发送者的人格标签 */
  senderPersonaTags?: string[];
  /** 期望的响应风格 */
  expectedStyle?: {
    tone?: 'professional' | 'friendly' | 'casual' | 'neutral';
    verbosity?: 'concise' | 'normal' | 'detailed';
  };
}

/**
 * Agent 执行上下文
 */
export interface AgentContext {
  /** 工作区路径 */
  workspacePath: string;
  /** 存储路径 */
  storagePath: string;
  /** 允许的用户列表 */
  allowedUsers: string[];
  /** 共享上下文（可选，用于跨会话记忆） */
  sharedContext?: import('../SharedContext.js').SharedContext;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Agent 响应
 */
export interface AgentResponse {
  /** 响应内容 */
  content: string;
  /** 需要发送的文件列表 */
  filesToSend?: string[];
  /** 处理该消息的 Agent ID (可选，用于向后兼容) */
  agentId?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 是否需要切换 Agent */
  switchAgent?: string;
  /** 用户 ID (兼容现有 AgentResponse) */
  userId?: string;
  /** 群组 ID (兼容现有 AgentResponse) */
  groupId?: string;
  /** 消息 ID (兼容现有 AgentResponse) */
  msgId?: string;

  /** ========== 方案3：响应人格风格 ========== */
  /** 响应者的人格标签 */
  responderPersonaTags?: string[];
  /** 实际应用的响应风格 */
  appliedStyle?: {
    tone?: 'professional' | 'friendly' | 'casual' | 'neutral';
    verbosity?: 'concise' | 'normal' | 'detailed';
  };
}

/**
 * Agent 接口
 *
 * 所有内置 Agent 必须实现此接口
 */
export interface IAgent {
  /** Agent 唯一标识 */
  readonly id: string;

  /** Agent 显示名称 */
  readonly name: string;

  /** Agent 描述 */
  readonly description: string;

  /** Agent 能力标签 */
  readonly capabilities: AgentCapability[];

  /** Agent 配置 */
  readonly config: AgentConfig;

  /** ========== 方案2：人格设定属性 ========== */
  /** Agent 人格设定（可选） */
  readonly persona?: AgentPersona;

  /**
   * 获取 Agent 人格设定
   * 如果没有预设人格，返回默认人格
   */
  getPersona?(): AgentPersona;

  /**
   * 根据人格设定调整响应风格
   * @param content 原始响应内容
   * @param styleOptions 风格选项
   * @returns 调整后的内容
   */
  applyPersonaStyle?(
    content: string,
    styleOptions?: { tone?: string; verbosity?: 'concise' | 'normal' | 'detailed' }
  ): string;

  /**
   * 处理消息
   * @param message 用户消息
   * @param context 执行上下文
   * @returns 处理结果
   */
  process(
    message: AgentMessage,
    context: AgentContext
  ): Promise<AgentResponse>;

  /**
   * 检查是否能处理该任务
   * @param message 用户消息
   * @returns 匹配分数 (0-1)，0 表示不能处理，1 表示完全匹配
   */
  canHandle(message: AgentMessage): Promise<number> | number;

  /**
   * 初始化 Agent (可选)
   */
  initialize?(): Promise<void>;

  /**
   * 清理资源 (可选)
   */
  cleanup?(): Promise<void>;
}

/**
 * Agent 类型 guard
 */
export function isAgent(obj: unknown): obj is IAgent {
  const agent = obj as Partial<IAgent>;
  return (
    typeof agent === 'object' &&
    agent !== null &&
    typeof agent.id === 'string' &&
    typeof agent.name === 'string' &&
    typeof agent.description === 'string' &&
    Array.isArray(agent.capabilities) &&
    typeof agent.config === 'object' &&
    typeof agent.process === 'function'
  );
}
