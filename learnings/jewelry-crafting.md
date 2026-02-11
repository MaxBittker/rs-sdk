# Jewelry Crafting & Enchanting

## Overview

Jewelry crafting uses gold/silver bars + moulds at a furnace. Enchanting uses magic spells on crafted jewelry.

### Full Pipeline: Bar → Jewelry → String → Enchant

1. **Craft** jewelry at furnace: `bot.craftJewelry({ product: 'amulet', gem: 'ruby' })`
2. **String** amulets with ball of wool: `bot.stringAmulet(/ruby amulet/i)`
3. **Enchant** with magic: `bot.enchantItem(/ruby amulet/i, 3)`

## Crafting Jewelry at a Furnace

### Requirements
- **Gold bar** (id 2357) or **Silver bar** in inventory
- **Mould**: ring mould (1592), necklace mould (1597), or amulet mould (1595)
- **Gem** (optional): sapphire (1607), emerald (1605), ruby (1603), diamond
- Must be near a **furnace**

### Interface: 4161 (Gold Jewelry)

Uses `sendUseItemOnLoc` with bar on furnace → opens interface 4161 → click component with INV_BUTTON.

**Component mapping** (confirmed via testing):

| Component | Product Type |
|-----------|-------------|
| **4233** | Ring |
| **4239** | Necklace |
| **4245** | Amulet |

**Gem slot mapping** (the `slot` parameter in `sendClickComponentWithOption`):

| Slot | Gem |
|------|-----|
| 0 | Plain gold |
| 1 | Sapphire |
| 2 | Emerald |
| 3 | Ruby |
| 4 | Diamond |

Example: Ruby amulet = `sendClickComponentWithOption(4245, 1, 3)`

### Usage

```typescript
// Craft a gold ring (Crafting level 5)
const result = await bot.craftJewelry({ product: 'ring' });

// Craft a ruby amulet (Crafting level 50)
const result = await bot.craftJewelry({ product: 'amulet', gem: 'ruby' });

// Auto-detect product from mould, gem from inventory
const result = await bot.craftJewelry();
```

### Furnace Locations
| Location | Coordinates | Notes |
|----------|-------------|-------|
| Lumbridge | (3225, 3256) | Near spawn, furnace id=2785 |
| Al Kharid | TBD | 10gp toll gate |

### Confirmed XP Values
| Product | XP |
|---------|-----|
| Gold ring | 375 |
| Gold necklace | 500 |
| Gold amulet | 750 |
| Sapphire amulet | 875 (estimated) |
| Ruby amulet | 1000+ |

## Stringing Amulets

Unstrung amulets need a **ball of wool** (id 1759) to complete.
Gives 100 Crafting XP.

```typescript
const result = await bot.stringAmulet(/ruby amulet/i);
```

Uses `sendUseItemOnItem` (ball of wool + amulet).

## Enchanting Jewelry

### Enchant Levels & Requirements

| Level | Gem | Magic Req | Runes | Spell ID |
|-------|-----|-----------|-------|----------|
| 1 | Sapphire | 7 | 1 cosmic + 1 water | 1155 |
| 2 | Emerald | 27 | 1 cosmic + 3 air | 1165 |
| 3 | Ruby | 49 | 1 cosmic + 5 fire | 1176 |
| 4 | Diamond | 57 | 1 cosmic + 10 earth | 1180 |
| 5 | Dragonstone | 68 | 1 cosmic + 15 water + 15 earth | 1187 |

### Usage

```typescript
// Enchant sapphire ring → ring of recoil
const result = await bot.enchantItem(/sapphire ring/i, 1);

// Enchant ruby amulet → amulet of strength (confirmed: +1475 Magic XP)
const result = await bot.enchantItem(/ruby amulet/i, 3);
```

Uses `sendSpellOnItem(slot, spellComponent)` — no furnace needed, just runes + cosmic rune (id 564).

## Low-Level API Reference

| Method | Purpose |
|--------|---------|
| `sdk.sendUseItemOnLoc(slot, x, z, id)` | Bar on furnace |
| `sdk.sendUseItemOnItem(src, dst)` | Wool on amulet |
| `sdk.sendSpellOnItem(slot, spellComponent)` | Enchant spell on item |
| `sdk.sendClickComponentWithOption(comp, 1, slot)` | Select product from jewelry interface |
| `sdk.waitForCondition(pred, timeout)` | Wait for interface/XP |

## TODO
- Test silver bar jewelry (holy symbol, tiara, etc.)
- Find optimal locations with bank + furnace close together
- Test dragonstone jewelry (slot 5?)
