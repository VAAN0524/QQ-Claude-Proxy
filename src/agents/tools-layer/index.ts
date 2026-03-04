/**
 * 工具层 - 统一的工具接口
 *
 * 将专业 Agents 的功能提取为工具函数，
 * 供 SimpleCoordinatorAgent 直接调用。
 */

// 搜索工具
export * from './search-tools.js';

// 导出 Agent Reach 相关类型
export type { ExaSearchOptions, ExaResult, VideoInfo, SmartSearchV2Result } from './search-tools.js';

// 网页工具
export * from './web-tools.js';

// Shell 工具
export * from './shell-tools.js';

// 文件工具
export * from './file-tools.js';

// 进程工具
export * from './process-tools.js';

/**
 * 工具类型定义
 */
export interface Tool {
  name: string;
  description: string;
  category: 'search' | 'web' | 'shell' | 'code' | 'vision' | 'data' | 'file' | 'process';
  execute: (params: any) => Promise<any>;
}

/**
 * Function Calling 参数 Schema (OpenAI 格式)
 */
export interface ToolFunctionCallingSchema {
  type: 'object';
  properties: Record<string, { type: string; description: string; default?: any; items?: any }>;
  required?: string[];
}

/**
 * Function Calling 定义 (用于 LLM)
 */
export interface FunctionCallingDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolFunctionCallingSchema;
  };
}

/**
 * 工具管理器
 */
export class ToolManager {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.registerBuiltinTools();
  }

  /**
   * 注册内置工具
   */
  private registerBuiltinTools(): void {
    // 搜索工具 - 使用智谱 AI 内置搜索和 Tavily
    this.register({
      name: 'tavily_search',
      description: '使用 Tavily 进行专业网络搜索（推荐）。需要配置 TAVILY_API_KEY。搜索时请在关键词中包含当前年份以获取最新资讯。',
      category: 'search',
      execute: async (params: { query: string; maxResults?: number }) => {
        const { tavilySearch, formatSearchResults, TAVILY_API_GUIDE } = await import('./search-tools.js');
        try {
          const result = await tavilySearch(params.query, params.maxResults);
          return formatSearchResults(result.results, result.answer, 'tavily');
        } catch (error: any) {
          return `❌ 搜索失败: ${error.message}\n\n${TAVILY_API_GUIDE}`;
        }
      },
    });

    this.register({
      name: 'smart_search',
      description: '智能搜索 - 优先使用 Tavily，未配置则提示申请。搜索时请在关键词中包含当前年份以获取最新资讯。',
      category: 'search',
      execute: async (params: { query: string; maxResults?: number }) => {
        const { smartSearch, formatSearchResults } = await import('./search-tools.js');
        const result = await smartSearch(params.query, params);
        if (result.tip) {
          return result.tip;
        }
        return formatSearchResults(result.results, result.answer, result.source);
      },
    });

    // Agent Reach 搜索工具
    this.register({
      name: 'exa_search',
      description: 'Exa 语义搜索，支持代码搜索。重要：搜索时必须在关键词中包含当前年份（如 "2026年"）以获取最新资讯。',
      category: 'search',
      execute: async (params: { query: string; options?: { numResults?: number; livecrawl?: 'fallback' | 'preferred'; type?: 'auto' | 'fast' } }) => {
        const { exaSearch, formatAgentReachResult } = await import('./search-tools.js');
        try {
          const results = await exaSearch(params.query, params.options || {});
          return formatAgentReachResult({ source: 'exa', results });
        } catch (error: any) {
          return `❌ Exa 搜索失败: ${error.message}\n\n请确保 mcporter 和 Exa 已正确配置。`;
        }
      },
    });

    this.register({
      name: 'exa_code_search',
      description: 'Exa 代码搜索，查找 API 文档和代码示例。',
      category: 'search',
      execute: async (params: { query: string; tokensNum?: number }) => {
        const { exaCodeSearch } = await import('./search-tools.js');
        try {
          return await exaCodeSearch(params.query, params.tokensNum);
        } catch (error: any) {
          return `❌ Exa 代码搜索失败: ${error.message}\n\n请确保 mcporter 和 Exa 已正确配置。`;
        }
      },
    });

    this.register({
      name: 'jina_read',
      description: '使用 Jina Reader 提取网页内容，支持任意 URL。',
      category: 'web',
      execute: async (params: { url: string }) => {
        const { jinaRead, formatAgentReachResult } = await import('./search-tools.js');
        try {
          const content = await jinaRead(params.url);
          return formatAgentReachResult({ source: 'jina', content });
        } catch (error: any) {
          return `❌ 网页读取失败: ${error.message}`;
        }
      },
    });

    this.register({
      name: 'youtube_search',
      description: 'YouTube 视频信息提取，获取标题、描述、时长等。',
      category: 'search',
      execute: async (params: { url: string }) => {
        const { youtubeSearch, formatAgentReachResult } = await import('./search-tools.js');
        try {
          const video = await youtubeSearch(params.url);
          return formatAgentReachResult({ source: 'youtube', video });
        } catch (error: any) {
          return `❌ YouTube 视频信息提取失败: ${error.message}`;
        }
      },
    });

    this.register({
      name: 'bilibili_search',
      description: 'B站视频信息提取，获取标题、描述、时长等。',
      category: 'search',
      execute: async (params: { url: string }) => {
        const { bilibiliSearch, formatAgentReachResult } = await import('./search-tools.js');
        try {
          const video = await bilibiliSearch(params.url);
          return formatAgentReachResult({ source: 'bilibili', video });
        } catch (error: any) {
          return `❌ B站视频信息提取失败: ${error.message}`;
        }
      },
    });

    this.register({
      name: 'smart_search_v2',
      description: '智能搜索 V2 - 自动识别 URL/视频/关键词并路由到最佳搜索方式。重要：搜索时必须在关键词中包含当前年份（如 "2026年"）以获取最新资讯。',
      category: 'search',
      execute: async (params: { query: string; numResults?: number }) => {
        const { smart_search_v2, formatAgentReachResult } = await import('./search-tools.js');
        try {
          const result = await smart_search_v2(params.query, { numResults: params.numResults });
          return formatAgentReachResult(result);
        } catch (error: any) {
          return `❌ 智能搜索失败: ${error.message}\n\n已回退到基本搜索功能。`;
        }
      },
    });

    // 网页工具
    this.register({
      name: 'fetch_web',
      description: '获取网页内容',
      category: 'web',
      execute: async (params: { url: string; timeout?: number }) => {
        const { fetchWebContent } = await import('./web-tools.js');
        const result = await fetchWebContent(params.url, { timeout: params.timeout });

        if (result.success) {
          let output = `📄 **网页内容**: ${result.url}\n\n`;
          output += `${result.content.substring(0, 2000)}${result.content.length > 2000 ? '...' : ''}\n`;
          return output;
        }
        return `❌ 获取失败: ${result.error}`;
      },
    });

    // Shell 工具
    this.register({
      name: 'execute_command',
      description: '执行系统命令（有安全检查）',
      category: 'shell',
      execute: async (params: { command: string; cwd?: string; timeout?: number }) => {
        const { executeCommand, formatShellResult } = await import('./shell-tools.js');
        const result = await executeCommand(params.command, {
          cwd: params.cwd,
          timeout: params.timeout || 30000,
        });
        return formatShellResult(result, params.command);
      },
    });

    // 文件工具
    this.register({
      name: 'read_file',
      description: '读取文件内容',
      category: 'file',
      execute: async (params: { path: string; maxLength?: number }) => {
        const { readFile, formatFileResult } = await import('./file-tools.js');
        const result = await readFile(params.path, { maxLength: params.maxLength });
        return formatFileResult(result, 'read');
      },
    });

    this.register({
      name: 'write_file',
      description: '写入文件内容',
      category: 'file',
      execute: async (params: { path: string; content: string; createDir?: boolean }) => {
        const { writeFile, formatFileResult } = await import('./file-tools.js');
        const result = await writeFile(params.path, params.content, { createDir: params.createDir });
        return formatFileResult(result, 'write');
      },
    });

    this.register({
      name: 'edit_file',
      description: '编辑文件（精确替换）',
      category: 'file',
      execute: async (params: { path: string; edits: Array<{ oldText: string; newText: string }> }) => {
        const { editFile, formatFileResult } = await import('./file-tools.js');
        const result = await editFile(params.path, params.edits);
        return formatFileResult(result, 'edit');
      },
    });

    this.register({
      name: 'apply_patch',
      description: '应用补丁（unified diff 格式）',
      category: 'file',
      execute: async (params: { patch: string; strip?: number }) => {
        const { writeFile, formatFileResult } = await import('./file-tools.js');
        // 简化实现：写入补丁到临时文件
        const result = await writeFile('.temp.patch', params.patch, { createDir: true });
        return formatFileResult(result, 'write');
      },
    });

    // 进程工具
    this.register({
      name: 'spawn_process',
      description: '启动后台进程',
      category: 'process',
      execute: async (params: { sessionId: string; command: string; args?: string[] }) => {
        const { spawnProcess } = await import('./process-tools.js');
        return await spawnProcess(params.sessionId, params.command, params.args);
      },
    });

    this.register({
      name: 'terminate_process',
      description: '终止后台进程',
      category: 'process',
      execute: async (params: { sessionId: string }) => {
        const { terminateProcess } = await import('./process-tools.js');
        return await terminateProcess(params.sessionId);
      },
    });

    this.register({
      name: 'list_processes',
      description: '列出后台进程',
      category: 'process',
      execute: async (params: { status?: 'running' | 'stopped' | 'failed' }) => {
        const { listProcesses } = await import('./process-tools.js');
        return await listProcesses(params);
      },
    });

    this.register({
      name: 'process_status',
      description: '获取进程状态',
      category: 'process',
      execute: async (params: { sessionId: string }) => {
        const { getProcessStatus } = await import('./process-tools.js');
        return await getProcessStatus(params.sessionId);
      },
    });
  }

  /**
   * 注册工具
   */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 按分类获取工具
   */
  getByCategory(category: Tool['category']): Tool[] {
    return Array.from(this.tools.values()).filter(t => t.category === category);
  }

  /**
   * 获取工具描述（用于 LLM 提示）
   */
  getToolDescriptions(): string {
    let output = '## 可用工具\n\n';

    const categories = ['search', 'web', 'shell', 'code', 'vision', 'data', 'file', 'process'] as const;

    for (const category of categories) {
      const tools = this.getByCategory(category);
      if (tools.length === 0) continue;

      const categoryNames: Record<typeof category, string> = {
        search: '🔍 搜索',
        web: '🌐 网页',
        shell: '💻 命令',
        code: '💾 代码',
        vision: '👁️ 视觉',
        data: '📊 数据',
        file: '📁 文件',
        process: '⚙️ 进程',
      };

      output += `### ${categoryNames[category]}\n\n`;

      for (const tool of tools) {
        output += `- **${tool.name}**: ${tool.description}\n`;
      }

      output += '\n';
    }

    return output;
  }

  /**
   * 为工具生成 Function Calling 参数 Schema（精简方案：按工具类型动态生成）
   */
  private generateToolParameters(tool: Tool): ToolFunctionCallingSchema {
    // 搜索类工具
    if (tool.category === 'search') {
      return {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索查询内容' },
          maxResults: { type: 'number', description: '最大结果数量（可选）', default: 10 },
        },
        required: ['query'],
      };
    }

    // Shell 工具
    if (tool.name === 'execute_command') {
      return {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          cwd: { type: 'string', description: '工作目录（可选）' },
          timeout: { type: 'number', description: '超时时间（毫秒，默认 30000）', default: 30000 },
        },
        required: ['command'],
      };
    }

    // 文件工具
    if (tool.name === 'read_file') {
      return {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          maxLength: { type: 'number', description: '最大读取长度（可选）', default: 10000 },
        },
        required: ['path'],
      };
    }
    if (tool.name === 'write_file') {
      return {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' },
          createDir: { type: 'boolean', description: '是否自动创建目录（可选）', default: false },
        },
        required: ['path', 'content'],
      };
    }
    if (tool.name === 'edit_file') {
      return {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          edits: {
            type: 'array',
            description: '编辑操作数组',
            items: {
              type: 'object',
              properties: {
                oldText: { type: 'string', description: '要替换的旧文本' },
                newText: { type: 'string', description: '新文本' },
              },
            },
          },
        },
        required: ['path', 'edits'],
      };
    }

    // 进程工具
    if (tool.name === 'spawn_process') {
      return {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '会话标识符' },
          command: { type: 'string', description: '要执行的命令' },
          args: { type: 'array', description: '命令参数（可选）', items: { type: 'string' } },
        },
        required: ['sessionId', 'command'],
      };
    }
    if (tool.name === 'terminate_process' || tool.name === 'process_status') {
      return {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '会话标识符' },
        },
        required: ['sessionId'],
      };
    }

    // 网页工具
    if (tool.name === 'fetch_web') {
      return {
        type: 'object',
        properties: {
          url: { type: 'string', description: '网页 URL' },
          timeout: { type: 'number', description: '超时时间（毫秒，可选）', default: 10000 },
        },
        required: ['url'],
      };
    }

    // Jina Reader
    if (tool.name === 'jina_read') {
      return {
        type: 'object',
        properties: {
          url: { type: 'string', description: '网页 URL' },
        },
        required: ['url'],
      };
    }

    // 视频搜索
    if (tool.name === 'youtube_search' || tool.name === 'bilibili_search') {
      return {
        type: 'object',
        properties: {
          url: { type: 'string', description: '视频 URL' },
        },
        required: ['url'],
      };
    }

    // 默认空参数
    return {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  /**
   * 获取所有工具的 Function Calling 定义（用于 LLM）
   */
  getFunctionCallingDefinitions(): FunctionCallingDefinition[] {
    const definitions: FunctionCallingDefinition[] = [];

    for (const tool of this.tools.values()) {
      definitions.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: this.generateToolParameters(tool),
        },
      });
    }

    return definitions;
  }
}

/**
 * 单例实例
 */
let instance: ToolManager | null = null;

export function getToolManager(): ToolManager {
  if (!instance) {
    instance = new ToolManager();
  }
  return instance;
}
