import { describe, expect, test } from 'bun:test';
import { defaultMemory, noteAvoid, isAvoided, expireAvoids, noteConfirm, avoidKey } from '../memory';
import { confirmByXpDelta, confirmByItemGain } from './confirm';

describe('memory avoids', () => {
    test('noteAvoid blocks until expiry', () => {
        const m = defaultMemory();
        const key = avoidKey('loc', 'Tree', 3200, 3200);
        noteAvoid(m, key, 60_000, 1_000);
        expect(isAvoided(m, key, 1_500)).toBe(true);
        expect(isAvoided(m, key, 70_000)).toBe(false);
    });

    test('expireAvoids removes past keys', () => {
        const m = defaultMemory();
        noteAvoid(m, 'loc:Tree:1:1', 100, 0);
        expireAvoids(m, 200);
        expect(m.avoidUntil?.['loc:Tree:1:1']).toBeUndefined();
    });

    test('noteConfirm stores last result', () => {
        const m = defaultMemory();
        noteConfirm(m, 'woodcutting', false, 'cant_reach');
        expect(m.lastConfirm?.ok).toBe(false);
        expect(m.lastConfirm?.reason).toBe('cant_reach');
    });
});

describe('confirm helpers', () => {
    test('xp delta detects success', () => {
        expect(confirmByXpDelta(100, 120)).toBe(true);
        expect(confirmByXpDelta(100, 100)).toBe(false);
    });

    test('item gain detects new matching item', () => {
        expect(confirmByItemGain(['Bronze axe'], ['Bronze axe', 'Logs'], /logs?/i)).toBe(true);
        expect(confirmByItemGain(['Logs'], ['Logs'], /logs?/i)).toBe(false);
    });
});
