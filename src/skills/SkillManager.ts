/**
 * SkillManager - 技能自动管理系统
 *
 * 功能：
 * - 从远程仓库安装技能
 * - 本地技能缓存
 * - 动态加载/卸载
 * - 热重载
 * - 技能市场集成
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * 远程技能仓库配置
 */
interface SkillRepository {
  /** 仓库名称 */
  name: string;
  /** Git URL 或 API 端点 */
  url: string;
  /** 类型 */
  type: 'github' | 'gitlab' | 'local' | 'http';
  /** 描述 */
  description?: string;
}

/**
 * 技能元数据
 */
export interface SkillMetadata {
  /** 技能名称 */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description: string;
  /** 作者 */
  author?: string;
  /** 关键词 */
  keywords: string[];
  /** 分类 */
  category?: string;
  /** 依赖 */
  dependencies?: string[];
  /** 文件路径 */
  filePath: string;
  /** 是否启用 */
  enabled: boolean;
  /** 安装时间 */
  installedAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
}

/**
 * 安装选项
 */
interface InstallOptions {
  /** 强制重新安装 */
  force?: boolean;
  /** 安装后自动启用 */
  autoEnable?: boolean;
  /** 验证签名 */
  verifySignature?: boolean;
}

/**
 * 技能管理器
 */
export class SkillManager {
  private repositories: Map<string, SkillRepository> = new Map();
  private localSkills: Map<string, SkillMetadata> = new Map();
  private skillsCacheDir: string;
  private localSkillsDir: string;
  private indexFile: string;

  constructor(options: { cacheDir?: string; localDir?: string } = {}) {
    this.skillsCacheDir = options.cacheDir || path.join(process.cwd(), 'data', 'skills-cache');
    this.localSkillsDir = options.localDir || path.join(process.cwd(), 'skills', 'local');
    this.indexFile = path.join(this.skillsCacheDir, 'skills-index.json');

    this.initializeRepositories();
  }

  /**
   * 初始化默认仓库
   */
  private initializeRepositories(): void {
    // 添加官方技能仓库
    this.addRepository({
      name: 'official',
      url: 'https://api.github.com/repos/anthropics/claude-code/contents/skills',
      type: 'github',
      description: '官方 Claude Code 技能',
    });

    // 添加社区技能仓库
    this.addRepository({
      name: 'community',
      url: 'https://api.github.com/search/repositories?q=topic:claude-code-skill',
      type: 'github',
      description: '社区贡献的技能',
    });
  }

  /**
   * 添加仓库
   */
  addRepository(repo: SkillRepository): void {
    this.repositories.set(repo.name, repo);
    logger.info(`[SkillManager] 添加仓库: ${repo.name}`);
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    // 创建目录
    await fs.mkdir(this.skillsCacheDir, { recursive: true });
    await fs.mkdir(this.localSkillsDir, { recursive: true });

    // 加载索引
    await this.loadIndex();

    // 扫描本地技能
    await this.scanLocalSkills();

    logger.info(`[SkillManager] 初始化完成，已加载 ${this.localSkills.size} 个技能`);
  }

  /**
   * 扫描本地技能目录
   */
  private async scanLocalSkills(): Promise<void> {
    try {
      const entries = await fs.readdir(this.localSkillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = path.join(this.localSkillsDir, entry.name);
          const skillFile = path.join(skillDir, 'SKILL.md');

          try {
            await fs.access(skillFile);
            const metadata = await this.parseSkillMetadata(skillFile);
            if (metadata) {
              this.localSkills.set(metadata.name, metadata);
            }
          } catch {
            // 忽略无效的技能目录
          }
        }
      }
    } catch {
      // 目录不存在，忽略
    }
  }

  /**
   * 解析技能元数据
   */
  private async parseSkillMetadata(filePath: string): Promise<SkillMetadata | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const metadata: Partial<SkillMetadata> = {
        filePath,
        enabled: true,
        installedAt: new Date(),
        updatedAt: new Date(),
        keywords: [],
      };

      let inFrontmatter = false;

      for (const line of lines) {
        // 检测 YAML frontmatter 开始
        if (line.trim() === '---') {
          if (!inFrontmatter) {
            inFrontmatter = true;
            continue;
          } else {
            inFrontmatter = false;
            break;
          }
        }

        if (inFrontmatter) {
          const [key, ...valueParts] = line.split(':');
          const value = valueParts.join(':').trim();

          switch (key.trim()) {
            case 'name':
              metadata.name = value;
              break;
            case 'description':
              metadata.description = value.replace(/['"]/g, '');
              break;
            case 'author':
              metadata.author = value;
              break;
            case 'version':
              metadata.version = value;
              break;
            case 'category':
              metadata.category = value;
              break;
            case 'keywords':
              metadata.keywords = value.split(',').map(k => k.trim());
              break;
          }
        }
      }

      if (!metadata.name || !metadata.description) {
        return null;
      }

      return metadata as SkillMetadata;
    } catch {
      return null;
    }
  }

  /**
   * 从远程仓库搜索技能
   */
  async searchSkills(query: string, options: { category?: string; limit?: number } = {}): Promise<SkillMetadata[]> {
    const results: SkillMetadata[] = [];
    const limit = options.limit || 10;

    // 搜索本地缓存
    for (const skill of this.localSkills.values()) {
      if (this.matchesQuery(skill, query, options.category)) {
        results.push(skill);
        if (results.length >= limit) break;
      }
    }

    // TODO: 从远程仓库搜索
    // 需要实现 GitHub API 调用

    return results;
  }

  /**
   * 匹配查询
   */
  private matchesQuery(skill: SkillMetadata, query: string, category?: string): boolean {
    const lowerQuery = query.toLowerCase();

    // 名称匹配
    if (skill.name.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // 描述匹配
    if (skill.description.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // 关键词匹配
    if (skill.keywords.some(k => k.toLowerCase().includes(lowerQuery))) {
      return true;
    }

    // 分类匹配
    if (category && skill.category === category) {
      return true;
    }

    return false;
  }

  /**
   * 从 URL 安装技能
   */
  async installFromUrl(url: string, options: InstallOptions = {}): Promise<SkillMetadata | null> {
    logger.info(`[SkillManager] 从 URL 安装技能: ${url}`);

    try {
      // 解析 URL 类型
      if (url.includes('github.com')) {
        return await this.installFromGitHub(url, options);
      } else {
        // 直接下载
        return await this.downloadSkill(url, options);
      }
    } catch (error) {
      logger.error(`[SkillManager] 安装失败: ${error}`);
      return null;
    }
  }

  /**
   * 从 GitHub 安装技能
   */
  private async installFromGitHub(url: string, options: InstallOptions): Promise<SkillMetadata | null> {
    // 解析 GitHub URL
    // 例如: https://github.com/user/repo/blob/main/skills/my-skill/SKILL.md
    const githubRegex = /github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)/;
    const match = url.match(githubRegex);

    if (!match) {
      throw new Error('无效的 GitHub URL');
    }

    const [, user, repo, branch, filePath] = match;
    const rawUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`;

    return await this.downloadSkill(rawUrl, options);
  }

  /**
   * 下载技能
   */
  private async downloadSkill(url: string, options: InstallOptions): Promise<SkillMetadata | null> {
    try {
      // 下载文件
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const content = await response.text();

      // 解析技能名称
      const nameMatch = content.match(/name:\s*([^\n]+)/);
      const skillName = nameMatch ? nameMatch[1].trim().replace(/['"]/g, '') : `skill-${Date.now()}`;

      // 创建技能目录
      const skillDir = path.join(this.localSkillsDir, skillName);
      await fs.mkdir(skillDir, { recursive: true });

      // 写入 SKILL.md
      const skillFile = path.join(skillDir, 'SKILL.md');
      await fs.writeFile(skillFile, content, 'utf-8');

      // 解析元数据
      const metadata = await this.parseSkillMetadata(skillFile);
      if (metadata) {
        metadata.enabled = options.autoEnable !== false;
        this.localSkills.set(skillName, metadata);
        await this.saveIndex();

        logger.info(`[SkillManager] 技能安装成功: ${skillName}`);
        return metadata;
      }

      return null;
    } catch (error) {
      logger.error(`[SkillManager] 下载失败: ${error}`);
      return null;
    }
  }

  /**
   * 卸载技能
   */
  async uninstall(skillName: string): Promise<boolean> {
    const skill = this.localSkills.get(skillName);
    if (!skill) {
      return false;
    }

    try {
      const skillDir = path.dirname(skill.filePath);
      await fs.rm(skillDir, { recursive: true, force: true });
      this.localSkills.delete(skillName);
      await this.saveIndex();

      logger.info(`[SkillManager] 技能已卸载: ${skillName}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 启用/禁用技能
   */
  async setEnabled(skillName: string, enabled: boolean): Promise<boolean> {
    const skill = this.localSkills.get(skillName);
    if (!skill) {
      return false;
    }

    skill.enabled = enabled;
    await this.saveIndex();

    logger.info(`[SkillManager] 技能 ${enabled ? '已启用' : '已禁用'}: ${skillName}`);
    return true;
  }

  /**
   * 更新技能
   */
  async update(skillName: string): Promise<boolean> {
    const skill = this.localSkills.get(skillName);
    if (!skill) {
      return false;
    }

    // TODO: 从原始 URL 重新下载
    logger.info(`[SkillManager] 更新技能: ${skillName}`);
    return true;
  }

  /**
   * 列出所有技能
   */
  listSkills(options: { enabled?: boolean; category?: string } = {}): SkillMetadata[] {
    const skills = Array.from(this.localSkills.values());

    return skills.filter(skill => {
      if (options.enabled !== undefined && skill.enabled !== options.enabled) {
        return false;
      }
      if (options.category && skill.category !== options.category) {
        return false;
      }
      return true;
    });
  }

  /**
   * 获取技能内容
   */
  async getSkillContent(skillName: string): Promise<string | null> {
    const skill = this.localSkills.get(skillName);
    if (!skill) {
      return null;
    }

    try {
      return await fs.readFile(skill.filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 加载索引
   */
  private async loadIndex(): Promise<void> {
    try {
      const content = await fs.readFile(this.indexFile, 'utf-8');
      const data = JSON.parse(content);

      for (const skillData of data.skills) {
        const skill: SkillMetadata = {
          ...skillData,
          installedAt: new Date(skillData.installedAt),
          updatedAt: new Date(skillData.updatedAt),
        };
        this.localSkills.set(skill.name, skill);
      }
    } catch {
      // 索引文件不存在，忽略
    }
  }

  /**
   * 保存索引
   */
  private async saveIndex(): Promise<void> {
    const data = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      skills: Array.from(this.localSkills.values()),
    };

    await fs.writeFile(this.indexFile, JSON.stringify(data, null, 2));
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    categories: Record<string, number>;
  } {
    const skills = Array.from(this.localSkills.values());
    const categories: Record<string, number> = {};

    for (const skill of skills) {
      if (skill.category) {
        categories[skill.category] = (categories[skill.category] || 0) + 1;
      }
    }

    return {
      total: skills.length,
      enabled: skills.filter(s => s.enabled).length,
      disabled: skills.filter(s => !s.enabled).length,
      categories,
    };
  }
}

export default SkillManager;
