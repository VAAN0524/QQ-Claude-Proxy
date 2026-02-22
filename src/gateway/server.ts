/**
 * Gateway WebSocket Server
 *
 * Main entry point for the Gateway module.
 * Listens on port 18789 for WebSocket connections.
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import { Router } from './router.js';
import type { RouterContext } from './router.js';
import { SessionManager } from './session.js';
import {
  Message,
  isRequest,
  isResponse,
  isEvent,
  createResponse,
  createEvent,
} from './protocol.js';
import { logger } from '../utils/logger.js';

export interface GatewayOptions {
  port?: number;
  host?: string;
}

export interface GatewayStats {
  port: number;
  host: string;
  sessions: number;
  methods: string[];
  channels: string[];
}

export class Gateway {
  private wss: WebSocketServer | null = null;
  private router: Router;
  private sessionManager: SessionManager;
  private port: number;
  private host: string;

  constructor(options: GatewayOptions = {}) {
    this.port = options.port ?? 18789;
    this.host = options.host ?? '127.0.0.1';
    this.router = new Router();
    this.sessionManager = new SessionManager();

    // Register default methods
    this.registerDefaultMethods();
  }

  private registerDefaultMethods(): void {
    // Ping/Pong for connection health
    this.router.onMethod('ping', () => ({ pong: true, timestamp: Date.now() }));

    // Get session info
    this.router.onMethod('session.info', (_, ctx) => {
      const session = this.sessionManager.get(ctx.sessionId);
      return session ? {
        id: session.id,
        createdAt: session.createdAt,
        channels: Array.from(session.channels),
        agents: Array.from(session.agents),
      } : null;
    });

    // Channel subscription
    this.router.onMethod('channel.subscribe', (params, ctx) => {
      const channel = params.channel as string;
      if (!channel) throw new Error('Channel name required');
      this.sessionManager.registerChannel(ctx.sessionId, channel);
      return { subscribed: channel };
    });

    // Channel unsubscription
    this.router.onMethod('channel.unsubscribe', (params, ctx) => {
      const channel = params.channel as string;
      if (!channel) throw new Error('Channel name required');
      this.sessionManager.unregisterChannel(ctx.sessionId, channel);
      return { unsubscribed: channel };
    });

    // Agent registration
    this.router.onMethod('agent.register', (params, ctx) => {
      const agentId = params.agentId as string;
      if (!agentId) throw new Error('Agent ID required');
      this.sessionManager.registerAgent(ctx.sessionId, agentId);
      return { registered: agentId };
    });

    // Agent unregistration
    this.router.onMethod('agent.unregister', (params, ctx) => {
      const agentId = params.agentId as string;
      if (!agentId) throw new Error('Agent ID required');
      this.sessionManager.unregisterAgent(ctx.sessionId, agentId);
      return { unregistered: agentId };
    });

    // List available methods
    this.router.onMethod('methods.list', () => ({
      methods: this.router.getMethods(),
    }));

    // List subscribed channels
    this.router.onMethod('channels.list', () => ({
      channels: this.router.getChannels(),
    }));

    // Gateway stats
    this.router.onMethod('gateway.stats', () => this.getStats());
  }

  /**
   * Start the Gateway server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.port,
          host: this.host,
        });

        this.wss.on('connection', (ws: WebSocket) => {
          this.handleConnection(ws);
        });

        this.wss.on('error', (error) => {
          logger.error(`Gateway server error: ${error}`);
        });

        this.wss.on('listening', () => {
          logger.info(`Gateway server started on ${this.host}:${this.port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the Gateway server
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.wss) {
        resolve();
        return;
      }

      // Close all sessions
      for (const session of this.sessionManager.getAll()) {
        session.ws.close(1001, 'Server shutting down');
      }

      this.wss.close((error) => {
        if (error) {
          reject(error);
        } else {
          logger.info('Gateway server stopped');
          this.wss = null;
          resolve();
        }
      });
    });
  }

  private handleConnection(ws: WebSocket): void {
    // Create session
    const session = this.sessionManager.create(ws);
    logger.info(`Session created: ${session.id}`);

    // Send welcome event
    this.sendToWs(ws, createEvent('gateway', 'session.created', {
      sessionId: session.id,
      timestamp: Date.now(),
    }));

    // Handle incoming messages
    ws.on('message', (data: RawData) => {
      this.handleMessage(ws, session.id, data);
    });

    // Handle close
    ws.on('close', () => {
      logger.info(`Session closed: ${session.id}`);
      this.sessionManager.delete(session.id);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error(`Session error (${session.id}): ${error}`);
      this.sessionManager.delete(session.id);
    });
  }

  private handleMessage(ws: WebSocket, sessionId: string, data: RawData): void {
    let message: Message;

    try {
      const str = Array.isArray(data)
        ? Buffer.concat(data.map(d => Buffer.isBuffer(d) ? d : Buffer.from(d as string))).toString()
        : data.toString();
      message = JSON.parse(str);
    } catch (error) {
      logger.error(`Failed to parse message: ${error}`);
      return;
    }

    // Create router context
    const context: RouterContext = {
      sessionId,
      ws,
      send: (msg: Message) => this.sendToWs(ws, msg),
    };

    // Handle message through router
    if (isRequest(message)) {
      this.router.handle(message, context);
    } else if (isResponse(message)) {
      // Response to our request - could emit event or callback
      logger.debug(`Received response for request ${message.id}`);
    } else if (isEvent(message)) {
      // Broadcast event to channel subscribers
      this.sessionManager.broadcastToChannel(message.channel, message);
    }
  }

  private sendToWs(ws: WebSocket, message: Message): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Get the router for custom method/event registration
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Get the session manager
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get gateway statistics
   */
  getStats(): GatewayStats {
    return {
      port: this.port,
      host: this.host,
      sessions: this.sessionManager.count(),
      methods: this.router.getMethods(),
      channels: this.router.getChannels(),
    };
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.wss !== null;
  }

  /**
   * Handle internal channel events (from QQ Bot, etc.)
   * This allows channels to forward events directly to the router
   */
  handleChannelEvent(event: { type: string; channel: string; event: string; data: unknown }): void {
    logger.info(`[Gateway.handleChannelEvent] channel=${event.channel}, event=${event.event}`);
    const handlers = (this.router as any).eventHandlers as Map<string, any>;
    const handler = handlers.get(event.channel);

    if (handler) {
      logger.info(`[Gateway.handleChannelEvent] Handler found, executing...`);
      // Create a mock context for internal events
      const mockContext: RouterContext = {
        sessionId: 'internal',
        ws: null as any,
        send: () => {}, // No-op for internal events
      };

      handler(event.event, event.data, mockContext).catch((error: Error) => {
        logger.error(`Internal event handler error for channel ${event.channel}: ${error}`);
      });
    } else {
      logger.warn(`No handler registered for channel: ${event.channel}`);
    }
  }
}

// Export everything
export { Router } from './router.js';
export { SessionManager } from './session.js';
export * from './protocol.js';

// Default export
export default Gateway;
