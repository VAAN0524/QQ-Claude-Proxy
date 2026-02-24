import pino from 'pino';
import { promises as fs } from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';

// 检测是否为 Windows 环境
const isWindows = process.platform === 'win32';

// 创建日志目录
const logsDir = path.join(process.cwd(), 'logs');
fs.mkdir(logsDir, { recursive: true }).catch(() => {});

// Windows 下简单的日志配置，避免 pino-pretty 编码问题
export const logger = isWindows
  ? pino({
      level: 'info',
      // Windows: 文件输出 + 简单控制台输出
      transport: {
        target: 'pino/file',
        options: {
          destination: path.join(logsDir, 'app.log'),
          mkdir: true,
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    })
  : pino({
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: true,
        }
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });

// Windows 下额外输出到控制台（简单的 console.log，避免编码问题）
if (isWindows) {
  const originalInfo = logger.info.bind(logger);
  logger.info = function (...args: any[]) {
    // 输出到日志文件
    originalInfo(...args);
    // 同时输出到控制台（使用 console.log 避免编码问题）
    const msg = args.map((arg: any) => {
      if (typeof arg === 'string') return arg;
      if (arg && typeof arg === 'object') {
        const time = arg.time || new Date().toISOString();
        const level = arg.level || 'INFO';
        const msg = arg.msg || JSON.stringify(arg);
        return `[${time}] ${level}: ${msg}`;
      }
      return String(arg);
    }).join(' ');
    console.log(msg);
  } as any;
}
