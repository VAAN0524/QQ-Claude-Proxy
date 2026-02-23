/**
 * Agent 监控 CLI 命令
 *
 * 连接到 Gateway，实时显示 Agent 执行状态
 */

import WebSocket from 'ws';
import { AgentMonitor, type AgentExecutionInfo } from '../terminal/AgentMonitor.js';
import { logger } from '../utils/logger.js';

interface GatewayMessage {
  type: string;
  data?: any;
  id?: string;
}

interface AgentStatusEvent {
  type: 'agent.status';
  data: AgentExecutionInfo;
}

/**
 * 监控命令入口
 */
export async function monitorCommand(gatewayUrl: string = 'ws://localhost:18789'): Promise<void> {
  const monitor = new AgentMonitor();

  // 监听退出信号
  process.on('SIGINT', () => {
    monitor.destroy();
    process.exit(0);
  });

  monitor.showWelcome();

  try {
    // 连接到 Gateway
    const ws = new WebSocket(gatewayUrl);

    ws.on('open', () => {
      logger.info(`[Monitor] 已连接到 Gateway: ${gatewayUrl}`);
      monitor.showConnected();

      // 订阅 agent.status 事件
      ws.send(JSON.stringify({
        type: 'channel.subscribe',
        channel: 'agent.status',
      }));
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message: GatewayMessage = JSON.parse(data.toString());

        // 处理 Agent 状态更新
        if (message.type === 'event' && message.data?.event === 'agent.status') {
          const statusData = message.data.data as AgentExecutionInfo;
          monitor.showAgentStatus(statusData);
        }
      } catch (error) {
        // 忽略非 JSON 消息
      }
    });

    ws.on('error', (error) => {
      logger.error(`[Monitor] WebSocket 错误: ${error}`);
      monitor.showError(error instanceof Error ? error.message : String(error));
    });

    ws.on('close', () => {
      logger.warn('[Monitor] 与 Gateway 的连接已关闭');
      monitor.showError('连接已关闭');
      setTimeout(() => process.exit(1), 2000);
    });

    // 保持运行
    await new Promise(() => {});

  } catch (error) {
    logger.error(`[Monitor] 启动失败: ${error}`);
    monitor.showError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * 主函数（直接运行时）
 */
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const gatewayUrl = process.argv[2] || 'ws://localhost:18789';
  monitorCommand(gatewayUrl);
}
