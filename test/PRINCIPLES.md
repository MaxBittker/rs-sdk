# Test Principles

## Speed
- Tests should complete (or fail) as quickly as possible
- Exit immediately when success criteria is met - don't keep running
- Exit immediately when failure is certain - don't waste time
- Minimize sleeps/delays to only what's necessary for game tick sync
- **Use minimal inventory**: 1 item instead of 5 - tests prove the mechanic works, not endurance

## Atomic Tests
- Each test should verify ONE mechanic in isolation
- Example: smelting (ore → bar) and anvil smithing (bar → item) are separate tests
- This makes failures easier to diagnose
- Keeps tests fast and focused

## Save File Generator
Use `test/utils/save-generator.ts` to spawn bots with pre-configured state:

```typescript
import { generateSave, Items } from './utils/save-generator';

await generateSave('mybotname', {
    position: { x: 3190, z: 3424 },  // Spawn location
    skills: { Smithing: 1 },          // Starting skill levels
    inventory: [
        { id: Items.BRONZE_BAR, count: 1 },
        { id: Items.HAMMER, count: 1 },
    ],
});
```

Benefits:
- Skip travel time - spawn exactly where needed
- Skip gathering - start with required items
- Control skill levels - test at specific levels
- Reproducible - same starting state every run

## Success Criteria
- Each test has a clear, minimal success criteria (e.g., "smith 1 dagger")
- Check success criteria frequently and exit early when met
- Don't over-test - once the goal is achieved, stop

## Avoid False Positives
- **Test the actual mechanic, not just setup steps**
  - BAD: Banking test passes because interface opened
  - GOOD: Banking test passes because item was deposited AND withdrawn
- **Success must verify observable state change**
  - XP increased (skills)
  - Item appeared/disappeared from inventory
  - Position changed (movement)
  - NPC/object state changed
- **Don't pass on "tried to do X"** - pass on "X actually happened"
- If SDK support is missing for the core action, the test should FAIL or be marked as TODO, not pass on partial completion

## Logging
- Log useful information for debugging (start state, key actions, final state)
- Don't spam logs in loops - log every Nth iteration or on state changes
- Always log the final result clearly (PASSED/FAILED)

## Shared Utilities
- Use shared utilities from `test/utils/` folder
- Use `launchBotWithSDK()` from `utils/browser.ts` to handle:
  - Browser launch (with muted audio)
  - Bot login
  - SDK connection
  - Tutorial skip
  - Cleanup
- Don't duplicate boilerplate across tests

## No Cheating
- **NEVER** use Puppeteer's `page.evaluate()` to directly manipulate game state
- **NEVER** reach into the engine or database to complete tasks
- All game actions must go through the SDK
- Tests should prove the bot can accomplish tasks the same way a real agent would

## Tutorial Handling

When using `generateSave()`, the save file sets varp 281 = 1000 (tutorial complete).

For tests using save files, use `skipTutorial: false` to avoid the SDK trying to skip an already-complete tutorial:

```typescript
session = await launchBotWithSDK(BOT_NAME, {
    headless: false,
    skipTutorial: false  // Save file already has tutorial complete
});
```

## Structure
```typescript
import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `test${Math.random().toString(36).slice(2, 5)}`;

async function runTest(): Promise<boolean> {
    // Generate save with pre-configured state
    await generateSave(BOT_NAME, {
        position: { x: 3190, z: 3424 },
        inventory: [{ id: Items.BRONZE_BAR, count: 1 }],
    });

    let session: SDKSession | null = null;
    try {
        session = await launchBotWithSDK(BOT_NAME, { skipTutorial: false });
        const { sdk, bot } = session;

        // Wait for state to load
        await sdk.waitForCondition(s => s.player?.worldX > 0, 10000);

        // ... test logic with early exit on success ...

        return success;
    } finally {
        if (session) await session.cleanup();
    }
}

runTest()
    .then(ok => { console.log(ok ? 'PASSED' : 'FAILED'); process.exit(ok ? 0 : 1); })
    .catch(() => process.exit(1));
```
