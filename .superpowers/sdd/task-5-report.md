# Task 5 Report: Wiki resource preference in smart-select

## Status: Complete

Woodcutting and mining now prefer the highest wiki-available resource, ignore temporarily avoided locations, and travel to the appropriate training area when observation reports no local target or selection finds none.

## Changes

- `skills/smart-select.ts`
  - Adds optional preferred wiki resource scoring to trees and rocks.
  - Supports an optional avoided-location predicate while evaluating candidates.
- `skills/woodcutting.ts`
  - Uses the woodcutting wiki table to prefer the recommended tree.
  - Skips avoided tree locations and travels to Draynor for willow or Lumbridge otherwise.
- `skills/mining.ts`
  - Uses the mining wiki table to prefer the recommended ore.
  - Skips avoided rock locations and travels to the SE Varrock mine as needed.
- `skills/smart-select.test.ts`
  - Covers preferred-name scoring and avoided target selection.

## Verification

```sh
bun test bots/_shared/trainer/skills/smart-select.test.ts bots/_shared/trainer/planner.test.ts
# 17 pass, 0 fail

bun run typecheck
# pass
```

## Follow-up fixes

- Destructured `memory` from both skill run contexts so avoided-target checks use persisted trainer memory.
- Updated `bestResourceForLevel` to parse numeric-first resource rows, including the mining `Ores` table.
- Added a regression test for mining at level 1.

```sh
bun test bots/_shared/trainer/skills/smart-select.test.ts
# 5 pass, 0 fail
bun -e "…bestResourceForLevel('mining', 1)…"
# Copper 1
```
