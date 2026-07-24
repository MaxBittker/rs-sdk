import type {
    BotWorldState,
    GameMessage,
    InteractionEvidence,
    InteractionWaitOptions,
    InventoryItem,
    InterfaceOption,
} from './types';

export type InterfaceOptionSelector = InterfaceOption | string | RegExp;

function testPattern(pattern: string | RegExp, value: string): boolean {
    if (typeof pattern === 'string') {
        return value.toLowerCase().includes(pattern.toLowerCase());
    }
    pattern.lastIndex = 0;
    return pattern.test(value);
}

/**
 * Resolve a published interface option without mixing its human-facing
 * 1-based `index` with its 0-based array position.
 */
export function resolveInterfaceOption(
    options: readonly InterfaceOption[],
    selector: InterfaceOptionSelector,
): InterfaceOption | null {
    if (typeof selector === 'object' && !(selector instanceof RegExp)) {
        return options.find(option => option.componentId === selector.componentId) ?? null;
    }
    return options.find(option => testPattern(selector, option.text)) ?? null;
}

export function countInventoryItem(
    inventory: readonly InventoryItem[],
    target: number | string | RegExp,
): number {
    return inventory.reduce((total, item) => {
        const matches = typeof target === 'number'
            ? item.id === target
            : testPattern(target, item.name);
        return matches ? total + item.count : total;
    }, 0);
}

export interface QuantityOutcome {
    requested: number;
    actual: number;
    complete: boolean;
    partial: boolean;
}

/** Quantity success is exact: a non-zero partial fill is still unsuccessful. */
export function classifyQuantity(requested: number, actual: number): QuantityOutcome {
    const normalizedRequested = Math.max(0, Math.floor(requested));
    const normalizedActual = Math.max(0, Math.floor(actual));
    return {
        requested: normalizedRequested,
        actual: normalizedActual,
        complete: normalizedActual === normalizedRequested,
        partial: normalizedActual > 0 && normalizedActual < normalizedRequested,
    };
}

export interface InteractionBaseline {
    state: BotWorldState;
    inventory: string;
    skills: string;
    messageTick: number;
    messageObservationId?: number;
}

export interface MessageBaseline {
    messageTick: number;
    messageObservationId?: number;
}

type ObservableMessage = GameMessage & { observationId?: number };

/**
 * Prefer a monotonic observation id when a newer state producer publishes it,
 * while retaining tick-only compatibility with current producers.
 */
export function captureMessageBaseline(state: BotWorldState | null): MessageBaseline {
    const messages = state?.gameMessages ?? [];
    const observationIds = messages
        .map(message => (message as ObservableMessage).observationId)
        .filter((id): id is number => typeof id === 'number');
    return {
        messageTick: messages.reduce((max, message) => Math.max(max, message.tick), -1),
        messageObservationId: observationIds.length > 0 ? Math.max(...observationIds) : undefined,
    };
}

export function isMessageAfterBaseline(
    message: GameMessage,
    baseline: MessageBaseline,
): boolean {
    const observationId = (message as ObservableMessage).observationId;
    if (typeof observationId === 'number' && typeof baseline.messageObservationId === 'number') {
        return observationId > baseline.messageObservationId;
    }
    if (typeof observationId === 'number' && baseline.messageObservationId === undefined) {
        return message.tick >= baseline.messageTick;
    }
    return message.tick > baseline.messageTick;
}

function inventorySignature(state: BotWorldState): string {
    return state.inventory
        .map(item => `${item.slot}:${item.id}:${item.count}`)
        .sort()
        .join('|');
}

function skillSignature(state: BotWorldState): string {
    return state.skills
        .map(skill => `${skill.name}:${skill.experience}`)
        .sort()
        .join('|');
}

export function captureInteractionBaseline(state: BotWorldState): InteractionBaseline {
    const messages = captureMessageBaseline(state);
    return {
        state,
        inventory: inventorySignature(state),
        skills: skillSignature(state),
        ...messages,
    };
}

export function detectInteractionEvidence(
    state: BotWorldState,
    baseline: InteractionBaseline,
    options: InteractionWaitOptions = {},
): InteractionEvidence | null {
    if (!baseline.state.dialog.isOpen && state.dialog.isOpen) return 'dialog';
    if (
        (!baseline.state.interface?.isOpen && state.interface?.isOpen) ||
        (state.interface?.isOpen &&
            baseline.state.interface?.interfaceId !== state.interface.interfaceId)
    ) {
        return 'interface';
    }
    if (
        state.player &&
        baseline.state.player &&
        state.player.animId !== -1 &&
        state.player.animId !== baseline.state.player.animId
    ) {
        return 'animation';
    }
    if (inventorySignature(state) !== baseline.inventory) return 'inventory';
    if (skillSignature(state) !== baseline.skills) return 'xp';

    if (options.message) {
        const matched = state.gameMessages.some(message =>
            isMessageAfterBaseline(message, baseline) && testPattern(options.message!, message.text)
        );
        if (matched) return 'message';
    }
    if (options.evidence?.(state, baseline.state)) return 'custom';
    return null;
}
