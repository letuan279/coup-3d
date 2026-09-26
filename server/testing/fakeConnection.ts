/** Connection double that records everything the server sends. */
import type { ServerToClientEvents } from '@shared/protocol';
import type { GameView, LoggedEvent, RoomView } from '@shared/types';
import type { Connection } from '../transport';

export type Sent = {
  [E in keyof ServerToClientEvents]: { event: E; args: Parameters<ServerToClientEvents[E]> };
}[keyof ServerToClientEvents];

export class FakeConnection implements Connection {
  readonly sent: Sent[] = [];
  closed = false;

  constructor(readonly label = 'conn') {}

  send<E extends keyof ServerToClientEvents>(event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
    this.sent.push({ event, args } as Sent);
  }

  close(): void {
    this.closed = true;
  }

  clear(): void {
    this.sent.length = 0;
  }

  of<E extends keyof ServerToClientEvents>(event: E): Parameters<ServerToClientEvents[E]>[] {
    return this.sent.filter((s) => s.event === event).map((s) => s.args as Parameters<ServerToClientEvents[E]>);
  }

  get lastRoom(): RoomView | null {
    const all = this.of('room:state');
    return all.length ? all[all.length - 1][0] : null;
  }

  get lastGame(): { view: GameView; events: LoggedEvent[]; resync: boolean } | null {
    const all = this.of('game:state');
    return all.length ? all[all.length - 1][0] : null;
  }

  get closedReasons(): string[] {
    return this.of('room:closed').map(([p]) => p.reason);
  }
}
