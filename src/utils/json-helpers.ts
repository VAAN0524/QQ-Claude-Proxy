/**
 * JSON 工具函数 - 确保中文正确显示
 */

/**
 * 安全的 JSON 序列化，确保中文字符正确显示
 * @param obj 要序列化的对象
 * @param space 缩进空格数
 * @returns JSON 字符串，中文不会被转义
 */
export function safeStringify(obj: any, space: number | string = 2): string {
  try {
    const json = JSON.stringify(obj, null, space);
    // 恢复被转义的 Unicode 字符
    return json.replace(/\\u[\d\w]{4}/gi, (match) => {
      const charCode = parseInt(match.slice(2), 16);
      return String.fromCharCode(charCode);
    });
  } catch (error) {
    // 如果序列化失败，返回错误信息
    return `JSON.stringify failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * 安全的 JSON 解析
 * @param json JSON 字符串
 * @returns 解析后的对象
 */
export function safeParse<T = any>(json: string): T | null {
  try {
    return JSON.parse(json);
  } catch (error) {
    console.error(`JSON.parse failed: ${error}`);
    return null;
  }
}

/**
 * 格式化输出对象用于日志（确保中文正确显示）
 * @param obj 要输出的对象
 * @returns 格式化后的字符串
 */
export function formatObject(obj: any): string {
  if (typeof obj === 'string') {
    return obj;
  }
  return safeStringify(obj, 2);
}

/**
 * 格式化输出标题/文本（去除可能的 JSON 转义）
 * @param text 可能包含 Unicode 转义的文本
 * @returns 解码后的中文文本
 */
export function decodeUnicodeText(text: string): string {
  if (!text) return '';
  // 解码 \uXXXX 格式的 Unicode 转义
  return text.replace(/\\u([\d\w]{4})/gi, (match, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/**
 * 确保输出到控制台的文本正确显示中文
 * @param args 任意参数
 * @returns 格式化后的字符串
 */
export function formatConsoleOutput(...args: any[]): string {
  return args.map(arg => {
    if (typeof arg === 'string') {
      return decodeUnicodeText(arg);
    } else if (typeof arg === 'object' && arg !== null) {
      return safeStringify(arg, 2);
    } else {
      return String(arg);
    }
  }).join(' ');
}
