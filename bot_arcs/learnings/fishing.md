# Fishing

Successful patterns for fishing automation.

## Finding Fishing Spots

Fishing spots are **NPCs**, not locations:

```typescript
const spot = state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));
```

## Spot Types Matter

Different spots have different level requirements:

| Spot Options | Fish Type | Level |
|--------------|-----------|-------|
| Net, Bait | Shrimp, anchovies | 1+ |
| Net, Harpoon | Mackerel, cod, bass | 16+ |
| Lure, Bait | Trout, salmon | 20+ |

Filter for the right spot type:

```typescript
// Level 1 fishing - need "Bait" option (indicates small net spot)
const smallNetSpots = fishingSpots.filter(npc =>
    npc.options.some(opt => /^bait$/i.test(opt))
);
```

## Fishing Action

```typescript
const spot = state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));
const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));
await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
```

## Continuous Clicking Works

Don't over-engineer wait conditions. Just keep clicking:

```typescript
while (true) {
    // Dismiss any dialogs (level-ups)
    if (state.dialog.isOpen) {
        await ctx.sdk.sendClickDialog(0);
        continue;
    }

    const spot = state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));
    if (spot) {
        const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));
        await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
    }

    ctx.progress();
    await new Promise(r => setTimeout(r, 1000));
}
```

## Safe Fishing Locations

| Location | Coordinates | Spot Type | Notes |
|----------|-------------|-----------|-------|
| **Draynor Village** | **(3087, 3230)** | **Net/Bait** | **USE THIS for level 1.** Shrimp/anchovies. Dark wizards north - stay south if you are low combat level! |
| Lumbridge Swamp | (3239, 3147) | Lure/Bait | **WARNING: Fly fishing only (level 20+), NO small net spots!** |
| Barbarian Village | (3104, 3432) | Lure/Bait | Fly fishing (level 20+) |

**COMMON MISTAKE**: Lumbridge area (3238, 3251) has NO level-1 fishing spots. Use Draynor!

## Handling Drift

Fishing spots move. Check distance and walk back if needed:

```typescript
const START_AREA = { x: 3087, z: 3230 };
const MAX_DRIFT = 15;

const player = state.player;
const drift = Math.sqrt(
    Math.pow(player.worldX - START_AREA.x, 2) +
    Math.pow(player.worldZ - START_AREA.z, 2)
);

if (drift > MAX_DRIFT) {
    ctx.log(`Drifted ${drift.toFixed(0)} tiles, walking back`);
    await ctx.bot.walkTo(START_AREA.x, START_AREA.z);
}
```
