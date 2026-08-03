import type { PlannerHints } from '../observe/hints';
import type { PlannerDecision, SkillLevels, TaskName } from '../types';
import {
    OPENING_CASH_TARGET,
    SELL_BOW_THRESHOLD,
    activeLadder,
    currentLadderStep,
    isOpeningCashPhase,
    nearStepComplete,
    nextLadderStep,
    taskNeedsTool,
} from './ladder';

export interface PlannerInput {
    levels: SkillLevels;
    coins: number;
    inventoryCount: number;
    inventoryFull: boolean;
    hasBlockingUi: boolean;
    hasToolFor: (task: TaskName) => boolean;
    hasLogs: boolean;
    hasKnife: boolean;
    hasBows: boolean;
    bowCount: number;
    logCount: number;
    rawFoodCount: number;
    oreCount: number;
    foodCount: number;
    /** Stall counts from memory — high = try escape route. */
    stalls?: Partial<Record<TaskName | 'supply', number>>;
    hints?: PlannerHints;
    /** Current sticky task, used only for safety interrupts. */
    stickyTask?: TaskName;
}

/**
 * Smart planner with interrupt order + stall escapes.
 */
export function chooseTask(input: PlannerInput): PlannerDecision {
    if (input.hasBlockingUi) return { kind: 'dismiss_ui' };

    if (isOpeningCashPhase(input.coins)) {
        return { kind: 'skill', task: 'thieving', reason: `opening cash ${input.coins}/${OPENING_CASH_TARGET}` };
    }

    const ladder = activeLadder();
    const step = currentLadderStep(input.levels, ladder);
    if (!step) return { kind: 'idle', reason: 'ladder complete' };

    const stalls = input.stalls ?? {};

    if (
        input.hints?.lowHp &&
        input.foodCount < 1 &&
        (step.task === 'combat' || input.stickyTask === 'combat') &&
        (stalls.bank ?? 0) < 3
    ) {
        return { kind: 'bank', reason: 'low HP — withdraw food' };
    }

    // Escape: WC stuck → fletch/sell/bank if we have something useful
    if ((stalls.woodcutting ?? 0) >= 4) {
        if (input.hasLogs && input.hasKnife) {
            return { kind: 'skill', task: 'fletching', reason: 'escape WC stall → fletch' };
        }
        if (input.hasBows) return { kind: 'skill', task: 'selling', reason: 'escape WC stall → sell' };
        if (input.inventoryCount > 10) return { kind: 'bank', reason: 'escape WC stall → bank' };
    }
    if ((stalls.mining ?? 0) >= 4 && input.oreCount > 0) {
        return { kind: 'bank', reason: 'escape mining stall → bank ore' };
    }
    if ((stalls.supply ?? 0) >= 3 && input.coins < 50) {
        return { kind: 'skill', task: 'thieving', reason: 'escape supply stall → cash' };
    }
    if ((stalls.thieving ?? 0) >= 6 && input.coins >= OPENING_CASH_TARGET) {
        // already past cash — skip thieving thrash
    }

    if (input.bowCount >= SELL_BOW_THRESHOLD || (input.hasBows && input.inventoryFull)) {
        return { kind: 'skill', task: 'selling', reason: `sell ${input.bowCount} bows` };
    }

    // Prefer fletching mid-WC when invent is getting heavy (efficiency).
    if (
        (step.task === 'woodcutting' || step.task === 'fletching') &&
        input.hasLogs &&
        input.hasKnife &&
        (input.inventoryCount >= 18 || input.logCount >= 6 || step.task === 'fletching')
    ) {
        return { kind: 'skill', task: 'fletching', reason: 'process log batch' };
    }

    if (input.rawFoodCount >= 4 && (input.levels.Cooking ?? 1) < 40) {
        return { kind: 'skill', task: 'cooking', reason: 'cook raw food batch' };
    }

    if (input.inventoryFull || (step.task === 'mining' && input.oreCount >= 18)) {
        return { kind: 'bank', reason: input.inventoryFull ? 'inventory full' : 'bank ore batch' };
    }

    if (step.task === 'combat' && input.foodCount < 2 && input.inventoryCount < 26) {
        // If stalls on bank food, just fight anyway
        if ((stalls.bank ?? 0) < 3) {
            return { kind: 'bank', reason: 'withdraw food for combat' };
        }
    }

    const tool = taskNeedsTool(step.task);
    if (tool && !input.hasToolFor(step.task)) {
        return { kind: 'supply', item: tool, label: step.task };
    }

    if (step.task === 'woodcutting' && nearStepComplete(input.levels, 2, ladder) && !input.hasKnife) {
        return { kind: 'supply', item: /^knife$/i, label: 'knife' };
    }

    if (step.task === 'fletching') {
        if (!input.hasKnife) return { kind: 'supply', item: /^knife$/i, label: 'knife' };
        if (!input.hasLogs) {
            if (!input.hasToolFor('woodcutting')) {
                return { kind: 'supply', item: /axe/i, label: 'axe' };
            }
            return { kind: 'skill', task: 'woodcutting', reason: 'gather logs for fletching' };
        }
        return { kind: 'skill', task: 'fletching', reason: `ladder ${step.id}` };
    }

    const next = nextLadderStep(input.levels, ladder);
    if (next && nearStepComplete(input.levels, 2, ladder)) {
        const nextTool = taskNeedsTool(next.task);
        if (nextTool && !input.hasToolFor(next.task) && input.coins >= 16) {
            return { kind: 'supply', item: nextTool, label: `lookahead-${next.task}` };
        }
    }

    return {
        kind: 'skill',
        task: step.task,
        reason: `ladder ${step.id}`,
    };
}

/** Should we keep the sticky goal instead of re-planning? */
export function shouldKeepSticky(
    sticky: { kind: string; task?: TaskName; ticks: number; untilInv?: number } | null | undefined,
    input: PlannerInput,
): boolean {
    if (!sticky || sticky.ticks > 40) return false;
    if (input.hasBlockingUi) return false;
    if (input.hints?.noTargetNearby) return false;
    if (input.hints?.recentFail) return false;
    if (input.hints?.lowHp && sticky.task === 'combat') return false;
    if (input.inventoryFull && sticky.kind === 'skill' && sticky.task !== 'selling' && sticky.task !== 'fletching') {
        return false;
    }
    if (sticky.kind === 'skill' && sticky.task === 'woodcutting') {
        // Keep chopping while invent has room; break for fletch/sell efficiency.
        if (input.inventoryCount >= 26) return false;
        if (input.hasKnife && input.logCount >= 6) return false;
        if (input.bowCount >= 6) return false;
        return true;
    }
    if (sticky.kind === 'skill' && sticky.task === 'mining') {
        return input.inventoryCount < 26 && input.oreCount < 20;
    }
    if (sticky.kind === 'skill' && sticky.task === 'fletching') {
        return input.hasLogs && input.hasKnife;
    }
    if (sticky.kind === 'skill' && sticky.task === 'thieving') {
        return isOpeningCashPhase(input.coins);
    }
    if (sticky.kind === 'skill' && sticky.task === 'combat') {
        return input.foodCount > 0 || sticky.ticks < 15;
    }
    return sticky.ticks < 8;
}
