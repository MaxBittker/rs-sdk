# BotSDK

SDK for controlling bots and reading game state.

## CLI

Dump world state for a connected bot:

```bash
bun sdk/cli.ts <username> <password> [--server <host>]
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

## Programmatic Usage

Create a script file (e.g., `my-bot.ts`):

```typescript
import { BotSDK } from './sdk';
import { BotActions } from './sdk/actions';

const sdk = new BotSDK({
    botUsername: 'mybot',
    password: 'secret',
    gatewayUrl: 'wss://rs-sdk-demo.fly.dev/gateway'
});

await sdk.connect();
console.log('Connected!');

// Wait for game state
await sdk.waitForCondition(s => s.inGame, 30000);

// Create high-level bot actions wrapper
const bot = new BotActions(sdk);

// Get player info
const player = sdk.getState()!.player!;
console.log(`Player: ${player.name} at (${player.worldX}, ${player.worldZ})`);

// High-level actions (wait for effects to complete)
await bot.chopTree();     // Waits for logs in inventory
await bot.burnLogs();     // Waits for Firemaking XP
await bot.walkTo(3200, 3200);  // Uses pathfinding, waits for arrival

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
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();
await page.goto('https://rs-sdk-demo.fly.dev/bot?bot=mybot123&password=test');
```

## Connection Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `botUsername` | required | Bot to control (max 12 chars) |
| `password` | required | Gateway authentication |
| `gatewayUrl` | - | Full WebSocket URL (e.g. `wss://server.com/gateway`) |
| `host` | `'localhost'` | Gateway hostname (ignored if gatewayUrl set) |
| `port` | `7780` | Gateway port (ignored if gatewayUrl set) |
| `actionTimeout` | `30000` | Action timeout in ms |
| `autoReconnect` | `true` | Auto-reconnect on disconnect |



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
await bot.chopTree();      // Waits for logs OR tree disappears
await bot.burnLogs();      // Waits for Firemaking XP
await bot.buyFromShop();   // Waits for item in inventory
await bot.walkTo(x, z);    // Uses pathfinding, waits for arrival
```

## State Access

```typescript
// Full state
const state = sdk.getState();

// Specific queries
const skill = sdk.getSkill('Woodcutting');
const item = sdk.findInventoryItem(/logs/i);
const npc = sdk.findNearbyNpc(/chicken/i);
const tree = sdk.findNearbyLoc(/^tree$/i);

// Subscribe to updates
sdk.onStateUpdate(state => {
    console.log('Tick:', state.tick);
});

// Wait for conditions
await sdk.waitForCondition(s => s.inventory.length > 5);
```

## Connection Monitoring

```typescript
sdk.onConnectionStateChange((state, attempt) => {
    if (state === 'reconnecting') {
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
