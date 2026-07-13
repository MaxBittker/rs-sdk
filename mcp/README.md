# RS-Agent MCP Server

MCP (Model Context Protocol) server for controlling RS-Agent bots. Supports multiple simultaneous bot connections.

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
Execute TypeScript code on a bot. Auto-connects on first use using credentials from `bots/{name}/bot.env`.

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

### `list_bots`
List all connected bots and their status.

```typescript
list_bots()
// Returns: { bots: [{ name: "mybot", username: "mybot", connected: true }], count: 1 }
```

### `disconnect_bot`
Disconnect a connected bot.

```typescript
disconnect_bot({ name: "mybot" })
```

## Resources

The server exposes API documentation as a resource:

- `file://../sdk/API.md` — Auto-generated reference for `bot.*` (high-level actions) and `sdk.*` (low-level SDK)

Read this to discover available methods.

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
- Use `list_bots` to see connected bots

**"Connection failed"**
- Check the gateway is running
- Verify credentials in `bots/{name}/bot.env`

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
