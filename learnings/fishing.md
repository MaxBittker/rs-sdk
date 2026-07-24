# Fishing

Successful patterns for fishing automation.

## Finding Fishing Spots

Fishing spots are **NPCs**, not locations:

```typescript
const spot = sdk.getState()?.nearbyNpcs.find((npc) => /fishing\s*spot/i.test(npc.name));
```

## Spot Types Matter

Different spots have different level requirements:

| Spot Options | Fish Type           | Level |
| ------------ | ------------------- | ----- |
| Net, Bait    | Shrimp, anchovies   | 1+    |
| Net, Harpoon | Mackerel, cod, bass | 16+   |
| Lure, Bait   | Trout, salmon       | 20+   |

Filter for the right spot type:

```typescript
// Level 1 fishing - need "Bait" option (indicates small net spot)
const fishingSpots = sdk.getState()?.nearbyNpcs.filter(
  npc => /fishing\s*spot/i.test(npc.name),
) ?? [];
const smallNetSpots = fishingSpots.filter((npc) =>
  npc.optionsWithIndex.some((opt) => /^bait$/i.test(opt.text)),
);
```

## Fishing Action

```typescript
const spot = sdk.getState()?.nearbyNpcs.find((npc) => /fishing\s*spot/i.test(npc.name));
const netOpt = spot?.optionsWithIndex.find((o) => /^net$/i.test(o.text));
if (spot && netOpt) await sdk.sendInteractNpc(spot.index, netOpt.opIndex);
```

## Continuous Clicking Works

Don't over-engineer wait conditions. Just keep clicking:

```typescript
while (true) {
  const state = sdk.getState();
  if (!state) {
    await sdk.waitForStateUpdate();
    continue;
  }

  // Dismiss any dialogs (level-ups)
  if (state.dialog.isOpen) {
    await sdk.sendClickDialog(0);
    continue;
  }

  const spot = state.nearbyNpcs.find((npc) => /fishing\s*spot/i.test(npc.name));
  if (spot) {
    const netOpt = spot.optionsWithIndex.find((o) => /^net$/i.test(o.text));
    if (netOpt) await sdk.sendInteractNpc(spot.index, netOpt.opIndex);
  }

  await new Promise((r) => setTimeout(r, 1000));
}
```

## Safe Fishing Locations

| Location            | Coordinates      | Spot Type    | Notes                                                                                                                                     |
| ------------------- | ---------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Draynor Village** | **(3087, 3230)** | **Net/Bait** | **USE THIS for level 1.** Shrimp/anchovies. Dark wizards at (3084, 3236)/(3085, 3238) — stay south of z≈3232 if you are low combat level! |
| Al Kharid river     | (3267, 3148)     | Lure/Bait    | Fly fishing (level 20+). 10gp toll gate to reach. Watch for a lvl 14 scorpion.                                                            |
| Barbarian Village   | (3110, 3434)     | Lure/Bait    | Fly fishing (level 20+). Second spot at (3104, 3424).                                                                                     |

**COMMON MISTAKE**: Lumbridge area (3238, 3251) has NO level-1 fishing spots. Use Draynor!

**COMMON MISTAKE**: Lumbridge Swamp **(3239, 3147)** has NO fishing spots _at all_ — not net, not lure/bait. Verified against map spawn data: nearest spot is 28 tiles east at (3267, 3148) across the toll gate. Do not walk here to fish.

## Handling Drift

Fishing spots move. Check distance and walk back if needed:

```typescript
const START_AREA = { x: 3087, z: 3230 };
const MAX_DRIFT = 15;

const player = sdk.getState()?.player;
if (!player) throw new Error('No player state');
const drift = Math.sqrt(
  Math.pow(player.worldX - START_AREA.x, 2) +
    Math.pow(player.worldZ - START_AREA.z, 2),
);

if (drift > MAX_DRIFT) {
  console.log(`Drifted ${drift.toFixed(0)} tiles, walking back`);
  await bot.walkTo(START_AREA.x, START_AREA.z);
}
```
