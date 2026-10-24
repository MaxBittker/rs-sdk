# economy/ — bot-run RuneScape economy sandbox

Everything for the economy lives here so upstream rs-sdk stays mergeable.
Layout: `roles/` (one file per bot type — the file you edit most), `lib/` (shared
skills, market pricing, telemetry, agent step-runner), `runtime/` (launchers),
`populations/` (who exists; not written yet), `world/` (engine overrides; not written yet),
`runs/` (gitignored: logs + `events.ndjson` per run).

## Run the local stack (Phase 0 path)

```bash
# 1. engine (reads server/engine/.env: tick 300ms, IP cap 1000, GE on)
cd server/engine && bun run quickstart
# 2. private gateway (accepts any password; keep it on 127.0.0.1)
cd server/gateway && GATEWAY_HOSTNAME=127.0.0.1 LOGIN_SERVER=false bun gateway.ts
# 3. a bot account + its headless client (one process per bot for now)
bun bots/create-bot.ts spike001 --local
cd server/webclient && bun src/lite/runner.ts spike001
# 4. drive it with a role
bun economy/runtime/run-one.ts spike001 miner --cycles=1
```

Events append to `economy/runs/$ECON_RUN/events.ndjson` (default run `_dev`).

## Phase 0 findings (measured on a 2-core / 8 GB container)

| Question | Result |
|---|---|
| Fresh account | spawns Lumbridge (3222,3222) after `skipTutorial`; **0 coins**; has bronze pickaxe + axe, 18 starter items (88 units) |
| Cheats for seeding coins | need `staffModLevel >= 4`; login path gives 0 → needs an engine patch (log in `server/PATCHES.md`) |
| Miner: SE Varrock (3285,3365) | 19 reachable copper/tin/iron rocks in 15 tiles; 10 ore in ~106 s incl. walk-in |
| Trip overhead | bank walk ~73 s; one GE visit with 2 offers + collect ~8 s → **batch ≈ 25** (full inventory) |
| GE round trip | open → place → collect → close works; offers visible in `/api/market/items` (`ask`, `sellQuantity`) |
| 100 idle sessions | engine cycle 23 ms of a 300 ms budget, 549 MB RSS; client process ~1.7 GB (~17 MB/bot) |

**Not yet proven:** an offer actually *filling* (no coins exist yet), any bot-vs-bot trading,
the shard-host design, behaviour of bots that act (idle sessions are a floor, not a forecast).
RAM for client sessions, not the engine, looks like the first scaling limit on this box.

## Gotchas learned the hard way

- A depleted rock keeps its name; `mineRock` then returns `rejected`. `lib/skills/mine.ts` puts the rock on a cooldown and tries the next nearest.
- `pkill -f <pattern>` can match its own shell. Use `pgrep -f "[p]attern"`.
- The SE Varrock mine took ~3 HP off a level-3 account. Roles need an HP check before mining there.
- `bots/mnr001` pre-dates this work (leftover from the environment snapshot); untouched.

## Open decisions

1. **Seed capital.** Options: (a) a small, logged engine patch granting starter coins or honouring a staff-account env var; (b) purely organic — coins only from NPC shop sales and drops. (b) is more faithful but unverified: I have not yet checked whether any NPC shop buys ore or what the price multipliers are.
2. **Shard host.** Replace "one lite process per bot" with ~40 sessions per process (`swarm.ts` is the pattern). `LiteGatewayRunner` in `runner.ts` is not exported and runs its CLI on import, so it needs a small refactor of vendored code.
