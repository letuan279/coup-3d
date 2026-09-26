# Coup 3D — Build Specification

Online multiplayer **Coup** (original rules) in the desktop browser. Server-authoritative,
2–6 seats, bots can fill seats, reconnect support, countdown timers on every decision,
a bright "Sunny Tavern" 3D table inspired by Liar's Bar, 60 FPS on mid-range laptops.
UI language: Vietnamese by default, English toggle.

## 0. Stack & layout

| Layer   | Tech |
|---------|------|
| Shared  | TypeScript, pure functions (`shared/`) — types, constants, rules engine, bot AI |
| Server  | Node ≥20, `node:http` + Socket.IO 4 (`server/`), run with `tsx` in dev, bundled by esbuild for prod |
| Client  | Vite 8 + React 19 + TypeScript, zustand 5 store, `@react-three/fiber` 9 + `drei` 10 + three r186 (`client/`) |
| Tests   | Vitest 5 (`*.test.ts` next to the code, node environment) |

Imports: shared code is imported as `@shared/...` everywhere (alias configured in tsconfig, vite, vitest; tsx/esbuild read tsconfig paths).

```
shared/types.ts        CONTRACT: domain types, views, moves, events, lobby types
shared/constants.ts    CONTRACT: rules constants, action table, timers
shared/protocol.ts     CONTRACT: socket.io events
shared/rng.ts          seeded RNG helpers
shared/engine/         rules engine (index.ts = public API contract)
shared/bot/            bot AI (index.ts = public API contract)
server/                room manager, sockets, timers, bot driver, static hosting
client/src/store/      CONTRACT: zustand store (useGame)
client/src/net/        CONTRACT: socket client + api + event bus
client/src/i18n/       CONTRACT: t()/useT(); core.ts shared vocab; ui.ts / scene.ts owned by their modules
client/src/art/        canvas-drawn card faces/backs, avatar portraits, palette (CONTRACT: palette.ts + exported fns)
client/src/scene/      3D tavern (SceneRoot.tsx entry)
client/src/ui/         2D HUD, screens, modals (UIRoot.tsx entry)
client/src/audio/      WebAudio-synthesised SFX (owned by UI)
```

Scripts: `npm run dev` (server :3000 + vite :5173 proxying `/socket.io`), `npm run build`, `npm start` (server serves `dist/client` + sockets on `PORT`||3000), `npm test`, `npm run typecheck`.

**Never** install new npm packages without the orchestrator's approval; everything needed is installed.

## 1. Rules (original Coup, 2nd edition wording)

- Deck: 15 cards, 3 each of Duke, Assassin, Captain, Ambassador, Contessa. Treasury 50 coins.
- Setup: shuffle, deal 2 face-down cards per player, 2 coins each. **2-player game: the starting player gets 1 coin** (official rule). First player: random (seeded) unless given.
- Turn order: ascending seat, skipping eliminated players.
- On your turn choose exactly one action:

| Action | Cost | Claim | Effect | Blockable by |
|---|---|---|---|---|
| Income | – | – | +1 coin | – (unchallengeable) |
| Foreign Aid | – | – | +2 coins | **Duke, claimed by ANY other living player** |
| Coup | 7 | – | target loses 1 influence | – (unchallengeable) |
| Tax | – | Duke | +3 coins | – |
| Assassinate | 3 | Assassin | target loses 1 influence | Contessa (target only) |
| Steal | – | Captain | take min(2, target coins) from target | Captain or Ambassador (target only) |
| Exchange | – | Ambassador | draw 2 from deck, keep N (N = your unrevealed count) of hand+drawn, return rest, shuffle | – |

- A player starting their turn with **≥10 coins must Coup**. Coup needs 7 coins, Assassinate needs 3.
- Targets: any other non-eliminated player (stealing from a 0-coin player is legal and takes 0).
- Costs are paid to the treasury on declaration. If an Assassinate is **successfully challenged** (actor was bluffing) the 3 coins are **refunded**. If it is **blocked** by Contessa the coins stay spent.
- Challenges: any other living player may challenge a character claim (action claims and block claims). First challenger wins.
  - Challenged player **has** the card → reveals it, it is shuffled into the deck and they draw a replacement into the same slot (`card_replaced`); the **challenger loses 1 influence** (`wrong_challenge`).
  - Challenged player **does not** have it → they lose 1 influence (`caught_bluffing`); the action/block fails.
- Losing influence: the player chooses which unrevealed card to turn face up (it stays face up in its slot). If they only have one unrevealed card it is revealed automatically (no prompt). 0 unrevealed → eliminated; **an eliminated player's coins return to the treasury**.
- Game ends immediately when one player remains → winner.
- Double loss is possible (e.g. challenge an Assassin and lose, then still get assassinated; or bluff Contessa, get caught, then get assassinated).

### 1.1 Phase machine (engine)

```
turn ──choose action──▶
  income                → resolve → end_turn
  coup (pay 7)          → lose_influence(target, coup, then end_turn)
  foreign_aid           → action_response{canChallenge:false, blockers: all other living, blockChars:[duke]}
  tax / exchange        → action_response{canChallenge:true,  blockers: []}
  assassinate (pay 3)   → action_response{canChallenge:true,  blockers:[target], blockChars:[contessa]}
  steal                 → action_response{canChallenge:true,  blockers:[target], blockChars:[captain, ambassador]}

action_response (responders = all other living players; each may pass / challenge / block)
  all passed            → resolve_action
  challenge by C:
     actor has claim    → card_replaced(actor); lose_influence(C, wrong_challenge, then after_action_proven)
     actor bluffed      → refund cost (assassinate); lose_influence(actor, caught_bluffing, then end_turn); action_failed
  block by B (char X)   → record pendingBlock; B counts as responded.
     if the action is challengeable (steal / assassinate) AND other responders have not all passed yet:
                          the SAME action_response window stays open (same phaseSeq, same deadline) for the
                          remaining responders to challenge the ACTION's claim or pass (they can't block).
                          Rationale (official rules): once an action is declared, the other players must get
                          the chance to challenge it — a fast block must not cut that off.
     otherwise / once all remaining responders passed → block_response{responders = all living except B}
  challenge of the action while a block is pending:
     actor bluffed      → as above (action fails; the block is moot and discarded)
     actor has claim    → challenger loses; then straight to block_response for the recorded block

after_action_proven: if a block is already pending → block_response
                     elif action blockable (target-only) AND target alive AND actor alive
                       → action_response{responders:[target], canChallenge:false, blockers:[target]}
                     else resolve_action
   (the target gets a block window even if they had passed before the challenge)

block_response (each responder may pass / challenge the block)
  all passed            → action_blocked → end_turn
  challenge by C:
     B has X            → card_replaced(B); lose_influence(C, wrong_challenge, then end_turn); action_blocked
     B bluffed          → lose_influence(B, caught_bluffing, then resolve_action)

resolve_action:
  foreign_aid +2 / tax +3 / steal min(2, target.coins) → end_turn
  assassinate: target alive → lose_influence(target, assassinate, then end_turn), else end_turn
  exchange: draw 2 → exchange phase (actor keeps N of hand+drawn) → end_turn
  (any action whose actor or target was eliminated in the meantime fizzles gracefully)

lose_influence: prompt only if ≥2 unrevealed; else auto-reveal. After each loss check game over.
end_turn: winner? → game_over. else next living seat → turn (turn++).
```

Every phase change increments `phaseSeq`. Moves carry the `phaseSeq` they were made for; the server rejects stale ones.

### 1.2 Default (timeout) moves
- turn → Income, or Coup on the first legal target if forced (≥10 coins)
- action_response / block_response → pass
- lose_influence → random unrevealed slot (engine RNG)
- exchange → keep the current hand

### 1.3 Information hiding
Views never include other players' hidden characters, deck order, card ids, or another player's exchange draw. Influences are addressed by slot index (0/1) only. Log events are public and never contain hidden info.

## 2. Server

- `server/index.ts`: HTTP server; in production serves `dist/client` (SPA fallback to index.html, correct MIME types, cache headers for hashed assets); Socket.IO on the same port (`PORT` env, default 3000). Health route `GET /healthz`.
- **Identity**: `socket.handshake.auth.token` (random secret from localStorage). A token maps to at most one (room, playerId). A second socket with the same token replaces the first (old gets `room:closed {reason:'replaced'}` and is disconnected). On connection, if the token belongs to a room, the socket is re-attached, and `room:state` (+ `game:state` with `resync:true`) is pushed.
- **Rooms**: in-memory `Map<code, Room>`. Code: 5 chars from `ROOM_CODE_ALPHABET`, case-insensitive join. Max 6 seats. Seats are numbered 0..5; a joiner takes the lowest free seat. Names trimmed, 1..16 chars, unique within a room (append " 2", " 3"… if taken). Avatar: requested if free else first free.
- **Host**: creator. Host-only: add bot (level easy/normal/hard, auto name + free avatar), kick, settings (turnSeconds ∈ TURN_SECONDS_OPTIONS, responseSeconds ∈ RESPONSE_SECONDS_OPTIONS), start (2–6 seated), back to lobby after game over. If the host leaves or is removed, host passes to the next connected human (lowest seat), else any human.
- **Lobby disconnect**: seat kept `LOBBY_DISCONNECT_REMOVE_MS`, then removed (the returning client gets `room:closed {reason:'expired'}`). Room deleted after `EMPTY_ROOM_DELETE_MS` with no connected humans (and immediately if no humans at all).
- **Game start**: engine `createGame` with seats in seat order and a random seed; status `playing`.
- **Game disconnect**: seat stays; its decisions time out with default moves; after `RECONNECT_GRACE_MS` the seat becomes `botControlled` and a normal-level bot plays it. Reconnecting (same token) restores control immediately (`botControlled=false`), and the player receives a full resync. `room:leave` mid-game → seat is `left` + `botControlled` for the rest of the game; the socket leaves the room.
- **Rejoin from another device**: every human seat has a secret `rejoinKey` (random, ≥ 64 bits, `REJOIN_KEY_LENGTH` base64url chars), sent only to that seat's own client in `RoomView.rejoinKey`. The in-game menu offers "copy rejoin link" (`/?room=CODE&key=KEY`). `room:join {code, rejoinKey}` with a valid key reclaims that seat in any room state — lobby included, so a link opened between games never adds a duplicate seat (the new token takes it over; any socket holding it gets `room:closed 'replaced'`; a left seat becomes human-controlled again; name/avatar are ignored). Running/finished game: without a key → `game_in_progress`; wrong key → `bad_rejoin_key`. Lobby: a key matching no seat is a normal join when a name is given, else `bad_rejoin_key`. There is NO rejoin by name (it allowed hijacking seats). `room:join` while seated elsewhere checks the new room first and leaves the old one only once the join is accepted, so clients switch rooms with that single call (never leave-then-join). Client: the key from the URL is cleaned (base64url chars only, capped at `REJOIN_KEY_LENGTH`) and never reclaims silently — a page opened with a rejoin link and not already seated asks "Chơi ghế của bạn trong phòng X trên thiết bị này?" [Vào lại] [Để sau]; a malformed key is reported as a bad rejoin link.
- **Timers**: whenever `phaseSeq` changes, set `deadline = now + duration`, where duration = turn: turnSeconds, action/block response: responseSeconds, lose_influence: LOSE_INFLUENCE_SECONDS, exchange: turnSeconds. On expiry, apply `getDefaultMove(..., {auto:true})` for every current decider (stop if phaseSeq changes midway).
- **Bots**: after every state change, for each decider that is a bot or botControlled, schedule `decideBotMove(toView(state, id), {level, rand})` after a random think delay in `BOT_THINK_MS[level]` (never earlier than `MIN_PHASE_SETTLE_MS` after the phase began, never later than deadline−300ms). Re-check `phaseSeq` before applying. A bot error falls back to `getDefaultMove`. Bot personality flavour: they may send emotes occasionally (e.g. `liar` after catching a bluff, `gg` on winning) — rate limited.
- **Broadcast**: after each change, each connected human gets `game:state {view: toView(state, id, {logLimit: CLIENT_LOG_LIMIT}) + deadline/phaseDurationMs/serverNow, events: new log entries since the last push to that socket, resync:false}`. Room changes → `room:state` to each member (with their own `youId`).
- **Game over**: status `finished`, winner's `wins++`. Host can `room:backToLobby` → status `lobby`, `game:cleared` to all, departed humans removed, bots kept.
- **Validation / abuse**: validate every payload shape; host checks; moves only from the seat owner (never for bot-controlled seats' humans... a human whose seat is botControlled regains control on their first valid move/reconnect); per-socket rate limit (e.g. 20 msgs/s); emotes cooldown `EMOTE_COOLDOWN_MS`.
- Structured, testable code: pure-ish `Room` class with an injectable clock/scheduler so tests can run fast with fake timers.

## 3. Bots (`shared/bot`)

`decideBotMove(view, {level, rand})` → legal Move for `view.prompt`. Stateless: everything is derived from the view (own cards, revealed cards, public log of claims/challenges/blocks/reveals/`card_replaced`).

Knowledge model:
- Card counting: for each character, `unseen = 3 − revealed − own hidden copies`. If an opponent claims a character with `unseen = 0` → the claim is certainly false → always challenge (all levels except maybe easy with small miss chance).
- Probability an opponent holds ≥1 copy: hypergeometric over the unseen pool (deck + all other hidden cards) given their hidden count.
- Claim history: consecutive consistent claims since the player's last `card_replaced`/exchange raise belief; a player who claimed ≥3 different characters while holding ≤2 cards is inconsistent → higher challenge odds. A player who proved a card (card_replaced) lost that card to the deck.
- Stakes: be bolder when the action hurts the bot (assassinate/steal on self), cautious when the bot has 1 influence left — except when doing nothing loses anyway (assassination on a 1-influence bot without Contessa → challenge or bluff Contessa, pick the better odds).

Policy sketch (normal/hard):
- ≥10 coins: coup the biggest threat. 7–9: usually coup (hard may assassinate first if it has a real Assassin and a good target).
- Real cards first: Assassin (≥3 coins, good target) > Duke tax > Captain steal from a rich player who hasn't shown Captain/Ambassador > Ambassador exchange when hand is weak > Foreign aid when no likely Duke > Income.
- Bluffing: personality-driven rate (derived from `hashString(viewerId)`), prefer characters with most unseen copies and not recently proven by others; avoid bluffing a character with ≤1 unseen; avoid bluffing when 1 influence left (hard: rarely).
- Blocks: block with real card always; bluff-block with probability scaled by stakes and unseen copies.
- Lose influence: keep the card most useful / consistent with past claims (don't reveal the character you've been claiming if you have the choice).
- Exchange: keep the best combination (value table + diversity), prefer consistency with previous claims.
- Targeting: threat = hidden influence count × 3 + coins/2 + (claims Assassin) + leader bonus; prefer finishing 1-influence players when close to winning.
- Private knowledge: `GameView.knownInDeck` (characters the bot itself returned by Exchange, until the next draw) — those copies can't be in any opponent's hand (used for certain-bluff detection, not for estimating what the table can see).
- Tells: a player who took a non-Tax action with < 7 coins probably has no Duke ("declined Tax"); bots avoid giving that tell away when bluffing Duke later.
- Per-opponent memory of how they react to claims aimed at them (challenge habits, Contessa-block calls) — adapts to humans who always bluff or always challenge.
- Last-card desperation: when letting a block stand means being couped next turn, challenge it.
- Quality is checked with `scripts/simulate.ts` (incl. `--exploits`: scripted always-bluff / always-challenge / always-block opponents) and `shared/bot/sim.test.ts`.
- Levels: easy = random-ish, rarely challenges (only certain bluffs sometimes), bluffs rarely, poor targeting; normal = the above with moderate randomness; hard = tighter thresholds, full claim-history reasoning, better timing.

## 4. Client

### 4.1 Screens (2D HUD, `client/src/ui`)
- **Home**: title "COUP — Quán Bài Nắng", name input, avatar picker (8 animals), [Tạo phòng], code input + [Vào phòng]. `?room=CODE` in the URL pre-fills the code. Language toggle, sound toggle, rules button.
- **Lobby**: room code (big, copy button + copy invite link), seat list (6 slots: avatar portrait, name, host crown, bot badge+level, connected dot), host controls: add bot (level picker), kick, timer settings, [Bắt đầu] (enabled with ≥2 seats); non-host sees "Đang chờ chủ phòng…". Leave button. The 3D scene shows seated characters as they join.
- **Game HUD** (screen zones — keep them fixed so HUD never covers the table centre):
  - Top bar (≤64px): room code, turn number, menu (rules cheat sheet, log toggle, sound, language, leave).
  - Top-centre phase banner: who is doing what ("Cáo tuyên bố Công tước — Thu thuế"), with a countdown bar/ring (from `deadline`, `phaseDurationMs`, `clockOffset`), turns red under 5s, ticks audibly the last 5s when it's your decision.
  - Right: collapsible game log (≤320px wide) rendered from `game.log` with i18n'd sentences and small character chips.
  - Bottom-centre (≤230px tall): your two cards (big card art; revealed ones greyed with a red X), coin counter, and the **action bar** (7 actions; each shows cost + claimed character chip; disabled with a reason tooltip; "Bắt buộc Đảo chính" state). Targeted actions enter targeting mode: show target buttons (names + coins + influence) and let the player click characters in 3D; Esc cancels.
  - **Response panel** (bottom, above the hand) when `prompt.kind` is `respond_action` / `respond_block`: explains the claim, big [Thách thức] / [Chặn bằng X] (one per blockCharacter) / [Cho qua] buttons + timer.
  - **Lose-influence** modal: choose which card to reveal. **Exchange** modal: pick exactly keepCount of the cards (hand + drawn), highlighted selection, confirm.
  - Others' waiting state: "Đang chờ Heo quyết định…".
  - **Game over** overlay: winner avatar + name, confetti, wins tally, host: [Ván mới] (backToLobby), everyone: [Rời phòng].
  - Toasts (i18n key or text), connection banner when `conn !== 'connected'`.
  - Emote picker (8 emotes, cooldown).
  - Rules cheat sheet modal (the official reference card as a table).
- Keyboard: 1–7 actions, C challenge, B block, P/Space pass, Esc cancel.
- Visual language: chunky rounded "sticker" panels (cream, 3px ink outline, hard drop shadow `0 5px 0 ink`), bold Baloo 2 headings, Nunito body, playful micro-animations (press-down buttons, wobble on hover), bright accents (coral/teal/mustard/violet). Card colours follow Coup: Duke violet, Assassin charcoal, Captain blue, Ambassador green, Contessa red.
- Audio: WebAudio-synthesised SFX (coin clink, card flip, whoosh, challenge sting, block thud, tick, win fanfare, elimination), respecting `ui.muted`. Triggered from bus `events`.

### 4.2 3D scene (`client/src/scene`)
- One persistent `<Canvas>` (mounted for home/lobby/game). `dpr={[1, 1.75]}`, drei `PerformanceMonitor` + a DPR governor (scene/dprGovernor.ts): lower dpr to 1 on a real decline, restore when frames recover, back off if oscillating, and undo the drop when lowering did not help (e.g. 50 Hz displays / capped browsers), `gl={{ antialias: true, powerPreference: 'high-performance' }}`, ACES tone mapping, sRGB.
- **Sunny Tavern**: round wooden table with bright emerald felt, warm wooden floor, turquoise walls with big windows (bright sky, sun shafts), bar counter + shelves with colourful bottles (instanced), string lights, plants, hanging lamps. Warm golden-hour sun (one shadow-casting directional light, shadow map ≤1024, tight frustum) + hemisphere light.
- **Seats**: up to 6 around the table. The local player sits at the camera (first-person, not rendered as a body; their 2 cards lie on the felt in front of the camera). Others are placed around the far arc by relative seat order (turn order clockwise). Spectator/home: slow orbit camera; lobby: elevated view of the table with joined players seated.
- **Characters**: chunky cartoon animals (pig, fox, bulldog, bunny, frog, bear, cat, owl) built from primitives (no external assets), toon-ish material, seated on chairs. Idle: breathing bob, blinking, head follows the current actor. Reactions: lean in when acting, shake on losing influence, happy bounce on winning a challenge, elimination → slump + desaturate + little ghost/"X" eyes (Liar's Bar vibe, but cute). Bot seats show a small antenna/badge; disconnected seats show a "zzz"/wifi-off icon.
- **Table objects**: each player's 2 cards face-down in front of them (revealed cards flip face-up with the character art and stand up facing the local seat, greyed, so dead characters stay readable), coin stacks (InstancedMesh, one mesh for all coins) that animate when coins move (arc fly between player ↔ treasury ↔ player), treasury pile + court deck in the centre (deck height follows deckCount).
- **In-world labels** (drei `Html`, ≤ 1 per seat + bubbles): nameplate (name, coins, hidden-card count, bot/offline badge) with a countdown ring when that player must decide; speech bubbles for claims ("Tôi là Công tước!", "Thách thức!", "Chặn!"), emotes.
- **Interaction**: in targeting mode (`ui.targeting`), valid targets glow + cursor pointer; click → `api.move({type:'action', action, targetId})`; hover sets `ui.hoverPlayerId`. Active actor gets a warm spotlight/ring.
- **Performance budget**: ≤150 draw calls, ≤150k triangles, no per-frame React state updates (mutate refs in `useFrame`), shared geometries/materials, textures created once (cache), no postprocessing, `frameloop="always"` but avoid work when idle.

## 5. Quality bar
- `npm run typecheck` clean, `npm test` green, `npm run build` succeeds.
- Engine: exhaustive unit tests per rule + a fuzz test (thousands of random legal games) with invariants: coins conserved (players + treasury = 50), 15 cards conserved (hands + deck + exchange draw), phaseSeq monotonic, game terminates, no hidden info in views/log.
- Bots: never produce illegal moves (fuzz against the engine), win rate hard > normal > easy in simulations, always challenge impossible claims.
- Server: integration tests with real socket.io clients: create/join/bots/start/full bot game/reconnect/takeover/leave/rejoin-with-key/timeouts.
