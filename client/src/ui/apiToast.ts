import type { ApiResult } from '../net/socket';
import { useGame } from '../store/useGame';
import { errorKey } from './errors';

/** Awaits an api call and shows a localized error toast when it fails. */
export async function withToast<T>(p: Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  const res = await p;
  if (!res.ok) useGame.getState().toast(errorKey(res.error), 'error');
  return res;
}
