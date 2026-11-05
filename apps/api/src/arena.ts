import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env.ts';
import type { LiveEvent } from './live.ts';

/**
 * Arena: one Durable Object that holds every live WebSocket and fans out
 * lobby, scoreboard, inbox and challenge events. It stores nothing — D1 is the
 * source of truth; clients refetch on each event.
 *
 * Uses the WebSocket Hibernation API: idle sockets cost no duration, outgoing
 * messages are free, and "ping" is answered without waking the object.
 */
export class Arena extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/connect') {
      if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      const userId = request.headers.get('x-gt-user') || '';
      this.ctx.acceptWebSocket(server, userId ? ['all', `user:${userId}`] : ['all']);
      server.send(JSON.stringify({ type: 'hello', authenticated: !!userId }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const { events } = (await request.json()) as { events: LiveEvent[] };
      let sent = 0;
      for (const ev of events) {
        const message = JSON.stringify(ev.event);
        for (const ws of this.ctx.getWebSockets(ev.userId ? `user:${ev.userId}` : 'all')) {
          try {
            ws.send(message);
            sent++;
          } catch {
            /* socket closing */
          }
        }
      }
      return Response.json({ sent });
    }
    return new Response('Not found', { status: 404 });
  }

  override async webSocketMessage(): Promise<void> {
    /* clients only send "ping", answered by the auto-response */
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, reason);
    } catch {
      /* already closed */
    }
  }
}
