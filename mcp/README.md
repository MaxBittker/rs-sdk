# RS-Agent MCP Server

MCP (Model Context Protocol) server for controlling RS-Agent bots. Supports
multiple bot connections and serializes mutations made to the same bot.

## Quick Start (Claude Code)

Claude Code auto-discovers the MCP server via `.mcp.json`. Just:

1. **Install dependencies (from the project root):**
   ```bash
   bun install
   ```

2. **Create a bot (if you haven't):**
   ```bash
   bun bots/create-bot.ts mybot
   ```

3. **Open the project in Claude Code** — it will prompt you to approve the MCP server.

4. **Control your bot:**
   ```
   Execute code on "mybot" to chop some trees
   ```

## Tools

### `execute_code`
Execute TypeScript code on a bot. Auto-connects on first use using credentials
from `bots/{name}/bot.env`. TypeScript is transpiled before execution, so
annotations, interfaces, and non-null assertions are accepted.

```typescript
execute_code({
  bot_name: "mybot",
  code: `
    const tree = sdk.findNearbyLoc(/^tree$/i);
    if (tree) {
      const result = await bot.chopTree(tree);
      console.log('Chopped:', result);
    }
    return sdk.getInventory();
  `
})
```

The body runs as an async function with four arguments:

- `bot`: high-level `BotActions`
- `sdk`: low-level `BotSDK`
- `console`: request-scoped output captured in the response
- `signal`: an `AbortSignal` fired by timeout or MCP client cancellation

Calls are FIFO-serialized per bot. Output and console capture are bounded.
Errors and timeouts retain console output and a terminal world-state snapshot.
Once an execution is cancelled it cannot start another proxied SDK call. An
SDK call that had already started cannot currently be interrupted because the
public SDK does not accept `AbortSignal`; in that case the response says so and
the per-bot queue remains locked until the call settles.

Cancellation is cooperative: it cannot pre-empt CPU-bound synchronous
JavaScript that blocks Bun's event loop. Code bodies are limited to 262,144
characters.

> **Trusted-code boundary:** `execute_code` is not a sandbox. Code runs with the
> MCP server process's filesystem, process, and network permissions. Do not
> expose this tool to untrusted callers.

### `inspect_state`

Read full or selected structured state without arbitrary code. The response
always includes connection and freshness metadata. Unlike action tools, it can
return a stale cached snapshot so a stopped browser can be diagnosed.

```typescript
inspect_state({
  bot_name: "mybot",
  sections: ["player", "inventory", "nearby_npcs"]
})
```

`inspect_state` is the supported, more complete replacement for the old
`get_state` proposal.

### `query_entities`

Query typed NPC, player, location, ground-item, or inventory records with
literal-name, regex, option, and distance filters. Locations and ground items
can request an on-demand scan.

```typescript
query_entities({
  bot_name: "mybot",
  kind: "npc",
  name: "cow",
  option: "attack",
  max_distance: 12
})
```

### `perform_action`

Perform one validated high-level action without generating code. Supported
operations include walking, talking/interacting, combat, pickup, woodcutting,
doors, banking, food, chat, waiting, blocking-UI dismissal, and tutorial skip.

```typescript
perform_action({
  bot_name: "mybot",
  action: "interact_npc",
  target: "banker",
  option: "bank"
})
```

### `list_bots`
List all bot sessions and their transport, authentication, state freshness,
control mode, controller/observer, and execution-lock status.

```typescript
list_bots()
// Includes connected, authenticated, connectionState, stateAgeMs,
// sessionStatus, controllers, observers, and executionBusy.
```

### `disconnect_bot`
Disconnect a connected bot.

```typescript
disconnect_bot({ name: "mybot" })
```

## Resources

The server exposes API documentation as an exact, allowlisted resource:

- `file://../sdk/API.md` — Auto-generated reference for `bot.*` (high-level actions) and `sdk.*` (low-level SDK)

Read this to discover available methods. Other `file://` URIs, including path
traversal and absolute paths, are rejected.

## Multiple Bots

Control multiple bots simultaneously — each auto-connects on first use:

```typescript
// Execute on different bots (auto-connects each)
execute_code({
  bot_name: "woodcutter",
  code: "await bot.chopTree()"
})

execute_code({
  bot_name: "miner",
  code: "await bot.interactLoc(/^rocks$/i, 'mine')"
})
```

## Manual Setup (without auto-discovery)

If you're not using Claude Code's auto-discovery, add to your MCP client config:

```json
{
  "mcpServers": {
    "rs-agent": {
      "command": "bun",
      "args": ["run", "/path/to/rs-sdk/mcp/server.ts"]
    }
  }
}
```

Or run directly for testing:

```bash
bun run mcp/server.ts
```

## Architecture

```
mcp/
├── server.ts           # MCP server (stdio transport)
├── execution.ts        # TypeScript execution, cancellation, logs, per-bot queue
├── agent-tools.ts      # Structured state/query/action tools
├── output.ts           # Bounded output and terminal snapshots
├── resources.ts        # Exact resource allowlist
└── api/
    └── index.ts        # BotManager - manages multiple connections
```

The `@modelcontextprotocol/sdk` dependency lives in the root `package.json`.

## Troubleshooting

**"Bot not found"**
- Create the bot first: `bun bots/create-bot.ts {name}`
- Check `bots/{name}/bot.env` exists

**"Bot is not connected"**
- Bots auto-connect on the first `execute_code` call — check the error output for connection failures
- Use `list_bots` to distinguish gateway connection, authentication, stale
  browser state, and controller pre-emption

**"Connection failed"**
- Check the gateway is running
- Verify credentials in `bots/{name}/bot.env`

**"No fresh game state"**
- Open or reload the bot browser and confirm the character is logged in
- Check `stateAgeMs` and `sessionStatus` with `list_bots`

## Development checks

```bash
bun test mcp/*.test.ts
bun x tsc -p mcp/tsconfig.json
```

**MCP server not appearing in Claude Code**
- Run `bun install` at the project root
- Check `.mcp.json` exists at project root
- Restart Claude Code

## API Reference

See [`sdk/API.md`](../sdk/API.md) for the full auto-generated API documentation.

### High-Level Bot Actions

- Movement: `walkTo(x, z)`
- Skills: `chopTree()`, `burnLogs()`, `fletchLogs()`, `smithAtAnvil()`, `craftLeather()`
- Combat: `attackNpc(target)`, `eatFood(target)`, `castSpellOnNpc(target, spell)`
- Interaction: `interactLoc(target, option)`, `interactNpc(target, option)`, `talkTo(target)`
- Banking: `openBank()`, `depositItem()`, `withdrawItem()`
- Shopping: `openShop()`, `buyFromShop()`, `sellToShop()`
- Crafting: `smithAtAnvil()`, `fletchLogs()`, `craftLeather()`
- UI: `dismissBlockingUI()`, `skipTutorial()`

### Low-Level SDK Methods

- State: `getState()`, `getStateAge()`
- Inventory: `getInventory()`, `findInventoryItem(pattern)`
- NPCs: `getNearbyNpcs()`, `findNearbyNpc(pattern)`
- Locations: `getNearbyLocs()`, `findNearbyLoc(pattern)`
- Actions: `sendWalk()`, `sendInteractLoc()`, `sendInteractNpc()`
- Utilities: `findPath()`, `waitForCondition()`
