# Smithing

## Smelting Bronze Bars

Bronze bars require **1 copper ore + 1 tin ore** smelted at a furnace.

### How to Smelt

Some furnace variants expose a `Smelt` option and others require using ore on
the furnace. Inspect `optionsWithIndex` first; using ore on the furnace is the
portable low-level fallback:

```typescript
const state = sdk.getState();
if (!state) throw new Error('No world state');
const copper = state.inventory.find(i => /copper ore/i.test(i.name));
const furnace = state.nearbyLocs.find(l => /furnace/i.test(l.name));
if (!copper || !furnace) throw new Error('Copper ore and a nearby furnace are required');
await sdk.sendUseItemOnLoc(copper.slot, furnace.x, furnace.z, furnace.id);
await sdk.waitForCondition(
    next => next.inventory.some(item => /bronze bar/i.test(item.name)),
    10_000,
);
```

- Use **copper** on furnace — it auto-consumes 1 tin from inventory
- Low-level calls do not dismiss level-up dialogs; use `bot.dismissBlockingUI()`
  when a modal interrupts a batch
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

Prefer the high-level helper, which opens the interface and observes Smithing XP:

```typescript
const result = await bot.smithAtAnvil('dagger', {
    barPattern: /bronze bar/i,
    timeout: 10_000,
});
if (!result.success) console.warn(result.reason, result.message);
```

**Requires hammer in inventory** (buy from Lumbridge General Store for 1gp).

### XP Rates
- Smelting bronze bar: ~155 xp per bar (includes level-up bonuses)
- Smithing bronze dagger: ~312 xp per dagger at level 14-26 range
- 10 bars smelted: 1→14 Smithing
- 10 daggers smithed: 14→26 Smithing

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

Use `sdk/API.md` for the current `smithAtAnvil` product and option signature
rather than hard-coded interface component IDs.
