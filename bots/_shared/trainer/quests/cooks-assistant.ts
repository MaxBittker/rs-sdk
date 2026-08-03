import type { QuestPlugin } from './registry';
import { getQuestFact } from '../knowledge/wiki';
import { nearestNpc } from '../knowledge/world';
import { walkToPoint } from '../travel';
import { playerPos } from '../util';

const COOK = { x: 3208, z: 3215, label: 'Cook' };
const WHEAT = { x: 3160, z: 3295, label: 'Lumbridge wheat field' };
const MILL = { x: 3165, z: 3305, label: 'Lumbridge windmill' };
const CHICKENS = { x: 3230, z: 3298, label: 'Lumbridge chicken farm' };
const DAIRY = { x: 3254, z: 3271, label: 'Lumbridge dairy cows' };
const GENERAL_STORE = { x: 3212, z: 3246, label: 'Lumbridge general store' };

export type CooksStep = 'start' | 'need_items' | 'get_pot_bucket' | 'flour' | 'egg' | 'milk' | 'turn_in';

export interface CooksStepInput {
    items: string[];
    step: string | undefined;
}

function hasItem(items: string[], pattern: RegExp): boolean {
    return items.some((item) => pattern.test(item));
}

/**
 * Select the next quest step solely from observed inventory and persisted state.
 * The runner performs the corresponding world action.
 */
export function nextCooksStep({ items, step }: CooksStepInput): CooksStep {
    if (step === 'start' || !step) return 'start';

    const hasFlour = hasItem(items, /\bpot of flour\b/i);
    const hasMilk = hasItem(items, /\bbucket of milk\b/i);
    const hasEgg = hasItem(items, /\begg\b/i);
    if (hasFlour && hasMilk && hasEgg) return 'turn_in';

    const hasPot = hasItem(items, /^pot$/i);
    const hasBucket = hasItem(items, /^bucket$/i);
    if ((!hasPot && !hasFlour) || (!hasBucket && !hasMilk)) return 'get_pot_bucket';
    if (!hasFlour) return 'flour';
    if (!hasEgg) return 'egg';
    return 'milk';
}

function questMemory(ctx: Parameters<QuestPlugin['run']>[0]) {
    ctx.memory.quests ??= {};
    return (ctx.memory.quests['cooks-assistant'] ??= {});
}

function actionSucceeded(result: { success: boolean } | undefined): boolean {
    return !!result?.success;
}

interface TurnInEvidenceInput {
    items: string[];
    dialogOpen: boolean;
    chat: Array<{ type?: number; text?: string; message?: string }>;
}

export function hasCooksAssistantTurnInEvidence({ items, chat }: TurnInEvidenceInput): boolean {
    const allIngredientsConsumed =
        !hasItem(items, /\bpot of flour\b/i) &&
        !hasItem(items, /\bbucket of milk\b/i) &&
        !hasItem(items, /\begg\b/i);
    if (allIngredientsConsumed) return true;

    const completionChat = chat.some(({ type, text, message }) =>
        type === 0 &&
        /cook'?s assistant|quest complete|you have completed|cooking experience/i.test(
            `${text ?? ''} ${message ?? ''}`,
        ),
    );
    return completionChat;
}

async function advanceCookDialog(
    bot: Parameters<QuestPlugin['run']>[0]['bot'],
    sdk: Parameters<QuestPlugin['run']>[0]['sdk'],
    log: (message: string) => void,
): Promise<boolean> {
    for (let attempt = 0; attempt < 8 && sdk.getState()?.dialog.isOpen; attempt += 1) {
        try {
            await bot.navigateDialog([/yes|certainly|ok|continue|click here/i]);
        } catch (error) {
            log(`quest cooks-assistant: dialog navigation failed (${String(error)})`);
            return false;
        }
    }
    return !sdk.getState()?.dialog.isOpen;
}

async function moveWindmillFloor(
    bot: Parameters<QuestPlugin['run']>[0]['bot'],
    sdk: Parameters<QuestPlugin['run']>[0]['sdk'],
    destination: RegExp,
    direction: RegExp,
    log: (message: string) => void,
): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        if (sdk.findNearbyLoc(destination)) return true;
        const stairs = sdk.getNearbyLocs().find(
            (loc) =>
                /staircase|stairs|ladder/i.test(loc.name) &&
                loc.optionsWithIndex?.some((option) => direction.test(option.text)),
        );
        if (!stairs) {
            log(`quest cooks-assistant: no windmill stairs with ${direction} option`);
            return false;
        }
        const climbed = await bot.interactLoc(stairs, direction);
        if (!actionSucceeded(climbed)) {
            log(`quest cooks-assistant: windmill ${direction} climb ${attempt + 1} failed`);
        }
    }
    const reached = !!sdk.findNearbyLoc(destination);
    if (!reached) log(`quest cooks-assistant: could not reach windmill ${destination}`);
    return reached;
}

export const cooksAssistantQuest: QuestPlugin = {
    id: 'cooks-assistant',
    title: "Cook's Assistant",
    shouldRun(ctx) {
        if (ctx.memory.quests?.['cooks-assistant']?.complete) return false;
        // After opening cash, before heavy combat.
        return ctx.coins >= 100 && (ctx.levels.Attack ?? 1) < 20;
    },
    async run(ctx) {
        const { sdk, bot, log } = ctx;
        const memory = questMemory(ctx);
        const fact = getQuestFact('cooks-assistant');
        const items = (sdk.getInventory() ?? []).map((item) => item.name);
        const step = nextCooksStep({ items, step: memory.step });
        const hasFlour = hasItem(items, /\bpot of flour\b/i);
        const hasMilk = hasItem(items, /\bbucket of milk\b/i);
        const hasPot = hasItem(items, /^pot$/i);
        const hasBucket = hasItem(items, /^bucket$/i);

        log(`quest cooks-assistant: ${step}; checklist=${fact?.itemsNeeded.join(', ') ?? 'Pot, Bucket'}`);

        if (step === 'start') {
            const cook = nearestNpc(/cook/i, playerPos(sdk) ?? COOK)?.point ?? COOK;
            if (!(await walkToPoint(bot, sdk, cook, 'Cook'))) return false;
            const talked = await bot.talkTo(/cook/i);
            if (!actionSucceeded(talked)) return false;
            if (!(await advanceCookDialog(bot, sdk, log))) return false;
            memory.step = 'need_items';
            return true;
        }

        if (step === 'get_pot_bucket') {
            const checklist = fact?.itemsNeeded ?? ['Pot', 'Bucket'];
            let needed = checklist.filter((item) =>
                /^pot$/i.test(item) ? !hasPot && !hasFlour : /^bucket$/i.test(item) ? !hasBucket && !hasMilk : false,
            );
            if (needed.length === 0 && ((!hasPot && !hasFlour) || (!hasBucket && !hasMilk))) {
                needed = ['Pot', 'Bucket'].filter((item) =>
                    /^pot$/i.test(item) ? !hasPot && !hasFlour : !hasBucket && !hasMilk,
                );
            }
            const target = needed[0];
            if (!target) {
                memory.step = 'need_items';
                return true;
            }
            const targetRe = new RegExp(`^${target}$`, 'i');
            const nearby = sdk.findGroundItem(targetRe);
            if (nearby) return actionSucceeded(await bot.pickupItem(nearby));
            if (!(await walkToPoint(bot, sdk, GENERAL_STORE))) return false;
            const ground = sdk.findGroundItem(targetRe);
            if (ground) return actionSucceeded(await bot.pickupItem(ground));
            const shop = await bot.openShop(/shop\s*keeper|shopkeeper/i);
            if (!actionSucceeded(shop)) return false;
            const bought = await bot.buyFromShop(targetRe, 1);
            await bot.closeShop();
            return actionSucceeded(bought);
        }

        if (step === 'flour') {
            let grain = sdk.findInventoryItem(/\bgrain\b/i);
            if (!grain) {
                if (!(await walkToPoint(bot, sdk, WHEAT))) return false;
                const picked = await bot.pickupItem(/grain/i);
                if (!actionSucceeded(picked)) return false;
                grain = sdk.findInventoryItem(/\bgrain\b/i);
            }
            if (!grain || !(await walkToPoint(bot, sdk, MILL))) return false;
            if (!(await moveWindmillFloor(bot, sdk, /^hopper$/i, /climb-up|climb up/i, log))) return false;
            if (!actionSucceeded(await bot.useItemOnLoc(grain, /^hopper$/i))) return false;
            if (!actionSucceeded(await bot.interactLoc(/hopper controls?|controls/i, /operate/i))) return false;
            if (!(await moveWindmillFloor(bot, sdk, /flour bin|\bbin\b/i, /climb-down|climb down/i, log))) return false;
            return actionSucceeded(await bot.useItemOnLoc(/^pot$/i, /flour bin|\bbin\b/i));
        }

        if (step === 'egg') {
            if (!(await walkToPoint(bot, sdk, CHICKENS))) return false;
            return actionSucceeded(await bot.pickupItem(/^egg$/i));
        }

        if (step === 'milk') {
            if (!(await walkToPoint(bot, sdk, DAIRY))) return false;
            return actionSucceeded(await bot.useItemOnNpc(/^bucket$/i, /dairy cow|cow/i));
        }

        if (!(await walkToPoint(bot, sdk, COOK, 'Cook'))) return false;
        sdk.getNewChat({ types: [0] });
        const talked = await bot.talkTo(/cook/i);
        if (!actionSucceeded(talked)) return false;
        await advanceCookDialog(bot, sdk, log);
        const remainingItems = (sdk.getInventory() ?? []).map((item) => item.name);
        const chat = sdk.getNewChat({ types: [0] });
        if (
            hasCooksAssistantTurnInEvidence({
                items: remainingItems,
                dialogOpen: !!sdk.getState()?.dialog.isOpen,
                chat,
            })
        ) {
            memory.complete = true;
            memory.step = 'turn_in';
            return true;
        }
        memory.step = 'turn_in';
        log('quest cooks-assistant: turn-in opened but completion was not confirmed');
        return false;
    },
};
