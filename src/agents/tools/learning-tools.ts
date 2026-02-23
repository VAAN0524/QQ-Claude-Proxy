/**
 * 学习和记忆工具定义
 *
 * 使用简化的工具定义 API
 */

import { tool, Tool } from '../../llm/tool.js';
import { z } from 'zod';
import type { MemoryService, LearningModule } from '../index.js';
import { MemoryType } from '../memory/MemoryService.js';

/**
 * 学习工具上下文
 */
export interface LearningToolContext {
  memoryService?: MemoryService;
  learningModule?: LearningModule;
}

/**
 * 学习并解决问题工具
 */
export const learnAndSolveTool = (context: LearningToolContext): Tool | null => {
  if (!context.learningModule) {
    return null;
  }

  return tool({
    name: 'learn_and_solve',
    description: '自主学习并解决问题：当不知道答案时，自动搜索解决方案并学习，然后回答用户问题',
    parameters: z.object({
      question: z.string().describe('需要学习的问题或任务'),
    }),
    execute: async ({ question }) => {
      if (!context.learningModule) {
        return '错误：学习模块未启用';
      }
      // LearningModule 可能没有 learnAndAnswer 方法，使用替代方案
      // 这里返回一个占位符，实际逻辑需要根据 LearningModule 的实际 API 调整
      return `[自主学习] ${question} - 此功能需要在 LearningModule 中实现`;
    },
  });
};

/**
 * 检查知识工具
 */
export const checkKnowledgeTool = (context: LearningToolContext): Tool | null => {
  if (!context.memoryService) {
    return null;
  }

  return tool({
    name: 'check_knowledge',
    description: '检查知识库中是否已有相关的答案或解决方案',
    parameters: z.object({
      question: z.string().describe('要查询的问题'),
    }),
    execute: async ({ question }) => {
      if (!context.memoryService) {
        return '错误：记忆服务未启用';
      }
      const results = context.memoryService.retrieveMemories({
        types: [MemoryType.KNOWLEDGE],
        limit: 3,
      });

      // 简单的关键词匹配（实际应用中应使用语义搜索）
      const questionLower = question.toLowerCase();
      const matching = results.filter(r =>
        r.content.toLowerCase().includes(questionLower) ||
        questionLower.includes(r.content.toLowerCase().substring(0, 50))
      );

      if (matching.length === 0) {
        return '知识库中没有找到相关内容';
      }
      return matching.map((r, i) => `${i + 1}. ${r.content}`).join('\n\n');
    },
  });
};

/**
 * 存储知识工具
 */
export const storeKnowledgeTool = (context: LearningToolContext): Tool | null => {
  if (!context.memoryService) {
    return null;
  }

  return tool({
    name: 'store_knowledge',
    description: '存储新学到的知识到记忆中，以便将来使用',
    parameters: z.object({
      question: z.string().describe('问题或主题'),
      answer: z.string().describe('答案或解决方案'),
      confidence: z.number().optional().describe('置信度 (0-1)，默认 0.7'),
    }),
    execute: async ({ question, answer, confidence = 0.7 }) => {
      if (!context.memoryService) {
        return '错误：记忆服务未启用';
      }
      const content = `Q: ${question}\nA: ${answer}`;
      await context.memoryService.addMemory(
        MemoryType.KNOWLEDGE,
        content,
        { importance: confidence }
      );
      return '知识已成功存储';
    },
  });
};

/**
 * 创建计划工具
 */
export const createPlanTool = (): Tool => tool({
  name: 'create_plan',
  description: '制定执行计划：将复杂任务分解为多个步骤，生成详细的执行计划',
  parameters: z.object({
    task: z.string().describe('需要规划的任务描述'),
    context: z.string().optional().describe('任务背景信息，帮助更好地理解任务需求'),
  }),
  execute: async ({ task, context: ctx }) => {
    // 计划由 LLM 直接生成，这里只是占位符
    // 实际执行在 Coordinator Agent 中处理
    return `已收到计划请求：${task}`;
  },
});

/**
 * 自我反思工具
 */
export const selfReflectTool = (): Tool => tool({
  name: 'self_reflect',
  description: '自我反思和评估：分析当前行为、结果是否符合预期，识别问题和改进点',
  parameters: z.object({
    action: z.string().describe('已执行的操作或行动'),
    result: z.string().describe('操作的结果或响应'),
    expectation: z.string().optional().describe('预期的结果或目标'),
  }),
  execute: async ({ action, result, expectation }) => {
    // 反思由 LLM 直接生成，这里只是占位符
    return `已收到反思请求：${action} -> ${result}`;
  },
});

/**
 * 调整策略工具
 */
export const adjustStrategyTool = (): Tool => tool({
  name: 'adjust_strategy',
  description: '调整执行策略：根据自我反思的结果，调整执行方法或尝试新的解决方案',
  parameters: z.object({
    currentStrategy: z.string().describe('当前的执行策略或方法'),
    issue: z.string().optional().describe('当前策略存在的问题或失败原因'),
  }),
  execute: async ({ currentStrategy, issue }) => {
    // 策略调整由 LLM 直接生成，这里只是占位符
    return `已收到策略调整请求：${currentStrategy}`;
  },
});

/**
 * 获取所有学习和记忆工具
 */
export function getAllLearningTools(context: LearningToolContext): Tool[] {
  const tools: Tool[] = [];

  const learnTool = learnAndSolveTool(context);
  if (learnTool) tools.push(learnTool);

  const checkTool = checkKnowledgeTool(context);
  if (checkTool) tools.push(checkTool);

  const storeTool = storeKnowledgeTool(context);
  if (storeTool) tools.push(storeTool);

  // 始终包含认知工具
  tools.push(
    createPlanTool(),
    selfReflectTool(),
    adjustStrategyTool()
  );

  return tools;
}
