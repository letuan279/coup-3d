/** socket.io-client wrapper for integration tests: records everything and offers typed calls. */
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';
import type { EmoteId, GameView, LoggedEvent, RoomView } from '@shared/types';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type AckResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };
export interface GameStatePayload {
  view: GameView;
  events: LoggedEvent[];
  resync: boolean;
}

let tokenCounter = 0;
export function newToken(): string {
  return `test-token-${Date.now().toString(36)}-${(tokenCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class TestClient {
  readonly socket: ClientSocket;
  readonly rooms: RoomView[] = [];
  readonly games: GameStatePayload[] = [];
  readonly closed: string[] = [];
  readonly emotes: { playerId: string; emote: EmoteId }[] = [];
  cleared = 0;

  constructor(
    url: string,
    readonly token: string = newToken(),
  ) {
    this.socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    this.socket.on('room:state', (r) => this.rooms.push(r));
    this.socket.on('game:state', (g) => this.games.push(g));
    this.socket.on('room:closed', ({ reason }) => this.closed.push(reason));
    this.socket.on('game:cleared', () => this.cleared++);
    this.socket.on('game:emote', (e) => this.emotes.push(e));
  }

  get room(): RoomView | null {
    return this.rooms.at(-1) ?? null;
  }

  get game(): GameStatePayload | null {
    return this.games.at(-1) ?? null;
  }

  get youId(): string {
    const id = this.room?.youId;
    if (!id) throw new Error('not in a room');
    return id;
  }

  connected(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', (err) => reject(err));
    });
  }

  /** Emit an event with an ack and resolve with the server's answer. */
  call(event: keyof ClientToServerEvents, payload?: unknown, timeoutMs = 3000): Promise<AckResult> {
    const emit = this.socket.emit.bind(this.socket) as (ev: string, ...args: unknown[]) => void;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ack for ${event}`)), timeoutMs);
      const ack = (res: AckResult) => {
        clearTimeout(timer);
        resolve(res);
      };
      if (payload === undefined) emit(event, ack);
      else emit(event, payload, ack);
    });
  }

  /** Raw emit (no typing) — for malformed-payload tests. */
  raw(event: string, ...args: unknown[]): void {
    (this.socket.emit.bind(this.socket) as (ev: string, ...a: unknown[]) => void)(event, ...args);
  }

  close(): void {
    this.socket.disconnect();
  }
}

/** Poll `pred` until it returns a truthy value (resolved) or the timeout hits (rejected). */
export async function waitFor<T>(pred: () => T | null | undefined | false, timeoutMs = 3000, what = 'condition'): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = pred();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}
