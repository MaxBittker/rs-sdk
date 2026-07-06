/**
 * Accumulated chat history for the SDK.
 *
 * The client keeps a 100-deep chat ring and the bot page snapshots the 50 most
 * recent messages into every state sync (~1 per server tick). Reading only the
 * latest snapshot means anything older than 50 messages is gone — a busy grind
 * session evicts a teammate's instructions in under a minute. This class merges
 * each snapshot into a persistent, deduplicated buffer so the SDK retains the
 * last {@link CHAT_HISTORY_LIMIT} messages seen since connect, regardless of
 * how fast the client ring churns.
 *
 * Merging relies on two properties of the client ring:
 * - `tick` (Client.loopCycle) is monotonically non-decreasing per message,
 *   except when the page reloads (loopCycle restarts near 0 with a fresh ring).
 * - Messages sharing a tick keep their relative order in every snapshot.
 */

import type { GameMessage } from './types';

/** Messages retained by the SDK, independent of the client's 100-deep ring. */
export const CHAT_HISTORY_LIMIT = 500;

export class ChatHistory {
    private messages: GameMessage[] = [];
    private totalRecorded = 0;
    private readonly limit: number;

    constructor(limit: number = CHAT_HISTORY_LIMIT) {
        this.limit = limit;
    }

    /**
     * Total messages ever recorded (monotonic, unaffected by trimming). Read
     * this as a cursor, then pass it to {@link since} to get what came after.
     */
    get seen(): number {
        return this.totalRecorded;
    }

    /**
     * Merge a chronological state-sync snapshot into the history. Returns the
     * messages that were genuinely new (also chronological).
     */
    record(snapshot: GameMessage[]): GameMessage[] {
        if (!snapshot || snapshot.length === 0) return [];

        const last = this.messages[this.messages.length - 1];
        let fresh: GameMessage[];

        if (!last) {
            fresh = snapshot.slice();
        } else if (snapshot[snapshot.length - 1]!.tick < last.tick) {
            // Ticks went backwards: the client page reloaded, so loopCycle
            // restarted and the ring was rebuilt from empty. Nothing in this
            // snapshot can overlap what we already hold.
            fresh = snapshot.slice();
        } else {
            // Normal case: the snapshot overlaps our tail. Everything newer
            // than our last tick is new. Messages AT our last tick may be
            // split across snapshots (a chat packet processed after the
            // PLAYER_INFO that triggered the previous sync gets the same
            // loopCycle), so count how many of that tick we already hold and
            // keep only the surplus.
            let held = 0;
            for (let i = this.messages.length - 1; i >= 0 && this.messages[i]!.tick === last.tick; i--) {
                held++;
            }
            let matched = 0;
            fresh = [];
            for (const m of snapshot) {
                if (m.tick < last.tick) continue;
                if (m.tick === last.tick && ++matched <= held) continue;
                fresh.push(m);
            }
        }

        if (fresh.length > 0) {
            this.messages.push(...fresh);
            this.totalRecorded += fresh.length;
            if (this.messages.length > this.limit) {
                this.messages.splice(0, this.messages.length - this.limit);
            }
        }
        return fresh;
    }

    /** All retained messages, oldest first. */
    all(): GameMessage[] {
        return this.messages;
    }

    /**
     * Messages recorded after a cursor previously read from {@link seen},
     * oldest first. If more messages arrived than the buffer retains, the
     * overflow is silently gone — at 500 retained that takes minutes of
     * uninterrupted spam between reads.
     */
    since(cursor: number): GameMessage[] {
        const missed = this.totalRecorded - cursor;
        if (missed <= 0) return [];
        return this.messages.slice(Math.max(0, this.messages.length - missed));
    }
}
