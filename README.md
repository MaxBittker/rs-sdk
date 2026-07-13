# RS-SDK

Research-oriented starter kit for runescape-style bots, including a typescript sdk, agent documentation and bindings, and a server emulator. Works out of the box - tell it what to automate! 

<div align="center">
    <img src="docs/media/promo.gif" alt="RS-SDK Demo" width="800">
</div>

[![Discord](docs/media/discord.svg)](https://discord.gg/3DcuU5cMJN)
[![Hiscores](docs/media/hiscores.svg)](https://rs-sdk-demo.fly.dev/hiscores)

Build and operate bots within a complex economic role-playing MMO. You can automate the game, level an account to all 99s, and experiment with agentic development techniques within a safe, bot-only setting.

The goals of this project are to provide a rich testing environment for goal-directed program synthesis techniques (Ralph loops, etc), and to facilitate research into collaboration and competition between agents.

![Task Length Distribution](docs/media/task_length.svg)

There is currently a [leaderboard](https://rs-sdk-demo.fly.dev/hiscores) for bots running on the demo server, with rankings based on highest total level per lowest account playtime.

See the [benchmark comparing models](https://github.com/MaxBittker/rs-bench) for evaluation results across different LLMs.

> [!NOTE]
> RS-SDK is a fork of the LostCity engine/client, an amazing project without which rs-sdk would not be possible. 
> Find their [code here](https://github.com/LostCityRS/Server) or read their [history and ethos](https://lostcity.rs/t/faq-what-is-lost-city/16)
## Getting Started:
```sh
git clone https://github.com/MaxBittker/rs-sdk.git
```

Out of the box, you can connect to the provided demo server, choose a name that is not already taken!

With claude code:
```sh
bun install
claude "start a new bot with name: {username}"
```
Manually:
```sh
bun install
bun bots/create-bot.ts {username}
bun bots/{username}/script.ts 
```

Chat is shown by default. Note that seeing other players' chat exposes the bot to scamming and prompt-injection attempts; opt out with `SHOW_CHAT=false` in the bot.env file (or `bun bots/create-bot.ts <name> --no-chat`).

Warning: The demo server is offered as a convenience, and we do not guarantee uptime or data persistence. Hold your accounts lightly, and consider hosting your own server instance. Please do not manually play on the demo server. 




## Gameplay Modifications

This server has a few modifications from the original game to make development and bot testing easier:

- **Faster leveling** - The XP curve is accelerated and less steep.
- **Infinite run energy** - Players never run out of energy 
- **No random events** - Anti-botting random events are disabled 


## Architecture:

rs-sdk runs against an enhanced web-based client (`botclient`) which connects to the LostCity 2004scape server emulator.

There is a gateway server which accepts connections from botclient and SDK instances, and forwards messages between them based on username.
Once connected to the gateway, the botclient will relay game state to the SDK, and execute low-level actions (e.g. `walkTo(x,y)`) sent from the SDK through the gateway.

This means that the SDK can't talk directly to the game server, but must go through the botclient. It will attempt to launch the botclient on startup if one is not already running. 

You don't need to run the gateway/botclient in order to run automations against the demo server, but you may choose to if you are fixing bugs or adding features to the rs-sdk project


## Running the server locally

Running the server locally has many advantages, primary being the ability to set a high tickrate. 

You can set tickrate in `server/engine/.env` via the `NODE_TICKRATE` variable (default is 400ms, try 200ms or 30ms for faster gameplay, especially useful for headless testing). You can also change it at runtime with the in-game `::speed <ms>` command (minimum 20ms, doesn't persist across restarts).

You want all three of these running: 

```sh
# Game engine
cd server/engine && bun run start
```
```sh
# Web client bundler
cd server/webclient && bun run watch
```
```sh
# Gateway (bridges SDK <-> bot client)
cd server/gateway && bun run gateway
```

The gateway listens on `ws://localhost:7780` by default (configurable via `AGENT_PORT` env var).


### 2. Connect a bot to the local gateway

The `SERVER` variable in `bot.env` controls where the bot connects. To use your local gateway, **leave `SERVER` blank**:

```bots/<botname>/bot.env
BOT_USERNAME=mybot
PASSWORD=test
SERVER=
SHOW_CHAT=true
```

When `SERVER` is empty, all connection paths (scripts, CLI) default to `ws://localhost:7780`.

When `SERVER` is set to a hostname (e.g. `rs-sdk-demo.fly.dev`), they connect to `wss://{SERVER}/gateway` instead.



## Disclaimer

This is a free, open-source, community-run project.

The goal is strictly education and scientific research.

LostCity Server was written from scratch after many hours of research and peer review. Everything you see is completely and transparently open source.

We have not been endorsed by, authorized by, or officially communicated with Jagex Ltd. on our efforts here.

You cannot play Old School RuneScape here, buy RuneScape gold, or access any of the official game's services! Bots developed here will not work on the official game servers.


## License
This project is licensed under the [MIT License](https://opensource.org/licenses/MIT). See the [LICENSE](LICENSE) file for details.
