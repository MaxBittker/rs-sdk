import type { BotAction } from './types.js';

export interface QueuedBotAction {
    action: BotAction;
    actionId: string | null;
    generation: number;
    enqueuedAt: number;
    expiresAt: number;
}

/**
 * Single-consumer FIFO for browser actions.
 *
 * The game client can execute only one action at a time. Keeping the active
 * entry separate prevents a later gateway message from overwriting the action
 * id whose result is still pending.
 */
export class BotActionQueue {
    private entries: QueuedBotAction[] = [];
    private current: QueuedBotAction | null = null;
    private generation = 0;

    constructor(
        private readonly now: () => number = Date.now,
        private readonly maxPending: number = 64,
        private readonly entryTtlMs: number = 55_000
    ) {}

    enqueue(
        entry: Omit<QueuedBotAction, 'generation' | 'enqueuedAt' | 'expiresAt'>,
        ttlMs: number = this.entryTtlMs
    ): QueuedBotAction | null {
        if (this.entries.length >= this.maxPending) return null;
        const enqueuedAt = this.now();
        const queued = {
            ...entry,
            generation: this.generation,
            enqueuedAt,
            expiresAt: enqueuedAt + Math.max(0, ttlMs)
        };
        this.entries.push(queued);
        return queued;
    }

    /** Remove pending work that can no longer complete before SDK timeout. */
    expirePending(): QueuedBotAction[] {
        const now = this.now();
        const expired: QueuedBotAction[] = [];
        this.entries = this.entries.filter(entry => {
            if (entry.expiresAt > now) return true;
            expired.push(entry);
            return false;
        });
        return expired;
    }

    /**
     * Drop work that has not started, but retain an in-flight action as a
     * quiescence barrier until its promise settles.
     */
    beginGeneration(): void {
        this.generation++;
        this.entries = [];
    }

    isCurrentGeneration(entry: QueuedBotAction): boolean {
        return entry.generation === this.generation;
    }

    startNext(): QueuedBotAction | null {
        if (this.current) return null;
        this.current = this.entries.shift() ?? null;
        return this.current;
    }

    get active(): QueuedBotAction | null {
        return this.current;
    }

    get pendingCount(): number {
        return this.entries.length;
    }

    complete(entry: QueuedBotAction): boolean {
        if (this.current !== entry) return false;
        this.current = null;
        return true;
    }

    clear(): void {
        this.entries = [];
        this.current = null;
        this.generation++;
    }
}
