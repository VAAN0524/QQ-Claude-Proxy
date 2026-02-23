/**
 * Agent 工具定义
 *
 * 使用简化的工具定义 API，将每个工具从 100+ 行压缩到 5-10 行
 */

import { tool, Tool } from '../../llm/tool.js';
import { z } from 'zod';
import type { IAgent, AgentMessage, AgentContext } from '../base/Agent.js';

/**
 * 工具执行上下文
 */
export interface ToolContext {
  subAgents: Map<string, IAgent>;
  message: AgentMessage;
  agentContext: AgentContext;
}

/**
 * Code Agent 工具
 */
export const codeAgentTool = (context: ToolContext): Tool => tool({
  name: 'run_code_agent',
  description: '执行代码相关任务：编写、分析、调试、优化代码',
  parameters: z.object({
    task: z.string().describe('具体的代码任务描述，例如：写个快速排序算法'),
    code: z.string().optional().describe('可选的代码片段，用于分析或调试'),
  }),
  execute: async ({ task, code }) => {
    const agent = context.subAgents.get('code');
    if (!agent) {
      return '错误：Code Agent 未启用';
    }
    const subMessage: AgentMessage = {
      ...context.message,
      content: code ? `${task}\n\n代码：\n${code}` : task,
    };
    const response = await agent.process(subMessage, context.agentContext);
    return response.content;
  },
});

/**
 * Browser Agent 工具
 */
export const browserAgentTool = (context: ToolContext): Tool => tool({
  name: 'run_browser_agent',
  description: '网页操作：访问网页、截图、提取信息、填充表单',
  parameters: z.object({
    task: z.string().describe('具体的网页操作任务'),
    url: z.string().optional().describe('可选的 URL，如果是纯访问任务'),
  }),
  execute: async ({ task, url }) => {
    const agent = context.subAgents.get('browser');
    if (!agent) {
      return '错误：Browser Agent 未启用';
    }
    const subMessage: AgentMessage = {
      ...context.message,
      content: url ? `访问 ${url}，然后：${task}` : task,
    };
    const response = await agent.process(subMessage, context.agentContext);
    return response.content;
  },
});

/**
 * Shell Agent 工具
 */
export const shellAgentTool = (context: ToolContext): Tool => tool({
  name: 'run_shell_agent',
  description: '执行系统命令。用于：列出文件(ls/dir)、查看目录、运行脚本等安全操作',
  parameters: z.object({
    command: z.string().describe('要执行的命令。常用示例：ls -la（列出文件）、cat file.txt（查看文件）'),
  }),
  execute: async ({ command }) => {
    const agent = context.subAgents.get('shell');
    if (!agent) {
      return '错误：Shell Agent 未启用';
    }
    const subMessage: AgentMessage = {
      ...context.message,
      content: command,
    };
    const response = await agent.process(subMessage, context.agentContext);
    return response.content;
  },
});

/**
 * Web Search Agent 工具
 */
export const webSearchAgentTool = (context: ToolContext): Tool => tool({
  name: 'run_websearch_agent',
  description: '网络搜索：搜索问题、查找资料、收集信息',
  parameters: z.object({
    query: z.string().describe('搜索关键词或问题'),
  }),
  execute: async ({ query }) => {
    const agent = context.subAgents.get('websearch');
    if (!agent) {
      return '错误：Web Search Agent 未启用';
    }
    const subMessage: AgentMessage = {
      ...context.message,
      content: query,
    };
    const response = await agent.process(subMessage, context.agentContext);
    return response.content;
  },
});

/**
 * Data Analysis Agent 工具
 */
export const dataAnalysisAgentTool = (context: ToolContext): Tool => tool({
  name: 'run_data_analysis_agent',
  description: '数据分析：分析文件、统计数据、生成报告',
  parameters: z.object({
    task: z.string().describe('分析任务描述'),
    file: z.string().optional().describe('可选的文件路径'),
  }),
  execute: async ({ task, file }) => {
    const agent = context.subAgents.get('data');
    if (!agent) {
      return '错误：Data Analysis Agent 未启用';
    }
    const subMessage: AgentMessage = {
      ...context.message,
      content: file ? `分析文件 ${file}：${task}` : task,
    };
    const response = await agent.process(subMessage, context.agentContext);
    return response.content;
  },
});

/**
 * Vision Agent 工具
 */
export const visionAgentTool = (context: ToolContext): Tool => tool({
  name: 'run_vision_agent',
  description: '图片分析：识别图片内容、提取文字、分析图表',
  parameters: z.object({
    task: z.string().describe('图片分析任务'),
    imagePath: z.string().optional().describe('图片路径'),
  }),
  execute: async ({ task, imagePath }) => {
    const agent = context.subAgents.get('vision');
    if (!agent) {
      return '错误：Vision Agent 未启用';
    }
    const subMessage: AgentMessage = {
      ...context.message,
      content: imagePath ? `分析图片 ${imagePath}：${task}` : task,
      attachments: imagePath ? [{
        type: 'image',
        path: imagePath,
      }] : context.message.attachments,
    };
    const response = await agent.process(subMessage, context.agentContext);
    return response.content;
  },
});

/**
 * 获取所有 Agent 工具
 */
export function getAllAgentTools(context: ToolContext): Tool[] {
  const tools: Tool[] = [];

  if (context.subAgents.has('code')) {
    tools.push(codeAgentTool(context));
  }
  if (context.subAgents.has('browser')) {
    tools.push(browserAgentTool(context));
  }
  if (context.subAgents.has('shell')) {
    tools.push(shellAgentTool(context));
  }
  if (context.subAgents.has('websearch')) {
    tools.push(webSearchAgentTool(context));
  }
  if (context.subAgents.has('data')) {
    tools.push(dataAnalysisAgentTool(context));
  }
  if (context.subAgents.has('vision')) {
    tools.push(visionAgentTool(context));
  }

  return tools;
}
