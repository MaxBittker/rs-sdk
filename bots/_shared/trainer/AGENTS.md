# Trainer agent guide

| Goal | Files |
|------|-------|
| Add/fix a skill | `skills/{id}.ts` + `skills/registry.ts` + `bank/kits.ts` |
| Buy tools | `bank/tools.ts` + `skills/supply.ts` |
| Change ladder | `planner/ladder.ts` |
| Change priorities | `planner/choose-task.ts` |
| Bank keep/withdraw | `bank/kits.ts` + `bank/session.ts` |
| Quests (phase 2) | `quests/{id}.ts` + `quests/registry.ts` |
| Wiki facts | `bun run wiki:index` → `data/*.json` |
| Training areas | `knowledge/wiki.ts` |

Env:

- `TRAINER_MAX_SECONDS` — stop after N seconds (0 = forever)
- `TRAINER_EXTENDED=1` — post-40 fishing/cooking/firemaking
- `TRAINER_AUTO_QUESTS=1` — enable quest plugins

Runtime never loads raw `wiki/` markdown.
