import { useEffect } from 'react';
import { on } from '../../net/bus';
import { useGame } from '../../store/useGame';
import { errorKey } from '../errors';
import { useHud } from '../hudStore';

/** Rejected moves → localized error toast + dock shake. */
export function useMoveFeedback(): void {
  useEffect(
    () =>
      on('moveRejected', ({ error }) => {
        useGame.getState().toast(errorKey(error), 'error');
        useHud.setState((h) => ({ shakeSeq: h.shakeSeq + 1 }));
      }),
    [],
  );
}
