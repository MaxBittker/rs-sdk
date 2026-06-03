This repo contain:
A game server (hosted by default at https://rs-sdk-demo.fly.dev/)
A browser-based game client (hosted by default at https://rs-sdk-demo.fly.dev/)
A gateway service for connecting bot clients to SDK agents
A BotSDK library for writing automation scripts in TypeScript

By default you can build bots by only writing scripts that use the botsdk library, without modifying the server or client code, 
but if you want to develop deeper changes to the stack or host your own server, all the source code is included in this repo to do so.


## Directory Structure

| Directory | Description |
|-----------|-------------|
| `sdk/` | BotSDK library for writing automation scripts |
| `sdk/test/` | Test scripts for bot automation and shop interactions |
| `server/engine/` | Game server - handles world state, players, NPCs, game logic |
| `server/content/` | Game assets - maps, models, scripts, sprites, music |
| `server/webclient/` | TypeScript web client with BotSDK for automation |
| `server/gateway/` | WebSocket relay for bot clients to connect to SDK agents |

> `server/{engine,content,webclient}` are vendored copies of upstream LostCity with local
> modifications. **[server/PATCHES.md](server/PATCHES.md)** is the canonical checklist of every
> monkeypatch and how to verify it after a vendor sync — read it before touching vendored code.

### Engine (`server/engine/`)

The game server handling world simulation, player logic, and network protocol.

```
engine/
├── src/           # Server source code
├── public/        # Static files served to clients
│   ├── client/    # Standard web client build
│   └── bot/       # Bot client build (with BotSDK)
├── view/          # EJS templates (bot.ejs for bot interface)
├── data/          # Runtime game data
├── prisma/        # Database schema and migrations
└── tools/         # Build and pack tools
```

### WebClient (`server/webclient/`)

Browser-based game client ported to TypeScript.

```
webclient/
├── src/
│   ├── client/    # Standard client code
│   └── bot/       # Bot-specific modules (BotSDK)
├── out/           # Built client bundles
│   ├── standard/  # Standard client output
│   └── bot/       # Bot client output
└── 3rdparty/      # Third-party dependencies
```

### Gateway (`server/gateway/`)

WebSocket relay service connecting browser game clients to SDK automation scripts.

```
gateway/
├── gateway.ts         # WebSocket router for bot ↔ SDK communication
├── types.ts           # Gateway message protocol types
├── run-recorder.ts    # Run logging and screenshots
└── agent-state/       # Live state files per bot
```


---

### Root Level

| Command | Description |
|---------|-------------|
| `./start.sh` | Interactive menu (Linux/macOS) |
| `start.bat` | Interactive menu (Windows) |
| `bun run server/start.ts` | Run interactive menu directly |

The interactive menu provides options to:
- Start the game server
- Update all subprojects
- Run web or Java client
- Build clients
- Change game version (225, 244, 245.2, 254)

### Engine (`cd server/engine`)

| Command | Description |
|---------|-------------|
| `bun start` | Install deps and start server |
| `bun run dev` | Start with hot-reload (watch mode) |
| `bun run quickstart` | Start without installing deps |
| `bun run build` | Pack game content |
| `bun run clean` | Clean build artifacts |
| `bun run setup` | Configure server environment |
| `bun run lint` | Run ESLint |

**Database commands:**
| Command | Description |
|---------|-------------|
| `bun run sqlite:migrate` | Apply SQLite migrations |
| `bun run sqlite:reset` | Reset SQLite database |
| `bun run db:migrate` | Apply MySQL migrations |
| `bun run db:reset` | Reset MySQL database |

### WebClient (`cd server/webclient`)

| Command | Description |
|---------|-------------|
| `bun run build` | Build client bundles (standard + bot) |
| `bun run build:dev` | Build in development mode |

After building, copy to engine:
```sh
cp out/standard/client.js ../engine/public/client/client.js
cp out/bot/client.js ../engine/public/bot/client.js
```

### Agent (`cd agent`)

| Command | Description |
|---------|-------------|
| `bun run gateway` | Start gateway (unified sync + controller) |
| `bun run gateway:dev` | Gateway with hot-reload |
| `bun run agent` | Start Claude Agent service |
| `bun run agent:dev` | Agent service with hot-reload |
| `bun run cli` | Run agent CLI |
| `bun cli.ts launch <bot> "goal"` | Launch browser + start agent |
| `bun cli.ts status` | View connected bots |
| `bun run login` | Automated login helper |

### Java Client (`cd javaclient`)

| Command | Description |
|---------|-------------|
| `./gradlew build` | Build the Java client |
| `./gradlew run --args="10 0 highmem members 32"` | Run the Java client |

---

## Workflow

**Use the start script provided** - it handles a lot of common use cases. We're trying to reduce the barrier to entry by providing an all-inclusive script.

### Content Development
```sh
cd server/engine && bun start
# Server watches for script/config changes and auto-repacks
```

### Engine Development
```sh
cd server/engine && bun run dev
# Server restarts on .ts file changes
```
