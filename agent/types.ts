// Shared types for Bot SDK
// Extracted from sync.ts and webclient/src/bot/BotSDK.ts

// ============ State Types ============

export interface PlayerState {
    name: string;
    combatLevel: number;
    x: number;
    z: number;
    worldX: number;
    worldZ: number;
    level: number;
    runEnergy: number;
    runWeight: number;
}

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
    options: string[];
    optionsWithIndex: InventoryItemOption[];
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
    options: string[];
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
    opIndex: number;  // 1-5 corresponding to OPLOC1-5
}

export interface NearbyLoc {
    id: number;
    name: string;
    x: number;
    z: number;
    distance: number;
    options: string[];
    optionsWithIndex: LocOption[];
}

export interface GameMessage {
    type: number;
    text: string;
    sender: string;
    tick: number;  // Game tick when message arrived
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

export interface ShopItem {
    slot: number;
    id: number;
    name: string;
    count: number;
}

export interface ShopState {
    isOpen: boolean;
    title: string;
    shopItems: ShopItem[];
    playerItems: ShopItem[];
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
}

// ============ Action Types ============

export type BotAction =
    | { type: 'none'; reason: string }
    | { type: 'wait'; reason: string; ticks?: number }
    | { type: 'talkToNpc'; npcIndex: number; reason: string }
    | { type: 'interactNpc'; npcIndex: number; optionIndex: number; reason: string }
    | { type: 'clickDialogOption'; optionIndex: number; reason: string }
    | { type: 'clickInterfaceOption'; optionIndex: number; reason: string }
    | { type: 'clickInterfaceComponent'; componentId: number; optionIndex?: number; reason: string }
    | { type: 'acceptCharacterDesign'; reason: string }
    | { type: 'skipTutorial'; reason: string }
    | { type: 'walkTo'; x: number; z: number; running?: boolean; reason: string }
    | { type: 'useInventoryItem'; slot: number; optionIndex: number; reason: string }
    | { type: 'dropItem'; slot: number; reason: string }
    | { type: 'pickupItem'; x: number; z: number; itemId: number; reason: string }
    | { type: 'interactGroundItem'; x: number; z: number; itemId: number; optionIndex: number; reason: string }
    | { type: 'interactLoc'; x: number; z: number; locId: number; optionIndex: number; reason: string }
    | { type: 'shopBuy'; slot: number; amount: number; reason: string }
    | { type: 'shopSell'; slot: number; amount: number; reason: string }
    | { type: 'closeShop'; reason: string }
    | { type: 'setCombatStyle'; style: number; reason: string }
    | { type: 'useItemOnItem'; sourceSlot: number; targetSlot: number; reason: string }
    | { type: 'useItemOnLoc'; itemSlot: number; x: number; z: number; locId: number; reason: string }
    | { type: 'say'; message: string; reason: string }
    | { type: 'spellOnNpc'; npcIndex: number; spellComponent: number; reason: string }
    | { type: 'spellOnItem'; slot: number; spellComponent: number; reason: string }
    | { type: 'bankDeposit'; slot: number; amount: number; reason: string }
    | { type: 'bankWithdraw'; slot: number; amount: number; reason: string };

export interface ActionResult {
    success: boolean;
    message: string;
}

// ============ Message Types ============

// Messages from Bot Client → Sync Server
export interface BotClientMessage {
    type: 'state' | 'actionResult' | 'setGoal' | 'connected';
    state?: BotWorldState;
    formattedState?: string;
    result?: ActionResult;
    actionId?: string;  // Echo back for correlation
    goal?: string;
    clientId?: string;
    username?: string;
}

// Messages from Sync Server → Bot Client
export interface SyncToBotMessage {
    type: 'action' | 'thinking' | 'error' | 'status';
    action?: BotAction;
    actionId?: string;  // For correlation
    thinking?: string;
    error?: string;
    status?: string;
}

// Messages from SDK → Sync Server
export interface SDKMessage {
    type: 'sdk_connect' | 'sdk_action';
    username: string;
    clientId?: string;
    actionId?: string;
    action?: BotAction;
}

// Messages from Sync Server → SDK
export interface SyncToSDKMessage {
    type: 'sdk_connected' | 'sdk_state' | 'sdk_action_result' | 'sdk_error';
    success?: boolean;
    state?: BotWorldState;
    actionId?: string;
    result?: ActionResult;
    error?: string;
}
