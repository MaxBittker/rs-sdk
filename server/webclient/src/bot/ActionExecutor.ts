// ActionExecutor.ts - Executes bot actions by calling client methods
// Maps BotAction types to actual game client operations

import type { Client } from '#/client/Client.js';
import type { BotAction, NearbyLoc, GroundItem } from './types.js';

export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;  // Optional data payload for scan results
}

export type ActionResultOrPromise = ActionResult | Promise<ActionResult>;

// Interface for on-demand scanning and component discovery (provided by StateCollector)
export interface ScanProvider {
    scanNearbyLocs(radius?: number): NearbyLoc[];
    scanGroundItems(radius?: number): GroundItem[];
    getPrayerComponentId(prayerIndex: number): number;
}

export class ActionExecutor {
    private client: Client;
    private scanProvider: ScanProvider | null = null;

    constructor(client: Client) {
        this.client = client;
    }

    setScanProvider(provider: ScanProvider): void {
        this.scanProvider = provider;
    }

    execute(action: BotAction): ActionResultOrPromise {
        try {
            switch (action.type) {
                case 'none':
                    return { success: true, message: 'No action' };

                case 'wait':
                    return { success: true, message: `Waiting ${action.ticks || 1} ticks` };

                case 'walkTo':
                    return this.wrapBool(
                        this.client.walkTo(action.x, action.z, action.running ?? true),
                        `Walking to (${action.x}, ${action.z})`,
                        'Failed to walk'
                    );

                case 'talkToNpc':
                    return this.wrapBool(
                        this.client.talkToNpc(action.npcIndex),
                        `Talking to NPC #${action.npcIndex}`,
                        'Failed to talk to NPC'
                    );

                case 'interactNpc':
                    return this.wrapBool(
                        this.client.interactNpc(action.npcIndex, action.optionIndex),
                        `Interacting with NPC #${action.npcIndex}`,
                        'Failed to interact with NPC'
                    );

                case 'interactPlayer':
                    return this.wrapBool(
                        this.client.interactPlayer(action.playerIndex, action.optionIndex),
                        `Interacting with player #${action.playerIndex}`,
                        'Failed to interact with player'
                    );

                case 'interactLoc':
                    return this.wrapBool(
                        this.client.interactLoc(action.x, action.z, action.locId, action.optionIndex),
                        `Interacting with loc ${action.locId}`,
                        'Failed to interact with location'
                    );

                case 'useInventoryItem':
                    return this.wrapBool(
                        this.client.useInventoryItem(action.slot, action.optionIndex),
                        `Using inventory slot ${action.slot}`,
                        'Failed to use inventory item'
                    );

                case 'dropItem':
                    return this.wrapBool(
                        this.client.dropInventoryItem(action.slot),
                        `Dropping item at slot ${action.slot}`,
                        'Failed to drop item'
                    );

                case 'pickupItem':
                    return this.wrapBool(
                        this.client.pickupGroundItem(action.x, action.z, action.itemId),
                        `Picking up item ${action.itemId}`,
                        'Failed to pickup item'
                    );

                case 'clickDialogOption':
                    return this.wrapBool(
                        this.client.clickDialogOption(action.optionIndex),
                        `Clicked dialog option ${action.optionIndex}`,
                        'Failed to click dialog option'
                    );

                case 'clickComponent':
                    // IF_BUTTON packet - for simple buttons, spellcasting, etc.
                    return this.wrapBool(
                        this.client.clickComponent(action.componentId),
                        `Clicked component ${action.componentId}`,
                        'Failed to click component'
                    );

                case 'clickComponentWithOption':
                    // INV_BUTTON packet - for components with inventory operations (smithing, crafting, etc.)
                    return this.wrapBool(
                        this.client.clickInterfaceIop(action.componentId, action.optionIndex, action.slot ?? 0),
                        `Clicked component ${action.componentId} option ${action.optionIndex} slot ${action.slot ?? 0}`,
                        'Failed to click component with option'
                    );

                case 'useItemOnItem':
                    return this.wrapBool(
                        this.client.useItemOnItem(action.sourceSlot, action.targetSlot),
                        `Using slot ${action.sourceSlot} on ${action.targetSlot}`,
                        'Failed to use item on item'
                    );

                case 'useItemOnLoc':
                    return this.wrapBool(
                        this.client.useItemOnLoc(action.itemSlot, action.x, action.z, action.locId),
                        `Using item on location`,
                        'Failed to use item on location'
                    );

                case 'useItemOnNpc':
                    return this.wrapBool(
                        this.client.useItemOnNpc(action.itemSlot, action.npcIndex),
                        `Using item on NPC #${action.npcIndex}`,
                        'Failed to use item on NPC'
                    );

                case 'useEquipmentItem':
                    // Use INV_BUTTON for equipment (not OPHELD) - triggers inv_button1 script for unequip
                    return this.wrapBool(
                        this.client.clickEquipmentSlot(action.slot, action.optionIndex),
                        `Using equipment slot ${action.slot}`,
                        'Failed to use equipment item'
                    );

                case 'shopBuy':
                    return this.wrapBool(
                        this.client.shopBuy(action.slot, action.amount),
                        `Buying from slot ${action.slot}`,
                        'Failed to buy from shop'
                    );

                case 'shopSell':
                    return this.wrapBool(
                        this.client.shopSell(action.slot, action.amount),
                        `Selling from slot ${action.slot}`,
                        'Failed to sell to shop'
                    );

                case 'closeShop':
                    return this.wrapBool(
                        this.client.closeShop(),
                        'Closed shop',
                        'Failed to close shop'
                    );

                case 'closeModal':
                    return this.wrapBool(
                        this.client.closeModal(),
                        'Closed modal',
                        'Failed to close modal'
                    );

                case 'setCombatStyle':
                    return this.wrapBool(
                        this.client.setCombatStyle(action.style),
                        `Set combat style to ${action.style}`,
                        'Failed to set combat style'
                    );

                case 'spellOnNpc':
                    return this.wrapBool(
                        this.client.spellOnNpc(action.npcIndex, action.spellComponent),
                        `Casting spell on NPC #${action.npcIndex}`,
                        'Failed to cast spell on NPC'
                    );

                case 'spellOnItem':
                    return this.wrapBool(
                        this.client.spellOnItem(action.slot, action.spellComponent),
                        `Casting spell on item slot ${action.slot}`,
                        'Failed to cast spell on item'
                    );

                case 'setTab':
                    return this.wrapBool(
                        this.client.setTab(action.tabIndex),
                        `Switched to tab ${action.tabIndex}`,
                        'Failed to switch tab'
                    );

                case 'bankDeposit':
                    return this.wrapBool(
                        this.client.bankDeposit(action.slot, action.amount),
                        `Depositing from slot ${action.slot}`,
                        'Failed to deposit'
                    );

                case 'bankWithdraw':
                    return this.wrapBool(
                        this.client.bankWithdraw(action.slot, action.amount),
                        `Withdrawing from slot ${action.slot}`,
                        'Failed to withdraw'
                    );

                case 'acceptCharacterDesign':
                    // TODO: Should be parameterized as (gender, kits[7], colours[5])
                    // Currently uses hidden client state
                    return this.wrapBool(
                        this.client.acceptCharacterDesign(),
                        'Character design accepted',
                        'Failed to accept character design'
                    );

                case 'randomizeCharacterDesign':
                    return this.wrapBool(
                        this.client.randomizeCharacterDesign(),
                        'Character design randomized',
                        'Failed to randomize character design'
                    );

                case 'interactGroundItem':
                    return this.wrapBool(
                        this.client.interactGroundItem(action.x, action.z, action.itemId, action.optionIndex),
                        `Interacting with ground item ${action.itemId}`,
                        'Failed to interact with ground item'
                    );

                case 'say':
                    return this.wrapBool(
                        this.client.say(action.message),
                        `Said: ${action.message}`,
                        'Failed to send message'
                    );

                case 'scanNearbyLocs':
                    if (!this.scanProvider) {
                        return { success: false, message: 'No scan provider available' };
                    }
                    return {
                        success: true,
                        message: `Scanned nearby locations`,
                        data: this.scanProvider.scanNearbyLocs(action.radius)
                    };

                case 'scanGroundItems':
                    if (!this.scanProvider) {
                        return { success: false, message: 'No scan provider available' };
                    }
                    return {
                        success: true,
                        message: `Scanned ground items`,
                        data: this.scanProvider.scanGroundItems(action.radius)
                    };

                case 'togglePrayer': {
                    if (!this.scanProvider) {
                        return { success: false, message: 'No scan provider available' };
                    }
                    if (action.prayerIndex < 0 || action.prayerIndex > 14) {
                        return { success: false, message: `Invalid prayer index: ${action.prayerIndex}` };
                    }
                    const componentId = this.scanProvider.getPrayerComponentId(action.prayerIndex);
                    if (componentId === -1) {
                        return { success: false, message: `Prayer component not found for index ${action.prayerIndex}` };
                    }
                    return this.wrapBool(
                        this.client.clickComponent(componentId),
                        `Toggled prayer ${action.prayerIndex}`,
                        `Failed to toggle prayer ${action.prayerIndex}`
                    );
                }

                default:
                    return { success: false, message: `Unknown action type: ${(action as any).type}` };
            }
        } catch (e) {
            return { success: false, message: `Error: ${e}` };
        }
    }

    // Helper to wrap boolean client methods
    private wrapBool(result: boolean, successMsg: string, failMsg: string): ActionResult {
        return result ? { success: true, message: successMsg } : { success: false, message: failMsg };
    }
}

// Format action for display in logs
export function formatAction(action: BotAction): string {
    switch (action.type) {
        case 'walkTo': return `Walk to (${action.x}, ${action.z})`;
        case 'interactNpc': return `Interact NPC #${action.npcIndex} opt ${action.optionIndex}`;
        case 'interactPlayer': return `Interact player #${action.playerIndex} opt ${action.optionIndex}`;
        case 'talkToNpc': return `Talk to NPC #${action.npcIndex}`;
        case 'interactLoc': return `Interact loc ${action.locId} at (${action.x}, ${action.z})`;
        case 'useInventoryItem': return `Use inv slot ${action.slot} opt ${action.optionIndex}`;
        case 'dropItem': return `Drop slot ${action.slot}`;
        case 'pickupItem': return `Pickup item ${action.itemId} at (${action.x}, ${action.z})`;
        case 'interactGroundItem': return `Interact ground item ${action.itemId} at (${action.x}, ${action.z})`;
        case 'clickDialogOption': return `Dialog option ${action.optionIndex}`;
        case 'clickComponent': return `Click component ${action.componentId}`;
        case 'clickComponentWithOption': return `Click component ${action.componentId} option ${action.optionIndex}`;
        case 'useItemOnItem': return `Use slot ${action.sourceSlot} on ${action.targetSlot}`;
        case 'useItemOnNpc': return `Use slot ${action.itemSlot} on NPC #${action.npcIndex}`;
        case 'shopBuy': return `Buy slot ${action.slot} x${action.amount}`;
        case 'shopSell': return `Sell slot ${action.slot} x${action.amount}`;
        case 'wait': return `Wait ${action.ticks || 1} ticks`;
        case 'acceptCharacterDesign': return 'Accept character design';
        case 'randomizeCharacterDesign': return 'Randomize character design';
        case 'say': return `Say: ${action.message}`;
        case 'togglePrayer': return `Toggle prayer ${action.prayerIndex}`;
        default: return action.type;
    }
}
