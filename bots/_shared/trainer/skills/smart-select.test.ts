import { describe, expect, test } from 'bun:test';
import { bestResourceForLevel } from '../knowledge/wiki';
import { pickBestTree } from './smart-select';

describe('smart tree selection', () => {
    test('selects a level-one mining ore from numeric-first wiki rows', () => {
        const resource = bestResourceForLevel('mining', 1, /ores?/i);
        expect(resource).not.toBeNull();
        expect(resource!.name).toMatch(/tin|copper|rune essence/i);
        expect(resource!.level).toBe(1);
    });

    test('never picks oak below level 15', () => {
        const sdk = {
            getState: () => ({ player: { worldX: 3200, worldZ: 3200 } }),
            getNearbyLocs: () => [
                {
                    name: 'Oak',
                    x: 3201,
                    z: 3201,
                    optionsWithIndex: [{ text: 'Chop down', opIndex: 1 }],
                },
                {
                    name: 'Tree',
                    x: 3205,
                    z: 3205,
                    optionsWithIndex: [{ text: 'Chop down', opIndex: 1 }],
                },
            ],
        } as any;
        const pick = pickBestTree(sdk, 1);
        expect(pick).not.toBeNull();
        expect(pick!.loc.name).toBe('Tree');
        expect(pick!.levelReq).toBe(1);
    });

    test('prefers willow over oak at 30', () => {
        const sdk = {
            getState: () => ({ player: { worldX: 3200, worldZ: 3200 } }),
            getNearbyLocs: () => [
                {
                    name: 'Oak',
                    x: 3201,
                    z: 3201,
                    optionsWithIndex: [{ text: 'Chop down', opIndex: 1 }],
                },
                {
                    name: 'Willow',
                    x: 3210,
                    z: 3210,
                    optionsWithIndex: [{ text: 'Chop down', opIndex: 1 }],
                },
            ],
        } as any;
        const pick = pickBestTree(sdk, 30);
        expect(pick!.loc.name).toBe('Willow');
    });

    test('preferred wiki name boosts matching tree', () => {
        const sdk = {
            getState: () => ({ player: { worldX: 3200, worldZ: 3200 } }),
            getNearbyLocs: () => [
                {
                    name: 'Tree',
                    x: 3201,
                    z: 3201,
                    optionsWithIndex: [{ text: 'Chop down', opIndex: 1 }],
                },
                {
                    name: 'Oak',
                    x: 5400,
                    z: 3200,
                    optionsWithIndex: [{ text: 'Chop down', opIndex: 1 }],
                },
            ],
        } as any;
        const pick = pickBestTree(sdk, 20, 'Oak');
        expect(pick!.loc.name).toBe('Oak');
    });

    test('skips avoided tree locations', () => {
        const sdk = {
            getState: () => ({ player: { worldX: 3200, worldZ: 3200 } }),
            getNearbyLocs: () => [
                {
                    name: 'Oak',
                    x: 3201,
                    z: 3201,
                    optionsWithIndex: [{ text: 'Chop down', opIndex: 1 }],
                },
                {
                    name: 'Tree',
                    x: 3202,
                    z: 3202,
                    optionsWithIndex: [{ text: 'Chop down', opIndex: 1 }],
                },
            ],
        } as any;
        const pick = pickBestTree(sdk, 20, null, (loc) => loc.name === 'Oak');
        expect(pick!.loc.name).toBe('Tree');
    });
});
