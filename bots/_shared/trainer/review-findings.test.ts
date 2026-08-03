import { expect, test } from 'bun:test';
import { FOOD } from './bank/kits';
import { defaultMemory } from './memory';
import { noteSkillFallback } from './runtime';

test('food pattern recognizes every combat-kit food and excludes raw or burnt food', () => {
    for (const food of [
        'shrimp',
        'anchovies',
        'trout',
        'salmon',
        'tuna',
        'lobster',
        'swordfish',
        'shark',
        'meat',
        'chicken',
        'beef',
        'bread',
        'cake',
        'pie',
    ]) {
        expect(FOOD.test(food)).toBe(true);
    }

    expect(FOOD.test('Redberry pie')).toBe(true);
    expect(FOOD.test('Meat pie')).toBe(true);

    for (const nonFood of [
        'raw tuna',
        'burnt lobster',
        'Cake tin',
        'Pie dish',
        'Uncooked apple pie',
    ]) {
        expect(FOOD.test(nonFood)).toBe(false);
    }
});

test('skill fallback preserves a detail recorded by the skill', () => {
    const memory = defaultMemory();
    memory.lastConfirm = {
        task: 'combat',
        ok: false,
        reason: 'low_hp',
        at: '2026-08-03T03:00:00.000Z',
    };

    noteSkillFallback(memory, 'combat', false, null);

    expect(memory.lastConfirm).toMatchObject({
        task: 'combat',
        ok: false,
        reason: 'low_hp',
    });
});

test('skill fallback records the generic result when the skill did not confirm', () => {
    const memory = defaultMemory();
    const beforeConfirmAt = memory.lastConfirm?.at ?? null;

    noteSkillFallback(memory, 'woodcutting', true, beforeConfirmAt);

    expect(memory.lastConfirm).toMatchObject({
        task: 'woodcutting',
        ok: true,
        reason: 'ok',
    });
});
