// Bot SDK - Porcelain Layer
// High-level domain-aware methods that wrap plumbing with game knowledge
// Actions resolve when the EFFECT is complete (not just acknowledged)

import { BotSDK } from './index';
import { ActionHelpers, ALREADY_FIGHTING_REFUSALS, NO_RUNES_REFUSALS } from './actions-helpers';
import { findDoorsAlongPath, isTileWalkable } from './pathfinding';
import type {
    ActionResult,
    BotWorldState,
    SkillState,
    InventoryItem,
    BankItem,
    NearbyNpc,
    NearbyPlayer,
    CombatTarget,
    NearbyLoc,
    GroundItem,
    ShopItem,
    ChopTreeResult,
    BurnLogsResult,
    PickupResult,
    DropItemResult,
    TalkResult,
    ShopResult,
    ShopSellResult,
    SellAmount,
    EquipResult,
    UnequipResult,
    EatResult,
    AttackResult,
    CastSpellResult,
    OpenDoorResult,
    FletchResult,
    CraftLeatherResult,
    SmithResult,
    OpenBankResult,
    BankDepositResult,
    BankWithdrawResult,
    UseItemOnLocResult,
    UseItemOnNpcResult,
    InteractLocResult,
    InteractNpcResult,
    PickpocketResult,
    PrayerResult,
    PrayerName,
    CraftJewelryResult,
    EnchantResult,
    StringAmuletResult,
} from './types';
import type {
    TradeItem,
    TradeItemSpec,
    TradeOptions,
    TradeResult,
    TradeState,
    ServeTradesOptions,
    ServeTradesResult,
} from './types';
import { PRAYER_INDICES, PRAYER_NAMES, PRAYER_LEVELS } from './types';
import {
    countInventoryById,
    countMatching,
    diffInventories,
    missingFromOffer,
    offerSatisfies,
    shortfall,
} from './trade-helpers';
import {
    classifyQuantity,
    countItems,
    exactNamePattern,
    nextShopStep,
    resolveInterfaceOption,
    resolveSkillDialogProduct,
    skillDialogProductLabels,
    validateActionQuantity,
    MAX_BANK_ACTION_QUANTITY,
    MAX_SHOP_ACTION_PACKETS,
    MAX_SHOP_ACTION_QUANTITY,
    SHOP_ACTION_DEADLINE_MS,
} from './action-quantity';

// Modal interfaces dismissBlockingUI must never auto-close: closing these is
// destructive (declines a two-party screen) or strands the player (must be
// completed, not closed). Everything else is informational or re-openable.
// Ids from server/content/pack/interface.pack.
const NEVER_AUTO_CLOSE = new Set([
    3323, // trademain - auto-close would silently decline a player trade
    3443, // tradeconfirm - second trade screen, same risk
    6412, // duel_confirm - same risk for duels
    6554, // macro_cube - anti-macro random event, must be solved
    3559, // player_kit - character design, must be accepted (see skipTutorial)
]);

/**
 * Idle ticks to wait for "You attempt to pick..." before calling an attempt
 * dead. One attempt is 2 ticks of engine script, so 3 leaves a tick of slack:
 * long enough not to trip on a slow state update, short enough that a discarded
 * op costs one attempt instead of the 10s action timeout.
 */
const PICKPOCKET_ACK_TICKS = 3;

export class BotActions {
    private helpers: ActionHelpers;

    constructor(private sdk: BotSDK) {
        this.helpers = new ActionHelpers(sdk);
    }

    // ============ Porcelain: UI Helpers ============

    /**
     * Skip tutorial by navigating dialogs and talking to tutorial NPCs.
     * This is a porcelain method - domain logic that was moved from bot client.
     * @param options.randomizeAppearance - If true, randomizes character appearance when the design screen appears. Default: true.
     */
    async skipTutorial(options: { randomizeAppearance?: boolean } = {}): Promise<ActionResult> {
        const { randomizeAppearance = true } = options;
        const state = this.sdk.getState();
        if (!state?.inGame) {
            return { success: false, message: 'Not in game' };
        }

        // Helper to check and handle character design modal
        const checkAndHandleDesignModal = async (): Promise<boolean> => {
            const s = this.sdk.getState();
            if (s?.modalOpen && s?.modalInterface === 3559) {
                if (randomizeAppearance) {
                    await this.sdk.sendRandomizeCharacterDesign();
                    await this.sdk.waitForTicks(1);
                }
                await this.sdk.sendAcceptCharacterDesign();
                await this.sdk.waitForTicks(1);
                return true;
            }
            return false;
        };

        // Check for character design modal (interface 3559) and handle it
        await checkAndHandleDesignModal();

        // If dialog open, navigate through it (may take multiple clicks)
        if (state.dialog.isOpen) {
            let clickCount = 0;
            const MAX_CLICKS = 10;

            while (clickCount < MAX_CLICKS) {
                // Check for design modal each iteration
                await checkAndHandleDesignModal();

                const currentState = this.sdk.getState();
                if (!currentState?.dialog.isOpen) {
                    return { success: true, message: `Dialog completed after ${clickCount} clicks` };
                }

                if (currentState.dialog.isWaiting) {
                    await this.sdk.waitForTicks(1);
                    continue;
                }

                const options = currentState.dialog.options;
                if (options.length > 0) {
                    // Smart option selection: skip > yes > confirm > first option
                    const skipOption = options.find(o => /skip|complete|finish/i.test(o.text));
                    const yesOption = options.find(o => /yes|continue|proceed/i.test(o.text));
                    const confirmOption = options.find(o => /confirm|accept|agree|ok/i.test(o.text));

                    const selectedOption = skipOption || yesOption || confirmOption || options[0];
                    await this.sdk.sendClickDialog(selectedOption!.index);
                } else {
                    await this.sdk.sendClickDialog(0);
                }

                clickCount++;
                await this.sdk.waitForTicks(1);
            }

            return { success: true, message: `Clicked through ${clickCount} dialogs` };
        }

        // Find tutorial NPC
        const guide = this.sdk.findNearbyNpc(/runescape guide|guide|tutorial/i);
        if (guide) {
            const talkOpt = guide.optionsWithIndex.find(o => /talk/i.test(o.text));
            if (!talkOpt) {
                return { success: false, message: 'No Talk option on tutorial NPC' };
            }

            const result = await this.sdk.sendInteractNpc(guide.index, talkOpt.opIndex);
            if (!result.success) {
                return { success: false, message: result.message };
            }

            // Wait for dialog to open
            try {
                await this.sdk.waitForCondition(s => s.dialog.isOpen, 5000);
                await this.sdk.waitForTicks(1);

                // Loop through all dialog pages until closed
                let clickCount = 0;
                const MAX_CLICKS = 10;

                while (clickCount < MAX_CLICKS) {
                    // Check for design modal each iteration
                    await checkAndHandleDesignModal();

                    const currentState = this.sdk.getState();
                    if (!currentState?.dialog.isOpen) {
                        return { success: true, message: `Tutorial skipped after ${clickCount} dialog clicks` };
                    }

                    if (currentState.dialog.isWaiting) {
                        await this.sdk.waitForTicks(1);
                        continue;
                    }

                    const options = currentState.dialog.options;
                    if (options.length > 0) {
                        // Smart option selection: skip > yes > confirm > first option
                        const skipOption = options.find(o => /skip|complete|finish/i.test(o.text));
                        const yesOption = options.find(o => /yes|continue|proceed/i.test(o.text));
                        const confirmOption = options.find(o => /confirm|accept|agree|ok/i.test(o.text));

                        const selectedOption = skipOption || yesOption || confirmOption || options[0];
                        await this.sdk.sendClickDialog(selectedOption!.index);
                    } else {
                        await this.sdk.sendClickDialog(0);
                    }

                    clickCount++;
                    await this.sdk.waitForTicks(1);
                }

                return { success: true, message: `Clicked through ${clickCount} dialogs` };
            } catch {
                return { success: false, message: 'Timed out waiting for dialog to open' };
            }
        }

        return { success: false, message: 'No tutorial NPC found' };
    }

    /** Dismiss any blocking UI like level-up dialogs. */
    async dismissBlockingUI(): Promise<void> {
        const maxAttempts = 10;
        for (let i = 0; i < maxAttempts; i++) {
            const state = this.sdk.getState();
            if (!state) break;

            if (state.dialog.isOpen) {
                // A multi-option dialog is a CHOICE, not blocking UI: clicking
                // its first option answers the choice as option 1 on the
                // server, silently running the wrong quest branch and leaving
                // the caller's intended click refused as stale. Leave it for
                // the caller (navigateDialog/clickDialogByText) to answer.
                if (state.dialog.options.length > 1) break;
                // Click the server-assigned index of the first published option
                // ("Click here to continue" arrives at index 1, not 0). A bare
                // 0 is only a fallback for optionless dialogs mid-transition.
                const first = state.dialog.options[0];
                await this.sdk.sendClickDialog(first?.index ?? 0);
                await this.sdk.waitForStateChange(2000).catch(() => {});
                continue;
            }

            // Modal interfaces (books, quest scrolls, level-up art) also block
            // input. Skip deliberate sessions (shop/bank have their own close
            // actions) and modals where auto-close is destructive — see
            // NEVER_AUTO_CLOSE. Anything else is informational or re-openable.
            if (state.interface?.isOpen && !state.shop?.isOpen && !state.bank?.isOpen
                && !NEVER_AUTO_CLOSE.has(state.interface.interfaceId)) {
                await this.sdk.sendCloseModal();
                await this.sdk.waitForStateChange(2000).catch(() => {});
                continue;
            }

            break;
        }
    }

    /**
     * Wait for an action effect while clearing safe, incidental UI interrupts
     * such as level-up dialogs. Deliberate trade/duel/design interfaces remain
     * protected by dismissBlockingUI's allowlist.
     */
    private async waitForActionCondition(
        predicate: (state: NonNullable<ReturnType<BotSDK['getState']>>) => boolean,
        timeout: number
    ): Promise<NonNullable<ReturnType<BotSDK['getState']>>> {
        const deadline = Date.now() + timeout;
        // A multi-option dialog is a choice the caller must answer, never
        // "safe" to dismiss - see dismissBlockingUI.
        const hasSafeBlockingUI = (state: NonNullable<ReturnType<BotSDK['getState']>>) =>
            (state.dialog.isOpen && state.dialog.options.length <= 1) ||
            (state.interface?.isOpen && !state.shop?.isOpen && !state.bank?.isOpen
                && !NEVER_AUTO_CLOSE.has(state.interface.interfaceId));

        while (Date.now() < deadline) {
            let current = this.sdk.getState();

            if (current && hasSafeBlockingUI(current)) {
                await this.dismissBlockingUI();
                current = this.sdk.getState();
                // A dismissal can be acknowledged before the state update, or
                // fail after the retry cap. Never report success while the
                // blocker is still observably open.
                if (current && hasSafeBlockingUI(current)) {
                    const remaining = deadline - Date.now();
                    if (remaining <= 0) break;
                    await this.sdk.waitForStateChange(Math.min(remaining, 2_000)).catch(() => {});
                    continue;
                }
            }

            // Evaluate success only after clearing a safe incidental interrupt,
            // so the next action never inherits a level-up/modal blocker.
            if (current && predicate(current)) return current;

            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            await this.sdk.waitForStateChange(Math.min(remaining, 2_000)).catch(() => {});
        }

        throw new Error('waitForActionCondition timed out');
    }

    // ============ Porcelain: Smart Actions ============

    /** Open a door or gate, walking to it if needed. */
    async openDoor(target?: NearbyLoc | string | RegExp): Promise<OpenDoorResult> {
        await this.dismissBlockingUI();

        const door = this.helpers.resolveLocation(target, /door|gate/i);
        if (!door) {
            return { success: false, message: 'No door found nearby', reason: 'door_not_found' };
        }

        const openOpt = door.optionsWithIndex.find(o => /^open$/i.test(o.text));
        if (!openOpt) {
            const closeOpt = door.optionsWithIndex.find(o => /^close$/i.test(o.text));
            if (closeOpt) {
                return { success: true, message: `${door.name} is already open`, reason: 'already_open', door };
            }
            const optTexts = door.optionsWithIndex.map(o => o.text);
            return { success: false, message: `${door.name} has no Open option (options: ${optTexts.join(', ')})`, reason: 'no_open_option', door };
        }

        if (door.distance > 2) {
            const walkResult = await this.walkTo(door.x, door.z);
            if (!walkResult.success) {
                return { success: false, message: `Could not walk to ${door.name}: ${walkResult.message}`, reason: 'walk_failed', door };
            }

            const doorsNow = this.sdk.getNearbyLocs().filter(l =>
                l.x === door.x && l.z === door.z && /door|gate/i.test(l.name)
            );
            const refreshedDoor = doorsNow[0];
            if (!refreshedDoor) {
                return { success: true, message: `${door.name} is no longer visible (may have been opened)`, door };
            }

            const refreshedOpenOpt = refreshedDoor.optionsWithIndex.find(o => /^open$/i.test(o.text));
            if (!refreshedOpenOpt) {
                const hasClose = refreshedDoor.optionsWithIndex.some(o => /^close$/i.test(o.text));
                if (hasClose) {
                    return { success: true, message: `${door.name} is already open`, reason: 'already_open', door: refreshedDoor };
                }
                return { success: false, message: `${door.name} no longer has Open option`, reason: 'no_open_option', door: refreshedDoor };
            }

            await this.sdk.sendInteractLoc(refreshedDoor.x, refreshedDoor.z, refreshedDoor.id, refreshedOpenOpt.opIndex);
        } else {
            await this.sdk.sendInteractLoc(door.x, door.z, door.id, openOpt.opIndex);
        }

        const doorX = door.x;
        const doorZ = door.z;
        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();

        try {
            await this.sdk.waitForCondition(state => {
                for (const msg of state.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true;
                        }
                    }
                }

                const doorNow = state.nearbyLocs.find(l =>
                    l.x === doorX && l.z === doorZ && /door|gate/i.test(l.name)
                );
                if (!doorNow) {
                    return true;
                }
                const hasClose = doorNow.optionsWithIndex.some(o => /^close$/i.test(o.text));
                const hasOpen = doorNow.optionsWithIndex.some(o => /^open$/i.test(o.text));
                return hasClose && !hasOpen;
            }, 5000);

            if (this.helpers.checkCantReachMessage(msgBaseline)) {
                return { success: false, message: `Cannot reach ${door.name} - still blocked`, reason: 'open_failed', door };
            }

            const doorAfter = this.sdk.getState()?.nearbyLocs.find(l =>
                l.x === doorX && l.z === doorZ && /door|gate/i.test(l.name)
            );

            if (!doorAfter) {
                return { success: true, message: `Opened ${door.name}`, door };
            }

            const hasCloseNow = doorAfter.optionsWithIndex.some(o => /^close$/i.test(o.text));
            if (hasCloseNow) {
                return { success: true, message: `Opened ${door.name}`, door: doorAfter };
            }

            return { success: false, message: `${door.name} did not open`, reason: 'open_failed', door: doorAfter };

        } catch {
            return { success: false, message: `Timeout waiting for ${door.name} to open`, reason: 'timeout', door };
        }
    }

    /**
     * Use an inventory item on a nearby location (e.g., fish on range, ore on furnace).
     * Walks to the location first (handling doors), then uses the item.
     */
    async useItemOnLoc(
        item: InventoryItem | string | RegExp,
        loc: NearbyLoc | string | RegExp,
        options: { timeout?: number } = {}
    ): Promise<UseItemOnLocResult> {
        const resolvedLoc = this.helpers.resolveLocation(loc, /./);
        return this.helpers.withDoorRetry(
            () => this._useItemOnLocOnce(item, loc, options),
            (r) => r.reason === 'cant_reach',
            2,
            resolvedLoc ? { x: resolvedLoc.x, z: resolvedLoc.z } : undefined
        );
    }

    private async _useItemOnLocOnce(
        item: InventoryItem | string | RegExp,
        loc: NearbyLoc | string | RegExp,
        options: { timeout?: number } = {}
    ): Promise<UseItemOnLocResult> {
        const { timeout = 10000 } = options;

        await this.dismissBlockingUI();

        // Resolve item
        const resolvedItem = this.helpers.resolveInventoryItem(item, /./);
        if (!resolvedItem) {
            return { success: false, message: `Item not found in inventory: ${item}`, reason: 'item_not_found' };
        }

        // Resolve location
        const resolvedLoc = this.helpers.resolveLocation(loc, /./);
        if (!resolvedLoc) {
            return { success: false, message: `Location not found nearby: ${loc}`, reason: 'loc_not_found' };
        }

        // Walk to the location first (handles doors)
        if (resolvedLoc.distance > 2) {
            const walkResult = await this.walkTo(resolvedLoc.x, resolvedLoc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${resolvedLoc.name}: ${walkResult.message}`, reason: 'cant_reach' };
            }
        }

        // Re-find the location after walking (it may have moved in view). A RegExp
        // target is kept as-is — rebuilding it from the matched name used to drop
        // the caller's anchors, turning /^hopper$/i into one matching "Hopper
        // controls". An entity target re-finds by identity so same-named
        // neighbours can't win on distance.
        const locNow = loc instanceof RegExp || typeof loc === 'string'
            ? this.helpers.resolveLocation(loc, /./)
            : this.helpers.refindLocation(resolvedLoc)
                ?? this.helpers.resolveLocation(exactNamePattern(resolvedLoc.name), /./);
        if (!locNow) {
            return { success: false, message: `${resolvedLoc.name} no longer visible`, reason: 'loc_not_found' };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();
        // Some loc scripts (flour bin) swap the item with no animation,
        // dialog, or reach failure — the inventory change is the evidence.
        const invBefore = this.helpers.inventorySignature(this.sdk.getState());
        const inventoryChanged = (state: Parameters<ActionHelpers['inventorySignature']>[0]): boolean =>
            invBefore !== '' && this.helpers.inventorySignature(state) !== invBefore;

        // Use the item on the location
        const result = await this.sdk.sendUseItemOnLoc(resolvedItem.slot, locNow.x, locNow.z, locNow.id);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for interaction to complete or fail
        try {
            await this.sdk.waitForCondition(state => {
                // Check for "can't reach" messages
                for (const msg of state.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true;
                        }
                    }
                }

                // Check if dialog/interface opened (crafting menu, etc.)
                if (state.dialog.isOpen || state.interface?.isOpen) {
                    return true;
                }

                // Check if player started animating (cooking, smelting, etc.)
                if (state.player && state.player.animId !== -1) {
                    return true;
                }

                if (inventoryChanged(state)) {
                    return true;
                }

                return false;
            }, timeout);

            // Check for failure
            if (this.helpers.checkCantReachMessage(msgBaseline)) {
                return { success: false, message: `Cannot reach ${locNow.name}`, reason: 'cant_reach' };
            }

            return { success: true, message: `Used ${resolvedItem.name} on ${locNow.name}` };
        } catch {
            // The effect can land after the wait expires with no other
            // evidence — an inventory change still proves the use worked.
            if (inventoryChanged(this.sdk.getState())) {
                return { success: true, message: `Used ${resolvedItem.name} on ${locNow.name}` };
            }
            return { success: false, message: `Timeout using ${resolvedItem.name} on ${locNow.name}`, reason: 'timeout' };
        }
    }

    /**
     * Use an inventory item on a nearby NPC (e.g., bones on altar keeper, item on NPC).
     * Walks to the NPC first (handling doors), then uses the item.
     */
    async useItemOnNpc(
        item: InventoryItem | string | RegExp,
        npc: NearbyNpc | string | RegExp,
        options: { timeout?: number } = {}
    ): Promise<UseItemOnNpcResult> {
        const { timeout = 10000 } = options;

        await this.dismissBlockingUI();

        // Resolve item
        const resolvedItem = this.helpers.resolveInventoryItem(item, /./);
        if (!resolvedItem) {
            return { success: false, message: `Item not found in inventory: ${item}`, reason: 'item_not_found' };
        }

        // Resolve NPC
        const resolvedNpc = this.helpers.resolveNpc(npc);
        if (!resolvedNpc) {
            return { success: false, message: `NPC not found nearby: ${npc}`, reason: 'npc_not_found' };
        }

        // Walk to the NPC first (handles doors)
        if (resolvedNpc.distance > 2) {
            const walkResult = await this.walkTo(resolvedNpc.x, resolvedNpc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${resolvedNpc.name}: ${walkResult.message}`, reason: 'cant_reach' };
            }
        }

        // Re-find the NPC after walking (it may have moved)
        const npcPattern = typeof npc === 'object' && 'index' in npc ? new RegExp(resolvedNpc.name, 'i') : npc;
        const npcNow = this.helpers.resolveNpc(npcPattern);
        if (!npcNow) {
            return { success: false, message: `${resolvedNpc.name} no longer visible`, reason: 'npc_not_found' };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();
        // Some NPC scripts (cow milking) swap the item with no animation or
        // dialog — the inventory change is the only observable evidence.
        const invBefore = this.helpers.inventorySignature(this.sdk.getState());
        const inventoryChanged = (state: Parameters<ActionHelpers['inventorySignature']>[0]): boolean =>
            invBefore !== '' && this.helpers.inventorySignature(state) !== invBefore;

        // Use the item on the NPC
        const result = await this.sdk.sendUseItemOnNpc(resolvedItem.slot, npcNow.index);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for interaction to complete or fail
        try {
            await this.sdk.waitForCondition(state => {
                // Check for "can't reach" messages
                for (const msg of state.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true;
                        }
                    }
                }

                // Check if dialog/interface opened
                if (state.dialog.isOpen || state.interface?.isOpen) {
                    return true;
                }

                // Check if player started animating
                if (state.player && state.player.animId !== -1) {
                    return true;
                }

                if (inventoryChanged(state)) {
                    return true;
                }

                return false;
            }, timeout);

            // Check for failure
            if (this.helpers.checkCantReachMessage(msgBaseline)) {
                return { success: false, message: `Cannot reach ${npcNow.name}`, reason: 'cant_reach' };
            }

            return { success: true, message: `Used ${resolvedItem.name} on ${npcNow.name}` };
        } catch {
            // The effect can land after the wait expires with no other
            // evidence — an inventory change still proves the use worked.
            if (inventoryChanged(this.sdk.getState())) {
                return { success: true, message: `Used ${resolvedItem.name} on ${npcNow.name}` };
            }
            return { success: false, message: `Timeout using ${resolvedItem.name} on ${npcNow.name}`, reason: 'timeout' };
        }
    }

    /** Chop a tree and wait for logs to appear in inventory. */
    async chopTree(target?: NearbyLoc | string | RegExp): Promise<ChopTreeResult> {
        await this.dismissBlockingUI();

        const tree = this.helpers.resolveLocation(target, /^tree$/i);
        if (!tree) {
            return { success: false, message: 'No tree found' };
        }

        const logsBefore = this.sdk.countInventoryItems(/logs/i);
        const result = await this.sdk.sendInteractLoc(tree.x, tree.z, tree.id, 1);

        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Success requires *gaining* logs. Returning on "the tree despawned"
        // alone reported success when another player felled it first, and then
        // handed back logs the bot was already carrying as the ones it chopped.
        // The despawn still short-circuits the wait — it just isn't success.
        try {
            const finalState = await this.sdk.waitForCondition(state => {
                if (countItems(state.inventory, /logs/i) > logsBefore) return true;
                return !state.nearbyLocs.some(l => l.x === tree.x && l.z === tree.z && l.id === tree.id);
            }, 30000);

            if (countItems(finalState.inventory, /logs/i) <= logsBefore) {
                return { success: false, message: `${tree.name} was felled by someone else` };
            }

            const logs = finalState.inventory.find(item => /logs/i.test(item.name));
            return { success: true, logs, message: `Chopped ${tree.name}` };
        } catch {
            return { success: false, message: 'Timed out waiting for logs from tree chop' };
        }
    }

    /** Burn logs using a tinderbox, wait for firemaking XP. */
    async burnLogs(logsTarget?: InventoryItem | string | RegExp): Promise<BurnLogsResult> {
        await this.dismissBlockingUI();

        const tinderbox = this.sdk.findInventoryItem(/tinderbox/i);
        if (!tinderbox) {
            return { success: false, xpGained: 0, message: 'No tinderbox in inventory' };
        }

        const logs = this.helpers.resolveInventoryItem(logsTarget, /logs/i);
        if (!logs) {
            return { success: false, xpGained: 0, message: 'No logs in inventory' };
        }

        const fmBefore = this.sdk.getSkill('Firemaking')?.experience || 0;

        const result = await this.sdk.sendUseItemOnItem(tinderbox.slot, logs.slot);
        if (!result.success) {
            return { success: false, xpGained: 0, message: result.message };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();
        let lastDialogClickTick = 0;

        try {
            await this.sdk.waitForCondition(state => {
                const fmXp = state.skills.find(s => s.name === 'Firemaking')?.experience || 0;
                if (fmXp > fmBefore) {
                    return true;
                }

                if (state.dialog.isOpen && (state.tick - lastDialogClickTick) >= 3) {
                    lastDialogClickTick = state.tick;
                    this.sdk.sendClickDialog(0).catch(() => {});
                }

                const failureMessages = ["can't light a fire", "you need to move", "can't do that here"];
                for (const msg of state.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                        const text = msg.text.toLowerCase();
                        if (failureMessages.some(f => text.includes(f))) {
                            return true;
                        }
                    }
                }

                return false;
            }, 30000);

            const fmAfter = this.sdk.getSkill('Firemaking')?.experience || 0;
            const xpGained = fmAfter - fmBefore;

            return {
                success: xpGained > 0,
                xpGained,
                message: xpGained > 0 ? 'Burned logs' : 'Failed to light fire (possibly bad location)'
            };
        } catch {
            return { success: false, xpGained: 0, message: 'Timed out waiting for fire' };
        }
    }

    /**
     * Drop inventory items by name, waiting for each drop to land before
     * sending the next. `sendDropItem` on a slot the server has already
     * emptied silently no-ops, so slot loops built on stale state lose most
     * of their sends; this re-resolves the slot from fresh state every time.
     *
     * `amount` counts inventory slots (a whole stack drops as one). Pass
     * `'all'` or `-1` to drop every matching slot.
     */
    async dropItem(target: InventoryItem | string | RegExp, amount: number | 'all' = 'all'): Promise<DropItemResult> {
        await this.dismissBlockingUI();

        let wanted: number;
        if (amount === 'all' || amount === -1) {
            wanted = Number.POSITIVE_INFINITY;
        } else {
            const validated = validateActionQuantity(amount, { max: 28 });
            if (!validated.valid) {
                return { success: false, message: validated.message, slotsDropped: 0, reason: 'invalid_amount' };
            }
            wanted = validated.amount;
        }

        const resolved = this.helpers.resolveInventoryItem(target, /./);
        if (!resolved) {
            return { success: false, message: `Item not found in inventory: ${target}`, slotsDropped: 0, reason: 'item_not_found' };
        }
        // Pin the item id after the first resolution so later iterations can't
        // drift onto a different item the pattern also happens to match.
        const matches = (i: InventoryItem) => i.id === resolved.id;

        let slotsDropped = 0;
        while (slotsDropped < wanted) {
            const current = this.sdk.getInventory().find(matches);
            if (!current) break;
            const slotsBefore = this.sdk.getInventory().filter(matches).length;

            const result = await this.sdk.sendDropItem(current.slot);
            if (!result.success) {
                return {
                    success: false,
                    message: result.message,
                    slotsDropped,
                    reason: 'timeout'
                };
            }

            try {
                await this.sdk.waitForCondition(
                    state => state.inventory.filter(matches).length < slotsBefore,
                    5000
                );
            } catch {
                return {
                    success: false,
                    message: `Drop of ${resolved.name} (slot ${current.slot}) was not observed`,
                    slotsDropped,
                    reason: 'timeout'
                };
            }
            slotsDropped++;
        }

        const complete = wanted === Number.POSITIVE_INFINITY ? slotsDropped > 0 : slotsDropped === wanted;
        return {
            success: complete,
            message: `Dropped ${resolved.name} x${slotsDropped} slot${slotsDropped === 1 ? '' : 's'}`,
            slotsDropped,
            reason: complete ? undefined : 'timeout'
        };
    }

    /** Pick up an item from the ground. */
    async pickupItem(target: GroundItem | string | RegExp): Promise<PickupResult> {
        const resolvedItem = this.helpers.resolveGroundItem(target);
        return this.helpers.withDoorRetry(
            () => this._pickupItemOnce(target),
            (r) => r.reason === 'cant_reach',
            2,
            resolvedItem ? { x: resolvedItem.x, z: resolvedItem.z } : undefined
        );
    }

    private async _pickupItemOnce(target: GroundItem | string | RegExp): Promise<PickupResult> {
        await this.dismissBlockingUI();

        const item = this.helpers.resolveGroundItem(target);
        if (!item) {
            return { success: false, message: 'Item not found on ground', reason: 'item_not_found' };
        }

        // Walk close to the item first (server handles final positioning via sendPickup)
        if (item.distance > 2) {
            const walkResult = await this.walkTo(item.x, item.z, 2);
            if (!walkResult.success) {
                return { success: false, message: walkResult.message, reason: 'cant_reach' };
            }
        }

        // Wait one tick before picking up
        await this.sdk.waitForTicks(1);

        // Capture startTick AFTER walk so we only check messages from the pickup, not the walk
        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();

        // Now send the pickup command
        const result = await this.sdk.sendPickup(item.x, item.z, item.id);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Success is *gaining* the item, tracked by its exact id. The ground
        // publication also disappears when another player wins the pickup, so
        // disappearance alone only stops the wait - see chopTree.
        const countBefore = countItems(this.sdk.getInventory(), item.id);

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for failure messages
                for (const msg of state.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true;
                        }
                        if (text.includes("inventory") && text.includes("full")) {
                            return true;
                        }
                    }
                }
                if (countItems(state.inventory, item.id) > countBefore) return true;
                // Item disappeared from ground (picked up by us or someone else)
                const stillOnGround = state.groundItems.some(g => g.x === item.x && g.z === item.z && g.id === item.id);
                return !stillOnGround;
            }, 10000);

            // Check for failure reasons
            for (const msg of finalState.gameMessages) {
                if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes("cannot reach")) {
                        return { success: false, message: `Cannot reach ${item.name} - path blocked`, reason: 'cant_reach' };
                    }
                    if (text.includes("inventory") && text.includes("full")) {
                        return { success: false, message: 'Inventory is full', reason: 'inventory_full' };
                    }
                }
            }

            // The ground removal can publish a tick before the inventory add
            // lands - give the add a short grace before ruling it lost.
            let gained = countItems(finalState.inventory, item.id) - countBefore;
            if (gained <= 0) {
                try {
                    const settled = await this.sdk.waitForCondition(
                        s => countItems(s.inventory, item.id) > countBefore, 1500);
                    gained = countItems(settled.inventory, item.id) - countBefore;
                } catch { /* no gain observed */ }
            }
            if (gained <= 0) {
                return { success: false, message: `${item.name} was taken by someone else`, reason: 'taken_by_other' };
            }

            const pickedUp = this.sdk.getInventory().find(i => i.id === item.id);

            // Wait one tick after picking up
            await this.sdk.waitForTicks(1);

            return { success: true, item: pickedUp, message: `Picked up ${item.name}` };
        } catch {
            return { success: false, message: 'Timed out waiting for pickup', reason: 'timeout' };
        }
    }

    /** Talk to an NPC and wait for dialog to open. Walks to the NPC first (handling doors). */
    async talkTo(target: NearbyNpc | string | RegExp): Promise<TalkResult> {
        await this.dismissBlockingUI();

        const npc = this.helpers.resolveNpc(target);
        if (!npc) {
            return { success: false, message: 'NPC not found' };
        }

        // Walk to the NPC first (handles doors)
        if (npc.distance > 2) {
            const walkResult = await this.walkTo(npc.x, npc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${npc.name}: ${walkResult.message}` };
            }
        }

        // Re-find the NPC after walking (it may have moved)
        const npcPattern = typeof target === 'object' ? new RegExp(npc.name, 'i') : target;
        const npcNow = this.helpers.resolveNpc(npcPattern);
        if (!npcNow) {
            return { success: false, message: `${npc.name} no longer visible` };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();
        let lastMoveTick = startTick;
        let lastX = this.sdk.getState()?.player?.x ?? 0;
        let lastZ = this.sdk.getState()?.player?.z ?? 0;

        const result = await this.sdk.sendTalkToNpc(npcNow.index);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for can't-reach messages
                for (const msg of state.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) return true;
                    }
                }

                // Dialog opened — success
                if (state.dialog.isOpen) return true;

                // Track movement
                if (state.player && (state.player.x !== lastX || state.player.z !== lastZ)) {
                    lastX = state.player.x;
                    lastZ = state.player.z;
                    lastMoveTick = state.tick;
                }

                // Player idle for 2+ ticks with no dialog → give up
                if (state.tick - lastMoveTick >= 2) return true;

                return false;
            }, 30000); // safety net only

            if (this.helpers.checkCantReachMessage(msgBaseline)) {
                return { success: false, message: `Cannot reach ${npcNow.name}` };
            }

            if (finalState.dialog.isOpen) {
                return { success: true, dialog: finalState.dialog, message: `Talking to ${npcNow.name}` };
            }

            // The idle window can expire a tick before the server's dialog
            // arrives (walk-up finished, NPC still turning). Give the dialog a
            // short grace instead of reporting failure on a talk that worked.
            try {
                const lateState = await this.sdk.waitForCondition(s => s.dialog.isOpen, 2000);
                return { success: true, dialog: lateState.dialog, message: `Talking to ${npcNow.name}` };
            } catch {
                return { success: false, message: 'Dialog did not open' };
            }
        } catch {
            return { success: false, message: 'Timed out waiting for dialog' };
        }
    }

    /** Walk to coordinates using pathfinding, auto-opening doors. Aborts if the player dies en route. */
    async walkTo(x: number, z: number, tolerance: number = 3): Promise<ActionResult> {
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
            // walkTo(undefined, undefined) used to be accepted and marched the
            // bot across the map (players expose coordinates as .x/.z).
            return {
                success: false,
                message: `walkTo requires numeric coordinates - got (${x}, ${z}). Nearby entities (players included) expose them as .x/.z; your own position is state.player.worldX/.worldZ`,
            };
        }
        await this.dismissBlockingUI();

        const state = this.sdk.getState();
        if (!state?.player) return { success: false, message: 'No player state' };

        // Death mid-walk: an orphaned walkTo that keeps marching after a
        // respawn re-enters the danger zone that killed it. Abort instead.
        const startLifeId = state.player.lifeId;
        const diedEnRoute = (): ActionResult | null => {
            const p = this.sdk.getState()?.player;
            if (!p) return null;
            if (p.isDead || (startLifeId !== undefined && p.lifeId !== undefined && p.lifeId !== startLifeId)) {
                return { success: false, message: `Walk aborted: player died en route to (${x}, ${z})${p.isDead ? '' : ' (respawned)'}` };
            }
            return null;
        };

        const distTo = (pos: { x: number; z: number }) => this.helpers.distance(pos.x, pos.z, x, z);
        let pos = { x: state.player.worldX, z: state.player.worldZ };

        if (distTo(pos) <= tolerance) {
            return { success: true, message: 'Already at destination' };
        }

        const MAX_ITERATIONS = 50;
        const MAX_DOOR_RETRIES = 3;
        let doorRetryCount = 0;
        let poorProgressCount = 0;
        const doorFailCounts = new Map<string, number>(); // Tracks reach failures per door
        // Where the last partial path (reachedDestination=false) stopped.
        // Walking the same dead end twice cannot succeed - fail fast instead.
        let lastPartialEnd: { x: number; z: number } | null = null;
        // Best distance-to-destination seen at any iteration end. Progress is
        // *closing on the destination*, not distance walked: an oscillating
        // route can move 5+ tiles every iteration while never getting closer.
        let bestRemaining = distTo(pos);

        // Try to open a blocking door. Returns true if door was opened.
        const tryOpenDoor = async (): Promise<boolean> => {
            if (doorRetryCount >= MAX_DOOR_RETRIES) return false;
            if (await this.helpers.tryOpenBlockingDoor()) {
                doorRetryCount++;
                await this.sdk.waitForTicks(1);
                return true;
            }
            // Door open failed — block the nearest openable door in pathfinding
            // so subsequent path queries route around it
            const nearest = this.sdk.getNearbyLocs()
                .filter(l => l.optionsWithIndex.some(o => /^open$/i.test(o.text)))
                .filter(l => l.distance <= 15)
                .sort((a, b) => a.distance - b.distance)[0];
            if (nearest) {
                const level = this.sdk.getState()?.player?.level ?? 0;
                const key = `${nearest.x},${nearest.z}`;
                const fails = (doorFailCounts.get(key) ?? 0) + 1;
                doorFailCounts.set(key, fails);
                // Temporarily exclude after repeated reach failures. The
                // session-owned evidence expires automatically.
                if (fails >= 3 && !this.sdk.isDoorTemporarilyBlocked(level, nearest.x, nearest.z)) {
                    this.sdk.blockDoorTemporarily(level, nearest.x, nearest.z);
                    console.log(`[walkTo] Temporarily avoiding impassable door at (${nearest.x}, ${nearest.z}) — re-routing`);
                }
            }
            return false;
        };

        for (let i = 0; i < MAX_ITERATIONS; i++) {
            const dead = diedEnRoute();
            if (dead) return dead;

            // Try pathfinding (with one retry)
            let path = await this.sdk.sendFindPath(x, z, 500);
            if (!path.success || !path.waypoints?.length) {
                await this.sdk.waitForTicks(1);
                path = await this.sdk.sendFindPath(x, z, 500);
                if (!path.success || !path.waypoints?.length) {
                    // "no waypoints" reads as broken collision data, but the usual
                    // cause is a destination that is simply blocked — a wall, or a
                    // tile a loc stands on. Say which, so callers pick a neighbour
                    // tile instead of chasing a phantom pathfinder bug.
                    const level = this.sdk.getState()?.player?.level ?? 0;
                    const reason = path.error
                        ?? (isTileWalkable(level, x, z) ? 'no waypoints' : 'destination tile is blocked');
                    console.error(`[walkTo] PATHFINDING FAILED: ${reason} - from (${pos.x}, ${pos.z}) to (${x}, ${z})`);
                    return { success: false, message: `No path to (${x}, ${z}) from (${pos.x}, ${pos.z}): ${reason}` };
                }
            }

            // A partial path (reachedDestination=false) stopping short of the
            // tolerance is worth walking ONCE - doors open and zones allocate
            // along the way. But when a re-query from the dead end produces the
            // same endpoint, walking it again just loops: surface the shortfall
            // instead (Varrock-house-to-bank dead-end loop, bug report
            // 2026-08-10).
            const endWp = path.waypoints[path.waypoints.length - 1];
            const partial = path.reachedDestination === false
                && endWp !== undefined
                && this.helpers.distance(endWp.x, endWp.z, x, z) > tolerance;
            if (partial && lastPartialEnd && endWp.x === lastPartialEnd.x && endWp.z === lastPartialEnd.z) {
                if (!await tryOpenDoor()) {
                    const short = Math.round(this.helpers.distance(endWp.x, endWp.z, x, z));
                    return {
                        success: false,
                        message: `Path to (${x}, ${z}) stops ${short} tiles short at (${endWp.x}, ${endWp.z}) - the rest is unroutable from here (locked door or separate room?)`
                    };
                }
                lastPartialEnd = null;
                continue; // A door opened - re-query the path
            }
            lastPartialEnd = partial ? { x: endWp.x, z: endWp.z } : null;

            // Identify doors the path crosses through so we can open them proactively
            const requiredDoors = findDoorsAlongPath(path.waypoints);
            const requiredDoorKeys = new Set(requiredDoors.map(d => `${d.x},${d.z}`));

            // Walk waypoints
            let consecutiveStuck = 0;

            for (const wp of path.waypoints) {
                // Proactively open doors the path requires — only when we're close enough to see them
                if (requiredDoorKeys.size > 0) {
                    const wpDoorKey = `${wp.x},${wp.z}`;
                    const isNearDoor = requiredDoorKeys.has(wpDoorKey) ||
                        requiredDoorKeys.has(`${wp.x + 1},${wp.z}`) ||
                        requiredDoorKeys.has(`${wp.x - 1},${wp.z}`) ||
                        requiredDoorKeys.has(`${wp.x},${wp.z + 1}`) ||
                        requiredDoorKeys.has(`${wp.x},${wp.z - 1}`);

                    if (isNearDoor) {
                        const dist = this.helpers.distance(pos.x, pos.z, wp.x, wp.z);
                        if (dist <= 15) {
                            // Find which required door is closest to this waypoint
                            for (const door of requiredDoors) {
                                const dk = `${door.x},${door.z}`;
                                if (this.sdk.isDoorTemporarilyBlocked(door.level, door.x, door.z)) break;
                                const doorDist = Math.abs(door.x - wp.x) + Math.abs(door.z - wp.z);
                                if (doorDist <= 1) {
                                    const result = await this.helpers.openDoorAt(door.x, door.z);
                                    if (result === 'opened' || result === 'already_open') {
                                        requiredDoorKeys.delete(dk);
                                        await this.sdk.waitForTicks(1);
                                    } else if (result === 'locked') {
                                        // Definitely locked right now — avoid it for
                                        // this session's next path queries.
                                        this.sdk.blockDoorTemporarily(door.level, door.x, door.z);
                                        requiredDoorKeys.delete(dk);
                                        console.log(`[walkTo] Temporarily avoiding locked door at (${door.x}, ${door.z}) — re-routing`);
                                        break; // Re-query path on next iteration
                                    } else {
                                        // A door present in static collision can be absent from the
                                        // current Lite map. That is not a failed open attempt: continue
                                        // walking so a phantom door cannot cause endless re-planning.
                                        if (result === 'not_found') {
                                            requiredDoorKeys.delete(dk);
                                            continue;
                                        }

                                        // cant_reach — transient failure, track attempts
                                        const fails = (doorFailCounts.get(dk) ?? 0) + 1;
                                        doorFailCounts.set(dk, fails);
                                        if (fails >= 3) {
                                            this.sdk.blockDoorTemporarily(door.level, door.x, door.z);
                                            requiredDoorKeys.delete(dk);
                                            console.log(`[walkTo] Temporarily avoiding impassable door at (${door.x}, ${door.z}) after ${fails} failures — re-routing`);
                                        } else {
                                            console.log(`[walkTo] Door at (${door.x}, ${door.z}) ${result} (attempt ${fails}/3) — retrying`);
                                        }
                                        break; // Re-query path on next iteration
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }

                const result = await this.helpers.walkStepToward(wp.x, wp.z, 2, pos);
                const deadMidStep = diedEnRoute();
                if (deadMidStep) return deadMidStep;
                if (distTo(result.pos) <= tolerance) return { success: true, message: 'Arrived' };

                if (result.status === 'stuck') {
                    if (++consecutiveStuck >= 3) {
                        await tryOpenDoor();
                        break; // Re-query path
                    }
                } else {
                    consecutiveStuck = 0;
                    pos = result.pos;
                }
            }

            // Progress = closing on the destination. bestRemaining is a
            // monotone minimum, so an oscillating route (walk out, walk back)
            // cannot keep resetting the counter the way distance-moved did.
            const remaining = distTo(pos);
            if (remaining < bestRemaining) {
                bestRemaining = remaining;
                poorProgressCount = 0;
            } else if (++poorProgressCount >= 3) {
                if (!await tryOpenDoor()) {
                    return { success: false, message: `Stuck at (${pos.x}, ${pos.z})` };
                }
                poorProgressCount = 0;
            }
        }

        return { success: false, message: `Could not reach (${x}, ${z}) - stopped at (${pos.x}, ${pos.z})` };
    }

    // ============ Porcelain: Shop Actions ============

    /** Close the shop interface. */
    async closeShop(timeout: number = 5000): Promise<ActionResult> {
        const state = this.sdk.getState();
        if (!state?.shop.isOpen && !state?.interface?.isOpen) {
            return { success: true, message: 'Shop already closed' };
        }

        await this.sdk.sendCloseShop();

        try {
            await this.sdk.waitForCondition(s => {
                const shopClosed = !s.shop.isOpen;
                const interfaceClosed = !s.interface?.isOpen;
                return shopClosed && interfaceClosed;
            }, timeout);

            return { success: true, message: 'Shop closed' };
        } catch {
            await this.sdk.sendCloseShop();
            await this.sdk.waitForTicks(1);
            const finalState = this.sdk.getState();

            if (!finalState?.shop.isOpen && !finalState?.interface?.isOpen) {
                return { success: true, message: 'Shop closed (second attempt)' };
            }

            return {
                success: false,
                message: `Shop close timeout - shop.isOpen=${finalState?.shop.isOpen}, interface.isOpen=${finalState?.interface?.isOpen}`
            };
        }
    }

    /** Open a shop by trading with an NPC. Defaults to the nearest shopkeeper. */
    async openShop(target?: NearbyNpc | string | RegExp): Promise<ActionResult> {
        await this.dismissBlockingUI();

        // Many shops are run by a named NPC (Bob's Brilliant Axes -> 'Bob'),
        // so with no explicit target, fall back from the /shop keeper/ name to
        // the nearest NPC that offers a Trade option. An explicit target that
        // doesn't match stays a failure - trading with someone else instead
        // would be worse.
        const npc = this.helpers.resolveNpc(target ?? /shop\s*keeper/i)
            ?? (target === undefined
                ? this.sdk.getState()?.nearbyNpcs
                    .filter(n => n.optionsWithIndex.some(o => /trade/i.test(o.text)))
                    .sort((a, b) => a.distance - b.distance)[0]
                : null)
            ?? null;
        if (!npc) {
            return { success: false, message: target === undefined ? 'No nearby NPC with a Trade option' : `Shopkeeper not found: ${target}` };
        }

        const tradeOpt = npc.optionsWithIndex.find(o => /trade/i.test(o.text));
        if (!tradeOpt) {
            return { success: false, message: 'No trade option on NPC' };
        }

        // Walk near NPC first - this handles doors
        if (npc.distance > 2) {
            const walkResult = await this.walkTo(npc.x, npc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${npc.name}: ${walkResult.message}` };
            }
        }

        const result = await this.sdk.sendInteractNpc(npc.index, tradeOpt.opIndex);
        if (!result.success) {
            return result;
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                if (state.shop.isOpen) return true;
                return false;
            }, 10000);

            if (finalState.shop.isOpen) {
                return { success: true, message: `Opened shop: ${this.sdk.getState()?.shop.title}` };
            }

            return { success: false, message: 'Shop did not open' };
        } catch {
            return { success: false, message: 'Timed out waiting for shop to open' };
        }
    }

    /**
     * Buy an item from an open shop.
     *
     * `success` is true only when the full requested amount arrived; a short
     * fill (out of stock, out of coins, full inventory) returns
     * `success: false` with `partial: true` and the actual `amountBought`.
     */
    async buyFromShop(target: ShopItem | string | RegExp, amount: number = 1): Promise<ShopResult> {
        const validated = validateActionQuantity(amount, { max: MAX_SHOP_ACTION_QUANTITY });
        if (!validated.valid) {
            return { success: false, message: validated.message, reason: 'invalid_amount' };
        }
        const requestedAmount = validated.amount;

        const shop = this.sdk.getState()?.shop;
        if (!shop?.isOpen) {
            return { success: false, message: 'Shop is not open', reason: 'shop_not_open' };
        }

        const shopItem = this.helpers.resolveShopItem(target, shop.shopItems);
        if (!shopItem) {
            return { success: false, message: `Item not found in shop: ${target}`, reason: 'item_not_found' };
        }

        // A shop lists every line it can ever sell; count is the live shelf
        // stock. Buying a count-0 line used to walk the whole funded flow and
        // come back success-shaped with amountBought 0.
        if (shopItem.count <= 0) {
            return { success: false, message: `${shopItem.name} is out of stock`, reason: 'out_of_stock', requestedAmount, amountBought: 0 };
        }

        // Count total items across all inventory slots (handles non-stackable items)
        const countInvItems = () => countItems(this.sdk.getInventory(), shopItem.id);

        // The buy-wait timeout fires identically for no-coins, no-stock and
        // no-free-slot; a full inventory with no existing stack of the item
        // can never receive it, so fail that loudly up front. (A full
        // inventory WITH a stack may still work when the item stacks.)
        if (this.sdk.getInventory().length >= 28 && countInvItems() === 0) {
            return { success: false, message: `No inventory space to buy ${shopItem.name}`, reason: 'no_inventory_space', requestedAmount, amountBought: 0 };
        }

        const totalBefore = countInvItems();
        const outcome = (): ShopResult => {
            const amountBought = Math.max(0, countInvItems() - totalBefore);
            const quantity = classifyQuantity(requestedAmount, amountBought);
            return {
                success: quantity.complete,
                item: this.sdk.getInventory().find(i => i.id === shopItem.id),
                requestedAmount,
                amountBought,
                partial: quantity.partial,
                message: quantity.complete
                    ? `Bought ${shopItem.name} x${amountBought}`
                    : `Bought ${shopItem.name} x${amountBought} of ${requestedAmount} requested`,
                reason: quantity.complete ? undefined : quantity.partial ? 'partial_fill' : 'timeout',
            };
        };

        // Stream Buy-10/5/1 packets rather than materializing an amount-sized
        // array of steps: buyFromShop(item, 1e9) used to allocate a
        // hundred-million-element array before sending a single packet.
        let remaining = requestedAmount;
        let packetsSent = 0;
        const deadline = Date.now() + SHOP_ACTION_DEADLINE_MS;
        while (remaining > 0 && packetsSent < MAX_SHOP_ACTION_PACKETS && Date.now() < deadline) {
            const stepAmount = nextShopStep(remaining);
            const countBefore = countInvItems();

            const result = await this.sdk.sendShopBuy(shopItem.slot, stepAmount);
            if (!result.success) {
                const failed = outcome();
                if (failed.amountBought === 0) failed.message = result.message;
                return failed;
            }
            packetsSent++;

            try {
                await this.sdk.waitForCondition(
                    state => countItems(state.inventory, shopItem.id) > countBefore,
                    5000,
                );
            } catch {
                const failed = outcome();
                if (failed.amountBought === 0) {
                    failed.message = `Failed to buy ${shopItem.name} (no coins, out of stock, or full inventory?)`;
                }
                return failed;
            }
            remaining -= stepAmount;
        }

        return outcome();
    }

    /**
     * Sell an item to an open shop.
     *
     * `success` is true only when the full requested amount was sold; a short
     * fill returns `success: false` with `partial: true` and `amountSold`.
     */
    async sellToShop(target: InventoryItem | ShopItem | string | RegExp, amount: SellAmount = 1): Promise<ShopSellResult> {
        // Bank deposits spell "everything" as -1; accept it here for parity.
        if (amount === -1) amount = 'all';
        const validated = amount === 'all'
            ? null
            : validateActionQuantity(amount, { max: MAX_SHOP_ACTION_QUANTITY });
        if (validated && !validated.valid) {
            return { success: false, message: validated.message, reason: 'invalid_amount' };
        }

        const shop = this.sdk.getState()?.shop;
        if (!shop?.isOpen) {
            return { success: false, message: 'Shop is not open', reason: 'shop_not_open' };
        }

        const sellItem = this.helpers.resolveShopItem(target, shop.playerItems);
        if (!sellItem) {
            return { success: false, message: `Item not found to sell: ${target}`, reason: 'item_not_found' };
        }

        const msgBaseline = this.helpers.getMessageTick();

        const getTotalCount = (playerItems: readonly ShopItem[]) =>
            playerItems.filter(i => i.id === sellItem.id).reduce((sum, i) => sum + i.count, 0);

        if (amount === 'all') {
            return this.sellAllToShop(sellItem, getTotalCount(shop.playerItems), msgBaseline);
        }

        const totalCountBefore = getTotalCount(shop.playerItems);
        const requestedAmount = validated!.amount;
        const outcome = (rejected = false): ShopSellResult => {
            const amountSold = Math.max(
                0,
                totalCountBefore - getTotalCount(this.sdk.getState()?.shop.playerItems ?? []),
            );
            const quantity = classifyQuantity(requestedAmount, amountSold);
            const ok = quantity.complete && !rejected;
            return {
                success: ok,
                requestedAmount,
                amountSold,
                partial: quantity.partial,
                rejected,
                message: ok
                    ? `Sold ${sellItem.name} x${amountSold}`
                    : `Sold ${sellItem.name} x${amountSold} of ${requestedAmount} requested`,
                reason: ok ? undefined : rejected ? 'rejected' : quantity.partial ? 'partial_fill' : 'timeout',
            };
        };

        // Stream Sell-10/5/1 packets (see buyFromShop) and re-resolve the shop
        // slot before each one: selling a batch of non-stackables removes the
        // anchor slot, so reusing sellItem.slot sold whatever slid into it.
        let remaining = requestedAmount;
        let packetsSent = 0;
        const deadline = Date.now() + SHOP_ACTION_DEADLINE_MS;
        while (remaining > 0 && packetsSent < MAX_SHOP_ACTION_PACKETS && Date.now() < deadline) {
            const currentPlayerItems = this.sdk.getState()?.shop.playerItems ?? [];
            const currentSellItem = currentPlayerItems.find(i => i.id === sellItem.id);
            if (!currentSellItem) return outcome();
            const countBefore = getTotalCount(currentPlayerItems);
            const stepAmount = nextShopStep(remaining);

            const result = await this.sdk.sendShopSell(currentSellItem.slot, stepAmount);
            if (!result.success) {
                const failed = outcome();
                if (failed.amountSold === 0) failed.message = result.message;
                return failed;
            }
            packetsSent++;

            try {
                const finalState = await this.sdk.waitForCondition(state => {
                    for (const msg of state.gameMessages) {
                        if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                            const text = msg.text.toLowerCase();
                            if (text.includes("can't sell this item")) {
                                return true;
                            }
                        }
                    }

                    const totalCountNow = getTotalCount(state.shop.playerItems);
                    return totalCountNow < countBefore;
                }, 5000);

                for (const msg of finalState.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                        const text = msg.text.toLowerCase();
                        let rejection: string | null = null;
                        if (text.includes("can't sell this item to this shop")) {
                            rejection = `Shop doesn't buy ${sellItem.name}`;
                        } else if (text.includes("can't sell this item to a shop")) {
                            rejection = `Cannot sell ${sellItem.name} to any shop`;
                        } else if (text.includes("can't sell this item")) {
                            rejection = `${sellItem.name} is not tradeable`;
                        }
                        if (rejection) {
                            const result = outcome(true);
                            result.message = rejection;
                            return result;
                        }
                    }
                }
            } catch {
                const failed = outcome();
                if (failed.amountSold === 0) failed.message = `Failed to sell ${sellItem.name} (timeout)`;
                return failed;
            }
            remaining -= stepAmount;
        }

        return outcome();
    }

    private async sellAllToShop(sellItem: ShopItem, requestedAmount: number, msgBaseline: number): Promise<ShopSellResult> {
        let totalSold = 0;
        let packetsSent = 0;
        const deadline = Date.now() + SHOP_ACTION_DEADLINE_MS;

        const getTotalCount = (playerItems: ShopItem[]) => {
            return playerItems.filter(i => i.id === sellItem.id).reduce((sum, i) => sum + i.count, 0);
        };

        // Bounded rather than `while (true)`: a shop that accepts the packet but
        // never decrements used to spin here until the caller gave up.
        while (packetsSent < MAX_SHOP_ACTION_PACKETS && Date.now() < deadline) {
            const state = this.sdk.getState();
            if (!state?.shop.isOpen) {
                break;
            }

            const currentItem = state.shop.playerItems.find(i => i.id === sellItem.id);
            if (!currentItem || currentItem.count === 0) {
                break;
            }

            const totalCountBefore = getTotalCount(state.shop.playerItems);
            const sellAmount = Math.min(10, currentItem.count);
            const currentSlot = currentItem.slot;

            const result = await this.sdk.sendShopSell(currentSlot, sellAmount);
            if (!result.success) {
                break;
            }
            packetsSent++;

            try {
                const finalState = await this.sdk.waitForCondition(s => {
                    for (const msg of s.gameMessages) {
                        if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                            if (msg.text.toLowerCase().includes("can't sell this item")) {
                                return true;
                            }
                        }
                    }

                    const totalCountNow = getTotalCount(s.shop.playerItems);
                    return totalCountNow < totalCountBefore;
                }, 3000);

                for (const msg of finalState.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't sell this item to this shop")) {
                            return {
                                success: false,
                                message: totalSold > 0
                                    ? `Sold ${sellItem.name} x${totalSold} of ${requestedAmount}, then shop stopped buying`
                                    : `Shop doesn't buy ${sellItem.name}`,
                                requestedAmount,
                                amountSold: totalSold,
                                partial: totalSold > 0,
                                rejected: true,
                                reason: 'rejected',
                            };
                        }
                        if (text.includes("can't sell this item")) {
                            return {
                                success: false,
                                message: `${sellItem.name} cannot be sold`,
                                requestedAmount,
                                amountSold: totalSold,
                                partial: totalSold > 0,
                                rejected: true,
                                reason: 'rejected',
                            };
                        }
                    }
                }

                const totalCountAfter = getTotalCount(finalState.shop.playerItems);
                const soldThisRound = totalCountBefore - totalCountAfter;
                totalSold += soldThisRound;

                if (soldThisRound === 0) {
                    break;
                }

            } catch {
                break;
            }
        }

        const quantity = classifyQuantity(requestedAmount, totalSold);
        return {
            success: quantity.complete,
            message: quantity.complete
                ? `Sold ${sellItem.name} x${totalSold}`
                : totalSold === 0
                    ? `Failed to sell any ${sellItem.name}`
                    : `Sold ${sellItem.name} x${totalSold} of ${requestedAmount} requested`,
            requestedAmount,
            amountSold: totalSold,
            partial: quantity.partial,
            reason: quantity.complete ? undefined : quantity.partial ? 'partial_fill' : 'timeout',
        };
    }

    // ============ Porcelain: Bank Actions ============

    /** Open a bank booth or talk to a banker. */
    async openBank(timeout: number = 10000): Promise<OpenBankResult> {
        const bankBooth = this.sdk.getNearbyLocs()
            .filter(l => /bank booth|bank chest/i.test(l.name) && l.optionsWithIndex.length > 0)
            .sort((a, b) => a.distance - b.distance)[0] || null;

        return this.helpers.withDoorRetry(
            () => this._openBankOnce(timeout),
            (r) => r.reason === 'cant_reach',
            2,
            bankBooth ? { x: bankBooth.x, z: bankBooth.z } : undefined
        );
    }

    private async _openBankOnce(timeout: number): Promise<OpenBankResult> {
        const state = this.sdk.getState();
        if (state?.interface?.isOpen) {
            return { success: true, message: 'Bank already open' };
        }

        await this.dismissBlockingUI();

        const banker = this.sdk.findNearbyNpc(/banker/i);
        // Filter bank booths/chests to only those with usable options (excludes "Closed bank booth" etc.)
        const bankBooth = this.sdk.getNearbyLocs()
            .filter(l => /bank booth|bank chest/i.test(l.name) && l.optionsWithIndex.length > 0)
            .sort((a, b) => a.distance - b.distance)[0] || null;

        if (!banker && !bankBooth) {
            return { success: false, message: 'No banker NPC or bank booth found nearby', reason: 'no_bank_found' };
        }

        // Prefer booth over banker — booths are stationary so walkAdjacentTo
        // can reliably position around them, while bankers stand behind counters
        const target = bankBooth || banker!;
        if (target.distance > 2) {
            const walkResult = await this.walkTo(target.x, target.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach bank: ${walkResult.message}`, reason: 'cant_reach' };
            }
        }

        // Re-find targets after walking (they may have changed)
        const bankBoothNow = this.sdk.getNearbyLocs()
            .filter(l => /bank booth|bank chest/i.test(l.name) && l.optionsWithIndex.length > 0)
            .sort((a, b) => a.distance - b.distance)[0] || null;
        const bankerNow = this.sdk.findNearbyNpc(/banker/i);

        let interactSuccess = false;

        if (bankBoothNow) {
            const bankOpt = bankBoothNow.optionsWithIndex.find(o => /^bank$/i.test(o.text)) ||
                           bankBoothNow.optionsWithIndex.find(o => /use.quickly/i.test(o.text)) ||
                           bankBoothNow.optionsWithIndex.find(o => /use/i.test(o.text));
            if (bankOpt) {
                await this.sdk.sendInteractLoc(bankBoothNow.x, bankBoothNow.z, bankBoothNow.id, bankOpt.opIndex);
                interactSuccess = true;
            }
        }

        if (!interactSuccess && bankerNow) {
            const bankOpt = bankerNow.optionsWithIndex.find(o => /^bank$/i.test(o.text));
            if (bankOpt) {
                await this.sdk.sendInteractNpc(bankerNow.index, bankOpt.opIndex);
                interactSuccess = true;
            }
        }

        if (!interactSuccess) {
            return { success: false, message: 'No banker NPC or bank booth found nearby', reason: 'no_bank_found' };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                await this.sdk.waitForCondition(s => {
                    if (s.interface?.isOpen === true || s.dialog?.isOpen === true) return true;
                    // Detect "can't reach" early instead of waiting for full timeout
                    if (this.helpers.checkCantReachMessage(msgBaseline)) return true;
                    return false;
                }, Math.min(2000, timeout - (Date.now() - startTime)));

                const currentState = this.sdk.getState();

                // Check success before can't-reach — the interface may have opened
                // on a retry even if a prior attempt generated a can't-reach message
                if (currentState?.interface?.isOpen) {
                    return { success: true, message: `Bank opened (interfaceId: ${currentState.interface.interfaceId})` };
                }

                if (this.helpers.checkCantReachMessage(msgBaseline)) {
                    return { success: false, message: "Can't reach bank", reason: 'cant_reach' };
                }

                if (currentState?.dialog?.isOpen) {
                    const opt = currentState.dialog.options?.[0];
                    await this.sdk.sendClickDialog(opt?.index ?? 0);
                    await this.sdk.waitForTicks(1);
                    continue;
                }
            } catch {
                // Timeout on waitForCondition, loop will continue or exit
            }
        }

        const finalState = this.sdk.getState();
        if (finalState?.interface?.isOpen) {
            return { success: true, message: `Bank opened (interfaceId: ${finalState.interface.interfaceId})` };
        }

        return { success: false, message: 'Timeout waiting for bank interface to open', reason: 'timeout' };
    }

    /** Close any open modal interface (bank, book, quest scroll, etc.). */
    async closeInterface(timeout: number = 5000): Promise<ActionResult> {
        const state = this.sdk.getState();
        if (!state?.interface?.isOpen) {
            return { success: true, message: 'Interface already closed' };
        }

        await this.sdk.sendCloseModal();

        try {
            await this.sdk.waitForCondition(s => !s.interface?.isOpen, timeout);
            return { success: true, message: 'Interface closed' };
        } catch {
            await this.sdk.sendCloseModal();
            await this.sdk.waitForTicks(1);

            const finalState = this.sdk.getState();
            if (!finalState?.interface?.isOpen) {
                return { success: true, message: 'Interface closed (second attempt)' };
            }

            return { success: false, message: `Interface close timeout - interface.isOpen=${finalState?.interface?.isOpen}` };
        }
    }

    /** Close the bank interface. */
    async closeBank(timeout: number = 5000): Promise<ActionResult> {
        return this.closeInterface(timeout);
    }

    /**
     * Deposit an item into the bank. Use -1 for all.
     *
     * A pattern with `-1` deposits every distinct matching item: an
     * alternation like `/^(shark|burnt shark)$/i` covers both ids, not just
     * whichever matched first.
     */
    async depositItem(target: InventoryItem | string | RegExp, amount: number = -1): Promise<BankDepositResult> {
        const validated = validateActionQuantity(amount, { allowAll: true, max: MAX_BANK_ACTION_QUANTITY });
        if (!validated.valid) {
            return { success: false, message: validated.message, reason: 'invalid_amount' };
        }
        const dispatchAmount = validated.amount;

        const state = this.sdk.getState();
        if (!state?.interface?.isOpen) {
            return { success: false, message: 'Bank is not open', reason: 'bank_not_open' };
        }

        // Deposit-all with a pattern: one deposit per distinct matching id.
        if (dispatchAmount === -1 && (typeof target === 'string' || target instanceof RegExp)) {
            const pattern = typeof target === 'string' ? new RegExp(target, 'i') : target;
            const matchingIds = [...new Set(state.inventory.filter(i => pattern.test(i.name)).map(i => i.id))];
            if (matchingIds.length > 1) {
                let totalDeposited = 0;
                const names: string[] = [];
                for (const id of matchingIds) {
                    const slotItem = this.sdk.getInventory().find(i => i.id === id);
                    if (!slotItem) continue;
                    const one = await this.depositItem(slotItem, -1);
                    totalDeposited += one.amountDeposited ?? 0;
                    names.push(slotItem.name);
                    if (!one.success) {
                        return { ...one, amountDeposited: totalDeposited, message: `Deposited ${totalDeposited} across ${names.join(', ')}; stopped: ${one.message}` };
                    }
                }
                return {
                    success: true,
                    message: `Deposited ${totalDeposited} across ${names.join(', ')}`,
                    requestedAmount: totalDeposited,
                    amountDeposited: totalDeposited,
                    partial: false,
                };
            }
        }

        const item = this.helpers.resolveInventoryItem(target, /./);
        if (!item) {
            return { success: false, message: `Item not found in inventory: ${target}`, reason: 'item_not_found' };
        }

        const countBefore = countItems(state.inventory, item.id);
        const requestedAmount = dispatchAmount === -1 ? countBefore : dispatchAmount;

        await this.sdk.sendBankDeposit(item.slot, dispatchAmount);

        try {
            // Take the count from the state that satisfied the wait, not from a
            // fresh getState() that may have advanced past it.
            const finalState = await this.sdk.waitForCondition(
                s => countItems(s.inventory, item.id) < countBefore,
                5000,
            );

            const amountDeposited = Math.max(0, countBefore - countItems(finalState.inventory, item.id));
            const quantity = classifyQuantity(requestedAmount, amountDeposited);
            return {
                success: quantity.complete,
                message: quantity.complete
                    ? `Deposited ${item.name} x${amountDeposited}`
                    : `Deposited ${item.name} x${amountDeposited} of ${requestedAmount} requested`,
                requestedAmount,
                amountDeposited,
                partial: quantity.partial,
                reason: quantity.complete ? undefined : 'partial_fill',
            };
        } catch {
            return {
                success: false,
                message: `Timeout waiting for ${item.name} to be deposited`,
                requestedAmount,
                amountDeposited: 0,
                partial: false,
                reason: 'timeout',
            };
        }
    }

    /**
     * Withdraw an item from the bank by slot, name, or BankItem.
     *
     * `asNote: true` withdraws as a banknote: the note/item toggle is synced
     * first (and synced back to items on the next plain withdrawal), and
     * completion is detected on the noted item's arrival. Items the engine
     * cannot note are withdrawn unnoted with a game message; the result then
     * carries the unnoted item.
     */
    async withdrawItem(target: BankItem | string | RegExp | number, amount: number = 1, options: { asNote?: boolean } = {}): Promise<BankWithdrawResult> {
        const validated = validateActionQuantity(amount, { allowAll: true, max: MAX_BANK_ACTION_QUANTITY });
        if (!validated.valid) {
            return { success: false, message: validated.message, reason: 'invalid_amount' };
        }
        const dispatchAmount = validated.amount;

        const state = this.sdk.getState();
        if (!state?.interface?.isOpen) {
            return { success: false, message: 'Bank is not open', reason: 'bank_not_open' };
        }

        // Resolve the whole bank item, not just its slot: the item id is what
        // lets us tell how much actually arrived.
        let bankItem: BankItem | undefined;
        if (typeof target === 'number') {
            bankItem = state.bank.items.find(i => i.slot === target);
        } else if (typeof target === 'object' && 'slot' in target) {
            bankItem = state.bank.items.find(i => i.slot === target.slot && i.id === target.id)
                ?? state.bank.items.find(i => i.id === target.id);
        } else {
            bankItem = this.sdk.findBankItem(target) ?? undefined;
        }
        if (!bankItem) {
            return { success: false, message: `Bank item not found: ${target}`, reason: 'item_not_found' };
        }
        const itemId = bankItem.id;
        const itemName = bankItem.name;

        const asNote = options.asNote ?? false;
        const requestedAmount = dispatchAmount === -1 ? bankItem.count : dispatchAmount;

        // Sync the note/item toggle (varp 115, %bankcert) with what the caller
        // asked for. The toggle is sticky server-side, so a previous noted run
        // would otherwise silently change what this withdrawal produces - and
        // the id-based completion check below would time out on a noted
        // arrival it wasn't expecting.
        if (state.bank.noteMode !== asNote) {
            await this.sdk.sendClickComponent(asNote ? 5386 : 5387); // bank_main:com_93 (note) / com_94 (item)
            try {
                await this.sdk.waitForCondition(s => s.bank.noteMode === asNote, 3000);
            } catch {
                return {
                    success: false,
                    message: `Bank ${asNote ? 'note' : 'item'} withdrawal toggle did not register`,
                    requestedAmount,
                    amountWithdrawn: 0,
                    partial: false,
                    reason: 'timeout',
                };
            }
        }

        // A noted withdrawal arrives as the cert obj - a different id with the
        // same published name (ObjType.genCert copies it from the linked item),
        // so completion is tracked by name in note mode and by id otherwise.
        // Un-notable items are withdrawn unnoted by the engine (with a game
        // message), which the name-based check still observes.
        const countWithdrawn = (inv: InventoryItem[]): number => asNote
            ? inv.filter(i => i.name === itemName).reduce((sum, i) => sum + i.count, 0)
            : countItems(inv, itemId);

        const countBefore = countWithdrawn(this.sdk.getState()?.inventory ?? state.inventory);

        await this.sdk.sendBankWithdraw(bankItem.slot, dispatchAmount);

        try {
            // Track the specific item id (or name for notes). The old slot-diff
            // heuristic reported whatever happened to land in a changed slot,
            // which for a shifting inventory is not necessarily what was
            // withdrawn.
            const finalState = await this.sdk.waitForCondition(
                s => countWithdrawn(s.inventory) > countBefore,
                5000,
            );

            const amountWithdrawn = Math.max(0, countWithdrawn(finalState.inventory) - countBefore);
            const quantity = classifyQuantity(requestedAmount, amountWithdrawn);
            return {
                success: quantity.complete,
                message: quantity.complete
                    ? `Withdrew ${bankItem.name} x${amountWithdrawn}`
                    : `Withdrew ${bankItem.name} x${amountWithdrawn} of ${requestedAmount} requested`,
                // In note mode the arrival is the cert obj: same name, new id.
                item: asNote
                    ? (finalState.inventory.find(i => i.name === itemName && i.id !== itemId)
                        ?? finalState.inventory.find(i => i.name === itemName))
                    : finalState.inventory.find(i => i.id === itemId),
                requestedAmount,
                amountWithdrawn,
                partial: quantity.partial,
                reason: quantity.complete ? undefined : 'partial_fill',
            };
        } catch {
            return {
                success: false,
                message: `Timeout waiting for ${bankItem.name} to be withdrawn`,
                requestedAmount,
                amountWithdrawn: 0,
                partial: false,
                reason: 'timeout',
            };
        }
    }

    // ============ Porcelain: Player Trading ============

    /**
     * Open a trade session with another player, walking closer if needed.
     * Requesting a player who already requested you accepts their request;
     * otherwise this waits (re-requesting periodically) until they request
     * back or the timeout expires.
     *
     * The session is verified against the requested partner: a screen that
     * opens with a *different* player (their pending request racing yours)
     * is declined and the requested partner pursued until the deadline.
     *
     * `options.retryOnBusy` keeps retrying (with backoff) through "is busy
     * at the moment" refusals instead of failing on the first one.
     */
    async tradeWith(
        target: NearbyPlayer | string | RegExp,
        timeout: number = 30_000,
        options: { retryOnBusy?: boolean } = {}
    ): Promise<ActionResult> {
        await this.dismissBlockingUI();

        // Same matching semantics as findNearbyPlayer: substring for strings,
        // the pattern itself for RegExps, exact name for resolved entities.
        const matchesTarget = (name: string | null | undefined): boolean => {
            if (!name) return false;
            if (typeof target === 'object' && 'index' in target) return exactNamePattern(target.name).test(name);
            if (typeof target === 'string') return new RegExp(target, 'i').test(name);
            return target.test(name);
        };

        const open = this.sdk.getTradeState();
        if (open.isOpen) {
            if (matchesTarget(open.partner)) {
                return { success: true, message: `Trade already open with ${open.partner}` };
            }
            // A session with someone else (their request raced this call) must
            // not be silently adopted - decline it and pursue the requested
            // partner instead.
            await this.declineTrade();
        }

        const resolvePlayer = (): NearbyPlayer | null =>
            typeof target === 'object' && 'index' in target
                ? (this.sdk.getState()?.nearbyPlayers.find(p => p.index === target.index) ?? target)
                : this.sdk.findNearbyPlayer(target);

        let player = resolvePlayer();
        if (!player) {
            return { success: false, message: `Player not found nearby: ${target}`, reason: 'player_not_found' };
        }

        if (player.distance > 12) {
            await this.walkTo(player.x, player.z, 8);
            player = resolvePlayer();
            if (!player) {
                return { success: false, message: `Player left before trade could start: ${target}`, reason: 'player_not_found' };
            }
        }

        const deadline = Date.now() + timeout;
        let msgBaseline = this.helpers.getMessageTick();
        const REREQUEST_INTERVAL = 8_000;
        const BUSY_RETRY_DELAY = 3_000;

        let failReason: 'busy' | null = null;
        while (Date.now() < deadline) {
            failReason = null;
            const current = resolvePlayer();
            if (current) player = current;
            await this.sdk.sendTradeRequest(player.index);

            try {
                await this.waitForActionCondition(state => {
                    if (this.helpers.findRefusal(msgBaseline, ['is busy at the moment'])) {
                        failReason = 'busy';
                        return true;
                    }
                    return state.trade?.isOpen === true;
                }, Math.min(REREQUEST_INTERVAL, Math.max(1, deadline - Date.now())));

                if (failReason) {
                    if (options.retryOnBusy && Date.now() + BUSY_RETRY_DELAY < deadline) {
                        // Partner is mid-trade with someone else - back off and retry.
                        msgBaseline = this.helpers.getMessageTick();
                        await this.sdk.waitForCondition(
                            () => false, BUSY_RETRY_DELAY
                        ).catch(() => {});
                        continue;
                    }
                    return { success: false, message: `${player.name} is busy at the moment`, reason: failReason };
                }

                // The screen is open - but possibly with a different player
                // whose pending request the server matched first. The partner
                // label can lag the open by a tick, so give it a moment.
                let partner = this.sdk.getTradeState().partner;
                if (!partner) {
                    const settled = await this.sdk.waitForCondition(
                        s => !!s.trade?.partner || s.trade?.isOpen !== true, 2_000
                    ).catch(() => null);
                    partner = settled?.trade?.partner ?? this.sdk.getTradeState().partner;
                }
                if (!this.sdk.getTradeState().isOpen) continue; // closed while settling
                if (partner && !matchesTarget(partner)) {
                    await this.declineTrade();
                    continue; // wrong partner - keep pursuing the requested one
                }
                return { success: true, message: `Trade opened with ${partner ?? player.name}` };
            } catch {
                // No response yet - re-request and keep waiting until deadline.
            }
        }

        return { success: false, message: `No response to trade request from ${player.name}`, reason: 'no_response' };
    }

    /**
     * Place items into your side of an open trade. Each spec resolves against
     * your inventory; `amount` -1 offers all of that item (default 1).
     * Waits until the offer window reflects each addition. Adding items
     * resets both players' accepts server-side.
     */
    async offerTradeItems(items: TradeItemSpec[], timeout: number = 15_000): Promise<ActionResult> {
        const deadline = Date.now() + timeout;

        for (const spec of items) {
            const state = this.sdk.getState();
            const trade = this.sdk.getTradeState();
            if (!state || !trade.isOpen || trade.screen !== 'offer') {
                return { success: false, message: 'Trade offer screen is not open', reason: 'not_open' };
            }

            const item = this.helpers.resolveInventoryItem(spec.item, /./);
            if (!item) {
                return { success: false, message: `Item not found in inventory: ${spec.item}`, reason: 'item_not_found' };
            }

            const available = countItems(state.inventory, item.id);
            const amount = spec.amount ?? 1;
            const adding = amount === -1 ? available : Math.min(amount, available);
            const expected = countMatching(trade.myOffer, spec.item) + adding;

            const msgBaseline = this.helpers.getMessageTick();
            await this.sdk.sendOfferItem(item.slot, amount);

            try {
                let refused: string | null = null;
                await this.waitForActionCondition(s => {
                    refused = this.helpers.findRefusal(msgBaseline, ["you can't trade this item"]);
                    if (refused) return true;
                    return !!s.trade && countMatching(s.trade.myOffer, spec.item) >= expected;
                }, Math.max(1, deadline - Date.now()));
                if (refused) {
                    return { success: false, message: `${item.name} is not tradeable`, reason: 'untradeable' };
                }
            } catch {
                return { success: false, message: `Timeout offering ${item.name}`, reason: 'timeout' };
            }
        }

        return { success: true, message: `Offered ${items.length} item type(s)` };
    }

    /**
     * Accept the current trade screen and wait for observable progress:
     * the screen advancing (offer -> confirm), the trade completing, or the
     * acceptance being registered while waiting on the partner. A closed
     * screen is classified: completed (`success: true`, `data.gave` /
     * `data.received`) or declined (`success: false, reason: 'declined'`).
     */
    async acceptTrade(timeout: number = 10_000): Promise<ActionResult> {
        const before = this.sdk.getTradeState();
        if (!before.isOpen) {
            return { success: false, message: 'No trade screen is open', reason: 'not_open' };
        }
        const screenBefore = before.screen;
        const partner = before.partner ?? undefined;
        const invBefore = countInventoryById(this.sdk.getState()?.inventory ?? []);
        const msgBaseline = this.helpers.getMessageTick();
        const offers = { mine: before.myOffer, theirs: before.theirOffer };
        const deadline = Date.now() + timeout;

        await this.sdk.sendAcceptTrade();

        while (true) {
            let finalState: BotWorldState;
            try {
                finalState = await this.waitForActionCondition(s => {
                    const t = s.trade;
                    if (!t || !t.isOpen) return true;               // completed, declined, or the offer->confirm blip
                    if (t.screen !== screenBefore) return true;      // advanced to confirm
                    return t.myAccepted;                             // registered, waiting on partner
                }, Math.max(1, deadline - Date.now()));
            } catch {
                return { success: false, message: 'No visible response to accept', reason: 'timeout' };
            }

            const after = finalState.trade;
            if (after?.isOpen) {
                offers.mine = after.myOffer;
                offers.theirs = after.theirOffer;
                if (after.screen !== screenBefore) {
                    return { success: true, message: 'Advanced to confirm screen' };
                }
                return { success: true, message: 'Accepted - waiting for other player' };
            }

            // Only a persistent close is final (offer->confirm blip).
            if (!(await this.tradeClosedForGood())) continue;
            const settled = await this.classifyClosedSession(msgBaseline, partner, invBefore, offers);
            return {
                success: settled.success,
                message: settled.message,
                reason: settled.reason,
                data: { gave: settled.gave, received: settled.received, possiblyDropped: settled.possiblyDropped },
            };
        }
    }

    /**
     * Decline (close) the open trade and wait for the screen to close.
     * Retries once if the first close landed during the offer->confirm
     * transition (sendDeclineTrade refuses to send while no screen is open).
     */
    async declineTrade(timeout: number = 5_000): Promise<ActionResult> {
        const trade = this.sdk.getTradeState();
        if (!trade.isOpen) {
            return { success: true, message: 'No trade was open' };
        }
        const deadline = Date.now() + timeout;
        for (let attempt = 0; attempt < 2; attempt++) {
            await this.sdk.sendDeclineTrade();
            try {
                await this.waitForActionCondition(s => s.trade?.isOpen !== true, Math.max(1, deadline - Date.now()));
            } catch {
                return { success: false, message: 'Trade screen did not close', reason: 'timeout' };
            }
            if (await this.tradeClosedForGood()) {
                return { success: true, message: 'Trade declined' };
            }
        }
        return { success: false, message: 'Trade screen did not close', reason: 'timeout' };
    }

    /**
     * Full trade happy path with one player: open the session, offer `give`,
     * accept once the partner's offer satisfies `want` (or the `accept`
     * predicate), re-verify on the confirm screen, and report the actual
     * inventory delta.
     *
     * Any offer change resets both accepts server-side, so the offer seen at
     * accept time is the offer that reaches the confirm screen; the confirm
     * re-verification makes offer-switching structurally impossible to slip
     * past this method.
     *
     * `options.requestTimeout` (default 30 s) bounds the trade request;
     * `options.timeout` (default 60 s) bounds the open offer+confirm screens.
     * Every close is classified as completed or declined, so `success: false`
     * means nothing changed hands.
     *
     * @example
     * ```ts
     * // Pure gift (muling): give all herbs, expect nothing back
     * await bot.trade('mule01', { give: [{ item: /herb/i, amount: -1 }] });
     *
     * // Exchange: give 100 coins only if 5 lobsters are offered
     * await bot.trade('cook', {
     *   give: [{ item: 'coins', amount: 100 }],
     *   want: [{ item: 'lobster', amount: 5 }],
     * });
     * ```
     */
    async trade(target: NearbyPlayer | string | RegExp, options: TradeOptions = {}): Promise<TradeResult> {
        const timeout = options.timeout ?? 60_000;
        const requestTimeout = options.requestTimeout ?? 30_000;

        const opened = await this.tradeWith(target, requestTimeout, { retryOnBusy: options.retryOnBusy });
        const deadline = Date.now() + timeout;
        if (!opened.success) {
            return {
                success: false,
                message: opened.message,
                gave: [],
                received: [],
                reason: (opened.reason as TradeResult['reason']) ?? 'no_response',
            };
        }

        return this.runOpenTradeSession(options, deadline);
    }

    /**
     * Serve incoming trades: wait for "wishes to trade with you." requests,
     * accept ones matching the `from` filter, and run each session with the
     * shared give/want/accept policy. The receiving half of a muling setup:
     *
     * ```ts
     * // Worker:  bot.trade('mule01', { give: [{ item: /ore/i, amount: -1 }] })
     * // Mule:    bot.serveTrades({ from: /^fleet_/i, until: () => sdk.getInventory().length >= 26 })
     * ```
     *
     * This owns the bot while running - it is an explicit serving loop, not a
     * background hook, so it never fights another controller for the session.
     */
    async serveTrades(options: ServeTradesOptions = {}): Promise<ServeTradesResult> {
        const {
            from,
            onTrade,
            until,
            maxTrades,
            tradeTimeout = 60_000,
            timeout = 600_000,
        } = options;
        const deadline = Date.now() + timeout;
        const trades: TradeResult[] = [];
        // maxTrades counts COMPLETED trades: a declined/failed/empty session
        // must not consume the serving window (a lowballer would end a
        // maxTrades:1 window without anything changing hands).
        const completed = () => trades.filter(t => t.success).length;

        const fromMatches = (name: string): boolean => {
            if (!from) return true;
            if (typeof from === 'string') return name.toLowerCase().includes(from.toLowerCase());
            return from.test(name);
        };

        while (true) {
            if (until?.()) {
                return { success: true, message: `Stop condition met after ${completed()} completed trade(s) (${trades.length} session(s))`, trades, reason: 'until' };
            }
            if (maxTrades !== undefined && completed() >= maxTrades) {
                return { success: true, message: `Completed ${completed()} trade(s) (${trades.length} session(s))`, trades, reason: 'max_trades' };
            }
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                return { success: true, message: `Serving window ended after ${completed()} completed trade(s) (${trades.length} session(s))`, trades, reason: 'timeout' };
            }

            // A session can already be open (e.g. a request raced the loop).
            let sessionOpen = this.sdk.getTradeState().isOpen;
            if (sessionOpen) {
                const partner = this.sdk.getTradeState().partner;
                if (partner && !fromMatches(partner)) {
                    await this.declineTrade();
                    continue;
                }
            } else {
                // A blocking modal makes the server answer requests with "is busy".
                await this.dismissBlockingUI();
                const requester = await this.sdk.waitForTradeRequest({ timeout: Math.min(remaining, 15_000) });
                if (!requester) continue;
                if (!fromMatches(requester)) continue;

                const player = this.sdk.findNearbyPlayer(exactNamePattern(requester));
                if (!player) continue;

                await this.sdk.sendTradeRequest(player.index);
                try {
                    await this.waitForActionCondition(s => s.trade?.isOpen === true, 10_000);
                    sessionOpen = true;
                } catch {
                    continue;
                }
            }

            const result = await this.runOpenTradeSession(
                { give: options.give, want: options.want, accept: options.accept, rejectAfterMs: options.rejectAfterMs },
                Date.now() + Math.min(tradeTimeout, Math.max(1, deadline - Date.now()))
            );
            trades.push(result);
            onTrade?.(result);
        }
    }

    /**
     * Drive an already-open trade session to completion: offer, accept with
     * re-accept on partner offer changes, confirm-screen re-verification,
     * and inventory-delta reporting.
     */
    private async runOpenTradeSession(options: TradeOptions, deadline: number): Promise<TradeResult> {
        const want = options.want ?? [];
        const acceptOffer = options.accept ?? ((offer: TradeItem[]) => offerSatisfies(want, offer));
        // Evaluate the accept policy when the partner's visible offer changes,
        // plus a periodic re-check - re-running a user predicate every tick
        // floods the console (a logging predicate produced hundreds of lines
        // per session), but never re-running it would strand predicates that
        // depend on external state (time, inventory) on an unchanged offer.
        const REEVAL_INTERVAL_MS = 2_000;
        let lastOfferKey: string | null = null;
        let lastOfferDecision = false;
        let lastEvalAt = 0;
        const offerAcceptable = (theirOffer: TradeItem[]): boolean => {
            const key = JSON.stringify(theirOffer.map(i => [i.id, i.count]));
            if (key !== lastOfferKey || Date.now() - lastEvalAt >= REEVAL_INTERVAL_MS) {
                lastOfferKey = key;
                lastEvalAt = Date.now();
                lastOfferDecision = acceptOffer(theirOffer);
            }
            return lastOfferDecision;
        };
        // rejectAfterMs bounds how long an unacceptable offer may occupy the
        // screen; without it a non-buyer holds the session until the timeout.
        const rejectDeadline = options.rejectAfterMs !== undefined ? Date.now() + options.rejectAfterMs : Infinity;
        const startState = this.sdk.getState();
        const partner = this.sdk.getTradeState().partner ?? undefined;
        const invBefore = countInventoryById(startState?.inventory ?? []);
        const sessionBaseline = this.helpers.getMessageTick();
        // Last offers seen while the screen was open (see classifyClosedSession).
        const offers = { mine: [] as TradeItem[], theirs: [] as TradeItem[] };
        const noteOffers = (t: TradeState) => {
            if (t.isOpen) { offers.mine = t.myOffer; offers.theirs = t.theirOffer; }
        };
        noteOffers(this.sdk.getTradeState());

        // Our decline can race the partner's accept, so re-classify after it.
        const fail = async (message: string, reason: TradeResult['reason'], decline: boolean): Promise<TradeResult> => {
            if (decline) {
                const declined = await this.declineTrade();
                const settled = await this.classifyClosedSession(sessionBaseline, partner, invBefore, offers);
                if (settled.success) {
                    return { ...settled, message: `${settled.message} (completed as the decline landed: ${message})` };
                }
                if (!declined.success) {
                    message = `${message}; ${declined.message}`;
                }
            }
            return { success: false, message, partner, gave: [], received: [], reason };
        };

        // 1. Put our items in.
        if (options.give?.length) {
            const offered = await this.offerTradeItems(options.give, Math.max(1, deadline - Date.now()));
            noteOffers(this.sdk.getTradeState());
            if (!offered.success) {
                if (!this.sdk.getTradeState().isOpen) {
                    return this.classifyClosedSession(sessionBaseline, partner, invBefore, offers);
                }
                return fail(offered.message, 'offer_failed', true);
            }
        }

        // Accept retries are gated on tick advancement, never on "any state
        // change": every executed action publishes a snapshot with an
        // unchanged tick, so a state-change wait resolves instantly against
        // stale data and floods the engine's per-tick packet budget. That
        // backlogs this client's own update stream by whole minutes - the
        // trade advances server-side while both clients read stale screens.
        const waitForNextTick = async () => {
            const tick = this.sdk.getState()?.tick ?? 0;
            await this.sdk.waitForCondition(
                s => s.tick > tick,
                Math.min(2_000, Math.max(1, deadline - Date.now()))
            ).catch(() => {});
        };

        // 2. Offer screen: accept whenever the partner's visible offer passes
        // the policy. A partner offer change resets accepts server-side, so
        // loop until the screen advances.
        let lastAcceptTick = -1;
        while (true) {
            if (Date.now() >= deadline) {
                return fail('Trade timed out on the offer screen', 'timeout', true);
            }
            const trade = this.sdk.getTradeState();
            if (!trade.isOpen) {
                if (await this.tradeClosedForGood()) {
                    return this.classifyClosedSession(sessionBaseline, partner, invBefore, offers);
                }
                continue; // transition blip - the confirm screen is opening
            }
            noteOffers(trade);
            if (trade.screen === 'confirm') break;

            const acceptable = offerAcceptable(trade.theirOffer);
            if (!acceptable && Date.now() >= rejectDeadline) {
                return fail(
                    `Partner's offer still unacceptable after ${options.rejectAfterMs}ms - declined`,
                    'want_not_met',
                    true
                );
            }
            const tick = this.sdk.getState()?.tick ?? 0;
            if (acceptable && !trade.myAccepted && tick !== lastAcceptTick) {
                lastAcceptTick = tick;
                await this.sdk.sendAcceptTrade();
            }
            await waitForNextTick();
        }

        // 3. Confirm screen: the offers here are final. Re-verify before the
        // irreversible accept.
        {
            const confirm = this.sdk.getTradeState();
            if (!acceptOffer(confirm.theirOffer)) {
                const missing = missingFromOffer(want, confirm.theirOffer)
                    .map(spec => `${spec.item}${spec.amount && spec.amount > 1 ? ` x${spec.amount}` : ''}`)
                    .join(', ');
                return fail(
                    `Partner's final offer does not satisfy requirements${missing ? ` (missing: ${missing})` : ''} - declined`,
                    'want_not_met',
                    true
                );
            }
        }

        lastAcceptTick = -1;
        while (true) {
            if (Date.now() >= deadline) {
                return fail('Trade timed out on the confirm screen', 'timeout', true);
            }
            const trade = this.sdk.getTradeState();
            if (!trade.isOpen) {
                if (await this.tradeClosedForGood()) {
                    return this.classifyClosedSession(sessionBaseline, partner, invBefore, offers);
                }
                continue;
            }
            noteOffers(trade);
            if (trade.screen !== 'confirm') {
                // Back on the offer screen: only possible if this session was
                // re-entered mid-transition; let the offer-screen rules apply.
                return fail('Trade returned to the offer screen unexpectedly', 'error', true);
            }
            const tick = this.sdk.getState()?.tick ?? 0;
            if (!trade.myAccepted && tick !== lastAcceptTick) {
                lastAcceptTick = tick;
                await this.sdk.sendAcceptTrade();
            }
            await waitForNextTick();
        }
    }

    /**
     * True once "no trade open" has persisted for two game ticks. The engine
     * closes the side modal with an IfClose packet before opening the confirm
     * screen (Player.openMainModal), so a single snapshot showing no trade is
     * not proof the session ended - it can be the offer->confirm transition.
     */
    private async tradeClosedForGood(): Promise<boolean> {
        for (let i = 0; i < 2; i++) {
            if (this.sdk.getTradeState().isOpen) return false;
            await this.sdk.waitForTicks(1).catch(() => {});
        }
        return !this.sdk.getTradeState().isOpen;
    }

    /**
     * Once the trade screen has closed, decide whether the trade completed
     * or was declined, and report the inventory delta for a completion.
     *
     * Primary signal is the "Accepted trade." message; fallback is our
     * offered items still being gone from the inventory two ticks after close.
     */
    private async classifyClosedSession(
        sessionBaseline: number,
        partner: string | undefined,
        invBefore: Map<number, { name: string; count: number }>,
        offers: { mine: TradeItem[]; theirs: TradeItem[] } = { mine: [], theirs: [] }
    ): Promise<TradeResult> {
        // Let the post-trade inventory update land before diffing.
        await this.sdk.waitForTicks(1).catch(() => {});

        const declined = this.helpers.findRefusal(sessionBaseline, ['declined trade']);
        const noSpace = this.helpers.findRefusal(sessionBaseline, ['enough inventory space']);
        let accepted = this.helpers.findRefusal(sessionBaseline, ['accepted trade']);
        let inferred = false;

        const diff = () => diffInventories(invBefore, countInventoryById(this.sdk.getState()?.inventory ?? []));
        let { gained, lost } = diff();

        const offerGone = () => offers.mine.length > 0 && shortfall(offers.mine, lost).length === 0;
        if (!accepted && !declined && !noSpace && offerGone()) {
            await this.sdk.waitForTicks(1).catch(() => {});
            ({ gained, lost } = diff());
            if (offerGone()) {
                accepted = 'inferred';
                inferred = true;
            }
        }

        if (accepted) {
            // The post-trade inventory update can land a tick or two behind
            // the close - don't report received items as missing (or the
            // received list as empty) while the delta is still in flight.
            for (let i = 0; i < 2 && shortfall(offers.theirs, gained).length > 0; i++) {
                await this.sdk.waitForTicks(1).catch(() => {});
                ({ gained, lost } = diff());
            }
            const gaveText = lost.length ? lost.map(i => `${i.name} x${i.count}`).join(', ') : 'nothing';
            const receivedText = gained.length ? gained.map(i => `${i.name} x${i.count}`).join(', ') : 'nothing';
            let message = `Trade completed with ${partner ?? 'partner'}: gave ${gaveText}, received ${receivedText}`;
            if (inferred) message += ' (inferred from inventory: "Accepted trade." message not seen)';

            // Overflow at completion is dropped on the ground, not refused.
            const possiblyDropped = shortfall(offers.theirs, gained);
            if (possiblyDropped.length) {
                message += `; ${possiblyDropped.map(i => `${i.name} x${i.count}`).join(', ')} shown in their final offer did not reach your inventory — check the ground under you (inventory full?)`;
                return { success: true, message, partner, gave: lost, received: gained, possiblyDropped };
            }
            return { success: true, message, partner, gave: lost, received: gained };
        }
        if (noSpace) {
            return { success: false, message: noSpace, partner, gave: [], received: [], reason: 'no_space' };
        }
        return {
            success: false,
            message: declined ?? 'Trade screen closed before completion',
            partner,
            gave: [],
            received: [],
            reason: 'declined',
        };
    }

    // ============ Porcelain: Equipment & Combat ============

    /** Equip an item from inventory. */
    async equipItem(target: InventoryItem | string | RegExp): Promise<EquipResult> {
        await this.dismissBlockingUI();

        const item = this.helpers.resolveInventoryItem(target, /./);
        if (!item) {
            return { success: false, message: `Item not found: ${target}` };
        }

        const equipOpt = item.optionsWithIndex.find(o => /wield|wear|equip/i.test(o.text));
        if (!equipOpt) {
            return { success: false, message: `No equip option on ${item.name}` };
        }

        // Whether an identical item was already worn - if so, its presence in
        // the equipment can't serve as arrival evidence below.
        const equippedBefore = this.sdk.getEquipment().some(e => e.id === item.id);

        const result = await this.sdk.sendUseItem(item.slot, equipOpt.opIndex);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            await this.sdk.waitForCondition(state =>
                !state.inventory.find(i => i.slot === item.slot && i.id === item.id) ||
                (!equippedBefore && state.equipment.some(e => e.id === item.id)),
                5000
            );
            return { success: true, message: `Equipped ${item.name}` };
        } catch {
            // The equip can round-trip after the wait expires - the item
            // showing up worn is still proof it landed.
            if (!equippedBefore && this.sdk.getEquipment().some(e => e.id === item.id)) {
                return { success: true, message: `Equipped ${item.name}` };
            }
            return { success: false, message: `Failed to equip ${item.name}` };
        }
    }

    /** Unequip an item to inventory. */
    async unequipItem(target: InventoryItem | string | RegExp): Promise<UnequipResult> {
        await this.dismissBlockingUI();

        let item: InventoryItem | null = null;
        if (typeof target === 'object' && 'slot' in target) {
            item = target;
        } else {
            item = this.sdk.findEquipmentItem(target);
        }

        if (!item) {
            return { success: false, message: `Item not found in equipment: ${target}` };
        }

        const invCountBefore = this.sdk.getInventory().length;
        const result = await this.sdk.sendUseEquipmentItem(item.slot, 1);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            await this.sdk.waitForCondition(state =>
                state.inventory.length > invCountBefore ||
                state.inventory.some(i => i.id === item!.id),
                5000
            );

            const unequippedItem = this.sdk.findInventoryItem(new RegExp(item.name, 'i'));
            return { success: true, message: `Unequipped ${item.name}`, item: unequippedItem || undefined };
        } catch {
            return { success: false, message: `Failed to unequip ${item.name}` };
        }
    }

    /** Get all currently equipped items. */
    getEquipment(): InventoryItem[] {
        return this.sdk.getEquipment();
    }

    /** Find an equipped item by name pattern. */
    findEquippedItem(pattern: string | RegExp): InventoryItem | null {
        return this.sdk.findEquipmentItem(pattern);
    }

    /** Eat food to restore hitpoints. */
    async eatFood(target: InventoryItem | string | RegExp): Promise<EatResult> {
        await this.dismissBlockingUI();

        const food = this.helpers.resolveInventoryItem(target, /./);
        if (!food) {
            return { success: false, hpGained: 0, message: `Food not found: ${target}` };
        }

        const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
        if (!eatOpt) {
            return { success: false, hpGained: 0, message: `No eat option on ${food.name}` };
        }

        const hpBefore = this.sdk.getSkill('Hitpoints')?.level ?? 10;
        const foodCountBefore = this.sdk.getInventory().filter(i => i.id === food.id).length;

        const result = await this.sdk.sendUseItem(food.slot, eatOpt.opIndex);
        if (!result.success) {
            return { success: false, hpGained: 0, message: result.message };
        }

        try {
            await this.sdk.waitForCondition(state => {
                const hp = state.skills.find(s => s.name === 'Hitpoints')?.level ?? 10;
                const foodCount = state.inventory.filter(i => i.id === food.id).length;
                return hp > hpBefore || foodCount < foodCountBefore;
            }, 5000);

            const hpAfter = this.sdk.getSkill('Hitpoints')?.level ?? 10;
            return { success: true, hpGained: hpAfter - hpBefore, message: `Ate ${food.name}` };
        } catch {
            return { success: false, hpGained: 0, message: `Failed to eat ${food.name}` };
        }
    }

    /**
     * Attack an NPC or another player, walking to the target if needed.
     *
     * Takes either an entity (from `sdk.findNearbyNpc`/`sdk.findNearbyPlayer`) or
     * a name/pattern, matched against NPCs first and players second - so pass the
     * entity when a player shares a name with a monster.
     *
     * ```ts
     * await bot.attack(/^chicken$/i);
     * await bot.attack(sdk.findNearbyPlayer('Zezima')!);
     * ```
     *
     * PvP attacks are refused outside the wilderness and across too big a level
     * gap; those come back as `reason: 'not_attackable'` with the server's own
     * wording in `message`.
     */
    async attack(target: CombatTarget, timeout: number = 5000): Promise<AttackResult> {
        await this.dismissBlockingUI();

        const entity = this.helpers.resolveCombatTarget(target);
        if (!entity) {
            return { success: false, message: `Target not found: ${target}`, reason: 'npc_not_found' };
        }
        return entity.kind === 'player'
            ? this.attackPlayerEntity(entity, timeout)
            : this.attackNpcEntity(entity, timeout);
    }

    /** Attack another player (OPPLAYER2). Prefer {@link attack}, which also takes NPCs. */
    async attackPlayer(target: NearbyPlayer | string | RegExp, timeout: number = 5000): Promise<AttackResult> {
        await this.dismissBlockingUI();

        const player = typeof target === 'object' && 'index' in target
            ? target
            : this.sdk.findNearbyPlayer(target);
        if (!player) {
            return { success: false, message: `Player not found: ${target}`, reason: 'npc_not_found' };
        }
        return this.attackPlayerEntity(player, timeout);
    }

    private async attackNpcEntity(npc: NearbyNpc, timeout: number): Promise<AttackResult> {
        const targetType = 'npc' as const;

        // Sanity check: NPC coordinates should be within reasonable distance of player
        // If coords are wildly off, the NPC data is corrupted
        const state = this.sdk.getState();
        if (state?.player) {
            const coordDist = Math.sqrt(
                Math.pow(npc.x - state.player.worldX, 2) + Math.pow(npc.z - state.player.worldZ, 2)
            );
            // If calculated coord distance is way more than reported distance, coords are bad
            // Allow tolerance of 5 tiles for small distances (handles distance=0 edge case)
            if (coordDist > 200 || (npc.distance > 0 && npc.distance < 50 && coordDist > Math.max(5, npc.distance * 3))) {
                return { success: false, message: `NPC "${npc.name}" has invalid coordinates`, reason: 'npc_not_found', targetType };
            }
        }

        const attackOpt = npc.optionsWithIndex.find(o => /attack/i.test(o.text));
        if (!attackOpt) {
            return { success: false, message: `No attack option on ${npc.name}`, reason: 'no_attack_option', targetType };
        }

        // Walk near NPC first - this handles doors
        if (npc.distance > 2) {
            const walkResult = await this.walkTo(npc.x, npc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${npc.name}: ${walkResult.message}`, reason: 'out_of_reach', targetType };
            }
        }

        const startState = this.sdk.getState();
        const startTick = startState?.tick || 0;
        const startRevision = startState?.revision ?? startTick;
        const startLifeId = startState?.player?.lifeId;
        const eventAfterStart = (event: { tick: number; observationId?: number }) =>
            (event.observationId ?? event.tick) > startRevision;
        const msgBaseline = this.helpers.getMessageTick();
        const result = await this.sdk.sendInteractNpc(npc.index, attackOpt.opIndex);
        if (!result.success) {
            return {
                success: false,
                message: result.message,
                reason: result.reason === 'cant_reach' ? 'out_of_reach' : 'timeout',
                targetType
            };
        }

        try {
            const finalState = await this.waitForActionCondition(state => {
                if (this.helpers.findRefusal(msgBaseline, ALREADY_FIGHTING_REFUSALS) ||
                    this.helpers.checkCantReachMessage(msgBaseline)) {
                    return true;
                }

                const targetNpc = state.nearbyNpcs.find(n => n.index === npc.index);
                if (!targetNpc) {
                    return true;
                }

                if (state.player?.isDead || (startLifeId !== undefined && state.player?.lifeId !== startLifeId)) {
                    return true;
                }

                if (state.player?.combat.inCombat &&
                    state.player.combat.targetType === 'npc' &&
                    state.player.combat.targetIndex === npc.index) {
                    return true;
                }

                return state.combatEvents.some(event =>
                    eventAfterStart(event) &&
                    event.type === 'damage_dealt' &&
                    event.targetType === 'npc' &&
                    event.targetIndex === npc.index
                );
            }, timeout);

            if (finalState.player?.isDead ||
                (startLifeId !== undefined && finalState.player?.lifeId !== startLifeId)) {
                return { success: false, message: `Died while attacking ${npc.name}`, reason: 'died', targetType };
            }

            const engagedRequestedTarget =
                (finalState.player?.combat.inCombat &&
                    finalState.player.combat.targetType === 'npc' &&
                    finalState.player.combat.targetIndex === npc.index) ||
                finalState.combatEvents.some(event =>
                    eventAfterStart(event) &&
                    event.type === 'damage_dealt' &&
                    event.targetType === 'npc' &&
                    event.targetIndex === npc.index
                );

            if (this.helpers.checkCantReachMessage(msgBaseline)) {
                return { success: false, message: `Cannot reach ${npc.name}`, reason: 'out_of_reach', targetType };
            }

            if (this.helpers.findRefusal(msgBaseline, ALREADY_FIGHTING_REFUSALS)) {
                // "I'm already under attack!" can race with a successful
                // engagement. Only requested-target evidence can turn this
                // refusal into success.
                if (engagedRequestedTarget) {
                    return { success: true, message: `Already fighting ${npc.name}`, targetType };
                }
                return { success: false, message: `${npc.name} is already in combat`, reason: 'already_in_combat', targetType };
            }

            if (engagedRequestedTarget) {
                return { success: true, message: `Attacking ${npc.name}`, targetType };
            }

            const targetStillVisible = finalState.nearbyNpcs.some(candidate => candidate.index === npc.index);
            return targetStillVisible
                ? { success: false, message: `No combat effect observed for ${npc.name}`, reason: 'timeout', targetType }
                : { success: false, message: `${npc.name} disappeared before combat was observed`, reason: 'npc_not_found', targetType };
        } catch {
            return { success: false, message: `Timeout waiting to attack ${npc.name}`, reason: 'timeout', targetType };
        }
    }

    /**
     * Attack a resolved player with OPPLAYER2, the option `[opplayer2,_]` in
     * pvp_combat.rs2 handles. Evidence is the same shape as for NPCs - engagement
     * or a damage splat on the requested target - plus the PvP refusals, which
     * arrive as ordinary game messages and otherwise look like a silent no-op.
     */
    private async attackPlayerEntity(player: NearbyPlayer, timeout: number): Promise<AttackResult> {
        const targetType = 'player' as const;

        // Walk near the target first - this handles doors. Players move, so this
        // only closes the gap; the server routes the last step from the packet.
        if (player.distance > 2) {
            const walkResult = await this.walkTo(player.x, player.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${player.name}: ${walkResult.message}`, reason: 'out_of_reach', targetType };
            }
        }

        const startState = this.sdk.getState();
        const startTick = startState?.tick || 0;
        const startRevision = startState?.revision ?? startTick;
        const startLifeId = startState?.player?.lifeId;
        const eventAfterStart = (event: { tick: number; observationId?: number }) =>
            (event.observationId ?? event.tick) > startRevision;
        const msgBaseline = this.helpers.getMessageTick();

        const engaged = (state: NonNullable<ReturnType<BotSDK['getState']>>) =>
            (state.player?.combat.inCombat === true &&
                state.player.combat.targetType === 'player' &&
                state.player.combat.targetIndex === player.index) ||
            state.combatEvents.some(event =>
                eventAfterStart(event) &&
                event.type === 'damage_dealt' &&
                event.targetType === 'other_player' &&
                event.targetIndex === player.index
            );

        const result = await this.sdk.sendInteractPlayer(player.index, 2);
        if (!result.success) {
            return {
                success: false,
                message: result.message,
                reason: result.reason === 'cant_reach' ? 'out_of_reach' : 'timeout',
                targetType
            };
        }

        try {
            const finalState = await this.waitForActionCondition(state => {
                if (this.helpers.findPvpRefusal(msgBaseline)) return true;

                for (const msg of state.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline) &&
                        msg.text.toLowerCase().includes("can't reach")) {
                        return true;
                    }
                }

                if (state.player?.isDead || (startLifeId !== undefined && state.player?.lifeId !== startLifeId)) {
                    return true;
                }

                // Target logged out or ran out of view
                if (!state.nearbyPlayers.some(candidate => candidate.index === player.index)) {
                    return true;
                }

                return engaged(state);
            }, timeout);

            if (finalState.player?.isDead ||
                (startLifeId !== undefined && finalState.player?.lifeId !== startLifeId)) {
                return { success: false, message: `Died while attacking ${player.name}`, reason: 'died', targetType };
            }

            const engagedRequestedTarget = engaged(finalState);

            const refusal = this.helpers.findPvpRefusal(msgBaseline);
            if (refusal) {
                // Auto-retaliate can land a hit in the same tick the server
                // refuses the manual attack; only requested-target evidence
                // turns the refusal into success.
                if (engagedRequestedTarget) {
                    return { success: true, message: `Already fighting ${player.name}`, targetType };
                }
                const alreadyFighting = ALREADY_FIGHTING_REFUSALS.some(text => refusal.toLowerCase().includes(text));
                return {
                    success: false,
                    message: `Cannot attack ${player.name}: ${refusal}`,
                    reason: alreadyFighting ? 'already_in_combat' : 'not_attackable',
                    targetType
                };
            }

            if (this.helpers.checkCantReachMessage(msgBaseline)) {
                return { success: false, message: `Cannot reach ${player.name}`, reason: 'out_of_reach', targetType };
            }

            if (engagedRequestedTarget) {
                return { success: true, message: `Attacking ${player.name}`, targetType };
            }

            const targetStillVisible = finalState.nearbyPlayers.some(candidate => candidate.index === player.index);
            return targetStillVisible
                ? { success: false, message: `No combat effect observed for ${player.name}`, reason: 'timeout', targetType }
                : { success: false, message: `${player.name} left before combat was observed`, reason: 'npc_not_found', targetType };
        } catch {
            return { success: false, message: `Timeout waiting to attack ${player.name}`, reason: 'timeout', targetType };
        }
    }

    /**
     * Cast a combat spell on an NPC or another player.
     *
     * The two are the same action to the server (OPNPCT vs OPPLAYERT), so this
     * takes either: an entity from `sdk.findNearbyNpc`/`sdk.findNearbyPlayer`, or
     * a name/pattern matched against NPCs first and players second.
     *
     * ```ts
     * await bot.castSpell('goblin', Spells.WIND_STRIKE);
     * await bot.castSpell(sdk.findNearbyPlayer('Zezima')!, Spells.FIRE_STRIKE);
     * ```
     *
     * Magic XP is the evidence of a cast landing, so a splash still counts as
     * success with `hit: false`.
     */
    async castSpell(target: CombatTarget, spellComponent: number | string, timeout: number = 3000): Promise<CastSpellResult> {
        const resolvedSpell = this.resolveSpellComponent(spellComponent);
        if (resolvedSpell === null) {
            return { success: false, message: `Unknown spell: ${spellComponent} - pass a component id (Spells.WIND_STRIKE = 1152) or a known combat spell name`, reason: 'unknown_spell' };
        }
        await this.dismissBlockingUI();

        const entity = this.helpers.resolveCombatTarget(target);
        if (!entity) {
            return { success: false, message: `Target not found: ${target}`, reason: 'npc_not_found' };
        }
        return this.castSpellOnEntity(entity, resolvedSpell, timeout);
    }

    /** Cast a combat spell on another player (OPPLAYERT). Prefer {@link castSpell}. */
    async castSpellOnPlayer(target: NearbyPlayer | string | RegExp, spellComponent: number | string, timeout: number = 3000): Promise<CastSpellResult> {
        const resolvedSpell = this.resolveSpellComponent(spellComponent);
        if (resolvedSpell === null) {
            return { success: false, message: `Unknown spell: ${spellComponent} - pass a component id (Spells.WIND_STRIKE = 1152) or a known combat spell name`, reason: 'unknown_spell' };
        }
        await this.dismissBlockingUI();

        const player = typeof target === 'object' && 'index' in target
            ? target
            : this.sdk.findNearbyPlayer(target);
        if (!player) {
            return { success: false, message: `Player not found: ${target}`, reason: 'npc_not_found' };
        }
        return this.castSpellOnEntity(player, resolvedSpell, timeout);
    }

    /**
     * A string spell used to be accepted and silently cast nothing —
     * castSpell reported 16 "successful" casts with no runes consumed.
     * Resolve known combat-spell names; reject anything else loudly.
     */
    private resolveSpellComponent(spell: number | string): number | null {
        if (typeof spell === 'number' && Number.isFinite(spell)) return spell;
        if (typeof spell === 'string') {
            return BotActions.SPELL_COMPONENTS[spell.toLowerCase().trim().replace(/[\s_-]+/g, ' ')] ?? null;
        }
        return null;
    }

    private static readonly SPELL_COMPONENTS: Record<string, number> = {
        'wind strike': 1152,
        'confuse': 1153,
        'water strike': 1154,
        'earth strike': 1156,
        'weaken': 1157,
        'fire strike': 1158,
        'wind bolt': 1160,
        'curse': 1161,
        'water bolt': 1163,
        'earth bolt': 1166,
        'fire bolt': 1169,
        'wind blast': 1172,
        'water blast': 1175,
        'earth blast': 1177,
        'fire blast': 1181,
        'wind wave': 1183,
        'water wave': 1185,
        'earth wave': 1188,
        'fire wave': 1189,
        'bind': 1572,
    };

    private async castSpellOnEntity(
        entity: NearbyNpc | NearbyPlayer,
        spellComponent: number,
        timeout: number
    ): Promise<CastSpellResult> {
        const targetType = entity.kind === 'player' ? 'player' : 'npc';

        const startState = this.sdk.getState();
        if (!startState) {
            return { success: false, message: 'No game state available', targetType };
        }
        const msgBaseline = this.helpers.getMessageTick();
        const startMagicXp = startState.skills.find(s => s.name === 'Magic')?.experience ?? 0;
        // A real splash still consumes runes. No XP AND no inventory change
        // means the client never dispatched (e.g. unreachable target) - that
        // must not be reported as a splash. With no inventory data at all we
        // can't disprove a cast, so give the splash the benefit of the doubt.
        const invBefore = this.helpers.inventorySignature(startState);
        const runesConsumed = (): boolean =>
            invBefore === '' ||
            this.helpers.inventorySignature(this.sdk.getState()) !== invBefore;

        const result = await this.sdk.sendSpellOnTarget(entity, spellComponent);
        if (!result.success) {
            return { success: false, message: result.message, targetType };
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                if (this.helpers.checkCantReachMessage(msgBaseline) ||
                    this.helpers.findRefusal(msgBaseline, NO_RUNES_REFUSALS) ||
                    this.helpers.findPvpRefusal(msgBaseline)) {
                    return true;
                }

                const currentMagicXp = state.skills.find(s => s.name === 'Magic')?.experience ?? 0;
                if (currentMagicXp > startMagicXp) {
                    return true;
                }

                return false;
            }, timeout);

            // Check for "not enough runes" first
            if (this.helpers.findRefusal(msgBaseline, NO_RUNES_REFUSALS)) {
                return { success: false, message: `Not enough runes to cast spell`, reason: 'no_runes', targetType };
            }

            const refusal = this.helpers.findPvpRefusal(msgBaseline);
            if (refusal) {
                return { success: false, message: `Cannot cast on ${entity.name}: ${refusal}`, reason: 'not_attackable', targetType };
            }

            if (this.helpers.checkCantReachMessage(msgBaseline)) {
                return { success: false, message: `Cannot reach ${entity.name} - obstacle in the way`, reason: 'out_of_reach', targetType };
            }

            const finalMagicXp = finalState.skills.find(s => s.name === 'Magic')?.experience ?? 0;
            const xpGained = finalMagicXp - startMagicXp;
            if (xpGained > 0) {
                return { success: true, message: `Hit ${entity.name} for ${xpGained} Magic XP`, hit: true, xpGained, targetType };
            }

            if (!runesConsumed()) {
                return { success: false, message: `No evidence ${entity.name} was cast on - no XP, no runes consumed (unreachable target?)`, reason: 'out_of_reach', targetType };
            }
            return { success: true, message: `Splashed on ${entity.name}`, hit: false, xpGained: 0, targetType };
        } catch {
            if (this.helpers.checkCantReachMessage(msgBaseline)) {
                return { success: false, message: `Cannot reach ${entity.name} - obstacle in the way`, reason: 'out_of_reach', targetType };
            }
            if (!runesConsumed()) {
                return { success: false, message: `No evidence ${entity.name} was cast on - no XP, no runes consumed (unreachable target?)`, reason: 'out_of_reach', targetType };
            }
            return { success: true, message: `Splashed on ${entity.name} (timeout)`, hit: false, xpGained: 0, targetType };
        }
    }

    // ============ Porcelain: Condition Helpers ============

    /** Wait until a skill reaches a target level. */
    async waitForSkillLevel(skillName: string, targetLevel: number, timeout: number = 60000): Promise<SkillState> {
        const state = await this.sdk.waitForCondition(s => {
            const skill = s.skills.find(sk => sk.name.toLowerCase() === skillName.toLowerCase());
            return skill !== undefined && skill.baseLevel >= targetLevel;
        }, timeout);

        return state.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase())!;
    }

    /** Wait until an item appears in inventory. */
    async waitForInventoryItem(pattern: string | RegExp, timeout: number = 30000): Promise<InventoryItem> {
        const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;

        const state = await this.sdk.waitForCondition(s =>
            s.inventory.some(i => regex.test(i.name)),
            timeout
        );

        return state.inventory.find(i => regex.test(i.name))!;
    }

    /** Wait for dialog to close. */
    async waitForDialogClose(timeout: number = 30000): Promise<void> {
        await this.sdk.waitForCondition(s => !s.dialog.isOpen, timeout);
    }

    /** Wait for player to stop moving. */
    async waitForIdle(timeout: number = 10000): Promise<void> {
        const initialState = this.sdk.getState();
        if (!initialState?.player) {
            throw new Error('No player state');
        }

        const initialX = initialState.player.x;
        const initialZ = initialState.player.z;

        await this.sdk.waitForStateChange(timeout);

        await this.sdk.waitForCondition(state => {
            if (!state.player) return false;
            return state.player.x === initialX && state.player.z === initialZ;
        }, timeout);
    }

    // ============ Porcelain: Sequences ============

    async navigateDialog(choices: (number | string | RegExp)[]): Promise<void> {
        for (const choice of choices) {
            const dialog = this.sdk.getDialog();
            let optionIndex: number;

            if (typeof choice === 'number') {
                optionIndex = choice;
            } else {
                const regex = typeof choice === 'string' ? new RegExp(choice, 'i') : choice;
                const match = dialog?.options.find(o => regex.test(o.text));
                if (!match) {
                    const available = dialog?.options.map(o => `"${o.text}"`).join(', ') || 'none';
                    console.warn(`[navigateDialog] No option matching ${regex} — available: ${available}`);
                    continue;
                }
                optionIndex = match.index;
            }

            await this.sdk.sendClickDialog(optionIndex);
            await this.sdk.waitForTicks(1);
        }
    }

    // ============ Crafting & Fletching ============

    /**
     * Fletch logs into bows or arrow shafts using a knife.
     *
     * `product` is matched against the dialog's visible product labels
     * ("15 Arrow Shafts", "Oak Short Bow", ...), so 'arrow shaft', 'shortbow'
     * and 'oak long' all resolve. Omit it to take the first product offered.
     * One call makes one batch — 15 shafts, or one bow.
     */
    async fletchLogs(product?: string): Promise<FletchResult> {
        await this.dismissBlockingUI();

        // dismissBlockingUI deliberately leaves shop/bank modals alone, but the
        // server hides the inventory component behind them: the use-item packet
        // is dropped as "not visible" with no message at all, and the wait below
        // would then match the modal that was already open. Fail loudly instead.
        const preState = this.sdk.getState();
        if (preState?.shop.isOpen || preState?.bank.isOpen) {
            const blocker = preState.shop.isOpen ? 'shop' : 'bank';
            return {
                success: false,
                message: `Cannot fletch with the ${blocker} interface open - close it first (bot.closeInterface()).`
            };
        }

        const knife = this.sdk.findInventoryItem(/knife/i);
        if (!knife) {
            return { success: false, message: 'No knife in inventory' };
        }

        const logs = this.sdk.findInventoryItem(/logs/i);
        if (!logs) {
            return { success: false, message: 'No logs in inventory' };
        }

        const fletchingBefore = this.sdk.getSkill('Fletching')?.experience || 0;
        const msgBaseline = this.helpers.getMessageTick();

        // Use knife on logs to open fletching dialog
        const result = await this.sdk.sendUseItemOnItem(knife.slot, logs.slot);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for dialog/interface to open
        try {
            await this.sdk.waitForCondition(
                s => s.dialog.isOpen || s.interface?.isOpen,
                5000
            );
        } catch {
            return { success: false, message: 'Fletching dialog did not open' };
        }

        // Handle product selection and crafting
        const MAX_ATTEMPTS = 30;
        let buttonClicked = false;
        let chosenLabel: string | undefined;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const state = this.sdk.getState();
            if (!state) {
                return { success: false, message: 'Lost game state' };
            }

            // Check if XP was gained (success!)
            const currentXp = state.skills.find(s => s.name === 'Fletching')?.experience || 0;
            if (currentXp > fletchingBefore) {
                return {
                    success: true,
                    message: chosenLabel ? `Fletched ${chosenLabel}` : 'Fletched logs successfully',
                    xpGained: currentXp - fletchingBefore,
                    product: this.findFletchedProduct(chosenLabel) || undefined
                };
            }

            // Handle interface (make-x style)
            if (state.interface?.isOpen) {
                const matchingOption = product
                    ? resolveInterfaceOption(state.interface.options, product)
                    : null;

                if (!buttonClicked) {
                    // Dispatch by componentId. Passing matchingOption.index (a
                    // 1-based label) to sendClickInterfaceOption (0-based array
                    // position) clicked the product *after* the requested one.
                    await (matchingOption
                        ? this.sdk.clickInterfaceOption(matchingOption)
                        : this.sdk.sendClickInterfaceOption(1));
                    buttonClicked = true;
                } else if (state.interface.options.length > 0 && state.interface.options[0]) {
                    await this.sdk.sendClickInterfaceOption(0);
                }
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Handle the skill dialog. Its buttons run Make X / Make 10 /
            // Make 5 / <product> per product, so the product's own button is
            // the only one carrying a name — match on that rather than guessing
            // an index from the log tier.
            if (state.dialog.isOpen) {
                if (!buttonClicked) {
                    const target = resolveSkillDialogProduct(state.dialog.options, product);

                    if (target) {
                        await this.sdk.sendClickDialog(target.index);
                        chosenLabel = target.text;
                        buttonClicked = true;
                        await this.sdk.waitForTicks(1);
                        continue;
                    }

                    if (product) {
                        const available = skillDialogProductLabels(state.dialog.options);
                        if (available.length > 0) {
                            return {
                                success: false,
                                message: `No fletching product matched "${product}". Available: ${available.map(l => `"${l}"`).join(', ')}`
                            };
                        }
                    }

                    // A continuation-only dialog (level-up chatbox) opened instead
                    // of the product menu: dismiss it and use the knife again.
                    if (state.dialog.options.length > 0 && state.dialog.options[0]) {
                        await this.sdk.sendClickDialog(state.dialog.options[0].index);
                    } else {
                        await this.sdk.sendClickDialog(0);
                    }
                    await this.sdk.waitForTicks(1);
                    const knifeNow = this.sdk.findInventoryItem(/knife/i);
                    const logsNow = this.sdk.findInventoryItem(/logs/i);
                    if (knifeNow && logsNow) {
                        await this.sdk.sendUseItemOnItem(knifeNow.slot, logsNow.slot);
                    }
                    continue;
                }

                // Already clicked — a continue-style dialog here (level-up,
                // "you need level N") just needs advancing.
                if (state.dialog.options.length > 0 && state.dialog.options[0]) {
                    await this.sdk.sendClickDialog(state.dialog.options[0].index);
                } else {
                    await this.sdk.sendClickDialog(0);
                }
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Check for failure messages
            for (const msg of state.gameMessages) {
                if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("need a higher") || text.includes("level to")) {
                        return { success: false, message: 'Fletching level too low' };
                    }
                }
            }

            await this.sdk.waitForTicks(1);
        }

        // Final XP check
        const finalXp = this.sdk.getSkill('Fletching')?.experience || 0;
        if (finalXp > fletchingBefore) {
            return {
                success: true,
                message: chosenLabel ? `Fletched ${chosenLabel}` : 'Fletched logs successfully',
                xpGained: finalXp - fletchingBefore,
                product: this.findFletchedProduct(chosenLabel) || undefined
            };
        }

        return { success: false, message: 'Fletching timed out' };
    }

    /**
     * Locate the item just fletched. The dialog label ("15 Arrow Shafts",
     * "Oak Short Bow") names the product but not as the item is named in the
     * inventory, so match on its significant words before falling back to the
     * generic fletching-output pattern.
     */
    private findFletchedProduct(label?: string): InventoryItem | null {
        if (label) {
            const words = label.toLowerCase().match(/[a-z]+/g) ?? [];
            const significant = words.filter(w => w.length > 2);
            if (significant.length > 0) {
                const byLabel = this.sdk.getInventory().find(item => {
                    const name = item.name.toLowerCase().replace(/\s+/g, '');
                    return significant.every(word => name.includes(word.replace(/s$/, '')));
                });
                if (byLabel) return byLabel;
            }
        }
        return this.sdk.findInventoryItem(/shortbow|longbow|arrow shaft|stock/i);
    }

    /** Craft leather into armour using needle and thread. */
    async craftLeather(product?: string): Promise<CraftLeatherResult> {
        await this.dismissBlockingUI();

        const needle = this.sdk.findInventoryItem(/needle/i);
        if (!needle) {
            return { success: false, message: 'No needle in inventory', reason: 'no_needle' };
        }

        const leather = this.sdk.findInventoryItem(/^leather$/i);
        if (!leather) {
            return { success: false, message: 'No leather in inventory', reason: 'no_leather' };
        }

        const thread = this.sdk.findInventoryItem(/thread/i);
        if (!thread) {
            return { success: false, message: 'No thread in inventory', reason: 'no_thread' };
        }

        const craftingBefore = this.sdk.getSkill('Crafting')?.experience || 0;
        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();

        // Use needle on leather to open crafting interface
        const result = await this.sdk.sendUseItemOnItem(needle.slot, leather.slot);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for interface/dialog to open
        try {
            await this.sdk.waitForCondition(
                s => s.dialog.isOpen || s.interface?.isOpen,
                10000
            );
        } catch {
            return { success: false, message: 'Crafting interface did not open', reason: 'interface_not_opened' };
        }

        // Handle product selection and crafting
        const MAX_ATTEMPTS = 50;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const state = this.sdk.getState();
            if (!state) {
                return { success: false, message: 'Lost game state' };
            }

            // Check if XP was gained (success!)
            const currentXp = state.skills.find(s => s.name === 'Crafting')?.experience || 0;
            if (currentXp > craftingBefore) {
                return {
                    success: true,
                    message: 'Crafted leather item successfully',
                    xpGained: currentXp - craftingBefore,
                    itemsCrafted: 1
                };
            }

            // Handle interface (leather crafting interface id=2311)
            if (state.interface?.isOpen) {
                if (product) {
                    // Try to find matching option by text, then dispatch its
                    // componentId. Feeding productOption.index (1-based) into
                    // sendClickInterfaceOption (0-based) crafted the item one
                    // past the one the caller asked for.
                    const productOption = resolveInterfaceOption(state.interface.options, product);
                    if (productOption) {
                        await this.sdk.clickInterfaceOption(productOption);
                        await this.sdk.waitForTicks(1);
                        continue;
                    }
                }

                // Leather crafting interface (2311) - options are 1-indexed in state but
                // sendClickInterfaceOption uses 0-based array indices.
                // option.index 1 = leather body (lvl 14), array idx 0
                // option.index 2 = leather gloves (lvl 1), array idx 1
                // option.index 3 = leather chaps (lvl 18), array idx 2
                if (state.interface.interfaceId === 2311) {
                    // Map product names to array indices (0-based)
                    let optionIndex = 1; // Default: gloves (array idx 1, lowest level requirement)
                    if (product) {
                        const productLower = product.toLowerCase();
                        if (productLower.includes('body') || productLower.includes('armour')) {
                            optionIndex = 0; // array idx 0 -> option.index 1 = body
                        } else if (productLower.includes('chaps') || productLower.includes('legs')) {
                            optionIndex = 2; // array idx 2 -> option.index 3 = chaps
                        } else if (productLower.includes('glove') || productLower.includes('vamb')) {
                            optionIndex = 1; // array idx 1 -> option.index 2 = gloves
                        }
                    }
                    await this.sdk.sendClickInterfaceOption(optionIndex);
                } else if (state.interface.options.length > 0 && state.interface.options[0]) {
                    await this.sdk.sendClickInterfaceOption(0);
                }
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Handle dialog
            if (state.dialog.isOpen) {
                const craftOption = state.dialog.options.find(o =>
                    /glove|make|craft|leather|body|chaps/i.test(o.text)
                );
                if (craftOption) {
                    await this.sdk.sendClickDialog(craftOption.index);
                } else if (state.dialog.options.length > 0 && state.dialog.options[0]) {
                    await this.sdk.sendClickDialog(state.dialog.options[0].index);
                } else {
                    await this.sdk.sendClickDialog(0);
                }
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Check for failure messages
            for (const msg of state.gameMessages) {
                if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("need a crafting level") || text.includes("level to")) {
                        return { success: false, message: 'Crafting level too low', reason: 'level_too_low' };
                    }
                    if (text.includes("don't have") && text.includes("thread")) {
                        return { success: false, message: 'Out of thread', reason: 'no_thread' };
                    }
                }
            }

            // Check if leather is gone (possibly consumed)
            const currentLeather = this.sdk.findInventoryItem(/^leather$/i);
            if (!currentLeather) {
                // Check XP one more time
                const finalXp = this.sdk.getSkill('Crafting')?.experience || 0;
                if (finalXp > craftingBefore) {
                    return {
                        success: true,
                        message: 'Crafted leather item successfully',
                        xpGained: finalXp - craftingBefore,
                        itemsCrafted: 1
                    };
                }
            }

            await this.sdk.waitForTicks(1);
        }

        // Final XP check
        const finalXp = this.sdk.getSkill('Crafting')?.experience || 0;
        if (finalXp > craftingBefore) {
            return {
                success: true,
                message: 'Crafted leather item successfully',
                xpGained: finalXp - craftingBefore,
                itemsCrafted: 1
            };
        }

        return { success: false, message: 'Crafting timed out', reason: 'timeout' };
    }

    // ============ Smithing ============

    /**
     * Smithing interface layout: 5 columns (pack IDs 1119-1123), each with up to 5 slots.
     * Maps product name -> { component (column pack ID), slot (row within column) }.
     *
     * Column 1 (1119): Dagger, Sword, Scimitar, Longsword, 2H Sword
     * Column 2 (1120): Axe, Mace, Warhammer, Battleaxe
     * Column 3 (1121): Chainbody, Platelegs, Plateskirt, Platebody
     * Column 4 (1122): Med Helm, Full Helm, Sq Shield, Kiteshield
     * Column 5 (1123): Dart Tips, Arrowheads, Throwing Knives, Wire/Studs
     */
    private static readonly METAL_BAR_PATTERNS: Record<string, RegExp> = {
        'bronze': /^bronze bar$/i,
        'iron': /^iron bar$/i,
        'steel': /^steel bar$/i,
        'mithril': /^mithril bar$/i,
        'adamant': /^adamantite bar$/i,
        'adamantite': /^adamantite bar$/i,
        'rune': /^runite bar$/i,
        'runite': /^runite bar$/i,
    };

    private static readonly SMITHING_COMPONENTS: Record<string, { component: number; slot: number }> = {
        // Column 1 - Bladed weapons
        'dagger': { component: 1119, slot: 0 },
        'sword': { component: 1119, slot: 1 },
        'scimitar': { component: 1119, slot: 2 },
        'longsword': { component: 1119, slot: 3 },
        'long sword': { component: 1119, slot: 3 },
        '2h sword': { component: 1119, slot: 4 },
        'two-handed sword': { component: 1119, slot: 4 },
        // Column 2 - Blunt/axe weapons
        'axe': { component: 1120, slot: 0 },
        'mace': { component: 1120, slot: 1 },
        'warhammer': { component: 1120, slot: 2 },
        'war hammer': { component: 1120, slot: 2 },
        'battleaxe': { component: 1120, slot: 3 },
        'battle axe': { component: 1120, slot: 3 },
        // Column 3 - Armour
        'chainbody': { component: 1121, slot: 0 },
        'chain body': { component: 1121, slot: 0 },
        'platelegs': { component: 1121, slot: 1 },
        'plate legs': { component: 1121, slot: 1 },
        'plateskirt': { component: 1121, slot: 2 },
        'plate skirt': { component: 1121, slot: 2 },
        'platebody': { component: 1121, slot: 3 },
        'plate body': { component: 1121, slot: 3 },
        // Column 4 - Helms/shields
        'med helm': { component: 1122, slot: 0 },
        'medium helm': { component: 1122, slot: 0 },
        'full helm': { component: 1122, slot: 1 },
        'sq shield': { component: 1122, slot: 2 },
        'square shield': { component: 1122, slot: 2 },
        'kiteshield': { component: 1122, slot: 3 },
        'kite shield': { component: 1122, slot: 3 },
        // Column 5 - Projectiles/misc
        'dart tips': { component: 1123, slot: 0 },
        'arrowheads': { component: 1123, slot: 1 },
        'arrow tips': { component: 1123, slot: 1 },
        'arrowtips': { component: 1123, slot: 1 },
        'throwing knives': { component: 1123, slot: 2 },
        'knives': { component: 1123, slot: 2 },
        'nails': { component: 1123, slot: 3 },
    };

    /**
     * Smith a bar into an item at an anvil.
     *
     * @param product - The item to smith (e.g., 'dagger', 'axe', 'platebody') or component ID
     * @param options - Optional configuration
     * @returns Result with XP gained and item created
     *
     * @example
     * ```ts
     * // Smith a bronze dagger
     * const result = await bot.smithAtAnvil('dagger');
     *
     * // Smith using component ID directly
     * const result = await bot.smithAtAnvil(1119);
     * ```
     */
    async smithAtAnvil(
        product: string | number = 'dagger',
        options: { barPattern?: RegExp; timeout?: number } = {}
    ): Promise<SmithResult> {
        if (typeof product !== 'string' && typeof product !== 'number') {
            // A RegExp product used to throw deep inside on .toLowerCase().
            return { success: false, message: `smithAtAnvil takes a product name string (e.g. 'mithril longsword'), got: ${product}`, reason: 'level_too_low' };
        }

        // A 'mithril longsword' request must smith with mithril bars — the
        // anvil interface uses whichever bar the click finds, so an
        // unqualified /bar$/i grabs the first bar in the inventory.
        const metalMatch = typeof product === 'string'
            ? product.toLowerCase().match(/^(bronze|iron|steel|mithril|adamant(?:ite)?|run(?:e|ite))\s+/)
            : null;
        const metal = metalMatch?.[1];
        const metalBar = metal !== undefined ? BotActions.METAL_BAR_PATTERNS[metal] : undefined;
        const { barPattern = metalBar ?? /bar$/i, timeout = 10000 } = options;

        await this.dismissBlockingUI();

        // Check for hammer
        const hammer = this.sdk.findInventoryItem(/hammer/i);
        if (!hammer) {
            return { success: false, message: 'No hammer in inventory', reason: 'no_hammer' };
        }

        // Check for bars
        const bar = this.sdk.findInventoryItem(barPattern);
        if (!bar) {
            const wanted = metal !== undefined ? `${metal} bars` : 'bars';
            return { success: false, message: `No ${wanted} in inventory`, reason: 'no_bars' };
        }

        // Find anvil
        const anvil = this.sdk.findNearbyLoc(/anvil/i);
        if (!anvil) {
            return { success: false, message: 'No anvil nearby', reason: 'no_anvil' };
        }

        // Determine component ID and slot
        let componentId: number;
        let componentSlot: number = 0;
        if (typeof product === 'number') {
            componentId = product;
        } else {
            // Strip a leading metal so 'mithril longsword' hits the
            // 'longsword' entry directly.
            const key = metalMatch
                ? product.toLowerCase().slice(metalMatch[0].length).trim()
                : product.toLowerCase();
            const directMatch = BotActions.SMITHING_COMPONENTS[key];
            if (directMatch) {
                componentId = directMatch.component;
                componentSlot = directMatch.slot;
            } else {
                // Try partial match. Prefer the LONGEST matching key:
                // 'longsword'.includes('sword') is also true, and first-wins
                // used to silently smith the wrong product.
                const matchingKey = Object.keys(BotActions.SMITHING_COMPONENTS)
                    .filter(k => k.includes(key) || key.includes(k))
                    .sort((a, b) => b.length - a.length)[0];
                const partialMatch = matchingKey ? BotActions.SMITHING_COMPONENTS[matchingKey] : undefined;
                if (partialMatch) {
                    componentId = partialMatch.component;
                    componentSlot = partialMatch.slot;
                } else {
                    return { success: false, message: `Unknown smithing product: ${product}`, reason: 'level_too_low' };
                }
            }
        }

        const smithingBefore = this.sdk.getSkill('Smithing')?.experience || 0;
        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();

        // The generic product sweep below matches /axe/ against an equipped
        // "Bronze pickaxe" and reports it as the smithed item — prefer the
        // product the caller actually asked for.
        const findSmithedItem = (): InventoryItem | null => {
            if (typeof product === 'string') {
                const named = this.sdk.findInventoryItem(new RegExp(product.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
                if (named) return named;
            }
            return this.sdk.findInventoryItem(/dagger|(?<!pick)axe|mace|helm|sword|shield|body|legs|skirt|claws|knives|bolts|arrowtips|arrowheads|arrow|dart|nails/i);
        };

        // Use bar on anvil
        const useResult = await this.sdk.sendUseItemOnLoc(bar.slot, anvil.x, anvil.z, anvil.id);
        if (!useResult.success) {
            // Propagate the real failure: a routing cant_reach is not a missing
            // anvil, and conflating them sends callers hunting the wrong bug.
            const reason: SmithResult['reason'] =
                useResult.reason === 'cant_reach' ? 'cant_reach'
                : useResult.reason === 'item_not_found' ? 'no_bars'
                : useResult.reason === 'timeout' ? 'timeout'
                : 'no_anvil';
            return { success: false, message: useResult.message, reason };
        }

        // Wait for smithing interface to open
        try {
            await this.sdk.waitForCondition(
                s => s.interface?.isOpen && s.interface.interfaceId === 994,
                5000
            );
            
        } catch {
            return { success: false, message: 'Smithing interface did not open', reason: 'interface_not_opened' };
        }

        // Click the smithing component (uses INV_BUTTON)
        const clickResult = await this.sdk.sendClickComponentWithOption(componentId, 1, componentSlot);
        if (!clickResult.success) {
            return { success: false, message: 'Failed to click smithing option', reason: 'interface_not_opened' };
        }

        // Wait for XP gain or timeout
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const state = this.sdk.getState();
            if (!state) {
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Check for XP gain
            const currentXp = state.skills.find(s => s.name === 'Smithing')?.experience || 0;
            if (currentXp > smithingBefore) {
                // Find the smithed item
                const smithedItem = findSmithedItem();
                return {
                    success: true,
                    message: 'Smithed item successfully',
                    xpGained: currentXp - smithingBefore,
                    itemsSmithed: 1,
                    product: smithedItem || undefined
                };
            }

            // Check for failure messages
            for (const msg of state.gameMessages) {
                if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("need a smithing level") || text.includes("level to")) {
                        return { success: false, message: 'Smithing level too low', reason: 'level_too_low' };
                    }
                    if (text.includes("don't have enough")) {
                        return { success: false, message: 'Not enough bars', reason: 'no_bars' };
                    }
                }
            }

            // If interface closed without XP, might need to retry
            if (!state.interface?.isOpen) {
                const finalXp = this.sdk.getSkill('Smithing')?.experience || 0;
                if (finalXp > smithingBefore) {
                    const smithedItem = findSmithedItem();
                    return {
                        success: true,
                        message: 'Smithed item successfully',
                        xpGained: finalXp - smithingBefore,
                        itemsSmithed: 1,
                        product: smithedItem || undefined
                    };
                }
            }

            await this.sdk.waitForTicks(1);
        }

        // Final XP check
        const finalXp = this.sdk.getSkill('Smithing')?.experience || 0;
        if (finalXp > smithingBefore) {
            const smithedItem = this.sdk.findInventoryItem(/dagger|axe|mace|helm|sword|shield|body|legs|skirt|claws|knives|bolts|arrowtips|arrowheads|arrow|dart/i);
            return {
                success: true,
                message: 'Smithed item successfully',
                xpGained: finalXp - smithingBefore,
                itemsSmithed: 1,
                product: smithedItem || undefined
            };
        }

        return { success: false, message: 'Smithing timed out', reason: 'timeout' };
    }

    // ============ Porcelain: Generic Interactions ============

    /**
     * Interact with a nearby location object (rock, fishing spot, furnace, etc.).
     * Walks to the target first (handling doors), sends the interaction, then waits
     * for an effect (animation, dialog, interface) or detects failure when the player
     * has been idle for 2 ticks with nothing happening.
     * @param target - NearbyLoc object or name string/regex to find
     * @param option - Option index or name regex to match (default: 1, the first option)
     */
    async interactLoc(
        target: NearbyLoc | string | RegExp,
        option: number | string | RegExp = 1,
    ): Promise<InteractLocResult> {
        if (target == null) {
            // An undefined target used to fall through to a match-anything
            // pattern and silently interact with a random nearby loc.
            return { success: false, message: `interactLoc requires a target loc, name, or pattern (got ${target})`, reason: 'loc_not_found' };
        }
        const resolvedLoc = this.helpers.resolveLocation(target, /./);
        return this.helpers.withDoorRetry(
            () => this._interactLocOnce(target, option),
            (r) => r.reason === 'cant_reach',
            2,
            resolvedLoc ? { x: resolvedLoc.x, z: resolvedLoc.z } : undefined
        );
    }

    private async _interactLocOnce(
        target: NearbyLoc | string | RegExp,
        option: number | string | RegExp = 1,
    ): Promise<InteractLocResult> {
        await this.dismissBlockingUI();

        // A named option narrows resolution to locs that actually offer it.
        const optionFilter = typeof option === 'number' ? undefined : option;
        const loc = this.helpers.resolveLocation(target, /./, optionFilter);
        if (!loc) {
            return { success: false, message: `Location not found: ${target}`, reason: 'loc_not_found' };
        }

        // Resolve option index
        let opIndex: number;
        if (typeof option === 'number') {
            opIndex = option;
        } else {
            const regex = typeof option === 'string' ? new RegExp(option, 'i') : option;
            const match = loc.optionsWithIndex.find(o => regex.test(o.text));
            if (!match) {
                return { success: false, message: `No matching option on ${loc.name}`, reason: 'no_matching_option' };
            }
            opIndex = match.opIndex;
        }

        // Walk to the location first (handles doors)
        if (loc.distance > 2) {
            const walkResult = await this.walkTo(loc.x, loc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${loc.name}: ${walkResult.message}`, reason: 'cant_reach' };
            }
        }

        // Re-find the location after walking (it may have changed). Keep a RegExp
        // target as-is so its anchors survive; an entity target re-finds by
        // identity so same-named neighbours (Varrock cart crates) can't win.
        const locNow = target instanceof RegExp || typeof target === 'string'
            ? this.helpers.resolveLocation(target, /./, optionFilter)
            : this.helpers.refindLocation(loc)
                ?? this.helpers.resolveLocation(exactNamePattern(loc.name), /./, optionFilter);
        if (!locNow) {
            return { success: false, message: `${loc.name} no longer visible`, reason: 'loc_not_found' };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();
        const startLevel = this.sdk.getState()?.player?.level ?? -1;
        let lastMoveTick = startTick;
        let lastX = this.sdk.getState()?.player?.x ?? 0;
        let lastZ = this.sdk.getState()?.player?.z ?? 0;

        // A staircase/ladder teleport can land between state polls with the
        // climb animation never observed - the level change IS the evidence.
        const levelChanged = (state: { player: { level: number } | null } | null): boolean =>
            startLevel !== -1 && state?.player != null && state.player.level !== startLevel;

        // Dungeon trapdoors/ladders teleport within the same level (the
        // underground band is a +6400 z offset), so also treat a jump far
        // beyond walking range as evidence the interaction worked.
        const dispatchX = lastX;
        const dispatchZ = lastZ;
        const teleported = (state: { player: { x: number; z: number } | null } | null): boolean =>
            state?.player != null &&
            Math.max(Math.abs(state.player.x - dispatchX), Math.abs(state.player.z - dispatchZ)) > 8;

        const result = await this.sdk.sendInteractLoc(locNow.x, locNow.z, locNow.id, opIndex);
        if (!result.success) {
            return { success: false, message: result.message, reason: 'timeout' };
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for can't-reach messages
                for (const msg of state.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) return true;
                    }
                }

                // Success indicators
                if (state.dialog.isOpen || state.interface?.isOpen) return true;
                if (state.player && state.player.animId !== -1) return true;
                if (levelChanged(state) || teleported(state)) return true;

                // Track movement — if player moved, update last move tick
                if (state.player && (state.player.x !== lastX || state.player.z !== lastZ)) {
                    lastX = state.player.x;
                    lastZ = state.player.z;
                    lastMoveTick = state.tick;
                }

                // Player idle for 2+ ticks with nothing happening → give up
                if (state.tick - lastMoveTick >= 2) return true;

                return false;
            }, 30000); // safety net only

            if (this.helpers.checkCantReachMessage(msgBaseline)) {
                return { success: false, message: `Can't reach ${locNow.name}`, reason: 'cant_reach' };
            }

            if (finalState.dialog.isOpen || finalState.interface?.isOpen ||
                (finalState.player && finalState.player.animId !== -1) ||
                levelChanged(finalState) || teleported(finalState)) {
                return { success: true, message: `Interacted with ${locNow.name}` };
            }

            // The idle window can expire a tick before the server responds.
            // Short grace for the evidence to land - see interactNpc/talkTo.
            try {
                await this.sdk.waitForCondition(s =>
                    s.dialog.isOpen || Boolean(s.interface?.isOpen) ||
                    (s.player != null && s.player.animId !== -1) ||
                    levelChanged(s) || teleported(s), 2000);
                return { success: true, message: `Interacted with ${locNow.name}` };
            } catch {
                return { success: false, message: `Nothing happened interacting with ${locNow.name}`, reason: 'timeout' };
            }
        } catch {
            // Even on the safety-net timeout, a level transition means it worked.
            if (levelChanged(this.sdk.getState()) || teleported(this.sdk.getState())) {
                return { success: true, message: `Interacted with ${locNow.name}` };
            }
            return { success: false, message: `Timed out interacting with ${locNow.name}`, reason: 'timeout' };
        }
    }

    /**
     * Interact with a nearby NPC using a specified option (e.g. "Trade", "Pickpocket", "Fish").
     * Walks to the NPC first (handling doors), sends the interaction, then waits
     * for an effect (animation, dialog, interface) or detects failure when the player
     * has been idle for 2 ticks with nothing happening.
     * @param target - NearbyNpc object or name string/regex to find
     * @param option - Option index or name regex to match (default: 1, the first option)
     */
    async interactNpc(
        target: NearbyNpc | string | RegExp,
        option: number | string | RegExp = 1,
    ): Promise<InteractNpcResult> {
        if (target == null) {
            return { success: false, message: `interactNpc requires a target npc, name, or pattern (got ${target})`, reason: 'npc_not_found' };
        }
        return this.helpers.withDoorRetry(
            () => this._interactNpcOnce(target, option),
            (r) => r.reason === 'cant_reach'
        );
    }

    private async _interactNpcOnce(
        target: NearbyNpc | string | RegExp,
        option: number | string | RegExp = 1,
    ): Promise<InteractNpcResult> {
        await this.dismissBlockingUI();

        const npc = this.helpers.resolveNpc(target);
        if (!npc) {
            return { success: false, message: `NPC not found: ${target}`, reason: 'npc_not_found' };
        }

        // Resolve option index
        let opIndex: number;
        if (typeof option === 'number') {
            opIndex = option;
        } else {
            const regex = typeof option === 'string' ? new RegExp(option, 'i') : option;
            const match = npc.optionsWithIndex.find(o => regex.test(o.text));
            if (!match) {
                return { success: false, message: `No matching option on ${npc.name}`, reason: 'no_matching_option' };
            }
            opIndex = match.opIndex;
        }

        // Walk to the NPC first (handles doors)
        if (npc.distance > 2) {
            const walkResult = await this.walkTo(npc.x, npc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${npc.name}: ${walkResult.message}`, reason: 'cant_reach' };
            }
        }

        // Re-find the NPC after walking (it may have moved)
        const npcPattern = typeof target === 'object' ? new RegExp(npc.name, 'i') : target;
        const npcNow = this.helpers.resolveNpc(npcPattern);
        if (!npcNow) {
            return { success: false, message: `${npc.name} no longer visible`, reason: 'npc_not_found' };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();
        const rejectCursor = this.helpers.opRejectionCursor();
        let lastMoveTick = startTick;
        let lastX = this.sdk.getState()?.player?.x ?? 0;
        let lastZ = this.sdk.getState()?.player?.z ?? 0;

        const result = await this.sdk.sendInteractNpc(npcNow.index, opIndex);
        if (!result.success) {
            return { success: false, message: result.message, reason: 'timeout' };
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for can't-reach messages
                for (const msg of state.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) return true;
                    }
                }

                // Success indicators
                if (state.dialog.isOpen || state.interface?.isOpen) return true;
                if (state.player && state.player.animId !== -1) return true;

                // The server took the packet and discarded it
                if (this.helpers.wasOpRejectedSince(rejectCursor, state)) return true;

                // Track movement — if player moved, update last move tick
                if (state.player && (state.player.x !== lastX || state.player.z !== lastZ)) {
                    lastX = state.player.x;
                    lastZ = state.player.z;
                    lastMoveTick = state.tick;
                }

                // Player idle for 2+ ticks with nothing happening → give up
                if (state.tick - lastMoveTick >= 2) return true;

                return false;
            }, 30000); // safety net only

            if (this.helpers.checkCantReachMessage(msgBaseline)) {
                return { success: false, message: `Can't reach ${npcNow.name}`, reason: 'cant_reach' };
            }

            if (finalState.dialog.isOpen || finalState.interface?.isOpen ||
                (finalState.player && finalState.player.animId !== -1)) {
                return { success: true, message: `Interacted with ${npcNow.name}` };
            }

            // "Thrown away" vs "ran and did nothing observable" - only the
            // former is worth retrying as-is.
            if (this.helpers.wasOpRejectedSince(rejectCursor, finalState)) {
                return {
                    success: false,
                    message: `Server discarded the interaction with ${npcNow.name} - mid-action, stunned, or a modal is open`,
                    reason: 'rejected'
                };
            }

            // The idle window can expire a tick before the server responds
            // (walk-up finished, NPC still turning). Short grace for the
            // evidence to land before declaring failure - see talkTo.
            try {
                await this.sdk.waitForCondition(s =>
                    s.dialog.isOpen || Boolean(s.interface?.isOpen) ||
                    (s.player != null && s.player.animId !== -1), 2000);
                return { success: true, message: `Interacted with ${npcNow.name}` };
            } catch {
                return { success: false, message: `Nothing happened interacting with ${npcNow.name}`, reason: 'timeout' };
            }
        } catch {
            return { success: false, message: `Timed out interacting with ${npcNow.name}`, reason: 'timeout' };
        }
    }

    // ============ Porcelain: Thieving ============

    /** Pickpocket an NPC. Handles door retrying if path is blocked. */
    async pickpocketNpc(target: NearbyNpc | string | RegExp): Promise<PickpocketResult> {
        return this.helpers.withDoorRetry(
            () => this._pickpocketNpcOnce(target),
            (r) => r.reason === 'cant_reach' || r.reason === 'timeout'
        );
    }

    private async _pickpocketNpcOnce(target: NearbyNpc | string | RegExp): Promise<PickpocketResult> {
        await this.dismissBlockingUI();

        const npc = this.helpers.resolveNpc(target);
        if (!npc) {
            return { success: false, message: `NPC not found: ${target}`, reason: 'npc_not_found' };
        }

        const pickOpt = npc.optionsWithIndex.find(o => /pickpocket/i.test(o.text));
        if (!pickOpt) {
            return { success: false, message: `No pickpocket option on ${npc.name}`, reason: 'no_pickpocket_option' };
        }

        const thievingBefore = this.sdk.getSkill('Thieving')?.experience || 0;
        const msgBaseline = this.helpers.getMessageTick();
        const rejectCursor = this.helpers.opRejectionCursor();

        const result = await this.sdk.sendInteractNpc(npc.index, pickOpt.opIndex);
        if (!result.success) {
            // Not retried by withDoorRetry: a dropped dispatch means the client
            // stalled, and re-sending just burns another actionTimeout.
            return {
                success: false,
                message: `Pickpocket dispatch failed on ${npc.name}: ${result.message}`,
                reason: 'dispatch_failed'
            };
        }

        // "You attempt to pick..." is printed by ~pick_pocket (thieving.rs2)
        // before its first p_delay, so it is the earliest evidence the op ran -
        // a whole attempt earlier than xp or a stun.
        let attemptAcked = false;
        // The client walks to the npc before writing OPNPC, so the ack can be
        // late by the length of that walk. Measure the window from the last step
        // taken, baselined after the send rather than before it.
        const sentState = this.sdk.getState();
        let lastMoveTick = sentState?.tick ?? 0;
        let lastX = sentState?.player?.x ?? 0;
        let lastZ = sentState?.player?.z ?? 0;

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Resolved: xp landed
                const thievingNow = state.skills.find(s => s.name === 'Thieving')?.experience || 0;
                if (thievingNow > thievingBefore) return true;

                // Resolved: stunned, or the walk failed
                for (const msg of state.gameMessages) {
                    if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                        const text = msg.text.toLowerCase();
                        if (text.includes('stunned') || text.includes('caught') || text.includes('stun')) return true;
                        if (text.includes('you fail to pick')) return true;
                        if (text.includes("can't reach") || text.includes('cannot reach')) return true;
                        if (text.includes('you attempt to pick')) attemptAcked = true;
                    }
                }

                // Discarded by the server - no resolution is coming.
                if (this.helpers.wasOpRejectedSince(rejectCursor, state)) return true;

                if (state.player && (state.player.x !== lastX || state.player.z !== lastZ)) {
                    lastX = state.player.x;
                    lastZ = state.player.z;
                    lastMoveTick = state.tick;
                }

                // Standing still, neither acked nor rejected: the op is lost.
                if (!attemptAcked && state.tick - lastMoveTick >= PICKPOCKET_ACK_TICKS) return true;

                return false;
            }, 10000);

            const thievingAfter = this.sdk.getSkill('Thieving')?.experience || 0;
            const xpGained = thievingAfter - thievingBefore;
            if (xpGained > 0) {
                return { success: true, message: `Pickpocketed ${npc.name}`, xpGained };
            }

            // Check what happened
            for (const msg of finalState.gameMessages) {
                if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes('cannot reach')) {
                        return { success: false, message: `Can't reach ${npc.name}`, reason: 'cant_reach' };
                    }
                    if (text.includes('stunned') || text.includes('caught') || text.includes('stun') || text.includes('you fail to pick')) {
                        return { success: false, message: `Stunned while pickpocketing ${npc.name}`, reason: 'stunned' };
                    }
                }
            }

            if (this.helpers.wasOpRejectedSince(rejectCursor, finalState)) {
                return {
                    success: false,
                    message: `Server discarded the pickpocket op on ${npc.name} - stunned, mid-action, or a modal is open`,
                    reason: 'rejected'
                };
            }

            if (!attemptAcked) {
                return {
                    success: false,
                    message: `Pickpocket never started on ${npc.name} (no attempt message within ${PICKPOCKET_ACK_TICKS} idle ticks)`,
                    reason: 'not_started'
                };
            }

            return { success: false, message: `Pickpocket failed on ${npc.name}`, reason: 'timeout' };
        } catch {
            return { success: false, message: `Timed out pickpocketing ${npc.name}`, reason: 'timeout' };
        }
    }

    // ============ Porcelain: Prayer Actions ============

    /**
     * Activate a prayer by name or index.
     * Checks preconditions (level, prayer points, not already active) before toggling.
     */
    async activatePrayer(prayer: PrayerName | number): Promise<PrayerResult> {
        await this.dismissBlockingUI();

        const index = typeof prayer === 'number' ? prayer : PRAYER_INDICES[prayer];
        if (index === undefined || index < 0 || index > 14) {
            return { success: false, message: `Invalid prayer: ${prayer}`, reason: 'invalid_prayer' };
        }

        const prayerName = PRAYER_NAMES[index];
        const prayerState = this.sdk.getPrayerState();
        if (!prayerState) {
            return { success: false, message: 'No prayer state available' };
        }

        // Check if already active
        if (prayerState.activePrayers[index]) {
            return { success: true, message: `${prayerName} is already active`, reason: 'already_active' };
        }

        // Check prayer points
        if (prayerState.prayerPoints <= 0) {
            return { success: false, message: 'No prayer points remaining', reason: 'no_prayer_points' };
        }

        // Check prayer level
        const requiredLevel = PRAYER_LEVELS[index] ?? 1;
        if (prayerState.prayerLevel < requiredLevel) {
            return { success: false, message: `Need prayer level ${requiredLevel} for ${prayerName} (have ${prayerState.prayerLevel})`, reason: 'level_too_low' };
        }

        // Send toggle
        const result = await this.sdk.sendTogglePrayer(index);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for prayer to become active
        try {
            await this.sdk.waitForCondition(state => {
                return state.prayers.activePrayers[index] === true;
            }, 5000);
            return { success: true, message: `Activated ${prayerName}` };
        } catch {
            return { success: false, message: `Timeout waiting for ${prayerName} to activate`, reason: 'timeout' };
        }
    }

    /**
     * Deactivate a prayer by name or index.
     * Checks if the prayer is actually active before toggling.
     */
    async deactivatePrayer(prayer: PrayerName | number): Promise<PrayerResult> {
        await this.dismissBlockingUI();

        const index = typeof prayer === 'number' ? prayer : PRAYER_INDICES[prayer];
        if (index === undefined || index < 0 || index > 14) {
            return { success: false, message: `Invalid prayer: ${prayer}`, reason: 'invalid_prayer' };
        }

        const prayerName = PRAYER_NAMES[index];
        const prayerState = this.sdk.getPrayerState();
        if (!prayerState) {
            return { success: false, message: 'No prayer state available' };
        }

        // Check if already inactive
        if (!prayerState.activePrayers[index]) {
            return { success: true, message: `${prayerName} is already inactive`, reason: 'already_inactive' };
        }

        // Send toggle
        const result = await this.sdk.sendTogglePrayer(index);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for prayer to become inactive
        try {
            await this.sdk.waitForCondition(state => {
                return state.prayers.activePrayers[index] === false;
            }, 5000);
            return { success: true, message: `Deactivated ${prayerName}` };
        } catch {
            return { success: false, message: `Timeout waiting for ${prayerName} to deactivate`, reason: 'timeout' };
        }
    }

    /**
     * Deactivate all currently active prayers.
     * Toggles each active prayer off one by one.
     */
    async deactivateAllPrayers(): Promise<PrayerResult> {
        const prayerState = this.sdk.getPrayerState();
        if (!prayerState) {
            return { success: false, message: 'No prayer state available' };
        }

        const activePrayers = prayerState.activePrayers
            .map((active, i) => active ? i : -1)
            .filter(i => i !== -1);

        if (activePrayers.length === 0) {
            return { success: true, message: 'No prayers are active' };
        }

        for (const index of activePrayers) {
            const result = await this.deactivatePrayer(index);
            if (!result.success && result.reason !== 'already_inactive') {
                return { success: false, message: `Failed to deactivate ${PRAYER_NAMES[index]}: ${result.message}` };
            }
        }

        return { success: true, message: `Deactivated ${activePrayers.length} prayer(s)` };
    }

    // ============ Jewelry Crafting & Enchanting ============

    /** Enchantment spell component IDs, indexed by level (1-5). */
    private static readonly ENCHANT_SPELLS: Record<number, number> = {
        1: 1155,  // Sapphire  — Level 7 Magic
        2: 1165,  // Emerald   — Level 27 Magic
        3: 1176,  // Ruby      — Level 49 Magic
        4: 1180,  // Diamond   — Level 57 Magic
        5: 1187,  // Dragonstone — Level 68 Magic
    };

    /**
     * Jewelry crafting interface (4161) component mapping.
     *
     * Layout: 3 columns (ring, necklace, amulet), each with 5 gem slots:
     *   slot 0 = plain gold, 1 = sapphire, 2 = emerald, 3 = ruby, 4 = diamond
     */
    private static readonly JEWELRY_COMPONENTS: Record<string, number> = {
        'ring': 4233,
        'necklace': 4239,
        'amulet': 4245,
    };

    private static readonly JEWELRY_GEM_SLOTS: Record<string, number> = {
        'gold': 0,
        'plain': 0,
        'sapphire': 1,
        'emerald': 2,
        'ruby': 3,
        'diamond': 4,
    };

    /**
     * Craft jewelry at a furnace using a gold/silver bar and optional gem.
     *
     * Requires: bar + mould in inventory (ring mould, necklace mould, or amulet mould).
     * Optionally a gem for gem-set jewelry.
     *
     * @param options.barPattern - Regex to find the bar (default: /gold bar/i)
     * @param options.product - Product type: 'ring', 'necklace', or 'amulet' (default: auto-detect from mould)
     * @param options.gem - Gem type: 'sapphire', 'emerald', 'ruby', 'diamond', or 'gold'/'plain' for no gem (default: auto-detect from inventory)
     * @param options.timeout - Max wait time in ms (default: 10000)
     *
     * @example
     * ```ts
     * // Craft a gold ring (need gold bar + ring mould)
     * const result = await bot.craftJewelry({ product: 'ring' });
     *
     * // Craft a ruby amulet (need gold bar + ruby + amulet mould)
     * const result = await bot.craftJewelry({ product: 'amulet', gem: 'ruby' });
     *
     * // Auto-detect: picks product from mould, gem from inventory
     * const result = await bot.craftJewelry();
     * ```
     */
    async craftJewelry(options: {
        barPattern?: RegExp;
        product?: string;
        gem?: string;
        timeout?: number;
    } = {}): Promise<CraftJewelryResult> {
        const { barPattern = /gold bar/i, timeout = 10000 } = options;

        await this.dismissBlockingUI();

        // Check for bar
        const bar = this.sdk.findInventoryItem(barPattern);
        if (!bar) {
            return { success: false, message: 'No bar in inventory', reason: 'no_bar' };
        }

        // Check for a mould
        const mould = this.sdk.findInventoryItem(/mould/i);
        if (!mould) {
            return { success: false, message: 'No mould in inventory (need ring mould, necklace mould, or amulet mould)', reason: 'no_mould' };
        }

        // Determine product type from option or mould name
        let product = options.product?.toLowerCase();
        if (!product) {
            const mouldName = mould.name.toLowerCase();
            if (mouldName.includes('ring')) product = 'ring';
            else if (mouldName.includes('necklace')) product = 'necklace';
            else if (mouldName.includes('amulet')) product = 'amulet';
            else product = 'ring';  // fallback
        }

        const componentId = BotActions.JEWELRY_COMPONENTS[product];
        if (!componentId) {
            return { success: false, message: `Unknown jewelry product: ${product}. Use 'ring', 'necklace', or 'amulet'.`, reason: 'no_mould' };
        }

        // Determine gem slot from option or inventory
        let gem = options.gem?.toLowerCase();
        if (!gem) {
            // Auto-detect from inventory
            const gemItem = this.sdk.findInventoryItem(/^(sapphire|emerald|ruby|diamond|dragonstone)$/i);
            gem = gemItem ? gemItem.name.toLowerCase() : 'gold';
        }

        const gemSlot = BotActions.JEWELRY_GEM_SLOTS[gem] ?? 0;

        // Find furnace
        const furnace = this.sdk.findNearbyLoc(/furnace/i);
        if (!furnace) {
            return { success: false, message: 'No furnace nearby', reason: 'no_furnace' };
        }

        const craftingBefore = this.sdk.getSkill('Crafting')?.experience || 0;
        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();

        // Walk to furnace if needed
        if (furnace.distance > 2) {
            const walkResult = await this.walkTo(furnace.x, furnace.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach furnace: ${walkResult.message}`, reason: 'no_furnace' };
            }
        }

        // Use bar on furnace to open jewelry interface (4161)
        const useResult = await this.sdk.sendUseItemOnLoc(bar.slot, furnace.x, furnace.z, furnace.id);
        if (!useResult.success) {
            return { success: false, message: useResult.message, reason: 'no_furnace' };
        }

        // Wait for jewelry crafting interface to open
        try {
            await this.sdk.waitForCondition(
                s => s.interface?.isOpen && s.interface.interfaceId === 4161,
                5000
            );
        } catch {
            return { success: false, message: 'Jewelry crafting interface did not open', reason: 'interface_not_opened' };
        }

        // Click the product component with the correct gem slot
        const clickResult = await this.sdk.sendClickComponentWithOption(componentId, 1, gemSlot);
        if (!clickResult.success) {
            return { success: false, message: 'Failed to click jewelry option', reason: 'interface_not_opened' };
        }

        // Wait for XP gain or timeout
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const state = this.sdk.getState();
            if (!state) {
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Check for XP gain
            const currentXp = state.skills.find(s => s.name === 'Crafting')?.experience || 0;
            if (currentXp > craftingBefore) {
                await this.dismissBlockingUI();
                const crafted = this.sdk.findInventoryItem(/ring|necklace|amulet|bracelet/i);
                return {
                    success: true,
                    message: 'Crafted jewelry successfully',
                    xpGained: currentXp - craftingBefore,
                    product: crafted || undefined
                };
            }

            // Check for failure messages
            for (const msg of state.gameMessages) {
                if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("need a crafting level") || text.includes("level to")) {
                        return { success: false, message: 'Crafting level too low', reason: 'level_too_low' };
                    }
                    if (text.includes("don't have")) {
                        return { success: false, message: msg.text, reason: 'no_gem' };
                    }
                }
            }

            await this.sdk.waitForTicks(1);
        }

        // Final XP check
        const finalXp = this.sdk.getSkill('Crafting')?.experience || 0;
        if (finalXp > craftingBefore) {
            await this.dismissBlockingUI();
            const crafted = this.sdk.findInventoryItem(/ring|necklace|amulet|bracelet/i);
            return {
                success: true,
                message: 'Crafted jewelry successfully',
                xpGained: finalXp - craftingBefore,
                product: crafted || undefined
            };
        }

        return { success: false, message: 'Jewelry crafting timed out', reason: 'timeout' };
    }

    /**
     * Cast an enchantment spell on a jewelry item.
     *
     * @param target - Item to enchant (InventoryItem, name string, or regex)
     * @param level - Enchantment level 1-5 (1=Sapphire, 2=Emerald, 3=Ruby, 4=Diamond, 5=Dragonstone)
     * @param options.timeout - Max wait time in ms (default: 5000)
     *
     * @example
     * ```ts
     * // Enchant a sapphire ring into a ring of recoil
     * const result = await bot.enchantItem(/sapphire ring/i, 1);
     *
     * // Enchant an emerald amulet
     * const result = await bot.enchantItem('emerald amulet', 2);
     * ```
     */
    async enchantItem(
        target: InventoryItem | string | RegExp,
        level: 1 | 2 | 3 | 4 | 5,
        options: { timeout?: number } = {}
    ): Promise<EnchantResult> {
        const { timeout = 5000 } = options;

        await this.dismissBlockingUI();

        // Resolve item
        let item: InventoryItem | null;
        if (typeof target === 'string' || target instanceof RegExp) {
            const pattern = typeof target === 'string' ? new RegExp(target, 'i') : target;
            item = this.sdk.findInventoryItem(pattern);
        } else {
            item = target;
        }

        if (!item) {
            return { success: false, message: `Item not found: ${target}`, reason: 'item_not_found' };
        }

        const spellComponent = BotActions.ENCHANT_SPELLS[level];
        if (!spellComponent) {
            return { success: false, message: `Invalid enchant level: ${level}`, reason: 'item_not_found' };
        }

        const magicBefore = this.sdk.getSkill('Magic')?.experience || 0;
        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();

        // Cast the enchant spell on the item
        const castResult = await this.sdk.sendSpellOnItem(item.slot, spellComponent);
        if (!castResult.success) {
            return { success: false, message: castResult.message, reason: 'no_runes' };
        }

        // Wait for XP gain or failure
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const state = this.sdk.getState();
            if (!state) {
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Check for Magic XP gain
            const currentXp = state.skills.find(s => s.name === 'Magic')?.experience || 0;
            if (currentXp > magicBefore) {
                // Find the enchanted item (it replaces the original in the same slot)
                const enchanted = state.inventory.find(i => i.slot === item!.slot);
                return {
                    success: true,
                    message: 'Enchanted item successfully',
                    xpGained: currentXp - magicBefore,
                    product: enchanted || undefined
                };
            }

            // Check for failure messages
            for (const msg of state.gameMessages) {
                if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("do not have enough") || text.includes("don't have enough") || text.includes("need runes")) {
                        return { success: false, message: 'Not enough runes', reason: 'no_runes' };
                    }
                    if (text.includes("need a magic level") || text.includes("level to cast")) {
                        return { success: false, message: 'Magic level too low', reason: 'level_too_low' };
                    }
                }
            }

            await this.sdk.waitForTicks(1);
        }

        // Final XP check
        const finalXp = this.sdk.getSkill('Magic')?.experience || 0;
        if (finalXp > magicBefore) {
            const enchanted = this.sdk.getState()?.inventory.find(i => i.slot === item!.slot);
            return {
                success: true,
                message: 'Enchanted item successfully',
                xpGained: finalXp - magicBefore,
                product: enchanted || undefined
            };
        }

        return { success: false, message: 'Enchantment timed out', reason: 'timeout' };
    }

    /**
     * String an amulet using a ball of wool.
     *
     * @param target - Unstrung amulet (InventoryItem, name string, or regex). Default: /amulet/i
     * @param options.timeout - Max wait time in ms (default: 5000)
     *
     * @example
     * ```ts
     * // String a gold amulet
     * const result = await bot.stringAmulet(/gold amulet/i);
     *
     * // String any unstrung amulet
     * const result = await bot.stringAmulet();
     * ```
     */
    async stringAmulet(
        target: InventoryItem | string | RegExp = /amulet/i,
        options: { timeout?: number } = {}
    ): Promise<StringAmuletResult> {
        const { timeout = 5000 } = options;

        await this.dismissBlockingUI();

        // Resolve amulet
        let amulet: InventoryItem | null;
        if (typeof target === 'string' || target instanceof RegExp) {
            const pattern = typeof target === 'string' ? new RegExp(target, 'i') : target;
            amulet = this.sdk.findInventoryItem(pattern);
        } else {
            amulet = target;
        }

        if (!amulet) {
            return { success: false, message: `Amulet not found: ${target}`, reason: 'no_amulet' };
        }

        // Find ball of wool / string
        const string = this.sdk.findInventoryItem(/ball of wool/i);
        if (!string) {
            return { success: false, message: 'No ball of wool in inventory', reason: 'no_string' };
        }

        const craftingBefore = this.sdk.getSkill('Crafting')?.experience || 0;
        const startTick = this.sdk.getState()?.tick || 0;
        const msgBaseline = this.helpers.getMessageTick();

        // Use string on amulet
        const useResult = await this.sdk.sendUseItemOnItem(string.slot, amulet.slot);
        if (!useResult.success) {
            return { success: false, message: useResult.message, reason: 'no_amulet' };
        }

        // Wait for XP gain or failure
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const state = this.sdk.getState();
            if (!state) {
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Check for Crafting XP gain
            const currentXp = state.skills.find(s => s.name === 'Crafting')?.experience || 0;
            if (currentXp > craftingBefore) {
                const strung = this.sdk.findInventoryItem(/amulet/i);
                return {
                    success: true,
                    message: 'Strung amulet successfully',
                    xpGained: currentXp - craftingBefore,
                    product: strung || undefined
                };
            }

            // Check for failure messages
            for (const msg of state.gameMessages) {
                if (this.helpers.isMessageAfter(msg, msgBaseline)) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("need a crafting level") || text.includes("level to")) {
                        return { success: false, message: 'Crafting level too low', reason: 'level_too_low' };
                    }
                }
            }

            await this.sdk.waitForTicks(1);
        }

        // Final XP check
        const finalXp = this.sdk.getSkill('Crafting')?.experience || 0;
        if (finalXp > craftingBefore) {
            const strung = this.sdk.findInventoryItem(/amulet/i);
            return {
                success: true,
                message: 'Strung amulet successfully',
                xpGained: finalXp - craftingBefore,
                product: strung || undefined
            };
        }

        return { success: false, message: 'Stringing amulet timed out', reason: 'timeout' };
    }
}

// Re-export for convenience
export { BotSDK } from './index';
export * from './types';
