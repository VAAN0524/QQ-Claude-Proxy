/**
 * SkillManagerAgent - 技能管理 Agent
 *
 * 处理技能相关的命令：
 * - 安装技能
 * - 列出技能
 * - 启用/禁用技能
 * - 卸载技能
 * - 搜索技能
 */

import { logger } from '../utils/logger.js';
import type {
  IAgent,
  AgentMessage,
  AgentContext,
  AgentResponse,
  AgentConfig,
} from './base/Agent.js';
import { AgentCapability } from './base/Agent.js';
import { SkillManager } from '../skills/SkillManager.js';

/**
 * 技能管理 Agent
 */
export class SkillManagerAgent implements IAgent {
  readonly id = 'skill-manager';
  readonly name = 'Skill Manager Agent';
  readonly description = '技能管理专家。负责技能的安装、卸载、启用、禁用和搜索。';
  readonly capabilities: AgentCapability[] = [
    AgentCapability.Code,
    AgentCapability.Analyze,
  ];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 50,
    timeout: 60000,
  };

  private skillManager: SkillManager;

  constructor() {
    this.skillManager = new SkillManager();
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    await this.skillManager.initialize();
    logger.info('[SkillManagerAgent] 初始化完成');
  }

  /**
   * 检查是否能处理该任务
   */
  canHandle(message: AgentMessage): number {
    const content = message.content;

    if (typeof content !== 'string') {
      return 0;
    }

    const keywords = [
      '安装技能', 'install skill', '添加技能', '技能',
      '卸载技能', 'uninstall skill', '删除技能',
      '启用技能', 'enable skill', '禁用技能', 'disable skill',
      '列出技能', 'list skills', '技能列表',
      '搜索技能', 'search skill', '查找技能',
    ];

    const lowerContent = content.toLowerCase();
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) {
        return 0.9;
      }
    }

    return 0;
  }

  /**
   * 处理消息
   */
  async process(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    try {
      const content = message.content as string;

      // 解析命令
      if (content.includes('安装') || content.includes('install') || content.includes('添加')) {
        return await this.handleInstall(content);
      }

      if (content.includes('卸载') || content.includes('uninstall') || content.includes('删除')) {
        return await this.handleUninstall(content);
      }

      if (content.includes('启用') || content.includes('enable')) {
        return await this.handleEnable(content, true);
      }

      if (content.includes('禁用') || content.includes('disable')) {
        return await this.handleEnable(content, false);
      }

      if (content.includes('列出') || content.includes('list') || content.includes('列表')) {
        return await this.handleList();
      }

      if (content.includes('搜索') || content.includes('search') || content.includes('查找')) {
        return await this.handleSearch(content);
      }

      // 默认：列出所有技能
      return await this.handleList();

    } catch (error) {
      logger.error(`[SkillManagerAgent] 处理失败: ${error}`);
      return {
        content: `技能管理失败: ${error instanceof Error ? error.message : String(error)}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 处理安装技能
   */
  private async handleInstall(content: string): Promise<AgentResponse> {
    // 提取 URL
    const urlMatch = content.match(/(?:https?:\/\/)?[\w\-]+(\.[\w\-]+)+[/#?]?.*\.(md|txt)?/i);
    if (!urlMatch) {
      return {
        content: `请提供技能文件的 URL

用法：
  安装技能 https://github.com/user/repo/blob/main/skills/my-skill/SKILL.md
  install skill https://raw.githubusercontent.com/.../SKILL.md`,
        agentId: this.id,
      };
    }

    const url = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;

    const result = await this.skillManager.installFromUrl(url, {
      autoEnable: true,
    });

    if (result) {
      return {
        content: `✅ 技能安装成功！

名称: ${result.name}
描述: ${result.description}
版本: ${result.version}
分类: ${result.category || '未分类'}
关键词: ${result.keywords.join(', ')}

状态: ${result.enabled ? '已启用' : '已禁用'}`,
        agentId: this.id,
      };
    }

    return {
      content: '❌ 技能安装失败，请检查 URL 是否正确',
      agentId: this.id,
    };
  }

  /**
   * 处理卸载技能
   */
  private async handleUninstall(content: string): Promise<AgentResponse> {
    // 提取技能名称
    const nameMatch = content.match(/(?:卸载|删除|uninstall)\s+(\S+)/i);
    if (!nameMatch) {
      return {
        content: `请提供要卸载的技能名称

用法：
  卸载技能 my-skill
  uninstall skill my-skill

可用的技能：
${this.listSkillNames()}`,
        agentId: this.id,
      };
    }

    const skillName = nameMatch[1];
    const success = await this.skillManager.uninstall(skillName);

    if (success) {
      return {
        content: `✅ 技能 "${skillName}" 已卸载`,
        agentId: this.id,
      };
    }

    return {
      content: `❌ 卸载失败：技能 "${skillName}" 不存在`,
      agentId: this.id,
    };
  }

  /**
   * 处理启用/禁用技能
   */
  private async handleEnable(content: string, enable: boolean): Promise<AgentResponse> {
    // 提取技能名称
    const nameMatch = content.match(/(?:启用|禁用|enable|disable)\s+(?:技能?)?\s*(\S+)/i);
    if (!nameMatch) {
      return {
        content: `请提供技能名称

用法：
  启用技能 my-skill
  禁用技能 my-skill
  enable my-skill
  disable my-skill

可用的技能：
${this.listSkillNames()}`,
        agentId: this.id,
      };
    }

    const skillName = nameMatch[1];
    const success = await this.skillManager.setEnabled(skillName, enable);

    if (success) {
      return {
        content: `✅ 技能 "${skillName}" 已${enable ? '启用' : '禁用'}`,
        agentId: this.id,
      };
    }

    return {
      content: `❌ 操作失败：技能 "${skillName}" 不存在`,
      agentId: this.id,
    };
  }

  /**
   * 处理列出技能
   */
  private async handleList(): Promise<AgentResponse> {
    const skills = this.skillManager.listSkills();
    const stats = this.skillManager.getStats();

    if (skills.length === 0) {
      return {
        content: `📦 技能列表

暂无已安装的技能。

安装技能示例：
  安装技能 https://github.com/.../SKILL.md`,
        agentId: this.id,
      };
    }

    const lines: string[] = [
      `📦 技能列表 (共 ${stats.total} 个，已启用 ${stats.enabled} 个)`,
      '',
    ];

    for (const skill of skills) {
      const status = skill.enabled ? '✅' : '❌';
      const category = skill.category ? `[${skill.category}] ` : '';

      lines.push(`${status} ${category}${skill.name}`);
      lines.push(`   ${skill.description}`);
      if (skill.keywords.length > 0) {
        lines.push(`   关键词: ${skill.keywords.join(', ')}`);
      }
      lines.push('');
    }

    return {
      content: lines.join('\n'),
      agentId: this.id,
    };
  }

  /**
   * 处理搜索技能
   */
  private async handleSearch(content: string): Promise<AgentResponse> {
    // 提取搜索词
    const searchMatch = content.match(/(?:搜索|查找|search)\s+(.+)/i);
    if (!searchMatch) {
      return {
        content: '请提供搜索关键词\n用法：搜索技能 代码重构',
        agentId: this.id,
      };
    }

    const query = searchMatch[1].trim();
    const results = await this.skillManager.searchSkills(query);

    if (results.length === 0) {
      return {
        content: `未找到匹配 "${query}" 的技能`,
        agentId: this.id,
      };
    }

    const lines: string[] = [
      `🔍 搜索结果: "${query}" (找到 ${results.length} 个)`,
      '',
    ];

    for (const skill of results) {
      lines.push(`📦 ${skill.name}`);
      lines.push(`   ${skill.description}`);
      lines.push('');
    }

    return {
      content: lines.join('\n'),
      agentId: this.id,
    };
  }

  /**
   * 列出技能名称
   */
  private listSkillNames(): string {
    const skills = this.skillManager.listSkills();
    return skills.map(s => `  - ${s.name}`).join('\n') || '  (无)';
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    logger.info('[SkillManagerAgent] 已清理资源');
  }
}

export default SkillManagerAgent;
