/**
 * Data Analysis Agent - 数据分析
 *
 * 用于数据分析、统计计算、数据可视化建议等
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
 * Data Analysis Agent 配置选项
 */
export interface DataAnalysisAgentOptions {
  /** 支持的文件类型 */
  supportedFileTypes?: string[];
  /** 最大文件大小 (MB) */
  maxFileSize?: number;
}

/**
 * 数据统计结果
 */
interface DataStatistics {
  totalRows: number;
  totalColumns: number;
  columns: Array<{
    name: string;
    type: string;
    nullCount: number;
    uniqueCount: number;
  }>;
  summary: string;
}

/**
 * Data Analysis Agent - 数据分析
 */
export class DataAnalysisAgent implements IAgent {
  readonly id = 'data';
  readonly name = 'Data Analysis Agent';
  readonly description = '数据分析：统计计算、文件分析、数据可视化建议';
  readonly capabilities: AgentCapability[] = [AgentCapability.Analyze, AgentCapability.Complex];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 7,
    timeout: 30000,
  };

  private supportedFileTypes: string[];
  private maxFileSize: number;

  // 数据分析相关关键词
  private readonly analysisKeywords = [
    // 中文
    '分析', '统计', '数据', '计算', '汇总', '平均值', '总数',
    'csv', 'excel', 'json', '数据文件', '表格',
    // 英文
    'analyze', 'analysis', 'statistics', 'data', 'calculate', 'summary',
    'average', 'count', 'total', 'csv', 'excel', 'json', 'spreadsheet',
  ];

  constructor(options: DataAnalysisAgentOptions = {}) {
    this.supportedFileTypes = options.supportedFileTypes || ['.csv', '.json', '.txt', '.md'];
    this.maxFileSize = (options.maxFileSize || 10) * 1024 * 1024; // MB to bytes
    logger.info(`[DataAnalysisAgent] 初始化完成`);
  }

  /**
   * 检查是否能处理该任务
   */
  canHandle(message: AgentMessage): number {
    const content = message.content.toLowerCase();

    // 检查文件附件
    if (message.attachments && message.attachments.length > 0) {
      const hasDataFile = message.attachments.some(att => {
        const ext = path.extname(att.path).toLowerCase();
        return this.supportedFileTypes.includes(ext);
      });
      if (hasDataFile) return 0.9;
    }

    // 关键词匹配
    const hitCount = this.analysisKeywords.filter(kw => content.includes(kw)).length;
    return Math.min(hitCount * 0.12, 0.8);
  }

  /**
   * 处理消息
   */
  async process(
    message: AgentMessage,
    context: AgentContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      logger.info(`[DataAnalysisAgent] 处理消息: ${message.content.substring(0, 50)}...`);

      // 检查是否有附件
      if (message.attachments && message.attachments.length > 0) {
        return await this.analyzeAttachment(message, context);
      }

      // 检查是否请求分析工作区文件
      const fileMatch = message.content.match(/分析(?:文件)?\s*[`"']?([^\s"'`]+?)[`"']?$/);
      if (fileMatch) {
        return await this.analyzeFile(fileMatch[1], context);
      }

      // 默认返回使用说明
      return {
        content: this.getUsageHelp(),
        agentId: this.id,
      };

    } catch (error) {
      logger.error(`[DataAnalysisAgent] 处理失败: ${error}`);
      return {
        content: `分析失败: ${error instanceof Error ? error.message : String(error)}`,
        agentId: this.id,
      };
    }
  }

  /**
   * 分析附件文件
   */
  private async analyzeAttachment(
    message: AgentMessage,
    context: AgentContext
  ): Promise<AgentResponse> {
    const attachment = message.attachments![0];
    const filePath = attachment.path;

    // 检查文件大小
    const stats = await fs.stat(filePath);
    if (stats.size > this.maxFileSize) {
      return {
        content: `文件过大 (${(stats.size / 1024 / 1024).toFixed(2)}MB)，最大支持 ${this.maxFileSize / 1024 / 1024}MB`,
        agentId: this.id,
      };
    }

    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.json':
        return await this.analyzeJsonFile(filePath);
      case '.csv':
        return await this.analyzeCsvFile(filePath);
      case '.txt':
      case '.md':
        return await this.analyzeTextFile(filePath);
      default:
        return {
          content: `不支持的文件类型: ${ext}`,
          agentId: this.id,
        };
    }
  }

  /**
   * 分析指定文件
   */
  private async analyzeFile(
    fileName: string,
    context: AgentContext
  ): Promise<AgentResponse> {
    const filePath = path.join(context.workspacePath, fileName);

    try {
      await fs.access(filePath);
    } catch {
      return {
        content: `文件不存在: ${fileName}`,
        agentId: this.id,
      };
    }

    const ext = path.extname(fileName).toLowerCase();

    switch (ext) {
      case '.json':
        return await this.analyzeJsonFile(filePath);
      case '.csv':
        return await this.analyzeCsvFile(filePath);
      default:
        return await this.analyzeTextFile(filePath);
    }
  }

  /**
   * 分析 JSON 文件
   */
  private async analyzeJsonFile(filePath: string): Promise<AgentResponse> {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    const stats = this.analyzeJsonData(data);

    let output = `📊 JSON 文件分析\n\n`;
    output += `**文件**: ${path.basename(filePath)}\n`;
    output += `**大小**: ${(content.length / 1024).toFixed(2)} KB\n\n`;
    output += `**结构分析**:\n`;
    output += `- 数据类型: ${Array.isArray(data) ? '数组' : typeof data}\n`;
    output += `- ${stats.summary}\n`;

    if (stats.fields && stats.fields.length > 0) {
      output += `\n**字段列表**:\n`;
      stats.fields.forEach(field => {
        output += `- \`${field.name}\` (${field.type})\n`;
      });
    }

    return { content: output, agentId: this.id };
  }

  /**
   * 分析 JSON 数据结构
   */
  private analyzeJsonData(data: unknown, depth = 0): {
    summary: string;
    fields?: Array<{ name: string; type: string }>;
  } {
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return { summary: '空数组' };
      }
      const firstItem = data[0];
      if (typeof firstItem === 'object' && firstItem !== null) {
        const fields = Object.keys(firstItem).map(key => ({
          name: key,
          type: typeof firstItem[key as keyof typeof firstItem],
        }));
        return {
          summary: `${data.length} 个元素的数组`,
          fields,
        };
      }
      return { summary: `${data.length} 个元素的 ${typeof firstItem} 数组` };
    }

    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      const fields = keys.map(key => ({
        name: key,
        type: typeof data[key as keyof typeof data],
      }));
      return {
        summary: `${keys.length} 个字段的对象`,
        fields,
      };
    }

    return { summary: `基本类型: ${typeof data}` };
  }

  /**
   * 分析 CSV 文件
   */
  private async analyzeCsvFile(filePath: string): Promise<AgentResponse> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return {
        content: `CSV 文件为空`,
        agentId: this.id,
      };
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const rowCount = lines.length - 1; // 减去表头

    let output = `📊 CSV 文件分析\n\n`;
    output += `**文件**: ${path.basename(filePath)}\n`;
    output += `**大小**: ${(content.length / 1024).toFixed(2)} KB\n\n`;
    output += `**结构分析**:\n`;
    output += `- 总行数: ${rowCount}\n`;
    output += `- 列数: ${headers.length}\n\n`;
    output += `**列名**:\n`;
    headers.forEach((h, i) => {
      output += `${i + 1}. \`${h}\`\n`;
    });

    return { content: output, agentId: this.id };
  }

  /**
   * 分析文本文件
   */
  private async analyzeTextFile(filePath: string): Promise<AgentResponse> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const words = content.split(/\s+/).filter(w => w.trim());
    const chars = content.length;

    let output = `📄 文本文件分析\n\n`;
    output += `**文件**: ${path.basename(filePath)}\n`;
    output += `**大小**: ${(chars / 1024).toFixed(2)} KB\n\n`;
    output += `**统计信息**:\n`;
    output += `- 字符数: ${chars}\n`;
    output += `- 单词数: ${words.length}\n`;
    output += `- 行数: ${lines.length}\n`;
    output += `- 平均行长度: ${(chars / lines.length).toFixed(1)} 字符\n`;

    return { content: output, agentId: this.id };
  }

  /**
   * 获取使用帮助
   */
  private getUsageHelp(): string {
    return `📊 **Data Analysis Agent 使用说明**

我可以帮你分析以下类型的文件：

**支持的文件格式**:
- .json - JSON 数据文件
- .csv - CSV 表格文件
- .txt - 纯文本文件
- .md - Markdown 文档

**使用方式**:
1. 发送文件给我（QQ 附件）
2. 说 "分析 xxx.json" 分析工作区文件

**分析功能**:
- 文件结构分析
- 数据统计（行数、列数、字段类型）
- 内容摘要`;
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    logger.info('[DataAnalysisAgent] 已初始化');
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    logger.info('[DataAnalysisAgent] 已清理资源');
  }
}

export default DataAnalysisAgent;
