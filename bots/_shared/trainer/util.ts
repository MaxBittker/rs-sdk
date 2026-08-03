import type { BotSDK } from '../../../sdk/index';

export function playerPos(sdk: BotSDK): { x: number; z: number } | null {
    const p = sdk.getState()?.player;
    if (!p) return null;
    return { x: p.worldX, z: p.worldZ };
}

export function inventoryCount(sdk: BotSDK): number {
    return sdk.getInventory()?.length ?? 0;
}

export function countMatching(sdk: BotSDK, pattern: RegExp): number {
    return (sdk.getInventory() ?? [])
        .filter((i) => pattern.test(i.name))
        .reduce((sum, i) => sum + (i.count ?? 1), 0);
}

export function hasItem(sdk: BotSDK, pattern: RegExp): boolean {
    return !!(sdk.findInventoryItem(pattern) || sdk.findEquipmentItem(pattern));
}

export function coinCount(sdk: BotSDK): number {
    const coins = sdk.findInventoryItem(/coins?/i);
    return coins?.count ?? 0;
}

export function readLevels(sdk: BotSDK): Record<string, number> {
    const skills = sdk.getSkills?.() ?? [];
    const out: Record<string, number> = {};
    for (const s of skills) {
        out[s.name] = s.baseLevel ?? s.level ?? 1;
    }
    // Ensure known keys exist
    for (const name of [
        'Attack',
        'Strength',
        'Defence',
        'Hitpoints',
        'Ranged',
        'Prayer',
        'Magic',
        'Cooking',
        'Woodcutting',
        'Fletching',
        'Fishing',
        'Firemaking',
        'Crafting',
        'Smithing',
        'Mining',
        'Thieving',
        'Agility',
        'Herblore',
        'Runecraft',
    ]) {
        out[name] ??= 1;
    }
    return out;
}

export async function sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
}
