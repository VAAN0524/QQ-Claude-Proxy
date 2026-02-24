/**
 * 人格设定 System Prompt 构建器
 *
 * 将 AgentPersona 配置转换为 LLM 可理解的 System Prompt
 */

import type { AgentPersona } from './personas.js';

/**
 * 构建人格设定 System Prompt
 */
export function buildPersonaPrompt(persona: AgentPersona): string {
  if (!persona) {
    return '';
  }

  const sections: string[] = [];

  // 角色定位
  sections.push(`## 你的人格定位`);
  sections.push(`你是**${persona.role}**。`);
  sections.push(``);

  // 核心职责
  if (persona.responsibilities && persona.responsibilities.length > 0) {
    sections.push(`## 核心职责`);
    persona.responsibilities.forEach((r, i) => {
      sections.push(`${i + 1}. ${r}`);
    });
    sections.push(``);
  }

  // 性格特点
  if (persona.traits && persona.traits.length > 0) {
    sections.push(`## 性格特点`);
    sections.push(`在回应时体现以下性格特质：`);
    persona.traits.forEach(trait => {
      // 解析 "特点：描述" 格式
      const match = trait.match(/^(.+)：(.+)$/);
      if (match) {
        const [, key, value] = match;
        sections.push(`- **${key}**：${value}`);
      } else {
        sections.push(`- ${trait}`);
      }
    });
    sections.push(``);
  }

  // 工作原则
  if (persona.principles && persona.principles.length > 0) {
    sections.push(`## 工作原则`);
    sections.push(`严格遵循以下原则进行决策和行动：`);
    persona.principles.forEach((p, i) => {
      sections.push(`${i + 1}. ${p}`);
    });
    sections.push(``);
  }

  // 协作方式
  if (persona.collaboration) {
    sections.push(`## 团队协作`);
    sections.push(persona.collaboration);
    sections.push(``);
  }

  return sections.join('\n');
}

/**
 * 构建带人格风格的回应指导
 */
export function buildResponseStyleGuide(persona: AgentPersona): string {
  if (!persona) {
    return '';
  }

  const styleRules: string[] = [];

  // 根据性格特点生成回应风格
  const traits = persona.traits || [];
  const traitsLower = traits.join(' ').toLowerCase();

  if (traitsLower.includes('简洁') || traitsLower.includes('直接')) {
    styleRules.push('- 回应简洁直接，避免冗余');
  }
  if (traitsLower.includes('详细') || traitsLower.includes('全面')) {
    styleRules.push('- 提供详细全面的解释');
  }
  if (traitsLower.includes('友好') || traitsLower.includes('耐心')) {
    styleRules.push('- 语气友好，对问题保持耐心');
  }
  if (traitsLower.includes('专业') || traitsLower.includes('严谨')) {
    styleRules.push('- 使用专业术语，保持严谨态度');
  }
  if (traitsLower.includes('数据') || traitsLower.includes('分析')) {
    styleRules.push('- 基于数据和分析给出结论');
  }

  if (styleRules.length === 0) {
    return '';
  }

  return `
## 回应风格指南
${styleRules.join('\n')}
`;
}

/**
 * 构建完整的人格 System Prompt（包含角色定位和回应风格）
 */
export function buildFullPersonaPrompt(persona: AgentPersona): string {
  const basePrompt = buildPersonaPrompt(persona);
  const styleGuide = buildResponseStyleGuide(persona);

  return basePrompt + styleGuide;
}

/**
 * 为多个 Agent 构建协作提示
 */
export function buildTeamCollaborationPrompt(
  myPersona: AgentPersona,
  teammatePersonas: AgentPersona[]
): string {
  let prompt = `## 团队协作指南\n\n`;
  prompt += `你与以下 Agent 协作完成任务：\n\n`;

  teammatePersonas.forEach(teammate => {
    prompt += `### ${teammate.role}\n`;
    prompt += `- **ID**: ${teammate.id}\n`;
    prompt += `- **职责**: ${teammate.responsibilities.slice(0, 2).join('、')}\n`;
    if (teammate.collaboration) {
      prompt += `- **协作方式**: ${teammate.collaboration}\n`;
    }
    prompt += `\n`;
  });

  prompt += `### 你的协作角色\n`;
  if (myPersona.collaboration) {
    prompt += `${myPersona.collaboration}\n\n`;
  } else {
    prompt += `根据你的核心职责和性格特点，与团队成员紧密配合。\n\n`;
  }

  return prompt;
}
