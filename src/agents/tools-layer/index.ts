/**
 * 工具层 - 统一的工具接口
 *
 * 将专业 Agents 的功能提取为工具函数，
 * 供 SimpleCoordinatorAgent 直接调用。
 */

// 搜索工具
export * from './search-tools.js';

// 网页工具
export * from './web-tools.js';

// Shell 工具
export * from './shell-tools.js';

/**
 * 工具类型定义
 */
export interface Tool {
  name: string;
  description: string;
  category: 'search' | 'web' | 'shell' | 'code' | 'vision' | 'data';
  execute: (params: any) => Promise<any>;
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
    // 搜索工具
    this.register({
      name: 'duckduckgo_search',
      description: '使用 DuckDuckGo 进行网络搜索',
      category: 'search',
      execute: async (params: { query: string; maxResults?: number }) => {
        const { duckDuckGoSearch, formatSearchResults } = await import('./search-tools.js');
        const results = await duckDuckGoSearch(params.query, params.maxResults);
        return formatSearchResults(results, undefined, 'duckduckgo');
      },
    });

    this.register({
      name: 'tavily_search',
      description: '使用 Tavily 进行深度搜索（需要 API Key）',
      category: 'search',
      execute: async (params: { query: string; maxResults?: number }) => {
        const { tavilySearch, formatSearchResults } = await import('./search-tools.js');
        const result = await tavilySearch(params.query, params.maxResults);
        return formatSearchResults(result.results, result.answer, 'tavily');
      },
    });

    this.register({
      name: 'smart_search',
      description: '智能搜索 - 自动选择最佳搜索方式',
      category: 'search',
      execute: async (params: { query: string; maxResults?: number; preferTavily?: boolean }) => {
        const { smartSearch, formatSearchResults } = await import('./search-tools.js');
        const result = await smartSearch(params.query, params);
        return formatSearchResults(result.results, result.answer, result.source);
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

    // GitHub 工具已移除 - 功能合并到 network_tool.ts
    // 如需使用，请直接调用 src/agents/tools/network_tool.ts 中的函数

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

    const categories = ['search', 'web', 'shell', 'code', 'vision', 'data'] as const;

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
      };

      output += `### ${categoryNames[category]}\n\n`;

      for (const tool of tools) {
        output += `- **${tool.name}**: ${tool.description}\n`;
      }

      output += '\n';
    }

    return output;
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
