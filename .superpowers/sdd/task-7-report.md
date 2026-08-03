Status: completed

Implemented Cook's Assistant as an auto-quest plugin using compiled `getQuestFact('cooks-assistant')` checklist data, a pure `nextCooksStep` selector, and Lumbridge fallback anchors for the Cook, ingredients, and mill.

Tests: `bun test bots/_shared/trainer/quests/cooks-assistant.test.ts bots/_shared/trainer/` (39 passed); `bun run typecheck` passed.

Live smoke: not run (optional; requires a bot session with `TRAINER_AUTO_QUESTS=1`).

## Critical findings follow-up

Status: completed

- The windmill flour step now verifies the hopper and flour-bin floors, retrying the appropriate staircase/ladder direction before each interaction and preserving progress on failure.
- Cook dialogs are advanced before recording quest start, and turn-in only records completion after ingredients are consumed or completion/experience chat confirms it.
- Added completion-evidence regression coverage.

## Critical findings resolution

- Windmill traversal now selects a nearby staircase, stairs, or ladder only when it exposes the exact requested `climb-up` or `climb-down` option; each floor transition checks its destination for at most three attempts.
- Turn-in reads system chat only (`types: [0]`) and accepts chat confirmation only from a system message.
- Inventory turn-in evidence now requires the pot of flour, bucket of milk, and egg to all be absent; regression tests cover partial consumption and player-chat congratulations.
- Verification: `bun test bots/_shared/trainer/quests/cooks-assistant.test.ts bots/_shared/trainer/` (41 passed) and `bun run typecheck` passed.

## Turn-in chat baseline

Status: completed

- Turn-in now drains `getNewChat({ types: [0] })` before `talkTo`, then reads only post-dialog new chat — no retained history.
- Completion regex tightened to `cook's assistant|quest complete|you have completed|cooking experience`; bare `Congratulations!` rejected.
- Verification: `bun test bots/_shared/trainer/` (41 passed).
