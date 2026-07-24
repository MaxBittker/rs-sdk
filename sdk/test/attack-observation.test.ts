import { describe, expect, test } from 'bun:test';
import { BotActions } from '../actions';
import type { NearbyNpc } from '../types';

const target: NearbyNpc = {
    index: 42,
    name: 'Guard',
    combatLevel: 21,
    x: 3201,
    z: 3200,
    distance: 1,
    hp: null,
    maxHp: null,
    healthPercent: null,
    targetIndex: -1,
    inCombat: false,
    lastCombatTick: null,
    animId: -1,
    spotanimId: -1,
    optionsWithIndex: [{ text: 'Attack', opIndex: 2 }],
    options: ['Attack']
};

function state(targetIndex: number, message?: string) {
    return {
        tick: message ? 2 : 1,
        player: {
            worldX: 3200,
            worldZ: 3200,
            lifeId: 1,
            isDead: false,
            combat: { inCombat: targetIndex >= 0, targetIndex, lastDamageTick: -1 }
        },
        nearbyNpcs: [target],
        skills: [
            { name: 'Attack', level: 1, baseLevel: 1, experience: 0 },
            { name: 'Strength', level: 1, baseLevel: 1, experience: 0 },
            { name: 'Defence', level: 1, baseLevel: 1, experience: 0 },
            { name: 'Hitpoints', level: 10, baseLevel: 10, experience: 1_154 }
        ],
        gameMessages: message
            ? [{ tick: 2, text: message, type: 0, sender: '', fromSelf: false }]
            : [],
        combatEvents: [],
        dialog: { isOpen: false, options: [], isWaiting: false },
        interface: { isOpen: false, interfaceId: -1, options: [] },
        shop: { isOpen: false },
        bank: { isOpen: false }
    } as any;
}

function createBot(finalTargetIndex: number) {
    let current = state(-1);
    const final = state(finalTargetIndex, "I'm already under attack!");
    const sdk = {
        getState: () => current,
        sendInteractNpc: async () => ({ success: true, message: 'dispatched', phase: 'dispatch' }),
        waitForStateChange: async () => {
            current = final;
            return final;
        }
    };
    return new BotActions(sdk as any);
}

describe('BotActions.attackNpc observation', () => {
    test('treats a refusal race as success when the requested target is engaged', async () => {
        const result = await createBot(target.index).attackNpc(target);
        expect(result).toEqual({ success: true, message: 'Already fighting Guard' });
    });

    test('keeps the refusal truthful when a different target is engaged', async () => {
        const result = await createBot(7).attackNpc(target);
        expect(result).toMatchObject({ success: false, reason: 'already_in_combat' });
    });
});
