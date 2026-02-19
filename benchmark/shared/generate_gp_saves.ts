/**
 * Generate save files for the GP benchmark task.
 * Creates 25 bot saves (5 bots × 5 loops) with level 50 in all skills,
 * starting in Lumbridge with 0 coins.
 *
 * Naming: l{loop}a{bot} — e.g. l1a1, l1a2, ..., l5a5
 * Each loop gets fresh usernames to avoid server caching issues.
 *
 * Usage: bun run benchmark/shared/generate_gp_saves.ts
 */
import { generateSave } from '../../sdk/test/utils/save-generator';

const ALL_SKILLS: Record<string, number> = {
  ATTACK: 50,
  STRENGTH: 50,
  DEFENCE: 50,
  HITPOINTS: 50,
  MAGIC: 50,
  RANGED: 50,
  PRAYER: 50,
  WOODCUTTING: 50,
  FISHING: 50,
  MINING: 50,
  COOKING: 50,
  CRAFTING: 50,
  SMITHING: 50,
  FIREMAKING: 50,
  FLETCHING: 50,
  THIEVING: 50,
  RUNECRAFT: 50,
  HERBLORE: 50,
  AGILITY: 50,
};

const LOOPS = 5;
const BOTS_PER_LOOP = 5;

async function main() {
  let count = 0;
  for (let loop = 1; loop <= LOOPS; loop++) {
    for (let bot = 1; bot <= BOTS_PER_LOOP; bot++) {
      const username = `l${loop}a${bot}`;
      await generateSave(username, {
        skills: ALL_SKILLS,
        position: { x: 3222, z: 3218 }, // Lumbridge
      });
      count++;
    }
  }
  console.log(`[generate_gp_saves] Created ${count} saves (${BOTS_PER_LOOP} bots × ${LOOPS} loops)`);
}

main().catch(err => {
  console.error('[generate_gp_saves] Fatal:', err);
  process.exit(1);
});
