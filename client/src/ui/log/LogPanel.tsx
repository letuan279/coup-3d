import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import type { LoggedEvent } from '@shared/types';
import { useT } from '../../i18n';
import { useGame, type Lang } from '../../store/useGame';
import { Icon } from '../common/Icon';
import { RichText } from '../common/RichText';
import { useSelfId } from '../hooks';
import { describeEvent, type NamedPlayer } from './describe';

/** Right-side collapsible game log (≤320px) with localized sentences. */
export const LogPanel = memo(function LogPanel() {
  const t = useT();
  const show = useGame((s) => s.ui.showLog);
  const setShowLog = useGame((s) => s.setShowLog);
  const log = useGame((s) => s.game?.log);
  const players = useGame((s) => s.game?.players);
  const lang = useGame((s) => s.ui.lang);
  const selfId = useSelfId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Names rarely change: key the list on them (not on the players array, which changes with every
  // coin update) so memoised lines are not re-described on each push.
  const namesKey = players?.map((p) => `${p.id}\u0000${p.name}`).join('\u0001') ?? '';
  const named = useMemo<NamedPlayer[]>(
    () =>
      namesKey
        ? namesKey.split('\u0001').map((s) => {
            const [id, name] = s.split('\u0000');
            return { id, name };
          })
        : [],
    [namesKey],
  );

  const lastSeq = log && log.length ? log[log.length - 1].seq : 0;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [lastSeq, show]);

  if (!show) {
    return (
      <button type="button" className="log-tab sticker-btn" onClick={() => setShowLog(true)} title={t('hud.showLog')}>
        <Icon name="log" size={20} />
        <span>{t('log.title')}</span>
        <Icon name="chevronLeft" size={16} />
      </button>
    );
  }

  return (
    <aside className="log-panel sticker interactive pop-in">
      <div className="log-panel__head">
        <Icon name="log" size={20} />
        <span className="log-panel__title">{t('log.title')}</span>
        <button type="button" className="icon-btn" onClick={() => setShowLog(false)} title={t('hud.hideLog')} aria-label={t('hud.hideLog')}>
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
      <div
        ref={scrollRef}
        className="log-panel__scroll"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {!log || log.length === 0 ? (
          <p className="log-empty">{t('log.empty')}</p>
        ) : (
          log.map((e) => <LogLine key={e.seq} e={e} players={named} lang={lang} selfId={selfId} />)
        )}
      </div>
    </aside>
  );
});

interface LineProps {
  e: LoggedEvent;
  players: readonly NamedPlayer[];
  lang: Lang;
  selfId: string | null;
}

const LogLine = memo(
  function LogLine({ e, players, selfId }: LineProps) {
    const t = useT();
    const d = describeEvent(e, players, t);
    if (e.type === 'turn_start') {
      return (
        <div className="log-turn">
          <span>
            <RichText segs={d.segs} selfId={selfId} />
          </span>
        </div>
      );
    }
    return (
      <div className={`log-line log-line--${d.tone}${d.minor ? ' is-minor' : ''}`}>
        <RichText segs={d.segs} selfId={selfId} />
      </div>
    );
  },
  (a, b) => a.e.seq === b.e.seq && a.lang === b.lang && a.players === b.players && a.selfId === b.selfId,
);
