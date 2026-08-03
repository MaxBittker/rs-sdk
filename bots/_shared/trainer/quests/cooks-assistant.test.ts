import { describe, expect, test } from 'bun:test';
import { cooksAssistantQuest, nextCooksStep } from './cooks-assistant';

describe("Cook's Assistant step selection", () => {
    test('with no items selects the required container step', () => {
        expect(nextCooksStep({ items: [], step: 'need_items' })).toBe('get_pot_bucket');
    });

    test('with all quest ingredients selects turn in', () => {
        expect(
            nextCooksStep({
                items: ['Egg', 'Pot of flour', 'Bucket of milk'],
                step: 'need_items',
            }),
        ).toBe('turn_in');
    });

    test('keeps the flour substep until a pot of flour exists', () => {
        expect(nextCooksStep({ items: ['Pot', 'Bucket'], step: 'flour' })).toBe('flour');
    });

    test('does not run after quest completion', () => {
        expect(
            cooksAssistantQuest.shouldRun({
                coins: 100,
                levels: { Attack: 1 },
                memory: { quests: { 'cooks-assistant': { complete: true } } },
            } as any),
        ).toBeFalse();
    });
});
