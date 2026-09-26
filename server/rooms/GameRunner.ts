/**
 * Runs one game: owns the engine state, the phase deadline (timeouts → default moves) and the
 * bot timers. Knows nothing about seats or sockets — the room tells it who is bot-driven and
 * receives an `onUpdate` after every change.
 */
import { applyMove, getDeciders, getDefaultMove, phaseTimer, toView } from '@shared/engine';
import type { BotLevel, GameState, GameView, LoggedEvent, Move, RoomSettings } from '@shared/types';
import type { Clock, Timer } from '../clock';
import type { ServerTiming } from '../timing';
import { fail, OK, type Result } from '../transport';
import { botThinkDelay, defaultDecideBot, playBotMove, type DecideBot } from './botDriver';

export interface GameRunnerHost {
  readonly clock: Clock;
  readonly rand: () => number;
  readonly timing: ServerTiming;
  readonly decideBot?: DecideBot;
  settings(): RoomSettings;
  /** Level of the bot currently playing this seat, or null when a human is in control. */
  botLevel(playerId: string): BotLevel | null;
  /** Called after every change with the events it produced (possibly none). */
  onUpdate(events: LoggedEvent[]): void;
  /** Unexpected internal error (logged by the host; the game keeps going on defaults). */
  onError?(err: unknown): void;
}

interface BotTimer {
  seq: number;
  timer: Timer;
}

export class GameRunner {
  private current: GameState;
  private deadline: number | null = null;
  private durationMs: number | null = null;
  private phaseStartedAt = 0;
  private armedSeq = -1;
  private phaseTimerHandle: Timer | null = null;
  private readonly bots = new Map<string, BotTimer>();
  private disposed = false;

  constructor(
    initial: GameState,
    private readonly host: GameRunnerHost,
  ) {
    this.current = initial;
  }

  get state(): GameState {
    return this.current;
  }

  get isOver(): boolean {
    return this.current.phase.kind === 'game_over';
  }

  /** Epoch ms when the current phase auto-resolves (null when there is no timer). */
  get phaseDeadline(): number | null {
    return this.deadline;
  }

  /** Arms the first phase timer / bots and publishes the initial state. */
  start(): void {
    this.afterChange(this.current.log.slice());
  }

  dispose(): void {
    this.disposed = true;
    this.phaseTimerHandle?.cancel();
    this.phaseTimerHandle = null;
    this.cancelBots();
  }

  /** Personalised view with the server-side timing fields filled in. */
  view(viewerId: string | null, opts?: { logLimit?: number }): GameView {
    const view = toView(this.current, viewerId, opts);
    view.deadline = this.deadline;
    view.phaseDurationMs = this.durationMs;
    view.serverNow = this.host.clock.now();
    return view;
  }

  /** A move from a human client. `phaseSeq` must match the current phase. */
  submit(playerId: string, move: Move, phaseSeq: number): Result {
    if (this.disposed) return fail('game_over');
    if (this.isOver) return fail('game_over');
    if (phaseSeq !== this.current.phaseSeq) return fail('stale_phase');
    const res = applyMove(this.current, playerId, move);
    if (!res.ok) return fail(res.error);
    this.current = res.state;
    this.afterChange(res.events);
    return OK;
  }

  /** Re-evaluate who is bot-driven (a seat was taken over or a human came back). */
  refreshControl(): void {
    if (this.disposed) return;
    this.scheduleBots();
  }

  private afterChange(events: LoggedEvent[]): void {
    if (this.disposed) return;
    if (this.current.phaseSeq !== this.armedSeq) this.armPhase();
    this.scheduleBots();
    this.host.onUpdate(events);
  }

  private phaseDurationMs(kind: NonNullable<ReturnType<typeof phaseTimer>>): number {
    const { timing } = this.host;
    const settings = this.host.settings();
    switch (kind) {
      case 'turn':
      case 'exchange':
        return Math.round(settings.turnSeconds * 1000 * timing.phaseScale);
      case 'response':
        return Math.round(settings.responseSeconds * 1000 * timing.phaseScale);
      case 'lose_influence':
        return timing.loseInfluenceMs;
    }
  }

  private armPhase(): void {
    this.phaseTimerHandle?.cancel();
    this.phaseTimerHandle = null;
    this.cancelBots();
    const now = this.host.clock.now();
    const seq = this.current.phaseSeq;
    this.armedSeq = seq;
    this.phaseStartedAt = now;
    const kind = phaseTimer(this.current);
    if (!kind) {
      this.deadline = null;
      this.durationMs = null;
      return;
    }
    this.durationMs = this.phaseDurationMs(kind);
    this.deadline = now + this.durationMs;
    this.phaseTimerHandle = this.host.clock.setTimeout(() => this.guard(() => this.expire(seq)), this.durationMs);
  }

  /** Deadline hit: default move for every remaining decider (stop as soon as the phase moves on). */
  private expire(seq: number): void {
    this.phaseTimerHandle = null;
    if (this.disposed || this.current.phaseSeq !== seq) return;
    const events: LoggedEvent[] = [];
    for (const id of getDeciders(this.current)) {
      if (this.current.phaseSeq !== seq) break;
      const move = getDefaultMove(this.current, id);
      if (!move) continue;
      const res = applyMove(this.current, id, move, { auto: true });
      if (!res.ok) continue;
      this.current = res.state;
      events.push(...res.events);
    }
    // Should never happen (defaults always resolve the phase) — re-arm rather than stall.
    if (this.current.phaseSeq === seq) this.armedSeq = -1;
    this.afterChange(events);
  }

  private cancelBots(): void {
    for (const b of this.bots.values()) b.timer.cancel();
    this.bots.clear();
  }

  private scheduleBots(): void {
    const seq = this.current.phaseSeq;
    const deciders = new Set(this.isOver ? [] : getDeciders(this.current));
    for (const [id, b] of this.bots) {
      if (b.seq !== seq || !deciders.has(id) || this.host.botLevel(id) === null) {
        b.timer.cancel();
        this.bots.delete(id);
      }
    }
    for (const id of deciders) {
      if (this.bots.has(id)) continue;
      const level = this.host.botLevel(id);
      if (!level) continue;
      const delay = botThinkDelay({
        level,
        now: this.host.clock.now(),
        phaseStartedAt: this.phaseStartedAt,
        deadline: this.deadline,
        timing: this.host.timing,
        rand: this.host.rand,
      });
      const timer = this.host.clock.setTimeout(() => this.guard(() => this.botAct(id, seq)), delay);
      this.bots.set(id, { seq, timer });
    }
  }

  private botAct(playerId: string, seq: number): void {
    const entry = this.bots.get(playerId);
    if (entry?.seq === seq) this.bots.delete(playerId);
    if (this.disposed || this.current.phaseSeq !== seq) return;
    const level = this.host.botLevel(playerId);
    if (!level || !getDeciders(this.current).includes(playerId)) return;
    const res = playBotMove(
      this.current,
      playerId,
      { level, rand: this.host.rand },
      this.host.decideBot ?? defaultDecideBot,
    );
    if (!res) return;
    this.current = res.state;
    this.afterChange(res.events);
  }

  private guard(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.host.onError?.(err);
      // Never stall: if no deadline is pending any more, arm a fresh one (defaults will apply).
      if (!this.disposed && !this.isOver && !this.phaseTimerHandle) {
        this.armedSeq = -1;
        this.armPhase();
      }
    }
  }
}
