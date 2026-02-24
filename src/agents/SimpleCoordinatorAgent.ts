/**
 * SimpleCoordinatorAgent - 极简协调 Agent
 *
 * 设计理念：
 * 1. 单一协调者 - 一个 Agent 处理所有任务
 * 2. 动态技能加载 - 通过 SKILL.md 切换身份和技能
 * 3. 简化记忆 - 基于 markdown 文档的记忆系统
 * 4. 规则引擎 - 通过 markdown 文档定义规则
 * 5. 直接工具调用 - 不经过 ReAct，直接调用工具
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

  // 支持代理环境变量
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (proxyUrl) {
    logger.info(`[SimpleCoordinator] 使用代理: ${proxyUrl}`);
    config.httpsAgent = new HttpsProxyAgent(proxyUrl);
    config.proxy = false; // 禁用 axios 默认代理
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
 * 工具定义
 */
interface Tool {
  name: string;
  description: string;
  execute: (params: any) => Promise<string>;
}

/**
 * SimpleCoordinator 配置
 */
export interface SimpleCoordinatorConfig {
  skillsPath: string;
  memoryPath: string;
  rulesPath: string;
  sharedContext?: SharedContext;
}

/**
 * SimpleCoordinator Agent
 */
export class SimpleCoordinatorAgent implements IAgent {
  readonly id = 'simple-coordinator';
  readonly name = 'Simple Coordinator';
  readonly description = '极简协调 Agent - 技能驱动，直接执行';
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
  private tools: Map<string, Tool> = new Map();
  private memory: Map<string, MemoryEntry[]> = new Map();
  private currentSkill: SkillMetadata | null = null;
  private axiosInstance: AxiosInstance;
  private sharedContext?: SharedContext;

  constructor(config: SimpleCoordinatorConfig) {
    this.skillsPath = config.skillsPath;
    this.memoryPath = config.memoryPath;
    this.rulesPath = config.rulesPath;
    this.sharedContext = config.sharedContext;
    this.axiosInstance = createAxiosInstance();
  }

  /**
   * 初始化 - 加载核心技能和工具
   */
  async initialize(): Promise<void> {
    logger.info('[SimpleCoordinator] 初始化...');

    // 加载核心技能
    await this.loadDefaultSkill();

    // 加载记忆
    await this.loadMemory();

    // 注册工具
    this.registerTools();

    logger.info('[SimpleCoordinator] 初始化完成');
  }

  /**
   * 处理消息
   */
  async process(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    const startTime = Date.now();
    const content = message.content as string;

    logger.info(`[SimpleCoordinator] 处理请求: ${content.substring(0, 50)}...`);

    // 优先使用 context 中的 sharedContext（用户特定的上下文）
    const activeContext = context.sharedContext || this.sharedContext;

    try {
      // 记录用户消息到共享上下文
      if (activeContext) {
        activeContext.addConversation('user', content, this.id);
      }

      // 1. 识别需要的技能
      const skillName = await this.identifySkill(content);
      if (skillName && skillName !== this.currentSkill?.name) {
        await this.loadSkill(skillName);
      }

      // 2. 构建提示词（包含对话历史）
      const prompt = await this.buildPrompt(content, message, activeContext);

      // 3. 直接执行（不经过 ReAct）
      const result = await this.executeDirectly(content, context);

      // 记录助手回复到共享上下文
      if (activeContext) {
        activeContext.addConversation('assistant', result, this.id);
      }

      const duration = Date.now() - startTime;
      logger.info(`[SimpleCoordinator] 处理完成，耗时: ${duration}ms`);

      return {
        content: result,
        agentId: this.id,
      };

    } catch (error) {
      logger.error(`[SimpleCoordinator] 处理失败: ${error}`);
      const errorMsg = `处理失败: ${error instanceof Error ? error.message : String(error)}`;

      // 记录错误消息到共享上下文
      if (activeContext) {
        activeContext.addConversation('assistant', errorMsg, this.id);
      }

      return {
        content: errorMsg,
        agentId: this.id,
      };
    }
  }

  /**
   * 识别需要的技能
   */
  private async identifySkill(content: string): Promise<string | null> {
    const lowerContent = content.toLowerCase();

    // 按优先级顺序检查（搜索优先，因为很多请求都可能包含"搜索"这个词）
    const skillChecks: Array<{ skill: string; keywords: string[] }> = [
      {
        skill: 'search',
        keywords: ['搜索', 'search', '查找', 'find', '资讯', '新闻', '消息'],
      },
      {
        skill: 'code',
        keywords: ['代码', '编程', 'code', '函数', '类', '脚本', '算法'],
      },
      {
        skill: 'file',
        keywords: ['文件', '发送', 'file', '下载', '保存'],
      },
      {
        skill: 'browser',
        keywords: ['网页', '浏览器', 'browser', '访问', '打开', 'url'],
      },
      {
        skill: 'data',
        keywords: ['数据', '分析', 'data', '统计', '图表'],
      },
    ];

    // 按顺序检查，第一个匹配的返回
    for (const { skill, keywords } of skillChecks) {
      for (const keyword of keywords) {
        if (lowerContent.includes(keyword)) {
          logger.debug(`[SimpleCoordinator] 识别技能: ${skill} (关键词: ${keyword})`);
          return skill;
        }
      }
    }

    return null; // 使用默认技能
  }

  /**
   * 加载技能
   */
  private async loadSkill(skillName: string): Promise<void> {
    const skillFile = path.join(this.skillsPath, `${skillName}.md`);

    try {
      const content = await fs.readFile(skillFile, 'utf-8');
      this.currentSkill = this.parseSkill(content);
      logger.info(`[SimpleCoordinator] 技能已加载: ${skillName}`);
    } catch (error) {
      logger.warn(`[SimpleCoordinator] 技能加载失败: ${skillName}, 使用默认技能`);
      await this.loadDefaultSkill();
    }
  }

  /**
   * 加载默认技能
   */
  private async loadDefaultSkill(): Promise<void> {
    this.currentSkill = {
      name: 'default',
      description: '默认技能 - 通用助手',
      systemPrompt: `你是一个智能助手，可以帮助用户完成各种任务。

## 工作原则
- 理解用户需求，提供准确答案
- 如果需要更多信息，主动询问
- 保持简洁明了的回答`,
      rules: [],
      examples: [],
    };
  }

  /**
   * 解析技能文件
   */
  private parseSkill(content: string): SkillMetadata {
    // 简单解析 - 提取主要部分
    const lines = content.split('\n');
    let systemPrompt = '';
    const rules: string[] = [];
    const examples: Array<{ input: string; output: string }> = [];

    let currentSection = '';
    let currentExample: any = {};

    for (const line of lines) {
      if (line.startsWith('# ')) {
        currentSection = line.substring(2).trim().toLowerCase();
        continue;
      }

      if (currentSection.includes('system') || currentSection.includes('系统')) {
        systemPrompt += line + '\n';
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

    return {
      name: 'custom',
      description: '自定义技能',
      systemPrompt: systemPrompt.trim(),
      rules,
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

      // 简单解析记忆
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
   * 注册工具
   */
  private registerTools(): void {
    // 这里注册直接可用的工具
    // 实际实现时会连接到现有的工具系统
    this.tools.set('search', {
      name: 'search',
      description: '网络搜索',
      execute: async (params) => {
        // 连接到现有的搜索功能
        return `搜索结果: ${params.query}`;
      },
    });

    this.tools.set('code', {
      name: 'code',
      description: '代码执行',
      execute: async (params) => {
        // 连接到 Claude Code CLI
        return `代码执行结果`;
      },
    });

    // ... 更多工具
  }

  /**
   * 构建提示词
   */
  private async buildPrompt(content: string, message: AgentMessage, activeContext?: SharedContext): Promise<string> {
    let prompt = '';

    // 添加技能提示
    if (this.currentSkill?.systemPrompt) {
      prompt += this.currentSkill.systemPrompt + '\n\n';
    }

    // 添加对话历史（从共享上下文获取）
    if (activeContext) {
      const messages = activeContext.getAllMessages();
      if (messages.length > 0) {
        prompt += '## 对话历史\n';
        // 只取最近的 10 条消息
        const recentMessages = messages.slice(-10);
        for (const msg of recentMessages) {
          const roleLabel = msg.role === 'user' ? '用户' : '助手';
          prompt += `${roleLabel}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}\n`;
        }
        prompt += '\n';
      }
    }

    // 添加记忆（备用）
    const memories = this.memory.get('default') || [];
    if (memories.length > 0) {
      prompt += '## 相关记忆\n';
      const relevantMemories = memories.slice(0, 3);
      for (const memory of relevantMemories) {
        prompt += `- ${memory.content.substring(0, 100)}...\n`;
      }
      prompt += '\n';
    }

    // 添加可用工具
    prompt += '## 可用工具\n';
    for (const [name, tool] of this.tools) {
      prompt += `- ${name}: ${tool.description}\n`;
    }
    prompt += '\n';

    // 添加用户消息
    prompt += `## 用户请求\n${content}`;

    return prompt;
  }

  /**
   * 直接执行（不经过 ReAct）
   */
  private async executeDirectly(content: string, context: AgentContext): Promise<string> {
    const lowerContent = content.toLowerCase();

    // 优先检测 GitHub URL（最高优先级，避免走搜索 API）
    const githubMatch = content.match(/(https?:\/\/github\.com\/[^\s]+)/);
    if (githubMatch) {
      return await this.executeGitHubFetch(githubMatch[1]);
    }

    // 检测 tavily-search
    if (lowerContent.includes('tavily') || lowerContent.includes('tavily-search')) {
      return await this.executeTavilySearch(content);
    }

    // 搜索
    if (lowerContent.includes('搜索') || lowerContent.includes('search')) {
      return await this.executeWebSearch(content);
    }

    // 代码
    if (lowerContent.includes('代码') || lowerContent.includes('编程') || lowerContent.includes('code')) {
      return await this.executeCode(content);
    }

    // 默认：直接调用 LLM
    return await this.callLLM(content);
  }

  /**
   * 执行 Tavily 搜索
   */
  private async executeTavilySearch(content: string): Promise<string> {
    logger.info(`[SimpleCoordinator] 执行 Tavily 搜索: ${content.substring(0, 50)}...`);

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return `❌ Tavily API Key 未配置。请在 .env 中设置 TAVILY_API_KEY`;
    }

    try {
      // 提取搜索关键词
      let query = content
        .replace(/用\s*tavily(-search)?\s*搜索/i, '')
        .replace(/https?:\/\/[^\s]+/gi, '') // 移除 URL
        .replace(/看看这个项目/gi, '')
        .trim();

      if (!query) {
        // 如果没有关键词，使用 URL 中的信息
        const urlMatch = content.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
        if (urlMatch) {
          query = `${urlMatch[1]} ${urlMatch[2]} GitHub 项目`;
        }
      }

      if (!query) {
        return `⚠️ 无法提取搜索关键词。请提供要搜索的内容。`;
      }

      logger.info(`[SimpleCoordinator] Tavily 查询: ${query}`);

      const apiUrl = process.env.TAVILY_API_URL || 'https://api.tavily.com/search';

      const response = await this.axiosInstance.post(apiUrl, {
        api_key: apiKey,
        query,
        search_depth: 'basic',
        topics: ['general'],
        days: 7,
        max_results: 5,
        include_answer: true,
        include_raw_content: false,
        include_images: false,
      });

      const data = response.data;

      // 格式化结果
      let output = `🔍 **Tavily 搜索结果**: ${query}\n\n`;

      if (data.answer) {
        output += `💡 **AI 总结**\n${data.answer}\n\n`;
      }

      output += `**找到 ${data.results?.length || 0} 条相关结果**：\n\n`;

      for (let i = 0; i < (data.results?.length || 0); i++) {
        const result = data.results[i];
        output += `${i + 1}. **${result.title}**\n`;
        output += `   ${result.content.substring(0, 500)}${result.content.length > 500 ? '...' : ''}\n`;
        output += `   🔗 ${result.url}\n`;
        if (result.published_date) {
          output += `   📅 ${result.published_date}\n`;
        }
        output += `\n`;
      }

      return output;
    } catch (error) {
      logger.error(`[SimpleCoordinator] Tavily 搜索失败: ${error}`);
      return `❌ Tavily 搜索失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 执行网络搜索（使用 Zhipu）
   */
  private async executeWebSearch(content: string): Promise<string> {
    logger.info(`[SimpleCoordinator] 执行网络搜索: ${content.substring(0, 50)}...`);

    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) {
      return `❌ GLM API Key 未配置。请配置 GLM_API_KEY`;
    }

    try {
      // 提取搜索关键词
      let query = content
        .replace(/^(搜索|search)\s*/i, '')
        .replace(/用\s*\w+\s*搜索/i, '')
        .trim();

      const baseUrl = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';

      const response = await this.axiosInstance.post(`${baseUrl}/chat/completions`, {
        model: 'glm-4.7',
        messages: [
          {
            role: 'system',
            content: '你是一个搜索助手。请根据用户的问题进行网络搜索，提供准确、详细的答案。如果搜索到相关信息，请总结要点并提供来源。',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        tools: [
          {
            type: 'web_search',
            web_search: {
              enable: true,
              search_result: true,
            },
          },
        ],
        max_tokens: 4096,
        temperature: 0.7,
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      const result = response.data.choices?.[0]?.message?.content || '搜索失败，未获取到结果';

      return `🔍 **搜索结果**: ${query}\n\n${result}`;
    } catch (error) {
      logger.error(`[SimpleCoordinator] 网络搜索失败: ${error}`);
      return `❌ 网络搜索失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 执行代码任务
   */
  private async executeCode(content: string): Promise<string> {
    logger.info(`[SimpleCoordinator] 执行代码任务: ${content.substring(0, 50)}...`);

    // 连接到 GLM API 进行代码生成
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
      logger.error(`[SimpleCoordinator] 代码执行失败: ${error}`);
      return `❌ 代码生成失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 执行 GitHub 获取
   */
  private async executeGitHubFetch(url: string): Promise<string> {
    logger.info(`[SimpleCoordinator] 执行 GitHub 获取: ${url}`);

    try {
      // 使用 smartFetch
      const { smartFetch } = await import('./tools/network_tool.js');
      const result = await smartFetch(url, { timeout: 15000 });

      if (result.success && result.content) {
        // 提取 GitHub 项目信息
        const info = this.extractGitHubInfo(result.content, url);

        if (info) {
          return this.formatGitHubInfo(info);
        } else {
          // 无法解析，返回原始内容预览
          return `✅ **GitHub 内容获取成功**

📍 **URL**: ${url}
🔄 **访问方式**: ${result.strategy || 'direct'}
📄 **内容长度**: ${result.content.length} 字符

---

**内容预览**:

${result.content.substring(0, 5000)}${result.content.length > 5000 ? '\n\n...(内容已截断，完整内容请访问链接)' : ''}
`;
        }
      } else {
        return `❌ **GitHub 获取失败**

${result.error || '未知错误'}

💡 **建议**:
- 检查 URL 是否正确
- 尝试使用浏览器访问
- 或使用网络搜索查找相关信息`;
      }
    } catch (error) {
      logger.error(`[SimpleCoordinator] GitHub 获取失败: ${error}`);
      return `❌ GitHub 获取失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 提取 GitHub 项目信息
   */
  private extractGitHubInfo(html: string, url: string): any | null {
    try {
      // 提取项目名称
      const nameMatch = html.match(/<title>(.*?)\s*\(.*?\)\s*<\/title>/) ||
                        html.match(/<meta property="og:title" content="([^"]+)"/);
      const name = nameMatch ? nameMatch[1].replace(' · GitHub', '') : '';

      // 提取描述
      const descMatch = html.match(/<meta name="description" content="([^"]+)"/) ||
                        html.match(/<meta property="og:description" content="([^"]+)"/);
      const description = descMatch ? descMatch[1] : '';

      // 提取 star 数
      const starMatch = html.match(/aria-label="(\d+(?:,\d+)*) users starred this repository"/) ||
                        html.match(/"starCount":\s*(\d+)/);
      const stars = starMatch ? starMatch[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',') : 'N/A';

      // 提取主要语言
      const langMatch = html.match(/<span\s+itemprop="programmingLanguage">([^<]+)<\/span>/);
      const language = langMatch ? langMatch[1] : 'N/A';

      if (!name && !description) {
        return null;
      }

      return {
        name: name || 'Unknown',
        description: description || '无描述',
        stars,
        language,
        url,
      };
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

    // 简单的特色总结
    output += `### 🎯 项目特色\n\n`;
    if (info.description) {
      output += `- **核心功能**: ${info.description}\n`;
    }
    if (info.language !== 'N/A') {
      output += `- **技术栈**: 使用 ${info.language} 开发\n`;
    }
    if (info.stars !== 'N/A') {
      const starNum = parseInt(info.stars.replace(/,/g, ''));
      if (starNum > 10000) {
        output += `- **热度**: 🌟🌟🌟 热门项目 (${info.stars} stars)\n`;
      } else if (starNum > 1000) {
        output += `- **热度**: 🌟🌟 受欢迎的项目 (${info.stars} stars)\n`;
      } else if (starNum > 100) {
        output += `- **热度**: 🌟 成长的项目 (${info.stars} stars)\n`;
      }
    }

    output += `\n💡 **建议**: 查看完整 README 和代码以了解更多详情\n`;

    return output;
  }

  /**
   * 调用 LLM
   */
  private async callLLM(content: string): Promise<string> {
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
            content: '你是一个智能助手，请根据用户的问题提供有帮助的回答。',
          },
          {
            role: 'user',
            content: content,
          },
        ],
        max_tokens: 4096,
        temperature: 0.7,
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      return response.data.choices?.[0]?.message?.content || '抱歉，我没有生成回复。';
    } catch (error) {
      logger.error(`[SimpleCoordinator] LLM 调用失败: ${error}`);
      return `❌ LLM 调用失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 检查是否能处理
   */
  canHandle(message: AgentMessage): number {
    // 简单 Agent 可以处理所有消息
    return 1.0;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    logger.info('[SimpleCoordinator] 资源已清理');
  }
}

export default SimpleCoordinatorAgent;
