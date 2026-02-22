/**
 * 模式管理器
 *
 * 管理两种 Agent 模式的切换：
 * - CLI 模式：调用本地 Claude Code CLI
 * - Team 模式：GLM Coordinator + 专业 Agents
 */

import { logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Agent 模式类型
 */
export enum AgentMode {
  CLI = 'cli',           // Claude Code CLI 模式
  TEAM = 'team',         // GLM Coordinator + 专业 Agents 模式
}

/**
 * 模式切换命令响应
 */
export interface ModeSwitchResponse {
  success: boolean;
  currentMode: AgentMode;
  message: string;
}

/**
 * 持久化存储数据结构
 */
interface ModeStorage {
  currentMode: AgentMode;
  userPreferences: Record<string, AgentMode>;
}

/**
 * 模式管理器
 */
export class ModeManager {
  private currentMode: AgentMode = AgentMode.CLI;
  private userModePreferences: Map<string, AgentMode> = new Map();
  private storagePath: string;

  constructor(storagePath?: string) {
    // 默认存储在项目根目录的 data 文件夹
    this.storagePath = storagePath || path.join(process.cwd(), 'data', 'mode.json');
    this.loadFromFile();
  }

  /**
   * 获取当前模式
   */
  getCurrentMode(): AgentMode {
    return this.currentMode;
  }

  /**
   * 设置当前模式
   */
  async setCurrentMode(mode: AgentMode): Promise<void> {
    const oldMode = this.currentMode;
    this.currentMode = mode;
    logger.info(`[ModeManager] 模式已切换: ${oldMode} -> ${mode}`);
    await this.saveToFile();
  }

  /**
   * 获取用户的模式偏好
   */
  getUserMode(userId: string, groupId?: string): AgentMode {
    const key = this.getUserKey(userId, groupId);
    return this.userModePreferences.get(key) || this.currentMode;
  }

  /**
   * 设置用户的模式偏好
   */
  async setUserMode(userId: string, groupId: string | undefined, mode: AgentMode): Promise<void> {
    const key = this.getUserKey(userId, groupId);
    this.userModePreferences.set(key, mode);
    logger.info(`[ModeManager] 用户模式设置: ${key} -> ${mode}`);
    await this.saveToFile();
  }

  /**
   * 清除用户的模式偏好
   */
  async clearUserMode(userId: string, groupId?: string): Promise<void> {
    const key = this.getUserKey(userId, groupId);
    this.userModePreferences.delete(key);
    logger.info(`[ModeManager] 清除用户模式: ${key}`);
    await this.saveToFile();
  }

  /**
   * 处理模式切换命令
   */
  async handleModeCommand(content: string, userId: string, groupId?: string): Promise<ModeSwitchResponse | null> {
    // 检查是否是模式切换命令
    const modeMatch = content.match(/^\/(mode|模式)\s+(cli|team|cli模式|团队模式)/i);
    if (!modeMatch) {
      return null;
    }

    const modeParam = modeMatch[2].toLowerCase();
    let newMode: AgentMode;

    switch (modeParam) {
      case 'cli':
      case 'cli模式':
        newMode = AgentMode.CLI;
        break;
      case 'team':
      case '团队模式':
        newMode = AgentMode.TEAM;
        break;
      default:
        return {
          success: false,
          currentMode: this.getCurrentMode(),
          message: '未知模式，请使用：cli 或 team',
        };
    }

    // 设置用户偏好
    await this.setUserMode(userId, groupId, newMode);

    const modeName = newMode === AgentMode.CLI ? 'CLI 模式' : '团队模式';

    return {
      success: true,
      currentMode: newMode,
      message: `✅ 已切换到 **${modeName}**\n\n当前模式特点：\n${
        newMode === AgentMode.CLI
          ? '- 使用本地 Claude Code CLI\n- 强大的代码分析和执行能力'
          : '- GLM-4.7 主协调 Agent\n- 5 个专业 Agent 协作（代码/网页/命令/搜索/数据）'
      }`,
    };
  }

  /**
   * 获取模式帮助信息
   */
  getModeHelp(): string {
    return `📱 **模式切换说明**

系统支持两种 Agent 模式：

**1. CLI 模式** (/mode cli)
- 使用本地 Claude Code CLI
- 强大的代码分析和执行能力
- 直接访问文件系统

**2. 团队模式** (/mode team)
- GLM-4.7 主协调 Agent
- 5 个专业 Agent 协作：
  • Code Agent - 代码编写与分析
  • Browser Agent - 网页操作与截图
  • Shell Agent - 命令执行
  • WebSearch Agent - 网络搜索
  • DataAgent - 数据分析

**切换命令**：
• /mode cli 或 /模式 cli - 切换到 CLI 模式
• /mode team 或 /模式 team - 切换到团队模式`;
  }

  /**
   * 生成用户键
   */
  private getUserKey(userId: string, groupId?: string): string {
    return groupId ? `group_${groupId}` : `user_${userId}`;
  }

  /**
   * 获取模式名称
   */
  getModeName(mode: AgentMode): string {
    return mode === AgentMode.CLI ? 'CLI 模式' : '团队模式';
  }

  /**
   * 从文件加载模式设置
   */
  private async loadFromFile(): Promise<void> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      const storage: ModeStorage = JSON.parse(data);

      this.currentMode = storage.currentMode;
      this.userModePreferences = new Map(Object.entries(storage.userPreferences));

      logger.info(`[ModeManager] 从文件加载模式设置: ${this.storagePath}`);
      logger.info(`[ModeManager] 当前模式: ${this.currentMode}, 用户偏好数: ${this.userModePreferences.size}`);
    } catch (error) {
      // 文件不存在或解析失败，使用默认值
      logger.debug(`[ModeManager] 模式文件不存在或解析失败，使用默认值`);
      // 确保目录存在
      try {
        await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
      } catch {
        // 忽略目录创建失败
      }
    }
  }

  /**
   * 保存模式设置到文件
   */
  private async saveToFile(): Promise<void> {
    try {
      const storage: ModeStorage = {
        currentMode: this.currentMode,
        userPreferences: Object.fromEntries(this.userModePreferences),
      };

      await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
      await fs.writeFile(this.storagePath, JSON.stringify(storage, null, 2), 'utf-8');

      logger.debug(`[ModeManager] 模式设置已保存到文件: ${this.storagePath}`);
    } catch (error) {
      logger.error(`[ModeManager] 保存模式设置失败: ${error}`);
    }
  }

  /**
   * 获取模式标识前缀
   */
  getModePrefix(userId: string, groupId?: string): string {
    const mode = this.getUserMode(userId, groupId);
    return mode === AgentMode.TEAM ? '[Team]' : '[CLI]';
  }
}

export const modeManager = new ModeManager();
