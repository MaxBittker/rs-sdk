# Script Improvement Methodology

A scientific approach to developing and iterating on automation scripts.

**Scope**: Fresh accounts, single-play session scripts. 

## Core Principles

1. **Fail Fast** - Detect stagnation early. If no progress for 30s, abort and log why.

2. **Inspectable Runs** - Every run produces artifacts that answer: what happened, why did it fail, what could improve?

3. **Horizontal Structure** - Each script is independent. Its runs, logs, and improvements live together so it can evolve on its own.

4. **Insights Over Data** - Log meaningful events (actions taken, outcomes) not noise. The goal is to extract learnings like "this approach worked" or "this caused failure."

5. **Confidence-Based Timeouts** - Start with short runs (1-3 mins) to validate new approaches, then extend as confidence builds if need more time

6. **Robustness at depth** - Scripts improve via the lab log cycle: run → observe → hypothesize → fix → repeat. We want to stay simple but scale towards success at longer goal time horizons.

## The Iteration Cycle

```
Hypothesize → Implement → Run → Observe → Record in lab_log → Improve → Repeat
```

1. **Define Goal** - What does success look like? What's the reward function?
2. **Write Script** - Implement v1 using `runScript()`
3. **Run** - Execute with automatic instrumentation
4. **Analyze** - Review events.jsonl, screenshots, state snapshots
5. **Document** - Record insights in lab_log.md
6. **Improve** - Fix issues, optimize approach
7. **Repeat**

## Autonomous Testing

**Scripts must be run and tested, not just written.** The agent should:

1. **Run the script** after writing it using `bun scripts/<name>/script.ts`
2. **Observe the output** - watch for errors, stalls, timeouts, or unexpected behavior
3. **Analyze what happened** - read the run logs, check events.jsonl if needed
4. **Fix issues immediately** - don't wait for user feedback on obvious problems
5. **Re-run until stable** - a script isn't "done" until it runs successfully

This is a closed-loop process. Writing code without running it is incomplete work. The goal is working automation, not just code that compiles.

## Directory Structure

```
scripts/
├── CLAUDE.md                   # This file
├── script_best_practices.md    # Common patterns & pitfalls
├── script-runner.ts            # Shared runner infrastructure
└── <script-name>/              # Each script is self-contained
    ├── script.ts               # The automation code
    ├── lab_log.md              # Observations & improvements
    └── runs/
        └── <timestamp>/
            ├── metadata.json   # Goal, duration, outcome
            ├── events.jsonl    # All logged events
            └── screenshots/
```

## Using the Script Runner

The `runScript()` function provides automatic instrumentation - no manual logging needed.

```typescript
import { runScript, TestPresets } from './script-runner';

runScript({
  name: 'goblin-killer',           // Creates scripts/goblin-killer/
  goal: 'Kill goblins to level 10', // CONSTRAINT: what success looks like
  preset: TestPresets.LUMBRIDGE_SPAWN, // CONSTRAINT: starting conditions (don't modify!)
  timeLimit: 10 * 60 * 1000,       // 10 minutes (default: 5 min)
  stallTimeout: 30_000,            // 30 seconds (default)
}, async (ctx) => {

  while (ctx.state()?.player?.combatLevel < 10) {
    const goblin = ctx.sdk.findNearbyNpc(/goblin/i);
    if (goblin) {
      ctx.log(`Attacking ${goblin.name}`);    // → console + events.jsonl
      await ctx.bot.attackNpc(goblin);         // Auto-logged with result
      ctx.progress();                          // Reset stall timer
    }
  }

  ctx.log('Goal achieved!');
});
```

### Context API

| Method | Purpose |
|--------|---------|
| `ctx.bot.*` | Instrumented BotActions - all calls auto-logged |
| `ctx.sdk.*` | Raw SDK - not logged |
| `ctx.log(msg)` | Log to console AND events.jsonl |
| `ctx.progress()` | Reset stall timer (call after meaningful progress) |
| `ctx.screenshot(label?)` | Take manual screenshot |
| `ctx.state()` | Get current world state |

### What Gets Logged Automatically

| Event Type | Contents |
|------------|----------|
| `action` | BotActions calls with args, result, duration, **state delta** |
| `console` | Script's log/warn/error output |
| `state` | Periodic state snapshots (every 10s) |
| `screenshot` | Visual state (every 30s) |
| `error` | Failures with full stack trace and game state context |

**State deltas** show what changed after each action:
```
[delta] LEVEL UP: Fishing 4 -> 5 | XP: Fishing +40xp | +INV: Raw shrimps x3
[delta] HP: 10 -> 7 (-3) | KILLED: Goblin
[delta] EQUIPPED: Bronze sword | -INV: Coins x50
```

**Console deduplication** collapses repeated messages:
```
Waiting for fishing spot...
  [x4]
Found spot, fishing...
```

### Configuration

```typescript
interface ScriptConfig {
  name: string;              // Script folder name
  goal: string;              // What success looks like (CONSTRAINT)
  preset?: TestPreset;       // Starting conditions (CONSTRAINT - don't modify!)
  timeLimit?: number;        // Max runtime (default: 5 min)
  stallTimeout?: number;     // No-progress timeout (default: 30s)
  screenshotInterval?: number; // Screenshot frequency (default: 30s)
}
```

### Choosing Timeouts

Choose timeout based on confidence in the approach:

| Duration | Use Case |
|----------|----------|
| **1-2m** | New scripts, untested approaches, debugging |
| **5m** | Validated approach, building confidence |
| **10m+** | Proven strategy, final optimization runs |

**Pattern**: Start short, extend as you prove it works. A failed 10-minute run wastes more time than five 2-minute diagnostic runs.

## Lab Log Format

Document insights in `lab_log.md`:

```markdown
# Lab Log: goblin-killer

## Run 001 - 2026-01-24 12:30

**Outcome**: stall
**Duration**: 45s

### What Happened
- Found goblin, started combat
- Goblin died, loot dropped
- Script didn't pick up loot, kept looking for goblins

### Root Cause
Missing loot pickup after kills

### Fix
Add `await bot.pickupItem(/bones|coins/)` after combat ends

---

## Run 002 - 2026-01-24 12:45

**Outcome**: success
**Duration**: 8m 32s

### What Worked
- Loot pickup fix resolved stall
- Reached level 10 successfully

### Optimization Ideas
- Could prioritize goblins by distance
- Add eating when HP low
```

## Handling Surprise

**Surprise is normal.** Scripts fail. Actions don't work. Something unexpected happens. When this occurs:

1. **Don't panic** - Read the error output carefully. The runner now shows full stack traces and game state.
2. **Drop to a short timeout** - Switch to a 1-minute diagnostic run to understand what's happening.
3. **Check the state delta** - Did the action actually change anything? The `[delta]` output tells you.
4. **Review game messages** - Often the game tells you why something failed ("You can't reach that", "Inventory full", etc.)

### Common Surprises

| Surprise | What to check | Response |
|----------|---------------|----------|
| **Action does nothing** | Is dialog open? Is there an obstacle? | Check `state.dialog.isOpen`, try `bot.dismissBlockingUI()` |
| **Can't find NPC/object** | Are we in the right place? Did it despawn? | Log position, check `nearbyNpcs`/`nearbyLocs` |
| **Script stalls** | Is player animating? Stuck in dialog? | Check `player.animId`, `dialog.isOpen` |
| **Unexpected error** | Read the full stack trace | The state context shows position, HP, inventory |

## Best Practices

See **[script_best_practices.md](./script_best_practices.md)** for detailed patterns and common pitfalls (dialog handling, fishing spots, state quirks, etc.).

1. **Preset is a constraint, not a variable** - The `preset` defines your starting conditions and is a fixed constraint like the `goal`. During script optimization:
   - **DO NOT** modify the preset to improve your score
   - **DO NOT** create custom spawn configs (saveConfig is not available)
   - **DO** optimize your script logic to work within the given constraints

   The preset is chosen by the user, not the agent. If a script needs different starting conditions, that's a conversation with the user - not something to "solve" by spawning with advantages.

2. **Dismiss blocking dialogs** - Level-up congratulations and other dialogs block all actions. Check `state.dialog.isOpen` in your main loop and call `ctx.sdk.sendClickDialog(0)` to dismiss.

3. **Call `ctx.progress()`** after meaningful actions to reset stall timer
4. **Use `ctx.log()`** for key decisions - it goes to events.jsonl for later analysis
5. **Watch the `[delta]` output** - It tells you what actually changed after each action
6. **Review events.jsonl** to understand what happened
7. **Document insights** in lab_log.md - patterns that work, issues that fail
8. **One change at a time** - easier to attribute improvements/regressions
9. **Commit working versions** before major changes

## Learnings Section

After a run of improvement (5+ cycles or whenever you run out of ideas / feel stuck), add a **Learnings** section to the end of the lab_log with three categories:

```markdown
---

## Learnings

### 1. Strategic Findings
What works and what doesn't - both code patterns and game strategies:
- Effective approaches discovered
- Failed strategies and why they failed
- Optimal parameters found (batch sizes, thresholds, timing)
- Game mechanics insights

### 2. Process & Tooling Reflections
Meta-observations on the improvement process itself:
- What made debugging easier/harder
- Logging improvements that would help
- Run analysis techniques that worked
- Suggestions for the script-runner or methodology

### 3. SDK Issues & Gaps
Problems or missing features in the Bot SDK:
- Functions that don't work as expected
- Missing functionality that would help
- API design issues encountered
- Workarounds that shouldn't be necessary
```

This helps capture institutional knowledge that benefits future scripts and SDK development.

