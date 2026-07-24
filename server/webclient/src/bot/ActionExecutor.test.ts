import { describe, expect, test } from 'bun:test';
import { ActionExecutor } from './ActionExecutor.js';

describe('ActionExecutor interaction routing', () => {
    test('surfaces an unreachable route instead of reporting packet dispatch', () => {
        const client = {
            interactNpc: () => ({ success: false, reason: 'cant_reach' as const }),
            projectNpcToScreen: () => null
        };
        const executor = new ActionExecutor(client as any);

        const result = executor.execute({
            type: 'interactNpc',
            npcIndex: 42,
            optionIndex: 1,
            reason: 'test'
        });

        expect(result).toEqual({
            success: false,
            message: 'Failed to interact with NPC: cant_reach',
            phase: 'routing',
            reason: 'cant_reach'
        });
    });

    test('describes successful primitive interactions as dispatch, not completion', () => {
        const client = {
            interactLoc: () => ({ success: true as const }),
            projectTileToScreen: () => null
        };
        const executor = new ActionExecutor(client as any);

        const result = executor.execute({
            type: 'interactLoc',
            x: 3200,
            z: 3200,
            locId: 1,
            optionIndex: 1,
            reason: 'test'
        });

        expect(result).toMatchObject({ success: true, phase: 'dispatch' });
    });
});
