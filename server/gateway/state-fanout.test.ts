import { describe, expect, test } from 'bun:test';

import { repeatsLastFanout } from './state-fanout';
import type { BotWorldState } from './types';

function state(tick: number, revision: number, extra: Record<string, unknown> = {}): BotWorldState {
    return { tick, revision, inGame: true, player: { name: 'bot', worldX: 3222, worldZ: 3218 }, ...extra } as unknown as BotWorldState;
}

describe('repeatsLastFanout', () => {
    test('a post-action frame identical except for its revision is a repeat', () => {
        expect(repeatsLastFanout(state(10, 5), state(10, 6))).toBe(true);
    });

    test('any content difference goes out', () => {
        expect(repeatsLastFanout(state(10, 5), state(10, 6, { inventory: [{ id: 1 }] }))).toBe(false);
    });

    test('a new tick always goes out, even with identical content', () => {
        expect(repeatsLastFanout(state(10, 5), state(11, 6))).toBe(false);
    });

    test('nothing to compare against goes out', () => {
        expect(repeatsLastFanout(null, state(10, 5))).toBe(false);
    });

    test('comparison leaves both revisions intact', () => {
        const previous = state(10, 5);
        const next = state(10, 6);
        repeatsLastFanout(previous, next);
        expect((previous as any).revision).toBe(5);
        expect((next as any).revision).toBe(6);
    });

    test('frames without a revision compare on content alone', () => {
        const a = { tick: 3, inGame: true } as unknown as BotWorldState;
        const b = { tick: 3, inGame: true } as unknown as BotWorldState;
        expect(repeatsLastFanout(a, b)).toBe(true);
        expect('revision' in b).toBe(false);
    });
});
