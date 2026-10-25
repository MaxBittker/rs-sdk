# Grand Exchange market data

The game server serves the market dashboard at **`/market`** and the public,
read-only JSON API below. Use the **game HTTP origin**, not the gateway's port.
Local development normally uses `http://localhost:8888`.

Buying, selling, cancelling and collecting are in-game operations. Walk beside a
**Grand Exchange table** on the west (left) side of Varrock west bank
(the existing bank table at **3180,3443**, one tile wide and two tiles north–south; stand at **3181,3443**), or the
**Grand Exchange teller** beside it at **3181,3445**. Click **Exchange** on either.
Both operate on the ground floor. Ordinary bank booths only provide banking. Bring coins
or items in your backpack. Banks are never read or written by the exchange.

## Availability and server configuration

GE is enabled by default. Set `GE_ENABLED=false` in the **engine's** environment
and restart to disable it; set `GE_ENABLED=true` and restart to re-enable it.
No map or client rebuild is needed. Disabled worlds restore the original bank table, hide the teller and market link,
and reject trading and public market reads.

`GET /api/market/status` returns `{ "enabled": false, "message": "Grand Exchange is not available on this server." }`
(or `{ "enabled": true }`). It does not open the market database. Use
`await sdk.getGEAvailability()` or `await market.status()` to check without a bot
connection. MCP `read_market` supports `operation: "status"` too.

On a disabled server, `bot.openGE()` and other GE actions return
`{ success: false, reason: 'ge_unavailable', message: 'Grand Exchange is not available on this server.' }`
before walking or dispatching. Public reads throw `GEUnavailableError` with the
same `reason`; HTTP market routes return 503 with `reason: "ge_unavailable"`.
Network failures remain errors, not claims that GE is disabled.
`getGEState()` still returns `null` when no exchange is open; use the availability
method to distinguish a closed interface from a disabled exchange.

Existing offers, escrow and history are retained while GE is off and become
accessible again when re-enabled. Existing `GE_DATABASE` player checkpoints stay
in use for save/recovery, preventing rollback or duplicated carried assets across
restarts. Keep that database with the world's saves. A world that has never used
GE does not create a market database while disabled.

## SDK

```ts
import { MarketClient } from './sdk/market';
const market = new MarketClient('http://localhost:8888');
const search = await market.items('logs', { limit: 25, offset: 0 });
const quote = await market.item(1511);
const history = await market.history(1511, {
    from: Date.now() - 7 * 24 * 60 * 60 * 1000,
    to: Date.now(),
    interval: 3600000,
});
```

On an existing `BotSDK`, the same calls are available as:

```ts
await sdk.getMarketItems('rscim', { sort: 'relevance' }); // Rune scimitar
await sdk.getMarketItems('logs', { sort: 'buyValue', days: 7 });
await sdk.getMarketItem(1511, { days: 30 });
await sdk.getMarketHistory(1511);
```

These methods need no connected bot and send no game actions. `BotSDK` uses its
configured `browserLaunchUrl` origin when present, otherwise its usual game URL
(remote gateway origin, or localhost:8888 for local development). For a different
local game port use `MarketClient` or set `browserLaunchUrl` explicitly.
Credentials and URL query strings are stripped before market requests.

## Agent trading API

Public market reads are separate from your private exchange session. Only
`openGE()` travels: it walks to Varrock west bank, then uses the normal **Exchange**
interaction on whichever of the table or teller is reachable, trying the other if the
first does not open. It never demands one exact tile, so a crowded stand tile does not
stop it, and it skips the walk entirely when a table or teller is already in reach.

The other actions still need an open exchange, but they will **reopen** one from a table
or teller already in reach — enough to survive a stray dialog closing the interface
mid-sequence. They never travel to do it: away from Varrock west bank they fail with
`reason: 'no_interface'` as before. Reopening starts a new session, so inspect
`getGEState().offers` rather than assuming a pre-close draft survived.

The game server rechecks proximity, ground floor, session and player readiness for every
action; raw SDK calls cannot bypass these checks. Banks are not used automatically.

```ts
const opened = await bot.openGE();
if (!opened.success) throw new Error(opened.message);

const placed = await bot.placeGEOffer({
    item: 1511, side: 'buy', quantity: 10, price: 20,
    // slot: 0, // optional, zero-based; defaults to first empty slot
});
if (!placed.success) {
    console.log(placed.reason, placed.outcome, placed.message);
    // If outcome is 'unknown', inspect sdk.getGEState() before retrying.
    // Never blindly repeat a confirmation that may have been applied.
} else {
    console.log(placed.offer); // accepted offer; it may still be unfilled
}
```

| Method | Result/evidence |
|---|---|
| `sdk.getGEState()` | Private offers, IDs/slots, fills, collectible balances, current screen/draft, search results, error and latest receipt; `null` outside an open exchange or on an older client |
| `bot.searchGE(query, side = 'buy')` | Opens a free slot's catalogue and waits for the acknowledged query; sell results are restricted to carried items |
| `bot.placeGEOffer({item, side, quantity, price, slot?})` | Verifies the exact draft, confirms once, and returns the server-accepted offer |
| `bot.cancelGEOffer(offerId)` | Cancels only the remainder; uses the persistent offer ID, not the slot |
| `bot.collectGEOffer(offerId, notes = true)` | Collects one offer and reports actual item/coin additions |
| `bot.collectGE()` | Collects all available claims as notes and coins |
| `sdk.sendGESearch(query)` | Low-level native search packet; dispatch only |

`GEActionResult.success` for placement means the offer was accepted, not that a
counterparty filled it. Completion and cancellation do not free a slot until all
claims are collected. A successful collection may report zero, and inventory
limits leave claims in the exchange. `state.offers` exposes what remains.
The actions do not retry confirmation, cancellation or collection automatically.
A timeout/disconnect after dispatch can return `outcome: 'unknown'`; reconnect,
reopen the exchange and inspect the offer list before deciding what to do next.
Use one controller/action sequence per bot. `closeInterface()` explicitly exits;
incidental-dialog dismissal preserves GE sessions.

Actions use the game's existing component/count handlers. Item selection by
canonical ID uses the retained numeric selector; typed catalogue search uses the
same `MARKET_SEARCH` packet as the browser. The server sends one complete private
snapshot after UI updates using a hidden `IF_SETTEXT` component (client code
30403), decoded by both clients. Its named controls avoid hardcoded pack IDs.
This requires rebuilding the content cache and clients together. Older clients
remain able to use the visual UI but do not support these high-level actions.

## MCP without taking control

Use `get_market` for public research. It requires `origin` and `operation`
(`items`, `item`, `history`), with `query`, `item_id`, `days`, `sort`, pagination
or history bounds as appropriate. It never connects, launches a browser or
pre-empts a controller. Example arguments:

```json
{"origin":"http://localhost:8888","operation":"items","sort":"buyValue","days":7,"limit":25}
```

The MCP resource list includes this guide. Trading still uses `execute_code`
with the `bot.*` methods above. `bot.trade()` is player-to-player trade, not GE.

## HTTP API

All endpoints accept **GET only**, return JSON, and allow cross-origin reads.
No authentication is required. Responses may be cached for five seconds.

| Endpoint | Parameters | Result |
|---|---|---|
| `/api/market/items` | `q` fuzzy name/alias query, max 80 chars; `limit` 1–100 (default 25); `offset` 0–100000 (default 0) | `{ items: MarketQuote[], total, offset, limit }` |
| `/api/market/items/{id}` | Canonical, unnoted tradeable item ID | `MarketQuote` |
| `/api/market/items/{id}/history` | `from`, `to`: Unix milliseconds; `interval`: 3600000 (hour) or 86400000 (day) | `{ item, from, to, interval, history }` |

The list and item endpoints also accept `days=1|7|30|90` (default `7`).
The list accepts `sort=relevance|name|name-desc|recent|rises|falls|marketCap|price|volume|value|buyValue|sellRecent`
(default `relevance` when searching, `name` otherwise). Rankings apply before pagination;
`rises`/`falls` include only positive/negative changes with trades in the period.
`price` ranks by last unit price, `volume` by units traded, and `value` by gross
trade value. `buyValue` ranks the current open buy book by the sum of remaining
quantity × bid price for each item, including items without completed trades.
This value is independent of `days` and excludes filled and cancelled quantities.
`sellRecent` lists items with open sell offers, newest listing first; like
`buyValue` it describes the current book and ignores `days`.
Search filters the chosen ranking. The response also includes
`days`, `sort`, `updatedAt`, a market-wide `summary` (`volume`, `gross`,
`activeItems`, `totalItems`), and the most-traded `featured` item, or `null`.

For these requests, `volume`, `gross`, `tax`, `trades` and `vwap` cover the chosen
period. Additional fields are `referencePrice` (last execution before the
period), `change` (last price minus reference), and `changePercent`; these are
`null` without a comparison price. `marketCap` is **current listed sell quantity
× last execution price**, not total circulating value; it is `null` without a
trade price. Open quotes and last execution price always describe current data.

The game and API share the same search matcher. It accepts partial words, small
typos and common aliases: `rscim` → Rune scimitar, `addy pl8` → Adamant platebody,
`mith scim` → Mithril scimitar, `blue dhide` → Blue dragonhide items, and `lobbies`
→ Lobster. Exact names rank first; every query word must match. Short queries
use prefix matching; longer words allow one or two edits, including adjacent
letter transpositions. Explicit name sorts preserve matching but order A–Z/Z–A.
Aliases only find eligible existing items; they never add later-era equipment.

History defaults to the last 30 days in daily buckets. Ranges are `[from, to)`,
up to 366 days and 1000 buckets. Buckets align to UTC epoch boundaries; boundary
buckets include only trades inside the requested range. Periods with no trades
are omitted, never filled with invented prices or volume.

### Quote fields

| Field | Meaning |
|---|---|
| `id`, `item`, `name` | Canonical item ID (both IDs match) and display name |
| `basePrice` | Existing item definition's value, used only to prefill a first offer; **not a market price** |
| `bid`, `ask` | Highest open buy limit / lowest open sell limit; `null` if absent |
| `buyQuantity`, `sellQuantity` | Remaining quantities in open offers |
| `buyValue` | Total gp committed to unfilled open buy offers, at each offer’s bid price |
| `sellValue` | Total gp asked for unfilled open sell offers, at each offer’s ask price |
| `lastSellAt` | Creation time of the newest open sell offer (Unix ms), or `null` |
| `lastPrice`, `lastTradeAt` | Most recent execution price and Unix milliseconds, or `null` |
| `volume` | Actual item units exchanged in the selected period (7 days by default) |
| `gross`, `tax`, `trades` | Selected-period gross coins, coins burned, and number of matched fills |
| `vwap` | Selected-period quantity-weighted average price; `null` without trades |

Each history bucket has `time`, `volume`, `gross`, `tax`, `low`, `high`, `vwap`,
and `trades`. Prices are per item, before seller tax. Volume counts each item
once, not once for each side. No account names, offer owners or player saves
are exposed. Quotes can change before a player reaches the table.

Errors return `{ "error": "..." }`: `400` invalid parameters, `404` unknown or
ineligible item, `405` unsupported method, `503` temporary market failure.

## In-game workflow

1. Click **Exchange** on the Grand Exchange table or teller in Varrock west bank.
2. Click **Buy** or **Sell** in an empty offer slot. Type a name or alias (up to
   48 characters); the thumbnail grid filters as you type. Use **Sort** to cycle
   best match, A–Z and Z–A, **Clear search** to reset, or page controls to browse.
   Click an item thumbnail or name to select it. Sell lists only items in your
   backpack, including banknotes. Enter filters immediately; Escape closes.
3. The offer form shows the item model, description and total. Click the quantity
   or price field to type an exact value, or use the ± buttons and quantity
   shortcuts. **All** appears only on sell offers and selects all carried items.
   Price shortcuts offer ±5% and **Guide**
   (last trade price, or the item-definition value before the first trade).
4. Review the total and **Confirm offer**. Funds/items enter escrow immediately.
5. Use **Offers** to inspect the twelve-slot grid (scroll for the bottom rows). Open offers update automatically
   when trades fill or collection balances change; no refresh is required. Item
   icons, quantities, unit prices and progress bars summarize each offer. Click a slot to collect
   items from the visual collection panels using **Collect** or **Collect as notes**,
   or **Cancel remainder** while the offer is open. The top
   **Collect** button collects available claims from all slots as notes and coins.

The 5% seller fee is deducted automatically. The main form emphasizes the item,
quantity, price and total; a small proceeds estimate accounts for the fee.

Matching also works while an owner is offline. Unfilled offers persist without
expiry. Cancellation returns unfilled assets to collection, not directly to the
backpack. Partial fills and price-improvement refunds can be collected while an
offer remains open. Full backpacks/coin stacks leave the excess in collection.
Finished or cancelled slots are freed only after all claims are collected.

The SDK can drive these existing in-game component/count actions, but there is
intentionally no remote trade or bank-transfer HTTP endpoint.
