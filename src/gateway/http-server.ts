/**
 * HTTP Server for Dashboard
 *
 * Provides:
 * 1. Static file serving for dashboard UI
 * 2. REST API endpoints for stats, config, and control
 * 3. CORS support for development
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, resolve } from 'path';
import { logger } from '../utils/logger.js';

// MIME types
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

export interface HttpServerOptions {
  port: number;
  host: string;
  staticPath: string;
  apiHandlers: Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>>;
}

export class HttpServer {
  private server: ReturnType<typeof createServer> | null = null;
  private port: number;
  private host: string;
  private staticPath: string;
  private apiHandlers: Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>>;

  constructor(options: HttpServerOptions) {
    this.port = options.port;
    this.host = options.host;
    this.staticPath = options.staticPath;
    this.apiHandlers = options.apiHandlers;
  }

  /**
   * Start HTTP server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = createServer((req, res) => this.handleRequest(req, res));

        this.server.on('error', (error) => {
          logger.error(`HTTP server error: ${error}`);
        });

        this.server.on('listening', () => {
          logger.info(`HTTP Dashboard server started on http://${this.host}:${this.port}`);
          resolve();
        });

        this.server.listen(this.port, this.host);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop HTTP server
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          logger.info('HTTP Dashboard server stopped');
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming request
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // API routes - use method+path as key to support multiple methods on same path
      if (url.pathname.startsWith('/api/')) {
        const method = req.method || 'GET';
        const handlerKey = `${method}:${url.pathname}`;
        const handler = this.apiHandlers.get(handlerKey);
        if (handler) {
          await handler(req, res);
        } else {
          this.sendJson(res, { error: 'Not found' }, 404);
        }
        return;
      }

      // Static files
      await this.serveStaticFile(url.pathname, res);
    } catch (error) {
      logger.error(`Request error: ${error}`);
      this.sendJson(res, { error: 'Internal server error' }, 500);
    }
  }

  /**
   * Serve static file
   */
  private async serveStaticFile(pathname: string, res: ServerResponse): Promise<void> {
    // Default to index.html
    if (pathname === '/') {
      pathname = '/index.html';
    }

    // Remove /dashboard prefix if present (staticPath already points to dashboard directory)
    let requestPath = pathname.substring(1);
    if (requestPath.startsWith('dashboard/')) {
      requestPath = requestPath.substring(8); // Remove 'dashboard/'
    }

    const filePath = resolve(this.staticPath, requestPath);

    // Security check - prevent directory traversal
    if (!filePath.startsWith(resolve(this.staticPath))) {
      this.sendJson(res, { error: 'Access denied' }, 403);
      return;
    }

    if (!existsSync(filePath)) {
      // Try index.html for SPA routing
      const indexPath = resolve(this.staticPath, 'index.html');
      if (existsSync(indexPath)) {
        await this.sendFile(indexPath, res);
        return;
      }
      this.sendJson(res, { error: 'Not found' }, 404);
      return;
    }

    await this.sendFile(filePath, res);
  }

  /**
   * Send file with proper headers
   */
  private async sendFile(filePath: string, res: ServerResponse): Promise<void> {
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const stat = statSync(filePath);
    const headers = {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=3600',
    };

    res.writeHead(200, headers);

    const stream = createReadStream(filePath);
    stream.pipe(res);

    return new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  sendJson(res: ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }
}
