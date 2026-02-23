import pino from 'pino';
import { promises as fs } from 'fs';
import path from 'path';

// 检测是否为 Windows 环境
const isWindows = process.platform === 'win32';

// 创建日志目录
const logsDir = path.join(process.cwd(), 'logs');
fs.mkdir(logsDir, { recursive: true }).catch(() => {});

// Windows 下使用文件+控制台双输出，避免编码问题
export const logger = pino({
  level: 'info',
  // Windows 下同时输出到文件和控制台
  ...(isWindows ? {
    transport: {
      targets: [
        {
          target: 'pino/file',
          options: {
            destination: path.join(logsDir, 'app.log'),
            mkdir: true,
          },
        },
        {
          target: 'pino-pretty',
          options: {
            colorize: false,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            singleLine: true,
          },
        },
      ],
    },
  } : {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: true,
      }
    }
  }),
  // 注意：使用 targets 时不允许自定义 formatters
  timestamp: pino.stdTimeFunctions.isoTime,
});
