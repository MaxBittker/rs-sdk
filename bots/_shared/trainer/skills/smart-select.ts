/**
 * Score nearby locs/npcs for efficient training: unlocked by level, best XP tier, closest.
 */
import type { BotSDK } from '../../../sdk/index';
import { distanceSq } from '../knowledge/world';

export interface ScoredLoc {
    loc: {
        name: string;
        x: number;
        z: number;
        id?: number;
        optionsWithIndex?: Array<{ text: string; opIndex: number }>;
        distance?: number;
    };
    score: number;
    levelReq: number;
    reason: string;
}

const TREE_TIERS: Array<{ re: RegExp; level: number; weight: number }> = [
    { re: /magic/i, level: 75, weight: 90 },
    { re: /yew/i, level: 60, weight: 80 },
    { re: /maple/i, level: 45, weight: 70 },
    { re: /willow/i, level: 30, weight: 60 },
    { re: /oak/i, level: 15, weight: 40 },
    { re: /^tree$/i, level: 1, weight: 20 },
    { re: /tree/i, level: 1, weight: 15 },
];

const ROCK_TIERS: Array<{ re: RegExp; level: number; weight: number }> = [
    { re: /mithril/i, level: 55, weight: 80 },
    { re: /coal/i, level: 30, weight: 70 },
    { re: /iron/i, level: 15, weight: 55 },
    { re: /copper|tin/i, level: 1, weight: 30 },
    { re: /clay/i, level: 1, weight: 20 },
    { re: /rock/i, level: 1, weight: 10 },
];

function tierFor(name: string, tiers: typeof TREE_TIERS): { level: number; weight: number } | null {
    for (const t of tiers) {
        if (t.re.test(name)) return t;
    }
    return null;
}

function playerPos(sdk: BotSDK): { x: number; z: number } | null {
    const p = sdk.getState()?.player;
    return p ? { x: p.worldX, z: p.worldZ } : null;
}

/**
 * Pick best choppable tree for current WC level.
 * Never selects a tree above the player's level.
 */
export function pickBestTree(
    sdk: BotSDK,
    woodcuttingLevel: number,
    preferredName?: string | null,
    isLocAvoided?: (loc: ScoredLoc['loc']) => boolean,
): ScoredLoc | null {
    const from = playerPos(sdk);
    if (!from) return null;
    const candidates = sdk
        .getNearbyLocs()
        .filter((l) => l.optionsWithIndex?.some((o) => /chop/i.test(o.text)));

    let best: ScoredLoc | null = null;
    for (const loc of candidates) {
        if (isLocAvoided?.(loc)) continue;
        const tier = tierFor(loc.name, TREE_TIERS);
        if (!tier || tier.level > woodcuttingLevel) continue;
        const dist = Math.sqrt(distanceSq(from, { x: loc.x, z: loc.z }));
        // Prefer highest unlocked tier, then closer.
        const score = tier.weight * 100 + (preferredName && new RegExp(preferredName, 'i').test(loc.name) ? 500 : 0) - dist;
        if (!best || score > best.score) {
            best = { loc, score, levelReq: tier.level, reason: `${loc.name} lv${tier.level} d${dist.toFixed(0)}` };
        }
    }
    return best;
}

export function pickBestRock(
    sdk: BotSDK,
    miningLevel: number,
    preferredName?: string | null,
    isLocAvoided?: (loc: ScoredLoc['loc']) => boolean,
): ScoredLoc | null {
    const from = playerPos(sdk);
    if (!from) return null;
    const candidates = sdk
        .getNearbyLocs()
        .filter((l) => l.optionsWithIndex?.some((o) => /^mine$/i.test(o.text)));

    let best: ScoredLoc | null = null;
    for (const loc of candidates) {
        if (isLocAvoided?.(loc)) continue;
        const tier = tierFor(loc.name, ROCK_TIERS);
        if (!tier || tier.level > miningLevel) continue;
        const dist = Math.sqrt(distanceSq(from, { x: loc.x, z: loc.z }));
        // Prefer balanced copper/tin early: slight bias to whichever we have less of.
        let balance = 0;
        const inv = sdk.getInventory() ?? [];
        const copper = inv.filter((i) => /copper ore/i.test(i.name)).reduce((s, i) => s + (i.count ?? 1), 0);
        const tin = inv.filter((i) => /tin ore/i.test(i.name)).reduce((s, i) => s + (i.count ?? 1), 0);
        if (/copper/i.test(loc.name) && copper < tin) balance = 15;
        if (/tin/i.test(loc.name) && tin < copper) balance = 15;
        if (/iron/i.test(loc.name) && miningLevel >= 15) balance = 10;
        const score =
            tier.weight * 100 +
            balance +
            (preferredName && new RegExp(preferredName, 'i').test(loc.name) ? 500 : 0) -
            dist;
        if (!best || score > best.score) {
            best = { loc, score, levelReq: tier.level, reason: `${loc.name} lv${tier.level} d${dist.toFixed(0)}` };
        }
    }
    return best;
}

/** True if player seems busy (anim playing). */
export function isBusyAnimating(sdk: BotSDK): boolean {
    const anim = sdk.getState()?.player?.animId ?? -1;
    return anim !== -1 && anim !== 0;
}

/** Wait until idle or timeout — avoids re-clicking mid-chop/mine. */
export async function waitUntilIdle(sdk: BotSDK, timeoutMs = 12000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (!isBusyAnimating(sdk)) return true;
        await new Promise((r) => setTimeout(r, 400));
    }
    return !isBusyAnimating(sdk);
}
