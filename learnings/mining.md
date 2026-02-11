# Mining

Successful patterns for mining automation.

## Finding Rocks

Rocks are **locations** (not NPCs). Filter for rocks with a "Mine" option:

```typescript
const rock = state.nearbyLocs
    .filter(loc => /rocks?$/i.test(loc.name))
    .filter(loc => loc.optionsWithIndex.some(o => /^mine$/i.test(o.text)))
    .sort((a, b) => a.distance - b.distance)[0];
```

## Mining Action

```typescript
// Walk closer if needed (interaction range is ~3 tiles)
if (rock.distance > 3) {
    await ctx.sdk.sendWalk(rock.x, rock.z, true);
    await new Promise(r => setTimeout(r, 1000));
}

const mineOpt = rock.optionsWithIndex.find(o => /^mine$/i.test(o.text));
await ctx.sdk.sendInteractLoc(rock.x, rock.z, rock.id, mineOpt.opIndex);
```

## Detecting Mining Activity

Animation ID 625 indicates active mining:

```typescript
const isMining = state.player?.animId === 625;
const isIdle = state.player?.animId === -1;
```

## Rock IDs → Ore Types (SE Varrock Mine)

Rocks are ALL named "Rocks" — you **must** prospect to tell them apart:

| Rock ID | Ore |
|---------|-----|
| 2090 | **Copper** |
| 2091 | **Copper** |
| 2092 | **Iron** |
| 2093 | **Tin** |
| 2094 | **Tin** |
| 2095 | **Iron** |

**IMPORTANT:** Previous learnings had 2092=tin and 2093=iron — this was WRONG.
Always prospect or test-mine to verify on your server instance.

**How to mine specific ore:**
```typescript
// Mine copper specifically (IDs 2090 or 2091)
const copperRock = state.nearbyLocs
    .filter(loc => loc.id === 2090 || loc.id === 2091)
    .filter(loc => loc.optionsWithIndex.some(o => /^mine$/i.test(o.text)))
    .sort((a, b) => a.distance - b.distance)[0];

// Mine tin specifically (IDs 2093 or 2094)
const tinRock = state.nearbyLocs
    .filter(loc => loc.id === 2093 || loc.id === 2094)
    .filter(loc => loc.optionsWithIndex.some(o => /^mine$/i.test(o.text)))
    .sort((a, b) => a.distance - b.distance)[0];
```

Use `Prospect` option on a rock to discover its ore type if unsure.

## Rock IDs → Ore Types (Al Kharid Mine)

| Rock ID | Ore |
|---------|-----|
| 2092 | **Iron** |
| 2093 | **Tin** |
| 2096 | **Coal** |
| 2098 | **Gold** |
| 2100 | **Silver** |
| 2103 | **Mithril** |
| 450, 2097, 2099, 2101, 2102 | Unknown (depleted during testing) |

**Note:** Al Kharid mine is full of Lvl 14 scorpions. Combat 27+ with defensive style is enough to survive while mining. The scorpion fights actually train Defence passively.

## Reliable Locations

| Location | Coordinates | Ores | Bank | ~Tiles |
|----------|-------------|------|------|--------|
| SE Varrock | (3285, 3365) | Cu, Sn, Fe | Varrock East (3253, 3420) | 64 |
| SW Varrock | (3180, 3371) | Clay, Sn, Fe, Ag | Varrock West (3185, 3436) | 68 |
| Barbarian Village | (3078, 3421) | Sn, Fe | Edgeville (3093, 3496) | 80 |
| Rimmington | (2970, 3239) | Cu, Sn, Fe, Au, Clay | Falador East (3013, 3355) | 130 |
| Al Kharid | (3300, 3310) | Cu, Sn, Fe, Au, Ag, Mith, Addy | Al Kharid (3269, 3167) | 150 |
| Dwarven Mine | (3018, 9739) | Cu, Sn, Fe, Coal, Au, Mith, Addy | Falador East (3013, 3355) | 110 |
| Mining Guild | (3048, 9737) | Coal, Mith (60+ Mining) | Falador East (3013, 3355) | 100 |
| Ardougne South | (2602, 3235) | Fe, Coal | Ardougne East (2615, 3332) | 100 |
| Coal Trucks | (2581, 3483) | Coal | Seers Village (2725, 3493) | 150 |
| Yanille | (2624, 3139) | Cu, Sn, Coal | Yanille (2613, 3094) | 50 |
| Lumbridge Swamp | - | Interactions fail silently, avoid | - | - |

## Navigation Gotchas

- **Al Kharid toll gate** requires 10gp coins in inventory
- **Ardougne teleport** requires Plague City quest completion
- **Pathfinder struggles** south of Falador (near Wayne's shop area)
- **Coal Trucks** — river blocks pathfinding, may need manual assistance
- Always use **waypoints** for routes with known obstacles (Varrock gates, etc.)

## Counting Ore

```typescript
function countOre(ctx): number {
    const state = ctx.sdk.getState();
    if (!state) return 0;
    return state.inventory
        .filter(i => /ore$/i.test(i.name))
        .reduce((sum, i) => sum + i.count, 0);
}
```

## Drop When Full

```typescript
if (state.inventory.length >= 28) {
    const ores = state.inventory.filter(i => /ore$/i.test(i.name));
    for (const ore of ores) {
        await ctx.sdk.sendDropItem(ore.slot);
        await new Promise(r => setTimeout(r, 100));
    }
}
```
