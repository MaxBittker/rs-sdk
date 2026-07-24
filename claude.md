# RS-Agent Bot Guide

You're here to play the mmo game through the progressive development of botting scripts, starting small then adapting to your desires and ideas.
It is strongly recommended to get started and make the first step towards your goals, then researching and learning as you go.
## First Time Setup

**Create a new bot using the setup script:**

Ask the user for a bot name (max 12 chars, alphanumeric). If they skip, use the command without a username to auto-generate a random 9-character name.

```bash
# With custom username
bun bots/create-bot.ts {username}

# Auto-generate random username
bun bots/create-bot.ts

# Use local server (sets SERVER=localhost in bot.env)
bun bots/create-bot.ts {username} --local

# Use a custom server
bun bots/create-bot.ts {username} --server=myserver.example.com
```

This automatically creates:
- `bots/{username}/bot.env` - Credentials with auto-generated password
- `bots/{username}/lab_log.md` - Session notes template
- `bots/{username}/script.ts` - Ready-to-run starter script



### Quick Start

1. Install dependencies: `bun install` (from project root)
2. Open project in your AI coding tool — the MCP server will be available automatically
3. Control your bot with suggestions.

### Tools

| Tool | Description |
|------|-------------|
| `execute_code(bot_name, code)` | Run code on a bot. Auto-connects on first use. |
| `list_bots()` | List connected bots |
| `disconnect_bot(name)` | Disconnect a bot |

### Example

```typescript
// Just execute - auto-connects on first use
execute_code({
  bot_name: "mybot",
  code: `
    const state = sdk.getState();
    console.log('Position:', state.player.worldX, state.player.worldZ);

    // Chop trees for 1 minute
    const endTime = Date.now() + 60_000;
    while (Date.now() < endTime) {
      const tree = sdk.findNearbyLoc(/^tree$/i);
      if (tree) await bot.chopTree(tree);
    }

    return sdk.getInventory();
  `
})
```

See `mcp/README.md` for detailed API reference.

Code runs in an async context with `bot` (BotActions) and `sdk` (BotSDK) available as globals.

## Session Workflow

This is a **persistent character** - you don't restart fresh each time. The workflow is:

### 1. Check World State First

Before writing any script, check where the bot is and what it has:

```bash
bun sdk/cli.ts {username}
```

This shows: position, inventory, skills, nearby NPCs/objects, and more.

**Exception**: Skip this if you just created the character and know it's at spawn.

**Tutorial Check**: If the character is in the tutorial area, call `await bot.skipTutorial()` before running any other scripts. The tutorial blocks normal gameplay.

### 2. Write Your Script

Edit `bots/{username}/script_name.ts` with your goal. Keep scripts focused on one task. you may write multiple scripts for different tasks and switch between them.

### 3. Run the Script

```bash
bun bots/{username}/script_name.ts
```

### 4. Observe and Iterate

Watch the output. After the script finishes (or fails), check state again:

```bash
bun sdk/cli.ts {username}
```

Record observations in `lab_log.md`, then improve the script.

## Script Duration Guidelines

**Start short, extend as you gain confidence:**

| Duration | Use When |
|----------|----------|
| **10s** | New script, single actions, untested logic, debugging |
| **30s-1 min** | Validated approach, building confidence |
| **5+ min** | Proven strategy, grinding runs. USE SPARINGLY |

A failed 5-minute run wastes more time than five 30 second diagnostic runs. **Fail fast and start simple.**

Look out for "I can't reach" messages - the solution is often to open closed gates or that the item isn't accessible. 

Read and grep in the learnings/ and wiki/ folder for tips, skill guides, item and npc locations, and shop information.

## SDK API Reference

For the complete method reference, see **[sdk/API.md](sdk/API.md)** (auto-generated from source).

**Quick overview:**
- `bot.*` - High-level actions that attempt to observe method-specific evidence (chopTree, walkTo, attackNpc, etc.). Check a result when the method returns one.
- `sdk.*` - State queries and low-level browser-client dispatches. A successful `send*` result does not prove the game server applied the effect.

### bot.* Quick Reference

| Method | What it does |
|--------|-------------|
| `walkTo(x, z, tolerance?)` | Pathfind to coords, opens doors along the way |
| `talkTo(target)` | Walk to NPC, start dialog |
| `interactNpc(target, option?)` | Walk to NPC, interact with any option (e.g. `'trade'`, `'fish'`) |
| `interactLoc(target, option?)` | Walk to loc, interact with any option (e.g. `'mine'`, `'smelt'`) |
| `attackNpc(target)` | Walk to NPC, start combat |
| `pickpocketNpc(target)` | Pickpocket NPC, detects XP gain vs stun |
| `castSpellOnNpc(target, spell)` | Cast combat spell on NPC |
| `chopTree(target?)` | Chop tree, wait for logs |
| `pickupItem(target)` | Pick up ground item |
| `openDoor(target?)` | Open a door or gate |
| `openBank()` | Open nearest bank |
| `depositItem(target, amount?)` | Deposit item to bank |
| `withdrawItem(slot, amount?)` | Withdraw item from bank |
| `openShop(target?)` | Open shop via shopkeeper NPC |
| `buyFromShop(target, amount?)` | Buy item from open shop |
| `sellToShop(target, amount?)` | Sell item to open shop |
| `equipItem(target)` | Equip from inventory |
| `unequipItem(target)` | Unequip to inventory |
| `eatFood(target)` | Eat food, returns HP gained |
| `useItemOnLoc(item, loc)` | Use inventory item on loc (e.g. fish on range) |
| `useItemOnNpc(item, npc)` | Use inventory item on NPC |
| `burnLogs(target?)` | Light logs with tinderbox |
| `fletchLogs(product?)` | Fletch logs with knife |
| `craftLeather(product?)` | Craft leather with needle |
| `smithAtAnvil(product)` | Smith bars at anvil |
| `dismissBlockingUI()` | Dismiss level-up dialogs (called automatically by all actions) |
| `navigateDialog(choices)` | Auto-click through dialog options |
| `skipTutorial()` | Skip the tutorial island |

### sdk.* Commonly Used Directly

| Method | What it does |
|--------|-------------|
| `getState()` | Full world state snapshot |
| `getSkill(name)` / `getSkillXp(name)` | Skill info |
| `getInventory()` / `findInventoryItem(pattern)` | Inventory queries |
| `findNearbyNpc(pattern)` / `findNearbyLoc(pattern)` | Find nearby entities |
| `findGroundItem(pattern)` | Find ground items |
| `getDialog()` | Current dialog state |
| `sendClickDialog(option)` | Click dialog option |
| `sendClickComponent(id)` | Click interface button |
| `sendDropItem(slot)` | Drop inventory item |
| `sendUseItem(slot)` | Use inventory item (bury, etc.) |
| `sendUseItemOnItem(src, dst)` | Combine two items |
| `say(text)` | Send chat, auto-chunked past the length cap |
| `getChat(opts?)` / `getNewChat(opts?)` | Read chat history (500-deep) / only unseen messages |
| `waitForChat(opts?)` | Wait for a message (`{from, matching, timeout}`) |
| `waitForCondition(pred)` | Wait for state predicate |
| `waitForTicks(n)` | Wait n game ticks |
| `scanNearbyLocs(radius?)` | Async extended-range loc scan; must be awaited |

See `sdk/API.md` for exact async signatures, parameter defaults, and return
types. For wiki data, use `bun run wiki:search --json <query>` instead of
grepping every generated page.

### Code environments

MCP `execute_code` exposes `bot` and `sdk` directly. Standalone
`bots/{username}/*.ts` files must import `runScript` and receive
`{ bot, sdk }` in its callback. Do not paste runner-context expressions into
`execute_code`.

Only one control connection should own a bot. Use observe mode for read-only
monitoring, avoid overlapping action programs on the same bot, and inspect
`sdk.getStateAge()` before acting after a disconnect or long pause.

---

### Dismiss Level-Up Dialogs

All BotActions methods automatically dismiss blocking UI (level-up dialogs, etc.) before executing. You don't need to call this manually in loops.

```typescript
// Only needed if using low-level sdk methods directly:
await bot.dismissBlockingUI();

// Or manually check
if (sdk.getState()?.dialog.isOpen) {
    await sdk.sendClickDialog(0);
}
```

### Error Handling

```typescript
const result = await bot.chopTree();
if (!result.success) {
    console.log(`Failed: ${result.message}`);
    // Handle failure - maybe walk somewhere else
}
```

## Project Structure

```

bots/
└── {username}/
    ├── bot.env        # Credentials (BOT_USERNAME, PASSWORD, SERVER)
    ├── lab_log.md     # Session notes and observations
    └── script.ts      # Current script

sdk/
├── index.ts           # BotSDK (low-level)
├── actions.ts         # BotActions (high-level)
├── cli.ts             # CLI for checking state
└── types.ts           # Type definitions

learnings/
├── banking.md
└── ...etc

wiki/
├── npcs/
├── items/
├── skills/
└── shops/

```

## Troubleshooting

**"No state received"** - Bot isn't connected to game. Open browser first or use `autoLaunchBrowser: true`.

**Script stalls** - Check for open dialogs (`state.dialog.isOpen`). Level-ups block everything.

**"Can't reach"** - Path is blocked. Try walking closer first, or find a different target.

**Wrong target** - Use more specific regex patterns: `/^tree$/i` not `/tree/i` (which matches "tree stump").


Start small and build up!
