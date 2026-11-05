import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { getBearer, isOnlineConfigured, liveUrl } from './api';
import { useSession } from './session';

type LiveMessage = { type: 'hello' | 'lobby' | 'scoreboard' | 'challenge' | 'inbox'; challengeId?: string };

/**
 * One WebSocket to the Arena. Every event just invalidates the matching
 * queries, so the server stays the single source of truth. Reconnects with
 * backoff and when the app returns to the foreground.
 */
export function useLiveUpdates(): { connected: boolean } {
  const qc = useQueryClient();
  const { me } = useSession();
  const [connected, setConnected] = useState(false);
  const userId = me?.id ?? null;
  const attempt = useRef(0);

  useEffect(() => {
    if (!isOnlineConfigured) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;

    const handle = (msg: LiveMessage) => {
      switch (msg.type) {
        case 'lobby':
          qc.invalidateQueries({ queryKey: ['lobby'] });
          break;
        case 'scoreboard':
          qc.invalidateQueries({ queryKey: ['scoreboard'] });
          qc.invalidateQueries({ queryKey: ['me'] });
          break;
        case 'challenge':
          if (msg.challengeId) qc.invalidateQueries({ queryKey: ['challenge', msg.challengeId] });
          qc.invalidateQueries({ queryKey: ['inbox'] });
          qc.invalidateQueries({ queryKey: ['me'] });
          break;
        case 'inbox':
          qc.invalidateQueries({ queryKey: ['inbox'] });
          qc.invalidateQueries({ queryKey: ['me'] });
          break;
      }
    };

    const connect = () => {
      if (closed) return;
      const token = getBearer();
      const Ctor = WebSocket as unknown as new (url: string, protocols?: string[] | null, opts?: { headers: Record<string, string> }) => WebSocket;
      ws = Platform.OS !== 'web' && token ? new Ctor(liveUrl(), null, { headers: { authorization: `Bearer ${token}` } }) : new WebSocket(liveUrl());
      ws.onopen = () => {
        attempt.current = 0;
        setConnected(true);
        ping = setInterval(() => ws?.readyState === 1 && ws.send('ping'), 25_000);
      };
      ws.onmessage = (e) => {
        if (e.data === 'pong') return;
        try {
          handle(JSON.parse(String(e.data)) as LiveMessage);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (ping) clearInterval(ping);
        if (closed) return;
        const delay = Math.min(30_000, 1000 * 2 ** attempt.current++);
        retry = setTimeout(connect, delay);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && ws && ws.readyState !== 1) {
        if (retry) clearTimeout(retry);
        attempt.current = 0;
        connect();
      }
      if (s === 'active') qc.invalidateQueries();
    });
    return () => {
      closed = true;
      sub.remove();
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      ws?.close();
    };
  }, [qc, userId]);

  return { connected };
}
