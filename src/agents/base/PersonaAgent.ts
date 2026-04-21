/**
 * PersonaAgent - 带人格设定的 Agent 基类
 *
 * 提供人格设定的默认实现，Agent 可以继承此类自动获得人格能力
 */

import type { IAgent, AgentConfig, AgentMessage, AgentContext, AgentResponse, AgentCapability } from './Agent.js';
import type { AgentPersona } from './Agent.js';
import { buildResponseStyleGuide } from '../PersonaPromptBuilder.js';

// 临时的 getAgentPersona 实现，待移除
function getAgentPersona(agentId: string): AgentPersona | undefined {
  return undefined;
}

/**
 * 人格风格选项
 */
export interface PersonaStyleOptions {
  /** 语气 */
  tone?: 'professional' | 'friendly' | 'casual' | 'neutral';
  /** 详细程度 */
  verbosity?: 'concise' | 'normal' | 'detailed';
  /** 是否包含表情符号 */
  includeEmojis?: boolean;
}

/**
 * 带人格设定的 Agent 抽象基类
 *
 * 使用方式：
 * ```typescript
 * class MyAgent extends PersonaAgent {
 *   constructor() {
 *     super('my-agent', 'My Agent', 'Description', ...);
 *   }
 * }
 * ```
 */
export abstract class PersonaAgent implements IAgent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: AgentCapability[];
  readonly config: AgentConfig;

  /** 人格设定（可选） */
  protected _persona?: AgentPersona;

  constructor(
    id: string,
    name: string,
    description: string,
    capabilities: AgentCapability[],
    config: AgentConfig,
    personaId?: string
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.capabilities = capabilities;
    this.config = config;

    // 如果提供了 personaId，自动加载人格设定
    if (personaId) {
      this._persona = getAgentPersona(personaId);
      if (!this._persona) {
        console.warn(`[PersonaAgent] No persona found for ID: ${personaId}`);
      }
    }
  }

  /**
   * 获取 Agent 人格设定
   */
  getPersona(): AgentPersona {
    if (this._persona) {
      return this._persona;
    }

    // 返回默认人格
    return this.getDefaultPersona();
  }

  /**
   * 获取默认人格设定
   * 子类可以覆盖此方法提供自定义默认人格
   */
  protected getDefaultPersona(): AgentPersona {
    return {
      id: this.id,
      role: this.name,
      responsibilities: [`处理与 ${this.name} 相关的任务`],
      traits: ['专业', '可靠', '高效'],
      principles: ['用户需求优先', '确保结果质量', '及时响应'],
    };
  }

  /**
   * 根据人格设定调整响应风格
   */
  applyPersonaStyle(
    content: string,
    options: PersonaStyleOptions = {}
  ): string {
    const persona = this.getPersona();
    let adjusted = content;

    // 根据性格特点调整
    const traitsLower = persona.traits?.join(' ').toLowerCase() || '';

    // 简洁风格
    if (traitsLower.includes('简洁') || options.verbosity === 'concise') {
      adjusted = this.makeConcise(adjusted);
    }

    // 详细风格
    if (traitsLower.includes('详细') || options.verbosity === 'detailed') {
      adjusted = this.makeDetailed(adjusted);
    }

    // 友好风格
    if (traitsLower.includes('友好') || options.tone === 'friendly') {
      adjusted = this.makeFriendly(adjusted);
    }

    // 专业风格
    if (traitsLower.includes('专业') || options.tone === 'professional') {
      adjusted = this.makeProfessional(adjusted);
    }

    // 添加表情符号
    if (options.includeEmojis && (traitsLower.includes('活泼') || traitsLower.includes('友好'))) {
      adjusted = this.addEmojis(adjusted);
    }

    return adjusted;
  }

  /**
   * 使内容更简洁
   */
  protected makeConcise(content: string): string {
    // 移除冗余词
    const redundantWords = [
      '基本上', '一般来说', '其实', '事实上', '总的来说',
      'basically', 'generally', 'actually', 'in fact', 'overall'
    ];

    let result = content;
    redundantWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b[,.，。]?\\s*`, 'gi');
      result = result.replace(regex, '');
    });

    // 移除过长的解释
    result = result.replace(/（[^）]{50,}）/g, '（详情略）');

    return result.trim();
  }

  /**
   * 使内容更详细
   */
  protected makeDetailed(content: string): string {
    // 在关键步骤后添加更多解释
    let result = content;

    // 如果有步骤列表，在每个步骤后添加 "具体来说"
    result = result.replace(/(\d+\.\s+[^\n]+)\n/g, '$1\n  具体来说，\n');

    return result;
  }

  /**
   * 使内容更友好
   */
  protected makeFriendly(content: string): string {
    // 添加友好前缀和后缀
    const friendlyPrefixes = [
      '好的，', '没问题，', '当然可以，', '我很乐意帮助你，'
    ];
    const friendlySuffixes = [
      '有什么问题随时问我。', '希望这对你有帮助！', '还有其他需要吗？'
    ];

    let result = content;

    // 如果没有友好前缀，添加一个
    const hasFriendlyPrefix = friendlyPrefixes.some(p => result.startsWith(p));
    if (!hasFriendlyPrefix && !result.startsWith('#')) {
      result = friendlyPrefixes[Math.floor(Math.random() * friendlyPrefixes.length)] + result;
    }

    return result;
  }

  /**
   * 使内容更专业
   */
  protected makeProfessional(content: string): string {
    // 移除过于口语化的表达
    const informalReplacements: Record<string, string> = {
      '好的': '收到',
      '没问题': '明白',
      '搞定': '完成',
      'OK': '确认',
      '好的，明白了': '确认，已理解',
    };

    let result = content;
    Object.entries(informalReplacements).forEach(([informal, formal]) => {
      result = result.replace(new RegExp(informal, 'g'), formal);
    });

    return result;
  }

  /**
   * 添加表情符号
   */
  protected addEmojis(content: string): string {
    const emojiMap: Record<string, string> = {
      '完成': ' ✅',
      '成功': ' 🎉',
      '错误': ' ❌',
      '警告': ' ⚠️',
      '信息': ' ℹ️',
      '问题': ' 🤔',
      '建议': ' 💡',
      '文件': ' 📄',
      '代码': ' 💻',
      '搜索': ' 🔍',
      '分析': ' 📊',
    };

    let result = content;
    Object.entries(emojiMap).forEach(([keyword, emoji]) => {
      result = result.replace(new RegExp(keyword, 'g'), keyword + emoji);
    });

    return result;
  }

  /**
   * 构建带人格的 System Prompt
   * 子类可以在自己的 buildSystemPrompt 中调用此方法
   */
  protected buildPersonaSystemPrompt(basePrompt: string): string {
    const persona = this.getPersona();
    const styleGuide = buildResponseStyleGuide(persona);

    if (!styleGuide) {
      return basePrompt;
    }

    return basePrompt + '\n\n' + styleGuide;
  }

  // ========== 抽象方法，子类必须实现 ==========

  abstract process(message: AgentMessage, context: AgentContext): Promise<AgentResponse>;
  abstract canHandle(message: AgentMessage): Promise<number> | number;

  // ========== 可选方法，子类可以覆盖 ==========

  async initialize?(): Promise<void>;
  async cleanup?(): Promise<void>;
}
