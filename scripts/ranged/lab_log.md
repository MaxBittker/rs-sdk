# Lab Log: ranged

## Goal
Train Ranged skill from level 1 to level 10+ using the shortbow and bronze arrows provided by LUMBRIDGE_SPAWN preset.

## Strategy
- Equip shortbow and bronze arrows at start
- Walk to Lumbridge chicken coop (3235, 3295)
- Open gate to enter coop
- Kill chickens using ranged attacks (level 1, easy targets)
- Pick up bronze arrows from the ground to conserve ammo
- Continue until Ranged level 10

## Equipment
- Shortbow (from preset)
- Bronze arrows x25 (from preset)

---

## Run 001 - Initial Test (Cow Field)

**Timestamp**: 2026-01-27
**Duration**: ~2 min
**Outcome**: FAIL - Context limit hit

### What Happened
- Previous version targeted cows at cow field
- Got stuck trying to pick up arrows inside fence (unreachable)
- Script stalled repeatedly

### Root Cause
1. Arrows land inside fenced areas and are unreachable
2. No retry limit on failed pickups - kept trying same unreachable arrows
3. Cow field has more obstacles/fences than chicken coop

### Fix Applied
- Switch to Lumbridge chicken coop (fewer obstacles)
- Add MAX_PICKUP_RETRIES = 2 to limit attempts on same arrow location
- Add gate opening logic for chicken coop entry

---

## Run 002 - Chicken Coop Strategy

**Timestamp**: 2026-01-27 19:06
**Duration**: ~2 min
**Outcome**: PARTIAL SUCCESS (Level 6, then disconnect)

### What Happened
- Successfully equipped gear and walked to chicken coop
- Opened gate, entered coop
- Started killing chickens, leveled up to Ranged 3 quickly
- Gained XP rapidly (chickens die fast to ranged)
- Reached level 6 before bot disconnect error

### Notes
- "Bot not connected" error caused script to terminate
- This appears to be a connection issue, not script logic

---

## Run 003 - Full Success

**Timestamp**: 2026-01-27 19:08
**Duration**: ~1 min
**Outcome**: SUCCESS - Reached Ranged Level 10

### What Happened
- Equipped shortbow and bronze arrows
- Walked to chicken coop gate
- Opened gate successfully
- Killed 2 chickens total
- Level progression: 1 -> 3 -> 6 -> 10 (very fast)
- Picked up arrows successfully after kills
- Goal achieved with 20 arrows remaining

### Stats
- Final Level: 10
- Final XP: 1200
- Arrows used: 5 (25 - 20)
- Arrows recovered: Some (pickup working)
- Time: ~1 minute

### What Worked
1. Chicken coop is excellent for ranged training - enclosed area, easy targets
2. Gate opening logic works correctly
3. Arrow pickup with retry limit prevents getting stuck on unreachable arrows
4. Dialog dismissal during combat works well

---

## Learnings

### 1. Strategic Findings
- **Chicken coop > Cow field for ranged**: Enclosed area, level 1 targets, fewer obstacles
- **Ranged XP is very fast**: Level 1->10 in 2 kills with accurate style
- **Arrow conservation works**: Pickup logic recovers most arrows
- **Gate handling is essential**: Must open gate to enter coop

### 2. Process & Tooling Reflections
- State delta logging made it easy to see level progression
- Short runs (1-2 min) were sufficient to validate the approach
- Connection issues can terminate scripts unexpectedly - may need retry logic

### 3. SDK Issues & Gaps
- "Bot not connected" error during combat suggests connection stability issues
- Pickup failed arrows could benefit from pathfinding check before attempting
