// Whether a bot's state frame can skip the fan-out to its SDK subscribers.
//
// Bots publish once per game tick and again right after each action result.
// When the action hasn't changed anything visible yet, that second frame
// repeats the first except for its publication revision. Subscribers learn
// nothing from it and get the next tick's frame instead (at most one tick
// later). Frames from a new tick, or with any difference at all, always go out.

import type { BotWorldState } from './types';

type RevisionedState = BotWorldState & { revision?: number };

export function repeatsLastFanout(previous: BotWorldState | null, next: BotWorldState): boolean {
    if (!previous || previous === next || previous.tick !== next.tick) return false;
    return jsonIgnoringRevision(previous) === jsonIgnoringRevision(next);
}

function jsonIgnoringRevision(state: RevisionedState): string {
    if (!('revision' in state)) return JSON.stringify(state);
    const revision = state.revision;
    state.revision = 0;
    try {
        return JSON.stringify(state);
    } finally {
        state.revision = revision;
    }
}
