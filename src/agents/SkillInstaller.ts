/**
 * SkillInstaller - 技能自动发现和安装服务
 *
 * 功能：
 * 1. 按 URL 安装：从指定的 URL 下载技能
 * 2. 按名称搜索：从技能库搜索技能
 * 3. 按功能搜索：描述需求，自动匹配技能
 * 4. 技能验证：安全检查和格式验证
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * 技能来源
 */
export enum SkillSource {
  /** GitHub URL */
  GitHub = 'github',
  /** GitLab URL */
  GitLab = 'gitlab',
  /** 直接 URL */
  Direct = 'direct',
  /** 本地文件 */
  Local = 'local',
  /** 技能库搜索 */
  Registry = 'registry',
}

/**
 * 技能搜索结果
 */
export interface SkillSearchResult {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 安装来源 */
  source: SkillSource;
  /** URL 或路径 */
  url: string;
  /** 版本 */
  version?: string;
  /** 作者 */
  author?: string;
  /** 匹配分数 */
  score: number;
}

/**
 * 技能安装选项
 */
export interface SkillInstallOptions {
  /** 目标目录（默认：skills/） */
  targetDir?: string;
  /** 是否覆盖已存在的技能 */
  overwrite?: boolean;
  /** 安装后是否验证 */
  validate?: boolean;
}

/**
 * 技能安装结果
 */
export interface SkillInstallResult {
  /** 是否成功 */
  success: boolean;
  /** 技能名称 */
  name: string;
  /** 安装路径 */
  path: string;
  /** 错误信息 */
  error?: string;
  /** 验证结果 */
  validation?: {
    valid: boolean;
    issues: string[];
  };
}

/**
 * 已知的技能库（可扩展）
 */
const SKILL_REGISTRIES = [
  {
    name: 'Official Skills',
    baseUrl: 'https://github.com/anthropics/claude-code-skills',
    description: '官方 Claude Code 技能库',
  },
  {
    name: 'Community Skills',
    baseUrl: 'https://github.com/topics/claude-code-skill',
    description: '社区技能库',
  },
];

/**
 * 技能安装器
 */
export class SkillInstaller {
  private skillsDir: string;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir || path.join(process.cwd(), 'skills');
  }

  /**
   * 按 URL 安装技能
   */
  async installFromUrl(
    url: string,
    options: SkillInstallOptions = {}
  ): Promise<SkillInstallResult> {
    try {
      logger.info(`[SkillInstaller] 从 URL 安装技能: ${url}`);

      // 解析 URL 确定来源
      const source = this.detectSource(url);

      // 下载技能内容
      const skillContent = await this.fetchSkillContent(url, source);

      // 提取技能名称
      const skillName = this.extractSkillName(url, skillContent);

      // 验证技能格式
      const validation = this.validateSkill(skillContent);

      if (!validation.valid && options.validate !== false) {
        return {
          success: false,
          name: skillName,
          path: '',
          error: '技能验证失败',
          validation,
        };
      }

      // 创建技能目录
      const targetDir = options.targetDir || this.skillsDir;
      const skillPath = path.join(targetDir, skillName);
      await fs.mkdir(skillPath, { recursive: true });

      // 写入 SKILL.md
      const skillFilePath = path.join(skillPath, 'SKILL.md');
      await fs.writeFile(skillFilePath, skillContent, 'utf-8');

      logger.info(`[SkillInstaller] 技能安装成功: ${skillName}`);

      return {
        success: true,
        name: skillName,
        path: skillPath,
        validation,
      };
    } catch (error) {
      logger.error(`[SkillInstaller] 安装失败: ${error}`);
      return {
        success: false,
        name: '',
        path: '',
        error: String(error),
      };
    }
  }

  /**
   * 按名称搜索技能
   */
  async searchByName(query: string): Promise<SkillSearchResult[]> {
    logger.info(`[SkillInstaller] 按名称搜索技能: ${query}`);

    const results: SkillSearchResult[] = [];

    // 在本地技能中搜索
    const localSkills = await this.searchLocalSkills(query);
    results.push(...localSkills);

    // TODO: 在远程技能库中搜索
    // const remoteSkills = await this.searchRemoteSkills(query);
    // results.push(...remoteSkills);

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 按功能描述搜索技能
   */
  async searchByFunction(description: string): Promise<SkillSearchResult[]> {
    logger.info(`[SkillInstaller] 按功能搜索技能: ${description}`);

    // 提取关键词
    const keywords = this.extractKeywords(description);

    // 搜索匹配的技能
    const results: SkillSearchResult[] = [];

    // 搜索本地技能
    const localSkills = await this.searchLocalSkillsByKeywords(keywords);
    results.push(...localSkills);

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 列出已安装的技能
   */
  async listInstalled(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {
      return [];
    }
  }

  /**
   * 卸载技能
   */
  async uninstall(skillName: string): Promise<boolean> {
    try {
      const skillPath = path.join(this.skillsDir, skillName);
      await fs.rm(skillPath, { recursive: true, force: true });
      logger.info(`[SkillInstaller] 技能已卸载: ${skillName}`);
      return true;
    } catch (error) {
      logger.error(`[SkillInstaller] 卸载失败: ${error}`);
      return false;
    }
  }

  /**
   * 检测技能来源
   */
  private detectSource(url: string): SkillSource {
    if (url.includes('github.com')) return SkillSource.GitHub;
    if (url.includes('gitlab.com')) return SkillSource.GitLab;
    if (url.startsWith('http://') || url.startsWith('https://')) return SkillSource.Direct;
    if (url.startsWith('/')) return SkillSource.Local;
    return SkillSource.Registry;
  }

  /**
   * 获取技能内容
   */
  private async fetchSkillContent(url: string, source: SkillSource): Promise<string> {
    switch (source) {
      case SkillSource.GitHub:
        return this.fetchFromGitHub(url);
      case SkillSource.GitLab:
        return this.fetchFromGitLab(url);
      case SkillSource.Direct:
        return this.fetchFromDirectUrl(url);
      case SkillSource.Local:
        return this.fetchFromLocal(url);
      default:
        throw new Error(`不支持的技能来源: ${source}`);
    }
  }

  /**
   * 从 GitHub 获取技能
   */
  private async fetchFromGitHub(url: string): Promise<string> {
    // 转换 GitHub URL 为 raw 内容 URL
    // https://github.com/user/repo/blob/main/skills/name/SKILL.md
    // -> https://raw.githubusercontent.com/user/repo/main/skills/name/SKILL.md

    let rawUrl = url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');

    const response = await fetch(rawUrl);
    if (!response.ok) {
      throw new Error(`GitHub 请求失败: ${response.status}`);
    }

    return await response.text();
  }

  /**
   * 从 GitLab 获取技能
   */
  private async fetchFromGitLab(url: string): Promise<string> {
    // GitLab raw URL: /-/raw/
    const rawUrl = url.replace('/-/blob/', '/-/raw/');

    const response = await fetch(rawUrl);
    if (!response.ok) {
      throw new Error(`GitLab 请求失败: ${response.status}`);
    }

    return await response.text();
  }

  /**
   * 从直接 URL 获取技能
   */
  private async fetchFromDirectUrl(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP 请求失败: ${response.status}`);
    }

    return await response.text();
  }

  /**
   * 从本地文件获取技能
   */
  private async fetchFromLocal(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  }

  /**
   * 提取技能名称
   */
  private extractSkillName(url: string, content: string): string {
    // 首先尝试从内容中解析
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    if (nameMatch) {
      return nameMatch[1].trim().replace(/['"]/g, '');
    }

    // 从 URL 中提取
    const urlMatch = url.match(/\/([^\/]+)\/?$/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // 生成默认名称
    return `skill_${Date.now()}`;
  }

  /**
   * 验证技能格式
   */
  private validateSkill(content: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // 检查 frontmatter
    if (!content.startsWith('---')) {
      issues.push('缺少 frontmatter (应该以 --- 开头)');
    }

    // 检查必需字段
    const hasName = /^name:\s*(.+)$/m.test(content);
    const hasDescription = /^description:\s*(.+)$/m.test(content);

    if (!hasName) {
      issues.push('缺少 name 字段');
    }
    if (!hasDescription) {
      issues.push('缺少 description 字段');
    }

    // 检查是否有内容章节
    const hasContent = /^(##|#\s+)/m.test(content);
    if (!hasContent) {
      issues.push('缺少内容章节');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * 搜索本地技能
   */
  private async searchLocalSkills(query: string): Promise<SkillSearchResult[]> {
    const results: SkillSearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    try {
      const skills = await this.listInstalled();

      for (const skillName of skills) {
        const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');
        try {
          const content = await fs.readFile(skillPath, 'utf-8');

          // 提取描述
          const descMatch = content.match(/^description:\s*(.+)$/m);
          const description = descMatch ? descMatch[1] : '';

          // 计算匹配分数
          let score = 0;
          if (skillName.toLowerCase().includes(lowerQuery)) {
            score += 10;
          }
          if (description.toLowerCase().includes(lowerQuery)) {
            score += 5;
          }

          if (score > 0) {
            results.push({
              name: skillName,
              description: description.replace(/['"]/g, ''),
              source: SkillSource.Local,
              url: skillPath,
              score,
            });
          }
        } catch {
          // 跳过无法读取的技能
        }
      }
    } catch {
      // 忽略错误
    }

    return results;
  }

  /**
   * 按关键词搜索本地技能
   */
  private async searchLocalSkillsByKeywords(keywords: string[]): Promise<SkillSearchResult[]> {
    const results: SkillSearchResult[] = [];

    try {
      const skills = await this.listInstalled();

      for (const skillName of skills) {
        const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');
        try {
          const content = await fs.readFile(skillPath, 'utf-8');
          const lowerContent = content.toLowerCase();

          // 提取描述
          const descMatch = content.match(/^description:\s*(.+)$/m);
          const description = descMatch ? descMatch[1] : '';

          // 计算匹配分数
          let score = 0;
          for (const keyword of keywords) {
            if (lowerContent.includes(keyword)) {
              score += 2;
            }
          }

          if (score > 0) {
            results.push({
              name: skillName,
              description: description.replace(/['"]/g, ''),
              source: SkillSource.Local,
              url: skillPath,
              score,
            });
          }
        } catch {
          // 跳过无法读取的技能
        }
      }
    } catch {
      // 忽略错误
    }

    return results;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 简单的关键词提取
    const words = text.toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    // 去重并返回
    return Array.from(new Set(words));
  }

  /**
   * 获取安装帮助信息
   */
  getInstallHelp(): string {
    return `
## 技能安装帮助

### 按 URL 安装
"帮我安装这个技能: https://github.com/xxx/skills/blob/main/skill-name/SKILL.md"

### 按名称搜索
"搜索有关于 xxx 的技能"
"列出所有已安装的技能"

### 按功能搜索
"找一个能帮我写代码的技能"
"我需要一个处理图片的技能"

### 管理技能
"列出已安装的技能"
"卸载 skill-name"
    `.trim();
  }
}

export default SkillInstaller;
