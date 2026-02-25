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
  /** Code Refactor Agent 配置 */
  refactor?: AgentInstanceConfig;
  /** Coordinator Agent 配置 */
  coordinator: CoordinatorConfig;
}

/**
 * Agent 人格配置
 */
export interface PersonaConfig {
  /** 是否启用人格设定 */
  enabled: boolean;
  /** 人格类型: 'ah-bai' | 'professional' | 'friendly' | 'custom' */
  personaType: 'ah-bai' | 'professional' | 'friendly' | 'custom';
  /** 自定义人格（当 personaType 为 'custom' 时使用） */
  customPersona?: {
    /** 角色定位 */
    role?: string;
    /** 核心职责 */
    responsibilities?: string;
    /** 性格特点 */
    traits?: string;
    /** 工作原则 */
    principles?: string;
    /** 对话风格 */
    speakingStyle?: string;
  };
  /** 对话风格 */
  dialogueStyle?: {
    /** 语气风格: 'neutral' | 'friendly' | 'professional' | 'enthusiastic' */
    tone?: 'neutral' | 'friendly' | 'professional' | 'enthusiastic';
    /** 详细程度: 'concise' | 'normal' | 'detailed' */
    verbosity?: 'concise' | 'normal' | 'detailed';
    /** 是否启用表情符号 */
    enableEmoji?: boolean;
    /** 是否启用对话连续性（支持省略表达） */
    enableContinuity?: boolean;
  };
}

/**
 * 上下文管理配置
 */
export interface ContextConfig {
  /** 最大上下文大小 (tokens) */
  maxContextSize: number;
  /** 最近消息权重比例 (0-1) */
  recentRatio: number;
  /** 最大历史消息数量 */
  maxHistoryMessages: number;
  /** 是否启用上下文压缩 */
  enableCompression: boolean;
  /** 压缩后最大 tokens */
  compressionMaxTokens: number;
  /** 是否保留代码块 */
  preserveCodeBlocks: boolean;
  /** 是否保留文件路径 */
  preserveFilePaths: boolean;
  /** 实时上下文配置 */
  realtime?: {
    /** 是否启用实时上下文 */
    enabled?: boolean;
    /** 是否包含日期 */
    enableDate?: boolean;
    /** 是否包含时间 */
    enableTime?: boolean;
    /** 是否包含星期 */
    enableWeekday?: boolean;
  };
}

/**
 * 记忆系统配置
 */
export interface MemoryConfig {
  /** 是否启用记忆系统 */
  enabled: boolean;
  /** L0 层最大 tokens */
  l0MaxTokens: number;
  /** L1 层最大 tokens */
  l1MaxTokens: number;
  /** 是否启用 L2 层 */
  l2Enabled: boolean;
  /** 记忆保留天数 */
  retentionDays: number;
  /** 是否启用语义搜索 */
  enableSemanticSearch: boolean;
  /** 是否启用自动归档 */
  enableAutoArchive: boolean;
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
  /** Agent 人格配置 */
  persona?: PersonaConfig;
  /** 上下文管理配置 */
  context?: ContextConfig;
  /** 记忆系统配置 */
  memory?: MemoryConfig;
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
      enabled: false,  // 禁用 CodeAgent，使用 GLMCoordinatorAgent 代替
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
  },
  // Agent 人格配置
  persona: {
    enabled: true,
    personaType: 'ah-bai',
    customPersona: {
      role: '',
      responsibilities: '',
      traits: '',
      principles: '',
      speakingStyle: ''
    },
    dialogueStyle: {
      tone: 'neutral',
      verbosity: 'normal',
      enableEmoji: true,
      enableContinuity: true
    }
  },
  // 上下文管理配置
  context: {
    maxContextSize: 16000,
    recentRatio: 0.7,
    maxHistoryMessages: 100,
    enableCompression: true,
    compressionMaxTokens: 16000,
    preserveCodeBlocks: true,
    preserveFilePaths: true,
    realtime: {
      enabled: true,
      enableDate: true,
      enableTime: true,
      enableWeekday: true
    }
  },
  // 记忆系统配置
  memory: {
    enabled: true,
    l0MaxTokens: 100,
    l1MaxTokens: 2000,
    l2Enabled: true,
    retentionDays: 30,
    enableSemanticSearch: false,
    enableAutoArchive: true
  }
};
