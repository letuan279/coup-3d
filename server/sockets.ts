/**
 * Socket.IO adapter: handshake auth, per-socket rate limiting, payload validation and ack
 * plumbing on top of the transport-agnostic RoomManager.
 */
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';
import type { RoomManager } from './rooms/RoomManager';
import { RateLimiter } from './rateLimit';
import { fail, type Connection, type Result } from './transport';
import {
  BadRequest,
  parseAddBotPayload,
  parseCreatePayload,
  parseEmotePayload,
  parseJoinPayload,
  parseKickPayload,
  parseMovePayload,
  parseSettingsPayload,
  parseToken,
  parseUpdatePayload,
} from './validate';

export interface SocketData {
  token: string;
  /** Room code the client claims to be in (handshake), see HandshakeAuth.room. */
  claimedRoom?: string;
}

export type CoupIo = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type CoupSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface SocketBindingOptions {
  /** Sustained events per second per socket (default 20). */
  ratePerSecond?: number;
  /** Burst allowance (default 30). */
  rateBurst?: number;
  now?: () => number;
  onError?(err: unknown, event: string): void;
}

function socketConnection(socket: CoupSocket): Connection {
  // Socket.IO's typed emit cannot follow the generic event→args correlation; the Connection
  // signature already enforces it for callers.
  const emit = socket.emit.bind(socket) as (event: string, ...args: unknown[]) => boolean;
  return {
    send(event, ...args) {
      emit(event, ...args);
    },
    close() {
      socket.disconnect(true);
    },
  };
}

/** Socket.IO passes (payload?, ack?) — tolerate clients that omit either. */
function splitArgs(args: unknown[]): { payload: unknown; ack: ((res: Result<object>) => void) | null } {
  const last = args[args.length - 1];
  const ack = typeof last === 'function' ? (last as (res: Result<object>) => void) : null;
  const payload = typeof args[0] === 'function' ? undefined : args[0];
  return { payload, ack };
}

export function bindSockets(io: CoupIo, manager: RoomManager, opts: SocketBindingOptions = {}): void {
  const ratePerSecond = opts.ratePerSecond ?? 20;
  const burst = opts.rateBurst ?? 30;
  const now = opts.now ?? Date.now;

  io.use((socket, next) => {
    const auth: unknown = socket.handshake.auth;
    const token = parseToken(typeof auth === 'object' && auth !== null ? (auth as { token?: unknown }).token : undefined);
    if (!token) {
      next(new Error('invalid_token'));
      return;
    }
    socket.data.token = token;
    const room = typeof auth === 'object' && auth !== null ? (auth as { room?: unknown }).room : undefined;
    socket.data.claimedRoom = typeof room === 'string' && room.length > 0 && room.length <= 16 ? room : undefined;
    next();
  });

  io.on('connection', (socket) => {
    const token = socket.data.token;
    const conn = socketConnection(socket);
    const limiter = new RateLimiter(ratePerSecond, burst, now);

    /** Wrap a handler: rate limit → validate/run (exceptions → bad_request) → ack. */
    const handle =
      (event: string, run: (payload: unknown) => Result<object>) =>
      (...args: unknown[]): void => {
        const { payload, ack } = splitArgs(args);
        let res: Result<object>;
        if (!limiter.take()) {
          res = fail('rate_limited');
        } else {
          try {
            res = run(payload);
          } catch (err) {
            if (!(err instanceof BadRequest)) opts.onError?.(err, event);
            res = fail('bad_request');
          }
        }
        if (!ack) return;
        try {
          ack(res);
        } catch (err) {
          opts.onError?.(err, event);
        }
      };

    socket.on('room:create', handle('room:create', (p) => manager.createRoom(token, parseCreatePayload(p))));
    socket.on(
      'room:join',
      handle('room:join', (p) => {
        const { code, ...profile } = parseJoinPayload(p);
        return manager.joinRoom(token, code, profile);
      }),
    );
    socket.on('room:leave', handle('room:leave', () => manager.leaveRoom(token)));
    socket.on('player:update', handle('player:update', (p) => manager.updatePlayer(token, parseUpdatePayload(p))));
    socket.on('room:addBot', handle('room:addBot', (p) => manager.addBot(token, parseAddBotPayload(p).level)));
    socket.on('room:kick', handle('room:kick', (p) => manager.kick(token, parseKickPayload(p).playerId)));
    socket.on('room:settings', handle('room:settings', (p) => manager.updateSettings(token, parseSettingsPayload(p))));
    socket.on('room:start', handle('room:start', () => manager.start(token)));
    socket.on('room:backToLobby', handle('room:backToLobby', () => manager.backToLobby(token)));
    socket.on('room:reset', handle('room:reset', () => manager.resetGame(token)));
    socket.on(
      'game:move',
      handle('game:move', (p) => {
        const { move, phaseSeq } = parseMovePayload(p);
        return manager.move(token, move, phaseSeq);
      }),
    );
    // No ack in the protocol: rejected emotes (cooldown, bad payload) are silently dropped.
    socket.on('game:emote', handle('game:emote', (p) => manager.emote(token, parseEmotePayload(p).emote)));

    socket.on('disconnect', () => {
      try {
        manager.disconnect(token, conn);
      } catch (err) {
        opts.onError?.(err, 'disconnect');
      }
    });

    try {
      manager.connect(token, conn, socket.data.claimedRoom);
    } catch (err) {
      opts.onError?.(err, 'connect');
    }
  });
}
