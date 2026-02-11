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

## Rock IDs Are Per-Mine (NOT Universal)

**Critical**: The same rock ID maps to different ores at different mines!
Example: ID 2092 = **iron** at SE Varrock but **clay** at SW Varrock.

Always use per-mine rock ID tables. Use `Prospect` option on unknown rocks.

### Surveyed Rock IDs

| Mine | Rock ID | Ore |
|------|---------|-----|
| **SE Varrock** | 2090 | Copper |
| | 2091 | Copper |
| | 2092 | Iron |
| | 2093 | Iron |
| | 2094 | Tin |
| | 2095 | Tin |
| **SW Varrock** | 452 | Clay |
| | 2092 | Clay |
| | 2093 | Clay |
| | 2095 | Iron |
| | 2101 | Tin |
| | 2108 | Silver |
| | 2109 | Tin |
| **Barbarian Village** | 2094 | Iron |
| | 2096 | Tin |
| **Al Kharid** | 2092 | Iron |
| | 2093 | Tin |
| | 2096 | Coal |
| | 2098 | Gold |
| | 2100 | Silver |
| | 2103 | Mithril |
| | 450, 2097, 2099, 2101, 2102 | Unknown (depleted during testing) |
| **Coal Trucks** (Members) | 2096 | Coal |
| | 2097 | Coal |
| **Ardougne South** (Members) | 450 | Coal |
| | 452 | Coal |
| | 2092 | Iron |
| | 2093 | Iron |
| | 2097 | Coal |

**Note:** Al Kharid mine is full of Lvl 14 scorpions. Combat 27+ with defensive style is enough to survive while mining. The scorpion fights actually train Defence passively.

### Unsurveyed Mines

These mines have not been prospected yet — the script mines any rock there:
- Rimmington (pathfinder gets stuck south of Falador)
- Dwarven Mine (underground)
- Mining Guild (underground, 60+ Mining)
- Yanille (members)

## How to Mine Specific Ore

```typescript
// Mine copper specifically at SE Varrock
const COPPER_IDS = [2090, 2091]; // SE Varrock copper rock IDs
const copperRock = state.nearbyLocs
    .filter(loc => COPPER_IDS.includes(loc.id))
    .filter(loc => loc.optionsWithIndex.some(o => /^mine$/i.test(o.text)))
    .sort((a, b) => a.distance - b.distance)[0];
```

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
