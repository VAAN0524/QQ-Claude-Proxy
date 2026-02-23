/**
 * 技能加载器 - OpenClaw 风格的渐进式 SKILL.md 系统
 *
 * 核心特性：
 * 1. 渐进式加载：元数据 → 完整内容 → 资源
 * 2. 动态构建工具描述
 * 3. 按需加载，优化 token 使用
 * 4. 支持技能元数据和完整文档
 *
 * 渐进式加载策略：
 * - 第1层（元数据）：始终加载，~100 tokens/技能
 * - 第2层（完整内容）：触发时加载，<5k tokens/技能
 * - 第3层（资源）：按需加载
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * 技能元数据（第1层 - 始终加载）
 */
export interface SkillMetadata {
  /** 技能名称 */
  name: string;
  /** 技能文件路径 */
  path: string;
  /** 简短描述（触发关键词） */
  trigger: string;
  /** 技能描述 */
  description: string;
  /** 是否已加载完整内容 */
  fullyLoaded: boolean;
}

/**
 * 技能完整定义（第2层 - 触发时加载）
 */
export interface SkillDefinition extends SkillMetadata {
  /** 技能能力列表 */
  capabilities: string[];
  /** 使用场景 */
  useCases: string[];
  /** 参数定义 */
  parameters: Record<string, { description: string; required: boolean }>;
  /** 输出格式说明 */
  outputFormat?: string;
  /** 注意事项 */
  notes?: string[];
  /** 完整的技能文档 */
  fullDocumentation: string;
}

/**
 * 技能加载器 - 渐进式加载实现
 */
export class SkillLoader {
  private skillsDir: string;
  /** 元数据缓存（第1层，始终加载） */
  private metadataCache: Map<string, SkillMetadata> = new Map();
  /** 完整内容缓存（第2层，按需加载） */
  private fullContentCache: Map<string, SkillDefinition> = new Map();

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  /**
   * 第1步：扫描所有技能，只加载元数据
   * 这是初始化时的轻量级扫描
   */
  async scanSkillsMetadata(): Promise<Map<string, SkillMetadata>> {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(this.skillsDir, entry.name);
          const skillMdPath = path.join(skillPath, 'SKILL.md');

          try {
            await fs.access(skillMdPath);
            const metadata = await this.loadSkillMetadata(entry.name, skillPath, skillMdPath);
            this.metadataCache.set(entry.name, metadata);
            logger.debug(`[SkillLoader] 扫描技能元数据: ${entry.name} - ${metadata.trigger}`);
          } catch {
            // 跳过没有 SKILL.md 的目录
          }
        }
      }

      logger.info(`[SkillLoader] 扫描完成，共 ${this.metadataCache.size} 个技能（仅元数据）`);
      return this.metadataCache;
    } catch (error) {
      logger.error(`[SkillLoader] 扫描技能失败: ${error}`);
      return this.metadataCache;
    }
  }

  /**
   * 加载技能元数据（只读取 frontmatter 和概述部分）
   */
  private async loadSkillMetadata(name: string, skillPath: string, skillMdPath: string): Promise<SkillMetadata> {
    const content = await fs.readFile(skillMdPath, 'utf-8');
    const lines = content.split('\n');

    let trigger = '';
    let description = '';

    // 解析 frontmatter
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 解析 frontmatter
      if (line.startsWith('name:')) {
        trigger = line.substring(5).trim().replace(/['"]/g, '');
      } else if (line.startsWith('description:')) {
        description = line.substring(12).trim().replace(/['"]/g, '');
      }

      // frontmatter 结束后停止
      if (line === '---' && i > 0) {
        break;
      }
    }

    return {
      name,
      path: skillPath,
      trigger: trigger || name,
      description: description || '暂无描述',
      fullyLoaded: false
    };
  }

  /**
   * 第2步：按需加载完整技能内容
   * 当技能被触发时调用此方法
   */
  async loadSkillFullContent(name: string): Promise<SkillDefinition | undefined> {
    // 如果已经加载过，直接返回
    if (this.fullContentCache.has(name)) {
      return this.fullContentCache.get(name);
    }

    const metadata = this.metadataCache.get(name);
    if (!metadata) {
      logger.warn(`[SkillLoader] 技能不存在: ${name}`);
      return undefined;
    }

    try {
      const skillMdPath = path.join(metadata.path, 'SKILL.md');
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const skillDef = this.parseSkillFullContent(metadata, content);

      this.fullContentCache.set(name, skillDef);
      metadata.fullyLoaded = true;

      logger.info(`[SkillLoader] 按需加载完整内容: ${name} (${content.length} 字符)`);
      return skillDef;
    } catch (error) {
      logger.error(`[SkillLoader] 加载技能完整内容失败: ${name} - ${error}`);
      return undefined;
    }
  }

  /**
   * 解析完整的 SKILL.md 文件
   */
  private parseSkillFullContent(metadata: SkillMetadata, content: string): SkillDefinition {
    const lines = content.split('\n');

    const capabilities: string[] = [];
    const useCases: string[] = [];
    const parameters: Record<string, { description: string; required: boolean }> = {};
    let outputFormat = '';
    const notes: string[] = [];

    let currentSection = '';

    for (const line of lines) {
      // 检测章节标题
      if (line.startsWith('## ')) {
        currentSection = line.substring(3).trim();
        continue;
      }

      // 解析各个章节
      switch (currentSection) {
        case '功能':
        case '能力':
          if (line.startsWith('- ')) {
            capabilities.push(line.substring(2));
          }
          break;

        case '使用场景':
          if (line.startsWith('- ')) {
            useCases.push(line.substring(2));
          }
          break;

        case '参数':
          const paramMatch = line.match(/- `(\w+)` \((必需|可选|required|optional)\): (.+)/);
          if (paramMatch) {
            parameters[paramMatch[1]] = {
              description: paramMatch[3],
              required: paramMatch[2] === '必需' || paramMatch[2] === 'required'
            };
          }
          break;

        case '输出格式':
          outputFormat += line + '\n';
          break;

        case '注意事项':
          if (line.startsWith('- ')) {
            notes.push(line.substring(2));
          }
          break;
      }
    }

    return {
      ...metadata,
      fullyLoaded: true,
      capabilities,
      useCases,
      parameters,
      outputFormat: outputFormat.trim() || undefined,
      notes: notes.length > 0 ? notes : undefined,
      fullDocumentation: content
    };
  }

  /**
   * 获取技能元数据
   */
  getSkillMetadata(name: string): SkillMetadata | undefined {
    return this.metadataCache.get(name);
  }

  /**
   * 获取所有技能元数据
   */
  getAllMetadata(): Map<string, SkillMetadata> {
    return this.metadataCache;
  }

  /**
   * 获取完整技能定义（会触发按需加载）
   */
  async getSkill(name: string): Promise<SkillDefinition | undefined> {
    // 先检查完整内容缓存
    if (this.fullContentCache.has(name)) {
      return this.fullContentCache.get(name);
    }

    // 按需加载
    return await this.loadSkillFullContent(name);
  }

  /**
   * 获取所有已加载的完整技能定义
   */
  getLoadedSkills(): Map<string, SkillDefinition> {
    return this.fullContentCache;
  }

  /**
   * 将技能元数据转换为工具定义（轻量级）
   */
  metadataToTool(metadata: SkillMetadata): any {
    return {
      type: 'function',
      function: {
        name: metadata.name,
        description: metadata.description,
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '需要该技能处理的具体问题或任务'
            }
          },
          required: ['query']
        }
      }
    };
  }

  /**
   * 将完整技能定义转换为工具定义
   */
  skillToTool(skill: SkillDefinition): any {
    return {
      type: 'function',
      function: {
        name: skill.name,
        description: skill.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(skill.parameters).map(([key, param]) => [
              key,
              {
                type: 'string',
                description: param.description
              }
            ])
          ),
          required: Object.entries(skill.parameters)
            .filter(([_, param]) => param.required)
            .map(([key, _]) => key)
        }
      }
    };
  }

  /**
   * 构建轻量级系统提示词（只包含元数据，第1层）
   * 这个方法生成的提示词始终在context中，约100 tokens/技能
   */
  buildMetadataSystemPrompt(basePrompt: string): string {
    const metadatas = Array.from(this.metadataCache.values());

    if (metadatas.length === 0) {
      return basePrompt;
    }

    // 只包含技能名称和触发描述
    const skillsList = metadatas.map(md =>
      `- \`${md.name}\`: ${md.description}`
    ).join('\n');

    return `
${basePrompt}

# 可用技能（按需加载）

你有以下专业技能可用。当你需要使用某个技能时，系统会自动加载该技能的完整说明。

${skillsList}

**重要：**
- 技能采用按需加载机制，只有在使用时才会加载完整内容
- 当你决定使用某个技能时，先说明需要使用该技能，然后等待系统加载完整内容
- 不同技能可以组合使用来解决复杂问题
    `.trim();
  }

  /**
   * 获取技能的完整内容作为系统提示词（第2层）
   * 当某个技能被触发时调用此方法
   */
  buildSkillFullPrompt(skillName: string): string {
    const skill = this.fullContentCache.get(skillName);
    if (!skill) {
      return `## 技能: ${skillName}\n\n技能内容未加载。`;
    }

    let prompt = `## 技能: ${skill.name}\n\n`;

    if (skill.capabilities.length > 0) {
      prompt += `### 能力\n${skill.capabilities.map(c => `- ${c}`).join('\n')}\n\n`;
    }

    if (skill.useCases.length > 0) {
      prompt += `### 使用场景\n${skill.useCases.map(uc => `- ${uc}`).join('\n')}\n\n`;
    }

    if (Object.keys(skill.parameters).length > 0) {
      prompt += `### 参数\n${Object.entries(skill.parameters).map(([key, param]) =>
        `- \`${key}\` (${param.required ? '必需' : '可选'}): ${param.description}`
      ).join('\n')}\n\n`;
    }

    if (skill.outputFormat) {
      prompt += `### 输出格式\n${skill.outputFormat}\n\n`;
    }

    if (skill.notes && skill.notes.length > 0) {
      prompt += `### 注意事项\n${skill.notes.map(n => `- ${n}`).join('\n')}\n\n`;
    }

    return prompt.trim();
  }

  /**
   * @deprecated 使用 buildMetadataSystemPrompt 代替
   * 保留此方法以兼容旧代码
   */
  buildSkillSystemPrompt(basePrompt: string): string {
    return this.buildMetadataSystemPrompt(basePrompt);
  }

  /**
   * @deprecated 使用 scanSkillsMetadata 代替
   * 保留此方法以兼容旧代码
   */
  async loadAllSkills(): Promise<Map<string, SkillDefinition>> {
    await this.scanSkillsMetadata();

    // 为了兼容，返回所有技能（但只包含元数据）
    const result = new Map<string, SkillDefinition>();
    for (const [name, metadata] of this.metadataCache) {
      // 创建一个基本的 SkillDefinition 对象
      result.set(name, {
        ...metadata,
        capabilities: [],
        useCases: [],
        parameters: {},
        fullDocumentation: ''
      });
    }
    return result;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalSkills: this.metadataCache.size,
      loadedSkills: this.fullContentCache.size,
      loadingRatio: this.metadataCache.size > 0
        ? `${this.fullContentCache.size}/${this.metadataCache.size}`
        : '0/0'
    };
  }
}
