/**
 * Skills Module - 技能系统
 */

// 技能加载器（来自 agents 目录）
export { SkillLoader } from '../agents/SkillLoader.js';
export type { SkillMetadata, SkillDefinition } from '../agents/SkillLoader.js';
export { SkillInstaller, SkillSource } from '../agents/SkillInstaller.js';
export type {
  SkillSearchResult,
  SkillInstallOptions,
  SkillInstallResult,
} from '../agents/SkillInstaller.js';

// 技能管理器
export { SkillManager } from './SkillManager.js';
export type { SkillMetadata as SkillManagerMetadata } from './SkillManager.js';
// SkillRepository 是内部类型，不导出
