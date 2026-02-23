/**
 * 简化的工具定义 API
 *
 * 参考 pi-mono 的工具定义模式，使用 Zod Schema 自动生成 JSON Schema
 * 将 100+ 行的工具定义压缩到 5-10 行
 */

import { z } from 'zod';

/**
 * OpenAI Function Calling 格式的工具定义
 */
export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties?: Record<string, any>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
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
 * 工具定义配置
 */
export interface ToolDefinition<TInput = any> {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数 Schema (Zod) */
  parameters?: z.ZodType<TInput>;
  /** 执行函数 */
  execute?: (input: TInput, context: any) => Promise<any>;
}

/**
 * 创建工具定义
 *
 * @example
 * ```typescript
 * const readTool = tool({
 *   name: 'read_file',
 *   description: '读取文件内容',
 *   parameters: z.object({
 *     path: z.string().describe('文件路径'),
 *   }),
 *   execute: async ({ path }) => {
 *     return await fs.readFile(path, 'utf-8');
 *   }
 * });
 * ```
 */
export function tool<TInput = any>(def: ToolDefinition<TInput>): Tool {
  const jsonSchema = def.parameters
    ? zodToJsonSchema(def.parameters)
    : { type: 'object', properties: {} };

  return {
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: jsonSchema,
    },
  };
}

/**
 * 批量创建工具定义
 */
export function tools(defs: ToolDefinition[]): Tool[] {
  return defs.map(def => tool(def));
}

/**
 * 解析工具调用参数
 */
export function parseToolArguments<TInput>(
  toolCall: ToolCall,
  schema?: z.ZodType<TInput>
): TInput {
  const args = JSON.parse(toolCall.function.arguments);
  if (schema) {
    return schema.parse(args) as TInput;
  }
  return args as TInput;
}

/**
 * Zod Schema 到 JSON Schema 转换器
 *
 * 支持的类型：
 * - z.string() -> { type: 'string' }
 * - z.number() -> { type: 'number' }
 * - z.boolean() -> { type: 'boolean' }
 * - z.array() -> { type: 'array', items: {...} }
 * - z.object() -> { type: 'object', properties: {...}, required: [...] }
 * - z.optional() -> 从 required 中移除
 * - z.nullable() -> { type: [...], nullable: true }
 * - z.describe() -> 添加 description
 */
function zodToJsonSchema(zodType: z.ZodType, visited = new WeakMap<object, any>()): any {
  // 处理循环引用
  if (visited.has(zodType)) {
    return visited.get(zodType);
  }

  // 获取 Zod 类型定义
  const def = (zodType as any)._def;

  // 处理字符串类型
  if (zodType instanceof z.ZodString) {
    let schema: any = { type: 'string' as const };
    if (def.checks) {
      for (const check of def.checks) {
        if (check.kind === 'min') schema.minLength = check.value;
        if (check.kind === 'max') schema.maxLength = check.value;
        if (check.kind === 'pattern') schema.pattern = check.regex.source;
      }
    }
    return schema;
  }

  // 处理数字类型
  if (zodType instanceof z.ZodNumber) {
    let schema: any = { type: 'number' as const };
    if (def.checks) {
      for (const check of def.checks) {
        if (check.kind === 'min') schema.minimum = check.value;
        if (check.kind === 'max') schema.maximum = check.value;
      }
    }
    return schema;
  }

  // 处理布尔类型
  if (zodType instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  // 处理数组类型
  if (zodType instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(def.elementType, visited),
    };
  }

  // 处理对象类型
  if (zodType instanceof z.ZodObject) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    const descriptions = new Map<string, string>();

    for (const [key, value] of Object.entries(def.shape())) {
      const fieldDef = value as z.ZodType;

      // 检查是否有 description (通过 describe() 方法添加)
      const fieldObj = fieldDef as any;
      if (fieldObj.description) {
        descriptions.set(key, fieldObj.description);
      }

      // 递归转换
      properties[key] = zodToJsonSchema(fieldDef, visited);

      // 检查是否可选
      // Zod 3.x 使用 isOptional(), Zod 4.x 使用不同的方式
      const isOptional =
        fieldDef instanceof z.ZodOptional ||
        (fieldDef as any)._def?.typeName === 'ZodOptional' ||
        !def.keys().includes(key);

      if (!isOptional) {
        required.push(key);
      }
    }

    const schema: any = {
      type: 'object',
      properties,
    };

    if (required.length > 0) {
      schema.required = required;
    }

    return schema;
  }

  // 处理可选类型
  if (zodType instanceof z.ZodOptional) {
    return zodToJsonSchema(def.innerType, visited);
  }

  // 处理可空类型
  if (zodType instanceof z.ZodNullable) {
    const innerSchema = zodToJsonSchema(def.innerType, visited);
    return {
      ...innerSchema,
      nullable: true,
    };
  }

  // 处理枚举类型
  if (zodType instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: def.values,
    };
  }

  // 处理字面量类型
  if (zodType instanceof z.ZodLiteral) {
    return {
      type: typeof def.value,
      const: def.value,
    };
  }

  // 处理联合类型 (只处理部分情况)
  if (zodType instanceof z.ZodUnion) {
    const options = def.options.map((opt: z.ZodType) => zodToJsonSchema(opt, visited));
    // 简化处理：只取第一个选项的类型
    return options[0];
  }

  // 处理任意类型
  if (zodType instanceof z.ZodAny) {
    return {};
  }

  // 处理 never 类型 (用于 undefined)
  if (zodType instanceof z.ZodNever) {
    return { type: 'null' }; // 或直接忽略
  }

  // 默认返回空对象
  return { type: 'object' };
}

/**
 * Zod describe 扩展
 *
 * 用于给 Zod Schema 添加描述信息
 */
declare module 'zod' {
  interface ZodTypeDef {
    description?: string;
  }

  interface ZodType {
    description?: string;
  }
}

// 为 Zod 原型添加 describe 方法 (如果不存在)
if (!z.ZodType.prototype.describe) {
  z.ZodType.prototype.describe = function(this: any, description: string) {
    this.description = description;
    return this;
  };
}

/**
 * 工具注册表
 *
 * 管理所有可用的工具及其执行函数
 */
export class ToolRegistry {
  private tools = new Map<string, { definition: ToolDefinition; tool: Tool }>();

  /**
   * 注册工具
   */
  register<TInput>(def: ToolDefinition<TInput>): Tool {
    const toolDef = tool(def);
    this.tools.set(def.name, { definition: def, tool: toolDef });
    return toolDef;
  }

  /**
   * 获取工具定义
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name)?.tool;
  }

  /**
   * 获取所有工具定义
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values()).map(v => v.tool);
  }

  /**
   * 执行工具
   */
  async execute(name: string, args: unknown, context: any): Promise<any> {
    const entry = this.tools.get(name);
    if (!entry?.definition.execute) {
      throw new Error(`Tool not found or has no execute function: ${name}`);
    }

    // 验证参数
    let parsedArgs = args;
    if (entry.definition.parameters) {
      parsedArgs = entry.definition.parameters.parse(args);
    }

    return await entry.definition.execute(parsedArgs, context);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}
