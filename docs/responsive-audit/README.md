# Responsive UI audit (handoff)

Screenshot sweep of the web UI at desktop, laptop, tablet, phone-portrait, phone-small and phone-landscape
viewports (Vietnamese + English), plus overlays/interactions, a real-server flow and a static mobile audit.

- `issues.md` — 62 de-duplicated findings, sorted by severity (**not yet verified** — the verify pass was stopped).
- `findings.json` — the same findings with screens, viewports, descriptions, suspected causes and repro commands.
  Screenshot paths in `evidence` point at the original machine and are not available here.
- `shot.mjs` — headless-Chrome screenshot + layout lint over CDP (no npm deps, Node ≥ 22). Set `CHROME_PATH` if Chrome
  is not at a standard path. Usage:

  ```bash
  node docs/responsive-audit/shot.mjs --url "http://localhost:5173/?mock=game" --w 390 --h 844 --mobile --wait 5000 --out game.png --lint
  ```

  `--steps '<json>'` runs `{"click":sel}`, `{"clickText":text}`, `{"tap":[x,y]}`, `{"wait":ms}`, `{"key":k}`,
  `{"eval":js}` and `{"shot":file}` after load. Dev fixture screens: `?mock=home|lobby|game|respond|block|blockresp|lose|exchange|waiting|six|over|pendingblock|blocked|replaced|invite`.
  English UI: `localStorage.setItem('coup3d.prefs', JSON.stringify({lang:'en',muted:true}))` then reload.

## Remaining work

1. Verify the high/medium findings (reproduce each with `shot.mjs`), then fix them. Key layout code:
   `client/src/ui/responsive.ts`, `client/src/styles/ui-responsive.css` (per-mode overrides), `client/src/scene/framing.ts`,
   `client/src/scene/labels/`. The TS constants in `responsive.ts` must stay in sync with the CSS.
2. Re-screenshot every layout mode (desktop / scaled / short / portrait HUD; desktop / side / portrait lobby) after fixing.
3. `npm run typecheck && npm test`, then open a PR to `master` and merge it.
4. Deploy with `scripts/deploy.sh` (needs `gcloud` auth for the GCE project — run on the owner's machine).
5. Delete this `docs/responsive-audit/` folder before merging unless the owner wants to keep it.
