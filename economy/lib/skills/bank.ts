import type { AgentCtx } from '../agent/types';
import { HUB } from './hub';

/** Walk to Varrock west bank, deposit everything matching `deposit`, optionally keep tools. */
export async function bankDeposit(ctx: AgentCtx, keep: RegExp) {
    const { bot, sdk } = ctx;
    const w = await bot.walkTo(HUB.varrockWestBank.x, HUB.varrockWestBank.z, 4);
    if (!w.success) throw new Error(`walk to bank: ${w.message}`);
    const open = await bot.openBank();
    if (!open.success) throw new Error(`openBank: ${open.message}`);
    let moved = 0;
    for (const item of [...sdk.getInventory()]) {
        if (keep.test(item.name)) continue;
        const r = await bot.depositItem(item, -1);
        moved += r.amountDeposited ?? 0;
    }
    ctx.emit('bank_deposit', { items: moved });
    return moved;
}

/** Withdraw as banknotes so one inventory slot carries many units. */
export async function bankWithdrawNoted(ctx: AgentCtx, pattern: RegExp, amount: number) {
    const r = await ctx.bot.withdrawItem(pattern, amount, { asNote: true });
    ctx.emit('bank_withdraw_noted', { pattern: String(pattern), got: r.amountWithdrawn ?? 0, ok: r.success });
    return r.amountWithdrawn ?? 0;
}

export async function bankClose(ctx: AgentCtx) {
    await ctx.bot.closeInterface();
}
