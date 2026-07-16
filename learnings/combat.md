# Combat

Successful patterns for combat training.

## Attacking NPCs

Use `bot.attackNpc()` for cleaner code, or raw SDK for more control:

```typescript
// Porcelain method (recommended)
await ctx.bot.attackNpc(/cow/i);

// Raw SDK method
const npc = state.nearbyNpcs.find(n => /cow/i.test(n.name));
const attackOpt = npc.optionsWithIndex.find(o => /attack/i.test(o.text));
await ctx.sdk.sendInteractNpc(npc.index, attackOpt.opIndex);
```

## Combat Style Cycling

Rotate styles for balanced training:

```typescript
// Combat style indices
const STYLES = {
    ATTACK: 0,    // Train Attack
    STRENGTH: 1,  // Train Strength
    STRENGTH2: 2, // Also Strength (some weapons)
    DEFENCE: 3,   // Train Defence
};

// Cycle every 30 seconds or on level-up
let lastStyleChange = Date.now();
const CYCLE_INTERVAL = 30_000;

if (Date.now() - lastStyleChange > CYCLE_INTERVAL) {
    currentStyle = (currentStyle + 1) % 4;
    if (currentStyle === 2) currentStyle = 3; // Skip duplicate strength
    await ctx.sdk.sendSetCombatStyle(currentStyle);
    lastStyleChange = Date.now();
}
```

## Checking Combat State

```typescript
// Optional chaining needed - combat can be undefined
const inCombat = state.combat?.inCombat ?? false;

// Or check if we're animating (attacking)
const isAttacking = state.player?.animId !== -1;
```

## Safe Training Locations

| Location | Coordinates | Targets | Notes |
|----------|-------------|---------|-------|
| Lumbridge cows | (3253, 3290) | Cows | Safe, good for all levels. Gate at (3253, 3270) |
| Lumbridge goblins | (3252, 3230) | Goblins, rats | Mixed enemies. Cluster runs NE from here — nothing at the old (3240, 3220) waypoint |
| Lumbridge chickens | (3237, 3295) | Chickens | Very safe, feathers drop |
| Al Kharid warriors | ~(3293, 3170) | `Al-Kharid warrior` (lvl 9) | Faster XP, kebabs nearby for food, can hit hard via multicombat vs low combat levels. |

## Cow Field Details (Proven from 200+ kills)

The cow field is fenced with a gate on the south side:
- **Field center**: ~(3253, 3290)
- **Gate position**: (3253, 3270)
- **Inside cow pen**: x between 3242-3265, z between 3255-3298

```typescript
function isInsideCowPen(x: number, z: number): boolean {
    return x >= 3242 && x <= 3265 && z >= 3255 && z <= 3298;
}
```

## Opening Gates

Cow field and chicken coop have fenced gates:

```typescript
// Check for gate blocking path
const gate = state.nearbyLocs.find(l => /gate/i.test(l.name));
if (gate) {
    const openOpt = gate.optionsWithIndex.find(o => /^open$/i.test(o.text));
    if (openOpt) {
        await ctx.bot.openDoor(gate);
    }
}
```

## Finding New Targets

After killing an NPC, find the next one quickly:

```typescript
async function findTarget(ctx, pattern: RegExp) {
    const state = ctx.sdk.getState();
    if (!state) return null;

    return state.nearbyNpcs
        .filter(n => pattern.test(n.name))
        .filter(n => n.optionsWithIndex.some(o => /attack/i.test(o.text)))
        .sort((a, b) => a.distance - b.distance)[0] ?? null;
}
```

## Looting Ground Items

**CRITICAL**: Use `sdk.scanGroundItems()` NOT `state.nearbyLocs` for dropped items!

```typescript
// WRONG - nearbyLocs is for static objects (trees, rocks, etc.)
const loot = state.nearbyLocs.filter(i => /hide/i.test(i.name));  // Won't work!

// CORRECT - scanGroundItems() for drops
const groundItems = await ctx.sdk.scanGroundItems();
const loot = groundItems.filter(i => /hide|bones|coins/i.test(i.name));
```

### Limit Pickups Per Loop

Pick up a few items (e.g. 3), then return to combat. Prevents getting stuck in infinite loot loops:

```typescript
const MAX_PICKUPS = 3;
const groundItems = await ctx.sdk.scanGroundItems();
const loot = groundItems
    .filter(i => /hide|bones/i.test(i.name))
    .filter(i => i.distance < 5)
    .slice(0, MAX_PICKUPS);

for (const item of loot) {
    await ctx.bot.pickupItem(item);
    await new Promise(r => setTimeout(r, 500));
}
// Back to combat
```

## Error Handling for Long Runs (Critical!)

Timeouts and errors are frequent in crowded areas. Wrap attacks in try/catch:

```typescript
// This pattern enabled consistent 10-minute runs
try {
    await ctx.bot.attackNpc(/cow/i);
} catch (err) {
    console.log(`Attack timed out, trying next cow`);
    continue;  // Don't crash - just find another target
}
```

### Common Messages and Handling

| Message | Meaning | Response |
|---------|---------|----------|
| "I'm already under attack" | Crowded area, NPC in combat | Find different target |
| "I can't reach that!" | Obstacle or fence | Move closer, check gates |
| Attack timeout | Target died/moved | Try next NPC |

### State Validation

Browser glitches sometimes return invalid positions. Validate state before acting:

```typescript
const player = ctx.sdk.getState()?.player;
if (!player || player.worldX === 0 || player.worldZ === 0) {
    console.log('Invalid state - waiting for sync');
    await new Promise(r => setTimeout(r, 2000));
    continue;
}

// Also catch impossible position changes (>500 tiles = glitch)
if (Math.abs(player.worldX - lastX) > 500) {
    console.log('Position glitch detected, skipping action');
    continue;
}
```

## Auto-Train Lowest Combat Stat

For balanced progression, automatically train whichever stat is lowest:

```typescript
function getLowestCombatStat(state): { stat: string, style: number } {
    const skills = state.skills;
    const atk = skills.find(s => s.name === 'Attack')?.baseLevel ?? 1;
    const str = skills.find(s => s.name === 'Strength')?.baseLevel ?? 1;
    const def = skills.find(s => s.name === 'Defence')?.baseLevel ?? 1;

    if (def <= atk && def <= str) return { stat: 'Defence', style: 3 };
    if (str <= atk) return { stat: 'Strength', style: 1 };
    return { stat: 'Attack', style: 0 };
}

// Set combat style based on lowest stat
const { stat, style } = getLowestCombatStat(ctx.sdk.getState());
await ctx.sdk.sendSetCombatStyle(style);
console.log(`Training ${stat} (lowest)`);
```

This pattern enabled balanced 60+ in all melee stats.
