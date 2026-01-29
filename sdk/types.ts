// Re-export all types from the agent types module
// This file provides the full type definitions for remote SDK users

// ============ State Types ============

/** Combat state tracking for player */
export interface PlayerCombatState {
    /** Currently engaged in combat (has a target) */
    inCombat: boolean;
    /** Index of NPC/player we're targeting (-1 if none) */
    targetIndex: number;
    /** Tick when we last took damage (-1 if never) */
    lastDamageTick: number;
}

export interface PlayerState {
    name: string;
    combatLevel: number;
    x: number;
    z: number;
    worldX: number;
    worldZ: number;
    /** Map plane/floor: 0=ground, 1=first floor (upstairs), 2=second floor, 3=third floor */
    level: number;
    runEnergy: number;
    runWeight: number;
    /** Current animation ID (-1 = idle/none) */
    animId: number;
    /** Current spot animation ID (-1 = none) */
    spotanimId: number;
    /** Combat state tracking */
    combat: PlayerCombatState;
}

export interface SkillState {
    name: string;
    level: number;
    baseLevel: number;
    experience: number;
}

export interface InventoryItemOption {
    text: string;
    opIndex: number;
}

export interface InventoryItem {
    slot: number;
    id: number;
    name: string;
    count: number;
    optionsWithIndex: InventoryItemOption[];
}

export interface NpcOption {
    text: string;
    opIndex: number;
}

export interface NearbyNpc {
    index: number;
    name: string;
    combatLevel: number;
    x: number;
    z: number;
    distance: number;
    hp: number;
    maxHp: number;
    healthPercent: number | null;
    targetIndex: number;
    inCombat: boolean;
    combatCycle: number;
    animId: number;
    spotanimId: number;
    optionsWithIndex: NpcOption[];
}

export interface NearbyPlayer {
    index: number;
    name: string;
    combatLevel: number;
    x: number;
    z: number;
    distance: number;
}

export interface GroundItem {
    id: number;
    name: string;
    count: number;
    x: number;
    z: number;
    distance: number;
}

export interface LocOption {
    text: string;
    opIndex: number;
}

export interface NearbyLoc {
    id: number;
    name: string;
    x: number;
    z: number;
    distance: number;
    optionsWithIndex: LocOption[];
}

export interface GameMessage {
    type: number;
    text: string;
    sender: string;
    tick: number;
}

export interface DialogOption {
    index: number;
    text: string;
    componentId?: number;
    buttonType?: number;
}

export interface DialogComponent {
    id: number;
    type: number;
    buttonType: number;
    option: string;
    text: string;
}

export interface DialogState {
    isOpen: boolean;
    options: DialogOption[];
    isWaiting: boolean;
    text?: string;
    allComponents?: DialogComponent[];
}

export interface InterfaceState {
    isOpen: boolean;
    interfaceId: number;
    options: Array<{ index: number; text: string; componentId: number }>;
}

export interface ShopItem {
    slot: number;
    id: number;
    name: string;
    count: number;
    baseCost: number;
    buyPrice: number;
    sellPrice: number;
}

export interface ShopConfig {
    buyMultiplier: number;
    sellMultiplier: number;
    haggle: number;
}

export interface ShopState {
    isOpen: boolean;
    title: string;
    shopItems: ShopItem[];
    playerItems: ShopItem[];
    shopConfig?: ShopConfig;
}

export interface CombatStyleOption {
    index: number;
    name: string;
    type: string;
    trainedSkill: string;
}

export interface CombatStyleState {
    currentStyle: number;
    weaponName: string;
    styles: CombatStyleOption[];
}

export interface CombatEvent {
    tick: number;
    type: 'damage_taken' | 'damage_dealt' | 'kill';
    damage: number;
    sourceType: 'player' | 'npc' | 'other_player';
    sourceIndex: number;
    targetType: 'player' | 'npc' | 'other_player';
    targetIndex: number;
}

export interface BotWorldState {
    tick: number;
    inGame: boolean;
    player: PlayerState | null;
    skills: SkillState[];
    inventory: InventoryItem[];
    equipment: InventoryItem[];
    nearbyNpcs: NearbyNpc[];
    nearbyPlayers: NearbyPlayer[];
    nearbyLocs: NearbyLoc[];
    groundItems: GroundItem[];
    gameMessages: GameMessage[];
    dialog: DialogState;
    interface: InterfaceState;
    shop: ShopState;
    modalOpen: boolean;
    modalInterface: number;
    combatStyle?: CombatStyleState;
    combatEvents: CombatEvent[];
}

// ============ Action Types ============

export type BotAction =
    | { type: 'none'; reason: string }
    | { type: 'wait'; reason: string; ticks?: number }
    | { type: 'talkToNpc'; npcIndex: number; reason: string }
    | { type: 'interactNpc'; npcIndex: number; optionIndex: number; reason: string }
    | { type: 'clickDialogOption'; optionIndex: number; reason: string }
    // clickComponent: IF_BUTTON packet - for simple buttons, spellcasting, etc.
    | { type: 'clickComponent'; componentId: number; reason: string }
    // clickComponentWithOption: INV_BUTTON packet - for components with inventory operations (smithing, crafting, etc.)
    | { type: 'clickComponentWithOption'; componentId: number; optionIndex: number; reason: string }
    // TODO: acceptCharacterDesign should be parameterized as (gender, kits[7], colours[5])
    // Currently uses hidden client state - the SDK cannot set design values before accepting.
    // For now, bot client uses whatever design state exists (usually defaults or randomized).
    | { type: 'acceptCharacterDesign'; reason: string }
    | { type: 'walkTo'; x: number; z: number; running?: boolean; reason: string }
    | { type: 'useInventoryItem'; slot: number; optionIndex: number; reason: string }
    | { type: 'useEquipmentItem'; slot: number; optionIndex: number; reason: string }
    | { type: 'dropItem'; slot: number; reason: string }
    | { type: 'pickupItem'; x: number; z: number; itemId: number; reason: string }
    | { type: 'interactGroundItem'; x: number; z: number; itemId: number; optionIndex: number; reason: string }
    | { type: 'interactLoc'; x: number; z: number; locId: number; optionIndex: number; reason: string }
    | { type: 'shopBuy'; slot: number; amount: number; reason: string }
    | { type: 'shopSell'; slot: number; amount: number; reason: string }
    | { type: 'closeShop'; reason: string }
    | { type: 'closeModal'; reason: string }
    | { type: 'setCombatStyle'; style: number; reason: string }
    | { type: 'useItemOnItem'; sourceSlot: number; targetSlot: number; reason: string }
    | { type: 'useItemOnLoc'; itemSlot: number; x: number; z: number; locId: number; reason: string }
    | { type: 'say'; message: string; reason: string }
    | { type: 'spellOnNpc'; npcIndex: number; spellComponent: number; reason: string }
    | { type: 'spellOnItem'; slot: number; spellComponent: number; reason: string }
    | { type: 'setTab'; tabIndex: number; reason: string }
    | { type: 'bankDeposit'; slot: number; amount: number; reason: string }
    | { type: 'bankWithdraw'; slot: number; amount: number; reason: string }
    // On-demand scanning (returns data in action result)
    | { type: 'scanNearbyLocs'; radius?: number; reason: string }
    | { type: 'scanGroundItems'; radius?: number; reason: string };

export interface ActionResult {
    success: boolean;
    message: string;
    /** Optional data payload (used by scan actions to return results) */
    data?: any;
}

// ============ SDK Config ============

export interface SDKConfig {
    botUsername: string;
    /** Full WebSocket URL (e.g. wss://server.com/gateway). Overrides host/port if set. */
    gatewayUrl?: string;
    /** Gateway hostname (default: localhost) */
    host?: string;
    /** Gateway port (default: 7780) */
    port?: number;
    actionTimeout?: number;
    autoReconnect?: boolean;
    reconnectMaxRetries?: number;
    reconnectBaseDelay?: number;
    reconnectMaxDelay?: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// ============ Result Types ============

export interface ChopTreeResult {
    success: boolean;
    logs?: InventoryItem;
    message: string;
}

export interface BurnLogsResult {
    success: boolean;
    xpGained: number;
    message: string;
}

export interface PickupResult {
    success: boolean;
    item?: InventoryItem;
    message: string;
    reason?: 'item_not_found' | 'cant_reach' | 'inventory_full' | 'timeout';
}

export interface TalkResult {
    success: boolean;
    dialog?: DialogState;
    message: string;
}

export interface ShopResult {
    success: boolean;
    item?: InventoryItem;
    message: string;
}

export interface ShopSellResult {
    success: boolean;
    message: string;
    amountSold?: number;
    rejected?: boolean;
}

export type SellAmount = 1 | 5 | 10 | 'all';

export interface EquipResult {
    success: boolean;
    message: string;
}

export interface UnequipResult {
    success: boolean;
    message: string;
    item?: InventoryItem;
}

export interface EatResult {
    success: boolean;
    hpGained: number;
    message: string;
}

export interface AttackResult {
    success: boolean;
    message: string;
    reason?: 'npc_not_found' | 'no_attack_option' | 'out_of_reach' | 'already_in_combat' | 'timeout';
}

export interface CastSpellResult {
    success: boolean;
    message: string;
    hit?: boolean;
    xpGained?: number;
    reason?: 'npc_not_found' | 'out_of_reach' | 'no_runes' | 'timeout';
}

export interface OpenDoorResult {
    success: boolean;
    message: string;
    reason?: 'door_not_found' | 'no_open_option' | 'already_open' | 'walk_failed' | 'open_failed' | 'timeout';
    door?: NearbyLoc;
}

export interface FletchResult {
    success: boolean;
    message: string;
    xpGained?: number;
    product?: InventoryItem;
}

export interface CraftLeatherResult {
    success: boolean;
    message: string;
    xpGained?: number;
    itemsCrafted?: number;
    reason?: 'no_needle' | 'no_leather' | 'no_thread' | 'interface_not_opened' | 'level_too_low' | 'timeout' | 'no_xp_gained';
}

export interface SmithResult {
    success: boolean;
    message: string;
    xpGained?: number;
    itemsSmithed?: number;
    product?: InventoryItem;
    reason?: 'no_hammer' | 'no_bars' | 'no_anvil' | 'interface_not_opened' | 'level_too_low' | 'timeout' | 'no_xp_gained';
}

export interface OpenBankResult {
    success: boolean;
    message: string;
    reason?: 'no_bank_found' | 'no_bank_option' | 'timeout' | 'dialog_stuck';
}

export interface BankDepositResult {
    success: boolean;
    message: string;
    amountDeposited?: number;
    reason?: 'bank_not_open' | 'item_not_found' | 'timeout';
}

export interface BankWithdrawResult {
    success: boolean;
    message: string;
    item?: InventoryItem;
    reason?: 'bank_not_open' | 'timeout';
}
