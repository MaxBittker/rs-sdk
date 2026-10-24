// Step runner: cycles a role's steps forever. A failing step is logged and the
// cycle continues from the top; every step re-derives its preconditions from the
// world (inventory, position, GE state) so a restart anywhere is safe.
import type { AgentCtx, Role } from './types';

export async function runRole(ctx: AgentCtx, role: Role, opts: { cycles?: number; stop?: () => boolean } = {}) {
    const maxCycles = opts.cycles ?? Infinity;
    for (let cycle = 1; cycle <= maxCycles && !opts.stop?.(); cycle++) {
        ctx.emit('cycle_start', { cycle });
        for (const step of role.steps) {
            const t0 = Date.now();
            try {
                await step.run(ctx);
                ctx.emit('step_ok', { step: step.name, ms: Date.now() - t0 });
            } catch (e) {
                ctx.emit('step_fail', { step: step.name, ms: Date.now() - t0, error: String((e as Error)?.message ?? e) });
                await ctx.sdk.waitForTicks(5).catch(() => {});
                break; // restart the cycle: step 1 re-establishes preconditions
            }
        }
    }
}
