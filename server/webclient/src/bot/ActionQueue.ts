import type { BotAction } from './types.js';

export interface QueuedBotAction {
    action: BotAction;
    actionId: string | null;
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

    enqueue(entry: QueuedBotAction): void {
        this.entries.push(entry);
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
    }
}
