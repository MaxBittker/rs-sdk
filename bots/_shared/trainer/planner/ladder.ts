import type { LadderStep, SkillLevels, TaskName } from '../types';

/** Early progressive ladder — cash → gather → melee. */
export const EARLY_SKILL_LADDER: LadderStep[] = [
    { id: 'thieving-40', task: 'thieving', skills: ['Thieving'], target: 40 },
    { id: 'woodcutting-30', task: 'woodcutting', skills: ['Woodcutting'], target: 30 },
    { id: 'fletching-20', task: 'fletching', skills: ['Fletching'], target: 20 },
    { id: 'mining-30', task: 'mining', skills: ['Mining'], target: 30 },
    { id: 'melee-40', task: 'combat', skills: ['Attack', 'Strength', 'Defence'], target: 40 },
];

/** Phase 2 — enabled when TRAINER_EXTENDED=1. */
export const POST_40_SKILL_LADDER: LadderStep[] = [
    { id: 'fishing-30', task: 'fishing', skills: ['Fishing'], target: 30 },
    { id: 'cooking-30', task: 'cooking', skills: ['Cooking'], target: 30 },
    { id: 'firemaking-30', task: 'firemaking', skills: ['Firemaking'], target: 30 },
];

export const EXTENDED_SKILL_LADDER: LadderStep[] = [...EARLY_SKILL_LADDER, ...POST_40_SKILL_LADDER];

export const OPENING_CASH_TARGET = 100;
export const SELL_BOW_THRESHOLD = 6;

export function activeLadder(): LadderStep[] {
    return process.env.TRAINER_EXTENDED === '1' ? EXTENDED_SKILL_LADDER : EARLY_SKILL_LADDER;
}

export function currentLadderStep(
    levels: SkillLevels,
    ladder: LadderStep[] = activeLadder(),
): LadderStep | null {
    for (const step of ladder) {
        if (step.skills.some((skill) => (levels[skill] ?? 1) < step.target)) return step;
    }
    return null;
}

export function nextLadderStep(
    levels: SkillLevels,
    ladder: LadderStep[] = activeLadder(),
): LadderStep | null {
    const cur = currentLadderStep(levels, ladder);
    if (!cur) return null;
    const idx = ladder.findIndex((s) => s.id === cur.id);
    return idx >= 0 && idx + 1 < ladder.length ? ladder[idx + 1]! : null;
}

/** True when current step is within `near` levels of completion (kit look-ahead). */
export function nearStepComplete(
    levels: SkillLevels,
    near = 2,
    ladder: LadderStep[] = activeLadder(),
): boolean {
    const cur = currentLadderStep(levels, ladder);
    if (!cur) return false;
    return cur.skills.every((s) => (levels[s] ?? 1) >= cur.target - near);
}

export function ladderProgressLabel(levels: SkillLevels, step: LadderStep | null): string {
    if (!step) return 'ladder complete';
    const parts = step.skills.map((s) => `${s}=${levels[s] ?? 1}/${step.target}`);
    return `${step.id} (${parts.join(', ')})`;
}

export function isOpeningCashPhase(coins: number): boolean {
    return coins < OPENING_CASH_TARGET;
}

export function taskNeedsTool(task: TaskName): RegExp | null {
    switch (task) {
        case 'woodcutting':
            return /axe/i;
        case 'mining':
            return /pickaxe/i;
        case 'fishing':
            return /small fishing net|\bnet\b/i;
        case 'fletching':
            return /^knife$/i;
        case 'firemaking':
            return /tinderbox/i;
        default:
            return null;
    }
}
