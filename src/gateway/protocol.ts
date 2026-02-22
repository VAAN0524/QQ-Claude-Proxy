/**
 * Gateway Message Protocol Definitions
 *
 * Supports three message types:
 * - Request/Response: RPC-style communication
 * - Event: Pub/Sub style notifications
 */

export interface Request {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface Response {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

export interface Event {
  type: 'event';
  channel: string;
  event: string;
  data: unknown;
}

export type Message = Request | Response | Event;

// Type guards
export function isRequest(msg: unknown): msg is Request {
  return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'req';
}

export function isResponse(msg: unknown): msg is Response {
  return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'res';
}

export function isEvent(msg: unknown): msg is Event {
  return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'event';
}

// Helper functions
export function createRequest(
  id: string,
  method: string,
  params: Record<string, unknown> = {}
): Request {
  return { type: 'req', id, method, params };
}

export function createResponse(
  id: string,
  ok: boolean,
  payload?: unknown,
  error?: string
): Response {
  const res: Response = { type: 'res', id, ok };
  if (payload !== undefined) res.payload = payload;
  if (error !== undefined) res.error = error;
  return res;
}

export function createEvent(
  channel: string,
  event: string,
  data: unknown
): Event {
  return { type: 'event', channel, event, data };
}
