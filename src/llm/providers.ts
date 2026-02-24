/**
 * 统一的 LLM 提供商接口
 *
 * 参考 pi-mono 的 pi-ai 模块，提供统一的 API 支持：
 * - OpenAI (GPT-4, GPT-3.5)
 * - Anthropic (Claude)
 * - GLM (智谱 AI)
 * - 其他兼容 OpenAI API 的提供商
 */

import type { Tool } from './tool.js';
import { logger } from '../utils/logger.js';
import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * 创建 axios 实例，支持代理
 */
function createAxiosInstance(baseURL: string, timeout: number): AxiosInstance {
  const config: any = {
    baseURL,
    timeout,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // 支持代理环境变量
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (proxyUrl) {
    logger.info(`[LLM Provider] 使用代理: ${proxyUrl}`);
    config.httpsAgent = new HttpsProxyAgent(proxyUrl);
    config.proxy = false; // 禁用 axios 默认代理
  }

  return axios.create(config);
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 聊天完成参数
 */
export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  tools?: Tool[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

/**
 * 聊天完成响应
 */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 流式聊天完成块
 */
export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
}

/**
 * LLM 提供商接口
 */
export interface LLMProvider {
  /**
   * 聊天完成 API
   */
  chat: {
    completions: {
      create(params: ChatCompletionParams): Promise<ChatCompletionResponse>;
      stream?(params: ChatCompletionParams): AsyncIterable<ChatCompletionChunk>;
    };
  };
}

/**
 * 提供商配置
 */
export interface ProviderConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * 生成 GLM JWT Token
 */
async function generateGLMToken(apiKey: string): Promise<string> {
  const [id, secret] = apiKey.split('.');
  if (!id || !secret) {
    throw new Error('Invalid GLM API Key format. Expected: id.secret');
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1小时后过期

  const header = { alg: 'HS256', sign_type: 'SIGN' };
  const payload = { api_key: id, exp, timestamp: now };

  // 简化的 JWT 实现（生产环境建议使用 jsonwebtoken 库）
  const encoder = (str: string) => Buffer.from(str).toString('base64url');

  const encodedHeader = encoder(JSON.stringify(header));
  const encodedPayload = encoder(JSON.stringify(payload));

  const signature = `${encodedHeader}.${encodedPayload}`;

  // 使用 HMAC-SHA256 签名
  const crypto = await import('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signature);
  const signatureEncoded = encoder(hmac.digest('base64'));

  return `${encodedHeader}.${encodedPayload}.${signatureEncoded}`;
}

/**
 * OpenAI 提供商
 *
 * 支持 OpenAI API 和兼容 OpenAI 格式的第三方 API
 */
export function openai(config: ProviderConfig): LLMProvider {
  const baseURL = config.baseURL || 'https://api.openai.com/v1';
  const timeout = config.timeout || 60000;

  logger.info(`[LLM Provider] OpenAI initialized with base URL: ${baseURL}`);

  const axiosInstance = createAxiosInstance(baseURL, timeout);

  return {
    chat: {
      completions: {
        create: async (params) => {
          try {
            const response = await axiosInstance.post('/chat/completions', {
              model: params.model,
              messages: params.messages,
              tools: params.tools,
              max_tokens: params.max_tokens,
              temperature: params.temperature,
              top_p: params.top_p,
              stream: false,
            }, {
              headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                ...config.headers,
              },
            });

            return response.data;
          } catch (error: any) {
            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
              throw new Error('OpenAI API request timeout');
            }
            if (error.response) {
              throw new Error(`OpenAI API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            throw error;
          }
        },
      },
    },
  };
}

/**
 * Anthropic 提供商
 *
 * 支持 Claude 3 系列模型
 */
export function anthropic(config: ProviderConfig): LLMProvider {
  const baseURL = config.baseURL || 'https://api.anthropic.com';
  const timeout = config.timeout || 60000;

  logger.info(`[LLM Provider] Anthropic initialized`);

  const axiosInstance = createAxiosInstance(baseURL, timeout);

  return {
    chat: {
      completions: {
        create: async (params) => {
          try {
            // Anthropic API 使用不同的格式
            const systemMessage = params.messages.find(m => m.role === 'system');
            const messages = params.messages.filter(m => m.role !== 'system');

            // 转换工具格式
            const tools = params.tools?.map(tool => ({
              name: tool.function.name,
              description: tool.function.description,
              input_schema: tool.function.parameters,
            }));

            const response = await axiosInstance.post('/v1/messages', {
              model: params.model,
              messages: messages.map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
              })),
              system: systemMessage?.content,
              tools: tools,
              max_tokens: params.max_tokens || 4096,
              temperature: params.temperature,
              top_p: params.top_p,
            }, {
              headers: {
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
                ...config.headers,
              },
            });

            // 转换 Anthropic 响应为 OpenAI 格式
            return convertAnthropicToOpenAI(response.data);
          } catch (error: any) {
            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
              throw new Error('Anthropic API request timeout');
            }
            if (error.response) {
              throw new Error(`Anthropic API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            throw error;
          }
        },
      },
    },
  };
}

/**
 * GLM (智谱 AI) 提供商
 *
 * 支持 GLM-4 系列模型和 Coding Plan 端点
 */
export function glm(config: ProviderConfig & { useJwt?: boolean; isCodingPlan?: boolean }): LLMProvider {
  // Coding Plan 使用不同的默认 URL
  const defaultBaseUrl = config.isCodingPlan
    ? 'https://open.bigmodel.cn/api/coding/paas/v4/'
    : 'https://open.bigmodel.cn/api/paas/v4/';

  const baseURL = config.baseURL || defaultBaseUrl;
  const timeout = config.timeout || 60000;
  // Coding Plan 使用直接 API Key 认证，不需要 JWT
  const useJwt = config.isCodingPlan ? false : (config.useJwt !== false);

  logger.info(`[LLM Provider] GLM initialized with base URL: ${baseURL}, JWT: ${useJwt}, CodingPlan: ${config.isCodingPlan || false}`);

  const axiosInstance = createAxiosInstance(baseURL, timeout);

  return {
    chat: {
      completions: {
        create: async (params) => {
          try {
            // 准备认证头
            const headers: Record<string, string> = {
              ...config.headers,
            };

            // Coding Plan 使用直接 API Key，不使用 JWT
            if (config.isCodingPlan) {
              headers['Authorization'] = `Bearer ${config.apiKey}`;
            } else if (useJwt && config.apiKey.includes('.')) {
              // 普通 GLM 端点可能需要 JWT
              const token = await generateGLMToken(config.apiKey);
              headers['Authorization'] = `Bearer ${token}`;
            } else {
              headers['Authorization'] = `Bearer ${config.apiKey}`;
            }

            // Coding Plan 请求格式可能略有不同
            const endpoint = config.isCodingPlan ? 'chat/completions' : 'chat/completions';

            const response = await axiosInstance.post(endpoint, {
              model: params.model,
              messages: params.messages,
              tools: params.tools,
              max_tokens: params.max_tokens,
            }, {
              headers,
            });

            return response.data;
          } catch (error: any) {
            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
              throw new Error('GLM API request timeout');
            }
            if (error.response) {
              throw new Error(`GLM API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            throw error;
          }
        },
      },
    },
  };
}

/**
 * 通用提供商工厂
 *
 * 根据类型自动创建对应的提供商
 */
export function createProvider(
  type: 'openai' | 'anthropic' | 'glm',
  config: ProviderConfig
): LLMProvider {
  switch (type) {
    case 'openai':
      return openai(config);
    case 'anthropic':
      return anthropic(config);
    case 'glm':
      return glm(config);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * 从配置创建提供商
 *
 * 配置格式：
 * {
 *   provider: 'openai' | 'anthropic' | 'glm',
 *   apiKey: string,
 *   baseURL?: string,
 *   timeout?: number,
 *   useJwt?: boolean,      // GLM 专用
 *   isCodingPlan?: boolean, // GLM 专用
 * }
 */
export function providerFromConfig(config: {
  provider: 'openai' | 'anthropic' | 'glm';
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  useJwt?: boolean;
  isCodingPlan?: boolean;
}): LLMProvider {
  if (config.provider === 'glm') {
    return glm({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout,
      useJwt: config.useJwt,
      isCodingPlan: config.isCodingPlan,
    });
  }
  return createProvider(config.provider, {
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeout,
  });
}

/**
 * 转换 Anthropic 响应为 OpenAI 格式
 */
function convertAnthropicToOpenAI(anthropicResponse: any): ChatCompletionResponse {
  const content = anthropicResponse.content;
  const textContent = content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('');

  const toolCalls = content
    .filter((c: any) => c.type === 'tool_use')
    .map((c: any, index: number) => ({
      id: c.id,
      type: 'function' as const,
      function: {
        name: c.name,
        arguments: JSON.stringify(c.input),
      },
    }));

  return {
    id: anthropicResponse.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: anthropicResponse.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: toolCalls.length > 0 ? null : textContent,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finish_reason: anthropicResponse.stop_reason,
      },
    ],
    usage: {
      prompt_tokens: anthropicResponse.usage.input_tokens,
      completion_tokens: anthropicResponse.usage.output_tokens,
      total_tokens:
        anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens,
    },
  };
}

/**
 * 提供商池
 *
 * 管理多个提供商，支持故障转移
 */
export class ProviderPool {
  private providers: LLMProvider[] = [];
  private currentIndex = 0;

  /**
   * 添加提供商
   */
  add(provider: LLMProvider): void {
    this.providers.push(provider);
  }

  /**
   * 获取当前提供商
   */
  getCurrent(): LLMProvider {
    if (this.providers.length === 0) {
      throw new Error('No providers available');
    }
    return this.providers[this.currentIndex];
  }

  /**
   * 切换到下一个提供商
   */
  next(): LLMProvider {
    this.currentIndex = (this.currentIndex + 1) % this.providers.length;
    return this.getCurrent();
  }

  /**
   * 带故障转移的调用
   */
  async withFallback<T>(
    fn: (provider: LLMProvider) => Promise<T>,
    maxRetries?: number
  ): Promise<T> {
    const retries = maxRetries ?? this.providers.length - 1;
    let lastError: Error | undefined;

    for (let i = 0; i <= retries; i++) {
      try {
        const provider = this.getCurrent();
        return await fn(provider);
      } catch (error) {
        lastError = error as Error;
        logger.warn(`[ProviderPool] Provider ${this.currentIndex} failed, trying next...`);

        if (i < retries) {
          this.next();
        }
      }
    }

    throw lastError || new Error('All providers failed');
  }
}
