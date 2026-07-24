// Unit tests for loc id-filtering (issue #23).
//
// findNearbyLoc / scanFindNearbyLoc / interactLoc must be able to disambiguate
// same-named locations by id (e.g. all ore rocks are named "Rocks" but each ore
// type has a distinct id). These tests exercise the pure matching logic
// (`locMatcher`) that all three code paths delegate to — no live bot required.

import { test, expect, describe } from 'bun:test';
import { locMatcher } from '../index';
import type { NearbyLoc } from '../types';

function loc(id: number, name: string, distance = 1): NearbyLoc {
    return { id, name, x: 0, z: 0, distance, optionsWithIndex: [], options: [] };
}

// Two same-named rocks with different ore ids, plus an unrelated tree.
const tinRock = loc(2094, 'Rocks', 1);   // tin
const copperRock = loc(2091, 'Rocks', 3); // copper (the one we want)
const tree = loc(1276, 'Tree', 2);
const locs: NearbyLoc[] = [tinRock, copperRock, tree];

describe('locMatcher', () => {
    test('name-only matches by regex (legacy behavior, unchanged)', () => {
        const match = locMatcher(/rocks/i);
        expect(locs.filter(match)).toEqual([tinRock, copperRock]);
        // .find() semantics: returns the first (closest) match, same as before.
        expect(locs.find(match)).toBe(tinRock);
    });

    test('name + { id } options narrows to the requested variant', () => {
        const match = locMatcher(/rocks/i, { id: 2091 });
        expect(locs.filter(match)).toEqual([copperRock]);
        expect(locs.find(match)).toBe(copperRock);
    });

    test('LocFilter { name, id } object form', () => {
        const match = locMatcher({ name: /rocks/i, id: 2091 });
        expect(locs.find(match)).toBe(copperRock);
    });

    test('LocFilter { id } alone matches by id regardless of name', () => {
        const match = locMatcher({ id: 1276 });
        expect(locs.find(match)).toBe(tree);
    });

    test('string name is treated as a case-insensitive regex', () => {
        const match = locMatcher('ROCKS');
        expect(locs.filter(match)).toEqual([tinRock, copperRock]);
    });

    test('id filter that matches nothing yields no match', () => {
        const match = locMatcher(/rocks/i, { id: 9999 });
        expect(locs.find(match)).toBeUndefined();
    });

    test('empty LocFilter matches everything', () => {
        const match = locMatcher({});
        expect(locs.filter(match)).toEqual(locs);
    });

    test('name regex + id must both hold (id wins over a broad name)', () => {
        // /./ matches every name, so only the id constraint discriminates.
        const match = locMatcher(/./, { id: 2094 });
        expect(locs.find(match)).toBe(tinRock);
    });
});
