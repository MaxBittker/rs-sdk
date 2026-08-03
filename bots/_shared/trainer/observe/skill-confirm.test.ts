import { expect, test } from 'bun:test';
import { defaultMemory, avoidKey, isAvoided } from '../memory';
import { thievingSkill } from '../skills/thieving';

test('thieving avoids an NPC when successful interaction has no confirmed progress', async () => {
    const memory = defaultMemory();
    const man = { name: 'Man', x: 3201, z: 3201 };
    const sdk = {
        getState: () => ({ player: { worldX: 3200, worldZ: 3200 } }),
        getNearbyNpcs: () => [man],
        getSkillXp: () => 0,
        getSkill: () => ({ experience: 0 }),
        getInventory: () => [],
        waitForCondition: async () => {
            throw new Error('timed out');
        },
    };
    const bot = {
        pickpocketNpc: async () => ({ success: true }),
    };

    const result = await thievingSkill.run({
        sdk,
        bot,
        levels: { Thieving: 1 },
        coins: 0,
        inventoryCount: 0,
        memory,
        log: () => {},
    } as any);

    expect(result).toBe(false);
    expect(memory.lastConfirm).toMatchObject({ task: 'thieving', ok: false });
    expect(isAvoided(memory, avoidKey('npc', man.name, man.x, man.z))).toBe(true);
});
