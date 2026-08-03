/** Shared trainer contracts — skill plugins and planner stay aligned on these. */

import type { BotActions } from '../../../sdk/actions';
import type { BotSDK } from '../../../sdk/index';

export type TaskName =
    | 'thieving'
    | 'woodcutting'
    | 'firemaking'
    | 'fletching'
    | 'selling'
    | 'fishing'
    | 'cooking'
    | 'mining'
    | 'combat'
    | 'bank'
    | 'supply';

export interface KitWithdrawNeed {
    pattern: RegExp;
    n: number;
    label?: string;
}

export interface KitSpec {
    keep: RegExp[];
    withdraw: KitWithdrawNeed[];
    depositTools?: string[];
}

export interface SkillLevels {
    Attack: number;
    Strength: number;
    Defence: number;
    Hitpoints: number;
    Ranged: number;
    Prayer: number;
    Magic: number;
    Cooking: number;
    Woodcutting: number;
    Fletching: number;
    Fishing: number;
    Firemaking: number;
    Crafting: number;
    Smithing: number;
    Mining: number;
    Thieving: number;
    Agility: number;
    Herblore: number;
    Runecraft: number;
    [key: string]: number;
}

export interface LadderStep {
    id: string;
    task: TaskName;
    skills: string[];
    target: number;
}

export interface WorldPoint {
    x: number;
    z: number;
    label?: string;
}

export interface TrainerMemory {
    version: 1;
    updatedAt: string;
    ladderStepId: string | null;
    lastTask: TaskName | null;
    stalls: Record<string, number>;
    notes: string[];
    /** Sticky planner goal — keep doing this until done/stalled. */
    sticky?: {
        kind: 'skill' | 'bank' | 'supply';
        task?: TaskName;
        label?: string;
        reason: string;
        untilInv?: number;
        startedAt: string;
        ticks: number;
    } | null;
    /** Spot/NPC avoids: key → unix ms expiry */
    avoidUntil?: Record<string, number>;
    lastConfirm?: {
        task: string;
        ok: boolean;
        reason: string;
        at: string;
    } | null;
    quests?: Record<string, { complete?: boolean; step?: string }>;
}

export interface ObservationTarget {
    kind: 'loc' | 'npc';
    name: string;
    x: number;
    z: number;
}

export interface Observation {
    tickAt: string;
    inGame: boolean;
    x: number;
    z: number;
    hp: number;
    hpMax: number;
    inventoryCount: number;
    coins: number;
    dialogOpen: boolean;
    shopOpen: boolean;
    bankOpen: boolean;
    nearbyChop: ObservationTarget[];
    nearbyMine: ObservationTarget[];
    nearbyNpc: ObservationTarget[];
    recentChat: string[];
    errors: Array<'cant_reach' | 'stun' | 'busy' | 'nothing' | 'other'>;
    lowHp: boolean;
    noCombatTarget: boolean;
    noChopTarget: boolean;
    noMineTarget: boolean;
}

export interface SkillRunContext {
    sdk: BotSDK;
    bot: BotActions;
    levels: SkillLevels;
    coins: number;
    inventoryCount: number;
    memory: TrainerMemory;
    log: (msg: string) => void;
    observation?: Observation;
}

export interface SkillPlugin {
    id: TaskName;
    skills: string[];
    kit: KitSpec;
    /** False → planner skips this skill. */
    shouldRun?(ctx: SkillRunContext): boolean;
    run(ctx: SkillRunContext): Promise<boolean>;
}

export type PlannerDecision =
    | { kind: 'dismiss_ui' }
    | { kind: 'bank'; reason: string }
    | { kind: 'supply'; item: RegExp; label: string }
    | { kind: 'skill'; task: TaskName; reason: string }
    | { kind: 'idle'; reason: string };
