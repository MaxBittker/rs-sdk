import { describe, expect, test } from 'bun:test';

import { isRoutableDoor } from '#/web/pages/collision-doors.js';

const door = { blockwalk: true, blockrange: true, width: 1, length: 1, op: ['Open', null, null, null, null] };

describe('isRoutableDoor', () => {
    test('accepts openable straight and corner walls', () => {
        for (const shape of [0, 1, 2, 3]) {
            expect(isRoutableDoor(shape, door)).toBe(true);
        }
    });

    test('accepts 1x1 diagonal doors (shape 9), e.g. the Wizards\' Tower inner door', () => {
        expect(isRoutableDoor(9, door)).toBe(true);
        expect(isRoutableDoor(9, { ...door, width: 2, length: 2 })).toBe(false);
    });

    test('rejects locs that cannot be opened, do not block, or are not walls', () => {
        expect(isRoutableDoor(0, { ...door, op: ['Search', null, null, null, null] })).toBe(false);
        expect(isRoutableDoor(0, { ...door, blockwalk: false })).toBe(false);
        expect(isRoutableDoor(10, door)).toBe(false);
        expect(isRoutableDoor(22, door)).toBe(false);
        expect(isRoutableDoor(0, null)).toBe(false);
    });
});
