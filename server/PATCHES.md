# Vendored-Tree Monkeypatch Checklist

`server/{engine,content,webclient}` are vendored copies of upstream LostCity (rev 274).
Every local modification ("monkeypatch") is listed here with a verification step.
**Walk this checklist after every vendor sync/rebase** — history shows patches don't get
dropped wholesale, they get subtly severed (see "Cross-boundary invariants" below).

How the vendoring works: upstream clones with remotes live at `../repos/{engine,content,webclient}`;
each `vendor-274` branch = upstream tip + ONE squashed "rs-sdk local mods" commit. The systematic
audit (compare the mods commits between old and new vendor branches, file-level + added-line
survival) is described in the project memory; this file is the human-readable checklist.

---

## Engine (`server/engine/`)

### Protocol / custom packets
- [ ] **Global chat broadcast** — `MessagePublicHandler.ts` broadcasts public chat to all
      players outside the 14-tile overhead range via custom `MESSAGE_PUBLIC` packet
      (opcode **255**, variable length). Pieces: `ServerGameProt.ts` (opcode),
      `ServerGameProtRepository.ts` (binding), `codec/MessagePublicEncoder.ts` (p8 userhash +
      WordPack), `model/MessagePublic.ts`.
      Verify: `grep -n "MESSAGE_PUBLIC = new ServerGameProt(255" src/network/game/server/ServerGameProt.ts`
      **⚠ MUST pair with the webclient receive branch (see webclient section). An engine-side
      packet with no client handler causes a T1 LOGOUT on the receiving client.**

### Config / environment
- [ ] **`Environment.ts`** — flat back-compat aliases over 274's nested `WorldConfig`, plus
      `migrateFromLegacyEnv(loadWorldConfig(), process.env)` overlay so fly.io `[env]` vars win
      over `world.json`. Also `NODE_WS_ONDEMAND` **defaults true** (274 client streams assets
      over the game WS; false ⇒ stalls at ~60% "Connecting to update server").
- [ ] **`WorldConfig.ts`** — default `web.port = 8888` on all platforms; `xpRate = 25`.
- [ ] **`World.ts`** — connection timeouts relaxed for bot background tabs
      (`TIMEOUT_NO_CONNECTION` 5m / `TIMEOUT_NO_RESPONSE` 10m, gated by `NODE_DEBUG_SOCKET`).

### Database
- [ ] **Bun sqlite dialect** — `src/db/dialect/BunSqliteDialect*.ts` (3 files) + runtime chooser
      in `src/db/query.ts` (`typeof Bun !== 'undefined'` → bun:sqlite, else upstream's
      `node:sqlite`). Upstream is node-primary; **Bun does not implement `node:sqlite`** —
      without this the engine won't boot under bun.

### Web layer (mostly rs-sdk-only files, but `src/web.ts` is a 3-line shim — on conflict keep the shim)
- [ ] **`src/web/`** modular split: `websocket.ts` (`/gateway` WS proxy → gateway on :7780,
      `isAgentProxy`), `pages/api.ts` (`/api/exportCollision` — must read the in-engine TS
      routefinder, NOT the removed WASM; discovers mapsquares from maps **zip ∪ dir**;
      `/api/screenshot`), `pages/client.ts` (serves `view/bot.ejs` at `/` and `/bot`),
      `pages/hiscores.ts` + `src/web/hiscoresServer.ts` + `src/hiscores.ts` (custom hiscores;
      **profile query param XSS-sanitized**), `pages/screenshots.ts`, `pages/static.ts`.
- [ ] **`view/bot.ejs`** — the entire bot UI page (rs-sdk-only): reads `?bot=`/`?password=`
      (auto-login), **writes both back to the URL on login/field-change**, cache-busted
      `client.js?v=<%= cachebust %>` import, quick-login/create/skip-tutorial controls.
- [ ] **Login server** — `LoginServer.ts`: `sdk_auth` message handler (gateway auth path,
      username normalized to match engine); `LoginThread.ts`: **no auto-grant of dev
      staffmodlevel on non-production worlds** (public server safety).

### Gameplay / safety
- [ ] **XP curve** — `entity/Player.ts` `getExpByLevel` table: delta uses `level/10.0`
      (custom curve), table stored in ×10 "fine" units (`Math.floor(acc/4) * 10`), L99 =
      10,701,400. **Duplicated in webclient — keep in sync (see below).**
- [ ] **`PlayerLoading.ts`** — clamp loaded levels to base levels.
- [ ] **Anti-grief removals** — `MessagePrivateHandler.ts` / `ReportAbuseHandler.ts`: upstream's
      automated 2-day bans REMOVED (bots trip them).
- [ ] **Random events toggle** — `ScriptOpcode.ts` + `DebugOps.ts`: `MAP_RANDOM_EVENTS` opcode
      backed by `NODE_RANDOM_EVENTS` env (paired with content `engine.rs2`, see content section).
- [ ] **`[LOGOUT DEBUG]` instrumentation** — console.warn breadcrumbs in
      `NetworkPlayer.ts`, `IdleTimerHandler.ts`, `ClientCheatHandler.ts`, `PlayerOps.ts`,
      `World.ts` (and webclient `Client.ts`). Low-stakes but useful; fine to re-add lazily.
- [ ] **Choice-dialog resume guard** — `handler/ResumePauseButtonHandler.ts` ignores a bare
      RESUME_PAUSEBUTTON while `player.resumeButtons` is non-empty (a pending `p_choice`
      would otherwise resolve from stale `last_com`, silently re-picking the player's last
      clicked option — bots re-declined the Al Kharid toll forever);
      `handler/IfButtonHandler.ts` clears `resumeButtons` when a registered option resumes
      the script. Verify: `HEADLESS=true bun sdk/test/alkharid-gate-choice-resume.ts`.

### Assets
- [ ] `public/img/skill/*` (19 files), `public/img/*`, favicons, hiscores images —
      restored after upstream website migrations deleted them. Verify pages render with images.
- [ ] `tools/pack/PackAll.ts` `packOnDemandZip()` — regenerates `data/pack/ondemand.zip`
      (snapshot of cache idx1–4) at the end of `packAll()`. Existed upstream in the 254 era,
      dropped in 274. Serves the hiscores ItemViewer at `/ondemand.zip`; without it, newly
      packed item models render as blank hiscores icons. Verify: after `bun run build`,
      `unzip -l data/pack/ondemand.zip` includes the highest model id in `content/pack/model.pack`.

---

## Webclient (`server/webclient/`)

### Bot bridge (wholly added — `src/bot/`, 8 files + `src/client/BotClient.ts`, `src/viewer/ItemViewer.ts`)
- [ ] `StateCollector.ts`, `BotOverlay.ts`, `ActionExecutor.ts`, `GatewayConnection.ts`,
      `OverlayUI.ts`, `formatters.ts`, `types.ts`, `index.ts`.
      Note: **gateway state messages come from `BotOverlay.sendState()`** (includes
      `allComponents`/`componentId`), not `StateCollector.collectDialogState` (basic fallback).
      `GatewayConnection` reads `?bot=`/`?password=` **at page load** for gateway registration.

### Client.ts bot SDK surface (~1,450 added lines inside upstream's `src/client/Client.ts`)
- [ ] Bot methods: `autoLogin`, `getDialogOptions`/`getDialogText`/`getChatInterface`/
      `captureDialogToHistory`/`debugDialogComponents`, `findNpcByName`, `talkToNpc`,
      `interactNpc/Loc/Player`, `acceptCharacterDesign` (**must send IDK_SAVEDESIGN AND the
      CC_ACCEPT_DESIGN IF_BUTTON**), `setTargetedFramerate`, etc.
- [ ] **Walk-before-op**: `interactLoc`, `talkToNpc`, `interactNpc`, `interactPlayer` ALL call
      `tryMove(..., type=2)` before writing OPLOC/OPNPC/OPPLAYER. 274's
      `clientRoutefinder=true` means the SERVER DOES NOT PATHFIND to interaction targets —
      a missing tryMove = "I can't reach that!" from 2+ tiles.
- [ ] **`MESSAGE_PUBLIC` receive branch** (pairs with engine broadcast): `ptype ===
      ServerProt.MESSAGE_PUBLIC` → g8 userhash + `WordPack.unpack(psize - 8)` →
      `addChat(2, ...)`. Plus `src/io/ServerProt.ts`: `MESSAGE_PUBLIC = 255` and size-table
      entry `-1` at index 255.
      Verify: `grep -n "ServerProt.MESSAGE_PUBLIC" src/client/Client.ts` (a receive `if`, not
      just the enum).
- [ ] **XP table** — `Client.ts` `levelExperience`: same `level/10.0` curve but **NO ×10**
      (client receives real xp; engine stores fine xp). Verify both formulas side-by-side after
      any sync touching `Player.ts` or `Client.ts`.
- [ ] **AFK logout extended** to 10 minutes (upstream 90s logs idle bots out).
- [ ] **Renamed-field adaptations** (274): `chatModalId`, `redrawChat`, `sideIcon`,
      `activeIcon`, `redrawSide`, `redrawIcons`, static `Client.loopCycle` — the bot bridge
      accesses some via `as any`, so **`bunx tsc --noEmit` does NOT catch all of these**;
      grep-audit `(client as any).X` accesses after a sync.

### Build / shell
- [ ] **`bundle.ts`** — `BUILD_MODE` standard/bot/both; **terser property mangling OFF**
      (mangling breaks bot.ejs/Puppeteer accessing client members by name).
- [ ] **`GameShell.ts`** — `deltime = 14` (≈30% faster client loop).
- [ ] **`MapView.ts`** — live player-position tracking (`playerPositions`,
      `shouldDrawPlayers`) for the `/mapview/` page; pairs with engine `/playerpositions`.
- [ ] `src/3rdparty/tinymidipcm.js` tweak; `package.json` (bun scripts, deps).
- [ ] **Filename casing**: `src/io/JagFile.ts` (capital F) in webclient vs `src/io/Jagfile.ts`
      in engine. macOS hides case-only renames from git — after a sync run:
      `comm -23 <(git ls-files | sort) <(find . -type f -not -path './.git/*' | sed 's|^\./||' | sort)`
      (the 2 submodule gitlinks are expected hits).

---

## Content (`server/content/`)

- [ ] **`scripts/engine.rs2`** — `[command,map_random_events]` declaration (pairs with engine
      `MAP_RANDOM_EVENTS` opcode — both sides or scripts fail to compile).
- [ ] **`scripts/login_logout/login.rs2`** — random-event timer gated on `map_random_events`.
- [ ] **`scripts/macro events/scripts/macro_events.rs2`** — macro events disabled when off.
- [ ] **`scripts/shop/configs/shop.varp`** — `transmit=yes` on shop varps (bot shop state).
- [x] **README art** — moved out of the vendored tree to `docs/media/` (promo.gif, discord.svg,
      hiscores.svg, task_length.svg); nothing in `content/title/` is locally modified anymore.
- [ ] Smithing arrowheads + telegrab + nails fixes live in content history; they're additive
      and survive rebases, but re-run a smoke test if smithing/magic behaves oddly.

---

## Cross-boundary invariants (how things actually break)

These are the rules derived from every severed-wire bug found so far:

1. **A custom `ServerGameProt` packet MUST ship with its webclient `ptype` receive branch in
   the same commit.** Unhandled game packets hit the client's T1 path → **logout**. (Global
   chat shipped engine-only in `47af85ff7` and silently kicked every out-of-range player on
   chat for a month.) Gateway messages / bot actions / state fields degrade silently;
   game packets do not.
2. **XP curve is duplicated** engine `Player.ts` ↔ webclient `Client.ts` (units differ ×10).
   Change one ⇒ change both.
3. **`MAP_RANDOM_EVENTS`** is duplicated engine opcode ↔ content rs2 command.
4. **BotAction unions are duplicated** `sdk/types.ts` ↔ `server/webclient/src/bot/types.ts`,
   and every action needs an `ActionExecutor` case.
5. **tsc is necessary but not sufficient**: run `bunx tsc --noEmit` in BOTH engine and
   webclient after every sync (esbuild bundles despite TS errors), but `as any` client-field
   accesses and bot.ejs `clientInstance.*` references are invisible to it — grep-audit those.

## Post-sync verification (5 minutes)

```bash
# typecheck both (esbuild hides TS errors)
(cd server/engine && bunx tsc --noEmit) && (cd server/webclient && bunx tsc --noEmit)

# case-only rename check (macOS hides these from git)
comm -23 <(git ls-files | sort) <(find . -type f -not -path './.git/*' | sed 's|^\./||' | sort)

# custom packet pairing
grep -n "MESSAGE_PUBLIC = new ServerGameProt(255" server/engine/src/network/game/server/ServerGameProt.ts
grep -n "ptype === ServerProt.MESSAGE_PUBLIC" server/webclient/src/client/Client.ts

# XP curve parity (compare by eye: same formula, engine has *10, client doesn't)
grep -A2 "Math.pow(2.0, level / 10.0)" server/engine/src/engine/entity/Player.ts server/webclient/src/client/Client.ts

# boot + live endpoints after deploy
curl -so /dev/null -w "%{http_code}\n" https://rs-sdk-demo.fly.dev/{playercount,hiscores,mapview/}

# end-to-end: login a bot, chop a tree 3+ tiles away (exercises walk-before-op),
# have a second distant bot chat (exercises MESSAGE_PUBLIC both directions)
```

If content map files changed: regenerate `sdk/collision-data.json` from the MEMBERS prod server:
`curl https://rs-sdk-demo.fly.dev/api/exportCollision > sdk/collision-data.json`
