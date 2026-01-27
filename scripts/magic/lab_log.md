# Lab Log: magic

Magic training script using combat spells on NPCs.

## Goal
Train Magic to level 10+ from a fresh Lumbridge spawn using Wind Strike on chickens.

## Starting Conditions (LUMBRIDGE_SPAWN preset)
- Air rune x25
- Mind rune x15
- Water rune x6
- Earth rune x4
- Body rune x2

## XP Analysis
- Wind Strike = 1 Air + 1 Mind = 5.5 XP per cast
- 15 Mind runes = max 15 Wind Strikes = 82.5 XP max
- Level 10 requires 1,154 XP = ~210 Wind Strikes
- With 15 runes, can only reach ~level 2-3

**Limitation**: The preset doesn't provide enough runes to reach level 10 with magic alone.

---

## Run 001 - Initial Test

**Outcome**: SUCCESS
**Duration**: 32.1s
**Final Level**: 11 (from 1)

### What Happened
- Script walked to chicken coop successfully
- Cast Wind Strike 3 times
- Each hit gave 475 XP (not 5.5 XP - server has boosted rates)
- Hit level 11 with only 3 runes used
- Dialog handling worked correctly (dismissed level-up dialogs)

### Key Discovery
**Server XP rates are ~86x normal** - Wind Strike gives 475 XP per hit instead of 5.5 XP.
This completely changes the calculation:
- 15 Mind runes = 15 casts = 7,125 XP potential (if all hit)
- Can easily reach level 10+ with starting runes

### What Worked Well
1. `sendSpellOnNpc()` worked correctly
2. Dialog dismissal handled level-up popups
3. Target selection found chickens
4. Progress tracking was accurate

### Remaining runes
Air=22, Mind=12, Water=6, Earth=4 (12 runes left = plenty for future use)

---

## Run 002 - Verification Run

**Outcome**: SUCCESS
**Duration**: 105.2s
**Final Level**: 11 (from 1)

### What Happened
- Script worked reliably on fresh browser start
- Cast 31 times, hit 4 times (87% splash rate at low levels)
- XP per hit varied: 275, 375, 375, 475 XP
- Still reached level 11 despite high splash rate

### Observations
1. XP per hit scales with damage dealt (not fixed)
2. Splash rate is high at level 1 (expected - low magic accuracy)
3. Even with many splashes, goal achieved comfortably
4. Rune usage: 4 successful hits used 4 of each rune (21 air, 11 mind remaining)

### Browser Note
Had to kill stuck browser between runs - shared browser mode can get stuck sometimes.

---

## Learnings

### 1. Strategic Findings
- **XP rates are boosted** - ~50-100x normal rates on this server
- **Splash rate is high at low levels** - expected, but hits still give enough XP
- **Chickens are ideal targets** - easy to find, don't fight back hard, weak
- **Dialog handling is essential** - level-up dialogs block all actions

### 2. Process & Tooling Reflections
- Script-runner infrastructure worked well for logging
- Dialog dismissal loop is critical for combat magic training
- `sendSpellOnNpc()` API is straightforward and reliable

### 3. SDK Issues & Gaps
- None encountered - the magic combat API works correctly
- `sendSpellOnNpc(npcIndex, spellComponent)` is intuitive
- Spell constants should be documented somewhere (currently in save-generator.ts)

---

## Run 003 - Range Fix

**Outcome**: ISSUE IDENTIFIED
**Issue**: "I can't reach that" errors when chickens wandered away

### Root Cause
The script was using `sendSpellOnNpc()` directly without checking if the player was close enough. When chickens moved, the player would follow but try to cast while moving, or from too far away.

### Fix Applied
1. Added distance check before casting - if `target.distance > 5`, walk toward target first
2. Added game message checking for "can't reach" failures
3. Use `target.x` and `target.z` to walk directly to the NPC position

```typescript
// Walk closer if target is far
if (target.distance > 5) {
    ctx.log(`Walking toward ${target.name} at (${target.x}, ${target.z})`);
    await ctx.bot.walkTo(target.x, target.z);
    continue;
}
```

---

## Run 004 - Verification After Fix

**Outcome**: SUCCESS
**Duration**: 35.5s
**Final Level**: 11 (from 1)

### What Worked
- All 4 casts were at dist=4 (within range)
- 100% hit rate (no splashes this run - luck or higher accuracy at close range?)
- Level 11 achieved with only 4 runes used
- No "can't reach" errors

### Key Learning
- Magic range is ~10 tiles but line-of-sight matters
- Walking to within 5 tiles before casting ensures reliable hits
- Checking `target.distance` before casting prevents wasted attempts
