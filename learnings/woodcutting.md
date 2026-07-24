# Woodcutting

Successful patterns for woodcutting automation.

## Finding Trees

Trees are **locations** with "Chop down" option:

```typescript
const tree = sdk.getState()?.nearbyLocs
    .filter(loc => /^tree$/i.test(loc.name))
    .filter(loc => loc.optionsWithIndex.some(o => /chop/i.test(o.text)))
    .sort((a, b) => a.distance - b.distance)[0];
```

## Chopping Action

```typescript
// Using porcelain method
const result = await bot.chopTree();

// Or raw SDK
const chopOpt = tree.optionsWithIndex.find(o => /chop/i.test(o.text));
await sdk.sendInteractLoc(tree.x, tree.z, tree.id, chopOpt.opIndex);
```

## Tree Locations

| Location | Coordinates | Tree Types |
|----------|-------------|------------|
| Lumbridge trees | (3195, 3220) | Regular trees. Large cluster spreading west/south from here |
| Draynor willows | (3087, 3235) | Willow (level 30+). **DANGER: Dark wizards spawn at (3084, 3236)/(3085, 3238)** — right in the willows. Avoid under combat level 20 |
| Varrock oaks | (3190, 3458) | Oak (level 15+) |

## Handling Drift

Stay within a reasonable area:

```typescript
const TREE_AREA = { x: 3195, z: 3220 };
const MAX_DRIFT = 15;

const player = sdk.getState()?.player;
if (!player) throw new Error('No player state');
const dist = Math.sqrt(
    Math.pow(player.worldX - TREE_AREA.x, 2) +
    Math.pow(player.worldZ - TREE_AREA.z, 2)
);

if (dist > MAX_DRIFT) {
    await bot.walkTo(TREE_AREA.x, TREE_AREA.z);
}
```

## Drop Logs When Full

```typescript
const state = sdk.getState();
if (!state) throw new Error('No world state');
if (state.inventory.length >= 28) {
    const logs = state.inventory.filter(i => /logs$/i.test(i.name));
    for (const log of logs) {
        await sdk.sendDropItem(log.slot);
        await new Promise(r => setTimeout(r, 100));
    }
}
```

## Firemaking Combo

Burn logs for additional XP (requires tinderbox):

```typescript
const logs = sdk.findInventoryItem(/logs/i);
const tinderbox = sdk.findInventoryItem(/tinderbox/i);

if (logs && tinderbox) {
    const result = await bot.burnLogs();
    if (result.success) {
        console.log(`Burned logs, gained ${result.xpGained} FM XP`);
    }
}
```
