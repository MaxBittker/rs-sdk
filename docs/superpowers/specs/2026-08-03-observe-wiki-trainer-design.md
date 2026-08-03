# Observe + Wiki Progressive Trainer — Design

**Date:** 2026-08-03
**Status:** approved (conversation); awaiting implementation plan
**Goal:** Make the progressive bot smarter by observing the game and using wiki knowledge, without replacing the existing early ladder.

## Intent

- **Breadth direction:** more skills + quests + shops over time (roadmap C).
- **Priority mix:** first stable/safe progress, then completeness (D).
- **Phase 1 milestone:** early ladder + Cook’s Assistant completed via wiki facts (C).
- **Observation build order:** live reaction → short-term memory → wiki+observe confirm (A→B→C, all three).
- **Architecture choice:** observer layer on top of the current ladder/planner (approach 1), not a full wiki-goal rewrite.

## Phase 1 success criteria

1. Early ladder remains: Thieving 40 → WC 30 → Fletching 20 → Mining 30 → Melee 40.
2. Bot reacts to live state (HP, invent, nearby, chat/action errors) each tick.
3. Failures create short-lived avoids in memory; sticky goals break on observation hints.
4. Resource/travel choices prefer wiki/world indexes over hard-coded-only areas where possible.
5. Cook’s Assistant can complete end-to-end when `TRAINER_AUTO_QUESTS=1`, driven by `wiki-index` facts + observation gates.
6. Focused unit tests cover snapshot, memory avoid, planner hints, and Cook’s step selection.

## Non-goals (phase 1)

- Full quest engine for all ~59 indexed quests.
- Compiling/consuming all of `wiki/items/` (~1500+).
- Training every skill to high levels.
- Replacing `chooseTask` with a pure scored wiki-goal planner (that is phase 2+ on this architecture).

## Architecture

```
tick
  → observe()        // live snapshot
  → memory.update()  // avoids, last confirms, stalls
  → chooseTask()     // existing planner + observation hints
  → skill / quest    // wiki + observe for targets/locations
  → confirm()        // XP / items / chat → success or avoid
```

Keep: reconnect loop (`progressive-trainer.ts`), ladder (`planner/ladder.ts`), skill plugins, bank sessions.

Add: shared observation layer between runtime and skills/quests.

## Components

### `observe/snapshot.ts`

Per-tick `Observation`:

- Position, HP, levels, inventory summary
- UI flags: dialog / shop / bank open
- Nearby actionable targets (trees, rocks, NPCs, bank booths)
- Recent chat / game messages
- Last action error (`cant_reach`, stun, empty interact, …)

Produced once per runtime tick and passed into planner + active skill/quest.

### Memory (extend existing `memory.ts`)

Persist in `trainer-memory.json`:

- Existing sticky + stall counters
- `avoidUntil`: spot / NPC / loc id → expiry tick or timestamp
- `lastConfirm`: skill/quest id → success|fail + reason
- Short notes for debugging

Expiry clears avoids so the bot can retry later.

### Wiki / world wiring

- Skills call `bestResourceForLevel` (already in `knowledge/wiki.ts`, currently unused in live path) for tier choice.
- Travel prefers `nearestNpc` / `nearestShop` / world points; `TRAINING_AREAS` remains fallback.
- Cook’s Assistant reads quest fact from `wiki-index.json` (`itemsNeeded`, `keyNpcs`, walkthrough-derived steps).

### Planner hints (extend `choose-task.ts`)

Extend `PlannerInput` with observation-derived flags, e.g.:

- `noTargetNearby`
- `lowHp`
- `recentFail`
- `questReady`

Effects:

- Break sticky earlier when observation says the current goal cannot progress.
- Interrupt to food/bank/supply/quest when hints fire.
- Keep interrupt priority order coherent with existing sell/bank/tool logic.

### Confirm loop in skills

After an action:

1. Check XP delta, inventory delta, and/or matching chat.
2. On success: clear related stall; optional sticky extend.
3. On fail: write avoid; increment stall; return control so planner can react next tick.

Apply first to thieving, woodcutting, mining, combat; then fishing/cooking as needed.

### Cook’s Assistant quest plugin

- Implement/register `quests/cooks-assistant.ts`.
- Steps gated by observation (has item? NPC nearby? dialog open?).
- On blocked precondition: note + yield to ladder until ready (do not infinite-loop one step).
- Enabled with `TRAINER_AUTO_QUESTS=1` (and coins ≥ existing gate if still required).

## Data flow

1. `runtime.ts` builds `Observation`.
2. Memory merges observation (new fails, expire avoids).
3. `chooseTask(plannerInput + hints)` returns decision.
4. Sticky may override unless hints force break.
5. Skill/quest executes using wiki targets filtered by avoids + nearby.
6. Confirm updates memory; loop.

## Error handling

| Signal | Response |
|--------|----------|
| `cant_reach` / stun / nothing interesting | 1–2 local retries, then `avoidUntil` |
| No target in scan radius | Wiki/world next-best location; after N fails → existing stall escape |
| Low HP in combat | Food or bank interrupt via planner hint |
| Quest step blocked | Note + return to ladder until precondition met |
| Disconnect | Existing outer reconnect; memory stays on disk |

## Testing

- Snapshot builders from mock SDK state/chat strings.
- Memory avoid write + expiry.
- Planner: `noTargetNearby` / `recentFail` breaks sticky; `questReady` can interrupt.
- Cook’s: step selection from wiki fact + mock invent/NPC presence.
- Keep existing planner/smart-select tests green.

## File touch list (expected)

| Path | Change |
|------|--------|
| `bots/_shared/trainer/observe/snapshot.ts` | New |
| `bots/_shared/trainer/memory.ts` | Avoids + confirm fields |
| `bots/_shared/trainer/runtime.ts` | Observe → plan → confirm |
| `bots/_shared/trainer/planner/choose-task.ts` | Hints |
| `bots/_shared/trainer/types.ts` | Observation / hint types |
| `bots/_shared/trainer/knowledge/wiki.ts` | Live use of resource tables |
| `bots/_shared/trainer/knowledge/world.ts` | Travel helpers used by skills |
| `bots/_shared/trainer/skills/*.ts` | Confirm + wiki targets |
| `bots/_shared/trainer/skills/smart-select.ts` | Prefer wiki tiers |
| `bots/_shared/trainer/quests/cooks-assistant.ts` | Real steps |
| `bots/_shared/trainer/quests/registry.ts` | Register Cook’s |
| `bots/_shared/trainer/**/*.test.ts` | New/updated tests |
| `docs/TRAINER.md` | Document observe layer + phase 1 milestone |

## Later phases (same architecture)

- More quests from wiki-index registry.
- Extended ladder skills using the same observe/wiki path.
- Optional scored multi-goal planner once observation + wiki wiring are proven.
- Item wiki compile only if supply/gear needs demand it.

## Open decisions (resolved in conversation)

- Approach: observer on ladder (not full wiki planner, not per-skill-only).
- Phase 1 end: ladder + Cook’s Assistant.
- Observe order: live → memory → wiki confirm.
