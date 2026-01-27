# Lab Log: fletching

## Goal
Train Fletching from level 1 to 10+ starting from a fresh Lumbridge spawn.

## Strategy
1. Pick up knife from ground spawn SE of Lumbridge castle (around 3224, 3202)
2. Chop trees for logs using bronze axe (from preset)
3. Use knife on logs to make arrow shafts (level 1-4)
4. At level 5+, can make shortbows for 5 XP each
5. At level 10+, can make longbows for 10 XP each
6. Drop fletched items when inventory fills

## XP Requirements
- Level 10 requires 1,154 XP
- Arrow shafts: 5 XP per log (but bonus XP from game speeds this up significantly)
- Shortbow: 5 XP per log (level 5)
- Longbow: 10 XP per log (level 10)

---

## Run 001 - 2026-01-27 19:06

**Outcome**: Failed - no knife
**Duration**: ~40s

### What Happened
- Walked to expected knife spawn location (3224, 3205)
- Bot ended up at (3217, 3237) instead - wrong direction!
- No knife found on ground after 10 attempts
- Tried general store but they don't sell knives
- Script aborted

### Root Cause
1. The walkTo function got stuck and went wrong direction
2. Knife spawn location was slightly incorrect (3205 vs actual 3202)
3. Needed more wait time for knife to potentially respawn

### Fix
- Added more debugging output
- Extended wait time for knife respawn
- Check for knife from starting position first

---

## Run 002 - 2026-01-27 19:07

**Outcome**: Connection error
**Duration**: ~10s

### What Happened
Bot disconnected during walk to knife spawn.

### Root Cause
Transient connection issue - not script related.

---

## Run 003 - 2026-01-27 19:07 (SUCCESS)

**Outcome**: Success
**Duration**: ~60s

### What Happened
1. Started at Lumbridge castle (3222, 3218)
2. Walked toward knife spawn but got stuck at (3228, 3233)
3. Waited 8 attempts (~16 seconds) for knife to appear
4. Found knife at (3224, 3202) - slightly different than expected coords
5. Picked up knife successfully
6. Walked to trees at (3200, 3230)
7. Chopped 4 logs - Woodcutting went 1->20 (bonus XP)
8. Fletched all 4 logs into arrow shafts
9. Each log gave massive XP: Fletching jumped 1->4->7->9->11

### Key Observations
- Knife spawns at (3224, 3202), not (3224, 3205)
- Game gives significant bonus XP, so only 4 logs needed to reach level 11
- Arrow shafts give 375 XP per log in this game version (vs standard 5 XP)
- Woodcutting levels up extremely fast too
- Level-up dialogs handled correctly

### Final Stats
- Fletching: Level 11 (from level 1)
- Woodcutting: Level 20 (from level 1)
- Logs chopped: 4
- Arrow shafts made: 60 (4 x 15)
- Total fletching XP: ~1,500

---

## Learnings

### 1. Strategic Findings
- Knife spawns at (3224, 3202) SE of Lumbridge castle
- Only need 4 logs to reach level 10+ due to bonus XP system
- Arrow shafts are efficient - 15 per log at 5 XP base each
- Don't need to switch to shortbows/longbows - arrow shafts get you to 10+ fast

### 2. Process & Tooling Reflections
- Good debugging output (position, ground items) helped identify knife location
- WalkTo can get stuck - need tolerance for imperfect pathing
- Waiting for item respawns (2s intervals, 15 attempts) worked well

### 3. SDK Issues & Gaps
- walkTo() sometimes fails to reach exact destination but gets close enough
- Ground item visibility range seems limited - knife only appeared after waiting
- No issue with fletchLogs() - worked reliably
