# Thieving

Successful patterns for thieving training.

## Pickpocketing Men (Level 1-40)

Men at Lumbridge castle are excellent for early thieving. Proven: 1 → 43 in ~10 minutes.

### Location

| Target | Coordinates | Notes |
|--------|-------------|-------|
| Men at Lumbridge castle | (3222, 3218) | Multiple men, "Pickpocket" option |

### Basic Pickpocket Pattern

```typescript
// Find a man to pickpocket
const man = ctx.sdk.getState()?.nearbyNpcs.find(n => /^man$/i.test(n.name));
if (!man) {
    console.log('No man found nearby');
    return;
}

// Find the Pickpocket option
const pickpocketOpt = man.optionsWithIndex.find(o => /pickpocket/i.test(o.text));
if (!pickpocketOpt) {
    console.log('No pickpocket option on this NPC');
    return;
}

// Execute pickpocket
await ctx.sdk.sendInteractNpc(man.index, pickpocketOpt.opIndex);
await new Promise(r => setTimeout(r, 1500));  // Wait for result
```

### XP and Gold Rates

| Outcome | GP Gained | XP |
|---------|-----------|-----|
| Success | 3 GP | 8 XP |
| Success (bonus) | 6 GP | 8 XP |
| Stunned | 0 GP | 0 XP |

- ~52 successful pickpockets = 200+ GP and level 43
- Stun recovery takes ~5 seconds

### Handling Stuns

When caught, the character is stunned for ~5 seconds:

```typescript
// Check for stun (player can't act)
const messages = ctx.sdk.getState()?.gameMessages ?? [];
const wasStunned = messages.some(m => /stunned|caught/i.test(m.text));

if (wasStunned) {
    console.log('Stunned! Waiting for recovery...');
    await new Promise(r => setTimeout(r, 5000));  // 5 second stun
}
```

### Full Thieving Loop

```typescript
async function pickpocketLoop(ctx, duration: number) {
    const startTime = Date.now();
    let successCount = 0;

    while (Date.now() - startTime < duration) {
        // Dismiss any dialogs first
        if (ctx.sdk.getState()?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            continue;
        }

        // Find target
        const man = ctx.sdk.getState()?.nearbyNpcs.find(n => /^man$/i.test(n.name));
        if (!man) {
            // Walk to Lumbridge castle
            await ctx.bot.walkTo(3222, 3218);
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Pickpocket
        const opt = man.optionsWithIndex.find(o => /pickpocket/i.test(o.text));
        if (opt) {
            await ctx.sdk.sendInteractNpc(man.index, opt.opIndex);
            await new Promise(r => setTimeout(r, 1500));
            successCount++;
        }
    }

    console.log(`Completed ${successCount} pickpocket attempts`);
}
```

## Thieving + Banking Loop

Bank when you hit 200-500 GP to avoid losing progress on disconnect:

```typescript
const GP_BANK_THRESHOLD = 500;

// Check GP in inventory
const coins = ctx.sdk.getState()?.inventory.find(i => /coins/i.test(i.name));
const gp = coins?.count ?? 0;

if (gp >= GP_BANK_THRESHOLD) {
    console.log(`Have ${gp} GP - banking!`);
    await bankTrip(ctx);  // Walk to Draynor, deposit
}
```

Draynor Bank is closest to Lumbridge thieving spot.

## Al Kharid Thieving (with Kebab Sustain)

Al Kharid is excellent for sustained thieving because kebabs cost only 1gp and can heal the stun damage. Warriors can also be thieved.

### Location
| Target | Coordinates | Notes |
|--------|-------------|-------|
| Al-Kharid warriors near palace | ~(3293, 3170) | Good density. NPC name is `Al-Kharid warrior` (id 18) — **not** "Man". Has a Pickpocket option |
| Al Kharid men | ~(3277, 3187), (3294, 3196) | NPC name `Man` (id 16), also pickpocketable, but scattered — 15+ tiles north of the warriors |
| Kebab seller (kebabs) | (3273, 3180) | 1gp per kebab (dialog shop).

### Thieving + Kebab Loop

```typescript
const MIN_KEBABS = 3;
const EAT_HP_THRESHOLD = 7;

// Check if we need food
const hp = getHP(ctx);
const kebabCount = getKebabCount(ctx);

if (hp.current <= EAT_HP_THRESHOLD) {
    // Eat food if available
    const food = ctx.sdk.getState()?.inventory.find(i => /kebab/i.test(i.name));
    if (food) {
        const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
        await ctx.sdk.sendUseItem(food.slot, eatOpt.opIndex);
    }
}

// Restock kebabs if low
if (kebabCount < MIN_KEBABS && getCoins(ctx) >= 3) {
    await ctx.bot.walkTo(3273, 3180);  // Kebab seller
    // ... buy kebab dialog (see dialogs.md)
}

// Walk to the warriors if not nearby
const distToTargets = /* calculate distance to (3293, 3170) */;
if (distToTargets > 15) {
    await ctx.bot.walkTo(3293, 3170);
}

// Pickpocket - match the actual NPC name, /^man$/i finds nothing here
const target = ctx.sdk.getState()?.nearbyNpcs.find(n => /^al-kharid warrior$/i.test(n.name));
// ... standard pickpocket pattern
```

### Results from calk Character

- Thieving 1 → 54 in ~15 minutes total
- ~3gp per successful pickpocket
- ~70% success rate at higher levels
- Kebab sustain works well (bought 14, ate ~28 including starting food)


### Baker's Stall Cake Stealing (Safe Spot)

Stand on **(2669, 3310)** to steal from the **east** Baker's stall at (2667, 3310) without guards aggroing. This is a safe spot — guards don't path here.

- **Heads up on the stand tile**: (2669, 3310) is the Baker's own spawn tile, and Baker (id 571) is `blockwalk=yes`. You can only stand there once he has wandered off it — expect the walk to fail or stop short while he's home. Retry, or accept an adjacent tile.
- **Only use the east stall** — the west stall at (2655, 3311) has no safe spot and guards will attack.
- Stall id: 2561, steal opIndex: 2
- Gives cakes, bread, chocolate slices (all heal HP)
- Use cakes to sustain HP while pickpocketing knights/heroes

```typescript
// Safe spot cake stealing
const SAFE_X = 2669, SAFE_Z = 3310;
const STALL_X = 2667, STALL_Z = 3310;

// Make sure you're on the safe spot
await sdk.sendWalk(SAFE_X, SAFE_Z, true);
await sdk.waitForTicks(5);

// Steal - find stall by coords to avoid targeting wrong one
const locs = sdk.getState()?.nearbyLocs ?? [];
const eastStall = locs.find(l =>
    l.x === STALL_X && l.z === STALL_Z &&
    l.optionsWithIndex.some(o => /steal/i.test(o.text))
);
if (eastStall) {
    await sdk.sendInteractLoc(STALL_X, STALL_Z, eastStall.id, 2);
    await sdk.waitForTicks(4);
}
```

## Why Thieving for Money?

Thieving requires no tools or equipment - making it ideal for:
- Early game gold farming
- Recovery after death (lost all items)
- Characters with no starting capital

With Attack 70+ you could easily farm goblins for drops, but thieving works from level 1 with nothing in inventory.
