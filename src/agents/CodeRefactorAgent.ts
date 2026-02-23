/**
 * CodeRefactorAgent - 代码重构专家
 *
 * 专注于代码组织、架构改进和细致重构
 * 处理文件重组、组件提取、依赖管理等重构任务
 */

import { logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import type {
  IAgent,
  AgentConfig,
  AgentMessage,
  AgentContext,
  AgentResponse,
} from './base/Agent.js';
import { AgentCapability } from './base/Agent.js';

/**
 * 重构选项
 */
export interface RefactorOptions {
  /** 是否自动执行 */
  autoApply?: boolean;
  /** 备份原始文件 */
  backup?: boolean;
  /** 最大文件大小（行数） */
  maxFileSize?: number;
}

/**
 * 依赖关系
 */
interface Dependency {
  source: string;    // 源文件
  target: string;    // 目标文件/模块
  type: 'import' | 'require' | 'dynamic';
}

/**
 * 重构计划
 */
interface RefactorPlan {
  description: string;
  filesToMove: Array<{
    from: string;
    to: string;
    reason: string;
  }>;
  importsToUpdate: Array<{
    file: string;
    oldImport: string;
    newImport: string;
  }>;
  componentsToExtract: Array<{
    from: string;
    componentName: string;
    lines: [number, number];
    to: string;
  }>;
  risks: string[];
}

/**
 * Code Refactor Agent - 代码重构专家
 */
export class CodeRefactorAgent implements IAgent {
  readonly id = 'refactor';
  readonly name = 'Code Refactor Agent';
  readonly description = '代码重构专家。负责代码组织、架构改进、组件提取、依赖管理等重构任务。';
  readonly capabilities: AgentCapability[] = [
    AgentCapability.Code,
    AgentCapability.Analyze,
  ];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 85,
    timeout: 180000, // 3 分钟
  };

  constructor(options: RefactorOptions = {}) {
    logger.info('[CodeRefactorAgent] 初始化完成');
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
      '重构', 'refactor', '重组', '拆分', '提取',
      '文件组织', '目录结构', '模块化',
      '代码整理', '优化结构', '移动文件'
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
      logger.info(`[CodeRefactorAgent] 处理重构任务`);

      const task = message.content as string;

      // 分析任务类型
      if (task.includes('分析') || task.includes('建议')) {
        return await this.analyzeCodebase(context);
      } else if (task.includes('执行') || task.includes('重构')) {
        return await this.executeRefactor(task, context);
      } else {
        return await this.createRefactorPlan(task, context);
      }
    } catch (error) {
      logger.error(`[CodeRefactorAgent] 处理失败: ${error}`);
      return {
        content: `重构任务失败: ${error instanceof Error ? error.message : String(error)}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 分析代码库
   */
  private async analyzeCodebase(context: AgentContext): Promise<AgentResponse> {
    const workspacePath = context.workspacePath || process.cwd();

    // 扫描代码库结构
    const analysis = {
      structure: await this.analyzeStructure(workspacePath),
      largeFiles: await this.findLargeFiles(workspacePath),
      dependencies: await this.mapDependencies(workspacePath),
      patterns: await this.identifyPatterns(workspacePath),
    };

    // 生成分析报告
    const report = this.generateAnalysisReport(analysis);

    return {
      content: report,
      agentId: this.id,
    };
  }

  /**
   * 分析代码库结构
   */
  private async analyzeStructure(workspacePath: string): Promise<Record<string, any>> {
    const structure: Record<string, any> = {};

    async function scanDir(dir: string, base = '') {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const result: any = { files: [], directories: [] };

      for (const entry of entries) {
        const name = entry.name;
        const fullPath = path.join(dir, name);
        const relativePath = path.join(base, name);

        if (entry.isDirectory()) {
          if (name.startsWith('.') || name === 'node_modules') {
            continue;
          }
          result.directories.push(name);
          result[name] = await scanDir(fullPath, relativePath);
        } else {
          result.files.push(name);
        }
      }

      return result;
    }

    structure.root = await scanDir(workspacePath);
    return structure;
  }

  /**
   * 查找大文件
   */
  private async findLargeFiles(workspacePath: string, maxSize = 300): Promise<Array<{
    file: string;
    lines: number;
    size: number;
  }>> {
    const largeFiles: Array<{ file: string; lines: number; size: number }> = [];

    async function scanDir(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }
          await scanDir(path.join(dir, entry.name));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          const filePath = path.join(dir, entry.name);
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n').length;

          if (lines > maxSize) {
            const stats = await fs.stat(filePath);
            largeFiles.push({
              file: path.relative(workspacePath, filePath),
              lines,
              size: stats.size,
            });
          }
        }
      }
    }

    await scanDir(workspacePath);
    return largeFiles;
  }

  /**
   * 映射依赖关系
   */
  private async mapDependencies(workspacePath: string): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/g;

    async function scanFile(filePath: string) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const imports = [...content.matchAll(importRegex)];

        for (const imp of imports) {
          const target = imp[1] || imp[2];
          dependencies.push({
            source: path.relative(workspacePath, filePath),
            target,
            type: imp[1] ? 'import' : 'require',
          });
        }
      } catch {
        // 忽略无法读取的文件
      }
    }

    async function scanDir(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }
          await scanDir(path.join(dir, entry.name));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          await scanFile(path.join(dir, entry.name));
        }
      }
    }

    await scanDir(workspacePath);
    return dependencies;
  }

  /**
   * 识别代码模式
   */
  private async identifyPatterns(workspacePath: string): Promise<string[]> {
    const patterns: string[] = [];

    // 这里可以添加各种代码模式检测
    // 例如：重复代码、反模式、未使用导入等

    return patterns;
  }

  /**
   * 生成分析报告
   */
  private generateAnalysisReport(analysis: any): string {
    let report = '# 代码库分析报告\n\n';

    // 大文件分析
    report += '## 大文件分析\n\n';
    if (analysis.largeFiles.length > 0) {
      for (const file of analysis.largeFiles) {
        report += `- **${file.file}**\n`;
        report += `  - 行数: ${file.lines}\n`;
        report += `  - 大小: ${file.size} bytes\n`;
        report += `  - 建议: 考虑拆分为更小的模块\n\n`;
      }
    } else {
      report += '未发现超大的文件。\n\n';
    }

    // 依赖分析
    report += '## 依赖关系\n\n';
    report += `总依赖数: ${analysis.dependencies.length}\n\n`;

    // 可以添加更多分析内容...

    return report;
  }

  /**
   * 创建重构计划
   */
  private async createRefactorPlan(task: string, context: AgentContext): Promise<AgentResponse> {
    const plan: RefactorPlan = {
      description: `重构任务: ${task}`,
      filesToMove: [],
      importsToUpdate: [],
      componentsToExtract: [],
      risks: [
        '重构可能影响其他代码',
        '需要更新导入路径',
        '需要充分测试'
      ],
    };

    const planText = this.formatPlan(plan);

    return {
      content: planText,
      agentId: this.id,
    };
  }

  /**
   * 执行重构
   */
  private async executeRefactor(task: string, context: AgentContext): Promise<AgentResponse> {
    // 创建备份目录
    const backupDir = path.join(context.workspacePath || process.cwd(), '.refactor-backup');
    await fs.mkdir(backupDir, { recursive: true });

    // 这里实现具体的重构逻辑
    // ...

    return {
      content: `重构任务已完成: ${task}`,
      agentId: this.id,
    };
  }

  /**
   * 格式化计划
   */
  private formatPlan(plan: RefactorPlan): string {
    let text = `# 重构计划\n\n`;
    text += `## 描述\n\n${plan.description}\n\n`;

    if (plan.filesToMove.length > 0) {
      text += `## 文件移动\n\n`;
      for (const move of plan.filesToMove) {
        text += `- \`${move.from}\` → \`${move.to}\`\n`;
        text += `  原因: ${move.reason}\n`;
      }
      text += '\n';
    }

    if (plan.importsToUpdate.length > 0) {
      text += `## 导入更新\n\n`;
      for (const update of plan.importsToUpdate) {
        text += `- **${update.file}**\n`;
        text += `  \`${update.oldImport}\` → \`${update.newImport}\`\n`;
      }
      text += '\n';
    }

    if (plan.componentsToExtract.length > 0) {
      text += `## 组件提取\n\n`;
      for (const extract of plan.componentsToExtract) {
        text += `- 从 \`${extract.from}\` 提取组件\n`;
        text += `  行: ${extract.lines[0]}-${extract.lines[1]}\n`;
        text += `  到: \`${extract.to}\`\n`;
      }
      text += '\n';
    }

    if (plan.risks.length > 0) {
      text += `## 风险评估\n\n`;
      for (const risk of plan.risks) {
        text += `- ${risk}\n`;
      }
    }

    return text;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    logger.info('[CodeRefactorAgent] 已清理资源');
  }
}

export default CodeRefactorAgent;
