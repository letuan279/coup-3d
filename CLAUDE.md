# Coup 3D

Online multiplayer Coup (original rules) with a bright 3D tavern table. Read `docs/SPEC.md` first — it is the source of truth for rules, architecture, server behaviour, bots and client UX.

- Contract files (do not change shapes without coordinating): `shared/types.ts`, `shared/constants.ts`, `shared/protocol.ts`, `shared/engine/index.ts` + `shared/bot/index.ts` exported signatures, `client/src/store/useGame.ts`, `client/src/net/*`, `client/src/i18n/index.ts`, `client/src/art/palette.ts`.
- Import shared code as `@shared/...`.
- Do not install npm packages; do not run `git commit` (the orchestrator commits).
- Commands: `npm run typecheck`, `npm test` (vitest), `npx vitest run <path>`, `npm run build`, `npm run dev`.
- UI text goes through i18n (`useT()` / `t()`); Vietnamese is the default language, English must also be filled in.
