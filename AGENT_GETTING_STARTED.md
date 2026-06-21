# RS-SDK Agent Guide

> A step-by-step walkthrough for any AI agent getting started with RS-SDK.
> Follow this guide from top to bottom on your first session.

## What Is This?

RS-SDK is a toolkit for building and operating bots in a RuneScape-style MMO. It includes:

- A **TypeScript SDK** for controlling bots programmatically
- A **game server emulator** (can run locally or connect to the demo server)
- An **MCP server** for real-time interactive bot control from AI agents
- A **script runner** for long-running automation
- A **learnings library** of hard-won knowledge about game mechanics

## The Goal

You're here to build the most efficient RuneScape bot you can. That means:

- **Mastering individual skills** — woodcutting, mining, fishing, combat, smithing, cooking, fletching, magic, and more. Each has its own mechanics, locations, and optimal strategies.
- **Building a library of scripts** — one per skill or task, refined through iteration. Start dumb and simple, then make them smarter: better pathing, inventory management, error recovery, food consumption, banking loops.
- **Leveling your account** — push toward higher levels across all skills. Higher levels unlock better resources, faster XP rates, and new areas.
- **Optimizing for efficiency** — minimize idle time, handle edge cases (doors, dialogs, full inventory), chain skills together (chop logs → fletch bows → sell for gold → buy better gear).
- **Experimenting and discovering** — the game world is complex. Find the best training spots, figure out NPC shop mechanics, map out walking routes, and document everything in `learnings/` so future sessions don't repeat mistakes.

Think of it as a progression: your first script will be a clumsy 30-second woodcutting loop. Eventually you'll have a suite of polished scripts that can grind any skill, manage banking, navigate the map, and handle every interruption the game throws at you.

The [leaderboard](https://rs-sdk-demo.fly.dev/hiscores) ranks bots by highest total level per lowest playtime — so raw efficiency matters.

---

## Step 1: Install Dependencies

```bash
bun install
```

That's it. The project uses [Bun](https://bun.sh) as its runtime.

## Step 2: Choose Your Server

You have two options:

### Option A: Demo Server (Easiest)

Connect to the public demo server — no setup required. Just create a bot and go. Your `bot.env` should include:

```
BOT_USERNAME=mybot
PASSWORD=secretpass
SERVER=wss://rs-sdk-demo.fly.dev
```

> ⚠️ The demo server doesn't guarantee uptime or data persistence. Hold your accounts lightly.

### Option B: Local Server (Full Control)

Run everything locally. Character state resets on server restart, but you have full control.

**Start the services:**

```bash
# Terminal 1: Game engine
cd engine && WEB_PORT=8080 bun run src/app.ts

# Terminal 2: Gateway
cd gateway && bun run gateway.ts
```

**First time only — build the web client:**

```bash
cd webclient && bun run build
mkdir -p engine/public/client engine/public/bot
cp out/bot/* ../engine/public/bot/
cp out/standard/* ../engine/public/client/
```

Your `bot.env` for local play should **NOT** set `SERVER`:

```
BOT_USERNAME=mybot
PASSWORD=secretpass
SHOW_CHAT=false
```

## Step 3: Create Your Bot

```bash
# Pick a name (max 12 chars, alphanumeric)
bun scripts/create-bot.ts mybot

# Or auto-generate a random name
bun scripts/create-bot.ts
```

This creates `bots/{username}/` with:

| File | Purpose |
|------|---------|
| `bot.env` | Login credentials |
| `lab_log.md` | Session notes template |
| `script.ts` | Ready-to-run starter script |

## Step 4: Log In Via Browser

**This is required before any scripts will work.**

1. Open `http://localhost:8080/` (local) or the demo server URL in a browser
2. Log in with the bot's username and password from `bot.env`
3. Leave the browser tab open — it acts as the bot's game client

The SDK communicates through the browser client via a gateway. No browser = no bot.

## Step 5: Skip the Tutorial

New characters start in a tutorial area that blocks normal gameplay. Skip it immediately:

```bash
bun bots/{username}/script.ts
```

The default starter script handles this. Or via MCP:

```typescript
await bot.skipTutorial();
```

## Step 6: Check Your Bot's State

```bash
bun sdk/cli.ts {username}
```

This prints position, inventory, skills, nearby NPCs/objects — everything you need to decide what to do next.

---

## How to Control Your Bot

### MCP Tools (Interactive / Exploratory)

Use MCP for quick checks, experiments, and one-off actions:

```typescript
// Check state
execute_code({ bot_name: "mybot", code: "return sdk.getState();" })

// Try an action
execute_code({ bot_name: "mybot", code: `
  const tree = sdk.findNearbyLoc(/^tree$/i);
  if (tree) await bot.chopTree(tree);
  return sdk.getInventory();
`})
```

### Scripts (Long-Running Automation)

For grinding sessions, write a script file:

```typescript
// bots/mybot/woodcutter.ts
import { runScript } from '../../sdk/runner';

await runScript(async (ctx) => {
  const { bot, sdk, log } = ctx;
  const endTime = Date.now() + 5 * 60_000;
  let count = 0;

  while (Date.now() < endTime) {
    await bot.dismissBlockingUI();
    const tree = sdk.findNearbyLoc(/^tree$/i);
    if (tree) {
      const r = await bot.chopTree(tree);
      if (r.success) count++;
    }
  }

  log(`Chopped ${count} logs`);
  return { count };
}, { timeout: 6 * 60_000, disconnectAfter: true });
```

Run it:

```bash
bun bots/mybot/woodcutter.ts
```

**Rule of thumb:** MCP for exploring, scripts for grinding.

---

## The SDK at a Glance

There are two layers:

| Layer | Object | Description |
|-------|--------|-------------|
| **High-level** | `bot.*` | Actions that wait for completion — `chopTree()`, `walkTo()`, `attackNpc()`, `openBank()` |
| **Low-level** | `sdk.*` | Fire-and-forget commands — `sendWalk()`, `getState()`, `findNearbyNpc()`, `sendInteractLoc()` |

Use `bot.*` by default. Drop to `sdk.*` when you need fine-grained control.

Full reference: [`sdk/API.md`](sdk/API.md)

### Script Context

Every script receives `ctx` with:

| Property | Description |
|----------|-------------|
| `ctx.bot` | High-level actions (BotActions) |
| `ctx.sdk` | Low-level SDK (BotSDK) |
| `ctx.log()` | Captured logging |
| `ctx.warn()` | Captured warnings |
| `ctx.error()` | Captured errors |

---

## Essential Patterns

### Always Dismiss Blocking UI

Level-ups, dialogs, and welcome messages block all actions. Call this in every loop:

```typescript
await bot.dismissBlockingUI();
```

### Handle Errors

```typescript
const result = await bot.chopTree();
if (!result.success) {
  log(`Failed: ${result.message}`);
}
```

### Start Short, Extend Later

| Duration | When |
|----------|------|
| 10-30s | New/untested logic |
| 2-5 min | Validated approach |
| 10+ min | Proven strategy |

### Watch for Pathing Issues

"Can't reach" messages usually mean a door or gate is closed:

```typescript
await bot.openDoor(/door/i);
await bot.walkTo(x, z);
```

Walk in steps rather than one long `walkTo` across the map.

---

## Learnings Library

The `learnings/` folder contains tested knowledge about game mechanics:

| File | Topics |
|------|--------|
| `woodcutting.md` | Tree locations, axe types |
| `mining.md` | Rock IDs, mine locations |
| `fishing.md` | Spot types (NPCs not locs!), locations |
| `combat.md` | Attack strategies, food, equipment |
| `banking.md` | Bank locations, deposit/withdraw |
| `shops.md` | Shop locations, buying/selling |
| `walking.md` | Pathing, doors, gates |
| `thieving.md` | Pickpocketing, stalls |
| `fletching.md` | Knife + logs crafting |
| `smithing.md` | Smelting, anvil work |
| `dialogs.md` | Dialog handling patterns |

**Read these before writing scripts for a skill.** They save hours of trial and error.

## Example Scripts

The `scripts/` folder has working examples for many skills:

```
scripts/woodcutting/    scripts/fishing-speedrun/
scripts/mining-trainer/ scripts/combat-trainer/
scripts/thieving/       scripts/fletching/
scripts/smithing/       scripts/cooking/
scripts/crafting/       scripts/firemaking/
scripts/prayer/         scripts/magic/
scripts/ranged/         scripts/agility/
```

Read these for patterns and inspiration before writing your own.

---

## Session Workflow Summary

```
1. Check state       →  bun sdk/cli.ts {username}
2. Read learnings    →  cat learnings/{skill}.md
3. Write script      →  edit bots/{username}/skill.ts
4. Run (short!)      →  bun bots/{username}/skill.ts
5. Check results     →  bun sdk/cli.ts {username}
6. Update notes      →  edit bots/{username}/lab_log.md
7. Iterate           →  go to step 3
```

---

## Project Structure

```
bots/                    # Your bot(s)
  {username}/
    bot.env              # Credentials
    lab_log.md           # Session notes
    *.ts                 # Your scripts

sdk/                     # The SDK
  index.ts               # BotSDK (low-level)
  actions.ts             # BotActions (high-level)
  runner.ts              # Script runner
  cli.ts                 # State checker CLI
  types.ts               # TypeScript types
  API.md                 # Full API reference

learnings/               # Game knowledge base
scripts/                 # Example scripts
mcp/                     # MCP server for AI agents
engine/                  # Game server (local mode)
gateway/                 # WebSocket gateway
webclient/               # Browser client
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "No state received" | Bot not connected — open browser and log in |
| Script stalls | Check for blocking dialogs: `await bot.dismissBlockingUI()` |
| "Can't reach" | Path blocked — open doors/gates, walk in steps |
| Wrong target matched | Use specific regex: `/^tree$/i` not `/tree/i` |
| 404 on client files | Build webclient and copy to `engine/public/` |
| Connection refused | Use `WEB_PORT=8080` for local server |
| Server restart lost progress | Expected — local server doesn't persist state |
