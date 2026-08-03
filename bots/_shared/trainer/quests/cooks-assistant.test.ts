import { describe, expect, test } from 'bun:test';
import {
    cooksAssistantQuest,
    hasCooksAssistantTurnInEvidence,
    nextCooksStep,
} from './cooks-assistant';

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

describe("Cook's Assistant completion evidence", () => {
    test('requires all ingredients to be consumed when the turn-in dialog closes', () => {
        expect(
            hasCooksAssistantTurnInEvidence({
                items: ['Egg', 'Pot of flour', 'Bucket of milk'],
                dialogOpen: false,
                chat: [],
            }),
        ).toBeFalse();

        expect(
            hasCooksAssistantTurnInEvidence({
                items: ['Egg', 'Pot of flour'],
                dialogOpen: false,
                chat: [],
            }),
        ).toBeFalse();

        expect(
            hasCooksAssistantTurnInEvidence({
                items: [],
                dialogOpen: false,
                chat: [],
            }),
        ).toBeTrue();
    });

    test('accepts only system quest completion chat evidence', () => {
        expect(
            hasCooksAssistantTurnInEvidence({
                items: ['Egg', 'Pot of flour', 'Bucket of milk'],
                dialogOpen: true,
                chat: [{ type: 0, text: 'Congratulations! You have completed Cook’s Assistant.' }],
            }),
        ).toBeTrue();
        expect(
            hasCooksAssistantTurnInEvidence({
                items: ['Egg', 'Pot of flour', 'Bucket of milk'],
                dialogOpen: true,
                chat: [{ type: 2, text: 'Congratulations on completing Cook’s Assistant!' }],
            }),
        ).toBeFalse();
    });
});
