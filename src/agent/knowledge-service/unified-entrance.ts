/**
 * 统一入口 - 大白话交互
 * 整合 MCP Memory 和知识库记忆管理
 */

import { KnowledgeService } from './skill/index.js';
import { MemoryImporter } from './tools/memory-importer.js';
import { ResultFormatter } from './skill/result-formatter.js';
import { NaturalLanguageInterface } from './skill/natural-language.js';
import { logger } from '../../utils/logger.js';

export class UnifiedKnowledgeEntrance {
  private knowledgeService: KnowledgeService;
  private nlp: NaturalLanguageInterface;
  private autoSaveEnabled = false;

  constructor(knowledgeService: KnowledgeService) {
    this.knowledgeService = knowledgeService;
    this.nlp = new NaturalLanguageInterface();
  }

  /**
   * 处理大白话输入（统一入口）
   *
   * 路由策略（保守式）：
   * 1. 优先检测明确的非知识库命令（文件路径等）
   * 2. 只处理明确的知识库命令（包含"知识库"、"知识"等关键词）
   * 3. 其他所有消息返回帮助文本，让主Agent处理
   */
  async handleNaturalInput(input: string): Promise<string> {
    const lowerInput = input.toLowerCase();

    // 0. 优先检测：非知识库任务
    // 支持Windows路径（C:\, D:\等）和Unix路径（/, ~/, ./等）
    const hasWindowsPath = /[A-Z]:\\/.test(input);
    const hasUnixPath = /^\/|^~\/|^\.\//.test(input.trim());
    if (hasWindowsPath || hasUnixPath) {
      // 包含文件路径的消息不作为知识库命令处理
      logger.info(`[UnifiedEntrance] 检测到文件路径，不作为知识库命令处理`);
      return this.getHelpText();
    }

    // 1. 明确的知识库关键词检测（必须包含这些词之一）
    const hasKnowledgeKeyword = [
      '知识库', '知识', '导入memory', 'import memory',
      '启用自动提取', '自动保存'
    ].some(keyword => lowerInput.includes(keyword.toLowerCase()));

    if (!hasKnowledgeKeyword) {
      // 不包含明确的知识库关键词，不作为知识库命令处理
      logger.info(`[UnifiedEntrance] 不包含知识库关键词，不作为知识库命令处理`);
      return this.getHelpText();
    }

    // 2. 数据导入相关
    if (this.isImportCommand(input)) {
      return await this.handleImport(input);
    }

    // 3. 启用自动提取
    if (this.isEnableAutoSaveCommand(input)) {
      return await this.handleEnableAutoSave();
    }

    // 4. 查看知识库
    if (this.isListCommand(input)) {
      return await this.handleList();
    }

    // 5. 搜索知识
    if (this.isSearchCommand(input)) {
      const query = this.extractQuery(input);
      return await this.handleSearch(query);
    }

    // 6. 查看详情
    if (this.isGetDetailCommand(input)) {
      return await this.handleGetDetail();
    }

    // 7. 查看统计
    if (this.isStatsCommand(input)) {
      return await this.handleStats();
    }

    // 8. 默认：使用自然语言接口（但只处理明确的保存/删除/更新操作）
    return await this.handleDefaultNLP(input);
  }

  /**
   * 判断是否为导入命令
   * 必须包含"memory"、"知识库"或"测试"关键词
   */
  private isImportCommand(input: string): boolean {
    const importKeywords = [
      '导入memory', 'import memory', '从memory导入',
      '把memory导过来', '迁移memory',
      '导入测试数据', '测试导入',
      '导入知识库', '整合知识库', '合并知识库'
    ];

    const lowerInput = input.toLowerCase();
    return importKeywords.some(keyword => lowerInput.includes(keyword.toLowerCase()));
  }

  /**
   * 判断是否为启用自动保存命令
   */
  private isEnableAutoSaveCommand(input: string): boolean {
    const autoSaveKeywords = [
      '启用自动提取', '开启自动保存', '自动记录',
      '自动提取知识', '智能提取', 'auto save'
    ];
    return autoSaveKeywords.some(keyword => input.toLowerCase().includes(keyword));
  }

  /**
   * 判断是否为列表命令
   * 必须包含"知识库"或"知识"关键词
   */
  private isListCommand(input: string): boolean {
    const listKeywords = [
      '知识库有哪些', '知识库有什么', '知识库包含',
      '查看知识库', '知识库列表', '知识库list',
      '有哪些知识', '有什么知识',
      '所有知识', '全部知识',
      '列出所有知识', '列出知识'
    ];

    const lowerInput = input.toLowerCase();
    return listKeywords.some(keyword => lowerInput.includes(keyword.toLowerCase()));
  }

  /**
   * 判断是否为搜索命令
   * 必须包含"知识库"或"知识"关键词
   */
  private isSearchCommand(input: string): boolean {
    const searchKeywords = [
      '搜索知识库', '知识库搜索', '搜索知识',
      '查找知识库', '知识库查找', '查找知识',
      '知识库search', 'search知识库'
    ];

    const lowerInput = input.toLowerCase();
    return searchKeywords.some(keyword => lowerInput.includes(keyword.toLowerCase()));
  }

  /**
   * 提取搜索关键词
   */
  private extractQuery(input: string): string {
    // 移除常见的搜索前缀词
    const prefixes = [
      '搜索', '查找', '帮我找', '找找', '关于',
      'search', 'find', 'look for', 'about'
    ];

    let query = input;
    for (const prefix of prefixes) {
      if (query.toLowerCase().startsWith(prefix.toLowerCase())) {
        query = query.substring(prefix.length).trim();
        break;
      }
    }

    // 移除常见的后缀词
    const suffixes = ['相关的', '有关', '的知识', '的内容'];
    for (const suffix of suffixes) {
      if (query.endsWith(suffix)) {
        query = query.substring(0, query.length - suffix.length).trim();
        break;
      }
    }

    return query || input;
  }

  /**
   * 判断是否为查看详情命令
   * 必须包含"知识库"或"知识"关键词
   */
  private isGetDetailCommand(input: string): boolean {
    const detailKeywords = [
      '查看知识库详情', '知识库详情',
      '查看知识详细', '知识详细',
      '知识库详细信息'
    ];

    const lowerInput = input.toLowerCase();
    return detailKeywords.some(keyword => lowerInput.includes(keyword.toLowerCase()));
  }

  /**
   * 判断是否为统计命令
   * 必须包含"知识库"关键词
   */
  private isStatsCommand(input: string): boolean {
    const statsKeywords = [
      '知识库统计', '知识库概况', '知识库总结',
      '知识库信息', '知识库状态', '知识库数据'
    ];

    const lowerInput = input.toLowerCase();
    return statsKeywords.some(keyword => lowerInput.includes(keyword.toLowerCase()));
  }

  /**
   * 处理导入命令
   */
  private async handleImport(input: string): Promise<string> {
    // 检查是否为测试导入
    if (input.includes('测试') || input.toLowerCase().includes('test')) {
      return await this.handleTestImport();
    }

    let message = '🔄 正在从 MCP Memory 导入数据...\n\n';

    try {
      const result = await MemoryImporter.oneClickImport(this.knowledgeService);

      message += result;

      // 如果有错误，显示详细错误信息
      if (result.errorDetails && result.errorDetails.length > 0) {
        message += '\n\n### ⚠️ 错误详情\n\n';
        result.errorDetails.forEach(error => {
          message += `- ${error}\n`;
        });
        message += '\n💡 建议检查：\n';
        message += '1. 确保 MCP Memory 中有数据\n';
        message += '2. 检查知识库服务是否正常初始化\n';
        message += '3. 查看日志获取详细错误信息';
        message += '\n\n💡 或者先尝试: "导入测试数据"';
      }

      if (result.imported > 0) {
        message += '\n\n✅ 数据导入成功！现在你可以：\n';
        message += '- 说 "帮我看看知识库里有什么" 查看内容\n';
        message += '- 说 "搜索营养" 查找特定知识\n';
      } else if (result.errorDetails.length === 0) {
        message += '\n\n💡 提示: MCP Memory 中可能没有数据';
        message += '\n\n💡 建议: 先尝试 "导入测试数据" 验证系统功能';
      }

    } catch (error) {
      message += `\n❌ 导入失败: ${error}\n\n`;
      message += '💡 提示: 确保 MCP Memory 中有数据';
      message += '\n\n💡 或者先尝试: "导入测试数据"';
    }

    return message;
  }

  /**
   * 处理测试导入
   */
  private async handleTestImport(): Promise<string> {
    try {
      // 动态导入测试导入工具
      const module = await import('./tools/test-data-importer.js');
      const TestDataImporter = module.TestDataImporter;

      const result = await TestDataImporter.importTestData(this.knowledgeService);

      let message = '📊 测试数据导入\n\n';
      message += result;

      if (result.success > 0) {
        message += '\n\n✅ 测试数据导入成功！现在你可以：\n';
        message += '- 说 "帮我看看知识库里有什么" 查看内容\n';
        message += '- 说 "搜索测试" 查找测试数据\n';
      }

      return message;

    } catch (error) {
      return `❌ 测试导入失败: ${error}\n\n💡 提示: 检查知识库服务是否正常初始化`;
    }
  }

  /**
   * 处理启用自动保存
   */
  private async handleEnableAutoSave(): Promise<string> {
    this.autoSaveEnabled = true;
    this.knowledgeService.setAutoSaveEnabled(true);

    return `✅ 自动提取功能已启用！\n\n` +
           `🤖 现在系统会自动：\n` +
           `- 识别对话中的有价值知识点\n` +
           `- 在适当时机提示你保存\n` +
           `- 自动推荐合适的标签\n\n` +
           `💡 提示: 你可以随时说 "关闭自动保存" 来禁用此功能`;
  }

  /**
   * 处理列表命令
   */
  private async handleList(): Promise<string> {
    try {
      const items = await this.knowledgeService.list();

      if (items.length === 0) {
        return `📭 知识库目前为空\n\n` +
               `💡 建议：\n` +
               `1. 说 "导入memory数据" 导入现有知识\n` +
               `2. 说 "启用自动提取" 自动记录对话\n` +
               `3. 手动保存知识`;
      }

      return ResultFormatter.formatAsCatalog(items, 20);

    } catch (error) {
      return `❌ 获取列表失败: ${error}`;
    }
  }

  /**
   * 处理搜索命令
   */
  private async handleSearch(query: string): Promise<string> {
    try {
      const results = await this.knowledgeService.search(query);

      if (results.length === 0) {
        return `📭 未找到关于 "${query}" 的知识\n\n` +
               `💡 建议：\n` +
               `1. 尝试其他关键词\n` +
               `2. 说 "导入memory数据" 扩充知识库\n` +
               `3. 说 "启用自动提取" 积累知识`;
      }

      return ResultFormatter.formatAsCatalog(results, 15);

    } catch (error) {
      return `❌ 搜索失败: ${error}`;
    }
  }

  /**
   * 处理查看详情命令
   */
  private async handleGetDetail(): Promise<string> {
    return `📖 查看详情\n\n` +
           `请提供要查看的知识 ID，格式如下：\n` +
           `"查看 ID: xxxxxxxx"\n\n` +
           `或者先搜索知识：\n` +
           `"搜索营养" → 然后说 "查看第1条"`;
  }

  /**
   * 处理统计命令
   */
  private async handleStats(): Promise<string> {
    try {
      const stats = await this.knowledgeService.getStats();

      let message = `📊 知识库统计\n\n`;
      message += `${'═'.repeat(30)}\n\n`;
      message += `总条目数: ${stats.totalItems}\n\n`;

      message += `按类型:\n`;
      Object.entries(stats.itemsByType).forEach(([type, count]) => {
        message += `  - ${type}: ${count}\n`;
      });

      message += `\n按分类:\n`;
      Object.entries(stats.itemsByTag).forEach(([tag, count]) => {
        message += `  - ${tag}: ${count}\n`;
      });

      if (stats.mostUsedItems.length > 0) {
        message += `\n最常用:\n`;
        stats.mostUsedItems.slice(0, 5).forEach((item, index) => {
          const title = item.content.split('\n')[0].replace(/^#+\s*/, '').substring(0, 30);
          message += `  ${index + 1}. ${title}... (${item.usageCount}次)\n`;
        });
      }

      message += `\n${'═'.repeat(30)}`;

      return message;

    } catch (error) {
      return `❌ 获取统计失败: ${error}`;
    }
  }

  /**
   * 处理默认自然语言输入（保守式）
   *
   * 只处理明确的保存/删除/更新操作，其他意图返回帮助文本
   */
  private async handleDefaultNLP(input: string): Promise<string> {
    try {
      const intent = this.nlp.parse(input);

      // 保守策略：只处理明确的保存、删除、更新操作
      // 其他所有意图（包括unknown、search、list、get等）都返回帮助文本
      // 因为这些操作应该在前面已经通过关键词检测处理了

      let result: any;
      switch (intent.type) {
        case 'save':
          // 保存操作：必须有明确的内容和标签
          if (!intent.extracted.content || !intent.extracted.tags) {
            logger.info(`[UnifiedEntrance] NLP保存操作缺少必要信息，返回帮助文本`);
            return this.getHelpText();
          }
          logger.info(`[UnifiedEntrance] 执行NLP保存操作: ${intent.extracted.content.substring(0, 30)}...`);
          result = await this.knowledgeService.save(
            intent.extracted.content,
            intent.extracted.tags,
            { source: 'user-input' }
          );
          return `✅ 知识已保存！\n\n${this.getHelpText()}`;

        case 'delete':
          // 删除操作：必须有明确的ID
          if (!intent.extracted.id) {
            logger.info(`[UnifiedEntrance] NLP删除操作缺少ID，返回帮助文本`);
            return this.getHelpText();
          }
          logger.info(`[UnifiedEntrance] 执行NLP删除操作: ${intent.extracted.id}`);
          result = await this.knowledgeService.delete(intent.extracted.id);
          return `✅ 知识已删除！\n\n${this.getHelpText()}`;

        case 'update':
          // 更新操作：必须有明确的ID和内容
          if (!intent.extracted.id || !intent.extracted.content) {
            logger.info(`[UnifiedEntrance] NLP更新操作缺少必要信息，返回帮助文本`);
            return this.getHelpText();
          }
          logger.info(`[UnifiedEntrance] 执行NLP更新操作: ${intent.extracted.id}`);
          result = await this.knowledgeService.update(
            intent.extracted.id,
            { content: intent.extracted.content }
          );
          return `✅ 知识已更新！\n\n${this.getHelpText()}`;

        case 'unknown':
        case 'search':
        case 'list':
        case 'get':
        case 'tags':
        case 'stats':
        default:
          // 这些操作应该在前面已经通过关键词检测处理了
          // 如果到这里还没有处理，说明不是明确的知识库命令
          logger.info(`[UnifiedEntrance] NLP意图 ${intent.type} (confidence=${intent.confidence}) 未通过关键词检测，返回帮助文本`);
          return this.getHelpText();
      }

    } catch (error) {
      logger.error(`[UnifiedEntrance] NLP处理失败: ${error}`);
      return `❌ 处理失败: ${error}\n\n${this.getHelpText()}`;
    }
  }

  /**
   * 获取帮助文本
   */
  private getHelpText(): string {
    return `💬 你可以这样对我说：\n\n` +
           `📚 查看知识：\n` +
           `- "帮我看看知识库里有什么"\n` +
           `- "知识库有哪些内容"\n\n` +
           `🔍 搜索知识：\n` +
           `- "搜索营养"\n` +
           `- "找找关于调试的知识"\n\n` +
           `💾 保存知识：\n` +
           `- "保存：WebSocket超时的解决方法"\n\n` +
           `📥 导入数据：\n` +
           `- "导入memory数据"\n` +
           `- "整合知识库"\n\n` +
           `⚙️ 其他功能：\n` +
           `- "查看统计" - 查看知识库概况\n` +
           `- "启用自动提取" - 自动记录对话知识`;
  }

  /**
   * 记录对话（用于自动提取）
   */
  async recordDialogue(role: 'user' | 'assistant', content: string): Promise<void> {
    if (this.autoSaveEnabled) {
      await this.knowledgeService.recordDialogue(role, content);
    }
  }

  /**
   * 检查并提示保存
   */
  async checkAndSuggestSave(): Promise<string | null> {
    if (!this.autoSaveEnabled) {
      return null;
    }

    if (this.knowledgeService.shouldSuggestSave()) {
      const suggestions = await this.knowledgeService.generateSaveSuggestions();
      return this.knowledgeService.generateSuggestionMessage(suggestions);
    }

    return null;
  }
}
