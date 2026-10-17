# Grand Exchange maintenance

The Grand Exchange is a custom backport for the Lost City 274 server.
For player instructions, trading rules and the public API, see
[the market guide](../sdk/MARKET.md). The dashboard is served by the game server
at `/market`.

## Implementation

| Part | Files |
|---|---|
| Matching, transactions, snapshots, history | `server/engine/src/engine/market/MarketStore.ts` |
| Tradeable catalogue, notes and shared fuzzy matching | `server/engine/src/engine/market/{MarketCatalog,ItemSearch}.ts` |
| Native search keyboard and result selection | `server/webclient/src/client/MarketSearchInput.ts`, `Client.ts`, lite component dispatch; `MarketSearch` packet/model/decoder/handler |
| Native UI and inventory adapter | `server/engine/src/engine/market/GrandExchange.ts` |
| Interface, reused bank table/teller and placements | `server/content/scripts/interface_bank/`, interface/loc/npc manifests, `maps/m49_53.jm2` |
| Engine hooks | `GE_OPEN(coord)` script opcode, native button/count handlers, World tick for offer updates, Player save/load |
| Read-only web/API | `server/engine/src/web/pages/market.ts`, `public/market.html`, web route and navigation |
| SDK | `sdk/market.ts`, `sdk/ge-actions.ts`, `sdk/ge-types.d.ts` and methods in `sdk/index.ts` / `sdk/actions.ts` |

Reuses `IF_OPENMAIN_SIDE`, `UPDATE_INV_FULL`, `INV_BUTTON1`, `IF_SETTEXT`,
`IF_BUTTON` and `P_COUNTDIALOG`. The standard
and bot/lite clients receive these existing messages. While the exchange is open,
a transmitted backpack sidebar offers a left-click Sell action. Clicking an item
opens a sell draft in the selected empty slot (or the first free slot), combines
loose items and notes, and defaults to the quantity owned. No items leave the
backpack until Confirm. Sell quantity buttons stop at the amount owned, and
manual quantities above it are rejected. Typed search sends the bounded
`MARKET_SEARCH` client packet (243): ASCII query (max 48 characters) and selected
item ID (0 means filter). No new server-to-client packet is introduced.
Keyboard input stays in the field and is debounced by 180 ms; Enter flushes it.
Selections carry the displayed item ID and acknowledged query, and the server
checks both against its current result page, preventing stale-result selection.
The standard/bot clients handle typing; lite component clicks also resolve the
actual displayed item. Table and teller triggers both pass their coordinate to
`GE_OPEN`. Sessions accept only the table/NPC anchors, check the
two-tile footprint or teller adjacency, and require the ground-floor interior.
The west-wall bank table keeps its original model, rotation and collision footprint;
only that table gains Exchange. Normal bank booths keep their banking options.
Disabling GE restores the table’s original type and hides the teller. All state-changing UI clicks recheck the
active interface, session, floor, distance and player readiness on the server.

## Persistence and operation

The Bun server creates `data/market.sqlite` automatically (override with
`GE_DATABASE`). It uses SQLite WAL, `synchronous=FULL`, immediate transactions,
parameterized queries and indexes. Do not place this database on ephemeral
storage. This is a **single game-world process** design, not a shared multiworld
exchange; do not point multiple running game worlds at one ledger.

Fly sets `GE_DATABASE=/opt/server/data/market.sqlite` in `fly.toml`, placing the
ledger and its WAL files on the same persistent volume as player saves.

Placement and collection synchronously mutate the actor's real backpack inside
a ledger transaction. Their complete serialized player save is committed in
the same transaction as offer/claim changes. Failed transactions restore the
in-memory backpack. Counterparties' inventory is never remotely modified:
only their escrow claims change. Cancellation is an idempotent ledger-only
transaction.

Placement and collection checkpoint online players and pending logout saves in
the same transaction. Autosaves, reconnects and logouts use the same world-wide
checkpoint boundary, including first-time players. Loading prefers ledger saves
over login-service saves, making the ledger authoritative for bystanders as well
as traders. Saving one participant after an ordinary trade cannot advance only
that participant's recovery state.

Save version 8 includes player-owned temporary escrow (trade, duel, party-chest,
death-kept items and unclaimed rewards). Taking a snapshot never closes another
player's interface or changes their live inventory. On recovery these items
return to the backpack, then the bank (notes are unnoted there). Stack/capacity
overflow remains saved and is retried while the player is idle. Display-only
crafting inventories are excluded. Version 7 saves remain readable; an older
server cannot read version 8 saves, so rollback requires a compatible build.
Transient NPC, ground-item and shop state is not persisted by the exchange.

Collect-all transfers all six slots in one transaction and checkpoints the world
once. Empty collections and collections blocked entirely by inventory capacity
do not serialize or checkpoint players. A failed batch restores all its claims
and inventory additions.

**Operational consequences:** back up the ledger and its player checkpoints
with the rest of the world. Use SQLite's backup API or stop the world before
copying/checkpointing WAL files. Never independently restore an old ledger or
old player saves. Offline tools that patch only `.sav` files will not override
a ledger checkpoint. Account deletion/renaming and rollback procedures must
include the ledger. Do not delete `market.sqlite` to disable the feature: that
would strand escrow and discard authoritative checkpoints.

## Build and validation

From the repository root:

```sh
# If you changed custom content, update the pack checksums first
# (server/PATCHES.md, "Pack checksums").
(cd server/engine && bun run build)
(cd server/webclient && bun run build)
bun run test:market:integration
bun run check
(cd server/engine && bunx tsc --noEmit)
bun run docs:api:check
```

The integration script creates a temporary ledger and disposable in-memory
players. It loads the real packed map and scripts, checks the actual table,
runs the table and both teller triggers, verifies collision/reachability and
SDK footprint agreement, tests live fill updates, exercises the search packet decoder/handler (including
stale/invalid selections), clicks through native server handlers, sells noted
logs, matches a second player, verifies collection/tax/save recovery, and checks
public API responses. Unit tests exercise matching priority, asset conservation,
partial fills and refunds, limits, ownership, full inventories, rollback,
restart persistence and quantity-weighted history. No test funds or offers are
inserted into the production market.

Visual checks use disposable fixtures and write generated images to the ignored
`screenshots/grand-exchange/` directory at the repository root:

```sh
(cd server/engine && bun test/market-preview.ts)
(cd server/engine && bun test/market-location-preview.ts)
```

Before a release, exercise normal browser clients through login, trading,
cancellation, full backpacks and restart recovery, and rehearse a coordinated
backup restore. Measure all-player checkpoint cost and public reads under load.
Automated handler tests do not cover the complete browser/socket/tick loop.

The protocol regression test checks missing interface components without losing
packet alignment. Optional SDK metadata is skipped when absent. Rebuild content
and clients together, and reload existing browser tabs after cache changes.
`file-stream.test.ts` covers same-build reads after packed-file writes so map
CRCs and `ondemand.zip` use the updated bytes.

## Research and historical choices

Inspected the supplied [2009scape repository](https://gitlab.com/2009scape/2009scape)
at commit `9f634148bab11fad821943864cb71d7c6af98da4`:

- [GrandExchange.kt](https://gitlab.com/2009scape/2009scape/-/blob/9f634148bab11fad821943864cb71d7c6af98da4/Server/src/main/core/game/ge/GrandExchange.kt): sorts counterparties by best
  price, crosses compatible limits, uses the older offer's price, gives buyers
  price-improvement refunds, and supports partial completion.
- [GrandExchangeOffer.kt](https://gitlab.com/2009scape/2009scape/-/blob/9f634148bab11fad821943864cb71d7c6af98da4/Server/src/main/core/game/ge/GrandExchangeOffer.kt): persists independent offers and
  item/coin claims for later collection.
- [GrandExchangeInterface.java](https://gitlab.com/2009scape/2009scape/-/blob/9f634148bab11fad821943864cb71d7c6af98da4/Server/src/main/content/global/handlers/iface/ge/GrandExchangeInterface.java): offer-selection and collection flows.

These are behavioral references; this implementation is newly written in
TypeScript/SQL and does not copy the reference's Java/Kotlin source. The
reference repository's license is AGPL-3.0. It also has explicit artificial
market stock and bots: those are intentionally absent here.

This implementation follows the familiar GE offer lifecycle and matching
behavior, rather than claiming an exact recreation of any one historical year.
Deterministic price/time priority uses an increasing offer ID to break ties.
For example, a resting sell of ten logs at 10 gp matched by a new buy at 20 gp
consumes 100 gp, returns 100 gp to the buyer, and yields 95 gp to the seller.
A resting buy at 20 gp instead executes at 20 gp when a seller offers 10 gp.

Intentional departures: the user-requested 5% tax; collection only at this
physical location; six slots for every account; no historical guide-price
bands, membership slot tiers, four-hour buy limits, inactivity expiry or set
exchange. Public bid/ask depth totals are more transparent than the original
GE. The native interface is deliberately simpler than the 2007/2009 artwork.
