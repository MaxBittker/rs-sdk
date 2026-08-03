import { describe, expect, test } from 'bun:test';
import { chooseTask, shouldKeepSticky } from './planner/choose-task';
import {
    currentLadderStep,
    EARLY_SKILL_LADDER,
    OPENING_CASH_TARGET,
    SELL_BOW_THRESHOLD,
    nearStepComplete,
} from './planner/ladder';
import { bestResourceForLevel } from './knowledge/wiki';
import { bootstrapSkillRegistry, listSkills } from './skills/registry';

function levels(partial: Record<string, number> = {}) {
    return {
        Attack: 1,
        Strength: 1,
        Defence: 1,
        Hitpoints: 10,
        Ranged: 1,
        Prayer: 1,
        Magic: 1,
        Cooking: 1,
        Woodcutting: 1,
        Fletching: 1,
        Fishing: 1,
        Firemaking: 1,
        Crafting: 1,
        Smithing: 1,
        Mining: 1,
        Thieving: 1,
        Agility: 1,
        Herblore: 1,
        Runecraft: 1,
        ...partial,
    };
}

function baseInput(over: Partial<Parameters<typeof chooseTask>[0]> = {}) {
    return {
        levels: levels(),
        coins: 150,
        inventoryCount: 2,
        inventoryFull: false,
        hasBlockingUi: false,
        hasToolFor: () => true,
        hasLogs: false,
        hasKnife: false,
        hasBows: false,
        bowCount: 0,
        logCount: 0,
        rawFoodCount: 0,
        oreCount: 0,
        foodCount: 0,
        stalls: {},
        ...over,
    };
}

describe('planner', () => {
    test('opening cash forces thieving', () => {
        const d = chooseTask(baseInput({ coins: 20, levels: levels() }));
        expect(d.kind).toBe('skill');
        if (d.kind === 'skill') expect(d.task).toBe('thieving');
        expect(OPENING_CASH_TARGET).toBe(100);
    });

    test('ladder advances past completed thieving', () => {
        const step = currentLadderStep(levels({ Thieving: 40 }), EARLY_SKILL_LADDER);
        expect(step?.task).toBe('woodcutting');
    });

    test('missing axe requests supply', () => {
        const d = chooseTask(
            baseInput({
                levels: levels({ Thieving: 40 }),
                hasToolFor: (task) => task !== 'woodcutting',
            }),
        );
        expect(d.kind).toBe('supply');
    });

    test('sells bows at threshold', () => {
        const d = chooseTask(
            baseInput({
                levels: levels({ Thieving: 40, Woodcutting: 20 }),
                hasBows: true,
                bowCount: SELL_BOW_THRESHOLD,
                hasToolFor: () => true,
            }),
        );
        expect(d.kind).toBe('skill');
        if (d.kind === 'skill') expect(d.task).toBe('selling');
    });

    test('fletching without logs redirects to woodcutting', () => {
        const d = chooseTask(
            baseInput({
                levels: levels({ Thieving: 40, Woodcutting: 30 }),
                hasKnife: true,
                hasLogs: false,
                hasToolFor: () => true,
            }),
        );
        expect(d.kind).toBe('skill');
        if (d.kind === 'skill') expect(d.task).toBe('woodcutting');
    });

    test('near WC complete looks ahead for knife', () => {
        const lv = levels({ Thieving: 40, Woodcutting: 29 });
        expect(nearStepComplete(lv, 2, EARLY_SKILL_LADDER)).toBe(true);
        const d = chooseTask(
            baseInput({
                levels: lv,
                hasKnife: false,
                hasToolFor: (t) => t !== 'fletching',
            }),
        );
        expect(d.kind).toBe('supply');
    });

    test('stall escape from woodcutting to fletch', () => {
        const d = chooseTask(
            baseInput({
                levels: levels({ Thieving: 40, Woodcutting: 10 }),
                hasLogs: true,
                hasKnife: true,
                logCount: 8,
                stalls: { woodcutting: 5 },
            }),
        );
        expect(d.kind).toBe('skill');
        if (d.kind === 'skill') expect(d.task).toBe('fletching');
    });

    test('sticky breaks on noTargetNearby hint', () => {
        const sticky = {
            kind: 'skill' as const,
            task: 'woodcutting' as const,
            ticks: 5,
            reason: 'test',
            startedAt: '',
        };
        const keep = shouldKeepSticky(
            sticky,
            baseInput({
                levels: levels({ Thieving: 40 }),
                hints: { noTargetNearby: true, lowHp: false, recentFail: false },
            }),
        );
        expect(keep).toBe(false);
    });

    test('sticky breaks on recentFail', () => {
        const sticky = {
            kind: 'skill' as const,
            task: 'thieving' as const,
            ticks: 2,
            reason: 'test',
            startedAt: '',
        };
        expect(
            shouldKeepSticky(
                sticky,
                baseInput({
                    coins: 20,
                    hints: { noTargetNearby: false, lowHp: false, recentFail: true },
                }),
            ),
        ).toBe(false);
    });

    test('lowHp does not preempt non-combat ladder work', () => {
        const d = chooseTask(
            baseInput({
                levels: levels({ Thieving: 40, Woodcutting: 10 }),
                foodCount: 0,
                hints: { noTargetNearby: false, lowHp: true, recentFail: false },
            }),
        );
        expect(d.kind).toBe('skill');
        if (d.kind === 'skill') expect(d.task).toBe('woodcutting');
    });

    test('lowHp banks only for combat and honors bank stall escape', () => {
        const combatLevels = levels({
            Thieving: 40,
            Woodcutting: 30,
            Fletching: 20,
            Mining: 30,
        });
        const lowHp = chooseTask(
            baseInput({
                levels: combatLevels,
                foodCount: 0,
                hints: { noTargetNearby: false, lowHp: true, recentFail: false },
            }),
        );
        expect(lowHp.kind).toBe('bank');
        if (lowHp.kind === 'bank') expect(lowHp.reason).toMatch(/low HP/i);

        const stalledBank = chooseTask(
            baseInput({
                levels: combatLevels,
                foodCount: 0,
                stalls: { bank: 3 },
                hints: { noTargetNearby: false, lowHp: true, recentFail: false },
            }),
        );
        expect(stalledBank.kind).toBe('skill');
        if (stalledBank.kind === 'skill') expect(stalledBank.task).toBe('combat');
    });

    test('lowHp does not preempt opening-cash thieving', () => {
        const d = chooseTask(
            baseInput({
                coins: 20,
                foodCount: 0,
                hints: { noTargetNearby: false, lowHp: true, recentFail: false },
            }),
        );
        expect(d.kind).toBe('skill');
        if (d.kind === 'skill') expect(d.task).toBe('thieving');
    });
});

describe('skills registry', () => {
    test('bootstraps core plugins', () => {
        bootstrapSkillRegistry();
        const ids = listSkills().map((s) => s.id).sort();
        expect(ids).toContain('thieving');
        expect(ids).toContain('woodcutting');
        expect(ids).toContain('mining');
        expect(ids).toContain('combat');
        expect(ids).toContain('firemaking');
        expect(ids).toContain('supply');
    });
});

describe('wiki knowledge', () => {
    test('best woodcutting resource respects level', () => {
        const low = bestResourceForLevel('woodcutting', 1, /trees/i);
        if (low) expect(low.level).toBeLessThanOrEqual(1);
        const mid = bestResourceForLevel('woodcutting', 30, /trees/i);
        if (mid && low) expect(mid.level).toBeGreaterThanOrEqual(low.level);
    });
});
