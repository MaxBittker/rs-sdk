import type { SkillPlugin, SkillRunContext } from '../types';
import { FOOD, kitForTask } from '../bank/kits';
import { TRAINING_AREAS } from '../knowledge/wiki';
import { avoidKey, isAvoided, noteAvoid, noteConfirm } from '../memory';
import { confirmByItemGain, confirmByXpDelta } from '../observe/confirm';
import { walkToPoint } from '../travel';
import { countMatching, hasItem, inventoryCount, sleep } from '../util';

function hpCurrent(sdk: SkillRunContext['sdk']): { cur: number; base: number } {
    const hp = sdk.getSkill('Hitpoints');
    const cur = (hp as { currentLevel?: number; level?: number } | null)?.currentLevel ?? hp?.level ?? 10;
    const base = hp?.baseLevel ?? 10;
    return { cur, base };
}

function combatXp(sdk: SkillRunContext['sdk']): number {
    return ['Attack', 'Strength', 'Defence', 'Hitpoints'].reduce(
        (total, skill) => total + (sdk.getSkillXp(skill) ?? sdk.getSkill(skill)?.experience ?? 0),
        0,
    );
}

export const combatSkill: SkillPlugin = {
    id: 'combat',
    skills: ['Attack', 'Strength', 'Defence'],
    kit: kitForTask('combat'),
    async run(ctx: SkillRunContext): Promise<boolean> {
        const { sdk, bot, log, memory } = ctx;
        let { cur, base } = hpCurrent(sdk);

        if (ctx.observation?.lowHp || cur < Math.max(5, Math.floor(base * 0.55))) {
            const food = sdk.findInventoryItem(FOOD);
            if (food) {
                log(`combat: eat ${food.name} (hp ${cur}/${base})`);
                await bot.eatFood(food);
                await sleep(500);
                ({ cur, base } = hpCurrent(sdk));
            }
            if (cur < Math.max(5, Math.floor(base * 0.55))) {
                log('combat: low HP, no food or still unsafe');
                noteConfirm(memory, 'combat', false, 'low_hp');
                return false;
            }
        }

        // Open cow gate if blocked
        const gate = sdk.findNearbyLoc(/gate/i);
        if (gate && gate.optionsWithIndex?.some((o) => /open/i.test(o.text))) {
            await bot.openDoor(gate);
            await sleep(400);
        }

        const isTargetAvoided = (target: { name: string; x: number; z: number }) =>
            isAvoided(memory, avoidKey('npc', target.name, target.x, target.z));
        const findCow = () =>
            sdk
                .getNearbyNpcs()
                .find((n) => /^cow$/i.test(n.name) && !/dairy/i.test(n.name) && !isTargetAvoided(n)) ?? null;
        let cow = findCow();
        if (!cow) {
            await walkToPoint(bot, sdk, TRAINING_AREAS.lumbridgeCows);
            await sleep(400);
            cow = findCow();
        }
        if (!cow) {
            log('combat: no cow');
            noteConfirm(memory, 'combat', false, 'no_target');
            return false;
        }

        const weapon = sdk.findInventoryItem(/sword|scimitar|dagger|mace|battleaxe/i);
        if (weapon && !sdk.findEquipmentItem(/sword|scimitar|dagger|mace|battleaxe/i)) {
            await bot.equipItem(weapon);
            await sleep(200);
        }

        log(`combat: attack ${cow.name} (hp ${cur}/${base})`);
        const beforeXp = combatXp(sdk);
        const beforeInv = (sdk.getInventory() ?? []).map((item) => item.name);
        const result = await bot.attack(cow);
        if (!result?.success) {
            log(`combat: ${result?.message ?? 'failed'}`);
            noteAvoid(memory, avoidKey('npc', cow.name, cow.x, cow.z), 45_000);
            noteConfirm(memory, 'combat', false, result?.message ?? 'failed');
            await sleep(500);
            return false;
        }
        await sleep(2500);

        if (inventoryCount(sdk) < 27) {
            const loot = sdk.findGroundItem(/cow\s*hide|bones|raw\s*beef/i);
            if (loot) await bot.pickupItem(loot);
        }
        const afterXp = combatXp(sdk);
        const afterInv = (sdk.getInventory() ?? []).map((item) => item.name);
        const confirmed =
            confirmByXpDelta(beforeXp, afterXp) ||
            confirmByItemGain(beforeInv, afterInv, /cow\s*hide|bones|raw\s*beef/i);
        if (!confirmed) {
            noteAvoid(memory, avoidKey('npc', cow.name, cow.x, cow.z), 45_000);
            noteConfirm(memory, 'combat', false, ctx.observation?.errors[0] ?? 'no_progress');
            return false;
        }
        noteConfirm(memory, 'combat', true, 'xp_or_item');
        return true;
    },
};
