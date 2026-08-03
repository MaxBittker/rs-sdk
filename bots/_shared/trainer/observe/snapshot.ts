import type { Observation, ObservationTarget } from '../types';

type SdkLike = {
    getState: () => any;
    getInventory: () => Array<{ name: string; count?: number }> | null | undefined;
    getNearbyLocs: () => Array<{
        name: string;
        x: number;
        z: number;
        optionsWithIndex?: Array<{ text: string }>;
    }>;
    getNearbyNpcs: () => Array<{ name: string; x: number; z: number }>;
    getNewChat: (opts?: { types?: readonly number[]; includeSelf?: boolean }) => Array<{ text?: string; message?: string }>;
    getSkill: (name: string) => { level?: number; baseLevel?: number } | null | undefined;
};

export function classifyChatErrors(
    messages: Array<{ text?: string; message?: string }>,
): Observation['errors'] {
    const out: Observation['errors'] = [];
    for (const m of messages) {
        const t = m.text ?? m.message ?? '';
        if (/can'?t reach/i.test(t)) out.push('cant_reach');
        else if (/stunned/i.test(t)) out.push('stun');
        else if (/busy|already/i.test(t)) out.push('busy');
        else if (/nothing interesting|nothing happens/i.test(t)) out.push('nothing');
    }
    return out;
}

function coinCount(inv: Array<{ name: string; count?: number }>): number {
    return inv
        .filter((i) => /^coins?$/i.test(i.name))
        .reduce((s, i) => s + (i.count ?? 1), 0);
}

export function buildObservation(sdk: SdkLike): Observation {
    const s = sdk.getState?.() ?? {};
    const inv = sdk.getInventory?.() ?? [];
    const locs = sdk.getNearbyLocs?.() ?? [];
    const npcs = sdk.getNearbyNpcs?.() ?? [];
    const chat = sdk.getNewChat?.({ types: [0], includeSelf: false }) ?? [];
    const hpSkill = sdk.getSkill?.('Hitpoints');
    const hpMax = hpSkill?.baseLevel ?? s.player?.maxHp ?? 10;
    const hp = hpSkill?.level ?? s.player?.hp ?? hpMax;

    const nearbyChop: ObservationTarget[] = locs
        .filter((l) => l.optionsWithIndex?.some((o) => /chop/i.test(o.text)))
        .map((l) => ({ kind: 'loc' as const, name: l.name, x: l.x, z: l.z }));
    const nearbyMine: ObservationTarget[] = locs
        .filter((l) => l.optionsWithIndex?.some((o) => /^mine$/i.test(o.text)))
        .map((l) => ({ kind: 'loc' as const, name: l.name, x: l.x, z: l.z }));
    const nearbyNpc: ObservationTarget[] = npcs.map((n) => ({
        kind: 'npc' as const,
        name: n.name,
        x: n.x,
        z: n.z,
    }));

    const recentChat = chat.map((m) => m.text ?? m.message ?? '').filter(Boolean);
    const errors = classifyChatErrors(chat);
    const hasCowOrMan = nearbyNpc.some((n) => /man|woman|farmer|cow/i.test(n.name));

    return {
        tickAt: new Date().toISOString(),
        inGame: !!s.inGame,
        x: s.player?.worldX ?? 0,
        z: s.player?.worldZ ?? 0,
        hp,
        hpMax,
        inventoryCount: inv.length,
        coins: coinCount(inv),
        dialogOpen: !!s.dialog?.isOpen,
        shopOpen: !!s.shop?.isOpen,
        bankOpen: !!s.bank?.isOpen,
        nearbyChop,
        nearbyMine,
        nearbyNpc,
        recentChat,
        errors,
        lowHp: hpMax > 0 && hp / hpMax <= 0.4,
        noCombatTarget: !hasCowOrMan,
        noChopTarget: nearbyChop.length === 0,
        noMineTarget: nearbyMine.length === 0,
    };
}
