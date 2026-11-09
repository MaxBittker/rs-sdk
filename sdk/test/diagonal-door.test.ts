import { describe, expect, test } from 'bun:test';
import { findDoorsAlongPath, findLongPath, getDoorAt, isTileWalkable } from '../pathfinding';

// The Wizards' Tower inner door is a diagonal wall (shape 9). The door scan
// used to keep only WALL-layer shapes, so it was missing from the door index
// and its tile stayed blocked: walkTo into the tower's inner room found no route.
describe('diagonal doors', () => {
    const OUTSIDE = { x: 3109, z: 3172 };
    const INNER_ROOM = { x: 3106, z: 3161 };

    test('are in the door index', () => {
        expect(getDoorAt(0, 3107, 3162)).toMatchObject({ shape: 9, angle: 3 });
    });

    test('are routed through, and the route reports the door', () => {
        const path = findLongPath(0, OUTSIDE.x, OUTSIDE.z, INNER_ROOM.x, INNER_ROOM.z);
        expect(path.at(-1)).toMatchObject(INNER_ROOM);
        expect(findDoorsAlongPath(path).map(d => `${d.x},${d.z}`)).toContain('3107,3162');
    });

    test('are modelled open: the doorway is free and the tile the door swings onto is not', () => {
        // Closed at angle 3 (south), the door opens onto 3106,3162 (~door_open).
        expect(isTileWalkable(0, 3107, 3162)).toBe(true);
        expect(isTileWalkable(0, 3106, 3162)).toBe(false);
    });

    test('can be temporarily blocked and are unmasked again afterwards', () => {
        const door = getDoorAt(0, 3107, 3162)!;
        const blocked = findLongPath(0, OUTSIDE.x, OUTSIDE.z, INNER_ROOM.x, INNER_ROOM.z, 500, [door]);
        expect(blocked.at(-1)).not.toMatchObject(INNER_ROOM);

        expect(isTileWalkable(0, 3106, 3162)).toBe(false);
        const again = findLongPath(0, OUTSIDE.x, OUTSIDE.z, INNER_ROOM.x, INNER_ROOM.z);
        expect(again.at(-1)).toMatchObject(INNER_ROOM);
    });
});
