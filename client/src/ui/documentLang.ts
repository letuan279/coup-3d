import { translate } from '../i18n';
import type { Lang } from '../store/useGame';

/** The bits of `document` we touch (injectable for tests). */
export interface DocLike {
  title: string;
  documentElement: { lang: string };
}

/** Keeps `<html lang>` and the tab title in the UI language (screen readers, browser translate). */
export function applyDocumentLang(lang: Lang, doc: DocLike | undefined = typeof document !== 'undefined' ? document : undefined): void {
  if (!doc) return;
  doc.documentElement.lang = lang;
  doc.title = translate(lang, 'doc.title');
}
