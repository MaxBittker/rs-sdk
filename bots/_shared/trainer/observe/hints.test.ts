import { describe, expect, test } from 'bun:test';
import { deriveHints } from './hints';
import type { Observation, TrainerMemory } from '../types';

function obs(over: Partial<Observation> = {}): Observation {
    return {
        tickAt: '',
        inGame: true,
        x: 0,
        z: 0,
        hp: 10,
        hpMax: 10,
        inventoryCount: 0,
        coins: 0,
        dialogOpen: false,
        shopOpen: false,
        bankOpen: false,
        nearbyChop: [],
        nearbyMine: [],
        nearbyNpc: [],
        recentChat: [],
        errors: [],
        lowHp: false,
        noCombatTarget: false,
        noChopTarget: false,
        noMineTarget: false,
        ...over,
    };
}

function memory(over: Partial<TrainerMemory> = {}): TrainerMemory {
    return {
        avoids: [],
        ...over,
    };
}

describe('deriveHints', () => {
    test('noChopTarget sets noTargetNearby for woodcutting activeTask', () => {
        const hints = deriveHints(
            obs({ noChopTarget: true }),
            memory(),
            'woodcutting',
        );
        expect(hints.noTargetNearby).toBe(true);
        expect(hints.lowHp).toBe(false);
    });

    test('noChopTarget ignored when activeTask is not woodcutting', () => {
        const hints = deriveHints(
            obs({ noChopTarget: true }),
            memory(),
            'mining',
        );
        expect(hints.noTargetNearby).toBe(false);
    });

    test('noMineTarget sets noTargetNearby for mining activeTask', () => {
        const hints = deriveHints(
            obs({ noMineTarget: true }),
            memory(),
            'mining',
        );
        expect(hints.noTargetNearby).toBe(true);
    });

    test('recentFail when last confirm failed on same task', () => {
        const hints = deriveHints(
            obs(),
            memory({
                lastConfirm: { ok: false, task: 'woodcutting', at: '' },
            }),
            'woodcutting',
        );
        expect(hints.recentFail).toBe(true);
    });
});
