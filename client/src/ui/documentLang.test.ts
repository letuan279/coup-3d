import { describe, expect, it } from 'vitest';
import { applyDocumentLang } from './documentLang';

describe('document language', () => {
  it('<html lang> and the tab title follow the UI language', () => {
    const doc = { title: 'Coup — Quán Bài Nắng', documentElement: { lang: 'vi' } };
    applyDocumentLang('en', doc);
    expect(doc).toEqual({ title: 'Coup — Sunny Tavern', documentElement: { lang: 'en' } });
    applyDocumentLang('vi', doc);
    expect(doc).toEqual({ title: 'Coup — Quán Bài Nắng', documentElement: { lang: 'vi' } });
  });

  it('is a no-op without a document (node / tests)', () => {
    expect(() => applyDocumentLang('en', undefined)).not.toThrow();
  });
});
