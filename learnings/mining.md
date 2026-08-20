# Mining

Successful patterns for mining automation.

## Finding Rocks

Rocks are **locations** (not NPCs). Filter for rocks with a "Mine" option:

```typescript
const state = sdk.getState();
const rock = state?.nearbyLocs
    .filter(loc => /rocks?/i.test(loc.name))
    .filter(loc => loc.optionsWithIndex.some(o => /^mine$/i.test(o.text)))
    .sort((a, b) => a.distance - b.distance)[0];
```

## Mining Action

```typescript
if (!rock) throw new Error('No mineable rock nearby');
const result = await bot.interactLoc(rock, 'mine');
if (!result.success) console.warn(result.reason, result.message);
```

For lower-level control, `sendInteractLoc()` only confirms client dispatch. Take
an XP/inventory baseline and wait for the intended change rather than sleeping
for an arbitrary duration.

## Detecting Mining Activity

Animation ID 625 indicates active mining:

```typescript
const animation = sdk.getState()?.player?.animId ?? -1;
const isMining = animation === 625;
const isIdle = animation === -1;
```




**Note:** Al Kharid mine is full of Lvl 14 scorpions. Combat 27+ with defensive style is enough to survive while mining. The scorpion fights actually train Defence passively.

## Reliable Locations

| Location | Coordinates | Notes |
|----------|-------------|-------|
| SE Varrock mine | (3285, 3365) | Copper, tin, iron |
| Al Kharid mine | (3295, 3287) | Iron, coal, gold, silver, mithril, tin. Scorpions! |
| Lumbridge Swamp mine | - | Interactions fail silently, avoid |

**Getting to Al Kharid mine from Lumbridge:** Pay 10gp toll at gate (3268, 3227), walk NE. Dialog sequence: continue → continue → "Yes, ok." (index 3) → continue.

## Counting Ore

```typescript
function countOre() {
    const state = sdk.getState();
    if (!state) return 0;
    return state.inventory
        .filter(i => /ore$/i.test(i.name))
        .reduce((sum, i) => sum + i.count, 0);
}
```

## Drop When Full

```typescript
const state = sdk.getState();
if (!state) throw new Error('No world state');
if (state.inventory.length >= 28) {
    const ores = state.inventory.filter(i => /ore$/i.test(i.name));
    for (const ore of ores) {
        await sdk.sendDropItem(ore.slot);
        await new Promise(r => setTimeout(r, 100));
    }
}
```

## Adamantite: where it actually is

Server-wide census of adamantite rocks (loc ids 2104/2105/2133/2134):

| Location | Rocks | Notes |
|----------|-------|-------|
| Dwarven Mine | 3 | (3035,9764), (3042,9772), (3042,9774). King Scorpions (lvl 32) nearby are aggressive to combat < 65. |
| Al Kharid mine | 2 | (3298,3317), (3300,3318). Lvl 14 scorpions ignore combat 29+. |
| Near Seers (surface) | 3 | (2836-2837, 3243-3244) — unverified routing. |
| Wilderness hobgoblin mine | 7 | PvP risk. |
| Various dungeons | rest | quest-gated or remote. |

The **Mining Guild has no adamantite** (coal and mithril only). The gold
cluster at (2731, 3224) south of Catherby is on White Wolf Mountain's slope
and unroutable from the south ("no waypoints").

Requirements: adamantite needs Mining 70; wielding a pickaxe above your
Mining level makes mining silently do nothing.
