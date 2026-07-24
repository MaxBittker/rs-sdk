import { describe, expect, test } from 'bun:test';
import { BotActionQueue } from './ActionQueue.js';
import type { QueuedBotAction } from './ActionQueue.js';

function entry(actionId: string): Omit<QueuedBotAction, 'generation' | 'enqueuedAt' | 'expiresAt'> {
    return {
        actionId,
        action: { type: 'none', reason: 'test' }
    };
}

describe('BotActionQueue', () => {
    test('preserves FIFO ordering without overwriting the active action', () => {
        const queue = new BotActionQueue();
        const first = entry('first');
        const second = entry('second');

        const queuedFirst = queue.enqueue(first)!;
        const queuedSecond = queue.enqueue(second)!;

        expect(queue.startNext()).toBe(queuedFirst);
        expect(queue.startNext()).toBeNull();
        expect(queue.active).toBe(queuedFirst);
        expect(queue.pendingCount).toBe(1);

        expect(queue.complete(queuedFirst)).toBeTrue();
        expect(queue.startNext()).toBe(queuedSecond);
    });

    test('ignores stale async completions after the queue is cleared', () => {
        const queue = new BotActionQueue();
        const stale = entry('stale');
        const queuedStale = queue.enqueue(stale)!;
        expect(queue.startNext()).toBe(queuedStale);

        queue.clear();
        const fresh = entry('fresh');
        const queuedFresh = queue.enqueue(fresh)!;
        expect(queue.startNext()).toBe(queuedFresh);

        expect(queue.complete(queuedStale)).toBeFalse();
        expect(queue.active).toBe(queuedFresh);
    });

    test('holds fresh work behind a stale in-flight promise after reconnect', () => {
        const queue = new BotActionQueue();
        const stale = queue.enqueue(entry('stale'))!;
        expect(queue.startNext()).toBe(stale);

        queue.beginGeneration();
        const fresh = queue.enqueue(entry('fresh'))!;

        expect(queue.isCurrentGeneration(stale)).toBeFalse();
        expect(queue.startNext()).toBeNull();
        expect(queue.active).toBe(stale);

        expect(queue.complete(stale)).toBeTrue();
        expect(queue.startNext()).toBe(fresh);
    });

    test('rejects saturation instead of accepting unbounded ghost actions', () => {
        const queue = new BotActionQueue(Date.now, 2);
        expect(queue.enqueue(entry('one'))).not.toBeNull();
        expect(queue.enqueue(entry('two'))).not.toBeNull();
        expect(queue.enqueue(entry('three'))).toBeNull();
    });

    test('expires pending entries before the SDK action timeout', () => {
        let now = 1_000;
        const queue = new BotActionQueue(() => now, 64, 55_000);
        const queued = queue.enqueue(entry('expires'), 4_000)!;

        now += 3_999;
        expect(queue.expirePending()).toEqual([]);
        now += 1;
        expect(queue.expirePending()).toEqual([queued]);
        expect(queue.startNext()).toBeNull();
    });
});
