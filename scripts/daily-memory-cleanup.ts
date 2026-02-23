#!/usr/bin/env node
/**
 * 每日记忆清理归档脚本
 *
 * 功能：
 * 1. 清理过期的 L2 记忆
 * 2. 归档低访问率的记忆
 * 3. 重建 .abstract 索引
 * 4. 生成清理报告
 *
 * 使用方法：
 * - npm run daily-cleanup
 * - node scripts/daily-memory-cleanup.ts
 *
 * 定时任务（crontab）：
 * 0 2 * * * cd /path/to/bot && npm run daily-cleanup
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 清理配置
 */
const CLEANUP_CONFIG = {
  // 基础数据目录
  dataPath: path.join(process.cwd(), 'data'),

  // 记忆保留时间（毫秒）
  retentionTime: {
    L0: 90 * 24 * 60 * 60 * 1000,    // L0: 90 天
    L1: 60 * 24 * 60 * 60 * 1000,    // L1: 60 天
    L2: 30 * 24 * 60 * 60 * 1000,    // L2: 30 天
  },

  // 访问阈值（低于此访问次数的记忆将被归档）
  accessThreshold: {
    L0: 5,     // L0 至少访问 5 次
    L1: 3,     // L1 至少访问 3 次
    L2: 1,     // L2 至少访问 1 次
  },

  // 归档目录
  archivePath: path.join(process.cwd(), 'data', 'archive'),

  // 报告输出路径
  reportPath: path.join(process.cwd(), 'data', 'cleanup-reports'),
};

/**
 * 记忆条目
 */
interface MemoryEntry {
  id: string;
  type: string;
  layer: string;
  createdAt: string;
  lastAccessedAt: string;
  accessCount: number;
  lifecycle?: string;
}

/**
 * Abstract 索引
 */
interface AbstractIndex {
  agentId: string;
  count: number;
  lastUpdated: string;
  entries: Array<{
    id: string;
    summary: string;
    keywords: string[];
    timestamp: string;
    layer: string;
  }>;
}

/**
 * 清理报告
 */
interface CleanupReport {
  timestamp: string;
  duration: number;
  summary: {
    totalProcessed: number;
    deleted: number;
    archived: number;
    kept: number;
  };
  byLayer: {
    L0: { deleted: number; archived: number; kept: number };
    L1: { deleted: number; archived: number; kept: number };
    L2: { deleted: number; archived: number; kept: number };
  };
  byAgent: Record<string, { deleted: number; archived: number; kept: number }>;
  errors: string[];
}

/**
 * 日志输出
 */
function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

/**
 * 扫描 Agent 记忆目录
 */
async function scanAgentMemoryDirs(): Promise<string[]> {
  const agentMemoryPath = path.join(CLEANUP_CONFIG.dataPath, 'agent-memory');

  try {
    await fs.access(agentMemoryPath);
  } catch {
    log('Agent 记忆目录不存在，跳过', 'warn');
    return [];
  }

  const entries = await fs.readdir(agentMemoryPath, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => path.join(agentMemoryPath, e.name));
}

/**
 * 读取 .abstract 索引文件
 */
async function readAbstractIndex(agentPath: string): Promise<AbstractIndex | null> {
  const abstractPath = path.join(agentPath, '.abstract');

  try {
    await fs.access(abstractPath);
    const content = await fs.readFile(abstractPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 扫描指定层级的记忆文件
 */
async function scanMemoryFiles(layerPath: string): Promise<MemoryEntry[]> {
  try {
    await fs.access(layerPath);
  } catch {
    return [];
  }

  const entries = await fs.readdir(layerPath);
  const memoryFiles = entries.filter(e => e.endsWith('.json'));

  const memories: MemoryEntry[] = [];

  for (const file of memoryFiles) {
    try {
      const filePath = path.join(layerPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const memory = JSON.parse(content) as MemoryEntry;
      memories.push(memory);
    } catch (error) {
      log(`读取记忆文件失败: ${file} - ${error}`, 'error');
    }
  }

  return memories;
}

/**
 * 判断记忆是否应该被删除
 */
function shouldDelete(memory: MemoryEntry, layer: string): boolean {
  // 已标记为过期的直接删除
  if (memory.lifecycle === 'expired') {
    return true;
  }

  // 检查是否超过保留时间
  const retentionTime = CLEANUP_CONFIG.retentionTime[layer as keyof typeof CLEANUP_CONFIG.retentionTime] || CLEANUP_CONFIG.retentionTime.L2;
  const createdAt = new Date(memory.createdAt);
  const cutoff = new Date(Date.now() - retentionTime);

  if (createdAt < cutoff) {
    return true;
  }

  return false;
}

/**
 * 判断记忆是否应该被归档
 */
function shouldArchive(memory: MemoryEntry, layer: string): boolean {
  // 检查访问次数
  const accessThreshold = CLEANUP_CONFIG.accessThreshold[layer as keyof typeof CLEANUP_CONFIG.accessThreshold] || 1;

  if (memory.accessCount < accessThreshold) {
    // 还要检查最后访问时间
    const lastAccessed = new Date(memory.lastAccessedAt);
    const daysSinceAccess = (Date.now() - lastAccessed.getTime()) / (24 * 60 * 60 * 1000);

    // 超过 7 天未访问且访问次数低于阈值
    return daysSinceAccess > 7;
  }

  return false;
}

/**
 * 删除记忆文件
 */
async function deleteMemoryFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    log(`删除文件失败: ${filePath} - ${error}`, 'error');
    return false;
  }
}

/**
 * 归档记忆文件
 */
async function archiveMemoryFile(
  sourcePath: string,
  agentId: string,
  layer: string
): Promise<boolean> {
  try {
    // 确保归档目录存在
    const archiveDir = path.join(CLEANUP_CONFIG.archivePath, agentId, layer);
    await fs.mkdir(archiveDir, { recursive: true });

    // 移动文件到归档目录
    const fileName = path.basename(sourcePath);
    const targetPath = path.join(archiveDir, fileName);

    await fs.rename(sourcePath, targetPath);
    return true;
  } catch (error) {
    log(`归档文件失败: ${sourcePath} - ${error}`, 'error');
    return false;
  }
}

/**
 * 重建 .abstract 索引
 */
async function rebuildAbstractIndex(agentPath: string, agentId: string): Promise<void> {
  const abstractPath = path.join(agentPath, '.abstract');
  const index: AbstractIndex = {
    agentId,
    count: 0,
    lastUpdated: new Date().toISOString(),
    entries: [],
  };

  // 扫描各层级的记忆文件
  for (const layer of ['L0', 'L1', 'L2']) {
    const layerPath = path.join(agentPath, layer);
    const memories = await scanMemoryFiles(layerPath);

    for (const memory of memories) {
      if (memory.layer === layer) {
        index.entries.push({
          id: memory.id,
          summary: memory.id, // 可以从内容中提取摘要
          keywords: [],
          timestamp: memory.createdAt,
          layer,
        });
        index.count++;
      }
    }
  }

  // 写入索引文件
  await fs.writeFile(abstractPath, JSON.stringify(index, null, 2));
  log(`重建索引: ${agentId} (${index.count} 条)`);
}

/**
 * 处理单个 Agent 的记忆清理
 */
async function cleanupAgentMemory(agentPath: string): Promise<{ deleted: number; archived: number; kept: number }> {
  const agentId = path.basename(agentPath);
  log(`\n处理 Agent: ${agentId}`);

  let deleted = 0;
  let archived = 0;
  let kept = 0;

  // 读取现有索引
  const abstractIndex = await readAbstractIndex(agentPath);
  if (!abstractIndex) {
    log(`未找到 .abstract 索引，跳过`, 'warn');
    return { deleted, archived, kept };
  }

  // 处理各层级的记忆
  for (const layer of ['L0', 'L1', 'L2']) {
    const layerPath = path.join(agentPath, layer);
    const memories = await scanMemoryFiles(layerPath);

    log(`处理 ${layer} 层: ${memories.length} 条记忆`);

    for (const memory of memories) {
      const filePath = path.join(layerPath, `${memory.id}.json`);

      if (shouldDelete(memory, layer)) {
        const success = await deleteMemoryFile(filePath);
        if (success) {
          deleted++;
          log(`删除: ${memory.id} (${layer})`);
        }
      } else if (shouldArchive(memory, layer)) {
        const success = await archiveMemoryFile(filePath, agentId, layer);
        if (success) {
          archived++;
          log(`归档: ${memory.id} (${layer})`);
        }
      } else {
        kept++;
      }
    }
  }

  // 重建索引
  await rebuildAbstractIndex(agentPath, agentId);

  log(`Agent ${agentId} 清理完成: 删除 ${deleted}, 归档 ${archived}, 保留 ${kept}`);

  return { deleted, archived, kept };
}

/**
 * 保存清理报告
 */
async function saveReport(report: CleanupReport): Promise<void> {
  await fs.mkdir(CLEANUP_CONFIG.reportPath, { recursive: true });

  const dateStr = new Date().toISOString().split('T')[0];
  const reportPath = path.join(CLEANUP_CONFIG.reportPath, `cleanup-${dateStr}.json`);

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  log(`\n报告已保存: ${reportPath}`);
}

/**
 * 主函数
 */
async function main() {
  const startTime = Date.now();
  log('开始每日记忆清理...\n');

  const report: CleanupReport = {
    timestamp: new Date().toISOString(),
    duration: 0,
    summary: {
      totalProcessed: 0,
      deleted: 0,
      archived: 0,
      kept: 0,
    },
    byLayer: {
      L0: { deleted: 0, archived: 0, kept: 0 },
      L1: { deleted: 0, archived: 0, kept: 0 },
      L2: { deleted: 0, archived: 0, kept: 0 },
    },
    byAgent: {},
    errors: [],
  };

  try {
    // 扫描所有 Agent 记忆目录
    const agentDirs = await scanAgentMemoryDirs();
    log(`找到 ${agentDirs.length} 个 Agent 记忆目录`);

    // 处理每个 Agent
    for (const agentDir of agentDirs) {
      const agentId = path.basename(agentDir);

      try {
        const result = await cleanupAgentMemory(agentDir);
        report.byAgent[agentId] = result;
        report.summary.deleted += result.deleted;
        report.summary.archived += result.archived;
        report.summary.kept += result.kept;
      } catch (error) {
        const errorMsg = `处理 Agent ${agentId} 失败: ${error}`;
        log(errorMsg, 'error');
        report.errors.push(errorMsg);
      }
    }

    report.summary.totalProcessed = report.summary.deleted + report.summary.archived + report.summary.kept;

    // 输出摘要
    log('\n========== 清理摘要 ==========');
    log(`总处理: ${report.summary.totalProcessed} 条`);
    log(`删除: ${report.summary.deleted} 条`);
    log(`归档: ${report.summary.archived} 条`);
    log(`保留: ${report.summary.kept} 条`);

    if (report.errors.length > 0) {
      log(`\n错误: ${report.errors.length} 个`, 'error');
    }

    // 保存报告
    await saveReport(report);

  } catch (error) {
    log(`清理失败: ${error}`, 'error');
    process.exit(1);
  }

  const duration = Date.now() - startTime;
  report.duration = duration;
  log(`\n清理完成，耗时: ${(duration / 1000).toFixed(2)} 秒`);
}

// 运行主函数
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
