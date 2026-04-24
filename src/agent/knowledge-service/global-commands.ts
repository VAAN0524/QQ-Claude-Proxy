/**
 * QQ命令处理器 - 使用全局知识库Skill
 * Phase 2: 支持自然语言交互
 * Phase 3: 图书馆目录式展示
 */

// 使用动态导入解决路径问题
let KnowledgeService: any;
let TagHierarchy: any;
let NaturalLanguageInterface: any;
let ResultFormatter: any;

export class KnowledgeCommands {
  private service: any;
  private nlp: any;
  private initialized = false;

  constructor() {
    // 构造函数不立即初始化，等待initialize()方法
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 导入服务
      const skillPath = './skill/index.js';
      const module = await import(skillPath);
      KnowledgeService = module.KnowledgeService;

      // 导入自然语言接口
      const nlpModule = await import('./skill/natural-language.js');
      NaturalLanguageInterface = nlpModule.NaturalLanguageInterface;

      // 导入结果格式化器
      const formatterModule = await import('./skill/result-formatter.js');
      ResultFormatter = formatterModule.ResultFormatter;

      // 初始化服务（使用全局数据库路径）
      this.service = new KnowledgeService({
        dbPath: `${process.env.HOME || process.env.USERPROFILE}/.claude/data/knowledge/knowledge.db`,
        enableSemantic: true // Phase 2: 启用语义搜索
      });
      await this.service.initialize();

      // 初始化自然语言接口
      this.nlp = new NaturalLanguageInterface();

      this.initialized = true;
    } catch (error) {
      throw new Error(`无法加载知识库skill: ${error}`);
    }
  }

  /**
   * 处理命令（Phase 2: 支持自然语言）
   */
  async handleCommand(command: string, args: string[]): Promise<string> {
    // Phase 2: 尝试自然语言处理
    if (command === 'chat' || command === 'ask') {
      const userInput = args.join(' ');
      return await this.handleNaturalLanguage(userInput);
    }

    // Phase 1: 传统命令
    switch (command) {
      case 'save':
        return await this.handleSave(args);
      case 'search':
        return await this.handleSearch(args);
      case 'get':
        return await this.handleGet(args);
      case 'list':
        return await this.handleList(args);
      case 'tags':
        return await this.handleTags();
      case 'stats':
        return await this.handleStats();
      case 'help':
        return this.getHelp();
      default:
        return '未知命令。使用 /kb help 查看帮助，或直接用大白话跟我说！';
    }
  }

  /**
   * Phase 2: 处理自然语言输入
   */
  async handleNaturalLanguage(input: string): Promise<string> {
    try {
      // 解析意图
      const intent = this.nlp.parse(input);

      // 根据意图执行操作
      let result: any;
      switch (intent.type) {
        case 'save':
          if (!intent.extracted.content || !intent.extracted.tags) {
            return this.nlp.getHelpText();
          }
          result = await this.service.save(
            intent.extracted.content,
            intent.extracted.tags,
            { source: 'qq' }
          );
          break;

        case 'search':
          const query = intent.extracted.query || input;
          result = await this.service.search(query);
          break;

        case 'get':
          if (!intent.extracted.id) {
            return '请提供要查看的知识ID';
          }
          result = await this.service.get(intent.extracted.id);
          break;

        case 'list':
          const filter = intent.extracted.query;
          result = filter
            ? await this.service.list({ level1: filter })
            : await this.service.list();
          break;

        case 'tags':
          result = await this.service.getAllTags();
          break;

        case 'stats':
          result = await this.service.getStats();
          break;

        default:
          return this.nlp.getHelpText();
      }

      // 生成友好的回复
      return this.nlp.generateResponse(intent, result);
    } catch (error) {
      return `❌ 处理失败: ${error}\n\n${this.nlp.getHelpText()}`;
    }
  }

  private async handleSave(args: string[]): Promise<string> {
    if (args.length < 4) {
      return '用法: /kb save <内容> <一级标签> <二级标签> <三级标签>\n示例: /kb save WebSocket连接超时解决方法 工作 调试 WebSocket';
    }

    const content = args[0];
    const tags = {
      level1: args[1],
      level2: args[2],
      level3: args[3]
    };

    try {
      const id = await this.service.save(content, tags, { source: 'qq' });
      return `✅ 知识已保存\nID: ${id}\n标签: ${tags.level1} > ${tags.level2} > ${tags.level3}`;
    } catch (error) {
      return `❌ 保存失败: ${error}`;
    }
  }

  private async handleSearch(args: string[]): Promise<string> {
    if (args.length === 0) {
      return '用法: /kb search <查询内容>\n示例: /kb search WebSocket';
    }

    const query = args.join(' ');

    try {
      const results = await this.service.search(query);

      if (results.length === 0) {
        return `📭 未找到匹配的知识\n\n查询: "${query}"\n\n💡 提示: 尝试使用不同的关键词`;
      }

      // 使用 ResultFormatter 生成图书馆目录式输出
      return ResultFormatter.formatAsCatalog(results, 10);

    } catch (error) {
      return `❌ 搜索失败: ${error}`;
    }
  }

  private async handleGet(args: string[]): Promise<string> {
    if (args.length === 0) {
      return '用法: /kb get <知识ID>\n示例: /kb get 123e4567-e89b-12d3-a456-426614174000';
    }

    const id = args[0];

    try {
      const item = await this.service.get(id);

      if (!item) {
        return `❌ 未找到 ID 为 ${id} 的知识\n\n💡 提示: 使用 /kb search 查找知识`;
      }

      // 使用 ResultFormatter 生成详情视图
      return ResultFormatter.formatDetail(item);

    } catch (error) {
      return `❌ 获取失败: ${error}`;
    }
  }

  private async handleList(args: string[]): Promise<string> {
    const filter = args[0];

    try {
      // 使用list方法而不是search
      let results: any[];

      if (filter) {
        results = await this.service.list({ level1: filter });
      } else {
        results = await this.service.list();
      }

      if (results.length === 0) {
        return `📭 知识库为空\n\n💡 提示: 使用 /kb save 保存第一条知识`;
      }

      // 使用 ResultFormatter 生成简洁列表
      return ResultFormatter.formatAsCompactList(results, 15);

    } catch (error) {
      return `❌ 列表获取失败: ${error}`;
    }
  }

  private async handleTags(): Promise<string> {
    try {
      const tags = await this.service.getAllTags();

      if (tags.length === 0) {
        return `📭 暂无标签`;
      }

      const level1Tags = [...new Set(tags.map(t => t.level1))];

      let response = `🏷️ 标签列表\n\n`;

      level1Tags.forEach(level1 => {
        const level2Tags = [...new Set(tags.filter(t => t.level1 === level1).map(t => t.level2))];
        response += `${level1} (${level2Tags.length} 个二级标签)\n`;

        level2Tags.slice(0, 3).forEach(level2 => {
          const level3Tags = tags.filter(t => t.level1 === level1 && t.level2 === level2).map(t => t.level3);
          response += `  └─ ${level2} (${level3Tags.length})\n`;
        });

        if (level2Tags.length > 3) {
          response += `  └─ ... 还有 ${level2Tags.length - 3} 个\n`;
        }
        response += '\n';
      });

      return response;
    } catch (error) {
      return `❌ 标签获取失败: ${error}`;
    }
  }

  private async handleStats(): Promise<string> {
    try {
      const stats = await this.service.getStats();

      let response = `📊 知识库统计\n\n`;
      response += `总条目数: ${stats.totalItems}\n\n`;

      response += `按类型:\n`;
      Object.entries(stats.itemsByType).forEach(([type, count]) => {
        response += `  - ${type}: ${count}\n`;
      });

      response += `\n按一级标签:\n`;
      Object.entries(stats.itemsByTag).forEach(([tag, count]) => {
        response += `  - ${tag}: ${count}\n`;
      });

      if (stats.mostUsedItems.length > 0) {
        response += `\n最常用:\n`;
        stats.mostUsedItems.slice(0, 5).forEach((item, index) => {
          response += `  ${index + 1}. ${item.content.substring(0, 30)}... (${item.usageCount} 次)\n`;
        });
      }

      return response;
    } catch (error) {
      return `❌ 统计获取失败: ${error}`;
    }
  }

  private getHelp(): string {
    return `📖 知识库命令帮助\n\n` +
           `基础命令:\n` +
           `  /kb save <内容> <一级> <二级> <三级>  - 保存知识\n` +
           `  /kb search <查询>                    - 搜索知识\n` +
           `  /kb get <ID>                         - 获取知识详情\n` +
           `  /kb list [标签]                      - 列出知识\n` +
           `  /kb tags                            - 查看所有标签\n` +
           `  /kb stats                           - 查看统计信息\n` +
           `  /kb help                            - 显示此帮助\n\n` +
           `示例:\n` +
           `  /kb save WebSocket连接超时解决方法 工作 调试 WebSocket\n` +
           `  /kb search 调试\n` +
           `  /kb list 工作`;
  }
}
