/**
 * DOM content of a seat's in-world label (rendered inside drei <Html>, i.e. a separate React
 * root — no R3F hooks in here). The countdown ring is driven from the character's useFrame
 * through `ringRef` / `secRef`.
 */
import { memo, type RefObject } from 'react';
import type { SeatModel, SceneMode } from '../sceneModel';
import { useT } from '../../i18n';
import { SpeechBubble } from './SpeechBubble';

export const RING_R = 15;
export const RING_C = 2 * Math.PI * RING_R;

export interface NameplateProps {
  seat: SeatModel;
  mode: SceneMode;
  deciding: boolean;
  targetable: boolean;
  hovered: boolean;
  isActor: boolean;
  isWinner: boolean;
  wins: number;
  /** Anchor element (at the head centre); the character sets `--u` (px per metre) and the bubble side on it. */
  anchorRef: RefObject<HTMLDivElement | null>;
  ringRef: RefObject<SVGCircleElement | null>;
  secRef: RefObject<HTMLSpanElement | null>;
  onEnter(): void;
  onLeave(): void;
  onPick(): void;
}

export const Nameplate = memo(function Nameplate(p: NameplateProps) {
  return (
    <div ref={p.anchorRef} className="sc-seat">
      <div className="sc-bubble-pos">
        <SpeechBubble playerId={p.seat.id} />
      </div>
      <div className="sc-plate-pos">
        <PlateCard {...p} />
      </div>
      {p.seat.offline && (
        <div className="sc-zzz" aria-hidden>
          <span>z</span>
          <span>z</span>
          <span>z</span>
        </div>
      )}
    </div>
  );
});

function PlateCard(p: NameplateProps) {
  const t = useT();
  const { seat } = p;
  const cls = [
    'sc-plate',
    p.targetable && 'is-target',
    p.hovered && 'is-hover',
    p.isActor && 'is-actor',
    seat.eliminated && 'is-dead',
    p.isWinner && 'is-winner',
    seat.offline && 'is-offline',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} onPointerEnter={p.onEnter} onPointerLeave={p.onLeave} onClick={p.targetable ? p.onPick : undefined}>
      {p.deciding && (
        <div className="sc-ring">
          <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden>
            <circle className="sc-ring__bg" cx="18" cy="18" r={RING_R} />
            <circle ref={p.ringRef} className="sc-ring__fg" cx="18" cy="18" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={0} />
          </svg>
          <span ref={p.secRef} className="sc-ring__sec" />
        </div>
      )}
      <div className="sc-plate__main">
        <div className="sc-plate__name">
          {p.mode === 'lobby' && seat.isHost && <CrownIcon />}
          {p.isWinner && <TrophyIcon />}
          <span className="sc-plate__text">{seat.name}</span>
        </div>
        {p.mode === 'game' && (
          <div className="sc-plate__meta">
            {seat.eliminated ? (
              <span className="sc-tag sc-tag--dead">{t('common.eliminated')}</span>
            ) : (
              <>
                <span className="sc-coin" aria-hidden />
                <span className="sc-plate__coins">{seat.coins}</span>
                <span className="sc-pips" title={t('scene.plate.cards', { n: seat.hiddenCount })}>
                  {seat.influences.map((inf) => (
                    <i key={inf.slot} className={inf.revealed ? 'is-lost' : ''} />
                  ))}
                </span>
              </>
            )}
          </div>
        )}
        {p.mode === 'lobby' && p.wins > 0 && (
          <div className="sc-plate__meta">
            <span className="sc-tag sc-tag--wins">{t('scene.plate.wins', { n: p.wins })}</span>
          </div>
        )}
      </div>
      {(seat.botBadge || seat.offline) && (
        <div className="sc-plate__badges">
          {seat.botBadge && (
            <span className="sc-badge sc-badge--bot" title={seat.botControlled ? t('common.botPlaying') : t('common.bot')}>
              <RobotIcon />
              {seat.botControlled ? t('common.botPlaying') : seat.botLevel ? t(`botLevel.${seat.botLevel}`) : t('common.bot')}
            </span>
          )}
          {seat.offline && (
            <span className="sc-badge sc-badge--off" title={t('common.offline')}>
              <WifiOffIcon />
            </span>
          )}
        </div>
      )}
      {p.targetable && <span className="sc-plate__pick">{t('scene.plate.pickTarget')}</span>}
    </div>
  );
}

function CrownIcon() {
  return (
    <svg className="sc-icon sc-icon--crown" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="#FFC24B" stroke="#2B2140" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg className="sc-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M7 4h10v4a5 5 0 01-10 0zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4M10 13h4l1 5H9zM7 20h10"
        fill="#FFC24B"
        stroke="#2B2140"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RobotIcon() {
  return (
    <svg className="sc-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <rect x="4" y="8" width="16" height="12" rx="3" fill="#8FD8FF" stroke="#2B2140" strokeWidth="2" />
      <path d="M12 8V4" stroke="#2B2140" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="3.5" r="1.8" fill="#FF6B5B" stroke="#2B2140" strokeWidth="1.5" />
      <circle cx="9" cy="14" r="1.6" fill="#2B2140" />
      <circle cx="15" cy="14" r="1.6" fill="#2B2140" />
    </svg>
  );
}

function WifiOffIcon() {
  return (
    <svg className="sc-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path d="M2 8.5a15 15 0 0120 0M5.5 12a10 10 0 0113 0M9 15.5a5 5 0 016 0" fill="none" stroke="#2B2140" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="19" r="1.6" fill="#2B2140" />
      <path d="M3 3l18 18" stroke="#F2415A" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
