// Proxy wrapper for bot/sdk that records in-flight calls and reports each
// completed call to registered observers (e.g. an external audit log).

export interface ActionCall {
    /** e.g. 'bot.walkTo' or 'sdk.sendClickDialog' */
    method: string;
    args: unknown[];
    result?: unknown;
    /** Set when the call threw or rejected. */
    error?: unknown;
    startedAt: number;
    durationMs: number;
    /** Whatever the wrapping caller passed, e.g. { botName, source }. */
    context?: Record<string, unknown>;
}

export type ActionObserver = (call: ActionCall) => void;

const observers = new Set<ActionObserver>();

/** Registers an observer for every completed tracked call; returns an unregister function. */
export function addActionObserver(observer: ActionObserver): () => void {
    observers.add(observer);
    return () => observers.delete(observer);
}

function notify(call: ActionCall): void {
    for (const observer of observers) {
        // An observer must never be able to break the call it is watching.
        try { observer(call); } catch { /* ignore */ }
    }
}

/** Records which bot/sdk calls are in flight for diagnostics; once cancelled, calls park instead of throwing. */
export function tracked<T extends object>(
    object: T,
    label: string,
    active: Map<symbol, string>,
    signal: AbortSignal,
    context?: Record<string, unknown>,
): T {
    return new Proxy(object, {
        get(target, prop) {
            const value = Reflect.get(target, prop, target);
            if (typeof value !== 'function') return value;
            return (...args: unknown[]) => {
                // A throw here would let a catch-all loop in cancelled code spin and starve the server.
                if (signal.aborted) return new Promise(() => {});
                const token = Symbol();
                const method = `${label}.${String(prop)}`;
                const startedAt = Date.now();
                active.set(token, method);
                const done = (result: unknown, error?: unknown) => {
                    active.delete(token);
                    if (observers.size > 0) notify({ method, args, result, error, startedAt, durationMs: Date.now() - startedAt, context });
                };
                try {
                    const result = value.apply(target, args);
                    if (result && typeof result.then === 'function') {
                        return Promise.resolve(result).then(
                            r => { done(r); return r; },
                            e => { done(undefined, e ?? new Error('rejected')); throw e; },
                        );
                    }
                    done(result);
                    return result;
                } catch (error) { done(undefined, error ?? new Error('threw')); throw error; }
            };
        },
    });
}
