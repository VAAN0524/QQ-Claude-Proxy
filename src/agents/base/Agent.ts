/**
 * Agent 基础接口定义
 * 完全灵活版本，兼容各种用法
 */

export type AgentCapability = string | { name: string; description?: string };

export interface AgentMessage {
  type?: 'event' | 'request' | 'response';
  channel?: string;
  event?: string;
  data?: any;
  userId?: string;
  groupId?: string;
  messageId?: string;
  content?: string;
  attachments?: any[];
  timestamp?: Date | number;
  rawData?: any;
  [key: string]: any;
}

export interface AgentContext {
  userId?: string;
  groupId?: string;
  messageId?: string;
  [key: string]: any;
}

export interface AgentResponse {
  success?: boolean;
  data?: any;
  error?: string;
  content?: string;
  userId?: string;
  groupId?: string;
  msgId?: string;
  filesToSend?: any[];
  agentId?: string;
  [key: string]: any;
}

export interface AgentConfig {
  workspacePath?: string;
  storagePath?: string;
  allowedUsers?: string[];
  enabled?: boolean;
  priority?: number;
  timeout?: number;
  [key: string]: any;
}

export interface IAgent {
  processEvent?(message: AgentMessage, context: AgentContext): Promise<AgentResponse>;
  [key: string]: any;
}

// 导出别名
export type IAgentMessage = AgentMessage;
export type IAgentContext = AgentContext;
export type IAgentResponse = AgentResponse;
export type IAgentConfig = AgentConfig;
