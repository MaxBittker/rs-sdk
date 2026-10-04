# BotSDK

SDK for controlling bots and reading game state.

## CLI

Dump world state for a connected bot:

```bash
bun sdk/cli.ts <username> <password> [--server <host>]
```

Send or read chat without taking control of the bot (uses an `observe`-mode
connection: observers may send `say` and nothing else, and never pre-empt the
bot's controller):

```bash
bun sdk/chat.ts <botname> "message"     # send
bun sdk/chat.ts <botname>               # recent chat
bun sdk/chat.ts <botname> --watch       # tail live
```

Examples:

```bash
# Demo server (default)
bun sdk/cli.ts mybot secret

# Local server
bun sdk/cli.ts mybot secret --server localhost

# Via env vars
USERNAME=mybot PASSWORD=secret SERVER=localhost bun sdk/cli.ts
```

Output:

```
# World State
Tick: 15095 | In Game: true

## Player
Name: Max (Combat 17)
Position: (2965, 3374) Level 0
In Combat: Man HP: 6/7
  -> Dealt 3 damage (2 ticks ago)

## Skills
Attack: 34 (4,400 xp)
Defence: 1 (0 xp)
...

## Inventory
- Bronze sword x1 [Wield]

## Nearby NPCs
- Man (Lvl 2) HP: 6/7 [in combat] - 1 tiles [Talk-to, Attack]
...
```

## Reporting SDK Bugs

When the SDK has a bug or rough edge, first find a workaround, then file a report. One command, no auth needed:

```bash
bun sdk/bug-report.ts "incorrect results from bot.foo(), had to use raw sdk.sendFoo() instead for xyz reason."
```

Important note: The game itself is extremely well tested and complete, it's not buggy. If you can't figure out how to do something, don't blame the game, blame your assumptions and keep investigating. File a bug report _after_ you figure out
what's going on, don't just assume the game is broken because you got confused, and give up. The SDK is a thin layer on top of the game, and the game is the source of truth.

After filing the bug, keep working on your goal!

## Programmatic Usage

Create a script file (e.g., `my-bot.ts`):

```typescript
import { BotSDK } from "./sdk";
import { BotActions } from "./sdk/actions";

const sdk = new BotSDK({
  botUsername: "mybot",
  password: "secret",
  gatewayUrl: "wss://rs-sdk-demo.fly.dev/gateway",
});

await sdk.connect();
console.log("Connected!");

// Wait for game state
await sdk.waitForCondition((s) => s.inGame, 30000);

// Create high-level bot actions wrapper
const bot = new BotActions(sdk);

// Get player info
const player = sdk.getState()!.player!;
console.log(`Player: ${player.name} at (${player.worldX}, ${player.worldZ})`);

// High-level actions (wait for effects to complete)
await bot.chopTree(); // Waits for logs in inventory
await bot.burnLogs(); // Waits for Firemaking XP
await bot.walkTo(3200, 3200); // Uses pathfinding, waits for arrival

// Low-level actions (return on game acknowledgment)
await sdk.sendWalk(3200, 3200, true);
await sdk.sendInteractNpc(npc.index, 1);
```

Run with Bun:

```bash
bun my-bot.ts
```

### Opening a Browser Client

To actually see your bot in-game, open a browser to the bot client URL:

```
https://rs-sdk-demo.fly.dev/bot?bot=mybot123&password=test
```

Or launch programmatically with Puppeteer:

```typescript
import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();
await page.goto("https://rs-sdk-demo.fly.dev/bot?bot=mybot123&password=test");
```

## Connection Configuration

| Option          | Default       | Description                                          |
| --------------- | ------------- | ---------------------------------------------------- |
| `botUsername`   | required      | Bot to control (max 12 chars)                        |
| `password`      | required      | Gateway authentication                               |
| `gatewayUrl`    | -             | Full WebSocket URL (e.g. `wss://server.com/gateway`) |
| `host`          | `'localhost'` | Gateway hostname (ignored if gatewayUrl set)         |
| `port`          | `7780`        | Gateway port (ignored if gatewayUrl set)             |
| `actionTimeout` | `30000`       | Action timeout in ms                                 |
| `autoReconnect` | `true`        | Auto-reconnect on disconnect                         |

### Direct gateway

For `rs-sdk-demo.fly.dev`, `connect()` and the lite runner first try the
gateway's own port, `wss://rs-sdk-demo.fly.dev:7443`. State frames arrive
compressed (about 6x smaller), and nothing is relayed through the game server.
If that port doesn't answer within 3 seconds they use
`wss://rs-sdk-demo.fly.dev/gateway` as before. Set `GATEWAY_DIRECT=false` to
skip the check.

### Private gateway for a fleet

If your lite runners and the scripts that control them run on one machine, run
the gateway there too. Bot state then stays on that machine and only game
traffic goes to the server.

```bash
cd server/gateway && bun install
GATEWAY_HOSTNAME=127.0.0.1 LOGIN_SERVER=false bun gateway.ts   # ws://127.0.0.1:7780
```

Add `GATEWAY_URL=ws://127.0.0.1:7780` to each bot's `bot.env`. The lite runner,
`runScript` scripts, `sdk/cli.ts`, `sdk/chat.ts` and the MCP server all honor
it. With `LOGIN_SERVER=false` the gateway accepts any password, so keep it on
`127.0.0.1`. Bots in a browser tab always use the game server's `/gateway`, and
bots on a private gateway don't appear in the server's public `/status`.

## Two-Layer API

### Plumbing (BotSDK)

Low-level protocol mapping. Actions resolve when the game **acknowledges** them.

```typescript
await sdk.sendWalk(x, z, running);
await sdk.sendInteractLoc(x, z, locId, option);
await sdk.sendInteractNpc(npcIndex, option);
await sdk.sendShopBuy(slot, amount);
```

### Porcelain (BotActions)

Domain-aware API. Actions resolve when the **effect** is complete.

```typescript
await bot.chopTree(); // Waits for logs OR tree disappears
await bot.burnLogs(); // Waits for Firemaking XP
await bot.buyFromShop(); // Waits for item in inventory
await bot.walkTo(x, z); // Uses pathfinding, waits for arrival
```

## State Access

```typescript
// Full state
const state = sdk.getState();

// Specific queries
const skill = sdk.getSkill("Woodcutting");
const item = sdk.findInventoryItem(/logs/i);
const npc = sdk.findNearbyNpc(/chicken/i);
const tree = sdk.findNearbyLoc(/^tree$/i);

// Subscribe to updates
sdk.onStateUpdate((state) => {
  console.log("Tick:", state.tick);
});

// Wait for conditions
await sdk.waitForCondition((s) => s.inventory.length > 5);
```

## Connection Monitoring

```typescript
sdk.onConnectionStateChange((state, attempt) => {
  if (state === "reconnecting") {
    console.log(`Reconnecting (attempt ${attempt})...`);
  }
});

// Wait for connection
await sdk.waitForConnection(60000);
```

## Architecture

```
┌─────────────────┐       ┌─────────────────┐
│  Your Script    │       │  Remote Server  │
│  ┌───────────┐  │       │  ┌───────────┐  │
│  │ BotActions│  │       │  │  Gateway  │  │
│  └─────┬─────┘  │       │  │   :7780   │  │
│        │        │       │  └─────┬─────┘  │
│  ┌─────┴─────┐  │ ws:// │        │        │
│  │  BotSDK   │──┼───────┼────────┤        │
│  └───────────┘  │       │  ┌─────┴─────┐  │
└─────────────────┘       │  │ Web Client│  │
                          │  └───────────┘  │
                          └─────────────────┘
```

## Example Script

See `bots/_template/script.ts` for a complete starter example, or create a new
bot with `bun bots/create-bot.ts <username>` and run its generated script:

```bash
bun bots/<username>/script.ts
```

## Grand Exchange

GE can be disabled by the server (`GE_ENABLED=false`). Check
`await sdk.getGEAvailability()`; GE actions return `reason: "ge_unavailable"`
with a clear message when disabled, and public market reads throw `GEUnavailableError`.

Use `sdk.getMarketItems`, `sdk.getMarketItem`, and `sdk.getMarketHistory` for public
prices and volume. See [MARKET.md](MARKET.md) for the HTTP API, standalone
`MarketClient`, and in-game trading instructions. All trading and collection
happen at Varrock west bank. Use `bot.openGE()`, `bot.placeGEOffer()`,
`bot.cancelGEOffer()`, `bot.collectGEOffer()` and `bot.collectGE()` for verified
trading, and `sdk.getGEState()` for your offers and collectible balances.
MCP agents can read prices with `get_market` without connecting a character.
