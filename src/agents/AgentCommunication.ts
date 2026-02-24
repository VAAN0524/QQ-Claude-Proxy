/**
 * Agent 通信风格处理器
 *
 * 方案3：在 Agent 间通信时传递人格风格信息
 */

import type { IAgent, AgentMessage, AgentResponse } from './base/Agent.js';
import type { AgentPersona } from './personas.js';
import { getAgentPersona } from './personas.js';

/**
 * 风格标签提取器
 */
export class PersonaTagExtractor {
  /**
   * 从人格设定中提取标签
   */
  static extractTags(persona: AgentPersona): string[] {
    const tags: string[] = [];

    // 从角色中提取
    tags.push(persona.role.replace(/\s+/g, '-'));

    // 从性格特点中提取关键词
    if (persona.traits) {
      persona.traits.forEach(trait => {
        const match = trait.match(/^(.+?)：/);
        if (match) {
          tags.push(match[1].replace(/\s+/g, '-'));
        }
      });
    }

    // 从能力中提取（如果有）
    // 注意：AgentPersona 不包含 capabilities，这里使用职责作为替代
    if (persona.responsibilities) {
      persona.responsibilities.forEach(resp => {
        // 从职责中提取关键词作为标签
        const words = resp.split(/[\s，、]+/).filter(w => w.length > 2);
        tags.push(...words.slice(0, 2)); // 每个职责取最多2个关键词
      });
    }

    return [...new Set(tags)]; // 去重
  }

  /**
   * 根据标签推断风格偏好
   */
  static inferStyleFromTags(tags: string[]): {
    tone: 'professional' | 'friendly' | 'casual' | 'neutral';
    verbosity: 'concise' | 'normal' | 'detailed';
  } {
    const tagsLower = tags.join(' ').toLowerCase();

    let tone: 'professional' | 'friendly' | 'casual' | 'neutral' = 'neutral';
    let verbosity: 'concise' | 'normal' | 'detailed' = 'normal';

    // 推断语气
    if (tagsLower.includes('professional') || tagsLower.includes('专业')) {
      tone = 'professional';
    } else if (tagsLower.includes('friendly') || tagsLower.includes('友好')) {
      tone = 'friendly';
    } else if (tagsLower.includes('casual') || tagsLower.includes('随意')) {
      tone = 'casual';
    }

    // 推断详细程度
    if (tagsLower.includes('concise') || tagsLower.includes('简洁')) {
      verbosity = 'concise';
    } else if (tagsLower.includes('detailed') || tagsLower.includes('详细')) {
      verbosity = 'detailed';
    }

    return { tone, verbosity };
  }
}

/**
 * Agent 消息增强器
 */
export class AgentMessageEnhancer {
  /**
   * 为 Agent 间通信的消息添加人格信息
   */
  static enhanceWithPersona(
    message: AgentMessage,
    senderAgent: IAgent
  ): AgentMessage {
    const enhanced = { ...message };

    // 添加发送者 ID
    enhanced.fromAgentId = senderAgent.id;

    // 获取发送者的人格标签
    const persona = senderAgent.getPersona?.() || senderAgent.persona;
    if (persona) {
      enhanced.senderPersonaTags = PersonaTagExtractor.extractTags(persona);

      // 推断风格偏好
      const style = PersonaTagExtractor.inferStyleFromTags(enhanced.senderPersonaTags);
      enhanced.expectedStyle = style;
    }

    return enhanced;
  }

  /**
   * 为响应添加人格信息
   */
  static enhanceResponseWithPersona(
    response: AgentResponse,
    responderAgent: IAgent
  ): AgentResponse {
    const enhanced = { ...response };

    // 获取响应者的人格标签
    const persona = responderAgent.getPersona?.() || responderAgent.persona;
    if (persona) {
      enhanced.responderPersonaTags = PersonaTagExtractor.extractTags(persona);

      // 获取实际应用的风格
      const style = PersonaTagExtractor.inferStyleFromTags(enhanced.responderPersonaTags);
      enhanced.appliedStyle = style;
    }

    return enhanced;
  }
}

/**
 * Agent 协作风格适配器
 */
export class AgentCollaborationStyleAdapter {
  /**
   * 根据发送者和接收者的人格，调整消息内容
   */
  static adaptMessageForReceiver(
    message: AgentMessage,
    senderPersona: AgentPersona,
    receiverPersona: AgentPersona
  ): AgentMessage {
    const adapted = { ...message };

    // 根据接收者的性格特点调整消息风格
    const receiverTraits = (receiverPersona.traits || []).join(' ').toLowerCase();
    const senderTraits = (senderPersona.traits || []).join(' ').toLowerCase();

    // 如果接收者偏好简洁，发送者应该精简消息
    if (receiverTraits.includes('简洁') && senderTraits.includes('详细')) {
      adapted.content = this.summarizeContent(adapted.content);
    }

    // 如果接收者是专业风格，调整语气
    if (receiverTraits.includes('专业')) {
      adapted.expectedStyle = {
        ...adapted.expectedStyle,
        tone: 'professional'
      };
    }

    // 添加协作上下文
    if (!adapted.rawData) {
      adapted.rawData = {};
    }
    (adapted.rawData as any).collaborationContext = {
      senderRole: senderPersona.role,
      receiverRole: receiverPersona.role,
      adaptationApplied: true
    };

    return adapted;
  }

  /**
   * 精简内容
   */
  private static summarizeContent(content: string): string {
    // 移除冗余的修饰词
    let summarized = content
      .replace(/非常|特别|相当|十分/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // 如果内容过长，添加省略提示
    if (summarized.length > 500) {
      summarized = summarized.substring(0, 497) + '...';
    }

    return summarized;
  }

  /**
   * 构建协作提示
   */
  static buildCollaborationPrompt(
    myPersona: AgentPersona,
    theirPersona: AgentPersona
  ): string {
    let prompt = '';

    // 添加对方角色信息
    prompt += `与 ${theirPersona.role} 协作：\n`;

    // 添加对方职责
    if (theirPersona.responsibilities) {
      prompt += `- 对方职责：${theirPersona.responsibilities.slice(0, 2).join('、')}\n`;
    }

    // 添加协作方式
    if (myPersona.collaboration) {
      prompt += `- 我的协作角色：${myPersona.collaboration}\n`;
    }

    return prompt;
  }
}

/**
 * 风格一致性检查器
 */
export class StyleConsistencyChecker {
  /**
   * 检查响应是否符合期望的风格
   */
  static checkStyleConsistency(
    response: AgentResponse,
    expectedStyle?: AgentMessage['expectedStyle']
  ): { consistent: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!expectedStyle) {
      return { consistent: true, issues: [] };
    }

    const appliedStyle = response.appliedStyle;

    // 检查语气一致性
    if (expectedStyle.tone && appliedStyle?.tone !== expectedStyle.tone) {
      issues.push(`语气不一致：期望 ${expectedStyle.tone}，实际 ${appliedStyle?.tone || '未设置'}`);
    }

    // 检查详细程度一致性
    if (expectedStyle.verbosity && appliedStyle?.verbosity !== expectedStyle.verbosity) {
      issues.push(`详细程度不一致：期望 ${expectedStyle.verbosity}，实际 ${appliedStyle?.verbosity || '未设置'}`);
    }

    return {
      consistent: issues.length === 0,
      issues
    };
  }

  /**
   * 生成风格不一致的警告
   */
  static generateStyleWarning(issues: string[]): string {
    if (issues.length === 0) {
      return '';
    }
    return `[风格警告] ` + issues.join('; ');
  }
}
