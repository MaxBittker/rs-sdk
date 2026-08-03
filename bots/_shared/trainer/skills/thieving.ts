import type { SkillPlugin, SkillRunContext } from '../types';
import { kitForTask } from '../bank/kits';
import { TRAINING_AREAS } from '../knowledge/wiki';
import { distanceSq } from '../knowledge/world';
import { avoidKey, isAvoided, noteAvoid, noteConfirm } from '../memory';
import { confirmByItemGain, confirmByXpDelta } from '../observe/confirm';
import { walkToPoint } from '../travel';
import { playerPos, sleep } from '../util';

function closestPickpocketTarget(
    sdk: SkillRunContext['sdk'],
    from: { x: number; z: number },
    isTargetAvoided: (target: { name: string; x: number; z: number }) => boolean,
) {
    const men = sdk.getNearbyNpcs().filter((n) => /^(man|woman)$/i.test(n.name) && !isTargetAvoided(n));
    men.sort((a, b) => distanceSq(from, { x: a.x, z: a.z }) - distanceSq(from, { x: b.x, z: b.z }));
    return men[0] ?? null;
}

export const thievingSkill: SkillPlugin = {
    id: 'thieving',
    skills: ['Thieving'],
    kit: kitForTask('thieving'),
    async run(ctx: SkillRunContext): Promise<boolean> {
        const { sdk, bot, log, memory } = ctx;
        const pos = playerPos(sdk);
        if (!pos) return false;
        const isTargetAvoided = (target: { name: string; x: number; z: number }) =>
            isAvoided(memory, avoidKey('npc', target.name, target.x, target.z));

        let man = closestPickpocketTarget(sdk, pos, isTargetAvoided);
        if (!man) {
            await walkToPoint(bot, sdk, TRAINING_AREAS.lumbridgeMen, 'pickpocket men');
            await sleep(400);
            man = closestPickpocketTarget(sdk, playerPos(sdk) ?? pos, isTargetAvoided);
        }
        if (!man) {
            log('thieving: no pickpocket target nearby');
            return false;
        }

        // Walk next to target if far / previous cant_reach.
        const dist = Math.sqrt(distanceSq(pos, { x: man.x, z: man.z }));
        if (dist > 2) {
            await walkToPoint(bot, sdk, { x: man.x, z: man.z, label: man.name }, man.name);
            await sleep(300);
            man = closestPickpocketTarget(sdk, playerPos(sdk) ?? pos, isTargetAvoided) ?? man;
        }

        const beforeXp = sdk.getSkillXp('Thieving') ?? sdk.getSkill('Thieving')?.experience ?? 0;
        const beforeInv = (sdk.getInventory() ?? []).map((item) => item.name);
        log(`thieving: pickpocket ${man.name}`);
        const result = await bot.pickpocketNpc(man);
        if (!result?.success) {
            log(`thieving: ${result?.message ?? 'failed'}`);
            const message = result?.message ?? 'failed';
            const observedFailure =
                ctx.observation?.errors.some((error) => error === 'cant_reach' || error === 'stun') ||
                ctx.observation?.recentChat.some((line) => /can't reach|cannot reach|stun/i.test(line));
            if (/stun/i.test(message)) {
                await sleep(5200);
            } else if (/cant_reach|reach|walk/i.test(message)) {
                await walkToPoint(bot, sdk, TRAINING_AREAS.lumbridgeMen, 'reposition men');
                await sleep(500);
            } else {
                await sleep(800);
            }
            if (/stun|cant_reach|reach|walk/i.test(message) || observedFailure) {
                noteAvoid(memory, avoidKey('npc', man.name, man.x, man.z), 30_000);
            }
            noteConfirm(memory, 'thieving', false, message);
            return false;
        }
        try {
            await sdk.waitForCondition(
                (s) =>
                    (s.skills?.find((sk) => sk.name === 'Thieving')?.experience ?? 0) > beforeXp ||
                    confirmByItemGain(beforeInv, (s.inventory ?? []).map((item) => item.name), /coins?/i),
                5000,
            );
        } catch {
            // Confirm below from the current snapshot.
        }
        await sleep(350);
        const afterXp = sdk.getSkillXp('Thieving') ?? sdk.getSkill('Thieving')?.experience ?? 0;
        const afterInv = (sdk.getInventory() ?? []).map((item) => item.name);
        const confirmed =
            confirmByXpDelta(beforeXp, afterXp) || confirmByItemGain(beforeInv, afterInv, /coins?/i);
        if (!confirmed) {
            noteAvoid(memory, avoidKey('npc', man.name, man.x, man.z), 30_000);
            noteConfirm(memory, 'thieving', false, ctx.observation?.errors[0] ?? 'no_progress');
            return false;
        }
        noteConfirm(memory, 'thieving', true, 'xp_or_item');
        return true;
    },
};
