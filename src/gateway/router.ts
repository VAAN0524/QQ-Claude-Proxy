/**
 * Message Router
 *
 * Routes incoming messages to appropriate handlers based on method/channel.
 * Supports method handlers for requests and event handlers for channels.
 */

import { WebSocket } from 'ws';
import {
  Message,
  Request,
  Response,
  Event,
  isRequest,
  isEvent,
  createResponse,
} from './protocol.js';
import { logger } from '../utils/logger.js';

export type MethodHandler = (
  params: Record<string, unknown>,
  context: RouterContext
) => Promise<unknown> | unknown;

export type EventHandler = (
  event: string,
  data: unknown,
  context: RouterContext
) => Promise<void> | void;

export interface RouterContext {
  sessionId: string;
  ws: WebSocket;
  send: (msg: Message) => void;
}

export class Router {
  private methodHandlers: Map<string, MethodHandler> = new Map();
  private eventHandlers: Map<string, EventHandler> = new Map();

  /**
   * Register a method handler for RPC requests
   */
  onMethod(method: string, handler: MethodHandler): void {
    this.methodHandlers.set(method, handler);
  }

  /**
   * Register an event handler for a channel
   */
  onEvent(channel: string, handler: EventHandler): void {
    this.eventHandlers.set(channel, handler);
  }

  /**
   * Remove a method handler
   */
  offMethod(method: string): void {
    this.methodHandlers.delete(method);
  }

  /**
   * Remove an event handler
   */
  offEvent(channel: string): void {
    this.eventHandlers.delete(channel);
  }

  /**
   * Route and handle an incoming message
   */
  async handle(message: Message, context: RouterContext): Promise<void> {
    if (isRequest(message)) {
      await this.handleRequest(message, context);
    } else if (isEvent(message)) {
      await this.handleEvent(message, context);
    }
    // Response messages are not handled by router (they're replies to our requests)
  }

  private async handleRequest(request: Request, context: RouterContext): Promise<void> {
    const handler = this.methodHandlers.get(request.method);

    if (!handler) {
      context.send(
        createResponse(request.id, false, undefined, `Unknown method: ${request.method}`)
      );
      return;
    }

    try {
      const result = await handler(request.params, context);
      context.send(createResponse(request.id, true, result));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.send(createResponse(request.id, false, undefined, errorMessage));
    }
  }

  private async handleEvent(event: Event, context: RouterContext): Promise<void> {
    const handler = this.eventHandlers.get(event.channel);

    if (handler) {
      try {
        await handler(event.event, event.data, context);
      } catch (error) {
        logger.error(`Event handler error for channel ${event.channel}: ${error}`);
      }
    }
  }

  /**
   * Get list of registered methods
   */
  getMethods(): string[] {
    return Array.from(this.methodHandlers.keys());
  }

  /**
   * Get list of registered channels
   */
  getChannels(): string[] {
    return Array.from(this.eventHandlers.keys());
  }
}
