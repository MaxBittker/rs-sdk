import type { BotActions } from '../../../sdk/actions';
import type { BotSDK } from '../../../sdk/index';
import type { KitSpec, TaskName } from '../types';
import { kitForTask, TOOL_PATTERNS } from './kits';
import { hasItem, inventoryCount, sleep } from '../util';
import { TRAINING_AREAS } from '../knowledge/wiki';
import { walkToPoint } from '../travel';

function bankIsOpen(sdk: BotSDK): boolean {
    const s = sdk.getState();
    return !!(s?.bank?.isOpen);
}

async function ensureBankOpen(bot: BotActions, sdk: BotSDK, log: (m: string) => void): Promise<boolean> {
    if (bankIsOpen(sdk)) return true;

    const booth = sdk.findNearbyLoc(/bank\s*booth|bank chest/i);
    const banker = sdk.findNearbyNpc(/banker/i);
    if (booth || banker) {
        const opened = await bot.openBank();
        if (opened?.success || bankIsOpen(sdk)) return true;
        log(`bank: nearby open failed: ${opened?.message ?? 'unknown'}`);
    }

    await walkToPoint(bot, sdk, TRAINING_AREAS.lumbridgeBank, 'Lumbridge bank');
    await sleep(400);
    const result = await bot.openBank();
    if (result?.success || bankIsOpen(sdk)) return true;
    log(`bank: open failed: ${result?.message ?? 'unknown'}`);
    return false;
}

export async function runBankSession(
    bot: BotActions,
    sdk: BotSDK,
    task: TaskName,
    log: (msg: string) => void,
): Promise<boolean> {
    const kit: KitSpec = kitForTask(task);
    if (!(await ensureBankOpen(bot, sdk, log))) return false;

    // Deposit non-keep items (snapshot first — inventory mutates).
    const inv = [...(sdk.getInventory() ?? [])];
    for (const item of inv) {
        if (/coins?/i.test(item.name)) continue;
        const keep = kit.keep.some((re) => re.test(item.name));
        if (keep) continue;
        log(`bank: deposit ${item.name} x${item.count ?? 1}`);
        await bot.depositItem(item.name, item.count ?? -1);
        await sleep(120);
    }

    for (const tool of kit.depositTools ?? []) {
        const re = TOOL_PATTERNS[tool];
        if (!re) continue;
        // Don't deposit if this kit needs that tool.
        if (kit.withdraw.some((w) => w.label === tool || w.pattern.source === re.source)) continue;
        const item = sdk.findInventoryItem(re);
        if (item) {
            log(`bank: deposit tool ${item.name}`);
            await bot.depositItem(item.name, 1);
            await sleep(120);
        }
    }

    for (const need of kit.withdraw) {
        const have = sdk.findInventoryItem(need.pattern);
        const haveCount = have?.count ?? 0;
        if (haveCount >= need.n) continue;
        const bankItem = sdk.findBankItem(need.pattern);
        if (!bankItem) {
            log(`bank: missing ${need.pattern} in bank`);
            continue;
        }
        const n = Math.min(need.n - haveCount, bankItem.count ?? need.n);
        if (n <= 0) continue;
        log(`bank: withdraw ${bankItem.name} x${n}`);
        await bot.withdrawItem(bankItem.name, n);
        await sleep(120);
    }

    await bot.closeBank();
    log(`bank: done (inv=${inventoryCount(sdk)})`);
    return true;
}
