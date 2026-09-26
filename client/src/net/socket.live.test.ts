/**
 * net/socket.ts against a REAL Socket.IO server (minimal stand-in for the game server's session
 * rules), to pin down the library behaviour the fixes rely on:
 * - clientflow-1: a tab replaced by another tab ends in conn 'replaced' (the server-closed socket
 *   never reconnects by itself), clicks there neither send nor buffer, and "play in this tab"
 *   reconnects without replaying anything;
 * - clientflow-6b: a move whose ack is lost in a transport drop settles immediately.
 */
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server, type Socket as ServerSocket } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GameView } from '@shared/types';

const TOKEN = 'live-test-token-0123456789';

let http: HttpServer;
let server: Server;
let url: string;
const received: string[] = [];
const sessions = new Map<string, ServerSocket>();

beforeAll(async () => {
  http = createServer();
  server = new Server(http);
  server.on('connection', (socket) => {
    const token = String(socket.handshake.auth.token);
    const old = sessions.get(token);
    sessions.set(token, socket);
    if (old && old !== socket) {
      // What RoomManager.connect does for a second socket with the same token.
      old.emit('room:closed', { reason: 'replaced' });
      old.disconnect(true);
    }
    socket.onAny((ev) => received.push(ev));
    socket.on('room:create', (_p, ack) => ack({ ok: true, code: 'KX7QP' }));
    socket.on('game:move', () => {
      // Never acknowledge: simulate the ack being lost when the transport drops right after.
      setTimeout(() => socket.conn.close(), 20);
    });
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

  const loc = new URL(`${url}/`);
  (globalThis as any).location = loc;
  (globalThis as any).window = { location: loc, history: { replaceState() {} } };
  const store = new Map<string, string>([['coup3d.token', TOKEN]]);
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
});

afterAll(async () => {
  server.close();
  await new Promise((r) => http.close(() => r(null)));
});

async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('live socket', () => {
  it('replaced tab → blocking state, no buffered clicks, explicit reconnect', async () => {
    vi.resetModules();
    const net = await import('./socket');
    const { useGame } = await import('../store/useGame');
    const s = net.connectSocket();
    await until(() => useGame.getState().conn === 'connected');
    expect(await net.api.createRoom('Tuấn', 'fox')).toEqual({ ok: true, code: 'KX7QP' });

    // Same session opened in another tab.
    const other = ioClient(url, { auth: { token: TOKEN }, transports: ['websocket'], reconnection: false, forceNew: true });
    const otherClosed: string[] = [];
    other.on('disconnect', (reason) => otherClosed.push(reason));
    await until(() => useGame.getState().conn === 'replaced');
    expect(s.active).toBe(false);
    await new Promise((r) => setTimeout(r, 300));
    expect(useGame.getState().conn).toBe('replaced'); // no endless "reconnecting…"

    const t0 = Date.now();
    expect(await net.api.createRoom('Tuấn', 'fox')).toEqual({ ok: false, error: 'not_connected' });
    expect(Date.now() - t0).toBeLessThan(100);
    expect(s.sendBuffer).toHaveLength(0);

    // "Play in this tab".
    net.reconnectHere();
    await until(() => useGame.getState().conn === 'connected');
    await until(() => otherClosed.includes('io server disconnect')); // the other tab is now the replaced one
    await new Promise((r) => setTimeout(r, 100));
    expect(received.filter((e) => e === 'room:create')).toHaveLength(1); // the failed click was never replayed
    other.close();
  });

  it('a move whose ack is lost in a transport drop settles at once (inputs are not locked for 8 s)', async () => {
    const net = await import('./socket');
    const { useGame } = await import('../store/useGame');
    await until(() => useGame.getState().conn === 'connected');
    const view = { phaseSeq: 3, prompt: { kind: 'respond_block' } } as unknown as GameView;
    useGame.setState({ game: view });
    const t0 = Date.now();
    const res = await net.api.move({ type: 'pass' });
    expect(res).toEqual({ ok: false, error: 'disconnected' });
    expect(Date.now() - t0).toBeLessThan(2000);
    await until(() => useGame.getState().conn === 'connected'); // and it reconnects by itself
  });
});
