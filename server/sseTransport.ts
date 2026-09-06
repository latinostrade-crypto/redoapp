import type { Response } from 'express';

export type SseMetrics = {framesSent: number; framesDeduplicated: number; payloadBytesSent: number; heartbeatsSent: number; slowConnectionsClosed: number};
const lastPayload = new WeakMap<Response, Map<string, string>>();
export const MAX_SSE_BUFFER_BYTES = 256 * 1024;

/** A slow WebView must not accumulate unlimited snapshots in server memory.
 * Reconnect gets the current authoritative snapshot; no game/seat is mutated. */
export function sendSerializedSse(response: Response, event: string, payload: string, metrics: SseMetrics, dedupe = true) {
  if (response.writableEnded || response.destroyed) return false;
  if (response.writableLength > MAX_SSE_BUFFER_BYTES) {
    metrics.slowConnectionsClosed++;
    response.destroy();
    return false;
  }
  const previous = lastPayload.get(response) || new Map<string, string>();
  if (dedupe && previous.get(event) === payload) { metrics.framesDeduplicated++; return false; }
  previous.set(event, payload); lastPayload.set(response, previous);
  response.write(`event: ${event}\ndata: ${payload}\n\n`);
  (response as Response & {flush?: () => void}).flush?.();
  metrics.framesSent++;
  metrics.payloadBytesSent += Buffer.byteLength(payload);
  if (event === 'heartbeat') metrics.heartbeatsSent++;
  return true;
}
