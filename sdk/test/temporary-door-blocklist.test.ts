import { describe, expect, test } from 'bun:test';
import { TemporaryDoorBlocklist, type DoorInfo } from '../pathfinding';

const door: DoorInfo = {
    level: 0,
    x: 3200,
    z: 3201,
    shape: 0,
    angle: 1,
    blockrange: false
};

describe('TemporaryDoorBlocklist', () => {
    test('expires transient route evidence', () => {
        let now = 1_000;
        const blocklist = new TemporaryDoorBlocklist(() => now);

        blocklist.block(door, 500);
        expect(blocklist.active()).toEqual([door]);

        now = 1_500;
        expect(blocklist.active()).toEqual([]);
    });

    test('is isolated per SDK session', () => {
        const first = new TemporaryDoorBlocklist(() => 0);
        const second = new TemporaryDoorBlocklist(() => 0);

        first.block(door);
        expect(first.active()).toEqual([door]);
        expect(second.active()).toEqual([]);
    });
});
