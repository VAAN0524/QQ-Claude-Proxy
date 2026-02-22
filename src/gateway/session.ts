/**
 * Session Manager
 *
 * Manages WebSocket sessions with unique IDs.
 * Tracks session state and provides session lifecycle management.
 */

import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { Message } from './protocol.js';

export interface Session {
  id: string;
  ws: WebSocket;
  createdAt: Date;
  metadata: Record<string, unknown>;
  channels: Set<string>;
  agents: Set<string>;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private wsToSession: Map<WebSocket, string> = new Map();

  /**
   * Create a new session for a WebSocket connection
   */
  create(ws: WebSocket, metadata: Record<string, unknown> = {}): Session {
    const id = uuidv4();
    const session: Session = {
      id,
      ws,
      createdAt: new Date(),
      metadata,
      channels: new Set(),
      agents: new Set(),
    };

    this.sessions.set(id, session);
    this.wsToSession.set(ws, id);

    return session;
  }

  /**
   * Get session by ID
   */
  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get session by WebSocket
   */
  getByWs(ws: WebSocket): Session | undefined {
    const id = this.wsToSession.get(ws);
    return id ? this.sessions.get(id) : undefined;
  }

  /**
   * Delete a session
   */
  delete(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      this.wsToSession.delete(session.ws);
      return this.sessions.delete(id);
    }
    return false;
  }

  /**
   * Delete session by WebSocket
   */
  deleteByWs(ws: WebSocket): boolean {
    const id = this.wsToSession.get(ws);
    return id ? this.delete(id) : false;
  }

  /**
   * Get all sessions
   */
  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count
   */
  count(): number {
    return this.sessions.size;
  }

  /**
   * Register a channel for a session
   */
  registerChannel(sessionId: string, channel: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.channels.add(channel);
      return true;
    }
    return false;
  }

  /**
   * Unregister a channel from a session
   */
  unregisterChannel(sessionId: string, channel: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.channels.delete(channel);
      return true;
    }
    return false;
  }

  /**
   * Register an agent for a session
   */
  registerAgent(sessionId: string, agentId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.agents.add(agentId);
      return true;
    }
    return false;
  }

  /**
   * Unregister an agent from a session
   */
  unregisterAgent(sessionId: string, agentId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.agents.delete(agentId);
      return true;
    }
    return false;
  }

  /**
   * Send message to a specific session
   */
  send(sessionId: string, message: Message): boolean {
    const session = this.sessions.get(sessionId);
    if (session && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * Broadcast message to all sessions
   */
  broadcast(message: Message): number {
    let sent = 0;
    const data = JSON.stringify(message);

    for (const session of this.sessions.values()) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(data);
        sent++;
      }
    }

    return sent;
  }

  /**
   * Broadcast to sessions subscribed to a channel
   */
  broadcastToChannel(channel: string, message: Message): number {
    let sent = 0;
    const data = JSON.stringify(message);

    for (const session of this.sessions.values()) {
      if (session.channels.has(channel) && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(data);
        sent++;
      }
    }

    return sent;
  }
}
