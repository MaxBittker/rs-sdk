/**
 * Logic test for walkTo()'s handling of partial paths - no bot required.
 *
 * findPath reports reachedDestination=false when the route stops short (e.g.
 * indoors, when the local mask lets the pathfinder route through a door into a
 * room the destination isn't reachable from). walkTo used to ignore the flag,
 * walk the partial path, re-query the identical partial path from the dead end
 * and walk it again - forever. It must walk a partial path once (doors open and
 * zones allocate along the way), then fail fast with the shortfall when a
 * re-query ends at the same tile.
 */

import { describe, expect, test } from 'bun:test';
import { BotSDK } from '../index';
import { BotActions } from '../actions';

type PathResult = {
    success: boolean;
    waypoints: Array<{ x: number; z: number; level: number }>;
    reachedDestination?: boolean;
    error?: string;
};

function makeBot(pathForPos: (pos: { x: number; z: number }) => PathResult) {
    const sdk = Object.create(BotSDK.prototype) as BotSDK;
    const pos = { x: 3153, z: 3427 };
    let pathQueries = 0;

    (sdk as any).getState = () => ({
        tick: 0,
        player: { worldX: pos.x, worldZ: pos.z, x: pos.x, z: pos.z, level: 0, animId: -1 },
        dialog: { isOpen: false, options: [], isWaiting: false },
        interface: { isOpen: false },
        shop: { isOpen: false },
        bank: { isOpen: false },
        nearbyLocs: [],
        gameMessages: [],
        inventory: [],
    });
    (sdk as any).sendFindPath = async (): Promise<PathResult> => {
        pathQueries++;
        return pathForPos({ ...pos });
    };
    (sdk as any).waitForTicks = async () => {};
    (sdk as any).getNearbyLocs = () => [];
    (sdk as any).isDoorTemporarilyBlocked = () => false;

    const bot = new BotActions(sdk);
    // Teleport-style step: every waypoint walk lands exactly on the waypoint.
    (bot as any).helpers.walkStepToward = async (targetX: number, targetZ: number) => {
        pos.x = targetX;
        pos.z = targetZ;
        return { status: 'progress', pos: { ...pos } };
    };
    (bot as any).helpers.tryOpenBlockingDoor = async () => false;

    return { bot, pos, queries: () => pathQueries };
}

describe('walkTo() partial paths', () => {
    test('fails fast with the shortfall when re-queries dead-end at the same tile', async () => {
        // The reported shape: from inside a Varrock house, every query to the
        // bank returns success=true with waypoints that stop at (3164, 3435),
        // 21 tiles short, reachedDestination=false.
        const deadEnd = { x: 3164, z: 3435, level: 0 };
        const { bot, queries } = makeBot(pos => ({
            success: true,
            reachedDestination: false,
            waypoints: pos.x === deadEnd.x && pos.z === deadEnd.z
                ? [deadEnd] // re-query from the dead end: same endpoint
                : [{ x: 3160, z: 3432, level: 0 }, deadEnd],
        }));

        const result = await bot.walkTo(3185, 3436, 2);

        expect(result.success).toBe(false);
        expect(result.message).toContain('stops');
        expect(result.message).toContain('(3164, 3435)');
        // One walked partial path + one re-query that detects the repeat -
        // not 50 iterations of re-walking the same route.
        expect(queries()).toBe(2);
    });

    test('a partial path that reaches within tolerance still succeeds', async () => {
        // Stopping 2 tiles from the destination with tolerance 3 is arrival,
        // reachedDestination flag or not.
        const { bot } = makeBot(() => ({
            success: true,
            reachedDestination: false,
            waypoints: [{ x: 3183, z: 3436, level: 0 }],
        }));

        const result = await bot.walkTo(3185, 3436, 3);

        expect(result.success).toBe(true);
    });

    test('full paths still arrive', async () => {
        const { bot } = makeBot(() => ({
            success: true,
            reachedDestination: true,
            waypoints: [{ x: 3170, z: 3430, level: 0 }, { x: 3185, z: 3436, level: 0 }],
        }));

        const result = await bot.walkTo(3185, 3436, 2);

        expect(result.success).toBe(true);
    });

    test('rejects non-numeric coordinates instead of walking', async () => {
        // walkTo(p.worldX, p.worldZ) with a NearbyPlayer (which only has .x/.z)
        // used to become walkTo(undefined, undefined) and march across the map.
        const { bot, queries } = makeBot(() => ({
            success: true,
            reachedDestination: true,
            waypoints: [{ x: 3170, z: 3430, level: 0 }],
        }));

        const result = await bot.walkTo(undefined as any, undefined as any);

        expect(result.success).toBe(false);
        expect(result.message).toContain('numeric');
        expect(queries()).toBe(0);
    });
});
