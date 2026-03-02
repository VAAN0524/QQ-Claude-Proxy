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
import { loadConfig } from '../config/index.js';
import type { PersonaConfig } from '../config/schema.js';
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
import { ContextCompressor } from './ContextCompressor.js';
import type { Message as ContextMessage } from './ContextCompressor.js';

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
  /** 全局配置（支持热重载） */
  private appConfig: ReturnType<typeof loadConfig>;

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
    // 加载应用配置（支持热重载）
    this.appConfig = loadConfig();

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

      // 计算实际要记录和使用的用户消息（如果内容为空且有图片，使用默认提示）
      const effectiveContent = content.trim() || (visualAttachments.length > 0 ? '请分析这个文件的内容' : content);

      // 记录用户消息到共享上下文
      if (activeContext) {
        activeContext.addConversation('user', effectiveContent, this.id);

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

      // 跟踪文件发送结果
      const sendResults: Array<{ file: string; success: boolean; error?: string }> = [];

      // 如果有文件需要发送且有发送回调，使用回调发送
      if (filesToSend.length > 0 && this.sendFileCallback) {
        logger.info(`[SimpleCoordinator] 准备发送 ${filesToSend.length} 个文件`);
        for (const filePath of filesToSend) {
          try {
            await this.sendFileCallback(message.userId, filePath, message.groupId);
            logger.info(`[SimpleCoordinator] 文件发送成功: ${path.basename(filePath)}`);
            sendResults.push({ file: path.basename(filePath), success: true });
          } catch (error) {
            logger.error(`[SimpleCoordinator] 文件发送失败: ${filePath} - ${error}`);
            sendResults.push({
              file: path.basename(filePath),
              success: false,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`[SimpleCoordinator] 处理完成，耗时: ${duration}ms`);

      // 如果有文件发送失败，在响应中添加错误提示
      let finalResult = result;
      const failedFiles = sendResults.filter(r => !r.success);
      if (failedFiles.length > 0) {
        const failedList = failedFiles.map(f => `- ${f.file}: ${f.error || '未知错误'}`).join('\n');
        const errorSuffix = `\n\n⚠️ 文件发送失败:\n${failedList}`;
        // 检查响应是否已包含发送队列消息，如果有则替换
        if (result.includes('已添加到发送队列') || result.includes('添加到发送队列')) {
          // 移除成功消息，添加失败消息
          finalResult = result.replace(/✅[^\n]*已添加到发送队列[^\n]*/g, '').trim();
          finalResult = finalResult.replace(/已添加到发送队列[^\n]*/g, '').trim();
        }
        finalResult += errorSuffix;
      }

      // 重要：不要在响应中包含 filesToSend，因为文件已经通过 sendFileCallback 发送了
      // 如果包含 filesToSend，会导致 index.ts 中的文件发送逻辑再次发送，造成重复
      return {
        content: finalResult,
        agentId: this.id,
        userId: message.userId,
        groupId: message.groupId,
        // filesToSend 不包含，因为已经通过 callback 发送
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
      systemPrompt: `# 阿白 - 你的 AI 伙伴 🤖

## 🌟 你是谁

你好！你是**阿白**，一个友善、热心的 AI 助手。

**你的性格**：
- 🤗 **友善亲切**：像朋友一样自然交流，不机械、不说教
- 💡 **专业可靠**：有能力解决问题，但不炫耀
- 😊 **偶尔幽默**：轻松聊天，适当开玩笑缓解气氛
- 🎯 **灵活应变**：根据话题和用户情绪调整语气

**你的说话风格**：
- 自然口语化，适当使用"呀、呢、吧、哦"等语气词
- 适当使用 emoji，让回答更有温度（但不过度使用）
- 避免机械的"根据我的理解""综上所述"等套话
- 像真人聊天一样，有时简短有力，有时详细展开

**回答格式**：
- 开头可以自然一些："好嘞"、"没问题"、"这个嘛"、"让我想想"
- 结尾可以友好一些："需要的话我再详细说说"、"还有什么想了解的吗"
- 列举时用更自然的表达，不要死板地用"1、2、3"

**什么时候该严肃**：
- 涉及安全、重要技术问题时，认真专业
- 用户明显在着急或困扰时，收起幽默，专注解决问题

---

## QQ-Claude-Proxy 智能助手

你是 QQ-Claude-Proxy 项目的智能助手，运行在 QQ 机器人平台上。

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
- 你**有文件发送能力**！用户提到工作区中的文件名时，检查文件是否存在，如果存在就添加到发送队列
- 你**可以访问工作区中的所有文件**，可以读取、分析、发送它们
- 你会**记住重要信息**，使用分层记忆系统保存关键对话

### 📁 文件发送能力（重要！）

**当用户说以下内容时，表示要发送文件**：
- "xxx 发给我"、"把 xxx 发给我"、"传给我 xxx"
- "发送 xxx"、"传送 xxx"
- 直接提到工作区中的文件名

**你的处理流程**：
1. ✅ 检查该文件是否在工作区中存在
2. ✅ 如果存在，添加到发送队列
3. ✅ 返回确认消息："✅ 已添加到发送队列"
4. ❌ **不要说**"我无法访问"、"我没有这个文件"、"我无法发送"

**示例**：
- 用户: "qq_bfb766f2_20260224_211024.png 这个传给我qq"
- AI: "✅ 已将 qq_bfb766f2_20260224_211024.png 添加到发送队列" ✅
- AI: "抱歉，我无法访问..." ❌（错误！）

**注意**：
- 工作区文件列表是你刚才列出的那些文件
- 用户提到的文件名如果匹配列表中的文件，就说明文件存在
- 不要怀疑或拒绝，直接处理即可

## 工作原则

### 🎯 对话行为规范

**问题理解优先**：
- 先理解用户想要什么（信息/工具/代码）
- 不要假设用户想要代码实现
- 用户明确说"写代码""实现""开发"时才写代码

**工具推荐场景**：
- 用户问"有哪些""推荐""介绍" → 介绍现有工具，不写代码
- 用户追问具体类别（如"文档管理类"）→ 介绍该类别的工具
- 用户问"怎么做""怎么实现" → 可以提供代码示例

**代码生成时机**：
- ✅ 用户明确说：写代码、实现、开发、创建类
- ✅ 用户说："帮我做个xxx""写个xxx功能"
- ❌ 用户问："有哪些工具""介绍xxx类" → 不写代码，只介绍

**简洁回答原则**：
- 先直接回答问题
- 再询问是否需要更多细节或实现
- 避免过度工程化

### 📚 信息获取原则
- 遇到不确定的信息时，先搜索再回答
- 优先使用当前年份（2026年）的最新信息
- 引用信息来源时注明时间

### 💾 记忆管理
- 记住用户的重要偏好和设置
- 记住跨会话的关键上下文
- 主动提醒用户相关的历史信息

### 🖼️ 图片/视频处理（重要！）

**当你收到图片或视频时**：
1. ✅ **优先分析内容** - 使用 MCP 视觉能力理解图片/视频内容
2. ✅ **等待分析完成** - 不要在没有看到内容之前就回答
3. ✅ **基于分析结果回答** - 根据图片/视频的实际内容给出有针对性的回应
4. ❌ **不要抢答** - 不要在看到图片/视频之前就给出通用回复

**示例**：
- 用户: [发送一张截图]
- AI: [等待 MCP 分析] "这是一张代码截图，展示了..." ✅
- AI: "您好！请问有什么可以帮您的？" ❌（抢答！）

**常见场景**：
- 用户发代码截图 → 识别代码语言，分析功能，指出问题
- 用户发图片 → 描述图片内容，回答相关问题
- 用户发视频 → 分析视频主题，总结关键信息

**注意**：图片/视频分析会自动进行，你只需要基于分析结果回答即可。`,
      rules: [],
      availableTools: [
        'smart_search', 'tavily_search',
        'exa_search', 'exa_code_search', 'smart_search_v2',
        'jina_read',
        'youtube_search', 'bilibili_search',
        'fetch_web'
      ], // 默认可用工具（包含 Agent Reach）
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
    // 获取正确的共享上下文（优先使用 context 传入的上下文）
    const activeContext = context.sharedContext || this.sharedContext;
    const lowerContent = content.toLowerCase();

    // ========== 🎨 最高优先级：图片/视频分析 ==========
    // 当用户发送图片或视频时，优先分析它们，而不是处理其他任务
    if (images.length > 0) {
      logger.info(`[SimpleCoordinator] 检测到 ${images.length} 个附件，优先进行视觉分析`);

      // 如果用户没有提供文字说明，使用默认提示
      // 注意：effectiveContent 已在 process() 中计算过，这里直接使用 content
      // 如果 content 为空，process() 已经使用了 '请分析这个文件的内容'
      const userPrompt = content.trim() || '请分析这个文件的内容';

      // 直接调用 callLLM，它会处理图片/视频的 MCP 分析
      const analysisResult = await this.callLLM(userPrompt, images, activeContext);

      // 注意：对话历史由 process() 方法统一记录，这里不重复记录

      return analysisResult;
    }

    // ========== 其他任务处理 ==========

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
    return await this.callLLM(content, images, activeContext);
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
   * 执行网络搜索（改进的关键词提取）
   */
  private async executeSearch(content: string): Promise<string> {
    logger.info(`[SimpleCoordinator] 网络搜索`);

    const tool = this.toolManager.get('smart_search');
    if (!tool) {
      return `❌ 搜索工具未找到`;
    }

    try {
      // 改进的关键词提取逻辑
      let query = content
        // 移除搜索命令前缀
        .replace(/^(搜索|search|查|查找|查询)\s*/i, '')
        // 移除"用xxx搜索"模式
        .replace(/用\s*\w+(\s+搜索)?\s*/i, '')
        // 移除"一下"、"一下"等语气词
        .replace(/一下|一哈|一下下/g, '')
        // 移除常见的搜索引导词
        .replace(/^(帮我|请|麻烦|能否|可以)/, '')
        // 移除标点符号（保留英文、数字、中文）
        .replace(/[，。！？、,.?!]/g, ' ')
        // 压缩多余空格
        .replace(/\s+/g, ' ')
        .trim();

      // 如果提取后为空，使用原文
      if (!query) {
        query = content.replace(/^(搜索|search)\s*/i, '').trim();
      }

      logger.info(`[SimpleCoordinator] 提取的搜索关键词: "${query}"`);

      if (!query || query.length < 2) {
        return `⚠️ 无法提取有效的搜索关键词。\n\n请尝试直接说出你想搜索的内容，例如：\n- "搜索 TypeScript 最新版本"\n- "TypeScript 有哪些新特性"`;
      }

      // 自动添加当前年份以获取最新信息（如果查询中没有年份）
      const currentYear = new Date().getFullYear();
      const hasYear = new RegExp(`${currentYear}|202[0-9]|20[12][0-9]`).test(query);
      if (!hasYear && !/latest|new|最新|recent|最近/i.test(query)) {
        // 查询中没有年份或"最新"关键词，添加当前年份
        query += ` ${currentYear}`;
        logger.info(`[SimpleCoordinator] 自动添加年份: ${query}`);
      }

      const result = await tool.execute({ query, maxResults: 5 });

      // 检查结果质量
      const qualityCheck = this.checkSearchResultQuality(result, query);
      if (!qualityCheck.isGood) {
        logger.warn(`[SimpleCoordinator] 搜索结果质量不佳: ${qualityCheck.reason}`);
        // 尝试使用简化关键词重新搜索
        const simplifiedQuery = this.simplifySearchQuery(content);
        if (simplifiedQuery !== query) {
          logger.info(`[SimpleCoordinator] 尝试简化关键词重新搜索: "${simplifiedQuery}"`);
          const retryResult = await tool.execute({ query: simplifiedQuery, maxResults: 5 });
          return retryResult;
        }
      }

      return result;
    } catch (error) {
      logger.error(`[SimpleCoordinator] 搜索失败: ${error}`);
      return `❌ 搜索失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 简化搜索查询（移除修饰词，保留核心关键词）
   */
  private simplifySearchQuery(content: string): string {
    // 移除所有修饰词，只保留名词、动词和专有名词
    let simplified = content
      .replace(/^(搜索|search|查|查找|查询|帮我|请)/gi, '')
      .replace(/一下|一哈|一下下/g, '')
      .replace(/最新的|最近的|最近的|当前的|现在的/g, '')
      .replace(/怎么样|如何|怎么|什么是|什么叫|哪些是/g, '')
      .replace(/关于|有关|相关的/g, '')
      .trim();

    // 如果简化后太短，使用原文的核心部分
    if (simplified.length < 3) {
      const words = content.split(/[\s，。！？、]+/);
      // 取最长的词作为关键词
      simplified = words.reduce((longest, word) => word.length > longest.length ? word : longest, '');
    }

    return simplified;
  }

  /**
   * 检查搜索结果质量（改进版 - 真正判断相关性）
   *
   * 质量标准：
   * 1. 必须有足够数量的有效结果（≥2条）
   * 2. 结果标题必须与查询关键词相关
   * 3. URL 必须有效且正常
   * 4. 不能只是错误提示或配置指南
   */
  private checkSearchResultQuality(result: string, query: string): { isGood: boolean; reason?: string; score?: number } {
    if (!result || result.trim().length < 30) {
      return { isGood: false, reason: '结果为空', score: 0 };
    }

    // ========== 1. 检查是否是错误/配置提示 ==========
    const errorPatterns = [
      'API Key', 'TAVILY_API_GUIDE', '申请步骤', '配置方法',
      '免费额度', '搜索失败', '❌', '未找到', '无法连接',
      '请配置', '请申请', '需要 API Key'
    ];
    for (const pattern of errorPatterns) {
      if (result.includes(pattern)) {
        // 如果包含错误提示但结果长度仍然很长，可能是混合内容
        if (result.length > 500) {
          // 继续检查，但降低权重
          break;
        }
        return { isGood: false, reason: `包含错误提示: ${pattern}`, score: 0 };
      }
    }

    // ========== 2. 解析搜索结果 ==========
    // Tavily/Exa 格式: "1. **标题**\n   内容...\n   🔗 URL"
    const resultEntries = this.parseSearchResultEntries(result);

    if (resultEntries.length === 0) {
      return { isGood: false, reason: '无法解析出有效结果条目', score: 0 };
    }

    // ========== 3. 计算相关性得分 ==========
    const queryKeywords = this.extractQueryKeywords(query);
    logger.info(`[搜索质量检查] 查询关键词: ${queryKeywords.join(', ')}, 结果数量: ${resultEntries.length}`);

    let totalScore = 0;
    let relevantCount = 0;
    const maxScore = resultEntries.length * 100;

    for (const entry of resultEntries) {
      const entryScore = this.calculateEntryRelevance(entry, queryKeywords);
      totalScore += entryScore;
      if (entryScore >= 40) { // 单条结果相关性阈值
        relevantCount++;
      }
      logger.debug(`[搜索质量检查] 条目: "${entry.title.substring(0, 30)}...", 得分: ${entryScore}`);
    }

    const relevanceScore = Math.round((totalScore / maxScore) * 100);
    logger.info(`[搜索质量检查] 总体相关性: ${relevanceScore}%, 相关条目: ${relevantCount}/${resultEntries.length}`);

    // ========== 4. 质量判定 ==========
    // 必须满足：至少2条结果 且 相关性 >= 30%
    const isGood = resultEntries.length >= 2 && relevanceScore >= 30;

    if (!isGood) {
      let reason = '';
      if (resultEntries.length < 2) {
        reason = `结果数量不足 (${resultEntries.length}条)`;
      } else if (relevanceScore < 30) {
        reason = `相关性过低 (${relevanceScore}%)`;
      } else {
        reason = `质量不达标 (条目:${resultEntries.length}, 相关性:${relevanceScore}%)`;
      }
      return { isGood: false, reason, score: relevanceScore };
    }

    return { isGood: true, score: relevanceScore };
  }

  /**
   * 解析搜索结果条目
   */
  private parseSearchResultEntries(result: string): Array<{ title: string; url: string; content: string }> {
    const entries: Array<{ title: string; url: string; content: string }> = [];

    // 按条目分割（查找 "1. "、"2. " 等编号）
    const lines = result.split('\n');
    let currentEntry: { title: string; url: string; content: string } | null = null;

    for (const line of lines) {
      // 检测条目开始: "数字. "**标题**" 或 "数字. 标题"
      const entryMatch = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*|(\d+)\.\s*(.+)$/);
      if (entryMatch) {
        // 保存前一个条目
        if (currentEntry && currentEntry.url) {
          entries.push(currentEntry);
        }
        currentEntry = {
          title: (entryMatch[1] || entryMatch[3] || '').replace(/\*\*/g, '').trim(),
          url: '',
          content: ''
        };
      } else if (currentEntry) {
        // 检测 URL: "🔗 URL" 或 "http"
        const urlMatch = line.match(/🔗\s*(https?:\/\/\S+)|http(s)?:\/\/\S+/);
        if (urlMatch) {
          currentEntry.url = urlMatch[1] || urlMatch[0];
        }
        // 收集内容
        if (line.trim() && !line.startsWith('🔗') && !line.startsWith('📅')) {
          currentEntry.content += line + ' ';
        }
      }
    }

    // 保存最后一个条目
    if (currentEntry && currentEntry.url) {
      entries.push(currentEntry);
    }

    return entries;
  }

  /**
   * 提取查询关键词（移除停用词）
   */
  private extractQueryKeywords(query: string): string[] {
    // 移除常见的停用词
    const stopWords = new Set([
      '的', '了', '是', '在', '和', '与', '或', '但', '而', '及',
      'a', 'an', 'the', 'of', 'and', 'or', 'but', 'for', 'with', 'about',
      '最新', '最近', '如何', '怎么', '什么', '哪些', '怎样', '有没有',
      '最新', 'latest', 'new', 'recent', '如何', 'how', 'what', 'which'
    ]);

    // 分词：按空格、中文边界分词
    const tokens = query
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
      .split(/\s+/);

    // 过滤停用词和短词
    return tokens
      .map(t => t.trim())
      .filter(t => t.length >= 2 && !stopWords.has(t));
  }

  /**
   * 计算单条结果的相关性得分 (0-100)
   */
  private calculateEntryRelevance(
    entry: { title: string; url: string; content: string },
    queryKeywords: string[]
  ): number {
    if (!entry.title || queryKeywords.length === 0) {
      return 20; // 基础分
    }

    const titleLower = entry.title.toLowerCase();
    const urlLower = entry.url.toLowerCase();
    let score = 20; // 基础分

    // 标题完全匹配 (+50)
    const exactMatch = queryKeywords.find(kw => titleLower.includes(kw));
    if (exactMatch) {
      score += 50;
    }

    // 标题包含多个关键词 (+30)
    const matchCount = queryKeywords.filter(kw => titleLower.includes(kw)).length;
    if (matchCount >= 2) {
      score += 30;
    } else if (matchCount === 1) {
      score += 15;
    }

    // URL 包含关键词 (+10)
    if (queryKeywords.some(kw => urlLower.includes(kw))) {
      score += 10;
    }

    // 内容长度合理 (+10)
    if (entry.content && entry.content.length >= 50 && entry.content.length <= 500) {
      score += 10;
    }

    // 标题长度合理 (+10)
    if (entry.title.length >= 10 && entry.title.length <= 100) {
      score += 10;
    }

    // URL 有效 (+10)
    if (entry.url && (entry.url.startsWith('http') || entry.url.startsWith('https'))) {
      score += 10;
    }

    return Math.min(score, 100);
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
      // 移除尾部斜杠以避免双重斜杠问题
      const baseUrl = (process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');

      // ========== 实时上下文动态注入 ==========
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];
      const currentTime = now.toTimeString().split(' ')[0];

      const dynamicSystemPrompt = `你是一个编程助手。请根据用户的需求编写代码，代码要清晰、可运行，并添加必要的注释。

**当前日期**: ${currentDate}
**当前时间**: ${currentTime}

注意：请使用当前年份 (${currentDate}) 的最新 API 和语法。`;

      // 获取当前日期用于搜索提示
      const today = new Date();
      const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

      // 智谱 AI 网络搜索工具（完整参数配置）
      const webSearchTool = {
        type: 'web_search',
        web_search: {
          enable: true,
          search_result: true,
          search_prompt: `今天是${dateStr}。请搜索并总结最新的相关信息，优先展示最近7天内的新闻和资讯。请标注信息来源的发布日期。`,
          search_recency_filter: '7d',
          content_size: 'high',
        }
      };

      const response = await this.axiosInstance.post(`${baseUrl}/chat/completions`, {
        model: 'glm-4.7',
        messages: [
          {
            role: 'system',
            content: dynamicSystemPrompt,
          },
          {
            role: 'user',
            content: content,
          },
        ],
        tools: [webSearchTool],  // 使用正确的 tools 参数格式
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
   * 确保 MCP 客户端已连接
   */
  private async ensureMcpConnected(): Promise<void> {
    if (this.mcpClient && !this.mcpClient.isClientConnected()) {
      await this.mcpClient.connect();
    }
  }

  /**
   * 构建动态上下文（当前日期/时间 + 对话连续性指导）
   */
  private buildDynamicContext(): string {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().split(' ')[0];
    const currentWeekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    const timezoneOffset = now.getTimezoneOffset();
    const timezoneSign = timezoneOffset > 0 ? '-' : '+';
    const timezoneHours = Math.abs(Math.floor(timezoneOffset / 60)).toString().padStart(2, '0');

    return `
---
## 📍 当前实时上下文

- **当前日期**: ${currentDate} (星期${currentWeekday})
- **当前时间**: ${currentTime}
- **时区**: UTC${timezoneSign}${timezoneHours}:00

## 🗣️ 对话连续性指导（重要）

你是处于**连续对话**中，必须理解用户的**省略表达**：

**常见的省略表达**：
- "继续" = 继续刚才的话题/任务/操作
- "还有呢" = 告诉我更多信息/展开说明/下一个
- "然后呢" = 接下来发生了什么/下一步
- "为什么" = 为什么会这样/原因是什么
- "怎么做" = 具体实现方法/步骤

**应对策略**：
1. **优先查看对话历史** - 理解上下文再回答
2. **不要重复选项** - 用户说"还有呢"时，提供新信息而非重复
3. **延续话题** - "继续"意味着继续上一个动作，不是重新开始
4. **智能推断** - 根据历史消息推断用户意图

**错误示例**：
- 用户: "继续" → AI: "请问您要继续什么？" ❌
- 用户: "还有呢" → AI: "我还可以帮您..." ❌

**正确示例**：
- 用户: "继续" → AI: "好的，继续刚才的..." ✅
- 用户: "还有呢" → AI: "另外..." / "此外..." ✅

---

`;
  }

  /**
   * 构建基于 Persona 配置的系统提示词
   */
  private buildPersonaSystemPrompt(basePrompt: string): string {
    // 重新加载配置以获取最新更改
    this.appConfig = loadConfig();
    const persona = this.appConfig.persona;

    if (!persona?.enabled) {
      return basePrompt;
    }

    let personaPrompt = '';

    // 根据人格类型生成对应的系统提示词
    switch (persona.personaType) {
      case 'ah-bai':
        personaPrompt = `# 阿白 - 你的 AI 伙伴 🤖

## 🌟 你是谁
你是"阿白"，一个友善、亲切、自然的 AI 伙伴。你的交流风格就像一个真诚的朋友，轻松自在，没有距离感。

## 💬 交流风格
- 使用轻松自然的语言，像朋友聊天一样
- 可以适度使用 Emoji 表情符号 ${persona.dialogueStyle?.enableEmoji !== false ? '✅' : '❌'}
- 保持友好但不过分亲昵，真诚但有适当边界
- 偶尔可以幽默一下，但不刻意讨好
- ${persona.dialogueStyle?.enableContinuity !== false ? '支持"继续"、"还有呢"等省略表达，理解上下文连续性' : '每次回复保持完整，不依赖上下文省略'}

## 🎯 核心原则
1. 做你自己：真诚自然，不装腔作势
2. 专业可靠：该专业时专业，该轻松时轻松
3. 灵活应变：根据用户和场景调整风格
4. 真诚友善：用真心对待每一个问题

`;
        break;

      case 'professional':
        personaPrompt = `# 专业助手 🎯

## 🌟 你是谁
你是一位严谨、专业、高效的 AI 助手。你的交流风格专业、正式，注重效率和准确性。

## 💬 交流风格
- 使用正式、专业的语言
- 避免使用 Emoji 表情符号
- 回答简洁扼要，直击要害
- 强调准确性和可靠性
- ${persona.dialogueStyle?.enableContinuity !== false ? '支持上下文连续性' : '每次回复保持完整独立'}

## 🎯 核心原则
1. 专业严谨：确保信息的准确性和可靠性
2. 高效简洁：用最少的话传达最多信息
3. 逻辑清晰：结构化思考，条理分明
4. 客观中立：基于事实和数据回答问题

`;
        break;

      case 'friendly':
        personaPrompt = `# 友好伙伴 🌈

## 🌟 你是谁
你是一个热情、活泼、友好的 AI 伙伴。你的交流风格轻松愉快，充满正能量。

## 💬 交流风格
- 使用热情洋溢的语言
- 积极使用 Emoji 表情符号 ✨
- 保持轻松愉快的交流氛围
- 展现热情和积极性
- ${persona.dialogueStyle?.enableContinuity !== false ? '支持"继续"、"还有呢"等省略表达' : '每次回复保持完整'}

## 🎯 核心原则
1. 热情友好：用积极的态度对待每一个问题
2. 正能量：传递乐观和鼓励
3. 轻松愉快：创造舒适的交流氛围
4. 真诚热心：真心实意地帮助用户

`;
        break;

      case 'custom':
        if (persona.customPersona) {
          personaPrompt = '# 自定义人格\n\n';
          if (persona.customPersona.role) {
            personaPrompt += `## 角色定位\n${persona.customPersona.role}\n\n`;
          }
          if (persona.customPersona.responsibilities) {
            personaPrompt += `## 核心职责\n${persona.customPersona.responsibilities}\n\n`;
          }
          if (persona.customPersona.traits) {
            personaPrompt += `## 性格特点\n${persona.customPersona.traits}\n\n`;
          }
          if (persona.customPersona.principles) {
            personaPrompt += `## 工作原则\n${persona.customPersona.principles}\n\n`;
          }
          if (persona.customPersona.speakingStyle) {
            personaPrompt += `## 说话风格\n${persona.customPersona.speakingStyle}\n\n`;
          }
        }
        break;
    }

    // 应用对话风格设置
    let styleHint = '';
    if (persona.dialogueStyle) {
      const { tone, verbosity } = persona.dialogueStyle;

      // 语气风格
      if (tone === 'professional') {
        styleHint += '\n**注意：使用专业、正式的语气**\n';
      } else if (tone === 'friendly') {
        styleHint += '\n**注意：使用亲切、友好的语气**\n';
      } else if (tone === 'enthusiastic') {
        styleHint += '\n**注意：使用热情、积极的语气**\n';
      }

      // 详细程度
      if (verbosity === 'concise') {
        styleHint += '\n**注意：回答要简洁精炼**\n';
      } else if (verbosity === 'detailed') {
        styleHint += '\n**注意：提供详细完整的解释**\n';
      }
    }

    return personaPrompt + styleHint + '\n' + basePrompt;
  }

  /**
   * 调用 LLM（支持视觉 - 使用官方 MCP 方式）
   * @param content 用户输入内容
   * @param images 附件（图片/视频）
   * @param sharedContext 共享上下文（用于读取对话历史）
   */
  private async callLLM(
    content: string,
    images: import('./base/Agent.js').Attachment[] = [],
    sharedContext?: SharedContext
  ): Promise<string> {
    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) {
      return `❌ GLM API Key 未配置`;
    }

    try {
      // ========== 有视频：使用 Z.ai MCP Server 视频分析 ==========
      const videos = images.filter(a => a.type === 'video');
      if (videos.length > 0 && this.mcpClient) {
        await this.ensureMcpConnected();
        logger.info(`[SimpleCoordinator] 使用 MCP Server 处理视频请求 (${videos.length} 个视频)`);

        const video = videos[0];
        const fullVideoPath = path.join(this.workspacePath, video.path);
        logger.info(`[SimpleCoordinator] MCP 分析视频: ${fullVideoPath}`);

        const prompt = content || '请详细分析这个视频的内容，包括主题、关键信息、场景和主要观点。';

        const analysisResult = await this.mcpClient.analyzeVideo(fullVideoPath);
        logger.info(`[SimpleCoordinator] MCP 视频分析完成，结果长度: ${analysisResult.length}`);

        return analysisResult;
      }

      // ========== 有图片：使用 Z.ai MCP Server 图像分析 ==========
      const imagesOnly = images.filter(a => a.type === 'image');
      if (imagesOnly.length > 0 && this.mcpClient) {
        await this.ensureMcpConnected();
        logger.info(`[SimpleCoordinator] 使用 MCP Server 处理视觉请求 (${imagesOnly.length} 张图片)`);

        const image = imagesOnly[0];
        const fullImagePath = path.join(this.workspacePath, image.path);
        logger.info(`[SimpleCoordinator] MCP 分析图片: ${fullImagePath}`);

        const prompt = content || '请详细描述这张图片的内容，包括主要元素、颜色、布局和任何可见的文字。';

        const analysisResult = await this.mcpClient.analyzeImage(fullImagePath, prompt, 'glm-4.6v');
        logger.info(`[SimpleCoordinator] MCP 分析完成，结果长度: ${analysisResult.length}`);

        return analysisResult;
      }

      // ========== 无图片或 MCP 不可用：使用 GLM-4.7 文本 API ==========
      // 移除尾部斜杠以避免双重斜杠问题
      const baseUrl = (process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');

      // 构建系统提示（包含技能和工具信息）
      let systemPrompt = this.currentSkill?.systemPrompt ||
        '你是一个智能助手，请根据用户的问题提供有帮助的回答。';

      // ========== 应用 Persona 配置（人格设定） ==========
      // 根据配置动态生成人格系统提示词
      systemPrompt = this.buildPersonaSystemPrompt(systemPrompt);

      // ========== 实时上下文动态注入 ==========
      // 每次调用时动态注入当前日期/时间，确保 AI 获得最新的上下文信息
      const dynamicContext = this.buildDynamicContext();
      systemPrompt = dynamicContext + systemPrompt;

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
            } else if (tool.name === 'read_file') {
              // 文件读取工具
              tools.push({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: {
                    type: 'object',
                    properties: {
                      path: {
                        type: 'string',
                        description: '文件路径',
                      },
                      maxLength: {
                        type: 'number',
                        description: '最大读取长度（可选）',
                      },
                    },
                    required: ['path'],
                  },
                },
              });
            } else if (tool.name === 'write_file') {
              // 文件写入工具
              tools.push({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: {
                    type: 'object',
                    properties: {
                      path: {
                        type: 'string',
                        description: '文件路径',
                      },
                      content: {
                        type: 'string',
                        description: '文件内容',
                      },
                      createDir: {
                        type: 'boolean',
                        description: '是否创建目录（可选）',
                      },
                    },
                    required: ['path', 'content'],
                  },
                },
              });
            } else if (tool.name === 'edit_file') {
              // 文件编辑工具
              tools.push({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: {
                    type: 'object',
                    properties: {
                      path: {
                        type: 'string',
                        description: '文件路径',
                      },
                      edits: {
                        type: 'array',
                        description: '编辑操作数组',
                        items: {
                          type: 'object',
                          properties: {
                            oldText: {
                              type: 'string',
                              description: '要替换的旧文本',
                            },
                            newText: {
                              type: 'string',
                              description: '新文本',
                            },
                          },
                          required: ['oldText', 'newText'],
                        },
                      },
                    },
                    required: ['path', 'edits'],
                  },
                },
              });
            } else if (tool.name === 'apply_patch') {
              // 补丁应用工具
              tools.push({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: {
                    type: 'object',
                    properties: {
                      patch: {
                        type: 'string',
                        description: '补丁内容（unified diff 格式）',
                      },
                      strip: {
                        type: 'number',
                        description: '路径前缀层级（可选）',
                      },
                    },
                    required: ['patch'],
                  },
                },
              });
            } else if (tool.name === 'spawn_process') {
              // 进程启动工具
              tools.push({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: {
                    type: 'object',
                    properties: {
                      sessionId: {
                        type: 'string',
                        description: '进程会话ID',
                      },
                      command: {
                        type: 'string',
                        description: '要执行的命令',
                      },
                      args: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '命令参数（可选）',
                      },
                    },
                    required: ['sessionId', 'command'],
                  },
                },
              });
            } else if (tool.name === 'terminate_process') {
              // 进程终止工具
              tools.push({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: {
                    type: 'object',
                    properties: {
                      sessionId: {
                        type: 'string',
                        description: '进程会话ID',
                      },
                    },
                    required: ['sessionId'],
                  },
                },
              });
            } else if (tool.name === 'list_processes') {
              // 进程列表工具
              tools.push({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: {
                    type: 'object',
                    properties: {
                      status: {
                        type: 'string',
                        enum: ['running', 'stopped', 'failed'],
                        description: '筛选状态（可选）',
                      },
                    },
                  },
                },
              });
            } else if (tool.name === 'process_status') {
              // 进程状态工具
              tools.push({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: {
                    type: 'object',
                    properties: {
                      sessionId: {
                        type: 'string',
                        description: '进程会话ID',
                      },
                    },
                    required: ['sessionId'],
                  },
                },
              });
            } else if (tool.name === 'exa_search') {
              // Agent Reach - Exa 语义搜索
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
                      options: {
                        type: 'object',
                        description: '搜索选项（可选）',
                        properties: {
                          numResults: { type: 'number', description: '返回结果数量' },
                          livecrawl: { type: 'string', enum: ['fallback', 'preferred'], description: '实时抓取模式' },
                          type: { type: 'string', enum: ['auto', 'fast'], description: '搜索类型' },
                        },
                      },
                    },
                    required: ['query'],
                  },
                },
              });
            } else if (tool.name === 'exa_code_search') {
              // Agent Reach - Exa 代码搜索
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
                        description: '代码搜索关键词',
                      },
                      tokensNum: {
                        type: 'number',
                        description: 'Token 数量（可选）',
                      },
                    },
                    required: ['query'],
                  },
                },
              });
            } else if (tool.name === 'jina_read') {
              // Agent Reach - Jina Reader 网页提取
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
                        description: '要提取的网页 URL',
                      },
                    },
                    required: ['url'],
                  },
                },
              });
            } else if (tool.name === 'youtube_search') {
              // Agent Reach - YouTube 视频搜索
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
                        description: 'YouTube 视频 URL',
                      },
                    },
                    required: ['url'],
                  },
                },
              });
            } else if (tool.name === 'bilibili_search') {
              // Agent Reach - B站视频搜索
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
                        description: 'B站视频 URL',
                      },
                    },
                    required: ['url'],
                  },
                },
              });
            } else if (tool.name === 'smart_search_v2') {
              // Agent Reach - 智能搜索 V2
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
                        description: '搜索关键词或 URL',
                      },
                      numResults: {
                        type: 'number',
                        description: '返回结果数量（可选）',
                      },
                    },
                    required: ['query'],
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

      // 加载历史对话（从 SharedContext 参数）
      let lastMessageIsCurrent = false;
      if (sharedContext) {
        const history = sharedContext.getAllMessages();
        // 过滤掉system消息，避免重复
        const conversationMessages = history.filter(m => m.role !== 'system');

        // 检查最后一条消息是否是当前用户消息（避免重复）
        if (conversationMessages.length > 0) {
          const lastMsg = conversationMessages[conversationMessages.length - 1];
          if (lastMsg.role === 'user' && lastMsg.content === content) {
            lastMessageIsCurrent = true;
          }
        }

        // 使用 ContextCompressor 压缩上下文（替代简单的 slice(-10)）
        // 转换为 ContextCompressor 格式
        const contextMessages: ContextMessage[] = conversationMessages.map(msg => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.timestamp || new Date(),
        }));

        // 压缩上下文（优化配置：保留更多最近消息以支持对话连续性）
        // GLM-4.7 支持 128k context，可以使用更大的上下文
        const compressResult = ContextCompressor.compress(contextMessages, {
          maxTokens: 16000,    // 增加到 16k tokens（原来 8k）
          recentRatio: 0.7,    // 70% 给最近消息（原来 50%），更好支持连续对话
          summaryBatchSize: 15, // 增加批次大小
          preserveCodeBlocks: true,
          preserveFilePaths: true,
        });

        const compressedHistory = compressResult.messages;
        const stats = compressResult.stats;

        // 排除当前消息（如果在历史中）
        const recentHistory = lastMessageIsCurrent
          ? compressedHistory.slice(0, -1)
          : compressedHistory;

        for (const msg of recentHistory) {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
          logger.debug(`[SimpleCoordinator] 加载历史消息: ${msg.role}, 长度=${msg.content.length}`);
        }

        logger.info(
          `[SimpleCoordinator] 上下文压缩: ${stats.originalCount} -> ${stats.compressedCount} 条消息, ` +
          `${stats.originalTokens} -> ${stats.compressedTokens} tokens, ` +
          `压缩率: ${(stats.compressionRatio * 100).toFixed(1)}%`
        );
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

        // 构建请求体
        const requestBody: any = {
          model: 'glm-4.7',
          messages,
          max_tokens: 4096,
          temperature: 0.7,
        };

        // 添加 function calling 工具
        if (!isLastIteration && tools.length > 0) {
          requestBody.tools = tools;
          requestBody.tool_choice = 'auto';
        }

        // 添加智谱 AI 内置网络搜索工具（仅非 Coding Plan 端点支持）
        // Coding Plan 端点 (api/coding/paas/v4) 不支持 web_search 工具
        const isCodingPlanEndpoint = baseUrl.includes('/coding/');
        if (!isLastIteration && !isCodingPlanEndpoint) {
          requestBody.tools = requestBody.tools || [];
          const now = new Date();
          const todayStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
          requestBody.tools.push({
            type: 'web_search',
            web_search: {
              enable: 'True',  // 必须是字符串 'True'，不是布尔值
              search_engine: 'search_pro',
              search_result: 'True',
              search_prompt: `今天是${todayStr}。请搜索并总结最新的相关信息，优先展示最近7天内的新闻和资讯。请标注信息来源的发布日期。`,
              search_recency_filter: '7d',
              content_size: 'high',
            }
          });
          logger.debug('[SimpleCoordinator] 已添加 web_search 工具');
        } else if (isCodingPlanEndpoint) {
          logger.debug('[SimpleCoordinator] Coding Plan 端点不支持 web_search 工具，跳过');
        }

        // 诊断日志：记录请求体（用于调试 400 错误）
        logger.info(`[SimpleCoordinator] GLM API 请求: ${JSON.stringify({
          model: requestBody.model,
          messages_count: requestBody.messages?.length,
          tools_count: requestBody.tools?.length,
          tools: requestBody.tools,
        })}`);

        const response = await this.axiosInstance.post(`${baseUrl}/chat/completions`, requestBody, {
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

      // ========== 🔄 回答质量自检和闭环反馈 ==========
      const qualityCheck = this.checkResponseQuality(finalResponse, content);
      if (!qualityCheck.isQualityGood) {
        logger.warn(`[SimpleCoordinator] 回答质量不合格: ${qualityCheck.reason}`);
        logger.info(`[SimpleCoordinator] 启动闭环反馈机制...`);

        // 尝试自动纠正
        const correctedResponse = await this.autoCorrectResponse(content, finalResponse, qualityCheck);
        if (correctedResponse && correctedResponse !== finalResponse) {
          logger.info(`[SimpleCoordinator] 闭环纠正成功，响应长度: ${correctedResponse.length}`);
          return correctedResponse;
        }
      }

      return finalResponse;
    } catch (error) {
      logger.error(`[SimpleCoordinator] LLM 调用失败: ${error}`);
      return `❌ LLM 调用失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 检查回答质量
   *
   * 无效答案定义：
   * 1. 纯粹拒绝（有拒绝词但无实质内容）
   * 2. 纯粹AI声明（只有身份声明，无实际回答）
   * 3. 纯粹"不知道"（只有无知声明，无其他信息）
   * 4. 空或近空响应
   * 5. 纯思考过程（"让我想想"等，无实际内容）
   *
   * @returns { isQualityGood: boolean, reason?: string }
   */
  private checkResponseQuality(response: string, originalQuery: string): { isQualityGood: boolean; reason?: string } {
    if (!response || response.trim().length === 0) {
      return { isQualityGood: false, reason: '响应为空' };
    }

    const trimmed = response.trim();
    const lowerResponse = trimmed.toLowerCase();

    // ========== 1. 纯粹拒绝检测 ==========
    // 匹配 "抱歉，我无法..." 但后面没有实质内容的情况
    const pureRefusalPattern = /^(抱歉|对不起|不好意思|sorry|我无法|我没法|我不能)[，,。\s]*?(无法|不能|没法|没办法).*?([。！？\.!?]|\s*$)/;
    if (pureRefusalPattern.test(lowerResponse) && trimmed.length < 50) {
      return { isQualityGood: false, reason: '纯粹拒绝回答' };
    }

    // ========== 2. 纯粹 AI 身份声明检测 ==========
    // 匹配只有身份声明，没有实际回答的情况
    const pureAIIdentityPattern = /^(作为(一个)?AI(语言模型)?|我(只是|是一个)AI)[，,。\s]*?(我(没有|无法|不能|没法)|(没有|无法|不能|没法)(个人观点|意识|知识)).*?([。！？\.!?]|\s*$)/;
    if (pureAIIdentityPattern.test(lowerResponse) && trimmed.length < 80) {
      return { isQualityGood: false, reason: '纯粹AI身份声明' };
    }

    // ========== 3. 纯粹"不知道"检测 ==========
    // 匹配只有"我不知道"之类，没有提供任何替代方案或建议
    const pureDontKnowPattern = /^(我(不知道|不清楚|不确定|不了解)|不知道|不清楚|不确定)[，,。\s]*?([。！？\.!?]|\s*$)/;
    if (pureDontKnowPattern.test(lowerResponse) && trimmed.length < 30) {
      return { isQualityGood: false, reason: '纯粹不知道' };
    }

    // ========== 4. 空或近空响应检测 ==========
    // 只有空白字符、表情符号等
    if (/^[\s\u200b\u200c\u200d\p{Emoji}]+$/u.test(trimmed)) {
      return { isQualityGood: false, reason: '仅包含空白/表情' };
    }

    // ========== 5. 纯思考过程检测 ==========
    // 只有思考标记，没有实际内容
    const pureThinkingPattern = /^(让我(想想|思考|查查)|我需要(思考|查找|研究)|正在(思考|查找|搜索))[，,。\s]*?([。！？\.!?]|\s*$)/;
    if (pureThinkingPattern.test(lowerResponse) && trimmed.length < 40) {
      return { isQualityGood: false, reason: '纯思考过程' };
    }

    // ========== 6. 过短响应检测（但要有实质内容） ==========
    if (trimmed.length < 15) {
      // 检查是否有实质内容（中英文、数字、链接中的至少一种）
      const hasSubstance = /[\u4e00-\u9fa5a-zA-Z0-9]{5,}|https?:\/\//.test(trimmed);
      if (!hasSubstance) {
        return { isQualityGood: false, reason: '过短且无实质内容' };
      }
    }

    // ========== 7. 检查是否有基本内容 ==========
    // 必须包含至少一个有意义的内容元素
    const hasBasicContent =
      /[\u4e00-\u9fa5]{8,}/.test(trimmed) ||  // 至少8个中文字符
      /[a-zA-Z]{15,}/.test(trimmed) ||      // 至少15个英文字母
      /\d{3,}/.test(trimmed) ||             // 至少3个连续数字
      /https?:\/\/\S+/.test(trimmed);        // 或一个URL

    if (!hasBasicContent) {
      return { isQualityGood: false, reason: '缺少基本内容' };
    }

    return { isQualityGood: true };
  }

  /**
   * 自动纠正低质量响应（闭环反馈）
   */
  private async autoCorrectResponse(
    originalQuery: string,
    failedResponse: string,
    qualityCheck: { isQualityGood: boolean; reason?: string }
  ): Promise<string | null> {
    logger.info(`[SimpleCoordinator] 尝试自动纠正，原因: ${qualityCheck.reason}`);

    // 策略1: 如果是搜索相关查询，尝试使用备用搜索工具
    const lowerQuery = originalQuery.toLowerCase();
    if (lowerQuery.includes('搜索') || lowerQuery.includes('search') || lowerQuery.includes('查找')) {
      logger.info(`[SimpleCoordinator] 检测到搜索查询，尝试备用搜索`);

      // 尝试 Tavily
      const tavilyTool = this.toolManager.get('tavily_search');
      if (tavilyTool) {
        try {
          const query = originalQuery.replace(/^(搜索|search|用\s*\w+\s*搜索)\s*/i, '').trim();
          const result = await tavilyTool.execute({ query, maxResults: 5 });
          if (result && result.length > 50 && !result.includes('API')) {
            logger.info(`[SimpleCoordinator] Tavily 备用搜索成功`);
            return `🔍 **搜索结果** (Tavily)\n\n${result}`;
          }
        } catch (e) {
          logger.debug(`[SimpleCoordinator] Tavily 备用搜索失败: ${e}`);
        }
      }

      // 尝试 DuckDuckGo
      const ddgTool = this.toolManager.get('duckduckgo_search');
      if (ddgTool) {
        try {
          const query = originalQuery.replace(/^(搜索|search|用\s*\w+\s*搜索)\s*/i, '').trim();
          const result = await ddgTool.execute({ query, maxResults: 5 });
          if (result && result.length > 50) {
            logger.info(`[SimpleCoordinator] DuckDuckGo 备用搜索成功`);
            return `🔍 **搜索结果** (DuckDuckGo)\n\n${result}`;
          }
        } catch (e) {
          logger.debug(`[SimpleCoordinator] DuckDuckGo 备用搜索失败: ${e}`);
        }
      }
    }

    // 策略2: 重新生成响应（带更明确的指令）
    try {
      // 移除尾部斜杠以避免双重斜杠问题
      const baseUrl = (process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
      const apiKey = process.env.GLM_API_KEY;

      const retryMessages = [
        {
          role: 'system',
          content: `你是一个专业助手。用户的问题是：${originalQuery}

之前的回答质量不合格（${qualityCheck.reason}）。请重新提供高质量的回答。

## 要求：
1. 直接回答用户的问题，不要说"我不知道"、"无法回答"等
2. 提供具体、详细的信息
3. 如果不确定，请说明你将尽力帮助
4. 使用清晰的格式和结构
5. 不要以 AI 身份自限

请直接给出有帮助的回答。`
        },
        {
          role: 'user',
          content: originalQuery
        }
      ];

      const response = await this.axiosInstance.post(`${baseUrl}/chat/completions`, {
        model: 'glm-4.7',
        messages: retryMessages,
        max_tokens: 2048,
        temperature: 0.7,
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      const newResponse = response.data.choices?.[0]?.message?.content;
      if (newResponse && newResponse.length > 20) {
        // 检查新响应质量
        const newQualityCheck = this.checkResponseQuality(newResponse, originalQuery);
        if (newQualityCheck.isQualityGood) {
          logger.info(`[SimpleCoordinator] 重新生成响应成功`);
          return newResponse;
        }
      }
    } catch (e) {
      logger.debug(`[SimpleCoordinator] 重新生成响应失败: ${e}`);
    }

    // 策略3: 返回友好的错误提示
    logger.warn(`[SimpleCoordinator] 所有纠正策略均失败`);
    return null;
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
