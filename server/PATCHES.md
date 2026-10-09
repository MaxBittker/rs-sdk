# Vendored-Tree Monkeypatch Checklist

`server/{engine,content,webclient}` are vendored copies of upstream LostCity (rev 289, upgraded
from 274 on 2026-10-09; branches `289` in each upstream repo).
Every local modification ("monkeypatch") is listed here with a verification step.
**Walk this checklist after every vendor sync/rebase** — history shows patches don't get
dropped wholesale, they get subtly severed (see "Cross-boundary invariants" below).

How the vendoring works: upstream clones with remotes live at `../repos/{engine,content,webclient}`;
each `vendor-289` branch = upstream tip + ONE squashed "rs-sdk local mods" commit (`vendor-274`
is kept as the previous era's backup). The systematic
audit (compare the mods commits between old and new vendor branches, file-level + added-line
survival) is described in the project memory; this file is the human-readable checklist.

---

## Engine (`server/engine/`)

### Protocol / custom packets
- [ ] **Global chat broadcast** — `MessagePublicHandler.ts` broadcasts public chat to all
      players outside the 14-tile overhead range via custom `MESSAGE_PUBLIC` packet
      (opcode **255**, variable length; still free after 289 reshuffled every opcode). Pieces: `ServerGameProt.ts` (opcode),
      `ServerGameProtRepository.ts` (binding), `codec/MessagePublicEncoder.ts` (p8 userhash +
      WordPack), `model/MessagePublic.ts`.
      Verify: `grep -n "MESSAGE_PUBLIC = new ServerGameProt(255" src/network/game/server/ServerGameProt.ts`
      **⚠ MUST pair with the webclient receive branch (see webclient section). An engine-side
      packet with no client handler causes a T1 LOGOUT on the receiving client.**

- [ ] **Custom opcodes vs upstream renumbering** — every revision bump reshuffles BOTH opcode
      tables (289 changed nearly every value). After a sync, confirm server opcode 255 and
      client opcode 243 are still unused in upstream's `ServerGameProt`/`ClientGameProt`
      (and webclient `ServerProt`/`ClientProt`), and that `ServerProtSizes[255] === -1`.

### Config / environment
- [ ] **`Environment.ts`** — flat back-compat aliases over 274's nested `WorldConfig`, plus
      `migrateFromLegacyEnv(loadWorldConfig(), process.env)` overlay so fly.io `[env]` vars win
      over `world.json`. Also `NODE_WS_ONDEMAND` **defaults true** (274 client streams assets
      over the game WS; false ⇒ stalls at ~60% "Connecting to update server").
- [ ] **`WorldConfig.ts`** — default `web.port = 8888` on all platforms; `xpRate = 25`.
- [ ] **400-char chat** — `WorldConfig.ts` default `node.maxMessageLength = 400` (classic 80).
      Paired pieces, all required: `wordenc/WordPack.ts` caps follow
      `Environment.node.maxMessageLength` (not hardcoded 80) AND clamps packed output to
      240 bytes (`truncateToByteBudget` — all chat frames carry a 1-byte length; 2-nibble
      chars would overflow it and corrupt the stream); `MessagePublicHandler.ts` /
      `MessagePrivateHandler.ts` use `Packet.alloc(1)` not `alloc(0)` (packed chat can be
      ~250 bytes; the 100-byte tier throws RangeError mid-cycle and kicks the player).
      Mirrors in webclient (see below) and SDK chunking (`sdk/index.ts` packedNibbles).
      Verify: `grep -n "maxMessageLength: 400" src/util/WorldConfig.ts && grep -n "alloc(1)" src/network/game/client/handler/MessagePublicHandler.ts`
- [ ] **`World.ts`** — connection timeouts relaxed for bot background tabs
      (`TIMEOUT_NO_CONNECTION` 5m / `TIMEOUT_NO_RESPONSE` 10m, gated by `NODE_DEBUG_SOCKET`).
- [ ] **`World.ts` tick drift cap** — `cycle()` clamps `nextTick` to at most 2 ticks of
      backlog before computing `drift`, so the world resumes normal pacing after sustained
      overload instead of sprinting through the whole backlog at max speed.
      Verify: `grep -n "start - this.tickRate \* 2" src/engine/World.ts`

### Old-client guidance (rs-sdk)
- [ ] **Outdated-client record** — `World.ts` login: on a revision mismatch, `noteOutdatedClient()`
      decodes the rest of the login block (identical across revisions) for the username and keeps
      `{revision, at}` in `World.outdatedClients` (30 min TTL); a correct-revision login clears it.
      Management port `/outdated-client?username=` exposes it (port 8898, not published by fly).
      Gateway `sdk_connect`: when the bot has no live client, it asks that endpoint and answers
      `sdk_error` naming the fix — old SDK checkouts print gateway errors, so this is the one hint
      that reaches people who haven't pulled. Public `/api/version` (`web/pages/api.ts`) returns
      `{revision}`; the lite runner (`session.ts`) checks it first and throws `OutdatedClientError`
      (a `LoginError` code 6) — runner/swarm exit **3** so supervisors stop restarting.
      Verify: `curl localhost:8888/api/version` and `curl 'localhost:8898/outdated-client?username=x'`.

### Database
- [ ] **Bun sqlite dialect** — `src/db/dialect/BunSqliteDialect*.ts` (3 files) + runtime chooser
      in `src/db/query.ts` (`typeof Bun !== 'undefined'` → bun:sqlite, else upstream's
      `node:sqlite`). Upstream is node-primary; **Bun does not implement `node:sqlite`** —
      without this the engine won't boot under bun.
- [ ] **SQLite WAL + busy_timeout** — `src/db/query.ts` runs
      `journal_mode=WAL; synchronous=NORMAL; busy_timeout=10000` on every connection.
      Each worker thread has its own connection; without WAL a logger write burst
      (telemetry compaction) blocked login queries and took prod logins down after the
      2026-08-03 deploy. Paired: LoggerServer first-compaction delay 15min
      (past the reconnect storm) + 10ms pause between compaction groups, and the
      gateway auth timeout is 15s (must outlast busy_timeout). WAL adds
      `db.sqlite-wal/-shm`; file-copy backups must checkpoint first.

### Web layer (mostly rs-sdk-only files, but `src/web.ts` is a 3-line shim — on conflict keep the shim)
- [ ] **Upstream web server is Fastify since 289** (`src/web.ts`, `@fastify/*` deps). We keep the
      Bun.serve shim and do NOT carry the fastify deps or `tsx` in `package.json`. Port anything
      new from upstream's `web.ts` by hand — 289 added `OnDemand.onClientClosed(client)` to the WS
      close handler, mirrored in `src/web/websocket.ts` (without it OnDemand's client map leaks).
- [ ] **`WSClientSocket.ts` keeps our API**: `new WSClientSocket()` + `init(socket, addr)` (the
      socket only exists after Bun's `open`), per-tick output batching (`beginBatch`/`endBatch`,
      `flush`, `discard`) and the **1s delayed close**. Upstream 289 moved to
      `constructor(socket, addr)` and immediate close (its 289 client drains buffered bytes after
      a remote close). `TcpClientSocket.close()` also keeps the 1s delay — reconnect closes the old
      socket before ownership moves, and `test/fixtures/reconnect-lifecycle.ts` asserts that close
      can't detach the replacement. On conflict keep ours.
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
- [ ] **Lava Maze runite hiscores** — content `mining.rs2` (`get_ore_normal`) calls the
      `runite_mined(loc_coord)` command (declared in `engine.rs2`) whenever it gives runite
      ore; `RUNITE_MINED` opcode (10011) in `ScriptOpcode.ts`/`ScriptOpcodePointers.ts`, handler
      in `DebugOps.ts` counts only the two Lava Maze rocks (0_3059_3885, 0_3060_3884, from
      `m47_60.jm2`) → `World.notifyRuniteMined` → `runite_mine` relay cases in
      `LoggerThread.ts`/`LoggerClient.ts`/`LoggerServer.ts`, `runite_mine` table (both prisma
      schemas + `db/types.ts`), `/hiscores/runite` page in `web/pages/hiscores.ts`
      (registered in `web/index.ts` + `web/hiscoresServer.ts`). Depends on the logger
      pipeline (EASY_STARTUP or a standalone `bun run logger`) — events are silently
      dropped without it. Replaced King of the Hill (migration `20260926000000_runite_mine`
      drops `koth_capture`).
      Verify: `grep -n "runite_mined" ../content/scripts/skill_mining/scripts/mining.rs2 && grep -n "RUNITE_MINED" src/engine/script/handlers/DebugOps.ts`
- [ ] **Equipment hiscores sprites** — `LoginServer.ts` `outfitAppearance()` stores the worn
      outfit's resolved appearance slots (wearpos2/3 masking needs obj config) in
      `hiscore_outfit.appearance` (migration `20260926010000_hiscore_outfit_appearance`) on every
      outfit hiscore write; `/hiscores/outfit` shows a `/sprite/player` image for the top 10 and
      `/sprite/item` icons (no in-browser viewer bundle). Sprites come from `web/sprites/`
      (worker hosting webclient `src/viewer/ItemViewer.ts` `renderPlayerSprite`).
- [ ] **Hiscore playtime tiebreak** — `hiscore.playtime`/`hiscore_large.playtime` (migration
      `20260208000000_hiscore_playtime_and_outfit`); boards rank level desc, playtime asc.
      `LoginServer.ts` `updateHiscores()` stamps playtime only when a row's **level** changes
      (XP-only changes keep it), so it means "playtime when this level was reached" — restamping
      on every logout pushed maxed players down for continuing to play. Quest points (type 100,
      `updateQuestHiscore()`) follows the same rule.
      Verify: `grep -n "existing.level === totalLevel ? existing.playtime" src/server/login/LoginServer.ts`
- [ ] **Worker-thread crash hardening** — `src/server/InternalClient.ts` uses persistent
      `.on('close'/'error')` handlers instead of `.once()` (a second ws error after a
      successful open was an unhandled EventEmitter 'error' that killed the worker → every
      later `postMessage` threw mid-cycle → whole world shut down; this was the "engine
      dies ~40s into a bot session" local failure). `World.ts` constructor and `app.ts`
      easyStartup block attach 'error'/'exit' listeners to every Worker so the dying
      thread is named in the log.
- [ ] **Choice-dialog resume guard** — `handler/ResumePauseButtonHandler.ts` ignores a bare
      RESUME_PAUSEBUTTON while `player.resumeButtons` is non-empty (a pending `p_choice`
      would otherwise resolve from stale `last_com`, silently re-picking the player's last
      clicked option — bots re-declined the Al Kharid toll forever);
      `handler/IfButtonHandler.ts` clears `resumeButtons` when a registered option resumes
      the script. Verify: `HEADLESS=true bun sdk/test/alkharid-gate-choice-resume.ts`.


### Grand Exchange (rs-sdk)
- [ ] **Physical market** — `src/engine/market/{MarketStore,MarketCatalog,GrandExchange}.ts`,
      `GE_OPEN(coord)` opcode in `ScriptOpcode.ts` / `DebugOps.ts`, native `IfButtonHandler` and
      `ResumePCountDialogHandler` hooks. Paired content: `engine.rs2` command, dedicated
      `grand_exchange_booth`/`grand_exchange_teller` configs and triggers, `grand_exchange.if`,
      append-only interface/loc/npc packs and `interface.order`. Map `m49_53.jm2`
      reuses the west-wall bank table at 3180,3443 (original model, rotation and
      collision) and places the teller at 3181,3445. Disabling GE restores the
      original bank table. Ordinary bank booths remain banking-only.
      `World.processPlayers` calls `tickExchange` to push changed offers; preserve this
      with the visual offer form (there is no visible refresh button).
      Repack with `BUILD_VERIFY=false` after custom content changes.
- [ ] **Thumbnail search** — shared `ItemSearch.ts` aliases/fuzzy ranking; native search
      components with client codes 30400–30402, 30410–30421 and 30440–30451.
      `MARKET_SEARCH` client opcode **243**, length -1, must match engine
      `ClientGameProt`/repository/decoder/handler and webclient `ClientProt`.
      Payload: `pjstr(query)` then `p2(item)` (0 filters; positive selects a shown
      canonical ID). Max query 48 ASCII characters; server requires a physical
      session and matching current query/page. `Client.ts` keyboard and click hooks
      use `MarketSearchInput.ts`; lite component clicks resolve displayed IDs too.
      Rebuild standard and bot clients. No new server-to-client packet.
      Verify `item-search.test.ts`, `bot/MarketSearchInput.test.ts` and the integration.
- [ ] **Atomic recovery** — `Player.save()` checkpoints into the market ledger;
      `PlayerLoading.load()` prefers that snapshot over stale login-service saves.
      Placement/collection checkpoint all online players in the same SQLite transaction
      to cover items handed between players since an autosave. Preserve both hooks.
      `data/market.sqlite` (or `GE_DATABASE`) is authoritative durable data, including
      player checkpoints; back it up with the world, never independently delete/restore it.
- [ ] **Market web and SDK** — `web/pages/market.ts` registered in `web/index.ts`,
      `public/market.html`, `view/bot.ejs` Market link; `sdk/market.ts` and three
      `BotSDK.getMarket*` methods. API is GET-only and exposes no player identities.
      Verify: root `bun test server/engine/test/market.test.ts sdk/test/market-client.test.ts`,
      then `bun run test:market:integration` with built content. Full design/operations:
      `docs/grand-exchange.md`; API: `sdk/MARKET.md`.

### Custom content IDs
Upstream pack ids mirror each revision's cache: they don't grow within a revision (274's maxima were
unchanged across 77 upstream commits) but jump at every revision bump, and upstream also *names*
placeholder ids over time (`varp_357/358` became `boardgames_varbit3/4` in 289). Our configs either
sit in a **reserved range above any upstream revision** (never renumber) or at the pack tail
(renumber on every revision bump). The packers write gaps as empty entries.

Reserved (fixed since 289; upstream `377-wip` tops out at interface 18785 / varp 724):
- [ ] **Interfaces 40000+** — GE `grand_exchange` root **40000** … `grand_exchange_side:inv` **40495**
      (`interface.pack` + same ids appended to `interface.order`). Free: the interface format lists
      component ids explicitly, so the gap costs no bytes. Ids must stay below 65535 (the format's
      root marker). Add new custom interfaces after 40495.
- [ ] **Varps 1000+** — `pvp_death_mark` **1000**. Saves store varps by id, so a fixed id means no
      more save migrations. Cost: per-player `vars`/`varsString` arrays are sized to the max id.
      `PlayerLoading.load` still moves a value found at **358** (its 274 id) to `pvp_death_mark`;
      safe because 289's varp 358 is temp-scoped and never saved. Keep that shim until no pre-289
      saves remain (prod saves + `market.sqlite` checkpoints).
- [ ] Numeric reserved ids outside content: `sdk/actions.ts` `NEVER_AUTO_CLOSE` (40000) and
      `sdk/test/ge-actions.test.ts`. Engine code resolves GE components by name (`Component.getId`).

Tail-appended (renumber at each revision bump):
- [ ] `loc.pack` `grand_exchange_booth` **5116** (274: 4671). Not reserved high: the engine allocates a
      `LocType` per id, so 30000 would mean ~25k empty objects in prod heap.
- [ ] `npc.pack` `grand_exchange_teller` **1596** (274: 1359). Can't go high: 289's NPC_INFO sends the
      type in 11 bits (max 2047); 377 widens to 13 bits but has 3851 npcs, so it collides then anyway.
- [ ] `maps/m49_53.jm2` references both **numerically** (`0 44 51: 5116 10 1`, NPC section
      `0 45 53: 1596`) — update with the packs. Neither id is persisted anywhere.

Upgrade hazards:
- [ ] **Asset debugnames get renamed upstream** (289 renamed ~3.5k models, plus idk/seq/npc/interface
      names; ids stayed stable). Our configs reference names: `grand_exchange.loc` model
      `furniture_banktable` (274: `model_loc_590`), `grand_exchange.npc` `man_*`/`chat_male_head_shorthair`
      (274: `model_NNN_idk`). Map old→new through the id in `pack/model.pack`; the build fails loudly
      on a missing name.
- [ ] `Player.save()` also checkpoints into `data/market.sqlite` `accounts`, and `load()` prefers that
      row — a save-format experiment on a throwaway name leaves a row there; delete it after.
- [ ] `quest_mortton/.../razmire_keelgan.rs2` building store: our anti-buyback sell price **650**
      combined with upstream 289's 4% haggle fix → `~openshop(razmirebuildingstore, 650, 1050, 40, ...)`.

### Assets
- [ ] **`FileStream.write`** — update `packed[archive][file]` after changed writes, so
      same-pass version-list CRCs and `ondemand.zip` see the new map/model bytes.
      Verify `bun test server/engine/test/file-stream.test.ts` from the root.
- [ ] `public/img/skill/*` (19 files), `public/img/*`, favicons, hiscores images —
      restored after upstream website migrations deleted them. Verify pages render with images.
- [ ] `tools/pack/PackAll.ts` `packOnDemandZip()` — regenerates `data/pack/ondemand.zip`
      (snapshot of cache idx1–4) at the end of `packAll()`. Existed upstream in the 254 era,
      dropped in 274. Serves the hiscores ItemViewer at `/ondemand.zip`; without it, newly
      packed item models render as blank hiscores icons. Verify: after `bun run build`,
      `unzip -l data/pack/ondemand.zip` includes the highest model id in `content/pack/model.pack`.

---

## Webclient (`server/webclient/`)

### Lite client (wholly added — `src/lite/`, headless bot client; see `src/lite/README.md`)
- [ ] `src/lite/**` is rs-sdk-only and has no upstream counterpart — it should survive
      a sync untouched. It **consumes** vendored modules though (`config/*Type`,
      `dash3d/Client{Player,Npc,Obj}`, `dash3d/CollisionMap`, `io/{Packet,Isaac,JagFile,
      ClientStream,ServerProt,ClientProt}`, `wordfilter/*`), so a decode change upstream
      lands in both clients — which is the point.
      Verify: `bun src/lite/bench.ts 2` logs in and reports live sessions.
- [ ] **Lite protocol decoder duplicates `Client.ts` packet reads** (`src/lite/protocol/incoming.ts`,
      `entities.ts`, `zone.ts`) and the login handshake (`src/lite/net/GameConnection.ts`
      `CLIENT_VERSION`). Opcode renumbering flows through the shared `ServerProt`/`ClientProt`
      enums, but **layout changes don't**: diff upstream's `Client.ts` read paths every upgrade.
      289 changed `UPDATE_INV_FULL` size `g1`→`g2` and `UPDATE_INV_PARTIAL` slot `g1`→`gsmart`
      (ported). A mismatch desyncs the stream silently or kicks the bot.
- [ ] **`src/io/ClientStream.ts` `isClosed` getter** — 3 added lines exposing
      `dummy || remoteClosed`. The browser client learns a socket is dead by reading from
      it and taking the throw; the lite session loop only reads when `available > 0`,
      which a remotely-closed stream reports as 0 *forever* — so without this the loop
      spins on a dead socket and the session never ends. Consumed by
      `lite/net/GameConnection.isClosed` → `LiteClient.isInGame()`.
      Keep `dummy || remoteClosed` even though 289's `available` now reports buffered bytes after
      a remote close: a partial trailing packet would leave `available > 0` forever.
      Verify: `grep -n "get isClosed" src/io/ClientStream.ts src/lite/net/GameConnection.ts`
- [ ] **`src/client/LoopCycle.ts` + the `Client.loopCycle` accessor pair** — `loopCycle`
      moved out of Client into a one-field module, and `Client.ts` now exposes it as
      `static get/set loopCycle` over that box. Reason: `ClientPlayer.ts` read
      `Client.loopCycle` for one line in `getSequencedModel()`, and that import drags the
      whole 14k-line Client (plus Pix3D, MapView, WebAudio, localStorage) into anything
      touching a ClientPlayer — 212MB of imports for the headless client, vs 21MB after.
      The box stays browser-only state: the lite client keeps a `cycle` counter per
      `LiteClient`, since one counter shared by N bots in a process runs N× fast.
      On conflict: keep the accessor, re-point `ClientPlayer.ts` at `LoopCycle.value`.
      Verify: `grep -n "LoopCycle" src/dash3d/ClientPlayer.ts src/client/Client.ts`
      **⚠ `ClientPlayer.ts` must NOT import `#/client/Client.js`.** An upstream sync that
      restores that import silently re-bloats the lite client; it still runs, so nothing
      fails loudly. Cheap check:
      `bun -e 'import("./src/dash3d/ClientPlayer.js")'` must not need a DOM shim.

- [ ] **400-char chat (webclient half)** — `wordfilter/WordPack.ts` internal clamps raised to
      `MAX_CHARS = 512` (safety bound above the ~509 wire ceiling; the real cap is enforced
      at call sites from the server-configured value) plus the same 240-byte
      `truncateToByteBudget` as the engine copy. `lite/LiteClient.ts` default
      `maxMessageLength` is 400 (lite has no config-injection channel — keep in sync with
      the engine `WorldConfig` default). `lite/runner.ts` honors a `GATEWAY_URL` override
      (bot.env or process env) because SERVER doubles as game origin + gateway address and
      that breaks for `localhost:8888`.
      Verify: `grep -n "MAX_CHARS = 512" src/wordfilter/WordPack.ts && grep -n "?? 400" src/lite/LiteClient.ts`

### Bot bridge (wholly added — `src/bot/`, 8 files + `src/client/BotClient.ts`, `src/viewer/ItemViewer.ts`)
- [ ] `StateCollector.ts`, `BotOverlay.ts`, `ActionExecutor.ts`, `GatewayConnection.ts`,
      `OverlayUI.ts`, `formatters.ts`, `types.ts`, `index.ts`.
      Note: **gateway state messages come from `BotOverlay.sendState()`** (includes
      `allComponents`/`componentId`), not `StateCollector.collectDialogState` (basic fallback).
      `GatewayConnection` reads `?bot=`/`?password=` **at page load** for gateway registration.

- [ ] **`src/dash3d/LoopCycle.ts`** (rs-sdk-only) — the frame counter split out of Client;
      `Client.loopCycle` is now a static getter/setter over it and
      `ClientPlayer.ts` reads `LoopCycle.value` instead of importing Client. Required so
      the viewer bundle (which imports ClientPlayer for character sprites) doesn't
      drag the whole game client (and its node-only `open` dep) in and fail to build.

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
- [ ] **`mapFlagUnsetCount`** — the `UNSET_MAP_FLAG` receive branch increments a counter
      beside `this.minimapFlagX = 0`. It is the only wire evidence that the server refused
      an op (every `Op*Handler` refusal answers with this packet and nothing else), and
      `bot/StateCollector.collectOpFeedback` turns it into `state.opFeedback`. Upstream
      just clears the flag, so a sync silently reverts it — and nothing fails, the signal
      merely goes quiet and bots go back to waiting out timeouts.
      **Pairs with `src/lite/protocol/incoming.ts`**, which must increment the same field.
      Verify: `grep -n "mapFlagUnsetCount" src/client/Client.ts src/lite/protocol/incoming.ts`
      (two files, one increment each), plus `bun test src/bot/StateCollector.test.ts`.
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
      Also replaces upstream's three-area map (`reloadMain/Dungeon/Extra`) with one unified map:
      `MAP_BANDS` stacks overworld (raw mapsquare rows 42–62), underground (142–161 → 63–82) and
      the high-z misc areas (69–77 → 83–91) without overlap; columns 29–56; bounds include one
      padding square per side because the loaders skip edge squares. On conflict keep ours. After
      a content sync, list `content/maps/m*_*.jm2` and confirm every square falls in a band and
      the column range (289 added Ape Atoll at rows 42–43 and its dungeon at 142–143).
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
5. **Tests must not hardcode opcode numbers** — use `ClientProt.*`/`ServerProt.*` (289 broke 11
   literal-opcode assertions in `bot/ClientInteraction.test.ts`; hand-built packets in
   `lite/*.test.ts` also encode packet layouts).
6. **tsc is necessary but not sufficient**: run `bunx tsc --noEmit` in BOTH engine and
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

# custom IDs: reserved ranges still above upstream, tail-appended ones past upstream's max
grep -n "^40000=\|^1000=" server/content/pack/{interface,varp}.pack
grep -n "grand_exchange_booth\|grand_exchange_teller" server/content/pack/{loc,npc}.pack
tail -1 server/content/pack/{loc,npc}.pack

# end-to-end: login a bot, chop a tree 3+ tiles away (exercises walk-before-op),
# have a second distant bot chat (exercises MESSAGE_PUBLIC both directions),
# deposit at a bank + open the GE (exercises inventory packet layouts + custom ids)
```

If content map files changed: regenerate `sdk/collision-data.json` from the MEMBERS prod server:
`curl https://rs-sdk-demo.fly.dev/api/exportCollision > sdk/collision-data.json`
