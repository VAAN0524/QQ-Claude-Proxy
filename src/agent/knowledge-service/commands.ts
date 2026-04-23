import { KnowledgeService } from './index.js';
import { TagHierarchy } from './types.js';

export class KnowledgeCommands {
  constructor(private service: KnowledgeService) {}

  async handleCommand(command: string, args: string[]): Promise<string> {
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
        return '未知命令。使用 /kb help 查看帮助。';
    }
  }

  private async handleSave(args: string[]): Promise<string> {
    if (args.length < 4) {
      return '用法: /kb save <内容> <一级标签> <二级标签> <三级标签>\n示例: /kb save WebSocket连接超时解决方法 工作 调试 WebSocket';
    }

    const content = args[0];
    const tags: TagHierarchy = {
      level1: args[1],
      level2: args[2],
      level3: args[3]
    };

    try {
      const id = await this.service.save(content, tags);
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
        return `📭 未找到匹配的知识\n查询: "${query}"`;
      }

      let response = `🔍 找到 ${results.length} 条相关知识\n\n`;

      results.slice(0, 5).forEach((item, index) => {
        response += `${index + 1}. [${item.tags.level1}] ${item.content.substring(0, 50)}...\n`;
        response += `   标签: ${item.tags.level1} > ${item.tags.level2} > ${item.tags.level3}\n`;
        response += `   ID: ${item.id}\n\n`;
      });

      if (results.length > 5) {
        response += `... 还有 ${results.length - 5} 条结果\n`;
        response += `使用 /kb get <ID> 查看完整内容`;
      }

      return response;
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
        return `❌ 未找到 ID 为 ${id} 的知识`;
      }

      return `📚 知识详情\n\n` +
             `内容: ${item.content}\n` +
             `标签: ${item.tags.level1} > ${item.tags.level2} > ${item.tags.level3}\n` +
             `类型: ${item.contentType}\n` +
             `重要性: ${item.importanceScore}/10\n` +
             `使用次数: ${item.usageCount}\n` +
             `创建时间: ${new Date(item.createdAt).toLocaleString('zh-CN')}\n` +
             `来源: ${item.source || '手动添加'}`;
    } catch (error) {
      return `❌ 获取失败: ${error}`;
    }
  }

  private async handleList(args: string[]): Promise<string> {
    const filter = args[0];

    try {
      // 搜索所有知识，然后在内存中过滤标签
      let results = await this.service.search('');

      // 如果指定了标签过滤
      if (filter) {
        results = results.filter(item => item.tags.level1 === filter);
      }

      if (results.length === 0) {
        return `📭 知识库为空`;
      }

      let response = `📚 知识列表 (共 ${results.length} 条)\n\n`;

      results.slice(0, 10).forEach((item, index) => {
        response += `${index + 1}. ${item.content.substring(0, 40)}...\n`;
        response += `   ${item.tags.level1} > ${item.tags.level2}\n\n`;
      });

      if (results.length > 10) {
        response += `... 还有 ${results.length - 10} 条`;
      }

      return response;
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
