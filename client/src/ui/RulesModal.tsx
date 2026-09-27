import { memo, useEffect } from 'react';
import { ACTIONS } from '@shared/constants';
import { ACTION_TYPES, CHARACTERS } from '@shared/types';
import { useT } from '../i18n';
import { useGame } from '../store/useGame';
import { CharChip } from './common/CharChip';
import { Modal } from './common/Modal';

const SPECIAL_RULES = [
  'rules.sp.setup',
  'rules.sp.mustCoup',
  'rules.sp.challenge',
  'rules.sp.blocks',
  'rules.sp.refund',
  'rules.sp.lose',
  'rules.sp.double',
  'rules.sp.timeout',
] as const;

/** The official reference card as a cheat sheet. */
export const RulesModal = memo(function RulesModal() {
  const open = useGame((s) => s.ui.showRules);
  const setShowRules = useGame((s) => s.setShowRules);
  const t = useT();

  // Esc closes the sheet on every screen; capture phase so game hotkeys don't also react.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setShowRules(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, setShowRules]);

  if (!open) return null;
  const close = () => setShowRules(false);

  return (
    <Modal title={t('rules.title')} onClose={close} className="rules-modal" closeLabel={t('common.close')}>
      <div className="rules-scroll">
        <p className="rules-goal">{t('rules.goal')}</p>

        <h3 className="rules-h">{t('rules.actions')}</h3>
        <table className="rules-table">
          <thead>
            <tr>
              <th>{t('rules.colAction')}</th>
              <th>{t('rules.colClaim')}</th>
              <th>{t('rules.colEffect')}</th>
              <th>{t('rules.colBlock')}</th>
            </tr>
          </thead>
          <tbody>
            {ACTION_TYPES.map((a) => {
              const def = ACTIONS[a];
              return (
                <tr key={a}>
                  <td className="rules-action">{t(`action.${a}`)}</td>
                  <td>{def.claim ? <CharChip c={def.claim} /> : <span className="muted">{t('rules.noClaim')}</span>}</td>
                  <td className="rules-effect">{t(`rules.effect.${a}`)}</td>
                  <td className="rules-block" data-label={t('rules.colBlock')}>
                    {def.blockedBy.length === 0 ? (
                      <span className="muted">{t('rules.unblockable')}</span>
                    ) : (
                      <span className="rules-blockers">
                        {def.blockedBy.map((c) => (
                          <CharChip key={c} c={c} />
                        ))}
                        <span className="muted">{t(def.blockableBy === 'anyone' ? 'rules.byAnyone' : 'rules.byTarget')}</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3 className="rules-h">{t('rules.characters')}</h3>
        <div className="rules-chars">
          {CHARACTERS.map((c) => (
            <div key={c} className="rules-char">
              <CharChip c={c} size="md" />
              <span>{t(`charAbility.${c}`)}</span>
            </div>
          ))}
        </div>

        <h3 className="rules-h">{t('rules.special')}</h3>
        <ul className="rules-list">
          {SPECIAL_RULES.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>

        <section className="rules-keys-section">
          <h3 className="rules-h">{t('rules.keys')}</h3>
          <div className="rules-keys">
            <span>
              <kbd>1</kbd>–<kbd>7</kbd> {t('rules.key.actions')}
            </span>
            <span>
              <kbd>C</kbd> {t('common.challenge')}
            </span>
            <span>
              <kbd>B</kbd> {t('common.block')}
            </span>
            <span>
              <kbd>P</kbd> / <kbd>Space</kbd> {t('common.pass')}
            </span>
            <span>
              <kbd>Esc</kbd> {t('common.cancel')}
            </span>
          </div>
        </section>
      </div>
    </Modal>
  );
});
