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

| Tool                           | Description                                    |
| ------------------------------ | ---------------------------------------------- |
| `execute_code(bot_name, code)` | Run code on a bot. Auto-connects on first use. |
| `list_bots()`                  | List connected bots                            |
| `disconnect_bot(name)`         | Disconnect a bot                               |

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
  `,
});
```

See `mcp/README.md` for detailed API reference.

Code runs in an async context with `bot` (BotActions) and `sdk` (BotSDK) available as globals.

## Reporting SDK Bugs

When the SDK has a bug or rough edge, first find a workaround, then file a report. One command, no auth, no permission needed:

```bash
bun sdk/bug-report.ts "incorrect results from bot.foo(), had to use raw sdk.sendFoo() instead for xyz reason."
```

Important note: The game itself is extremely well tested and complete, it's not buggy. If you can't figure out how to do something, don't blame the game, blame your assumptions and keep investigating. File a bug report _after_ you figure out
what's going on, don't just assume the game is broken because you got confused, and give up. The SDK is a thin layer on top of the game, and the game is the source of truth.

After filing the bug, keep working on your goal!

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

### Chatting Without Taking Control

To talk in-game (or read chat) without disturbing whatever script currently
owns the bot, use the chat CLI — it connects in `observe` mode, which can send
chat (and nothing else) and never pre-empts (or gets pre-empted by) a
controller:

```bash
bun sdk/chat.ts {username} "meet me at the bank"   # send public chat
bun sdk/chat.ts {username} --to {player} "on my way"  # send a private message
bun sdk/chat.ts {username}                          # recent chat
bun sdk/chat.ts {username} --watch                  # tail live
```

Public chat is capped at 400 chars per message; `sdk.say()` auto-splits longer
text into wire-safe chunks.

Private messages (`sdk.dm(name, text)` / `sdk.sendPrivateMessage(name, msg)`)
reach the target anywhere in the world - no friends-list setup needed - and
show up in `getChat()` as type 3 (received) / 6 (sent). The server accepts one
social packet (say or PM) per tick; `dm()` paces its chunks automatically.

## Script Duration Guidelines

**Start short, extend as you gain confidence:**

| Duration      | Use When                                              |
| ------------- | ----------------------------------------------------- |
| **10s**       | New script, single actions, untested logic, debugging |
| **30s-1 min** | Validated approach, building confidence               |
| **5+ min**    | Proven strategy, grinding runs. USE SPARINGLY         |

A failed 5-minute run wastes more time than five 30 second diagnostic runs. **Fail fast and start simple.**

Look out for "I can't reach" messages - the solution is often to open closed gates or that the item isn't accessible.

Read and grep in the learnings/ and wiki/ folder for tips, skill guides, item and npc locations, and shop information.

## SDK API Reference

For the complete method reference, see **[sdk/API.md](sdk/API.md)** (auto-generated from source).

**Quick overview:**

- `bot.*` - High-level actions that attempt to observe method-specific evidence (chopTree, walkTo, attack, etc.). Check a result when the method returns one.
- `sdk.*` - State queries and low-level browser-client dispatches. A successful `send*` result does not prove the game server applied the effect.

### bot.\* Quick Reference

| Method                          | What it does                                                     |
| ------------------------------- | ---------------------------------------------------------------- |
| `walkTo(x, z, tolerance?)`      | Pathfind to coords, opens doors along the way                    |
| `talkTo(target)`                | Walk to NPC, start dialog                                        |
| `interactNpc(target, option?)`  | Walk to NPC, interact with any option (e.g. `'trade'`, `'fish'`) |
| `interactLoc(target, option?)`  | Walk to loc, interact with any option (e.g. `'mine'`, `'smelt'`) |
| `attack(target)`                | Walk to an NPC or player and start combat                    |
| `castSpell(target, spell)`      | Cast a combat spell on an NPC or player                         |
| `pickpocketNpc(target)`         | Pickpocket NPC, detects XP gain vs stun                          |
| `chopTree(target?)`             | Chop tree, wait for logs                                         |
| `pickupItem(target)`            | Pick up ground item                                              |
| `openDoor(target?)`             | Open a door or gate                                              |
| `openBank()`                    | Open nearest bank                                                |
| `depositItem(target, amount?)`  | Deposit item to bank                                             |
| `withdrawItem(slot, amount?)`   | Withdraw item from bank                                          |
| `closeInterface()`              | Close any open modal (shop, bank, book, quest scroll)            |
| `closeShop()` / `closeBank()`   | Close the shop / bank interface                                  |
| `openShop(target?)`             | Open shop via shopkeeper NPC                                     |
| `buyFromShop(target, amount?)`  | Buy item from open shop                                          |
| `sellToShop(target, amount?)`   | Sell item to open shop                                           |
| `equipItem(target)`             | Equip from inventory                                             |
| `unequipItem(target)`           | Unequip to inventory                                             |
| `eatFood(target)`               | Eat food, returns HP gained                                      |
| `useItemOnLoc(item, loc)`       | Use inventory item on loc (e.g. fish on range)                   |
| `useItemOnNpc(item, npc)`       | Use inventory item on NPC                                        |
| `burnLogs(target?)`             | Light logs with tinderbox                                        |
| `fletchLogs(product?)`          | Fletch logs with knife                                           |
| `craftLeather(product?)`        | Craft leather with needle                                        |
| `smithAtAnvil(product)`         | Smith bars at anvil                                              |
| `dismissBlockingUI()`           | Dismiss level-up dialogs (called automatically by all actions)   |
| `navigateDialog(choices)`       | Auto-click through dialog options                                |
| `skipTutorial()`                | Skip the tutorial island                                         |

### sdk.\* Commonly Used Directly

| Method                                              | What it does                                        |
| --------------------------------------------------- | --------------------------------------------------- |
| `getState()`                                        | Full world state snapshot                           |
| `getSkill(name)` / `getSkillXp(name)`               | Skill info                                          |
| `getInventory()` / `findInventoryItem(pattern)`     | Inventory queries                                   |
| `findNearbyNpc(pattern)` / `findNearbyLoc(pattern)` | Find nearby entities                                |
| `findNearbyPlayer(pattern)` / `getNearbyPlayers()`  | Find other players                                  |
| `findGroundItem(pattern)`                           | Find ground items                                   |
| `getDialog()`                                       | Current dialog state                                |
| `sendClickDialog(option)`                           | Click dialog option by its published `index`        |
| `clickDialogByText(pattern)`                        | Click dialog option by label — prefer this          |
| `sendClickComponent(id)`                            | Click interface button                              |
| `sendCloseModal()` / `sendCloseShop()`              | Close the open modal / shop                         |
| `sendDropItem(slot)`                                | Drop inventory item                                 |
| `sendUseItem(slot)`                                 | Use inventory item (bury, etc.)                     |
| `sendUseItemOnItem(src, dst)`                       | Combine two items                                   |
| `say(text)`                                         | Send chat, auto-chunked past the length cap         |
| `dm(name, text)`                                    | Send a private message, auto-chunked                |
| `getChat(opts?)` / `getNewChat(opts?)`              | Read chat history (500-deep) / only unseen messages |
| `waitForChat(opts?)`                                | Wait for a message (`{from, matching, timeout}`)    |
| `waitForCondition(pred)`                            | Wait for state predicate                            |
| `waitForTicks(n)`                                   | Wait n game ticks                                   |
| `scanNearbyLocs(radius?)`                           | Async extended-range loc scan; must be awaited      |

See `sdk/API.md` for exact async signatures, parameter defaults, and return
types.

### Code environments

MCP `execute_code` exposes `bot` and `sdk` directly. Standalone
`bots/{username}/*.ts` files must import `runScript` and receive
`{ bot, sdk }` in its callback. Do not paste runner-context expressions into
`execute_code`.

Only one control connection should own a bot. Use observe mode for read-only
monitoring, avoid overlapping action programs on the same bot, and inspect
`sdk.getStateAge()` before acting after a disconnect or long pause.

---

### Modals Hide the Inventory

A shop or bank modal replaces the inventory tab, so the server rejects
inventory packets sent underneath it as "component not visible" — with no game
message. Close the modal before doing anything else:

```typescript
await bot.closeInterface(); // any modal
await bot.closeShop(); // shop specifically
await sdk.sendCloseModal(); // low-level
```

Don't click the interface's own "Close Window" component id. It's a
client-side close button with no server trigger; the SDK now routes those to a
close for you, but the named methods above are what to reach for.

### Dialog Options Are Not In Product Order

Skill dialogs (fletching, crafting) publish four buttons _per product_ — Make
X, Make 10, Make 5, then one labelled with the product name. Arrow shafts are
option 4 of 12, not option 1. Never assume ordering:

```typescript
const dialog = sdk.getDialog();
console.log(dialog?.options.map((o) => `${o.index}: ${o.text}`));
await sdk.clickDialogByText(/arrow shaft/i); // or bot.fletchLogs('arrow shaft')
```

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

**Everything succeeds and nothing happens** - The two silent failure modes. A
`send*` returning success only means the client wrote bytes; it is not an ack.

- **The client never sent anything.** The client pathfinds before every interaction, and when it can't route it returns `cant_reach` without writing a packet - so the server never replies "I can't reach that!" either. Check `reachable` on the target before using it. `find*` already prefers reachable matches; pass `{reachable: true}` to get `null` instead of an unreachable one.
- **The server discarded the op.** A refused op (mid-action, stunned, target gone or out of view, bad option) gets `UNSET_MAP_FLAG` and nothing else - no message, no error. A blocking modal is worse: the op is accepted and the trigger never runs. Check `state.opFeedback.opRejectedCount` around a send, and gate loops on an observed effect rather than on a timer.

Start small and build up!
