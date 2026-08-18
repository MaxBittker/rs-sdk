// Re-export all types from the agent types module
// This file provides the full type definitions for remote SDK users

// ============ State Types ============

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
    /** True while the player's hitpoints are zero. */
    isDead: boolean;
    /** Changes after each observed death/respawn cycle. */
    lifeId: number;
    /** Number of respawns observed during this client session. */
    respawnCount: number;
    /** Public game tick when death was last observed, or null if none was observed. */
    lastDeathTick: number | null;
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
     * Authoritative SW route tile. `x`/`z` are the interpolated render
     * position, which trails a moving NPC by 1-3 tiles and is offset by
     * floor(size/2) for multi-tile NPCs; drops spawn on THIS tile. Optional
     * only against clients older than this field.
     */
    tileX?: number;
    tileZ?: number;
    /** Footprint in tiles (1 = single tile, cows/giants are 2+). */
    size?: number;
    distance: number;
    /** Current HP, or null until the server reveals it by updating the NPC. */
    hp: number | null;
    /** Maximum HP, or null until the server reveals it by updating the NPC. */
    maxHp: number | null;
    healthPercent: number | null;
    targetIndex: number;
    inCombat: boolean;
    /** Public game tick when damage was last observed on this NPC. */
    lastCombatTick: number | null;
    animId: number;
    spotanimId: number;
    optionsWithIndex: NpcOption[];
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
    /** World slot of this player - what interact/spell packets address. */
    index: number;
    name: string;
    combatLevel: number;
    x: number;
    z: number;
    distance: number;
    /** See NearbyNpc.reachable. */
    reachable?: boolean;
}

/**
 * Anything combat can be pointed at: a resolved entity, or a name/pattern to
 * look one up by. `bot.attack` and `bot.castSpell` take this - see
 * {@link BotActions.attack} for how a pattern is matched.
 */
export type CombatTarget = NearbyNpc | NearbyPlayer | string | RegExp;

export interface GroundItem {
    id: number;
    name: string;
    count: number;
    x: number;
    z: number;
    distance: number;
    /**
     * See NearbyNpc.reachable. Taking an item routes with a 0x0 footprint, so
     * this asks whether you can stand on the pile, not merely get next to it.
     */
    reachable?: boolean;
}

/** Options for the `find*` lookups on {@link BotSDK}. */
export interface FindOptions {
    /**
     * Return null rather than a target the client cannot route to. Off by
     * default, where an unreachable match is still returned if it is the only
     * one. Targets whose reachability is unknown always qualify.
     */
    reachable?: boolean;
    /**
     * Loc lookups only: consider only locs that publish a matching interaction
     * option. Overlapping duplicates are real - the Lumbridge furnace pairs an
     * inert, option-less "Furnace" with the one that offers Smelt, and plain
     * name matching happily returns the inert one.
     */
    withOption?: string | RegExp;
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
    /**
     * Plane this loc was observed on - always the player's plane at scan
     * time. A loc carried across a climb/descend is stale: re-scan instead
     * of interacting with it, or the click resolves against the wrong floor.
     */
    level: number;
    distance: number;
    optionsWithIndex: LocOption[];
    /** Convenience array of option text strings */
    options: string[];
    /**
     * See NearbyNpc.reachable. Uses the loc's own reach rule, so a door you
     * can open from your side reads `true`.
     */
    reachable?: boolean;
}

export interface GameMessage {
    /** Chat type code. 0=system/game, 1=public (crowned), 2=public, 3=PM received, 6=PM sent, 7=PM (crowned). */
    type: number;
    text: string;
    /** Sender name with @cr/@col codes stripped (empty for system messages). */
    sender: string;
    tick: number;
    /** Monotonic publication revision when this message first became agent-visible. */
    observationId?: number;
    /** True if this client sent the message (own public speech or sent PM). */
    fromSelf: boolean;
}

/** Chat type codes that represent real player chat (public + private), not system spam. */
export const PLAYER_CHAT_TYPES: readonly number[] = [1, 2, 3, 6, 7];

/** True if a chat type is player chat (public or private), false for system/game messages. */
export function isPlayerChat(type: number): boolean {
    return PLAYER_CHAT_TYPES.includes(type);
}

export interface DialogEntry {
    text: string[];      // Lines of text in the dialog
    tick: number;        // Game tick when captured
    /** Monotonic publication revision when this dialog first became agent-visible. */
    observationId?: number;
    interfaceId: number; // Interface ID of the dialog
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
    options: InterfaceOption[];
}

/** A clickable viewport-interface option as published in world state. */
export interface InterfaceOption {
    /**
     * Human-facing 1-based ordinal, for display only. Never pass this to
     * `sendClickInterfaceOption`, which takes a 0-based array position — use
     * `sdk.clickInterfaceOption(option)` to dispatch by componentId instead.
     */
    index: number;
    text: string;
    /** Stable component dispatched when this option is selected. */
    componentId: number;
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

export interface BankItem {
    slot: number;
    id: number;
    name: string;
    count: number;
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

// ============ Trade Types ============

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
 * the second accept advances (or completes) the trade. Any offer change on
 * the offer screen resets both accepts server-side, which is the built-in
 * anti-scam property: the confirm screen always shows the final offers.
 */
export interface TradeState {
    isOpen: boolean;
    /** 'offer' = first screen (offers editable), 'confirm' = final screen. */
    screen: 'offer' | 'confirm' | null;
    /** Partner display name, from "Trading With: <name>". */
    partner: string | null;
    myOffer: TradeItem[];
    theirOffer: TradeItem[];
    /** True when this client accepted the current screen and is waiting on the partner. */
    myAccepted: boolean;
    /** True when the partner accepted the current screen. */
    partnerAccepted: boolean;
}

/** Chat type code the client uses for "X wishes to trade with you." requests. */
export const TRADE_REQUEST_CHAT_TYPE = 4;

/** One item pattern a trade expects or gives. */
export interface TradeItemSpec {
    /** Item name pattern (string = case-insensitive substring, or RegExp). */
    item: string | RegExp;
    /** For `give`: -1 = all (default 1). For `want`: minimum count required (default 1). */
    amount?: number;
}

export interface TradeOptions {
    /** Items to place in your offer. Default: give nothing. */
    give?: TradeItemSpec[];
    /**
     * Items the partner's offer must contain before you accept. Default `[]`
     * accepts any partner offer including nothing (a pure gift). Re-verified
     * on the confirm screen before the final accept.
     */
    want?: TradeItemSpec[];
    /**
     * Escape hatch replacing `want`: accept only when this predicate passes
     * on the partner's visible offer. Also re-checked on the confirm screen.
     */
    accept?: (theirOffer: TradeItem[]) => boolean;
    /** Deadline in ms for the open offer+confirm screens (default 60_000). On expiry the trade is declined. */
    timeout?: number;
    /** How long to wait for the partner to accept the trade request (default 30_000). */
    requestTimeout?: number;
}

export interface TradeResult {
    success: boolean;
    message: string;
    /** Partner display name, when known. */
    partner?: string;
    /** Items removed from your inventory (by the completed trade). */
    gave: TradeItem[];
    /** Items added to your inventory (by the completed trade). */
    received: TradeItem[];
    reason?: 'player_not_found' | 'no_response' | 'declined' | 'busy' | 'offer_failed'
        | 'want_not_met' | 'no_space' | 'not_open' | 'timeout' | 'error';
    /** Items from the partner's final offer that did not reach the inventory (dropped on the ground on overflow). */
    possiblyDropped?: TradeItem[];
}

export interface ServeTradesOptions {
    /** Only accept trades from players whose name matches. Default: anyone. */
    from?: string | RegExp;
    /** Items to offer in every served trade. Default: nothing. */
    give?: TradeItemSpec[];
    /** Items each incoming offer must contain. Default `[]` = accept anything. */
    want?: TradeItemSpec[];
    /** Predicate alternative to `want`, applied to the partner's offer. */
    accept?: (theirOffer: TradeItem[]) => boolean;
    /** Called after each completed (or failed) trade. */
    onTrade?: (result: TradeResult) => void;
    /** Serving stops once this returns true (checked between trades). */
    until?: () => boolean;
    /** Stop after this many completed trades. Default: unlimited. */
    maxTrades?: number;
    /** Per-trade deadline in ms once a session opens (default 60_000). */
    tradeTimeout?: number;
    /** Overall serving deadline in ms (default 10 minutes). */
    timeout?: number;
}

export interface ServeTradesResult {
    success: boolean;
    message: string;
    /** Completed trades, in order. */
    trades: TradeResult[];
    reason?: 'until' | 'max_trades' | 'timeout' | 'error';
}

export interface CombatStyleOption {
    /** Value com_mode takes for this style, and what sendSetCombatStyle expects. */
    index: number;
    /** Label from the combat tab ("Chop", "Lunge", ...), or "Style N" if unrecognised. */
    name: string;
    /** "Accurate", "Aggressive", "Controlled", "Defensive", "Rapid", "Longrange", "Unknown". */
    type: string;
    /** Every skill this style trains, e.g. ["Attack","Strength","Defence"] for controlled. Hitpoints is always trained on top. Empty when the tab is unrecognised. */
    trainsSkills: string[];
    /** Damage type rolled against defence bonuses: "Stab", "Slash", "Crush", "Ranged", "Unknown". */
    damageType: string;
}

export interface CombatStyleState {
    currentStyle: number;
    weaponName: string;
    styles: CombatStyleOption[];
    /** Interface id of the combat tab the server installed - the weapon category, effectively. */
    tabInterfaceId: number;
    /** False when the combat tab is unrecognised and style metadata is unknown rather than guessed. */
    known: boolean;
}

export interface CombatEvent {
    tick: number;
    /** Monotonic publication revision when this event first became agent-visible. */
    observationId?: number;
    type: 'damage_taken' | 'damage_dealt' | 'kill';
    damage: number;
    sourceType: 'player' | 'npc' | 'other_player';
    sourceIndex: number;
    targetType: 'player' | 'npc' | 'other_player';
    targetIndex: number;
}

// ============ Prayer Types ============

export type PrayerName =
    | 'thick_skin' | 'burst_of_strength' | 'clarity_of_thought'
    | 'rock_skin' | 'superhuman_strength' | 'improved_reflexes'
    | 'rapid_restore' | 'rapid_heal' | 'protect_items'
    | 'steel_skin' | 'ultimate_strength' | 'incredible_reflexes'
    | 'protect_from_magic' | 'protect_from_missiles' | 'protect_from_melee';

export const PRAYER_NAMES: PrayerName[] = [
    'thick_skin', 'burst_of_strength', 'clarity_of_thought',
    'rock_skin', 'superhuman_strength', 'improved_reflexes',
    'rapid_restore', 'rapid_heal', 'protect_items',
    'steel_skin', 'ultimate_strength', 'incredible_reflexes',
    'protect_from_magic', 'protect_from_missiles', 'protect_from_melee',
];

export const PRAYER_INDICES: Record<PrayerName, number> = {
    'thick_skin': 0, 'burst_of_strength': 1, 'clarity_of_thought': 2,
    'rock_skin': 3, 'superhuman_strength': 4, 'improved_reflexes': 5,
    'rapid_restore': 6, 'rapid_heal': 7, 'protect_items': 8,
    'steel_skin': 9, 'ultimate_strength': 10, 'incredible_reflexes': 11,
    'protect_from_magic': 12, 'protect_from_missiles': 13, 'protect_from_melee': 14,
};

/** Required prayer level for each prayer (indexed 0-14) */
export const PRAYER_LEVELS: number[] = [
    1, 4, 7,    // thick_skin, burst_of_strength, clarity_of_thought
    10, 13, 16, // rock_skin, superhuman_strength, improved_reflexes
    19, 22, 25, // rapid_restore, rapid_heal, protect_items
    28, 31, 34, // steel_skin, ultimate_strength, incredible_reflexes
    37, 40, 43, // protect_from_magic, protect_from_missiles, protect_from_melee
];

export interface PrayerState {
    /** Active state of each prayer (indexed 0-14, matching PRAYER_NAMES order) */
    activePrayers: boolean[];
    /** Current prayer points (current skill level - drains while prayers active) */
    prayerPoints: number;
    /** Base prayer level */
    prayerLevel: number;
}

export interface PrayerResult {
    success: boolean;
    message: string;
    reason?: 'invalid_prayer' | 'no_prayer_points' | 'level_too_low' | 'already_active' | 'already_inactive' | 'timeout';
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

export interface BotWorldState {
    tick: number;
    /** Tick on which an updated Lite runner already emitted policy-gated KBD op2. */
    fastKbdAttackTick?: number;
    /** Prayer-on packets emitted in-process immediately before first-spawn KBD op2. */
    fastKbdPrayerOn?: { tick: number; prayerIndices: number[] };
    /** Prayer-off packets emitted in-process on the KBD-removal publication. */
    fastKbdPrayerOff?: { tick: number; prayerIndices: number[] };
    /** Monotonic state publication cursor; advances even for multiple publications in one game tick. */
    revision?: number;
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
    recentDialogs: DialogEntry[];
    dialog: DialogState;
    interface: InterfaceState;
    shop: ShopState;
    bank: BankState;
    /** Absent when the connected client predates trade support. */
    trade?: TradeState;
    modalOpen: boolean;
    modalInterface: number;
    combatStyle?: CombatStyleState;
    combatEvents: CombatEvent[];
    prayers: PrayerState;
    /** Absent when the connected client predates authoritative PK-skull telemetry. */
    isSkulled?: boolean;
    /** Absent when the connected client predates authoritative auto-retaliate telemetry. */
    autoRetaliateEnabled?: boolean;
    /** Absent when the connected client predates the signal. */
    opFeedback?: OpFeedbackState;
}

// ============ Action Types ============

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
    // TODO: acceptCharacterDesign should be parameterized as (gender, kits[7], colours[5])
    // Currently uses hidden client state - the SDK cannot set design values before accepting.
    // For now, bot client uses whatever design state exists (usually defaults or randomized).
    | { type: 'acceptCharacterDesign'; reason: string }
    // Randomize character appearance (gender, body parts, colors) with valid random values
    | { type: 'randomizeCharacterDesign'; reason: string }
    | { type: 'walkTo'; x: number; z: number; running?: boolean; reason: string }
    | { type: 'useInventoryItem'; slot: number; optionIndex: number; interfaceId?: number; reason: string }
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
    | { type: 'useItemOnNpc'; itemSlot: number; npcIndex: number; reason: string }
    | { type: 'say'; message: string; reason: string }
    | { type: 'privateMessage'; targetName: string; message: string; reason: string }
    | { type: 'spellOnNpc'; npcIndex: number; spellComponent: number; reason: string }
    | { type: 'spellOnPlayer'; playerIndex: number; spellComponent: number; reason: string }
    | { type: 'spellOnItem'; slot: number; spellComponent: number; reason: string }
    | { type: 'spellOnGroundItem'; x: number; z: number; itemId: number; spellComponent: number; reason: string }
    | { type: 'setTab'; tabIndex: number; reason: string }
    | { type: 'bankDeposit'; slot: number; amount: number; reason: string }
    | { type: 'bankWithdraw'; slot: number; amount: number; reason: string }
    | { type: 'submitCountDialog'; value: number; reason: string }
    | { type: 'scanNearbyLocs'; radius?: number; reason: string }
    | { type: 'scanGroundItems'; radius?: number; reason: string }
    | { type: 'togglePrayer'; prayerIndex: number; reason: string };

export interface ActionResult {
    success: boolean;
    message: string;
    /** Optional data payload (used by scan actions to return results) */
    data?: any;
    /** Machine-readable failure category (e.g. 'cant_reach', 'no_match', 'timeout') */
    reason?: string;
    /** Primitive actions report dispatch; porcelain actions may report observation/completion. */
    phase?: 'validation' | 'routing' | 'dispatch' | 'observation' | 'completion';
}

/**
 * Outcome of sending a chat message. The server silently caps public chat at
 * its configured maxMessageLength (400 on rs-sdk servers, 80 classic) and runs
 * a word filter, so `sendSay` surfaces both via the `data` field (shape below)
 * and `say()` returns these per chunk.
 */
// ============ SDK Config ============

/**
 * Connection mode: 'control' can send actions, 'observe' is read-only plus the
 * 'say' action (it never pre-empts / is never pre-empted, so it can chat
 * alongside a running controller).
 */
export type SDKConnectionMode = 'control' | 'observe';

export interface SDKConfig {
    botUsername: string;
    /** Password for gateway authentication */
    password?: string;
    /** Full WebSocket URL (e.g. wss://server.com/gateway). Overrides host/port if set. */
    gatewayUrl?: string;
    /** Gateway hostname (default: localhost) */
    host?: string;
    /** Gateway port (default: 7780) */
    port?: number;
    /**
     * Connection mode: 'control' (default) can send actions, 'observe' is read-only
     * plus say() - it can chat without stealing (or losing) control. Connecting in
     * 'control' mode pre-empts whatever controller the bot already has, killing it -
     * so passive clients must pass 'observe' explicitly.
     */
    connectionMode?: SDKConnectionMode;
    /**
     * Auto-launch browser behavior:
     * - 'auto' (default): Launch only if no active client with fresh state data
     * - true: Always launch if bot not connected
     * - false: Never auto-launch
     */
    autoLaunchBrowser?: boolean | 'auto';
    /** How recent state data must be (ms) to be considered "fresh" in auto mode (default: 3000) */
    freshDataThreshold?: number;
    /** Override client URL for auto-launch (derived from gatewayUrl if not set) */
    browserLaunchUrl?: string;
    /** Timeout waiting for bot to connect after browser launch (default: 30000ms) */
    browserLaunchTimeout?: number;
    /**
     * How long connect() waits for game state to become ready after authenticating
     * (default: 15000ms). Set to 0 to have connect() resolve as soon as the gateway
     * authenticates, leaving the caller to wait for state itself — this keeps
     * "couldn't reach/authenticate with the gateway" distinguishable from
     * "authenticated fine, but no game client is logged in".
     */
    readyTimeout?: number;
    /**
     * Deadline for the whole connect handshake - socket open plus the
     * gateway's sdk_connected/sdk_error answer (default: 30000ms). Kept above
     * the gateway's own 15s auth bound so a slow-but-alive login server
     * doesn't get misread as a dead gateway. On expiry connect() rejects
     * instead of hanging, so babysitters can recycle the process.
     */
    connectTimeout?: number;
    actionTimeout?: number;
    autoReconnect?: boolean;
    reconnectMaxRetries?: number;
    reconnectBaseDelay?: number;
    reconnectMaxDelay?: number;
    /** Show other players' chat messages (default: false for safety) */
    showChat?: boolean;
}

/** Session status from gateway diagnostics */
export type SessionStatus = 'active' | 'stale' | 'dead';

/** Bot status from gateway /status/:username endpoint */
export interface BotStatus {
    /** Session status: active (receiving states), stale (no recent states), dead (disconnected) */
    status: SessionStatus;
    /** Whether bot is currently in-game */
    inGame: boolean;
    /** Milliseconds since last state was received (null if never) */
    stateAge: number | null;
    /** SDK clients controlling this bot */
    controllers: string[];
    /** SDK clients observing this bot */
    observers: string[];
    /** Basic player info (null if not in-game) */
    player: {
        name: string;
        worldX: number;
        worldZ: number;
    } | null;
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
    reason?: 'item_not_found' | 'cant_reach' | 'inventory_full' | 'taken_by_other' | 'timeout';
}

export interface DropItemResult {
    /** True only when every requested slot was observed leaving the inventory. */
    success: boolean;
    message: string;
    /** Inventory slots emptied (a dropped stack counts as one). */
    slotsDropped: number;
    reason?: 'item_not_found' | 'invalid_amount' | 'timeout';
}

export interface TalkResult {
    success: boolean;
    dialog?: DialogState;
    message: string;
}

export interface ShopResult {
    /** True only when the full requested amount was bought. */
    success: boolean;
    item?: InventoryItem;
    message: string;
    requestedAmount?: number;
    amountBought?: number;
    /** Some but not all of the requested amount was bought. */
    partial?: boolean;
    reason?: 'invalid_amount' | 'shop_not_open' | 'item_not_found' | 'partial_fill' | 'timeout' | 'out_of_stock' | 'no_inventory_space';
}

export interface ShopSellResult {
    /** True only when the full requested amount was sold. */
    success: boolean;
    message: string;
    requestedAmount?: number;
    amountSold?: number;
    /** Some but not all of the requested amount was sold. */
    partial?: boolean;
    rejected?: boolean;
    reason?: 'invalid_amount' | 'shop_not_open' | 'item_not_found' | 'rejected' | 'partial_fill' | 'timeout';
}

/** Any positive integer up to MAX_SHOP_ACTION_QUANTITY, or 'all'. */
export type SellAmount = number | 'all';

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
    /** `npc_not_found` also covers players: no target matched. */
    reason?: 'npc_not_found' | 'no_attack_option' | 'out_of_reach' | 'already_in_combat' | 'not_attackable' | 'died' | 'timeout';
    /** What the resolved target was, when one was found. */
    targetType?: 'npc' | 'player';
}

export interface CastSpellResult {
    success: boolean;
    message: string;
    hit?: boolean;
    xpGained?: number;
    /** `npc_not_found` also covers players: no target matched. */
    reason?: 'npc_not_found' | 'out_of_reach' | 'no_runes' | 'not_attackable' | 'timeout' | 'unknown_spell';
    /** What the resolved target was, when one was found. */
    targetType?: 'npc' | 'player';
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
    reason?: 'no_hammer' | 'no_bars' | 'no_anvil' | 'cant_reach' | 'interface_not_opened' | 'level_too_low' | 'timeout' | 'no_xp_gained';
}

export interface OpenBankResult {
    success: boolean;
    message: string;
    reason?: 'no_bank_found' | 'no_bank_option' | 'timeout' | 'dialog_stuck' | 'cant_reach';
}

export interface BankDepositResult {
    /** True only when the full requested amount was deposited. */
    success: boolean;
    message: string;
    requestedAmount?: number;
    amountDeposited?: number;
    /** Some but not all of the requested amount was deposited. */
    partial?: boolean;
    reason?: 'invalid_amount' | 'bank_not_open' | 'item_not_found' | 'partial_fill' | 'timeout';
}

export interface BankWithdrawResult {
    /** True only when the full requested amount was withdrawn. */
    success: boolean;
    message: string;
    item?: InventoryItem;
    requestedAmount?: number;
    amountWithdrawn?: number;
    /** Some but not all of the requested amount was withdrawn. */
    partial?: boolean;
    reason?: 'invalid_amount' | 'bank_not_open' | 'item_not_found' | 'partial_fill' | 'timeout';
}

export interface UseItemOnLocResult {
    success: boolean;
    message: string;
    reason?: 'item_not_found' | 'loc_not_found' | 'cant_reach' | 'timeout';
}

export interface UseItemOnNpcResult {
    success: boolean;
    message: string;
    reason?: 'item_not_found' | 'npc_not_found' | 'cant_reach' | 'timeout';
}

export interface InteractLocResult {
    success: boolean;
    message: string;
    reason?: 'loc_not_found' | 'no_matching_option' | 'cant_reach' | 'timeout';
}

export interface InteractNpcResult {
    success: boolean;
    message: string;
    /** 'rejected' = the packet reached the server and the server discarded it. */
    reason?: 'npc_not_found' | 'no_matching_option' | 'cant_reach' | 'timeout' | 'rejected';
}

export interface PickpocketResult {
    success: boolean;
    message: string;
    xpGained?: number;
    /**
     * 'dispatch_failed' = never reached the game (client stalled or dropped it).
     * 'rejected' = the server discarded the op. Retryable, cheaply.
     * 'not_started' = no attempt message and no rejection either; unaccounted for.
     * 'timeout' = the attempt did start, then never resolved.
     */
    reason?: 'npc_not_found' | 'no_pickpocket_option' | 'cant_reach' | 'stunned' | 'timeout' | 'dispatch_failed' | 'rejected' | 'not_started';
}

export interface CraftJewelryResult {
    success: boolean;
    message: string;
    xpGained?: number;
    product?: InventoryItem;
    reason?: 'no_bar' | 'no_mould' | 'no_furnace' | 'no_gem' | 'interface_not_opened' | 'level_too_low' | 'timeout';
}

export interface EnchantResult {
    success: boolean;
    message: string;
    xpGained?: number;
    product?: InventoryItem;
    reason?: 'item_not_found' | 'no_runes' | 'level_too_low' | 'timeout';
}

export interface StringAmuletResult {
    success: boolean;
    message: string;
    xpGained?: number;
    product?: InventoryItem;
    reason?: 'no_amulet' | 'no_string' | 'level_too_low' | 'timeout';
}
