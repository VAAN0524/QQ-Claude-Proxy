/**
 * SimpleCoordinatorAgent - 极简协调 Agent
 *
 * 设计理念：
 * 1. 单一协调者 - 一个 Agent 处理所有任务
 * 2. 动态技能加载 - 通过 SKILL.md 切换身份和技能
 * 3. 简化记忆 - 基于 markdown 文档的记忆系统
 * 4. 工具层驱动 - 使用统一的工具层接口
 * 5. 直接执行 - 不经过 ReAct，直接调用工具
 */

import { logger } from '../utils/logger.js';
import type {
  IAgent,
  AgentConfig,
  AgentMessage,
  AgentContext,
  AgentResponse,
} from './base/Agent.js';
import { AgentCapability } from './base/Agent.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SharedContext } from './SharedContext.js';
import { getToolManager, ToolManager } from './tools-layer/index.js';
import { smartSearch } from './tools-layer/index.js';
import { HierarchicalMemoryService, MemoryLayer } from './memory/HierarchicalMemoryService.js';
import { MemoryType } from './memory/MemoryService.js';
import { FileStorage } from '../agent/file-storage.js';
import { ZaiMcpClient } from './ZaiMcpClient.js';

/**
 * 创建 axios 实例，支持代理
 */
function createAxiosInstance(): AxiosInstance {
  const config: any = {
    timeout: 60000,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (proxyUrl) {
    config.httpsAgent = new HttpsProxyAgent(proxyUrl);
    config.proxy = false;
  }

  return axios.create(config);
}

/**
 * 技能元数据
 */
interface SkillMetadata {
  name: string;
  description: string;
  systemPrompt: string;
  rules: string[];
  availableTools: string[]; // 可用工具列表
  examples: Array<{
    input: string;
    output: string;
  }>;
}

/**
 * 记忆条目
 */
interface MemoryEntry {
  content: string;
  timestamp: Date;
  tags: string[];
}

/**
 * SimpleCoordinator 配置
 */
export interface SimpleCoordinatorConfig {
  skillsPath: string;
  memoryPath: string;
  rulesPath: string;
  sharedContext?: SharedContext;
  hierarchicalMemory?: HierarchicalMemoryService;
}

/**
 * SimpleCoordinator Agent
 */
export class SimpleCoordinatorAgent implements IAgent {
  readonly id = 'simple-coordinator';
  readonly name = 'Simple Coordinator';
  readonly description = '极简协调 Agent - 技能驱动，工具层支持';
  readonly capabilities: AgentCapability[] = [
    AgentCapability.Complex,
    AgentCapability.General,
  ];
  readonly config: AgentConfig = {
    enabled: true,
    priority: 10,
    timeout: 60000,
  };

  private skillsPath: string;
  private memoryPath: string;
  private rulesPath: string;
  private memory: Map<string, MemoryEntry[]> = new Map();
  private currentSkill: SkillMetadata | null = null;
  private axiosInstance: AxiosInstance;
  private sharedContext?: SharedContext;
  private hierarchicalMemory?: HierarchicalMemoryService;
  private toolManager: ToolManager;
  /** 待发送文件队列（文件传输功能） */
  private pendingFiles: string[] = [];
  /** 工作区路径 */
  private workspacePath: string;
  /** 文件存储管理器 */
  private fileStorage: FileStorage;
  /** 文件发送回调 */
  private sendFileCallback: ((userId: string, filePath: string, groupId?: string) => Promise<void>) | null = null;
  /** 消息发送回调 */
  private sendMessageCallback: ((userId: string, content: string, groupId?: string) => Promise<void>) | null = null;
  /** Z.ai MCP 客户端（官方视觉理解服务） */
  private mcpClient: ZaiMcpClient | null = null;

  constructor(config: SimpleCoordinatorConfig) {
    this.skillsPath = config.skillsPath;
    this.memoryPath = config.memoryPath;
    this.rulesPath = config.rulesPath;
    this.sharedContext = config.sharedContext;
    this.hierarchicalMemory = config.hierarchicalMemory;
    this.axiosInstance = createAxiosInstance();
    this.toolManager = getToolManager();
    this.workspacePath = path.join(process.cwd(), 'workspace');
    this.fileStorage = new FileStorage(this.workspacePath);

    // 初始化 Z.ai MCP 客户端（使用 GLM_API_KEY）
    const apiKey = process.env.GLM_API_KEY || process.env.Z_AI_API_KEY;
    if (apiKey) {
      this.mcpClient = new ZaiMcpClient({
        apiKey,
        mode: 'ZHIPU', // 使用智谱 AI 平台
        requestTimeout: 300000, // 5 分钟超时
      });
      logger.info('[SimpleCoordinator] Z.ai MCP 客户端已创建');
    } else {
      logger.warn('[SimpleCoordinator] 未配置 GLM_API_KEY，视觉功能将不可用');
    }
  }

  /**
   * 初始化 - 加载核心技能和工具
   */
  async initialize(): Promise<void> {
    logger.info('[SimpleCoordinator] 初始化...');

    // 连接 Z.ai MCP Server
    if (this.mcpClient) {
      try {
        await this.mcpClient.connect();
        const tools = this.mcpClient.getAvailableTools();
        logger.info(`[SimpleCoordinator] MCP Server 连接成功，可用工具: ${tools.map(t => t.name).join(', ')}`);
      } catch (error) {
        logger.error(`[SimpleCoordinator] MCP Server 连接失败: ${error}`);
        // 不抛出错误，继续启动（视觉功能将不可用）
        this.mcpClient = null;
      }
    }

    // 加载核心技能
    await this.loadDefaultSkill();

    // 加载记忆
    await this.loadMemory();

    logger.info('[SimpleCoordinator] 初始化完成');
    logger.info(`[SimpleCoordinator] 已加载 ${this.toolManager.getAll().length} 个工具`);
  }

  /**
   * 处理消息
   */
  async process(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    const startTime = Date.now();
    let content = message.content as string;

    logger.info(`[SimpleCoordinator] 处理请求: ${content.substring(0, 50)}...`);

    const activeContext = context.sharedContext || this.sharedContext;

    try {
      // ========== 处理用户发送的图片和视频（参考初始版本） ==========
      const images = (message.attachments || []).filter(a => a.type === 'image');
      const videos = (message.attachments || []).filter(a => a.type === 'video');
      // 合并图片和视频，统一作为附件处理
      const visualAttachments = [...images, ...videos];

      // 记录用户消息到共享上下文
      if (activeContext) {
        activeContext.addConversation('user', content, this.id);

        // 同时记录到分层记忆（长期存储）
        if (this.hierarchicalMemory) {
          this.hierarchicalMemory.addHierarchicalMemory(
            MemoryType.MESSAGE,
            `用户: ${content}`,
            MemoryLayer.L0,
            {
              taskId: `${this.id}:${Date.now()}`,
              tags: ['user-message', 'conversation'],
              importance: 1,
            }
          ).catch(err => logger.debug(`[SimpleCoordinator] 分层记忆记录失败: ${err}`));
        }
      }

      // 1. 识别需要的技能
      const skillName = await this.identifySkill(content);
      if (skillName && skillName !== this.currentSkill?.name) {
        await this.loadSkill(skillName);
      }

      // 2. 直接执行（使用工具层）
      const result = await this.executeWithTools(content, context, visualAttachments);

      // 记录助手回复到共享上下文
      if (activeContext) {
        activeContext.addConversation('assistant', result, this.id);

        // 同时记录到分层记忆（长期存储）
        if (this.hierarchicalMemory) {
          this.hierarchicalMemory.addHierarchicalMemory(
            MemoryType.MESSAGE,
            `助手: ${result}`,
            MemoryLayer.L0,
            {
              taskId: `${this.id}:${Date.now()}`,
              tags: ['assistant-response', 'conversation'],
              importance: 1,
            }
          ).catch(err => logger.debug(`[SimpleCoordinator] 分层记忆记录失败: ${err}`));
        }
      }

      // 处理待发送文件
      const filesToSend = this.getPendingFiles();
      this.clearPendingFiles();

      // 如果有文件需要发送且有发送回调，使用回调发送
      if (filesToSend.length > 0 && this.sendFileCallback) {
        logger.info(`[SimpleCoordinator] 准备发送 ${filesToSend.length} 个文件`);
        for (const filePath of filesToSend) {
          try {
            await this.sendFileCallback(message.userId, filePath, message.groupId);
            logger.info(`[SimpleCoordinator] 文件发送成功: ${path.basename(filePath)}`);
          } catch (error) {
            logger.error(`[SimpleCoordinator] 文件发送失败: ${filePath} - ${error}`);
          }
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`[SimpleCoordinator] 处理完成，耗时: ${duration}ms`);

      return {
        content: result,
        agentId: this.id,
        userId: message.userId,
        groupId: message.groupId,
        filesToSend: filesToSend.length > 0 ? filesToSend : undefined,
      };

    } catch (error) {
      logger.error(`[SimpleCoordinator] 处理失败: ${error}`);
      const errorMsg = `处理失败: ${error instanceof Error ? error.message : String(error)}`;

      if (activeContext) {
        activeContext.addConversation('assistant', errorMsg, this.id);
      }

      return {
        content: errorMsg,
        agentId: this.id,
        userId: message.userId,
        groupId: message.groupId,
      };
    }
  }

  /**
   * 识别需要的技能
   */
  private async identifySkill(content: string): Promise<string | null> {
    const lowerContent = content.toLowerCase();

    const skillChecks: Array<{ skill: string; keywords: string[] }> = [
      { skill: 'smart-search', keywords: ['搜索', 'search', '查找', 'find', '资讯', '新闻', '消息'] },
      { skill: 'smart-code', keywords: ['代码', '编程', 'code', '函数', '类', '脚本', '算法'] },
      { skill: 'file', keywords: ['文件', '发送', 'file', '下载', '保存'] },
      { skill: 'browser', keywords: ['网页', '浏览器', 'browser', '访问', '打开', 'url'] },
      { skill: 'data', keywords: ['数据', '分析', 'data', '统计', '图表'] },
    ];

    for (const { skill, keywords } of skillChecks) {
      for (const keyword of keywords) {
        if (lowerContent.includes(keyword)) {
          logger.debug(`[SimpleCoordinator] 识别技能: ${skill} (关键词: ${keyword})`);
          return skill;
        }
      }
    }

    return null;
  }

  /**
   * 加载技能
   * 支持两种格式:
   * 1. skills/skill-name/SKILL.md (标准格式，带 YAML frontmatter)
   * 2. skills/skill-name.md (旧格式)
   */
  private async loadSkill(skillName: string): Promise<void> {
    logger.info(`[SimpleCoordinator] 开始加载技能: ${skillName}`);
    // 尝试多种路径
    const possiblePaths = [
      path.join(this.skillsPath, skillName, 'SKILL.md'),  // 标准格式
      path.join(this.skillsPath, `${skillName}.md`),      // 旧格式
    ];

    let content = '';
    let loaded = false;

    for (const skillFile of possiblePaths) {
      try {
        content = await fs.readFile(skillFile, 'utf-8');
        loaded = true;
        logger.info(`[SimpleCoordinator] 从 ${skillFile} 加载技能内容，长度: ${content.length}`);
        break;
      } catch {
        // 继续尝试下一个路径
      }
    }

    if (loaded) {
      this.currentSkill = this.parseSkill(content);
      logger.info(`[SimpleCoordinator] 技能已加载: ${skillName}, 工具: ${this.currentSkill.availableTools.join(', ')}`);
    } else {
      logger.warn(`[SimpleCoordinator] 技能加载失败: ${skillName}, 使用默认技能`);
      await this.loadDefaultSkill();
    }
  }

  /**
   * 加载默认技能
   */
  private async loadDefaultSkill(): Promise<void> {
    // 获取当前日期
    const today = new Date().toISOString().split('T')[0];

    this.currentSkill = {
      name: 'default',
      description: '默认技能 - QQ-Claude-Proxy 智能助手',
      systemPrompt: `# QQ-Claude-Proxy 智能助手

你是 **QQ-Claude-Proxy** 项目的智能助手，运行在 QQ 机器人平台上。

## 你的身份和能力

### 基本信息
- **项目名称**: QQ-Claude-Proxy
- **平台**: QQ 机器人
- **工作目录**: \`${this.workspacePath}\`
- **当前日期**: ${today}

### 核心能力
1. **文件管理**: 可以查看、分析和发送工作区中的文件
   - 支持图片、视频、文档等各类文件
   - 用户说"把 xxx 发给我"或"xxx 发给我"时，将文件添加到发送队列
   - 用户说"工作区有哪些文件"时，列出所有文件

2. **视觉理解**:
   - 可以分析图片内容（使用 glm-4.6v 模型）
   - 可以分析视频内容
   - 支持OCR文字提取

3. **网络搜索**: 可以搜索网络信息

4. **代码分析**: 可以分析和编写代码

5. **分层记忆**: 具备长期记忆系统，可以记住之前的对话和重要信息

### 项目文档位置
- **CLAUDE.md**: 项目根目录 - 包含项目架构和开发指南
- **README.md**: 项目根目录 - 项目说明文档
- **package.json**: 项目根目录 - 依赖和脚本配置
- **配置目录**: ./config/ - 系统配置文件
- **日志目录**: ./logs/ - 运行日志
- **数据目录**: ./data/ - 数据存储

### 重要提醒
- **你不是普通的 ChatGPT 或 Claude**，你是专门为 QQ-Claude-Proxy 项目定制的助手
- 你**有文件发送能力**，当用户请求文件时，使用 fileStorage 列出文件并添加到发送队列
- 你**有文件访问权限**，可以读取和分析工作区中的文件
- 你会**记住重要信息**，使用分层记忆系统保存关键对话

## 工作原则
- 准确理解用户需求
- 主动利用已记住的信息
- 保持简洁明了的回答
- 遇到不确定的信息时，先搜索再回答`,
      rules: [],
      availableTools: ['smart_search', 'fetch_web'], // 默认可用工具
      examples: [],
    };
  }

  /**
   * 解析技能文件
   * 支持:
   * 1. YAML frontmatter 格式 (标准 SKILL.md)
   * 2. 纯 Markdown 格式 (旧格式)
   */
  private parseSkill(content: string): SkillMetadata {
    let name = 'custom';
    let description = '自定义技能';
    const systemPrompt: string[] = [];
    const rules: string[] = [];
    const availableTools: string[] = [];
    const examples: Array<{ input: string; output: string }> = [];

    const lines = content.split('\n');
    let lineIndex = 0;
    let currentSection = '';
    let currentExample: any = {};
    let inYamlFrontmatter = false;
    let yamlContent = '';

    // 解析 YAML frontmatter
    if (lines[0] === '---') {
      inYamlFrontmatter = true;
      lineIndex = 1;

      while (lineIndex < lines.length && lines[lineIndex] !== '---') {
        yamlContent += lines[lineIndex] + '\n';
        lineIndex++;
      }
      lineIndex++; // 跳过结束的 ---

      // 解析 YAML 内容
      if (yamlContent.includes('name:')) {
        const match = yamlContent.match(/name:\s*(.+)/);
        if (match) name = match[1].trim();
      }
      if (yamlContent.includes('description:')) {
        const match = yamlContent.match(/description:\s*(.+)/);
        if (match) description = match[1].trim();
      }

      // 解析 availableTools (支持两种格式)
      // 格式1: - tool_name 或 - tool_name: description
      // 格式2: tool_name: description (无连字符)
      if (yamlContent.includes('availableTools:')) {
        const toolsSection = yamlContent.split('availableTools:')[1].split('\n')[0];
        const yamlLines = yamlContent.split('\n');
        let inToolsSection = false;
        for (const yamlLine of yamlLines) {
          if (yamlLine.trim() === 'availableTools:') {
            inToolsSection = true;
            continue;
          }
          if (inToolsSection) {
            const trimmed = yamlLine.trim();
            // 跳过空行或缩进过小的行（不是列表项）
            if (!trimmed || !trimmed.startsWith('-')) {
              // 可能是其他字段或结束
              if (trimmed && !trimmed.startsWith('-')) {
                break;
              }
              continue;
            }
            // 提取工具名: "- tool_name" 或 "- tool_name: description"
            const toolMatch = trimmed.match(/^-\s*([\w_]+)(?::|\s|$)/);
            if (toolMatch) {
              availableTools.push(toolMatch[1]);
            }
          }
        }
      }
    }

    // 解析 Markdown 内容
    for (; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // 处理任何级别的标题 (#, ##, ###, 等)
      if (line.startsWith('#')) {
        const match = line.match(/^#+\s+(.+)/);
        if (match) {
          currentSection = match[1].trim().toLowerCase();
          logger.debug(`[SimpleCoordinator] 标题: "${currentSection}"`);
        }
        continue;
      }

      // 解析可用工具列表
      if (currentSection.includes('可用工具') || currentSection.includes('tools')) {
        if (line.includes('- ') && line.includes('`')) {
          const match = line.match(/`([^`]+)`/);
          if (match) {
            logger.debug(`[SimpleCoordinator] 找到工具: ${match[1]}`);
            availableTools.push(match[1]);
          }
        }
      }

      if (currentSection.includes('system') || currentSection.includes('系统') || currentSection.includes('系统提示')) {
        if (line.trim() && !line.startsWith('#')) {
          systemPrompt.push(line);
        }
      } else if (currentSection.includes('rule') || currentSection.includes('规则')) {
        if (line.startsWith('-') || line.startsWith('*')) {
          rules.push(line.substring(1).trim());
        }
      } else if (currentSection.includes('example') || currentSection.includes('示例')) {
        if (line.startsWith('输入:') || line.startsWith('Input:')) {
          currentExample.input = line.split(':')[1]?.trim() || '';
        } else if (line.startsWith('输出:') || line.startsWith('Output:')) {
          currentExample.output = line.split(':')[1]?.trim() || '';
          if (currentExample.input && currentExample.output) {
            examples.push({ ...currentExample });
            currentExample = {};
          }
        }
      }
    }

    logger.debug(`[SimpleCoordinator] 解析技能: ${name}, 可用工具: ${availableTools.join(', ')}`);

    return {
      name,
      description,
      systemPrompt: systemPrompt.join('\n').trim(),
      rules,
      availableTools,
      examples,
    };
  }

  /**
   * 加载记忆
   */
  private async loadMemory(): Promise<void> {
    try {
      const memoryFile = path.join(this.memoryPath, 'MEMORY.md');
      const content = await fs.readFile(memoryFile, 'utf-8');

      const entries: MemoryEntry[] = [];
      const lines = content.split('\n');
      let currentEntry: Partial<MemoryEntry> = {};

      for (const line of lines) {
        if (line.startsWith('# ') || line.startsWith('## ')) {
          if (currentEntry.content) {
            entries.push({
              content: currentEntry.content,
              timestamp: currentEntry.timestamp || new Date(),
              tags: currentEntry.tags || [],
            });
          }
          currentEntry = { tags: [line.substring(line.startsWith('# ') ? 2 : 3).trim()] };
        } else if (line.trim()) {
          currentEntry.content = (currentEntry.content || '') + line + '\n';
        }
      }

      if (currentEntry.content) {
        entries.push({
          content: currentEntry.content,
          timestamp: currentEntry.timestamp || new Date(),
          tags: currentEntry.tags || [],
        });
      }

      this.memory.set('default', entries);
      logger.info(`[SimpleCoordinator] 记忆已加载: ${entries.length} 条`);
    } catch (error) {
      logger.debug('[SimpleCoordinator] 记忆文件不存在或为空');
    }
  }

  /**
   * 使用工具层执行任务
   */
  private async executeWithTools(content: string, context: AgentContext, images: import('./base/Agent.js').Attachment[] = []): Promise<string> {
    const lowerContent = content.toLowerCase();

    // 1. GitHub URL 处理（最高优先级）
    const githubUrlMatch = content.match(/(https?:\/\/github\.com\/[^\s]+)/);
    if (githubUrlMatch) {
      return await this.executeGitHubTask(content, githubUrlMatch[1]);
    }

    // 2. 文件发送请求（高优先级 - 使用初始版本的触发模式）
    if (this.isFileSendRequest(content)) {
      return await this.executeFileTask(content);
    }

    // 3. Tavily 搜索
    if (lowerContent.includes('tavily') || lowerContent.includes('tavily-search')) {
      return await this.executeTavilySearch(content);
    }

    // 4. 网络搜索
    if (lowerContent.includes('搜索') || lowerContent.includes('search')) {
      return await this.executeSearch(content);
    }

    // 5. 文件列表请求（包含"文件"但不包含"发"）
    if ((lowerContent.includes('文件') || lowerContent.includes('工作区')) && !lowerContent.includes('发')) {
      return await this.executeFileTask(content);
    }

    // 6. 代码任务
    if (lowerContent.includes('代码') || lowerContent.includes('编程') || lowerContent.includes('code')) {
      return await this.executeCodeTask(content);
    }

    // 7. 默认：调用 LLM
    return await this.callLLM(content, images);
  }

  /**
   * 检测文件发送请求（参考初始版本的逻辑）
   */
  private isFileSendRequest(content: string): boolean {
    const sendPatterns = [
      /把.+文件.*发[给 me我]/,
      /把\s*\S+.*发[给 me我]/,               // 放宽限制，不要求扩展名
      /发送文件/,
      /传给我.*文件/,
      /发给我/,                              // 最宽松的模式
      /发文件给/,
      /文件.*发[给 me我]/,
      /通过.*[Bb]ot.*发[给me我]/,
      /qq.*bot.*发[给me我]/i,
      /使用.*bot.*发送/,
      /把.*文件夹.*文件.*发/,
      /图片.*发[给me我]/,                     // 支持"图片发给我"
      /视频.*发[给me我]/,                     // 支持"视频发给我"
      /.*发给我$/,                           // "xxx发给我"
      /能.*传给我吗/,                         // "能传给我吗"
      /能.*发给我吗/,                         // "能发给我吗"
      /传给我$/,                             // "xxx传给我"
      /.*能.*传.*给.*我/,                     // "这个能传给我吗"
      /.*能.*发.*给.*我/,                     // "这个能发给我吗"
      /帮我.*发/,                            // "帮我发xxx"
    ];
    return sendPatterns.some(p => p.test(content));
  }

  /**
   * 执行 GitHub 相关任务
   */
  private async executeGitHubTask(content: string, url: string): Promise<string> {
    logger.info(`[SimpleCoordinator] GitHub 任务: ${url}`);

    const { fetchWebContent } = await import('./tools-layer/web-tools.js');

    try {
      const result = await fetchWebContent(url);

      if (result.success) {
        // 提取 GitHub 信息
        const info = this.extractGitHubInfo(result.content, url);
        if (info) {
          return this.formatGitHubInfo(info);
        }
        // 无法解析，返回预览
        return `✅ **GitHub 内容获取成功**

📍 **URL**: ${url}

**内容预览**:

${result.content.substring(0, 3000)}${result.content.length > 3000 ? '\n\n...(内容已截断)' : ''}`;
      }

      return `❌ GitHub 获取失败: ${result.error}`;
    } catch (error) {
      return `❌ GitHub 获取失败: ${error}`;
    }
  }

  /**
   * 执行 Tavily 搜索
   */
  private async executeTavilySearch(content: string): Promise<string> {
    logger.info(`[SimpleCoordinator] Tavily 搜索`);

    const tool = this.toolManager.get('tavily_search');
    if (!tool) {
      return `❌ Tavily 工具未找到`;
    }

    try {
      const query = content
        .replace(/用\s*tavily(-search)?\s*搜索/i, '')
        .replace(/https?:\/\/[^\s]+/gi, '')
        .trim();

      if (!query) {
        return `⚠️ 无法提取搜索关键词`;
      }

      return await tool.execute({ query, maxResults: 5 });
    } catch (error) {
      return `❌ Tavily 搜索失败: ${error}`;
    }
  }

  /**
   * 执行网络搜索
   */
  private async executeSearch(content: string): Promise<string> {
    logger.info(`[SimpleCoordinator] 网络搜索`);

    const tool = this.toolManager.get('smart_search');
    if (!tool) {
      return `❌ 搜索工具未找到`;
    }

    try {
      const query = content
        .replace(/^(搜索|search)\s*/i, '')
        .replace(/用\s*\w+\s*搜索/i, '')
        .trim();

      if (!query) {
        return `⚠️ 无法提取搜索关键词`;
      }

      return await tool.execute({ query, maxResults: 5 });
    } catch (error) {
      return `❌ 搜索失败: ${error}`;
    }
  }

  /**
   * 执行文件任务（发送、列表等）- 参考初始版本的逻辑
   */
  private async executeFileTask(content: string): Promise<string> {
    logger.info(`[SimpleCoordinator] 文件任务: ${content.substring(0, 50)}`);

    const allFiles = this.fileStorage.listWorkspaceFiles();
    const workspacePath = this.workspacePath;

    // ========== 检测发送请求 vs 列表请求 ==========
    const isSendRequest = /发给我|传给我|送给我|下载|send|transfer|upload/.test(content);
    const isListRequest = content.includes('列') || content.includes('list') ||
                          content.includes('有什么') || content.includes('哪些') ||
                          content.includes('查看文件');

    // ========== 列表请求 ==========
    if (isListRequest || (content.includes('文件') && !isSendRequest)) {
      if (allFiles.length === 0) {
        return `📁 工作区为空，没有文件。`;
      }

      let output = `📁 **工作区文件** (${allFiles.length} 个)\n\n`;
      const images = allFiles.filter(f => /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f));
      const documents = allFiles.filter(f => /\.(md|txt|json|pdf|docx?|xlsx?)$/i.test(f));
      const videos = allFiles.filter(f => /\.(mp4|mov|avi|mkv|webm)$/i.test(f));
      const others = allFiles.filter(f => !images.includes(f) && !documents.includes(f) && !videos.includes(f));

      if (images.length > 0) output += `**图片** (${images.length}):\n${images.map(f => `  - ${f}`).join('\n')}\n\n`;
      if (videos.length > 0) output += `**视频** (${videos.length}):\n${videos.map(f => `  - ${f}`).join('\n')}\n\n`;
      if (documents.length > 0) output += `**文档** (${documents.length}):\n${documents.map(f => `  - ${f}`).join('\n')}\n\n`;
      if (others.length > 0) output += `**其他** (${others.length}):\n${others.map(f => `  - ${f}`).join('\n')}\n\n`;

      output += `💡 提示: 使用 "把 xxx 发给我" 或 "xxx 发给我" 来接收文件`;
      return output;
    }

    // ========== 发送文件逻辑 ==========
    if (isSendRequest && allFiles.length > 0) {
      // 步骤 1: 尝试从消息中提取文件名（参考初始版本的逻辑）
      let rawFileName: string | null = null;

      // 1.0 优先处理文件列表格式: "**视频** (1): qq_xxx.mp4 这个能传给我吗"
      const fileListMatch = content.match(/[:：]\s*(\S+\.\w+)/);
      if (fileListMatch) {
        rawFileName = fileListMatch[1];
        logger.info(`[SimpleCoordinator] 从文件列表格式提取文件名: ${rawFileName}`);
      }

      // 1.1 优先匹配引号内的文件名
      if (!rawFileName) {
        const quotedMatch = content.match(/["']([^"']+\.[a-zA-Z0-9]+)["']/);
        if (quotedMatch) {
          rawFileName = quotedMatch[1];
        }
      }

      // 1.2 匹配 "文件名.xxx 发给我" 格式（文件名在消息中任意位置）
      if (!rawFileName) {
        const extMatch = content.match(/(\S+\.\w+)/);
        if (extMatch) {
          rawFileName = extMatch[1];
        }
      }

      // 1.3 匹配 "xxx 发给我" 格式（文件名在开头，可能无扩展名）
      if (!rawFileName) {
        const words = content.trim().split(/\s+/);
        if (words.length > 0) {
          const firstWord = words[0].replace(/[\""''']/g, '');
          // 检查是否是工作区中的文件名（无扩展名）
          const possibleFile = allFiles.find(f => {
            const baseName = path.basename(f, path.extname(f));
            return baseName.toLowerCase() === firstWord.toLowerCase();
          });
          if (possibleFile) {
            rawFileName = possibleFile;
          }
        }
      }

      // 步骤 2: 查找匹配的文件
      const matchedFiles: string[] = [];

      if (rawFileName) {
        // 使用提取的文件名进行精确匹配
        const targetLower = rawFileName.toLowerCase();
        for (const file of allFiles) {
          const fileName = path.basename(file).toLowerCase();
          const baseName = path.basename(file, path.extname(file)).toLowerCase();

          if (fileName === targetLower || baseName === targetLower ||
              fileName.includes(targetLower) || baseName.includes(targetLower)) {
            matchedFiles.push(path.join(workspacePath, file));
            logger.info(`[SimpleCoordinator] 匹配文件: ${file}`);
          }
        }
      }

      // 步骤 3: 处理指代词（"这个"、"这个图片"、"这个视频"等）
      if (matchedFiles.length === 0 && (content.includes('这个') || content.includes('该'))) {
        // 根据上下文判断用户指的是哪个文件
        const images = allFiles.filter(f => /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f));
        const videos = allFiles.filter(f => /\.(mp4|mov|avi|mkv|webm)$/i.test(f));
        const documents = allFiles.filter(f => /\.(md|txt|json|pdf|docx?|xlsx?)$/i.test(f));

        if (content.includes('视频') && videos.length === 1) {
          matchedFiles.push(path.join(workspacePath, videos[0]));
          logger.info(`[SimpleCoordinator] 指代词匹配视频: ${videos[0]}`);
        } else if (content.includes('图片') && images.length === 1) {
          matchedFiles.push(path.join(workspacePath, images[0]));
          logger.info(`[SimpleCoordinator] 指代词匹配图片: ${images[0]}`);
        } else if (content.includes('文件') || content.includes('文档')) {
          if (documents.length === 1) {
            matchedFiles.push(path.join(workspacePath, documents[0]));
            logger.info(`[SimpleCoordinator] 指代词匹配文档: ${documents[0]}`);
          } else if (allFiles.length === 1) {
            // 只有一个文件时，"这个"指向它
            matchedFiles.push(path.join(workspacePath, allFiles[0]));
            logger.info(`[SimpleCoordinator] 指代词匹配唯一文件: ${allFiles[0]}`);
          }
        } else if (allFiles.length === 1) {
          // 只有一个文件，"这个"指向它
          matchedFiles.push(path.join(workspacePath, allFiles[0]));
          logger.info(`[SimpleCoordinator] 指代词匹配唯一文件: ${allFiles[0]}`);
        }
      }

      // 步骤 4: 如果仍然没有匹配，尝试模糊匹配
      if (matchedFiles.length === 0) {
        const contentLower = content.toLowerCase();
        for (const file of allFiles) {
          const fileName = path.basename(file, path.extname(file)); // 去掉扩展名的文件名
          const fileNameWithExt = path.basename(file);

          if (contentLower.includes(fileName.toLowerCase()) ||
              contentLower.includes(fileNameWithExt.toLowerCase())) {
            matchedFiles.push(path.join(workspacePath, file));
            logger.info(`[SimpleCoordinator] 模糊匹配文件: ${file}`);
          }
        }
      }

      // 步骤 5: 批量发送（"所有文件"、"全部文件"）
      if (matchedFiles.length === 0 && (
        content.includes('所有文件') ||
        content.includes('全部文件') ||
        (content.includes('都') && (content.includes('文件') || content.includes('发')))
      )) {
        for (const file of allFiles) {
          this.pendingFiles.push(path.join(workspacePath, file));
        }
        logger.info(`[SimpleCoordinator] 添加 ${allFiles.length} 个文件到发送队列`);
        return `✅ 已将 ${allFiles.length} 个文件添加到发送队列。`;
      }

      // 步骤 6: 返回结果
      if (matchedFiles.length === 0) {
        return `⚠️ 未找到匹配的文件。\n\n📁 **可用文件**:\n${allFiles.map(f => `  - ${f}`).join('\n')}\n\n💡 提示: 请使用准确的文件名（如："qq_89eb4ac8_20260223_085216 发给我"）`;
      }

      // 去重并添加到发送队列
      const uniqueFiles = [...new Set(matchedFiles)];
      for (const filePath of uniqueFiles) {
        this.pendingFiles.push(filePath);
        logger.info(`[SimpleCoordinator] 添加文件到发送队列: ${path.basename(filePath)}`);
      }

      return `✅ 已将 ${uniqueFiles.length} 个文件添加到发送队列:\n${uniqueFiles.map(f => `  - ${path.basename(f)}`).join('\n')}`;
    }

    // 默认：返回可用文件列表
    if (allFiles.length === 0) {
      return `📁 工作区为空，没有文件。`;
    }
    return `📁 **工作区文件** (${allFiles.length} 个):\n${allFiles.map(f => `  - ${f}`).join('\n')}\n\n💡 提示: 使用 "把 xxx 发给我" 来接收文件`;
  }

  /**
   * 执行代码任务
   */
  private async executeCodeTask(content: string): Promise<string> {
    logger.info(`[SimpleCoordinator] 代码任务`);

    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) {
      return `❌ GLM API Key 未配置`;
    }

    try {
      const baseUrl = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';

      const response = await this.axiosInstance.post(`${baseUrl}/chat/completions`, {
        model: 'glm-4.7',
        messages: [
          {
            role: 'system',
            content: '你是一个编程助手。请根据用户的需求编写代码，代码要清晰、可运行，并添加必要的注释。',
          },
          {
            role: 'user',
            content: content,
          },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      return response.data.choices?.[0]?.message?.content || '代码生成失败';
    } catch (error) {
      logger.error(`[SimpleCoordinator] 代码任务失败: ${error}`);
      return `❌ 代码生成失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 调用 LLM（支持视觉 - 使用官方 MCP 方式）
   */
  private async callLLM(content: string, images: import('./base/Agent.js').Attachment[] = []): Promise<string> {
    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) {
      return `❌ GLM API Key 未配置`;
    }

    try {
      // ========== 有视频：使用 Z.ai MCP Server 视频分析 ==========
      const videos = images.filter(a => a.type === 'video');
      if (videos.length > 0 && this.mcpClient && this.mcpClient.isClientConnected()) {
        logger.info(`[SimpleCoordinator] 使用 MCP Server 处理视频请求 (${videos.length} 个视频)`);

        // 确保 MCP 客户端已连接
        if (!this.mcpClient.isClientConnected()) {
          await this.mcpClient.connect();
        }

        // 处理第一个视频
        const video = videos[0];
        const fullVideoPath = path.join(this.workspacePath, video.path);
        logger.info(`[SimpleCoordinator] MCP 分析视频: ${fullVideoPath}`);

        // 构建分析提示词
        let prompt = content || '请详细分析这个视频的内容';
        if (!content) {
          prompt = '请详细分析这个视频的内容，包括主题、关键信息、场景和主要观点。';
        }

        // 使用 MCP 官方方式分析视频
        const analysisResult = await this.mcpClient.analyzeVideo(fullVideoPath);
        logger.info(`[SimpleCoordinator] MCP 视频分析完成，结果长度: ${analysisResult.length}`);

        return analysisResult;
      }

      // ========== 有图片：使用 Z.ai MCP Server 图像分析 ==========
      const imagesOnly = images.filter(a => a.type === 'image');
      if (imagesOnly.length > 0 && this.mcpClient && this.mcpClient.isClientConnected()) {
        logger.info(`[SimpleCoordinator] 使用 MCP Server 处理视觉请求 (${imagesOnly.length} 张图片)`);

        // 确保 MCP 客户端已连接
        if (!this.mcpClient.isClientConnected()) {
          await this.mcpClient.connect();
        }

        // 处理第一张图片（MCP 方式）
        const image = imagesOnly[0];
        const fullImagePath = path.join(this.workspacePath, image.path);
        logger.info(`[SimpleCoordinator] MCP 分析图片: ${fullImagePath}`);

        // 构建分析提示词
        let prompt = content || '请详细描述这张图片的内容';
        if (!content) {
          prompt = '请详细描述这张图片的内容，包括主要元素、颜色、布局和任何可见的文字。';
        }

        // 使用 MCP 官方方式分析图片（使用 glm-4.6v 模型）
        const analysisResult = await this.mcpClient.analyzeImage(fullImagePath, prompt, 'glm-4.6v');
        logger.info(`[SimpleCoordinator] MCP 分析完成，结果长度: ${analysisResult.length}`);

        return analysisResult;
      }

      // ========== 无图片或 MCP 不可用：使用 GLM-4.7 文本 API ==========
      const baseUrl = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';

      // 构建系统提示（包含技能和工具信息）
      let systemPrompt = this.currentSkill?.systemPrompt ||
        '你是一个智能助手，请根据用户的问题提供有帮助的回答。';

      // 检索相关历史记忆
      if (this.hierarchicalMemory) {
        const relevantMemories = this.hierarchicalMemory.searchHierarchicalMemories(
          content,
          { limit: 5 }
        );

        if (relevantMemories.length > 0) {
          systemPrompt += '\n\n## 相关历史记忆\n\n';
          for (const memory of relevantMemories.slice(0, 3)) {
            if (memory.L0) {
              systemPrompt += `- ${memory.L0.summary} (${memory.L0.timestamp})\n`;
            }
          }
        }
      }

      // 构建工具定义（GLM-4.7 Function Calling 格式）
      const tools: Array<{ type: string; function: { name: string; description: string; parameters: any } }> = [];
      const availableToolNames: string[] = [];

      if (this.currentSkill?.availableTools && this.currentSkill.availableTools.length > 0) {
        systemPrompt += '\n\n## 可用工具\n\n';
        for (const toolName of this.currentSkill.availableTools) {
          const tool = this.toolManager.get(toolName);
          if (tool) {
            systemPrompt += `- \`${tool.name}\`: ${tool.description}\n`;
            availableToolNames.push(tool.name);

            // 为所有可用工具添加 Function Calling 定义
            if (tool.name === 'smart_search' || tool.name === 'tavily_search') {
              // 搜索工具
              tools.push({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: {
                    type: 'object',
                    properties: {
                      query: {
                        type: 'string',
                        description: '搜索关键词',
                      },
                      maxResults: {
                        type: 'number',
                        description: '最大结果数量（可选）',
                      },
                    },
                    required: ['query'],
                  },
                },
              });
            } else if (tool.name === 'fetch_web') {
              // 网页抓取工具
              tools.push({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: {
                    type: 'object',
                    properties: {
                      url: {
                        type: 'string',
                        description: '要抓取的网页 URL',
                      },
                    },
                    required: ['url'],
                  },
                },
              });
            }
          } else {
            logger.warn(`[SimpleCoordinator] 工具 ${toolName} 未找到`);
          }
        }
      }

      logger.info(`[SimpleCoordinator] 使用 GLM-4.7 文本模型 (工具: ${availableToolNames.join(', ') || '无'}, FC工具: ${tools.map(t => t.function.name).join(', ') || '无'})`);

      // 构建消息数组：system prompt + 历史对话 + 当前消息
      let messages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string; name?: string }> = [
        {
          role: 'system',
          content: systemPrompt,
        },
      ];

      // 加载历史对话（从 SharedContext）
      let lastMessageIsCurrent = false;
      if (this.sharedContext) {
        const history = this.sharedContext.getAllMessages();
        // 过滤掉system消息，避免重复
        const conversationMessages = history.filter(m => m.role !== 'system');

        // 检查最后一条消息是否是当前用户消息（避免重复）
        if (conversationMessages.length > 0) {
          const lastMsg = conversationMessages[conversationMessages.length - 1];
          if (lastMsg.role === 'user' && lastMsg.content === content) {
            lastMessageIsCurrent = true;
          }
        }

        // 只保留最近的N条历史消息，避免上下文过长
        // 如果最后一条是当前消息，则少取一条
        const recentHistory = lastMessageIsCurrent
          ? conversationMessages.slice(-11, -1)  // 排除最后一条（当前消息）
          : conversationMessages.slice(-10);

        for (const msg of recentHistory) {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
          logger.debug(`[SimpleCoordinator] 加载历史消息: ${msg.role}, 长度=${msg.content.length}`);
        }

        logger.info(`[SimpleCoordinator] 已加载 ${recentHistory.length} 条历史对话（当前消息已在历史中: ${lastMessageIsCurrent}）`);
      }

      // 添加当前用户消息（如果不在历史中）
      if (!lastMessageIsCurrent) {
        messages.push({
          role: 'user',
          content: content,
        });
      }

      const maxIterations = 5; // 增加到5轮工具调用
      let finalResponse = '';
      let hasToolCalls = false;

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        logger.debug(`[SimpleCoordinator] Function Calling 第 ${iteration + 1}/${maxIterations} 轮`);

        // 最后一次迭代时不传递tools，强制LLM生成最终回复
        const isLastIteration = iteration === maxIterations - 1;
        const response = await this.axiosInstance.post(`${baseUrl}/chat/completions`, {
          model: 'glm-4.7',
          messages,
          tools: isLastIteration ? undefined : (tools.length > 0 ? tools : undefined),
          tool_choice: isLastIteration ? undefined : (tools.length > 0 ? 'auto' : undefined),
          max_tokens: 4096,
          temperature: 0.7,
        }, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        const choice = response.data.choices?.[0];
        if (!choice) {
          logger.warn(`[SimpleCoordinator] LLM 返回空的 choices，响应: ${JSON.stringify(response.data)}`);
          finalResponse = '抱歉，我没有生成回复。';
          break;
        }

        const content = choice.message.content || '';
        const toolCalls = choice.message.tool_calls || [];

        logger.debug(`[SimpleCoordinator] LLM 响应: content长度=${content.length}, tool_calls数量=${toolCalls.length}`);

        // 检查是否有工具调用
        if (toolCalls.length > 0) {
          hasToolCalls = true;
          logger.info(`[SimpleCoordinator] LLM 请求调用 ${toolCalls.length} 个工具`);

          // 添加助手响应（包含 tool_calls）
          messages.push({
            role: 'assistant',
            content: content || null,
            tool_calls: toolCalls,
          });

          // 执行每个工具调用
          for (const toolCall of toolCalls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

            logger.info(`[SimpleCoordinator] 执行工具: ${toolName}, 参数: ${JSON.stringify(toolArgs)}`);

            try {
              let toolResult = '';
              const tool = this.toolManager.get(toolName);
              if (tool) {
                toolResult = await tool.execute(toolArgs);
              } else {
                toolResult = `工具 ${toolName} 不存在`;
              }

              // 添加工具结果
              messages.push({
                role: 'tool',
                content: toolResult,
                tool_call_id: toolCall.id,
                name: toolName,
              });

              logger.info(`[SimpleCoordinator] 工具执行完成，结果长度: ${toolResult.length}`);
            } catch (error) {
              logger.error(`[SimpleCoordinator] 工具执行失败: ${error}`);
              messages.push({
                role: 'tool',
                content: `工具执行失败: ${error}`,
                tool_call_id: toolCall.id,
                name: toolName,
              });
            }
          }
        } else {
          // 没有工具调用，直接返回结果
          finalResponse = content || '抱歉，我没有生成回复。';
          logger.debug(`[SimpleCoordinator] 无工具调用，直接返回响应，长度: ${finalResponse.length}`);
          break;
        }
      }

      // 如果循环结束但没有最终响应，说明达到了maxIterations
      if (!finalResponse) {
        logger.warn(`[SimpleCoordinator] 达到最大迭代次数但无最终响应，hasToolCalls=${hasToolCalls}`);
        if (hasToolCalls) {
          // 有工具调用但没有最终回复，尝试基于工具结果生成简单总结
          const toolMessages = messages.filter(m => m.role === 'tool');
          if (toolMessages.length > 0) {
            finalResponse = `已执行 ${toolMessages.length} 个工具，请查看工具结果获取详细信息。`;
          } else {
            finalResponse = '抱歉，处理超时或出错。';
          }
        } else {
          finalResponse = '抱歉，我没有生成回复。';
        }
      }

      logger.debug(`[SimpleCoordinator] Function Calling 完成，最终响应长度: ${finalResponse?.length || 0}`);

      return finalResponse;
    } catch (error) {
      logger.error(`[SimpleCoordinator] LLM 调用失败: ${error}`);
      return `❌ LLM 调用失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 提取 GitHub 项目信息
   */
  private extractGitHubInfo(html: string, url: string): any | null {
    try {
      const nameMatch = html.match(/<title>(.*?)\s*\(.*?\)\s*<\/title>/) ||
                        html.match(/<meta property="og:title" content="([^"]+)"/);
      const name = nameMatch ? nameMatch[1].replace(' · GitHub', '') : '';

      const descMatch = html.match(/<meta name="description" content="([^"]+)"/) ||
                        html.match(/<meta property="og:description" content="([^"]+)"/);
      const description = descMatch ? descMatch[1] : '';

      const starMatch = html.match(/aria-label="(\d+(?:,\d+)*) users starred this repository"/) ||
                        html.match(/"starCount":\s*(\d+)/);
      const stars = starMatch ? starMatch[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',') : 'N/A';

      const langMatch = html.match(/<span\s+itemprop="programmingLanguage">([^<]+)<\/span>/);
      const language = langMatch ? langMatch[1] : 'N/A';

      if (!name && !description) {
        return null;
      }

      return { name: name || 'Unknown', description: description || '无描述', stars, language, url };
    } catch (error) {
      logger.debug(`[SimpleCoordinator] GitHub 信息提取失败: ${error}`);
      return null;
    }
  }

  /**
   * 格式化 GitHub 项目信息
   */
  private formatGitHubInfo(info: any): string {
    let output = `## 📦 ${info.name}\n\n`;
    output += `**URL**: ${info.url}\n\n`;

    if (info.description) {
      output += `### 📝 描述\n\n${info.description}\n\n`;
    }

    output += `### 📊 项目统计\n\n`;
    output += `- ⭐ Stars: ${info.stars}\n`;
    output += `- 💻 主要语言: ${info.language}\n\n`;

    output += `### 🎯 项目特色\n\n`;
    if (info.description) {
      output += `- **核心功能**: ${info.description}\n`;
    }
    if (info.language !== 'N/A') {
      output += `- **技术栈**: 使用 ${info.language} 开发\n`;
    }

    output += `\n💡 **建议**: 查看完整 README 和代码以了解更多详情\n`;

    return output;
  }

  /**
   * 获取待发送文件列表
   */
  getPendingFiles(): string[] {
    return [...this.pendingFiles];
  }

  /**
   * 清空待发送文件队列
   */
  clearPendingFiles(): void {
    this.pendingFiles = [];
    logger.debug('[SimpleCoordinator] 待发送文件队列已清空');
  }

  /**
   * 检查是否能处理
   */
  canHandle(message: AgentMessage): number {
    return 1.0;
  }

  /**
   * 设置文件发送回调
   */
  setSendFileCallback(callback: (userId: string, filePath: string, groupId?: string) => Promise<void>): void {
    this.sendFileCallback = callback;
  }

  /**
   * 设置消息发送回调
   */
  setSendMessageCallback(callback: (userId: string, content: string, groupId?: string) => Promise<void>): void {
    this.sendMessageCallback = callback;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    // 断开 MCP 客户端连接
    if (this.mcpClient) {
      await this.mcpClient.disconnect();
      logger.info('[SimpleCoordinator] MCP 客户端已断开');
    }
    logger.info('[SimpleCoordinator] 资源已清理');
  }
}

export default SimpleCoordinatorAgent;
