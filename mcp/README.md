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

### `get_market`

Public Grand Exchange research without a bot connection or controller takeover:
Use `get_market` with `operation: "status"` to check whether the server enables GE.
Disabled servers return a clear `ge_unavailable` error for market data reads.

```json
{
  "origin": "http://localhost:8888",
  "operation": "items",
  "query": "logs",
  "sort": "buyValue",
  "days": 7
}
```

Operations: `status`, `items`, `item` (requires `item_id`), `history` (requires `item_id`).
Use the game HTTP origin, not the gateway port. This tool cannot trade or read
private offers. See [the GE guide](../sdk/MARKET.md) for typed options and trading
through `bot.openGE()`, `bot.placeGEOffer()`, `bot.cancelGEOffer()` and collection.

### `execute_code`

Execute TypeScript on a bot. The first call auto-connects with the credentials
in `bots/{name}/bot.env` and opens a browser game client; leave it running if
you switch to a standalone script.

It opens one when the bot has no client, and also when the bot's client has
stale state, and then the new client takes over the login. If you run the
client yourself (another browser, the lite runner, another machine), set
`AUTO_LAUNCH_BROWSER` in `bot.env` or in the MCP server's `env`. Use `false`
to never open a client, or `true` to open one only when the bot has no client.
`auto` is the default.

Each bot runs one execution at a time: a new call cancels the one still running.
Timeout, MCP cancellation, or a newer call stops further SDK waits and action
packets, including those inside `walkTo()`; packets already sent may still take
effect. Different bots run concurrently. If world state is stale, the code
still runs and the output starts with a warning.

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
  `,
});
```

Pass values through `args` instead of splicing them into the code string, and
use `world` to choose how much state comes back (`brief` by default, `full`, or
`none` when calling in a loop):

```typescript
execute_code({ bot_name: "mybot", code: "return bot.walkTo(args.x, args.z);", args: { x: 3222, z: 3218 }, world: "none" });
```

To reuse a routine, give `script` a module path (absolute, or relative to the
repo root) in place of `code`. The module is reloaded whenever it changes.
Calling `runScript(main)` behind `if (import.meta.main)` keeps the same file
runnable standalone:

```typescript
// bots/mybot/chop.ts
import { runScript, type ScriptFunction } from '../../sdk/runner';
const main: ScriptFunction = async ({ bot, sdk, args }) => { /* ... */ return sdk.getInventory(); };
export default main;
if (import.meta.main) runScript(main);
```

Results include a readable text block for the model, plus `structuredContent`
for code-mode harnesses (it matches the tool's `outputSchema`):

```typescript
{
  ok: boolean,
  result: unknown,          // the returned JSON value (credentials redacted), or null
  logs: string[],
  error: { kind, message, activeActions } | null,
  elapsedMs: number,
  world: { player, skills, inventory, equipment, dialog, modal, nearby, messages, ... } | null,
}
```

`error.kind` is one of `exception`, `timeout`, `superseded` (a newer call for
the same bot replaced this one), `cancelled`, `not_connected`, `invalid_input`
or `unserializable_result`. Nearby lists are `{ total, items }`, capped by the
`world` option only, so a probe on a quiet tile has the same shape as the
result on a busy one.

### `list_bots`

List all connected bots and their status.

```typescript
list_bots();
// Returns: { bots: [{ name: "mybot", username: "mybot", connected: true }], count: 1 }
```

### `disconnect_bot`

Disconnect a connected bot.

```typescript
disconnect_bot({ name: "mybot" });
```

## Resources

The server exposes API documentation as a resource:

- `file://../sdk/MARKET.md` — GE workflow, market data, receipts and recovery.
- `file://../sdk/API.md` — Auto-generated reference for `bot.*` (high-level actions) and `sdk.*` (low-level SDK)

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
├── server.ts           # MCP server (stdio transport) and tool definitions
├── execute-code.ts     # execute_code: per-bot cancellation, console capture, output
├── console-capture.ts  # Bounded, per-execution console buffer
├── market-tools.ts     # get_market
└── api/
    └── index.ts        # BotManager - manages multiple connections
```

The `@modelcontextprotocol/sdk` dependency lives in the root `package.json`.

## Troubleshooting

**"Bot not found"**

- Create the bot first: `bun bots/create-bot.ts {name}`
- Check `bots/{name}/bot.env` exists

**"Connection failed"**

- Check the gateway is running
- Verify credentials in `bots/{name}/bot.env`

**MCP server not appearing in Claude Code**

- Run `bun install` at the project root
- Check `.mcp.json` exists at project root
- Restart Claude Code

## API Reference

See [`sdk/API.md`](../sdk/API.md) for the full auto-generated API documentation.
