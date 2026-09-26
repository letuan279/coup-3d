/**
 * The only thing rooms know about the network: a per-player connection that can receive
 * server→client events. The Socket.IO adapter lives in server/sockets.ts; tests use
 * server/testing/fakeConnection.ts.
 */
import type { ServerErrorCode, ServerToClientEvents } from '@shared/protocol';
import type { MoveError } from '@shared/types';

export interface Connection {
  send<E extends keyof ServerToClientEvents>(event: E, ...args: Parameters<ServerToClientEvents[E]>): void;
  /** Server-side disconnect of the underlying socket. */
  close(): void;
}

export type ErrorCode = ServerErrorCode | MoveError;

export type Failure = { ok: false; error: ErrorCode };

/** Same shape as the protocol's ack payload. */
export type Result<T extends object = {}> = ({ ok: true } & T) | Failure;

export const OK: { ok: true } = Object.freeze({ ok: true as const });

export function fail(error: ErrorCode): Failure {
  return { ok: false, error };
}
