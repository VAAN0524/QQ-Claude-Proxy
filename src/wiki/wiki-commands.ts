/**
 * Wiki 命令处理器
 *
 * 整合到 QQ-Claude-Proxy 的 Wiki 命令接口
 */

import { WikiService } from './wiki-service.js';
import path from 'path';

export interface WikiCommandContext {
  userId: string;
  groupId?: string;
  args: string[];
}

/**
 * Wiki 命令处理器
 */
export class WikiCommands {
  private wiki: WikiService;

  constructor(wikiRoot?: string) {
    this.wiki = new WikiService(wikiRoot || path.join(process.env.HOME || '', 'wiki'));
  }

  /**
   * 确保 Wiki 已初始化
   */
  private async ensureInitialized(): Promise<void> {
    await (this.wiki as any).initialize();
  }

  /**
   * 处理 /wiki 命令
   */
  async handleCommand(ctx: WikiCommandContext): Promise<string> {
    await this.ensureInitialized();

    const [action, ...args] = ctx.args;

    switch (action) {
      case 'save':
        return await this.save(ctx, args);
      case 'search':
        return await this.search(ctx, args);
      case 'get':
        return await this.get(ctx, args);
      case 'list':
        return await this.list(ctx, args);
      case 'tags':
        return await this.tags();
      case 'lint':
        return await this.lint();
      case 'deep-lint':
        return await this.deepLint();
      case 'ingest':
        return await this.ingest(ctx, args);
      case 'stats':
        return await this.stats();
      case 'help':
      default:
        return this.help();
    }
  }

  /**
   * /wiki save <内容> <一级> <二级> <三级>
   */
  private async save(ctx: WikiCommandContext, args: string[]): Promise<string> {
    const [content, level1, level2, level3] = args;

    if (!content || !level1 || !level2 || !level3) {
      return '❌ 格式错误\n\n用法: /wiki save <内容> <一级标签> <二级标签> <三级标签>\n示例: /wiki save WebSocket连接超时解决方法 工作 调试 WebSocket';
    }

    const slug = this.generateSlug(content);
    const title = content.substring(0, 50);

    await this.wiki.save({
      type: 'concept',
      slug,
      title,
      content: `# ${title}\n\n${content}`,
      tags: { level1, level2, level3 },
      source: 'qq',
      usageCount: 0,
      importanceScore: 5,
    });

    await this.wiki.appendLog(`save | 新增知识\nSlug: ${slug}\nTags: ${level1}/${level2}/${level3}\nUser: ${ctx.userId}`);

    return `✅ 知识已保存\n\n标题: ${title}\n标签: ${level1}/${level2}/${level3}\n页面: ${slug}`;
  }

  /**
   * /wiki search <查询>
   */
  private async search(ctx: WikiCommandContext, args: string[]): Promise<string> {
    const query = args.join(' ');

    if (!query) {
      return '❌ 请输入搜索内容\n\n用法: /wiki search <查询内容>';
    }

    const results = this.wiki.search(query);

    if (results.length === 0) {
      return `🔍 未找到相关内容\n\n建议: 尝试其他关键词`;
    }

    let output = `🔍 搜索结果: ${results.length} 条\n\n`;

    results.slice(0, 5).forEach((item, i) => {
      const summary = item.content.split('\n')[0].substring(0, 50);
      output += `${i + 1}. [[${item.slug}]]\n`;
      output += `   ${summary}...\n`;
      output += `   标签: ${item.tags.level1}/${item.tags.level2}\n\n`;
    });

    // 更新使用统计
    for (const item of results) {
      await this.wiki.incrementUsage(item.slug);
    }

    return output;
  }

  /**
   * /wiki get <slug>
   */
  private async get(ctx: WikiCommandContext, args: string[]): Promise<string> {
    const slug = args[0];

    if (!slug) {
      return '❌ 请输入页面名称\n\n用法: /wiki get <页面名称>';
    }

    const item = this.wiki.getBySlug(slug);

    if (!item) {
      return `❌ 页面不存在: ${slug}\n\n提示: 使用 /wiki list 查看所有页面`;
    }

    await this.wiki.incrementUsage(slug);

    let output = `📄 ${item.title}\n\n`;
    output += `标签: ${item.tags.level1}/${item.tags.level2}/${item.tags.level3}\n`;
    output += `重要性: ${item.importanceScore}/10\n\n`;
    output += `━━━━━━━━━━━━━━━━\n\n`;
    output += item.content;

    await this.wiki.appendLog(`get | 查看页面\nSlug: ${slug}\nUser: ${ctx.userId}`);

    return output;
  }

  /**
   * /wiki list [标签]
   */
  private async list(ctx: WikiCommandContext, args: string[]): Promise<string> {
    const tag = args[0];
    let items;

    if (tag) {
      items = this.wiki.search('', { tags: { level1: tag } });
    } else {
      items = this.wiki.list({ limit: 20 });
    }

    if (items.length === 0) {
      return `📋 暂无页面${tag ? `（标签: ${tag}）` : ''}`;
    }

    let output = `📋 页面列表${tag ? `（标签: ${tag}）` : ''}: ${items.length} 条\n\n`;

    items.forEach((item, i) => {
      const summary = item.content.split('\n')[0].substring(0, 30);
      output += `${i + 1}. [[${item.slug}]] — ${summary}\n`;
    });

    return output;
  }

  /**
   * /wiki tags
   */
  private async tags(): Promise<string> {
    const tags = this.wiki.getAllTags();

    let output = '🏷️ 标签列表\n\n';

    output += '【一级标签】\n';
    tags.level1.forEach(t => output += `  ${t}\n`);

    output += '\n【二级标签】\n';
    tags.level2.forEach(t => output += `  ${t}\n`);

    output += '\n【三级标签】\n';
    tags.level3.forEach(t => output += `  ${t}\n`);

    return output;
  }

  /**
   * /wiki lint
   */
  private async lint(): Promise<string> {
    const result = await this.wiki.lint();

    let output = `🔍 Wiki 体检报告\n\n`;

    if (result.contradictions.length > 0) {
      output += `【矛盾】${result.contradictions.length}处\n`;
    }
    if (result.outdated.length > 0) {
      output += `【过时】${result.outdated.length}页\n`;
    }
    if (result.orphans.length > 0) {
      output += `【孤岛】${result.orphans.length}页\n`;
    }
    if (result.brokenLinks.length > 0) {
      output += `【断链】${result.brokenLinks.length}处\n`;
    }
    if (result.coverage.length > 0) {
      output += `【未摄入】${result.coverage.length}个\n`;
    }

    const total = result.contradictions.length +
                  result.outdated.length +
                  result.orphans.length +
                  result.brokenLinks.length +
                  result.coverage.length;

    if (total === 0) {
      output += '\n✅ Wiki 健康状况良好！';
    } else {
      output += `\n\n发现 ${total} 个问题，建议定期维护。`;
    }

    await this.wiki.appendLog('lint | QQ触发体检');

    return output;
  }

  /**
   * /wiki deep-lint
   */
  private async deepLint(): Promise<string> {
    const results = await this.wiki.deepLint(3);

    let output = `🔬 Wiki 深度检查\n\n`;
    output += `抽样: ${results.length} 页\n\n`;

    if (results.length === 0) {
      output += '✅ 抽样页面全部通过！';
    } else {
      results.forEach(r => {
        output += `【${r.page}】\n`;
        r.issues.forEach(issue => {
          output += `  - ${issue}\n`;
        });
      });
    }

    await this.wiki.appendLog('deep-lint | QQ触发深度检查');

    return output;
  }

  /**
   * /wiki ingest <sources文件>
   */
  private async ingest(ctx: WikiCommandContext, args: string[]): Promise<string> {
    const filename = args[0];

    if (!filename) {
      return '❌ 请指定要摄入的文件\n\n用法: /wiki ingest <sources文件名>\n示例: /wiki ingest article.md';
    }

    // TODO: 实现摄入逻辑
    return `📥 摄入功能开发中...\n\n文件: ${filename}`;
  }

  /**
   * /wiki stats
   */
  private async stats(): Promise<string> {
    const stats = this.wiki.getStats();

    let output = `📊 Wiki 统计\n\n`;
    output += `总页面数: ${stats.totalItems}\n\n`;

    output += `按类型:\n`;
    Object.entries(stats.byType).forEach(([type, count]) => {
      output += `  - ${type}: ${count}\n`;
    });

    output += `\n按标签:\n`;
    Object.entries(stats.byTag).forEach(([tag, count]) => {
      output += `  - ${tag}: ${count}\n`;
    });

    if (stats.mostUsed.length > 0) {
      output += `\n最常用:\n`;
      stats.mostUsed.slice(0, 5).forEach((item, index) => {
        const title = item.title.substring(0, 30);
        output += `  ${index + 1}. ${title}... (${item.usageCount}次)\n`;
      });
    }

    return output;
  }

  /**
   * 帮助信息
   */
  private help(): string {
    return `
📖 Wiki 命令帮助

【基础命令】
/wiki save <内容> <一级> <二级> <三级>  - 保存知识
/wiki search <查询>                    - 搜索知识
/wiki get <slug>                       - 获取页面详情
/wiki list [标签]                      - 列出页面
/wiki tags                             - 查看所有标签

【维护命令】
/wiki lint                             - 健康检查
/wiki deep-lint                        - 深度检查（防漂移）
/wiki ingest <文件>                     - 摄入新素材
/wiki stats                            - 查看统计信息

【示例】
/wiki save WebSocket超时解决 工作 调试 WebSocket
/wiki search RAG
/wiki get rag-vs-wiki
/wiki list 工作
    `.trim();
  }

  /**
   * 生成 slug（文件名）
   */
  private generateSlug(content: string): string {
    // 简化版：使用内容前 20 个字符，转小写，替换空格为连字符
    return content
      .substring(0, 20)
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    await this.wiki.close();
  }
}

export default WikiCommands;
