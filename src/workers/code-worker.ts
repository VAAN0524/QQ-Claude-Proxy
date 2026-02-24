/**
 * Code Worker - 子 Agent 工作进程
 *
 * 作为独立进程运行，接收 TeamCoordinator 分配的任务
 * 通过 stdin/stdout 进行通信
 */

import { WorkerAgent } from '../utils/WorkerAgent.js';

// 启动 Worker
const worker = new WorkerAgent({
  agentId: process.env.AGENT_ID || 'code-worker',
  agentType: 'code',
});

worker.start();
