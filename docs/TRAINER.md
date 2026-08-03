# Progressive Trainer

Wiki-aware progressive skill bot for RS-SDK.

## Quick start

```sh
bun install
bun run progressive
```

Smoke test:

```sh
bun run progressive -- --max-seconds=90 --no-stack
```

## Phased roadmap

### Phase 1 (live) — early ladder + observe layer

1. Thieving → 100gp opening cash → Thieving 40  
2. Buy bronze axe (Bob) → Woodcutting 30  
3. Buy knife (look-ahead) → Fletching 20 (WC for logs, sell bows)  
4. Buy pickaxe → Mining 30  
5. Combat cows → Attack/Strength/Defence 40  
6. **Cook's Assistant** when `TRAINER_AUTO_QUESTS=1` (wiki facts + live observation gates)

Hardening included: tool catalog, bank sessions, bow sell threshold, stun wait, reconnect wait, wiki nearest shop fallback, and the observe layer below.

**Design spec:** [`docs/superpowers/specs/2026-08-03-observe-wiki-trainer-design.md`](superpowers/specs/2026-08-03-observe-wiki-trainer-design.md)

### Phase 2 (scaffold) — extended ladder + more quests

- Extended skills: `TRAINER_EXTENDED=1` adds fishing/cooking/firemaking after melee 40
- Additional quests from `bots/_shared/trainer/quests/` registry (same observe/wiki path)

## Architecture

```
wiki/  ──compile──►  trainer/data/*.json
bots/progressive → progressive-trainer → runtime
  observe/  snapshot → memory → hints → confirm
  planner/choose-task + ladder
  skills/* plugins
  bank/kits + tools + session
  quests/* (Cook's Assistant when TRAINER_AUTO_QUESTS=1)
```

### Observe layer (each tick)

Build order is fixed: **live snapshot → memory → wiki confirm**.

```
tick
  → snapshot.buildObservation()   // HP, invent, nearby, chat, UI flags, action errors
  → memory.updateFromObservation() // avoidUntil, lastConfirm, stall counters
  → hints.derivePlannerHints()    // noTargetNearby, lowHp, recentFail, questReady
  → chooseTask()                  // existing ladder + hints (break sticky on fail)
  → skill / quest                 // wiki targets filtered by avoids + nearby
  → confirm()                     // XP / items / chat → success or avoid
```

| Module | Role |
|--------|------|
| `observe/snapshot.ts` | One `Observation` per tick from SDK state |
| `observe/hints.ts` | `PlannerHints` for interrupts and sticky breaks |
| `observe/confirm.ts` | XP/item/chat success checks + fail classification |
| `memory.ts` | Persisted `avoidUntil`, `lastConfirm`, quest step flags |

Skills and quests use wiki/world indexes for targets; `TRAINING_AREAS` remains fallback when world-index lacks coords.

## Environment flags

| Variable | Default | Effect |
|----------|---------|--------|
| `TRAINER_AUTO_QUESTS` | off | `1` enables Cook's Assistant quest plugin between ladder steps |
| `TRAINER_EXTENDED` | off | `1` adds fishing/cooking/firemaking after melee 40 |
| `TRAINER_MAX_SECONDS` | `0` | Cap runtime (0 = unlimited) |

Enable quests when attaching to a live client:

```sh
bun scripts/attach-progressive.ts --user=Name --password=secret --quests
```

Or set `TRAINER_AUTO_QUESTS=1` in `bots/<user>/bot.env`, or export it before attach (attach forwards it into generated `bot.env`).

### Adding a skill

1. `skills/{id}.ts` → `SkillPlugin`
2. Register in `skills/registry.ts`
3. Kit in `bank/kits.ts` + optional entry in `bank/tools.ts`
4. Ladder step in `planner/ladder.ts`

### Adding a quest

1. `quests/{id}.ts` implementing `QuestPlugin` (gate steps on observation: inventory, nearby NPCs, dialog)
2. `registerQuest(...)` in `quests/registry.ts` bootstrap
3. Compile facts in `wiki-index.json` via `bun scripts/wiki-index.ts`
4. Set `TRAINER_AUTO_QUESTS=1` (or attach with `--quests`)
