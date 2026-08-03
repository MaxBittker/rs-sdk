import { describe, expect, test } from 'bun:test';
import { buildObservation, classifyChatErrors } from './snapshot';

function mockSdk(over: Record<string, any> = {}) {
    const state = {
        inGame: true,
        player: { worldX: 3222, worldZ: 3218 },
        dialog: { isOpen: false },
        shop: { isOpen: false },
        bank: { isOpen: false },
        ...over.state,
    };
    return {
        getState: () => state,
        getInventory: () => over.inv ?? [{ name: 'Coins', count: 50 }],
        getNearbyLocs: () =>
            over.locs ?? [
                { name: 'Tree', x: 3220, z: 3218, optionsWithIndex: [{ text: 'Chop', opIndex: 0 }] },
            ],
        getNearbyNpcs: () => over.npcs ?? [{ name: 'Man', x: 3221, z: 3218 }],
        getNewChat: () => over.chat ?? [],
        getSkill: (name: string) =>
            name === 'Hitpoints'
                ? { level: over.hp ?? 10, baseLevel: over.hpMax ?? 10 }
                : { level: 1, baseLevel: 1 },
        ...over.extra,
    };
}

describe('buildObservation', () => {
    test('captures position, nearby chop, and coins', () => {
        const obs = buildObservation(mockSdk() as any);
        expect(obs.inGame).toBe(true);
        expect(obs.x).toBe(3222);
        expect(obs.nearbyChop.length).toBe(1);
        expect(obs.nearbyChop[0]!.name).toBe('Tree');
        expect(obs.noChopTarget).toBe(false);
        expect(obs.coins).toBe(50);
    });

    test('flags lowHp when current HP <= 40% max', () => {
        const obs = buildObservation(mockSdk({ hp: 3 }) as any);
        expect(obs.lowHp).toBe(true);
        expect(obs.hp).toBe(3);
    });

    test('classifies cant_reach and stun from chat', () => {
        const errs = classifyChatErrors([
            { text: "I can't reach that!" },
            { text: 'You are stunned!' },
        ]);
        expect(errs).toContain('cant_reach');
        expect(errs).toContain('stun');
    });
});
