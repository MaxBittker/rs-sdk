# Lab Log: smithing

Goal: Train Smithing to level 10+ starting from a fresh Lumbridge spawn.

## Strategy

Smithing requires:
1. **Mining copper and tin ore** - Both are level 1, found at various mines
2. **Smelting at a furnace** - Creates bronze bars (1 copper + 1 tin = 1 bronze bar)
3. **Smithing at an anvil** - Uses bronze bars + hammer to make items

### Location Analysis

**Ore Sources:**
- SE Varrock mine (3285, 3365) - Has copper and tin, safe area
- Al-Kharid mine (3300, 3310) - Has copper and tin, scorpions nearby

**Furnaces:**
- Al-Kharid furnace (3274, 3186) - Closest to Lumbridge, requires 10gp toll
- Lumbridge furnace - Inside castle, but may require quest completion?
- Falador furnace - Too far

**Anvils:**
- Varrock anvil (3188, 3427) - West Varrock, near west bank
- Al-Kharid anvil - Need to verify location

### Initial Approach (v1)

1. Start at Lumbridge with bronze pickaxe
2. Walk to SE Varrock mine (no toll required)
3. Mine copper and tin ore (alternating)
4. When inventory has ore, walk to Al-Kharid furnace
   - Need 10gp for toll - sell shortbow at Lumbridge general store
5. Smelt bronze bars at furnace
6. Smith items at nearby anvil (if exists) or Varrock anvil
7. Repeat until level 10

**XP per action:**
- Smelting bronze bar: 6.25 XP
- Smithing bronze item: 12.5 XP per bar used
- Bronze dagger = 1 bar = 12.5 XP
- Level 10 requires ~4,470 XP total

---

## Run History

### Run 001 - 2026-01-27 17:36

**Outcome**: Partial success (disconnected)
**Duration**: ~3 minutes
**Version**: v2

**What Happened:**
- Equipped bronze pickaxe ✓
- Sold shortbow at Lumbridge shop (got 20gp) ✓
- Walked to SE Varrock mine ✓
- Mined copper and tin ore using prospecting ✓
- Entered Al-Kharid (paid toll) ✓
- Smelted 3 bronze bars at furnace ✓
- **Smithing went from Level 1 to Level 8 (930 XP)!**

**Insights:**
- Smelting works! XP rate is ~310 XP per bar (server has boosted rates)
- With 310 XP per bar, only need ~15 bars for level 10
- Script disconnected during iteration 2 ("Bot not connected")

---

### Run 002-005 - 2026-01-27 17:42-17:59

**Outcome**: Various disconnects
**Versions**: v2, v3, v4

**Issues Encountered:**

1. **Al-Kharid mine (v3)** - WRONG LOCATION
   - Has iron and gold rocks, NOT copper/tin
   - Has aggressive scorpions (HP dropped from 11 to 2)
   - Don't use Al-Kharid mine for level 1 mining

2. **Server instability**
   - Multiple "Bot not connected" errors
   - "Game tick frozen for 16s" - server tick freeze
   - These are infrastructure issues, not script bugs

3. **SE Varrock mine locations**
   - Center-east area (~3287, 3365) has copper/tin
   - Northern area (~3285, 3370) has more iron
   - Target the correct sub-area

**What Works:**
- Prospecting to identify ore type ✓
- Mining when we find copper/tin ✓
- Walking routes ✓
- Toll gate payment ✓
- Smelting at Al-Kharid furnace ✓ (from Run 001)

---

## Learnings

### 1. Strategic Findings

**Effective approaches:**
- SE Varrock mine copper/tin is around (3286-3290, 3361-3366)
- Use prospecting to identify ore type before mining
- Al-Kharid furnace is reliable for smelting
- XP rates are boosted (~310 XP per bronze bar smelt)

**Failed strategies:**
- Al-Kharid mine is NOT suitable for level 1 (has iron/gold + scorpions)
- Walking directly to Al-Kharid mine center leads to iron rocks

**Optimal parameters:**
- Mine ~8 ore pairs before traveling to smelt
- Leave 2-3 inventory slots free
- 10 second timeout for mining actions

### 2. Process & Tooling Reflections

- Script successfully completed one full smelting cycle on first run
- Disconnects appear to be server instability, not script issues
- The prospecting approach works well for finding correct rocks
- Consider adding reconnection logic or retry mechanisms

### 3. SDK Issues & Gaps

- No obvious SDK bugs encountered
- `sendUseItemOnLoc` works for ore + furnace
- `waitForCondition` with game messages works for prospecting

---

### Run 006 - 2026-01-27 18:36

**Outcome**: Partial success - mined 5 pairs, walked to furnace, then disconnected
**Duration**: ~2.5 minutes
**Version**: v4 (simplified)

**What Happened:**
- Iteration 1: Walk from Lumbridge failed (obstacle at 3240, 3262)
- Iteration 2: Walk from Al-Kharid worked directly (139 tiles)
- Successfully mined 5 copper, 7 tin (5 pairs) ✓
- Started walking to Al-Kharid furnace
- Disconnected mid-walk at (3275, 3295)

**Key Insights:**
- Pathfinding works FROM Al-Kharid but has issues FROM Lumbridge
- The SE Varrock mine copper/tin area IS correct (~3282-3286, 3365-3368)
- Mining successfully detects copper vs tin after prospecting
- Need to go to Al-Kharid FIRST, then walk to mine (smoother path)

---

## Current Status

**Script Functionality:** WORKING (with caveats)

The script successfully:
1. ✅ Equips pickaxe
2. ✅ Gets coins by selling shortbow
3. ✅ Enters Al-Kharid (pays toll)
4. ✅ Walks to SE Varrock mine (from Al-Kharid)
5. ✅ Mines copper and tin ore (using prospecting to filter iron)
6. ✅ Walks to Al-Kharid furnace
7. ✅ Smelts bronze bars (demonstrated in Run 001)
8. ⏳ Repeats until level 10 (blocked by server disconnects)

**Remaining Issues:**
- Server instability causes frequent disconnects
- Walking from Lumbridge to mine is blocked by obstacles
- Server XP rates are boosted (310 XP per bar vs 6.25 standard)

**Recommended Flow:**
1. Sell shortbow → get coins
2. Go to Al-Kharid first (pay toll)
3. Walk to SE Varrock mine from Al-Kharid (more reliable path)
4. Mine copper/tin
5. Walk to furnace (in Al-Kharid)
6. Smelt bars
7. Repeat

