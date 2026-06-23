---
name: runescape
description: "Session guide for RS-SDK RuneScape botting. Load at the start of every session."
---

## Session Startup Flow

**Always follow this flow when starting a session.**

### Step 1: Check for Running Services (Local Server Only)

If using the demo server, skip to Step 2.

```bash
curl -s http://localhost:8080/ | head -2    # Engine
curl -s http://localhost:7780/ | head -2    # Gateway
```

If not running, start them in separate terminals (or background them however your tooling supports):

```bash
cd engine && WEB_PORT=8080 bun run src/app.ts
cd gateway && bun run gateway.ts
```

Wait ~5s, then verify with `curl`.

**First time only** — build the webclient:
```bash
cd webclient && bun run build
mkdir -p engine/public/client engine/public/bot
cp out/bot/* ../engine/public/bot/
cp out/standard/* ../engine/public/client/
```

### Important: Local Server Restarts Wipe Progress

The local server does **not** persist character state across restarts. Skills, inventory, position — most or all can reset. When resuming a session, **always check live bot state before trusting saved progress notes**. Compare the two and note any discrepancies.

### Step 2: Read Post Mortems

Always check for lessons from retired bots before doing anything:
```bash
ls bots/post_mortems/ 2>/dev/null
```
If post mortems exist, read them all. They contain hard-won lessons that save time.

### Step 3: Check for Existing Bots

```bash
ls bots/ | grep -v _template | grep -v post_mortems
```

If bots exist, check for progress logs:
```bash
cat bots/{botname}/progress.md
```

Then **ask the user**:

> I found bot `{name}`. Here's where we left off:
> {summary from progress.md}
>
> Do you want to **continue** with this bot or **start fresh** with a new one?

- **Continue**: Read `progress.md`, check bot state, then ask what they want to do
- **New**: Retire the old bot first (see below), then create a new one

### Retiring a Bot

When a bot is being replaced or abandoned:

1. **Write a post mortem** to `bots/post_mortems/{botname}.md` covering:
   - Peak stats and achievements
   - What worked well (strategies, locations, approaches)
   - What went wrong (failures, blockers, bugs)
   - Lessons learned for the next bot
2. **Delete the bot folder**: `rm -rf bots/{botname}`
3. **Create new bot**: `bun scripts/create-bot.ts {name}`

### Step 4: MCP Server (If Available)

RS-SDK includes an MCP server for interactive bot control. If your agent supports MCP, configure it to run `mcp/server.ts`:

```json
{
  "mcpServers": {
    "rs-agent": {
      "command": "bun",
      "args": ["run", "mcp/server.ts"],
      "cwd": "<path-to-rs-sdk>"
    }
  }
}
```

MCP tools: `execute_code(bot_name, code)`, `list_bots()`, `disconnect_bot(name)`.

If MCP isn't available, you can do everything via scripts and `bun sdk/cli.ts {username}`.

### Step 5: Bot Environment

For local play, `bot.env` must **NOT** set `SERVER`:
```
BOT_USERNAME=mybot
PASSWORD=secret
SHOW_CHAT=false
```

For the demo server, add:
```
SERVER=wss://rs-sdk-demo.fly.dev
```

### Step 6: Browser Login

The user needs to open `http://localhost:8080/` (local) or the demo server URL and log in with the bot credentials. The bot must be logged in via browser before scripts work.

### Step 7: Ask What to Do

Suggest activities based on the bot's current state and progress. Check `learnings/` for tips on specific skills.

---

## MCP First, Scripts Second

**Use MCP (`execute_code`) for:**
- Checking state, inventory, position
- Experimenting with new actions
- Quick one-off tasks
- Exploring and learning game mechanics

**Use scripts when:**
- Running long loops (5+ minutes of grinding)
- Proven approach that needs to run unattended
- Reusable automation worth saving to a file

**Workflow: explore with MCP, then automate with scripts.**

---

## Running Scripts

```bash
bun bots/{username}/{script}.ts
```

**Always set `disconnectAfter: true`** in `runScript()` options so the process exits cleanly:
```typescript
await runScript(async (ctx) => { ... }, {
  timeout: 5 * 60_000,
  disconnectAfter: true,
});
```

For long-running scripts, run them in the background using whatever process management your environment supports.

## Brain Dump to Learnings

**After every meaningful discovery**, update the relevant file in `learnings/`:
- New rock IDs, NPC locations, shop inventories, coordinates
- What worked, what failed, and why
- SDK/API quirks and workarounds
- Create new files for new skills (e.g., `learnings/smithing.md`)

Don't wait until end of session — dump knowledge **as you learn it**. Future sessions read `learnings/` to avoid re-discovering the same things.

## Updating Progress

**After every script run or session**, update `bots/{username}/progress.md`:
- Current location, stats, inventory highlights
- What was accomplished
- Issues encountered and how they were solved
- What to do next

Keep it concise — cliff notes, not a novel.

## API Gotchas

| Wrong | Right |
|-------|-------|
| `sdk.sendWieldItem()` | `bot.equipItem(/name/i)` |
| `bot.sendSkipTutorial()` | `bot.skipTutorial()` |
| Fishing spots in `nearbyLocs` | Fishing spots in `nearbyNpcs` |
| One long `walkTo` | Walk in steps, open gates/doors |
| Silent failures | Wrap everything in try/catch, log results |
| Mining without checking inventory space | Always drop/check inventory before mining |

- Always call `bot.dismissBlockingUI()` in loops
- Always eat food when HP is low
- Check `learnings/` folder for skill-specific tips
- Start with short runs (1-2 min), extend when proven
- Rocks at SE Varrock mine are distinguished by `id` (2090–2095) but not by name — all called "Rocks"

## Troubleshooting

| Problem | Fix |
|---------|-----|
| 404 client.js/deps.js | Build webclient + copy to engine/public/ |
| Connection refused port 80 | Use `WEB_PORT=8080` |
| Status check uses https:// | Remove `SERVER` from bot.env |
| `bun` not found | Install from https://bun.sh |
| walkTo fails silently | Walk in steps, open gates |
| Bot stuck in Lumbridge castle | Open doors first: `bot.openDoor(/door/i)` |
| Pickpocketing fails often at level 1 | Expect many failures/stuns — loop 15-20 times |
| Server restart wipes character progress | Expected with local server — stats/inventory reset |
