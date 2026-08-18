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
export const BANK_MAIN_ID = 5292; // Main bank interface (mainModalId)
export const BANK_MAIN_INV_ID = 5382; // Bank inventory component (bank_main:inv)
export const BANK_SIDE_INV_ID = 2006; // Side panel inventory for depositing

// Player trade interface IDs (interface_trade content pack)
export const TRADE_SIDE_ID = 3321; // tradeside - side panel (your inventory, "Offer" options)
export const TRADE_SIDE_INV_ID = 3322; // tradeside:inv - INV_BUTTON1..5 = Offer 1/5/10/All/X
export const TRADE_MAIN_ID = 3323; // trademain - first trade screen (mainModalId)
export const TRADE_MAIN_INV_ID = 3415; // trademain:inv - your offer, INV_BUTTON1..5 = Remove 1/5/10/All/X
export const TRADE_MAIN_OTHER_INV_ID = 3416; // trademain:otherinv - partner's offer (read-only)
export const TRADE_MAIN_PARTNER_TEXT_ID = 3417; // trademain:otherplayer - "Trading With: <name>"
export const TRADE_MAIN_ACCEPT_ID = 3420; // trademain:accept - IF_BUTTON
export const TRADE_MAIN_STATUS_TEXT_ID = 3431; // trademain:status - ""/"Waiting for other player..."/"Other player has accepted."
export const TRADE_CONFIRM_ID = 3443; // tradeconfirm - second trade screen (mainModalId)
export const TRADE_CONFIRM_INV1_ID = 3542; // tradeconfirm:inv1 - your offer (<= 13 items variant)
export const TRADE_CONFIRM_INV2_ID = 3538; // tradeconfirm:inv2 - your offer (> 13 items variant)
export const TRADE_CONFIRM_OTHER_INV1_ID = 3532; // tradeconfirm:otherinv1 - partner offer (<= 13 items)
export const TRADE_CONFIRM_OTHER_INV2_ID = 3539; // tradeconfirm:otherinv2 - partner offer (> 13 items)
export const TRADE_CONFIRM_STATUS_TEXT_ID = 3535; // tradeconfirm:com_91 - "Are you sure..."/"Waiting for other player."/"Other player has accepted."
export const TRADE_CONFIRM_ACCEPT_ID = 3546; // tradeconfirm:accept - IF_BUTTON

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
    /** Discriminator so npc and player targets can share one API. */
    kind: 'npc';
    /**
     * NPC type/config id (matches server/content npc.pack). Not the world
     * slot - interact packets address `index`.
     */
    id: number;
    index: number;
    name: string;
    combatLevel: number;
    x: number;
    z: number;
    /**
     * Authoritative SW route tile (routeX[0]). `x`/`z` are the interpolated
     * render position, which trails a moving NPC by 1-3 tiles and is offset
     * by floor(size/2) for multi-tile NPCs; drops spawn on THIS tile.
     */
    tileX: number;
    tileZ: number;
    /** Footprint in tiles (1 = single tile, cows/giants are 2+). */
    size: number;
    distance: number;
    /** Current HP, or null until the server reveals it by updating the NPC. */
    hp: number | null;
    /** Maximum HP, or null until the server reveals it by updating the NPC. */
    maxHp: number | null;
    /** Health as percentage 0-100 (null until NPC takes damage) */
    healthPercent: number | null;
    /** Index of who this NPC is targeting (-1 if none) */
    targetIndex: number;
    /** Is this NPC currently in combat? (has target OR was hit within last 400 ticks) */
    inCombat: boolean;
    /** Public game tick when damage was last observed on this NPC. */
    lastCombatTick: number | null;
    /** Current animation ID (-1 = idle/none) */
    animId: number;
    /** Current spot animation ID (-1 = none) */
    spotanimId: number;
    optionsWithIndex: NpcOption[];  // Options with op index (use .map(o => o.text) for display)
    /** Convenience array of option text strings */
    options: string[];
    /**
     * Whether the client routefinder can currently path to this target. An
     * interaction with a `reachable: false` target fails with a silent
     * `cant_reach` before any packet is sent - pick another target instead.
     * Undefined when unknown (scene still loading, collision map not built).
     */
    reachable?: boolean;
}

export interface NearbyPlayer {
    /** Discriminator so npc and player targets can share one API. */
    kind: 'player';
    /** World slot of this player - what OPPLAYER1-5 and OPPLAYERT address. */
    index: number;
    name: string;
    combatLevel: number;
    x: number;
    z: number;
    distance: number;
    /** See NearbyNpc.reachable. */
    reachable?: boolean;
}

export interface GroundItem {
    id: number;
    name: string;
    count: number;
    x: number;
    z: number;
    distance: number;
    /** See NearbyNpc.reachable. Taking routes 0x0: you must stand on the pile. */
    reachable?: boolean;
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
    /**
     * Plane this loc was observed on - always the player's plane at scan
     * time. A loc carried across a climb/descend is stale: re-scan instead
     * of interacting with it, or the click resolves against the wrong floor.
     */
    level: number;
    distance: number;
    optionsWithIndex: LocOption[];  // Options with op index (use .map(o => o.text) for display)
    /** Convenience array of option text strings */
    options: string[];
    /** See NearbyNpc.reachable. Uses the loc's own reach rule. */
    reachable?: boolean;
}

/**
 * Result of Client/LiteClient.walkTo. `moved` reports whether a MOVE packet
 * was emitted. `outOfRange` reports that the destination lies outside the
 * current 104x104 build area - the emitted path (if any) is then only a leg
 * toward the scene edge, not a route to the destination; crossing the edge
 * rebuilds the scene and the caller must dispatch the next leg itself.
 */
export interface WalkResult {
    moved: boolean;
    outOfRange: boolean;
}

export interface MenuAction {
    option: string;
    actionCode: number;
    paramA: number;
    paramB: number;
    paramC: number;
}

export interface GameMessage {
    type: number;  // 0=game, 1=public(crowned), 2=public chat, 3=PM recv, 6=PM sent, 7=PM(crowned)
    text: string;
    sender: string;     // @cr/@col codes stripped; empty for system messages
    tick: number;
    /** Monotonic publication revision when this message first became agent-visible. */
    observationId?: number;
    fromSelf: boolean;  // true if this client sent it (own speech or sent PM)
}

export interface DialogEntry {
    text: string[];      // Lines of text in the dialog
    tick: number;        // Game tick when captured
    /** Monotonic publication revision when this dialog first became agent-visible. */
    observationId?: number;
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

/** An item slot inside a trade offer window. */
export interface TradeItem {
    slot: number;
    id: number;
    name: string;
    count: number;
}

/**
 * Player-to-player trade session state, read from the trademain/tradeconfirm
 * interfaces. Accept flags are parsed from the server-set status text — on
 * each screen at most one of myAccepted/partnerAccepted is ever true, because
 * the second accept advances (or completes) the trade. Any offer change
 * resets both accepts server-side.
 */
export interface TradeState {
    isOpen: boolean;
    /** 'offer' = first screen (offers editable), 'confirm' = final screen. */
    screen: 'offer' | 'confirm' | null;
    /** Partner display name, from "Trading With: <name>". */
    partner: string | null;
    myOffer: TradeItem[];
    theirOffer: TradeItem[];
    /** True when this client accepted and is waiting on the partner. */
    myAccepted: boolean;
    /** True when the partner accepted the current screen. */
    partnerAccepted: boolean;
}

export interface BankState {
    isOpen: boolean;
    items: BankItem[];
    /**
     * Whether withdrawals arrive as banknotes - the bank_main note/item
     * toggle, mirrored from varp 115 (%bankcert). Meaningless while the
     * bank is closed.
     */
    noteMode: boolean;
}

/** Combat state tracking for player */
export interface PlayerCombatState {
    /** Currently engaged in combat (has a target) */
    inCombat: boolean;
    /**
     * Index of the NPC/player we're targeting (-1 if none), already decoded:
     * the client packs player targets as index + 32768, this does not.
     * Read alongside `targetType` - index 7 is a different entity in each space.
     */
    targetIndex: number;
    /** What `targetIndex` refers to. */
    targetType: 'npc' | 'player' | 'none';
    /** Tick when we last took damage (-1 if never) */
    lastDamageTick: number;
}

export interface PlayerState {
    name: string;
    combatLevel: number;
    /** Current hitpoints level (boosted/drained) */
    hp: number;
    /** Base hitpoints level (max HP) */
    maxHp: number;
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
    /** True while the player's hitpoints are zero. */
    isDead: boolean;
    /** Changes after each observed death/respawn cycle. */
    lifeId: number;
    /** Number of respawns observed during this client session. */
    respawnCount: number;
    /** Public game tick when death was last observed, or null if none was observed. */
    lastDeathTick: number | null;
}

// Combat style state
export interface CombatStyleOption {
    index: number;      // 0-3, the value com_mode takes for this style
    name: string;       // "Punch", "Kick", "Block", etc. ("Style 2" if the tab is unrecognised)
    type: string;       // "Accurate", "Aggressive", "Defensive", "Controlled", "Rapid", "Longrange", "Unknown"
    /** Every skill this style trains, e.g. ["Attack","Strength","Defence"] for controlled. Empty when the tab is unrecognised. */
    trainsSkills: string[];
    /** Damage type rolled against defence bonuses: "Stab", "Slash", "Crush", "Ranged", "Unknown". */
    damageType: string;
}

export interface CombatStyleState {
    currentStyle: number;           // 0-3, the selected style
    weaponName: string;             // Name of equipped weapon or "Unarmed"
    styles: CombatStyleOption[];    // Available combat styles for this weapon
    /** Interface id of the combat tab the server installed - the weapon category, effectively. */
    tabInterfaceId: number;
    /** False when the combat tab is unrecognised and style metadata is a best guess. */
    known: boolean;
}

/** Combat event for tracking damage, kills, etc. */
export interface CombatEvent {
    /** Game tick when event occurred */
    tick: number;
    /** Monotonic publication revision when this event first became agent-visible. */
    observationId?: number;
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

/**
 * Evidence that the server discarded an op instead of running it, which it
 * otherwise does completely silently. A strong hint, not a proof: the server
 * also unsets the map flag when a walk finishes normally.
 */
export interface OpFeedbackState {
    /** UNSET_MAP_FLAG packets received this client session. */
    mapFlagUnsetCount: number;
    /** Tick of the most recent UNSET_MAP_FLAG, -1 if never. */
    lastMapFlagUnsetTick: number;
    /**
     * Unsets that arrived while the player was standing still, i.e. probable
     * rejections. Monotonic: snapshot it before sending an op, compare after.
     * Counts refused packets, not refused interactions.
     */
    opRejectedCount: number;
    /** Tick of the most recent counted rejection, -1 if never. For logging. */
    lastOpRejectedTick: number;
}

export interface BotState {
    tick: number;
    /** Monotonic publication cursor; advances for each state sent to agents. */
    revision: number;
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
    trade: TradeState;
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
    /** Authoritative client varp 78: a PK skull is currently active. */
    isSkulled: boolean;
    /** Authoritative client varp 172: server auto-retaliation is enabled. */
    autoRetaliateEnabled: boolean;
    /** Whether the server accepted or silently discarded recent ops */
    opFeedback: OpFeedbackState;
}

// Extended world state interface for agent (includes extra debug info)
export interface BotWorldState extends BotState {
    /** Tick on which a policy-gated Lite runner already emitted KBD op2. */
    fastKbdAttackTick?: number;
    /** Prayer-on packets emitted in-process immediately before first-spawn KBD op2. */
    fastKbdPrayerOn?: { tick: number; prayerIndices: number[] };
    /** Prayer-off packets emitted in-process on the KBD-removal publication. */
    fastKbdPrayerOff?: { tick: number; prayerIndices: number[] };
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
    | { type: 'useInventoryItem'; slot: number; optionIndex: number; interfaceId?: number; reason: string }
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
    | { type: 'spellOnPlayer'; playerIndex: number; spellComponent: number; reason: string }
    | { type: 'spellOnItem'; slot: number; spellComponent: number; reason: string }
    | { type: 'spellOnGroundItem'; x: number; z: number; itemId: number; spellComponent: number; reason: string }
    | { type: 'setTab'; tabIndex: number; reason: string }
    | { type: 'say'; message: string; reason: string }
    | { type: 'privateMessage'; targetName: string; message: string; reason: string }
    | { type: 'bankDeposit'; slot: number; amount: number; reason: string }
    | { type: 'bankWithdraw'; slot: number; amount: number; reason: string }
    | { type: 'submitCountDialog'; value: number; reason: string }
    // On-demand scanning (returns data in action result)
    | { type: 'scanNearbyLocs'; radius?: number; reason: string }
    | { type: 'scanGroundItems'; radius?: number; reason: string }
    // Prayer toggle
    | { type: 'togglePrayer'; prayerIndex: number; reason: string };
