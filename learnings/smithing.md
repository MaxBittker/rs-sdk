# Smithing

## Smelting Bronze Bars

Bronze bars require **1 copper ore + 1 tin ore** smelted at a furnace.

### How to Smelt

Furnaces have **no click options** — use `sendUseItemOnLoc` with ore:

```typescript
const copper = state.inventory.find(i => /copper ore/i.test(i.name));
const furnace = state.nearbyLocs.find(l => /furnace/i.test(l.name));
await sdk.sendUseItemOnLoc(copper.slot, furnace.x, furnace.z, furnace.id);
await new Promise(r => setTimeout(r, 2500));
```

- Use **copper** on furnace — it auto-consumes 1 tin from inventory
- Triggers level-up dialogs — handled automatically by BotActions methods
- ~2.5s per bar is reliable timing
- Each bronze bar gives **155 xp** (at level 1-14 range, leveled from 1→14 with 10 bars = 1550 xp total, so ~155 xp per smelt)

### Furnace Locations
| Location | Coordinates | Furnace IDs | Notes |
|----------|-------------|-------------|-------|
| Lumbridge furnace | (3225, 3256) | 2785, 2781 | Right next to spawn, reliable.
| Al Kharid furnace | (3273, 3184) | 2785, 2781 | Needs 10gp toll gate. 


### Anvil Locations
| Location | Coordinates | Anvil ID | Notes |
|----------|-------------|----------|-------|
| Varrock (west) | (3188, 3421) | 2783 | Multiple anvils in smithy, near west bank |

Also anvils at (3188, 3424) and (3188, 3426) — same building, same id 2783.

### How to Smith at Anvil

Anvils have **no click options** — use `sendUseItemOnLoc` with a bar:

```typescript
const bar = state.inventory.find(i => /bronze bar/i.test(i.name));
const anvil = state.nearbyLocs.find(l => /anvil/i.test(l.name));
await sdk.sendUseItemOnLoc(bar.slot, anvil.x, anvil.z, anvil.id);
await new Promise(r => setTimeout(r, 2000));

// Interface 994 opens with smithing options
// Components 1119-1122: individual items [Make, Make 5, Make 10]
// Component 1123: sets [Make set, Make 5 sets, Make 10 sets]
// Component 1119 = dagger (1 bar each)
await sdk.sendClickComponentWithOption(1119, 1); // Make 1 dagger
await new Promise(r => setTimeout(r, 3000));
```

**Requires hammer in inventory** (buy from Lumbridge General Store for 1gp).

### XP Rates
- Smelting bronze bar: ~155 xp per bar (includes level-up bonuses)
- Smithing bronze dagger: ~312 xp per dagger at level 14-26 range
- 10 bars smelted: 1→14 Smithing
- 10 daggers smithed: 14→26 Smithing

### Smithing Interface Components (Interface 994)
| Component | Item | Bars needed |
|-----------|------|-------------|
| 1119 | Dagger | 1 |
| 1120 | ? (needs testing) | ? |
| 1121 | ? (needs testing) | ? |
| 1122 | ? (needs testing) | ? |
| 1123 | Set | ? |

### Workflow
1. Mine equal copper (rock ids 2090/2091) and tin (rock ids 2093/2094) at SE Varrock mine (3285, 3365)
2. Walk to Lumbridge furnace (3225, 3256) → smelt into bronze bars
3. Walk to Varrock anvil (3188, 3421) → smith into items (requires hammer)

### Key Locations for Full Loop
| Step | Location | Coordinates |
|------|----------|-------------|
| Mine | SE Varrock mine | (3285, 3365) |
| Smelt | Lumbridge furnace | (3225, 3256) |
| Smith | Varrock anvil | (3188, 3421) |
| Buy hammer | Lumbridge General Store | (3210, 3244) |

### Route: Mine → Furnace → Anvil
This is a long loop. Consider using Varrock West Bank (nearby anvils) to store bars between trips.

## TODO
- Test iron smelting (rock ids 2093/2095) — need Mining 15+
- Discover what components 1120-1122 make
- Find a closer furnace to Varrock anvils (Al Kharid?)
