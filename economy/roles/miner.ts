// Miner: gather ore at SE Varrock, haul to Varrock west, sell on the GE.
// Steps: prepare -> mine -> haul -> trade -> (cycle repeats; collect fills on next trade)
import type { Role } from '../lib/agent/types';
import { bankDeposit, bankWithdrawNoted, bankClose } from '../lib/skills/bank';
import { mineUntil } from '../lib/skills/mine';
import { sellAll, collectOnly } from '../lib/skills/ge';

const TOOLS = /pickaxe|^coins$/i;

export const miner: Role = {
    name: 'miner',
    steps: [
        {   // Free the inventory: starter kit has 18 items and ore needs the slots.
            name: 'prepare',
            async run(ctx) {
                if (ctx.sdk.getInventory().length > 10) { await bankDeposit(ctx, TOOLS); await bankClose(ctx); }
            },
        },
        {   // Take whatever copper/tin is available; iron needs level 15 and is a later role.
            name: 'mine',
            async run(ctx) {
                ctx.mem.gained = await mineUntil(ctx, /copper|tin/i, ctx.traits.batch);
            },
        },
        {   // Bank the load, take it back out as notes so one slot = many units.
            name: 'haul',
            async run(ctx) {
                await bankDeposit(ctx, TOOLS);
                for (const [ore, n] of Object.entries((ctx.mem.gained ?? {}) as Record<string, number>)) {
                    await bankWithdrawNoted(ctx, new RegExp(`^${ore}$`, 'i'), n);
                }
                await bankClose(ctx);
            },
        },
        {
            name: 'trade',
            async run(ctx) {
                for (const ore of Object.keys((ctx.mem.gained ?? {}) as Record<string, number>)) await sellAll(ctx, ore);
            },
        },
    ],
};
