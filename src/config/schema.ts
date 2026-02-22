export interface Config {
  gateway: {
    port: number;
    host: string;
  };
  channels: {
    qqbot: {
      enabled: boolean;
      appId: string;
      clientSecret: string;
      token?: string;
      sandbox?: boolean;
    };
  };
  agent: {
    /** 允许的用户 QQ 号列表 */
    allowedUsers?: string[];
  };
  storage: {
    /** 工作目录（Claude Code 执行目录） */
    downloadPath: string;
    /** 用户发送的文件存储目录 */
    uploadPath: string;
  };
  scheduler: {
    /** 是否启用定时任务调度器 */
    enabled: boolean;
    /** 任务数据存储路径 */
    storagePath: string;
    /** 结果保存目录 */
    resultDir: string;
    /** 最大并发执行任务数 */
    maxConcurrentTasks: number;
    /** 任务执行超时时间 (毫秒) */
    taskTimeout: number;
    /** 心跳间隔 (毫秒) */
    heartbeatInterval: number;
  };
}

export const defaultConfig: Config = {
  gateway: {
    port: 18789,
    host: '127.0.0.1'
  },
  channels: {
    qqbot: {
      enabled: true,
      appId: '',
      clientSecret: '',
      token: '',
      sandbox: true  // 默认使用沙箱模式进行测试
    }
  },
  agent: {
    allowedUsers: []
  },
  storage: {
    downloadPath: './workspace',
    uploadPath: './uploads'
  },
  scheduler: {
    enabled: true,
    storagePath: './data/scheduler',
    resultDir: './data/task-results',
    maxConcurrentTasks: 3,
    taskTimeout: 30 * 60 * 1000, // 30分钟
    heartbeatInterval: 5000, // 5秒
  }
};
