Status: completed

Implemented Cook's Assistant as an auto-quest plugin using compiled `getQuestFact('cooks-assistant')` checklist data, a pure `nextCooksStep` selector, and Lumbridge fallback anchors for the Cook, ingredients, and mill.

Tests: `bun test bots/_shared/trainer/quests/cooks-assistant.test.ts bots/_shared/trainer/` (39 passed); `bun run typecheck` passed.

Live smoke: not run (optional; requires a bot session with `TRAINER_AUTO_QUESTS=1`).

## Critical findings follow-up

Status: completed

- The windmill flour step now verifies the hopper and flour-bin floors, retrying the appropriate staircase/ladder direction before each interaction and preserving progress on failure.
- Cook dialogs are advanced before recording quest start, and turn-in only records completion after ingredients are consumed or completion/experience chat confirms it.
- Added completion-evidence regression coverage.
