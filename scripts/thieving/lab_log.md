# Lab Log: thieving

## Run 001 - Initial Implementation

**Outcome**: SUCCESS
**Duration**: ~1 minute (very fast due to spawn location)

### Strategy
- Start at Lumbridge spawn (3222, 3218 - already near Men NPCs)
- Find Men/Women NPCs (they have Pickpocket option)
- Use sendInteractNpc with Pickpocket option index
- Handle stuns by waiting ~5 seconds
- Continue until Thieving level 10

### What Worked
- Script found Man NPC immediately at spawn
- sendInteractNpc with Pickpocket option works correctly
- XP detection for success/failure works
- Stun handling with 5s delay was effective
- Reached level 10 with 1200 XP

### Notes
- The Lumbridge spawn (3222, 3218) is already in a good spot for pickpocketing
- Men NPCs are plentiful in the Lumbridge area
- Mix of successes and stuns is normal at low levels

---

## Learnings

### 1. Strategic Findings
- Pickpocketing Men/Women is effective for early Thieving training
- Lumbridge spawn location is ideal - no need to walk anywhere
- Stun duration of ~5 seconds handles the failed attempt penalty

### 2. Process & Tooling Reflections
- Script completed on first attempt - pattern was straightforward
- Using optionsWithIndex to find "Pickpocket" option worked well

### 3. SDK Issues & Gaps
- None encountered - sendInteractNpc with custom option index works as expected
