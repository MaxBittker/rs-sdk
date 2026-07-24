#!/usr/bin/env bun

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildWikiIndex, searchWiki } from '../../wiki/search';

const wikiDir = join(import.meta.dir, '..', '..', 'wiki');

describe('wiki search index', () => {
    test('builds machine-readable records without a checked-in index artifact', async () => {
        const records = await buildWikiIndex(wikiDir);
        expect(records.length).toBeGreaterThan(2_000);

        const cowHide = records.find(record => record.kind === 'item' && record.name === 'Cow hide');
        expect(cowHide?.aliases).toContain('cow-hide');
        expect(cowHide?.obtainability.some(source => source.includes('Dropped by: Cow'))).toBeTrue();

        const cow = records.find(record => record.kind === 'npc' && record.name === 'Cow');
        expect(cow?.mapSquareBounds).toContainEqual({
            mapSquare: 'm50_50',
            minX: 3200,
            maxX: 3263,
            minZ: 3200,
            maxZ: 3263,
        });
    });

    test('ranks exact names and can filter by kind', async () => {
        const records = await buildWikiIndex(wikiDir);
        expect(searchWiki(records, 'cow hide', { kind: 'item', limit: 1 })[0]?.name).toBe('Cow hide');
        expect(searchWiki(records, 'cow', { kind: 'npc', limit: 1 })[0]?.name).toBe('Cow');
    });
});
