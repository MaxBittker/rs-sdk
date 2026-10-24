import type { BotSDK } from '../../../sdk/index';
import type { BotActions } from '../../../sdk/actions';
import type { Emit } from '../telemetry/log';

/** Per-bot personality. Sampled once from the population file; stable across restarts. */
export interface Traits {
    /** Fractional undercut applied when joining the sell book (0.02 = 2%). */
    undercut: number;
    /** Items to accumulate before making a GE trip. Bigger = fewer trips, lumpier supply. */
    batch: number;
}

export interface AgentCtx {
    name: string;
    role: string;
    bot: BotActions;
    sdk: BotSDK;
    emit: Emit;
    traits: Traits;
    /** Mutable scratch persisted by the runner between steps/restarts. */
    mem: Record<string, any>;
}

export interface Step {
    name: string;
    run(ctx: AgentCtx): Promise<void>;
}

export interface Role {
    name: string;
    steps: Step[];
}
