#!/usr/bin/env bun

import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    buildApiModel,
    generateApiMarkdown,
} from '../generate-api-docs';

const sdkDir = join(import.meta.dir, '..');

describe('generated API reference', () => {
    test('matches the checked-in document', async () => {
        const [generated, checkedIn] = await Promise.all([
            generateApiMarkdown(sdkDir),
            readFile(join(sdkDir, 'API.md'), 'utf8'),
        ]);
        expect(checkedIn).toBe(generated);
    });

    test('contains every public class method and complete signatures', async () => {
        const model = await buildApiModel(sdkDir);
        const generated = await generateApiMarkdown(sdkDir);
        const methods = [...model.botActionsMethods, ...model.sdkMethods];

        expect(methods.length).toBeGreaterThan(100);
        for (const method of methods) {
            expect(generated).toContain(method.name);
            expect(method.signature).toContain(':');
        }

        for (const historicallyOmittedMethod of [
            'navigateDialog',
            'onConnectionStateChange',
            'onStateUpdate',
            'waitForCondition',
        ]) {
            expect(methods.some(method => method.name === historicallyOmittedMethod)).toBeTrue();
        }
    });

    test('preserves async markers, return types, defaults, and dotted descriptions', async () => {
        const model = await buildApiModel(sdkDir);
        const methods = [...model.botActionsMethods, ...model.sdkMethods];

        expect(methods.find(method => method.name === 'scanNearbyLocs')?.signature)
            .toBe('async scanNearbyLocs(radius?: number): Promise<NearbyLoc[]>');
        expect(methods.find(method => method.name === 'sendWalk')?.signature)
            .toContain('running: boolean = true');
        expect(methods.find(method => method.name === 'useItemOnLoc')?.description)
            .toContain('e.g.');
    });
});
