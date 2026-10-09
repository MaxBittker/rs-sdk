# Lite client

A headless RS289 client. Same protocol, same game state, no browser and no
rendering — built so many bots fit on one machine.

## Why

Today each bot is a Chromium tab running the full 3D client: software
rasterizer (`dash3d/Pix3D.ts`, `Model.ts`), scene graph, minimap, fonts, sound.
The bot bridge then scrapes state out of that live client. All of the rendering
work is thrown away.

Measured, 8 bots in one Bun process on an M-series laptop:

```
marginal cost   13.8 MB per bot
cpu             3.4% of one core for all 8  (0.42%/bot)
startup         ~1.2s warm  (~2.0s cold, first run builds the world index)
```

## How compatibility is guaranteed

`LiteClient` is not a reimplementation of the bot API — it's a **façade** with
the same ~54 methods and ~36 fields the bridge reads off the browser `Client`.
That means `src/bot/StateCollector.ts` and `src/bot/ActionExecutor.ts` run
against it **unmodified**, so `BotWorldState` is produced by the very same code
in both clients rather than by two implementations that have to be kept in
agreement.

Verified: the real `BotStateCollector`, pointed at a `LiteClient`, returns a
complete `BotWorldState` — player, skills, inventory, equipment, nearby
npcs/players/locs, ground items, dialog, interface, shop, bank, prayers,
combat style, chat.

## Layout

| File | Role |
| --- | --- |
| `session.ts` | entry point: bootstrap → login → packet loop → typed end reason |
| `LiteClient.ts` | the façade the bot bridge talks to |
| `cache.ts` | fetch + unpack `config` / `interface` / `wordenc` (290KB) |
| `net/GameConnection.ts` | socket, RSA/ISAAC login handshake |
| `protocol/incoming.ts` | packet framing + dispatch |
| `protocol/entities.ts` | PLAYER_INFO / NPC_INFO bit decoders |
| `protocol/zone.ts` | ground items, server loc changes |
| `world/LocIndex.ts` | whole-world loc + terrain index from `/ondemand.zip` |
| `world/SceneLite.ts` | `World`-shaped façade (`sceneType`/`wallType`/…) |
| `world/CollisionBuilder.ts` | build-area `CollisionMap`, collision half of `ClientBuild` |
| `movement.ts` | `tryMove` BFS + `MOVE_*` packets |
| `actions.ts` | the interaction/accessor surface |
| `interfaces.ts` | per-client copy-on-write view of `IfType.list` |
| `dom-shim.ts` | ~70 lines so browser modules import under Bun |

## Correctness strategy

The browser client is the specification, so wherever possible it is used as an
**oracle** rather than as something to imitate carefully.

`world/CollisionBuilder.test.ts` runs the browser's own `ClientBuild` in
collision-only mode (`loadLocations`/`finishBuild` both accept `world: null`) and
asserts the resulting `CollisionMap.flags` are **byte-identical** to ours across
five regions x four levels. That single assertion covers the whole pathing stack:
`movement.ts` is a verbatim port of `Client.tryMove` operating on those flags, and
`testWall`/`testWDecor`/`testLoc` are the client's own methods — so identical
flags mean identical routing decisions.

It earns its keep. It caught, with the tile and flag named:

- upper-level locs missing entirely, because `ClientBuild.lowMem` defaults to
  `true` while the engine serves the bot client `lowmem=0`;
- the build-area border ring, which `loadLocations` clips and we did not;
- the ground-decor `loc.active` bug, as a 1752-tile diff at `(1,9)`.

Two gaps this shape of test does not close, worth knowing:

- **Staleness, not wrongness.** The door bug was a correct map rebuilt too late.
  Guard those with the structural rule below, not with a golden test.
- **Runtime divergence.** The server is itself an oracle and talks constantly:
  it reports your true tile every `PLAYER_INFO`, and says "I can't reach that!"
  when your reach maths disagreed with its own. Counting those per loc-shape
  would surface systematically wrong shape handling across a whole fleet.

**Structural rule.** The door bug's root cause was two independently-mutated
stores for one fact. Keep a single source of truth (`SceneLite.overlay`) and make
everything else a *derived cache* that is invalidated, never edited in parallel.
`collisionDirty` + `ensureCollision` is that pattern; prefer rebuilding a derived
structure over patching it, so it cannot drift.

## What it does not do

- **No rendering**, so no screenshots. `projectTileToScreen` and friends return
  `null` (the bridge only uses them to draw a click marker).
- **No OnDemand.** Models, animations, textures and music are never fetched.
  Map data is read once from `/ondemand.zip` at index build time.
- **No minimenu.** `menuActions` exists in the browser-side `BotWorldState` but
  the SDK never reads it, and it's the one genuinely render-derived field.

## Divergences worth knowing

- **Unknown packets are skipped, not fatal.** The browser client logs out on an
  opcode it has no branch for. Here we consume `ServerProtSizes[op]` bytes and
  move on. This is safe *only* because the size table is authoritative — a
  custom engine packet added without a `ServerProtSizes` entry desynchronises
  both clients equally. See `PATCHES.md` cross-boundary invariant #1.
- **A throwing handler is not fatal either, but a burst of them is.** Same
  argument: the body is fully consumed before `dispatch` runs, so one bad packet
  is dropped and the loop keeps reading (`handlePacket`). Twenty throws inside
  500 cycles means the client's own state has diverged rather than one packet
  being odd, and `LiteClient.recordDispatchError` ends the session so a
  supervisor can restart it. `packet-errors.test.ts` covers both halves.
- **Sessions always end loudly.** `stopped` resolves with a `SessionEnd`
  (`stopped` / `logged-out` / `disconnected` / `idle` / `error`) and `onEnd` fires
  with the same, so a supervisor can tell "finished" from "died" — `swarm.ts`
  re-logs a bot in with backoff, `runner.ts` exits non-zero. Anything other than
  `stopped` is a death. The `idle` case is a socket that is nominally open but
  has heard nothing for ~60s; the engine writes PLAYER_INFO to every player every
  tick, so silence that long is a dead socket that never sent a FIN.
- **Entity positions are snapped, not interpolated.** `LiteClient.snapEntities`
  puts `x`/`z` on `routeX[0]`/`routeZ[0]` each tick instead of easing a few
  units per frame. Cheaper, and strictly more accurate for a bot.
- **Runtime loc changes (doors) are handled, but lazily.** `LOC_ADD_CHANGE` /
  `LOC_DEL` update `SceneLite`'s overlay immediately, so `nearbyLocs` is correct
  at once. The `CollisionMap` the router uses is a separate structure, so it is
  marked dirty and rebuilt on the next routing call (`LiteClient.ensureCollision`).
  A full rebuild is ~15ms, too much per packet in a busy zone, so N loc changes
  between two routes cost one rebuild and a bot that never routes pays nothing.
  The browser client instead patches collision flags incrementally
  (`Client.locChangeUnchecked`); rebuilding from the overlay can't drift out of
  sync over a long session, which matters more here than the latency.
- **A sent op is not an accepted op.** Not lite-specific — it bites the browser
  client identically — but it bites a swarm hardest, because a fleet making zero
  progress still looks perfectly healthy. The engine refuses ops it will not run
  (player mid-action, npc gone or not visible, invalid option) by answering
  `UNSET_MAP_FLAG` and nothing else, and a blocking modal makes it accept the op
  and never run the trigger. Gate every send on an observed effect, preferring
  the first `mes` the content script prints over the final outcome. `dispatch`
  counts the unsets into `state.opFeedback` like the browser client does, which
  is the closest thing to a rejection ack that exists.
- **Never discard a written packet.** `p1Enc` has already consumed an ISAAC
  value, so resetting `out.pos` desynchronises the cipher for everything after
  it. Write only what you intend to send.
- **Interface state is per client, because the statics are not.** `IfType.list`
  is a static array whose components the interface packets mutate in place. Each
  browser tab is its own realm, so there it belongs to one `Client`; N
  `LiteClient`s share one module registry, so unguarded they would write their
  inventories, banks, shops and dialog text into the same objects and read back
  whichever bot's packet landed last — silently. `interfaces.ts` gives each
  client a copy-on-write reference table (11k slots, ~88KB; only components the
  server actually writes get cloned), and `LiteClient.activate()` repoints the
  static.

  **Do not call `activate()` by hand, and do not construct a `BotStateCollector`
  or `ActionExecutor` yourself** — both read `IfType.list` directly. Every
  `LiteClient` method activates on entry (a prototype wrapper at the bottom of
  `LiteClient.ts`, so methods that don't exist yet are covered too), `dispatch()`
  activates before touching a packet, and the client owns the collector/executor
  behind `collectBotState()` / `executeBotAction()`. Go through those and it is
  correct by construction. New packet handlers must write via `c.ifMutable(id)`
  rather than `IfType.list[id]`; `interfaces.test.ts` drives the real dispatch
  path, so a handler that forgets fails the test.
- **So is the frame counter.** `Client.loopCycle` (the `LoopCycle` box in
  `client/LoopCycle.ts`) is module state for the same reason, so a shared one
  would advance once per cycle *per bot* — N× too fast for any single bot, which
  scales every age measured in cycles: chat-line age, `dialogHistory[].tick`, and
  the `combatCycle = cycle + 400` windows `StateCollector` reads to decide
  whether a player or npc is fighting. Each client owns a `cycle` counter
  instead; lite code reads `c.cycle.value` and never the `LoopCycle` box, so this
  needs no activation. `cycles.test.ts` covers it.

## Usage

```ts
import { startSession } from '#/lite/session.js';

const s = await startSession({
    host: 'rs-sdk-demo.fly.dev',
    username,
    password,
    // Anything other than 'stopped' means the bot left the game on its own.
    onEnd: end => console.warn(`session over: ${end.reason}`)
});
s.client.walkTo(3222, 3218, true);
s.client.flush();
// ...
s.stop();
const { reason } = await s.stopped;
```

Benchmark: `bun src/lite/bench.ts 8` (expects `bots/litetest1..N`).
