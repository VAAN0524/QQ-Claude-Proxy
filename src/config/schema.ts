/**
 * Agent 实例配置
 */
export interface AgentInstanceConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 优先级 (数字越大优先级越高) */
  priority: number;
  /** 超时时间 (毫秒) */
  timeout: number;
  /** 自定义选项 */
  options?: Record<string, unknown>;
}

/**
 * Coordinator Agent 配置
 */
export interface CoordinatorConfig {
  /** 是否启用 Coordinator Agent */
  enabled: boolean;
  /** 使用的模型 */
  model: string;
  /** 最大 tokens */
  maxTokens: number;
  /** 子 Agent 配置 */
  subAgents: {
    /** 是否启用 Code Agent */
    code: boolean;
    /** 是否启用 Browser Agent */
    browser: boolean;
    /** 是否启用 Shell Agent */
    shell: boolean;
    /** 是否启用 Web Search Agent */
    websearch?: boolean;
    /** 是否启用 Data Analysis Agent */
    data?: boolean;
  };
}

/**
 * Agent 系统配置
 */
export interface AgentSystemConfig {
  /** 默认 Agent ID */
  default: string;
  /** 是否启用智能路由 */
  smartRouting: boolean;
  /** 是否使用 Coordinator Agent（协作模式） */
  useCoordinator: boolean;
  /** Code Agent 配置 */
  code: AgentInstanceConfig;
  /** Browser Agent 配置 */
  browser: AgentInstanceConfig;
  /** Shell Agent 配置 */
  shell: AgentInstanceConfig;
  /** Web Search Agent 配置 */
  websearch?: AgentInstanceConfig;
  /** Data Analysis Agent 配置 */
  data?: AgentInstanceConfig;
  /** Vision Agent 配置 */
  vision?: AgentInstanceConfig;
  /** Claude Agent 配置 (即现有的 ClaudeCodeAgent) */
  claude: AgentInstanceConfig;
  /** Coordinator Agent 配置 */
  coordinator: CoordinatorConfig;
}

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
  /** Agent 系统 */
  agents: AgentSystemConfig;
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
  /** LLM 提供商配置（可选，支持多提供商切换） */
  llm?: {
    /** 默认提供商: 'openai' | 'anthropic' | 'glm' */
    provider?: 'openai' | 'anthropic' | 'glm';
    /** API Key（优先级高于环境变量） */
    apiKey?: string;
    /** API Base URL（可选，用于兼容端点） */
    baseURL?: string;
    /** 默认模型 */
    model?: string;
    /** 最大 tokens */
    maxTokens?: number;
    /** GLM 特定配置 */
    glm?: {
      /** API Key（优先使用） */
      apiKey?: string;
      /** 是否使用 JWT 认证（API Key 包含 . 时自动启用） */
      useJwt?: boolean;
      /** 是否使用 Coding Plan 端点 */
      isCodingPlan?: boolean;
    };
    /** Anthropic 特定配置 */
    anthropic?: {
      apiKey?: string;
      model?: string;
      maxTokens?: number;
    };
    /** OpenAI 特定配置 */
    openai?: {
      apiKey?: string;
      baseURL?: string;
      model?: string;
      maxTokens?: number;
    };
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
  agents: {
    default: 'coordinator',
    smartRouting: true,
    useCoordinator: true,  // 默认启用 Coordinator Agent
    code: {
      enabled: true,
      priority: 10,
      timeout: 60000,
      options: {
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 4096,
      },
    },
    browser: {
      enabled: true,
      priority: 8,
      timeout: 120000,
      options: {
        headless: true,
        timeout: 30000,
      },
    },
    shell: {
      enabled: false,  // 默认禁用，安全考虑
      priority: 7,
      timeout: 30000,
      options: {
        allowedCommands: [],
        blockedCommands: ['rm -rf', 'format', 'shutdown'],
      },
    },
    websearch: {
      enabled: true,
      priority: 9,
      timeout: 60000,
      options: {
        maxResults: 10,
      },
    },
    data: {
      enabled: true,
      priority: 6,
      timeout: 30000,
      options: {
        supportedFileTypes: ['.csv', '.json', '.txt'],
        maxFileSize: 10,
      },
    },
    claude: {
      enabled: true,
      priority: 5,
      timeout: 300000,
    },
    coordinator: {
      enabled: true,
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 8192,
      subAgents: {
        code: true,
        browser: true,
        shell: false,  // 默认禁用 Shell Agent
        websearch: true,
        data: true,
      },
    },
  },
  // LLM 提供商配置（支持多提供商切换）
  llm: {
    /** 默认提供商: 'openai' | 'anthropic' | 'glm' */
    provider: 'glm',
    /** API Key（优先级高于环境变量） */
    apiKey: '',
    /** API Base URL（可选，用于兼容端点） */
    baseURL: '',
    /** 默认模型 */
    model: 'glm-4.7',
    /** 最大 tokens */
    maxTokens: 8192,
    /** GLM 特定配置 */
    glm: {
      /** 是否使用 JWT 认证（API Key 包含 . 时自动启用） */
      useJwt: true,
      /** 是否使用 Coding Plan 端点 */
      isCodingPlan: false,
    },
    /** Anthropic 特定配置 */
    anthropic: {
      apiKey: '',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 8192,
    },
    /** OpenAI 特定配置 */
    openai: {
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4',
      maxTokens: 4096,
    },
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
