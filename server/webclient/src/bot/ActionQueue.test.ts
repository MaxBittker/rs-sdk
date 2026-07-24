import { describe, expect, test } from 'bun:test';
import { BotActionQueue } from './ActionQueue.js';
import type { QueuedBotAction } from './ActionQueue.js';

function entry(actionId: string): QueuedBotAction {
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

        queue.enqueue(first);
        queue.enqueue(second);

        expect(queue.startNext()).toBe(first);
        expect(queue.startNext()).toBeNull();
        expect(queue.active).toBe(first);
        expect(queue.pendingCount).toBe(1);

        expect(queue.complete(first)).toBeTrue();
        expect(queue.startNext()).toBe(second);
    });

    test('ignores stale async completions after the queue is cleared', () => {
        const queue = new BotActionQueue();
        const stale = entry('stale');
        queue.enqueue(stale);
        expect(queue.startNext()).toBe(stale);

        queue.clear();
        const fresh = entry('fresh');
        queue.enqueue(fresh);
        expect(queue.startNext()).toBe(fresh);

        expect(queue.complete(stale)).toBeFalse();
        expect(queue.active).toBe(fresh);
    });
});
