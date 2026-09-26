/**
 * Server assembly: HTTP handler + Socket.IO + RoomManager. `index.ts` runs it; integration
 * tests create their own instances (ephemeral port, time-scaled timers).
 */
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import type { Clock } from './clock';
import { createHttpHandler } from './http';
import type { DecideBot } from './rooms/botDriver';
import { RoomManager } from './rooms/RoomManager';
import { bindSockets, type CoupIo } from './sockets';
import type { ServerTiming } from './timing';

export interface CoupServerOptions {
  /** Built client directory to serve, or null (API + /healthz only). */
  staticDir?: string | null;
  /** Allowed cross-origin socket origins (the Vite dev server). */
  corsOrigins?: string[];
  clock?: Clock;
  rand?: () => number;
  timing?: ServerTiming;
  decideBot?: DecideBot;
  ratePerSecond?: number;
  rateBurst?: number;
  /** Unexpected errors (defaults to console.error). */
  onError?(err: unknown, where: string): void;
}

export interface CoupServer {
  readonly httpServer: HttpServer;
  readonly io: CoupIo;
  readonly manager: RoomManager;
  /** Resolves with the bound port (pass 0 for an ephemeral one). */
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

const defaultOnError = (err: unknown, where: string) => console.error(`[coup-3d] error in ${where}:`, err);

export function createCoupServer(opts: CoupServerOptions = {}): CoupServer {
  const onError = opts.onError ?? defaultOnError;
  const manager = new RoomManager({
    clock: opts.clock,
    rand: opts.rand,
    timing: opts.timing,
    decideBot: opts.decideBot,
    onError: (err) => onError(err, 'game'),
  });

  const httpServer = createServer(
    createHttpHandler({ staticDir: opts.staticDir ?? null, health: () => ({ rooms: manager.roomCount }) }),
  );

  const io: CoupIo = new Server(httpServer, {
    serveClient: false,
    cors: opts.corsOrigins?.length ? { origin: opts.corsOrigins, credentials: false } : undefined,
    // Notice dead connections quickly so the reconnect grace period starts on time.
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 16 * 1024,
  });

  bindSockets(io, manager, {
    ratePerSecond: opts.ratePerSecond,
    rateBurst: opts.rateBurst,
    onError: (err, event) => onError(err, event),
  });

  return {
    httpServer,
    io,
    manager,
    listen(port, host) {
      return new Promise((resolvePort, reject) => {
        const onListenError = (err: Error) => reject(err);
        httpServer.once('error', onListenError);
        httpServer.listen(port, host, () => {
          httpServer.off('error', onListenError);
          resolvePort((httpServer.address() as AddressInfo).port);
        });
      });
    },
    close() {
      manager.closeAll();
      return new Promise((resolveClose) => {
        io.close(() => resolveClose());
      });
    },
  };
}
