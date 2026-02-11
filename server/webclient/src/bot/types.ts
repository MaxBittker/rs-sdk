// types.ts - Bot SDK Type Definitions
// All interfaces, constants, and type definitions for the Bot SDK

// Skill names in order of their indices
export const SKILL_NAMES: string[] = [
    'Attack', 'Defence', 'Strength', 'Hitpoints', 'Ranged', 'Prayer', 'Magic',
    'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting',
    'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Stat18', 'Stat19',
    'Runecraft'
];

// Interface IDs for common inventories
export const INVENTORY_INTERFACE_ID = 3214; // Main backpack inventory
export const EQUIPMENT_INTERFACE_ID = 1688; // Equipped items

// Shop interface IDs
export const SHOP_TEMPLATE_SIDE_ID = 3822; // Side panel with player inventory for selling
export const SHOP_TEMPLATE_SIDE_INV_ID = 3823; // Inventory component in side panel
export const SHOP_TEMPLATE_ID = 3824; // Main shop interface
export const SHOP_TEMPLATE_INV_ID = 3900; // Shop inventory component

// Bank interface IDs
export const BANK_MAIN_ID = 5292; // Main bank interface (viewportInterfaceId)
export const BANK_MAIN_INV_ID = 5382; // Bank inventory component (bank_main:inv)
export const BANK_SIDE_INV_ID = 2006; // Side panel inventory for depositing

// Interfaces for state data
export interface SkillState {
    name: string;
    level: number;
    baseLevel: number;
    experience: number;
}

export interface InventoryItemOption {
    text: string;
    opIndex: number;  // 1-5 corresponding to OPHELD1-5
}

export interface InventoryItem {
    slot: number;
    id: number;
    name: string;
    count: number;
    optionsWithIndex: InventoryItemOption[];  // Options with op index (use .map(o => o.text) for display)
}

export interface NpcOption {
    text: string;
    opIndex: number;  // 1-5 corresponding to OPNPC1-5
}

export interface NearbyNpc {
    index: number;
    name: string;
    combatLevel: number;
    x: number;
    z: number;
    distance: number;
    /** Current HP - NOTE: 0 until NPC takes damage (server only sends on hit) */
    hp: number;
    /** Max HP - NOTE: 0 until NPC takes damage (server only sends on hit) */
    maxHp: number;
    /** Health as percentage 0-100 (null until NPC takes damage) */
    healthPercent: number | null;
    /** Index of who this NPC is targeting (-1 if none) */
    targetIndex: number;
    /** Is this NPC currently in combat? (has target OR was hit within last 400 ticks) */
    inCombat: boolean;
    /** Combat cycle - set to tick+400 when NPC takes damage. Compare with state.tick for timing. */
    combatCycle: number;
    /** Current animation ID (-1 = idle/none) */
    animId: number;
    /** Current spot animation ID (-1 = none) */
    spotanimId: number;
    optionsWithIndex: NpcOption[];  // Options with op index (use .map(o => o.text) for display)
    /** Convenience array of option text strings */
    options: string[];
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
    opIndex: number;  // 1-5 corresponding to OPLOC1-5
}

export interface NearbyLoc {
    id: number;
    name: string;
    x: number;
    z: number;
    distance: number;
    optionsWithIndex: LocOption[];  // Options with op index (use .map(o => o.text) for display)
    /** Convenience array of option text strings */
    options: string[];
}

export interface MenuAction {
    option: string;
    actionCode: number;
    paramA: number;
    paramB: number;
    paramC: number;
}

export interface GameMessage {
    type: number;  // 0=game, 2=public chat, 3=private, etc.
    text: string;
    sender: string;
    tick: number;
}

export interface DialogEntry {
    text: string[];      // Lines of text in the dialog
    tick: number;        // Game tick when captured
    interfaceId: number; // Interface ID of the dialog
}

export interface ShopItem {
    slot: number;
    id: number;
    name: string;
    count: number;
    baseCost: number;   // ObjType.cost - base item value
    buyPrice: number;   // Calculated buy price (what player pays to shop)
    sellPrice: number;  // Calculated sell price (what shop pays player)
}

export interface ShopConfig {
    buyMultiplier: number;   // varp 127 - used when selling TO shop
    sellMultiplier: number;  // varp 128 - used when buying FROM shop
    haggle: number;          // varp 129 - price delta per stock
}

export interface ShopState {
    isOpen: boolean;
    title: string;
    shopItems: ShopItem[];      // Items the shop is selling
    playerItems: ShopItem[];    // Player inventory items (for selling)
    shopConfig?: ShopConfig;
}

export interface BankItem {
    slot: number;
    id: number;
    name: string;
    count: number;
}

export interface BankState {
    isOpen: boolean;
    items: BankItem[];
}

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
    level: number; // Map plane (0-3)
    runEnergy: number;
    runWeight: number;
    /** Current animation ID (-1 = idle/none) */
    animId: number;
    /** Current spot animation ID (-1 = none). Spot anims are effects like spell impacts, combat hits, etc. */
    spotanimId: number;
    /** Combat state tracking */
    combat: PlayerCombatState;
}

// Combat style state
export interface CombatStyleOption {
    index: number;      // 0-3
    name: string;       // "Punch", "Kick", "Block", etc.
    type: string;       // "Accurate", "Aggressive", "Defensive", "Controlled"
    trainedSkill: string; // "Attack", "Strength", "Defence", "Shared"
}

export interface CombatStyleState {
    currentStyle: number;           // 0-3, the selected style
    weaponName: string;             // Name of equipped weapon or "Unarmed"
    styles: CombatStyleOption[];    // Available combat styles for this weapon
}

/** Combat event for tracking damage, kills, etc. */
export interface CombatEvent {
    /** Game tick when event occurred */
    tick: number;
    /** Type of combat event */
    type: 'damage_taken' | 'damage_dealt' | 'kill';
    /** Damage amount (for damage events) */
    damage: number;
    /** Source of damage/kill */
    sourceType: 'player' | 'npc' | 'other_player';
    /** Index of the source entity (-1 if unknown/self) */
    sourceIndex: number;
    /** Target of damage/kill */
    targetType: 'player' | 'npc' | 'other_player';
    /** Index of the target entity (-1 if self) */
    targetIndex: number;
}

export interface DialogState {
    isOpen: boolean;
    options: Array<{ index: number; text: string }>;
    isWaiting: boolean;
}

export interface InterfaceState {
    isOpen: boolean;
    interfaceId: number;
    options: Array<{ index: number; text: string }>;
}

export interface PrayerState {
    /** Active state of each prayer (indexed 0-14) */
    activePrayers: boolean[];
    /** Current prayer points (skill level) */
    prayerPoints: number;
    /** Base prayer level */
    prayerLevel: number;
}

export interface BotState {
    tick: number;
    player: PlayerState | null;
    skills: SkillState[];
    inventory: InventoryItem[];
    equipment: InventoryItem[];
    combatStyle: CombatStyleState;
    nearbyNpcs: NearbyNpc[];
    nearbyPlayers: NearbyPlayer[];
    nearbyLocs: NearbyLoc[];
    groundItems: GroundItem[];
    gameMessages: GameMessage[];
    /** Recent dialogs that have appeared (NPC chat, popups, etc.) */
    recentDialogs: DialogEntry[];
    menuActions: MenuAction[];
    shop: ShopState;
    bank: BankState;
    inGame: boolean;
    /** Recent combat events (damage, kills) - bounded to last ~50 ticks */
    combatEvents: CombatEvent[];
    /** Dialog state (NPC chat, options) */
    dialog: DialogState;
    /** Interface state (crafting menus, etc.) */
    interface: InterfaceState;
    /** Whether a modal interface is open */
    modalOpen: boolean;
    /** The ID of the modal interface (-1 if none) */
    modalInterface: number;
    /** Prayer state (active prayers, prayer points) */
    prayers: PrayerState;
}

// Extended world state interface for agent (includes extra debug info)
export interface BotWorldState extends BotState {
    dialog: DialogState & {
        allComponents?: Array<{ id: number; type: number; buttonType: number; option: string; text: string }>;
    };
    interface: InterfaceState & {
        debugInfo: string[];
    };
}

// Packet log entry interface
export interface PacketLogEntry {
    timestamp: number;
    opcode: number;
    name: string;
    size: number;
    data: string;
}

// SDK action types - pure primitives that map to game protocol
// Domain logic lives in BotActions (sdk/actions.ts), not here
export type BotAction =
    | { type: 'none'; reason: string }
    | { type: 'wait'; reason: string; ticks?: number }
    | { type: 'talkToNpc'; npcIndex: number; reason: string }
    | { type: 'interactNpc'; npcIndex: number; optionIndex: number; reason: string }
    | { type: 'interactPlayer'; playerIndex: number; optionIndex: number; reason: string }
    | { type: 'clickDialogOption'; optionIndex: number; reason: string }
    // clickComponent: IF_BUTTON packet - for simple buttons, spellcasting, etc.
    | { type: 'clickComponent'; componentId: number; reason: string }
    // clickComponentWithOption: INV_BUTTON packet - for components with inventory operations (smithing, crafting, etc.)
    | { type: 'clickComponentWithOption'; componentId: number; optionIndex: number; slot?: number; reason: string }
    | { type: 'acceptCharacterDesign'; reason: string }
    | { type: 'randomizeCharacterDesign'; reason: string }
    | { type: 'walkTo'; x: number; z: number; running?: boolean; reason: string }
    | { type: 'useInventoryItem'; slot: number; optionIndex: number; reason: string }
    | { type: 'dropItem'; slot: number; reason: string }
    | { type: 'pickupItem'; x: number; z: number; itemId: number; reason: string }
    | { type: 'interactGroundItem'; x: number; z: number; itemId: number; optionIndex: number; reason: string }
    | { type: 'interactLoc'; x: number; z: number; locId: number; optionIndex: number; reason: string }
    | { type: 'useItemOnItem'; sourceSlot: number; targetSlot: number; reason: string }
    | { type: 'useItemOnLoc'; itemSlot: number; x: number; z: number; locId: number; reason: string }
    | { type: 'useItemOnNpc'; itemSlot: number; npcIndex: number; reason: string }
    | { type: 'useEquipmentItem'; slot: number; optionIndex: number; reason: string }
    | { type: 'shopBuy'; slot: number; amount: number; reason: string }
    | { type: 'shopSell'; slot: number; amount: number; reason: string }
    | { type: 'closeShop'; reason: string }
    | { type: 'closeModal'; reason: string }
    | { type: 'setCombatStyle'; style: number; reason: string }
    | { type: 'spellOnNpc'; npcIndex: number; spellComponent: number; reason: string }
    | { type: 'spellOnItem'; slot: number; spellComponent: number; reason: string }
    | { type: 'setTab'; tabIndex: number; reason: string }
    | { type: 'say'; message: string; reason: string }
    | { type: 'bankDeposit'; slot: number; amount: number; reason: string }
    | { type: 'bankWithdraw'; slot: number; amount: number; reason: string }
    // On-demand scanning (returns data in action result)
    | { type: 'scanNearbyLocs'; radius?: number; reason: string }
    | { type: 'scanGroundItems'; radius?: number; reason: string }
    // Prayer toggle
    | { type: 'togglePrayer'; prayerIndex: number; reason: string };
