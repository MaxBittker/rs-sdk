// StateCollector.ts - Collects game state from the client
// Extracts all relevant game data for bot decision-making

import type { Client } from '#/client/Client.js';
import type ClientNpc from '#/dash3d/ClientNpc.js';
import type ClientPlayer from '#/dash3d/ClientPlayer.js';
import type ClientObj from '#/dash3d/ClientObj.js';
import IfType from '#/config/IfType.js';
import ObjType from '#/config/ObjType.js';
import NpcType from '#/config/NpcType.js';
import LocType from '#/config/LocType.js';
import type LinkList from '#/datastruct/LinkList.js';

import { ReachProbe } from './reach.js';

import {
    SKILL_NAMES,
    INVENTORY_INTERFACE_ID,
    EQUIPMENT_INTERFACE_ID,
    SHOP_TEMPLATE_INV_ID,
    SHOP_TEMPLATE_SIDE_INV_ID,
    TRADE_MAIN_ID,
    TRADE_MAIN_INV_ID,
    TRADE_MAIN_OTHER_INV_ID,
    TRADE_MAIN_PARTNER_TEXT_ID,
    TRADE_MAIN_STATUS_TEXT_ID,
    TRADE_CONFIRM_ID,
    TRADE_CONFIRM_INV1_ID,
    TRADE_CONFIRM_INV2_ID,
    TRADE_CONFIRM_OTHER_INV1_ID,
    TRADE_CONFIRM_OTHER_INV2_ID,
    TRADE_CONFIRM_STATUS_TEXT_ID,
    type BotState,
    type SkillState,
    type InventoryItem,
    type InventoryItemOption,
    type NearbyNpc,
    type NpcOption,
    type NearbyPlayer,
    type NearbyLoc,
    type LocOption,
    type GroundItem,
    type GameMessage,
    type MenuAction,
    type ShopState,
    type ShopConfig,
    type ShopItem,
    type BankState,
    type BankItem,
    type TradeState,
    type TradeItem,
    type PlayerState,
    type CombatStyleState,
    type CombatStyleOption,
    type CombatEvent,
    type DialogState,
    type InterfaceState,
    type PrayerState,
    type OpFeedbackState
} from './types.js';
import type { ScanProvider } from './ActionExecutor.js';

/** Cached prayer component discovery result */
interface PrayerComponentMap {
    /** Component IDs for each prayer (indexed 0-14) */
    componentIds: number[];
    /** Varp IDs for each prayer (indexed 0-14) */
    varpIds: number[];
}

const ROCK_ID_TO_ORE: Record<number, string> = {
    2090: 'copper', 2091: 'copper', 3042: 'copper',
    2094: 'tin', 2095: 'tin', 3043: 'tin',
    2092: 'iron', 2093: 'iron',
    2096: 'coal', 2097: 'coal',
    2098: 'gold', 2099: 'gold',
    2100: 'silver', 2101: 'silver',
    2102: 'mithril', 2103: 'mithril',
    2104: 'adamantite', 2105: 'adamantite',
    2106: 'runite', 2107: 'runite',
    2108: 'clay', 2109: 'clay',
    2110: 'blurite',
    2111: 'gem',
    2491: 'rune essence',
};

export class BotStateCollector implements ScanProvider {
    private client: Client;
    // Combat event tracking
    private combatEvents: CombatEvent[] = [];
    private lastPlayerDamageCycles: Int32Array = new Int32Array(4);
    private lastPlayerDamageTick: number = -1;
    private lastNpcDamageCycles: Map<number, Int32Array> = new Map();
    private lastNpcCombatTicks: Map<number, number> = new Map();
    private lastOtherPlayerDamageCycles: Map<number, Int32Array> = new Map();
    private static readonly MAX_EVENTS = 50;
    private static readonly EVENT_EXPIRY_TICKS = 50;
    private lastDeadState: boolean | null = null;
    private lifeId: number = 0;
    private respawnCount: number = 0;
    private lastDeathTick: number | null = null;

    private lastFaceEntity: number | null = null;
    private faceEntitySetCycle: number = Number.NEGATIVE_INFINITY;
    /** How long a bare facing (no hits yet) still counts as combat: ~10s of walk-up. */
    private static readonly FACING_GRACE_CYCLES = 500;
    private publicationRevision = 0;
    private messageObservations = new Map<string, { tick: number; observationId: number }>();
    // Op feedback tracking - see collectOpFeedback
    private opFeedbackTick: number = -1;
    private lastMapFlagUnsetCount: number = 0;
    private lastMapFlagUnsetTick: number = -1;
    private opRejectedCount: number = 0;
    private lastOpRejectedTick: number = -1;
    private lastTileX: number = -1;
    private lastTileZ: number = -1;
    private dialogObservations = new Map<string, { tick: number; observationId: number }>();

    // Cached prayer component map (built once on first use)
    private prayerComponentMap: PrayerComponentMap | null = null;

    // Answers "could the routefinder actually get there?" for every published
    // entity, from the same collision map the dispatch paths route over.
    private readonly reachProbe: ReachProbe;
    private reachabilityEnabled = true;

    constructor(client: Client) {
        this.client = client;
        this.reachProbe = new ReachProbe(client as any);
    }

    /**
     * Publish `reachable` on nearby entities, or don't. On by default; a swarm
     * large enough to care about the per-collect flood fill can turn it off,
     * after which every `reachable` reads undefined (unknown) rather than false.
     */
    setReachabilityEnabled(enabled: boolean): void {
        this.reachabilityEnabled = enabled;
    }

    /** True when the probe should be consulted this collect: enabled and fillable. */
    private reachProbeReady(): boolean {
        return this.reachabilityEnabled && this.reachProbe.available();
    }

    collectState(currentTick: number, publish: boolean = false): BotState {
        const c = this.client as any; // Access private members
        const clientCycle = this.client.getClientCycle();
        if (publish) this.publicationRevision++;

        // The player moves and doors open between snapshots; never serve
        // reachability from a previous tick's flood fill.
        this.reachProbe.invalidate();

        // Collect combat events (must be done before returning state)
        this.collectCombatEvents(currentTick);
        if (publish) {
            for (const event of this.combatEvents) {
                if (!event.observationId) event.observationId = this.publicationRevision;
            }
        }

        return {
            tick: currentTick,
            revision: this.publicationRevision,
            player: this.collectPlayerState(currentTick, clientCycle),
            skills: this.collectSkills(),
            inventory: this.collectInventory(INVENTORY_INTERFACE_ID),
            equipment: this.collectInventory(EQUIPMENT_INTERFACE_ID),
            combatStyle: this.collectCombatStyle(),
            nearbyNpcs: this.collectNearbyNpcs(clientCycle),
            nearbyPlayers: this.collectNearbyPlayers(),
            nearbyLocs: this.collectNearbyLocs(),
            groundItems: this.collectGroundItems(),
            gameMessages: this.collectGameMessages(currentTick, publish),
            recentDialogs: this.collectRecentDialogs(currentTick, publish),
            menuActions: this.collectMenuActions(),
            shop: this.collectShopState(),
            bank: this.collectBankState(),
            trade: this.collectTradeState(),
            inGame: c.ingame || false,
            combatEvents: [...this.combatEvents], // Return copy of events
            dialog: this.collectDialogState(),
            interface: this.collectInterfaceState(),
            modalOpen: (c.mainModalId ?? -1) !== -1,
            modalInterface: c.mainModalId ?? -1,
            prayers: this.collectPrayerState(),
            // These policy-critical settings are ordinary server varps. Keep
            // them explicit rather than making controllers infer state from a
            // head icon or blindly click a control that might already be set.
            isSkulled: (c.var?.[78] ?? 0) > 0,
            autoRetaliateEnabled: (c.var?.[172] ?? 1) === 0,
            opFeedback: this.collectOpFeedback(currentTick)
        };
    }

    /**
     * Turn the raw UNSET_MAP_FLAG counter both clients keep into timestamps.
     * See OpFeedbackState for what the signal does and does not prove.
     *
     * Only the first call on a given tick advances the tracking, so the extra
     * unpublished collects BotOverlay makes for its UI cannot consume a delta or
     * mistake "no movement since the last call 2ms ago" for "standing still".
     */
    private collectOpFeedback(currentTick: number): OpFeedbackState {
        const c = this.client as any;
        const count: number = c.mapFlagUnsetCount ?? 0;
        const player = c.localPlayer;
        const tileX = ((player?.x ?? 0) >> 7);
        const tileZ = ((player?.z ?? 0) >> 7);

        if (currentTick !== this.opFeedbackTick) {
            if (this.opFeedbackTick !== -1 && count > this.lastMapFlagUnsetCount) {
                this.lastMapFlagUnsetTick = currentTick;
                if (tileX === this.lastTileX && tileZ === this.lastTileZ) {
                    // Packets, not interactions - one refused interaction can
                    // bump this twice.
                    this.opRejectedCount += count - this.lastMapFlagUnsetCount;
                    this.lastOpRejectedTick = currentTick;
                }
            }
            this.opFeedbackTick = currentTick;
            this.lastMapFlagUnsetCount = count;
            this.lastTileX = tileX;
            this.lastTileZ = tileZ;
        }

        return {
            mapFlagUnsetCount: count,
            lastMapFlagUnsetTick: this.lastMapFlagUnsetTick,
            opRejectedCount: this.opRejectedCount,
            lastOpRejectedTick: this.lastOpRejectedTick
        };
    }

    /**
     * Discover prayer components by scanning IfType.list for toggle buttons
     * that check a varp == 1. Groups by parent layer to find the prayer interface
     * (the one with exactly 15 toggle buttons).
     */
    buildPrayerComponentMap(): PrayerComponentMap | null {
        if (this.prayerComponentMap) return this.prayerComponentMap;

        // Find all toggle buttons (buttonType === 4) whose first script is load_var (opcode 5)
        // and whose comparator checks == 1 (scriptComparator[0] === 1 means "equals", scriptOperand[0] === 1)
        const togglesByParent = new Map<number, Array<{ id: number; varpId: number }>>();

        for (let i = 0; i < IfType.list.length; i++) {
            const com = IfType.list[i];
            if (!com || com.buttonType !== 4) continue; // Not a toggle button
            if (!com.scripts || !com.scripts[0]) continue;
            if (!com.scriptComparator || !com.scriptOperand) continue;

            const script = com.scripts[0];
            // Script must be: [5, varpId, 0] - load_var then return
            if (script.length < 3 || script[0] !== 5 || script[2] !== 0) continue;

            // Comparator must check equals (type 1 = equals) and operand must be 1
            if (com.scriptComparator[0] !== 1 || com.scriptOperand[0] !== 1) continue;

            const varpId = script[1];
            const parent = com.layerId;

            if (!togglesByParent.has(parent)) {
                togglesByParent.set(parent, []);
            }
            togglesByParent.get(parent)!.push({ id: i, varpId });
        }

        // Find the parent with exactly 15 toggle buttons - that's the prayer interface
        for (const [_parent, toggles] of togglesByParent) {
            if (toggles.length === 15) {
                // Sort by component ID to get consistent ordering (prayer 0-14)
                toggles.sort((a, b) => a.id - b.id);

                this.prayerComponentMap = {
                    componentIds: toggles.map(t => t.id),
                    varpIds: toggles.map(t => t.varpId)
                };
                return this.prayerComponentMap;
            }
        }

        return null;
    }

    /** Get the component ID for a prayer index (0-14). Returns -1 if not found. */
    getPrayerComponentId(prayerIndex: number): number {
        const map = this.buildPrayerComponentMap();
        if (!map || prayerIndex < 0 || prayerIndex >= map.componentIds.length) return -1;
        return map.componentIds[prayerIndex];
    }

    private collectPrayerState(): PrayerState {
        const c = this.client as any;
        const defaultState: PrayerState = {
            activePrayers: new Array(15).fill(false),
            prayerPoints: 0,
            prayerLevel: 0
        };

        try {
            // Get prayer skill info (Prayer is skill index 5)
            const prayerSkillIndex = SKILL_NAMES.indexOf('Prayer');
            if (prayerSkillIndex >= 0) {
                const skillLevel = c.statEffectiveLevel || [];
                const skillBaseLevel = c.statBaseLevel || [];
                defaultState.prayerPoints = skillLevel[prayerSkillIndex] || 0;
                defaultState.prayerLevel = skillBaseLevel[prayerSkillIndex] || 0;
            }

            // Discover prayer components and read varp states
            const map = this.buildPrayerComponentMap();
            if (!map) return defaultState;

            const varps = c.var || [];
            for (let i = 0; i < map.varpIds.length; i++) {
                defaultState.activePrayers[i] = varps[map.varpIds[i]] === 1;
            }
        } catch { /* ignore errors */ }

        return defaultState;
    }

    private collectDialogState(): DialogState {
        const c = this.client as any;
        const isOpen = c.chatModalId !== -1;
        const isWaiting = c.resumedPauseButton || false;

        // Capture dialog to history when open
        if (isOpen && typeof this.client.captureDialogToHistory === 'function') {
            this.client.captureDialogToHistory();
        }

        // Get dialog options using client's method if available
        let options: Array<{ index: number; text: string }> = [];
        if (isOpen && typeof this.client.getDialogOptions === 'function') {
            const rawOptions = this.client.getDialogOptions();
            options = rawOptions.map((opt: any) => ({ index: opt.index, text: opt.text }));
        }

        return { isOpen, options, isWaiting };
    }

    private collectRecentDialogs(currentTick: number, publish: boolean): Array<{ text: string[]; tick: number; interfaceId: number; observationId?: number }> {
        if (typeof this.client.getDialogHistory !== 'function') return [];

        const activeKeys = new Set<string>();
        const dialogs = this.client.getDialogHistory().map(entry => {
            const key = `${entry.tick}|${entry.interfaceId}|${entry.text.join('\u0000')}`;
            activeKeys.add(key);
            let observation = this.dialogObservations.get(key);
            if (!observation) {
                observation = { tick: currentTick, observationId: 0 };
                this.dialogObservations.set(key, observation);
            }
            if (publish && observation.observationId === 0) {
                observation.observationId = this.publicationRevision;
            }
            return {
                ...entry,
                tick: observation.tick,
                observationId: observation.observationId || undefined
            };
        });
        for (const key of this.dialogObservations.keys()) {
            if (!activeKeys.has(key)) this.dialogObservations.delete(key);
        }
        return dialogs;
    }

    private collectInterfaceState(): InterfaceState {
        const c = this.client as any;
        const interfaceId = c.mainModalId ?? -1;
        const isOpen = interfaceId !== -1;

        // Get interface options using client's method if available
        // Include componentId so SDK can click directly without lookup
        let options: Array<{ index: number; text: string; componentId: number }> = [];
        if (isOpen && typeof this.client.getInterfaceOptions === 'function') {
            const rawOptions = this.client.getInterfaceOptions();
            options = rawOptions.map((opt: any) => ({ index: opt.index, text: opt.text, componentId: opt.componentId }));
        }

        return { isOpen, interfaceId, options };
    }

    /**
     * Decode the client's faceEntity field, which packs both entity spaces into
     * one number: npc indices sit below 32768, player slots above it.
     */
    private static decodeFaceEntity(faceEntity: number): { type: 'npc' | 'player' | 'none'; index: number } {
        if (faceEntity === undefined || faceEntity === null || faceEntity < 0) {
            return { type: 'none', index: -1 };
        }
        if (faceEntity >= 32768) {
            return { type: 'player', index: faceEntity - 32768 };
        }
        return { type: 'npc', index: faceEntity };
    }

    private collectCombatEvents(currentTick: number): void {
        const c = this.client as any;
        const player = c.localPlayer;

        // Prune old events
        this.combatEvents = this.combatEvents.filter(
            e => currentTick - e.tick < BotStateCollector.EVENT_EXPIRY_TICKS
        );

        // Detect player damage taken
        if (player?.damageCycles && player?.damageValues) {
            for (let i = 0; i < 4; i++) {
                const cycle = player.damageCycles[i] || 0;
                const lastCycle = this.lastPlayerDamageCycles[i] || 0;

                if (cycle > lastCycle && cycle > 0) {
                    // New damage detected. The splat carries no attacker, so the
                    // entity we face is the best available guess at the source.
                    const damage = player.damageValues[i] || 0;
                    const facing = BotStateCollector.decodeFaceEntity(player.faceEntity ?? -1);
                    this.lastPlayerDamageTick = currentTick;
                    this.combatEvents.push({
                        tick: currentTick,
                        type: 'damage_taken',
                        damage,
                        sourceType: facing.type === 'player' ? 'other_player' : 'npc',
                        sourceIndex: facing.index,
                        targetType: 'player',
                        targetIndex: -1 // Self
                    });
                }
                this.lastPlayerDamageCycles[i] = cycle;
            }
        }

        // Detect NPC damage (when player deals damage to NPCs)
        const npcArray = c.npc || [];
        const npcIds = c.npcIds || [];
        const npcCount = c.npcCount || 0;

        for (let i = 0; i < npcCount; i++) {
            const npcIndex = npcIds[i];
            const npc = npcArray[npcIndex];
            if (!npc?.damageCycles || !npc?.damageValues) continue;

            // Get or create tracking for this NPC
            let lastCycles = this.lastNpcDamageCycles.get(npcIndex);
            if (!lastCycles) {
                lastCycles = new Int32Array(4);
                this.lastNpcDamageCycles.set(npcIndex, lastCycles);
            }

            for (let j = 0; j < 4; j++) {
                const cycle = npc.damageCycles[j] || 0;
                const lastCycle = lastCycles[j] || 0;

                if (cycle > lastCycle && cycle > 0) {
                    const damage = npc.damageValues[j] || 0;
                    this.lastNpcCombatTicks.set(npcIndex, currentTick);
                    // Check if player is targeting this NPC (likely we dealt the damage)
                    const facing = BotStateCollector.decodeFaceEntity(player?.faceEntity ?? -1);
                    const isPlayerSource = facing.type === 'npc' && facing.index === npcIndex;

                    this.combatEvents.push({
                        tick: currentTick,
                        type: isPlayerSource ? 'damage_dealt' : 'damage_taken',
                        damage,
                        sourceType: isPlayerSource ? 'player' : 'other_player',
                        sourceIndex: isPlayerSource ? -1 : -1,
                        targetType: 'npc',
                        targetIndex: npcIndex
                    });
                }
                lastCycles[j] = cycle;
            }
        }

        // Detect damage on other players. Only splats on the player we are
        // fighting are attributed to us - a splat on a bystander says nothing
        // about who hit them, so it is not published as an event at all.
        const playerArray = c.players || [];
        const playerIds = c.playerIds || [];
        const playerCount = c.playerCount || 0;
        const facingPlayer = BotStateCollector.decodeFaceEntity(player?.faceEntity ?? -1);

        for (let i = 0; i < playerCount; i++) {
            const otherIndex = playerIds[i];
            const other = playerArray[otherIndex];
            if (!other || other === player || !other.damageCycles || !other.damageValues) continue;

            let lastCycles = this.lastOtherPlayerDamageCycles.get(otherIndex);
            if (!lastCycles) {
                lastCycles = new Int32Array(4);
                this.lastOtherPlayerDamageCycles.set(otherIndex, lastCycles);
            }

            const isOurTarget = facingPlayer.type === 'player' && facingPlayer.index === otherIndex;

            for (let j = 0; j < 4; j++) {
                const cycle = other.damageCycles[j] || 0;
                const lastCycle = lastCycles[j] || 0;

                if (cycle > lastCycle && cycle > 0 && isOurTarget) {
                    this.combatEvents.push({
                        tick: currentTick,
                        type: 'damage_dealt',
                        damage: other.damageValues[j] || 0,
                        sourceType: 'player',
                        sourceIndex: -1,
                        targetType: 'other_player',
                        targetIndex: otherIndex
                    });
                }
                lastCycles[j] = cycle;
            }
        }

        // Clean up tracking for NPCs no longer nearby
        const activeNpcIndices = new Set<number>();
        for (let i = 0; i < npcCount; i++) {
            activeNpcIndices.add(npcIds[i]);
        }
        for (const npcIndex of this.lastNpcDamageCycles.keys()) {
            if (!activeNpcIndices.has(npcIndex)) {
                this.lastNpcDamageCycles.delete(npcIndex);
                this.lastNpcCombatTicks.delete(npcIndex);
            }
        }

        // ...and for players who left the scene
        const activePlayerIndices = new Set<number>();
        for (let i = 0; i < playerCount; i++) {
            activePlayerIndices.add(playerIds[i]);
        }
        for (const otherIndex of this.lastOtherPlayerDamageCycles.keys()) {
            if (!activePlayerIndices.has(otherIndex)) {
                this.lastOtherPlayerDamageCycles.delete(otherIndex);
            }
        }

        // Limit event buffer size
        if (this.combatEvents.length > BotStateCollector.MAX_EVENTS) {
            this.combatEvents = this.combatEvents.slice(-BotStateCollector.MAX_EVENTS);
        }
    }

    private collectPlayerState(currentTick: number, clientCycle: number): PlayerState | null {
        const c = this.client as any;
        const player = c.localPlayer;

        if (!player) return null;

        // Get player's combat state
        const rawFaceEntity = player.faceEntity ?? -1;
        if (rawFaceEntity !== this.lastFaceEntity) {
            this.lastFaceEntity = rawFaceEntity;
            this.faceEntitySetCycle = clientCycle;
        }
        let target = BotStateCollector.decodeFaceEntity(rawFaceEntity);
        // combatCycle is set to loopCycle + 400 when damage is taken/dealt
        // So if combatCycle > loopCycle, we're in combat (within 400 ticks of last hit)
        const combatCycle = player.combatCycle ?? -1000;

        // faceEntity is facing, not fighting: the client pins it on the last
        // target indefinitely, so a finished fight (or one inherited across a
        // reconnect) kept publishing inCombat/targetIndex forever and froze any
        // loop that waits for targetIndex to clear. Only trust the facing while
        // something corroborates it: a recent hit on us, a recent hit on the
        // target, or the grace window covering the walk-up before the first blow.
        if (target.type !== 'none' && combatCycle <= clientCycle
            && clientCycle - this.faceEntitySetCycle >= BotStateCollector.FACING_GRACE_CYCLES) {
            const entity = target.type === 'npc' ? c.npc?.[target.index] : c.players?.[target.index];
            if ((entity?.combatCycle ?? -1000) <= clientCycle) {
                target = { type: 'none', index: -1 };
            }
        }

        const inCombat = target.type !== 'none' || combatCycle > clientCycle;

        // Hitpoints is skill index 3
        const skillLevel = c.statEffectiveLevel || [];
        const skillBaseLevel = c.statBaseLevel || [];

        const hp = skillLevel[3] || 0;
        const maxHp = skillBaseLevel[3] || 0;
        const isDead = maxHp > 0 && hp <= 0;

        if (this.lastDeadState === null) {
            this.lastDeadState = isDead;
            if (!isDead) this.lifeId = 1;
        } else if (!this.lastDeadState && isDead) {
            this.lastDeadState = true;
            this.lastDeathTick = currentTick;
        } else if (this.lastDeadState && !isDead) {
            this.lastDeadState = false;
            this.respawnCount++;
            this.lifeId++;
        }

        return {
            name: player.name || 'Unknown',
            combatLevel: player.combatLevel || 0,
            hp,
            maxHp,
            x: player.x || 0,
            z: player.z || 0,
            worldX: (c.mapBuildBaseX || 0) + ((player.x || 0) >> 7),
            worldZ: (c.mapBuildBaseZ || 0) + ((player.z || 0) >> 7),
            level: c.minusedlevel || 0,
            runEnergy: c.runenergy || 0,
            runWeight: c.runweight || 0,
            animId: player.primaryAnim ?? -1,
            spotanimId: player.spotanimId ?? -1,
            combat: {
                inCombat,
                targetIndex: target.index,
                targetType: target.type,
                lastDamageTick: this.lastPlayerDamageTick
            },
            isDead,
            lifeId: this.lifeId,
            respawnCount: this.respawnCount,
            lastDeathTick: this.lastDeathTick
        };
    }

    private collectSkills(): SkillState[] {
        const c = this.client as any;
        const skills: SkillState[] = [];

        const skillLevel = c.statEffectiveLevel || [];
        const skillBaseLevel = c.statBaseLevel || [];
        const skillExperience = c.statXP || [];

        for (let i = 0; i < SKILL_NAMES.length; i++) {
            skills.push({
                name: SKILL_NAMES[i],
                level: skillLevel[i] || 0,
                baseLevel: skillBaseLevel[i] || 0,
                experience: skillExperience[i] || 0
            });
        }

        return skills;
    }

    /** com_mode, the varp holding the selected attack style (server/content/pack/varp.pack: `43=com_mode`). */
    private static readonly VARP_COM_MODE = 43;

    /**
     * What each damagestyle from combat.dbrow means for the player.
     * Bonuses are from `combat_get_damagestyle_bonuses` and the trained skills
     * from `give_combat_experience`, both in skill_combat/scripts/combat.rs2.
     * Every style additionally trains Hitpoints.
     */
    private static readonly DAMAGE_STYLES: Record<string, { type: string; trainsSkills: string[] }> = {
        accurate: { type: 'Accurate', trainsSkills: ['Attack'] },
        aggressive: { type: 'Aggressive', trainsSkills: ['Strength'] },
        controlled: { type: 'Controlled', trainsSkills: ['Attack', 'Strength', 'Defence'] },
        defensive: { type: 'Defensive', trainsSkills: ['Defence'] },
        ranged_accurate: { type: 'Accurate', trainsSkills: ['Ranged'] },
        ranged_rapid: { type: 'Rapid', trainsSkills: ['Ranged'] },
        ranged_longrange: { type: 'Longrange', trainsSkills: ['Ranged', 'Defence'] }
    };

    /**
     * Combat style tables keyed by the interface the server installs in the
     * combat tab, which *is* the weapon category: `update_weapon_category`
     * (skill_combat/scripts/player/player_attackstyles.rs2) switches on
     * `oc_category(weapon)` to choose the tab, and `combat_get_weapon_style_data`
     * (skill_combat/scripts/combat.rs2) switches on the same category to choose
     * the matching row of skill_combat/configs/combat.dbrow.
     *
     * Entries are `[name, damagestyle, damagetype]` in com_mode order: names from
     * the tab's own labels, the rest transcribed from combat.dbrow.
     *
     * Never infer these from the weapon's name. A bronze sword (weapon_stab) and
     * a scimitar (weapon_slash) are both "swords" and have different tables -
     * index 2 is aggressive/Slash on one and controlled/Stab on the other.
     */
    private static readonly COMBAT_STYLE_TABLES: Record<number, Array<[string, string, string]>> = {
        5855: [ // combat_unarmed -> weapon_unarmed_table
            ['Punch', 'accurate', 'Crush'], ['Kick', 'aggressive', 'Crush'], ['Block', 'defensive', 'Crush']
        ],
        2276: [ // combat_stabsword -> weapon_stab_table (daggers, short/longswords)
            ['Stab', 'accurate', 'Stab'], ['Lunge', 'aggressive', 'Stab'],
            ['Slash', 'aggressive', 'Slash'], ['Block', 'defensive', 'Stab']
        ],
        2423: [ // combat_hacksword -> weapon_slash_table (scimitars)
            ['Chop', 'accurate', 'Slash'], ['Slash', 'aggressive', 'Slash'],
            ['Lunge', 'controlled', 'Stab'], ['Block', 'defensive', 'Slash']
        ],
        4705: [ // combat_heavysword -> weapon_2h_sword_table
            ['Chop', 'accurate', 'Slash'], ['Slash', 'aggressive', 'Slash'],
            ['Smash', 'aggressive', 'Crush'], ['Block', 'defensive', 'Slash']
        ],
        1698: [ // combat_axe -> weapon_axe_table
            ['Chop', 'accurate', 'Slash'], ['Hack', 'aggressive', 'Slash'],
            ['Smash', 'aggressive', 'Crush'], ['Block', 'defensive', 'Slash']
        ],
        425: [ // combat_blunt -> weapon_blunt_table (maces, hammers)
            ['Pound', 'accurate', 'Crush'], ['Pummel', 'aggressive', 'Crush'], ['Block', 'defensive', 'Crush']
        ],
        5570: [ // combat_pickaxe -> weapon_pickaxe_table
            ['Spike', 'accurate', 'Stab'], ['Impale', 'aggressive', 'Stab'],
            ['Smash', 'aggressive', 'Crush'], ['Block', 'defensive', 'Stab']
        ],
        776: [ // combat_scythe -> weapon_scythe_table
            ['Reap', 'accurate', 'Slash'], ['Chop', 'aggressive', 'Stab'],
            ['Jab', 'aggressive', 'Crush'], ['Block', 'defensive', 'Slash']
        ],
        4679: [ // combat_spear -> weapon_spear_table (controlled on every attacking style)
            ['Lunge', 'controlled', 'Stab'], ['Swipe', 'controlled', 'Slash'],
            ['Pound', 'controlled', 'Crush'], ['Block', 'defensive', 'Stab']
        ],
        3796: [ // combat_spiked -> weapon_spiked_table
            ['Pound', 'accurate', 'Crush'], ['Pummel', 'aggressive', 'Crush'],
            ['Spike', 'controlled', 'Stab'], ['Block', 'defensive', 'Crush']
        ],
        7762: [ // combat_claw -> weapon_claws_table
            ['Chop', 'accurate', 'Slash'], ['Slash', 'aggressive', 'Slash'],
            ['Lunge', 'controlled', 'Stab'], ['Block', 'defensive', 'Slash']
        ],
        8460: [ // combat_polearm -> weapon_polearm_table (3 styles, no accurate)
            ['Jab', 'controlled', 'Stab'], ['Swipe', 'aggressive', 'Slash'], ['Fend', 'defensive', 'Stab']
        ],
        328: [ // combat_staff_2 -> weapon_staff_table
            ['Jab', 'accurate', 'Crush'], ['Pound', 'aggressive', 'Crush'], ['Focus', 'defensive', 'Crush']
        ],
        1764: [ // combat_bow -> weapon_bow_table
            ['Accurate', 'ranged_accurate', 'Ranged'], ['Rapid', 'ranged_rapid', 'Ranged'],
            ['Longrange', 'ranged_longrange', 'Ranged']
        ],
        1749: [ // combat_crossbow -> weapon_crossbow_table
            ['Accurate', 'ranged_accurate', 'Ranged'], ['Rapid', 'ranged_rapid', 'Ranged'],
            ['Longrange', 'ranged_longrange', 'Ranged']
        ],
        4446: [ // combat_thrown -> weapon_thrown_table (also javelins)
            ['Accurate', 'ranged_accurate', 'Ranged'], ['Rapid', 'ranged_rapid', 'Ranged'],
            ['Longrange', 'ranged_longrange', 'Ranged']
        ]
    };

    /**
     * The com_mode values an unrecognised combat tab offers, read from its
     * select-buttons the same way Client.setCombatStyle does: each carries the
     * style it selects in scriptOperand[0].
     */
    private findCombatStyleIndices(interfaceId: number): number[] {
        const styles = new Set<number>();
        const root = IfType.list[interfaceId] as any;
        if (!root) return [];

        const visit = (comId: number, depth: number): void => {
            const com = IfType.list[comId] as any;
            if (!com || depth > 3) return;
            if (com.buttonType === 5 && com.scriptOperand && typeof com.scriptOperand[0] === 'number') {
                styles.add(com.scriptOperand[0]);
            }
            if (com.children) {
                for (const childId of com.children) visit(childId, depth + 1);
            }
        };

        if (root.children) {
            for (const childId of root.children) visit(childId, 1);
        }
        return [...styles].sort((a, b) => a - b);
    }

    private collectCombatStyle(): CombatStyleState {
        const c = this.client as any;

        const defaultState: CombatStyleState = {
            currentStyle: 0,
            weaponName: 'Unarmed',
            styles: [],
            tabInterfaceId: -1,
            known: false
        };

        try {
            // The combat tab (sideIcon[0]) is set by the server from the weapon's
            // category, so it - not the weapon's name - identifies the style table.
            const tabInterfaceId = c.sideIcon?.[0] ?? -1;
            const table = BotStateCollector.COMBAT_STYLE_TABLES[tabInterfaceId];

            const equipment = this.collectInventory(EQUIPMENT_INTERFACE_ID);
            const weapon = equipment.find(item => item.slot === 3); // Slot 3 is right hand (weapon)
            const weaponName = weapon?.name || 'Unarmed';

            let styles: CombatStyleOption[];
            if (table) {
                styles = table.map(([name, damageStyle, damageType], index) => {
                    const meta = BotStateCollector.DAMAGE_STYLES[damageStyle];
                    return {
                        index,
                        name,
                        type: meta.type,
                        trainsSkills: [...meta.trainsSkills],
                        damageType
                    };
                });
            } else {
                // Unrecognised tab: report the buttons that are actually there
                // rather than inventing a table that may train the wrong skill.
                styles = this.findCombatStyleIndices(tabInterfaceId).map(index => ({
                    index,
                    name: `Style ${index}`,
                    type: 'Unknown',
                    trainsSkills: [],
                    damageType: 'Unknown'
                }));
            }

            // com_mode, clamped the way player_combat_stat.rs2 clamps it.
            const varps = c.var ?? [];
            const rawStyle = varps[BotStateCollector.VARP_COM_MODE];
            let currentStyle = typeof rawStyle === 'number' && rawStyle >= 0 ? rawStyle : 0;
            if (styles.length > 0 && currentStyle >= styles.length) {
                currentStyle = styles.length - 1;
            }

            return {
                currentStyle,
                weaponName,
                styles,
                tabInterfaceId,
                known: Boolean(table)
            };
        } catch {
            return defaultState;
        }
    }

    private collectInventory(interfaceId: number): InventoryItem[] {
        const items: InventoryItem[] = [];

        try {
            const component = IfType.list[interfaceId];
            if (!component || !component.linkObjType || !component.linkObjNumber) {
                return items;
            }

            for (let slot = 0; slot < component.linkObjType.length; slot++) {
                const objId = component.linkObjType[slot];
                const count = component.linkObjNumber[slot];

                if (objId > 0) {
                    let name = 'Unknown';
                    const optionsWithIndex: InventoryItemOption[] = [];

                    try {
                        const obj = ObjType.list(objId - 1);
                        name = obj.name || 'Unknown';

                        // Get inventory options (iop) from the object type
                        if (obj.iop) {
                            for (let opIdx = 0; opIdx < obj.iop.length; opIdx++) {
                                const op = obj.iop[opIdx];
                                if (op) {
                                    optionsWithIndex.push({ text: op, opIndex: opIdx + 1 }); // opIndex is 1-based
                                }
                            }
                        }
                    } catch { /* ignore */ }

                    items.push({
                        slot,
                        id: objId - 1,
                        name,
                        count,
                        optionsWithIndex
                    });
                }
            }
        } catch { /* ignore errors */ }

        return items;
    }

    private collectNearbyNpcs(clientCycle: number): NearbyNpc[] {
        const c = this.client as any;
        const npcs: NearbyNpc[] = [];
        const player = c.localPlayer;

        if (!player) return npcs;

        const npcArray = c.npc || [];
        const npcIds = c.npcIds || [];
        const npcCount = c.npcCount || 0;
        // Scene base coordinates for converting local coords to world coords
        const baseX = c.mapBuildBaseX || 0;
        const baseZ = c.mapBuildBaseZ || 0;

        for (let i = 0; i < npcCount; i++) {
            const npcIndex = npcIds[i];
            const npc = npcArray[npcIndex] as ClientNpc | null;

            if (!npc || !npc.type) continue;

            // Validate NPC coordinates are within scene bounds (0 to 104*128 = 13,312)
            // NPCs with invalid coords are likely despawning or in a bad state
            const maxLocalCoord = 104 * 128;
            const npcX = npc.x || 0;
            const npcZ = npc.z || 0;
            if (npcX < 0 || npcX > maxLocalCoord || npcZ < 0 || npcZ > maxLocalCoord) {
                continue; // Skip NPCs with invalid coordinates
            }

            const npcType = npc.type as NpcType;
            const dx = npcX - (player.x || 0);
            const dz = npcZ - (player.z || 0);
            const distance = Math.max(Math.abs(dx), Math.abs(dz)) >> 7;

            const optionsWithIndex: NpcOption[] = [];
            if (npcType.op) {
                for (let opIdx = 0; opIdx < npcType.op.length; opIdx++) {
                    const op = npcType.op[opIdx];
                    if (op) {
                        optionsWithIndex.push({ text: op, opIndex: opIdx + 1 }); // opIndex is 1-based
                    }
                }
            }

            const targetId = npc.faceEntity ?? -1;
            // combatCycle is set to loopCycle + 400 when NPC takes damage
            const combatCycle = npc.combatCycle ?? -1000;
            // NPC is in combat if it was hit recently (within 400 ticks of last damage)
            const inCombat = targetId !== -1 || combatCycle > clientCycle;

            // The server only reports NPC health on hits, and the client entity
            // keeps the last value forever — including through death and respawn,
            // which left respawned NPCs advertised at healthPercent 0 indefinitely.
            // Health is only *known* inside the hitbar window (combatCycle), the
            // same recency the game's own health bar uses; outside it, report null
            // exactly like an NPC that was never hit.
            const healthKnown = combatCycle > clientCycle && (npc.totalHealth ?? 0) > 0;
            const hp = healthKnown ? (npc.health ?? 0) : null;
            const maxHp = healthKnown ? npc.totalHealth : null;
            const healthPercent = hp !== null && maxHp !== null && maxHp > 0
                ? Math.round((hp / maxHp) * 100)
                : null;

            // Convert fine-grained local coords (128 units/tile) to world coordinates
            const npcWorldX = baseX + (npcX >> 7);
            const npcWorldZ = baseZ + (npcZ >> 7);

            // The dispatch paths route to the NPC's route tile with its real
            // footprint (Client.talkToNpc etc.), so the probe must ask the
            // exact same question - see reach.ts invariant 1.
            const tileSceneX = npc.routeX?.[0] ?? npcX >> 7;
            const tileSceneZ = npc.routeZ?.[0] ?? npcZ >> 7;
            const size = (npcType.size as number | undefined) ?? 1;
            const reachable = this.reachProbeReady()
                ? this.reachProbe.canReachEntity(tileSceneX, tileSceneZ, size)
                : undefined;

            npcs.push({
                kind: 'npc',
                id: npcType.id,
                index: npcIndex,
                name: npcType.name || 'Unknown',
                combatLevel: npcType.vislevel || 0,
                x: npcWorldX,
                z: npcWorldZ,
                tileX: baseX + tileSceneX,
                tileZ: baseZ + tileSceneZ,
                size,
                distance,
                hp,
                maxHp,
                healthPercent,
                targetIndex: targetId,
                inCombat,
                lastCombatTick: this.lastNpcCombatTicks.get(npcIndex) ?? null,
                animId: npc.primaryAnim ?? -1,
                spotanimId: npc.spotanimId ?? -1,
                optionsWithIndex,
                options: optionsWithIndex.map(o => o.text),
                reachable
            });
        }

        // Sort by distance
        npcs.sort((a, b) => a.distance - b.distance);
        return npcs;
    }

    private collectNearbyPlayers(): NearbyPlayer[] {
        const c = this.client as any;
        const players: NearbyPlayer[] = [];
        const localPlayer = c.localPlayer;

        if (!localPlayer) return players;

        const playerArray = c.players || [];
        const playerIds = c.playerIds || [];
        const playerCount = c.playerCount || 0;
        // Scene base coordinates for converting local coords to world coords
        const baseX = c.mapBuildBaseX || 0;
        const baseZ = c.mapBuildBaseZ || 0;

        for (let i = 0; i < playerCount; i++) {
            const playerIndex = playerIds[i];
            const player = playerArray[playerIndex] as ClientPlayer | null;

            if (!player || player === localPlayer || !player.name) continue;

            const dx = (player.x || 0) - (localPlayer.x || 0);
            const dz = (player.z || 0) - (localPlayer.z || 0);
            const distance = Math.max(Math.abs(dx), Math.abs(dz)) >> 7;

            // Convert fine-grained local coords (128 units/tile) to world coordinates
            const playerWorldX = baseX + ((player.x || 0) >> 7);
            const playerWorldZ = baseZ + ((player.z || 0) >> 7);

            players.push({
                kind: 'player',
                index: playerIndex,
                name: player.name,
                combatLevel: player.combatLevel || 0,
                x: playerWorldX,
                z: playerWorldZ,
                distance,
                reachable: this.reachProbeReady()
                    ? this.reachProbe.canReachEntity(player.routeX?.[0] ?? (player.x || 0) >> 7, player.routeZ?.[0] ?? (player.z || 0) >> 7, 1)
                    : undefined
            });
        }

        // Sort by distance
        players.sort((a, b) => a.distance - b.distance);
        return players;
    }

    // On-demand scanning for nearby locations (implements ScanProvider)
    scanNearbyLocs(radius?: number): NearbyLoc[] {
        // Standalone call - the player may have moved since the last snapshot.
        // collectState goes through the private form so one fill serves it all.
        this.reachProbe.invalidate();
        return this.collectNearbyLocs(radius);
    }

    private collectNearbyLocs(radius?: number): NearbyLoc[] {
        const c = this.client as any;
        const locs: NearbyLoc[] = [];
        const player = c.localPlayer;
        const world = c.world;

        if (!player || !world) return locs;

        // Also an on-demand ScanProvider entry point, so refresh the fill here
        // too - a door may have opened since the last snapshot.
        this.reachProbe.invalidate();
        const locReachable = (tileX: number, tileZ: number, id: number): boolean | undefined => {
            if (!this.reachProbeReady()) return undefined;
            return this.reachProbe.canReachLoc(tileX, tileZ, id) ?? undefined;
        };

        const currentLevel = c.minusedlevel || 0;
        const playerTileX = (player.x || 0) >> 7;
        const playerTileZ = (player.z || 0) >> 7;
        const baseX = c.mapBuildBaseX || 0;
        const baseZ = c.mapBuildBaseZ || 0;

        // Track seen locations to avoid duplicates (key = `${id}_${x}_${z}`)
        const seen = new Set<string>();

        // Scan nearby tiles (default 15 tile radius)
        const scanRadius = radius ?? 15;
        for (let dx = -scanRadius; dx <= scanRadius; dx++) {
            for (let dz = -scanRadius; dz <= scanRadius; dz++) {
                const tileX = playerTileX + dx;
                const tileZ = playerTileZ + dz;

                if (tileX < 0 || tileX >= 104 || tileZ < 0 || tileZ >= 104) continue;

                const distance = Math.max(Math.abs(dx), Math.abs(dz));

                // Check for regular locations (trees, rocks, etc.)
                const locTypecode = world.sceneType(currentLevel, tileX, tileZ);
                if (locTypecode !== 0) {
                    const locId = (locTypecode >> 14) & 0x7fff;
                    const key = `${locId}_${tileX}_${tileZ}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        try {
                            const locType = LocType.list(locId);
                            // Include locations that have a name (skip unnamed scenery)
                            if (locType.name) {
                                const optionsWithIndex: LocOption[] = [];
                                if (locType.op) {
                                    for (let i = 0; i < locType.op.length; i++) {
                                        const op = locType.op[i];
                                        if (op) {
                                            optionsWithIndex.push({ text: op, opIndex: i + 1 }); // opIndex is 1-based
                                        }
                                    }
                                }
                                const oreType = ROCK_ID_TO_ORE[locId];
                                const name = oreType ? `Rocks ${oreType} ore` : locType.name;
                                locs.push({
                                    id: locId,
                                    name,
                                    x: baseX + tileX,
                                    z: baseZ + tileZ,
                                    level: currentLevel,
                                    distance,
                                    optionsWithIndex,
                                    options: optionsWithIndex.map(o => o.text),
                                    reachable: locReachable(tileX, tileZ, locId)
                                });
                            }
                        } catch { /* ignore errors */ }
                    }
                }

                // Check for wall objects (doors, gates, etc.)
                const wallTypecode = world.wallType(currentLevel, tileX, tileZ);
                if (wallTypecode !== 0) {
                    const wallId = (wallTypecode >> 14) & 0x7fff;
                    const key = `wall_${wallId}_${tileX}_${tileZ}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        try {
                            const locType = LocType.list(wallId);
                            if (locType.name) {
                                const optionsWithIndex: LocOption[] = [];
                                if (locType.op) {
                                    for (let i = 0; i < locType.op.length; i++) {
                                        const op = locType.op[i];
                                        if (op) {
                                            optionsWithIndex.push({ text: op, opIndex: i + 1 });
                                        }
                                    }
                                }
                                locs.push({
                                    id: wallId,
                                    name: locType.name,
                                    x: baseX + tileX,
                                    z: baseZ + tileZ,
                                    level: currentLevel,
                                    distance,
                                    optionsWithIndex,
                                    options: optionsWithIndex.map(o => o.text),
                                    reachable: locReachable(tileX, tileZ, wallId)
                                });
                            }
                        } catch { /* ignore errors */ }
                    }
                }

                // Check for wall decorations (furnaces, ranges, etc.)
                const decorTypecode = world.decorType(currentLevel, tileZ, tileX);
                if (decorTypecode !== 0) {
                    const decorId = (decorTypecode >> 14) & 0x7fff;
                    const key = `decor_${decorId}_${tileX}_${tileZ}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        try {
                            const locType = LocType.list(decorId);
                            if (locType.name) {
                                const optionsWithIndex: LocOption[] = [];
                                if (locType.op) {
                                    for (let i = 0; i < locType.op.length; i++) {
                                        const op = locType.op[i];
                                        if (op) {
                                            optionsWithIndex.push({ text: op, opIndex: i + 1 });
                                        }
                                    }
                                }
                                locs.push({
                                    id: decorId,
                                    name: locType.name,
                                    x: baseX + tileX,
                                    z: baseZ + tileZ,
                                    level: currentLevel,
                                    distance,
                                    optionsWithIndex,
                                    options: optionsWithIndex.map(o => o.text),
                                    reachable: locReachable(tileX, tileZ, decorId)
                                });
                            }
                        } catch { /* ignore errors */ }
                    }
                }

                // Check for ground decorations
                const groundDecorTypecode = world.gdType(currentLevel, tileX, tileZ);
                if (groundDecorTypecode !== 0) {
                    const groundDecorId = (groundDecorTypecode >> 14) & 0x7fff;
                    const key = `gdecor_${groundDecorId}_${tileX}_${tileZ}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        try {
                            const locType = LocType.list(groundDecorId);
                            if (locType.name) {
                                const optionsWithIndex: LocOption[] = [];
                                if (locType.op) {
                                    for (let i = 0; i < locType.op.length; i++) {
                                        const op = locType.op[i];
                                        if (op) {
                                            optionsWithIndex.push({ text: op, opIndex: i + 1 });
                                        }
                                    }
                                }
                                locs.push({
                                    id: groundDecorId,
                                    name: locType.name,
                                    x: baseX + tileX,
                                    z: baseZ + tileZ,
                                    level: currentLevel,
                                    distance,
                                    optionsWithIndex,
                                    options: optionsWithIndex.map(o => o.text),
                                    reachable: locReachable(tileX, tileZ, groundDecorId)
                                });
                            }
                        } catch { /* ignore errors */ }
                    }
                }
            }
        }

        // Sort by distance
        locs.sort((a, b) => a.distance - b.distance);
        return locs;
    }

    // On-demand scanning for ground items (implements ScanProvider)
    scanGroundItems(radius?: number): GroundItem[] {
        this.reachProbe.invalidate(); // standalone call - see scanNearbyLocs
        return this.collectGroundItems(radius);
    }

    private collectGroundItems(radius?: number): GroundItem[] {
        const c = this.client as any;
        const items: GroundItem[] = [];
        const player = c.localPlayer;

        if (!player) return items;

        const objStacks = c.groundObj;
        if (!objStacks) return items;

        // Also an on-demand ScanProvider entry point - see scanNearbyLocs.
        this.reachProbe.invalidate();
        const probeReady = this.reachProbeReady();

        const currentLevel = c.minusedlevel || 0;
        const playerTileX = (player.x || 0) >> 7;
        const playerTileZ = (player.z || 0) >> 7;
        const baseX = c.mapBuildBaseX || 0;
        const baseZ = c.mapBuildBaseZ || 0;

        // Scan nearby tiles (default 15 tile radius)
        const scanRadius = radius ?? 15;
        for (let dx = -scanRadius; dx <= scanRadius; dx++) {
            for (let dz = -scanRadius; dz <= scanRadius; dz++) {
                const tileX = playerTileX + dx;
                const tileZ = playerTileZ + dz;

                if (tileX < 0 || tileX >= 104 || tileZ < 0 || tileZ >= 104) continue;

                const stack = objStacks[currentLevel]?.[tileX]?.[tileZ] as LinkList<ClientObj> | null;
                if (!stack) continue;

                // OPOBJ routes to the item's own tile (0x0 footprint), so one
                // answer covers the whole stack.
                const reachable = probeReady ? this.reachProbe.canReachTile(tileX, tileZ) : undefined;

                // Iterate through the link list
                let obj = stack.head();
                while (obj) {
                    const clientObj = obj as ClientObj;
                    if (clientObj.id !== undefined) {
                        let name = 'Unknown';
                        try {
                            const objType = ObjType.list(clientObj.id);
                            name = objType.name || 'Unknown';
                        } catch { /* ignore */ }

                        const distance = Math.max(Math.abs(dx), Math.abs(dz));
                        items.push({
                            id: clientObj.id,
                            name,
                            count: clientObj.count || 1,
                            x: baseX + tileX,
                            z: baseZ + tileZ,
                            distance,
                            reachable
                        });
                    }
                    obj = stack.next();
                }
            }
        }

        // Sort by distance
        items.sort((a, b) => a.distance - b.distance);
        return items;
    }

    private static readonly MAX_GAME_MESSAGES = 50;

    private collectGameMessages(currentTick: number, publish: boolean): GameMessage[] {
        const c = this.client as any;

        const messageText = c.chatText || [];
        const messageSender = c.chatUsername || [];
        const messageType = c.chatType || [];
        const messageTick = c.messageTick || [];
        const messageSequence = c.messageSequence || [];

        const ownName = String(c.localPlayer?.name ?? '').replace(/@\w+@/g, '').toLowerCase();

        // The client's chat ring is newest-first (index 0 is the most recent) and
        // 100 deep, interleaving player chat with system spam. We keep up to 50 of
        // the most recent so a partner's message isn't evicted by level-up/combat
        // lines within a few ticks (the old 5-deep window was the main reason
        // bot<->bot handoffs silently failed). Type-filtering is left to the SDK
        // (sdk.getChat) so system messages stay available here too.
        const messages: GameMessage[] = [];
        const activeKeys = new Set<string>();
        const fallbackOccurrences = new Map<string, number>();
        for (let i = 0; i < messageText.length && messages.length < BotStateCollector.MAX_GAME_MESSAGES; i++) {
            const text = messageText[i];
            if (!text) continue;

            const type = messageType[i] || 0;
            // Strip @cr1@/@whi@ crown+colour codes so sender filtering is reliable.
            const sender = String(messageSender[i] || '').replace(/@\w+@/g, '');
            const fromSelf = type === 6 || (sender !== '' && sender.toLowerCase() === ownName);
            const rawTick = messageTick[i] || 0;
            const baseKey = `${rawTick}|${type}|${sender}|${text}`;
            const occurrence = fallbackOccurrences.get(baseKey) ?? 0;
            fallbackOccurrences.set(baseKey, occurrence + 1);
            const sequence = messageSequence[i] || 0;
            const key = sequence > 0 ? `seq:${sequence}` : `${baseKey}|occ:${occurrence}`;
            activeKeys.add(key);
            let observation = this.messageObservations.get(key);
            if (!observation) {
                observation = { tick: currentTick, observationId: 0 };
                this.messageObservations.set(key, observation);
            }
            if (publish && observation.observationId === 0) {
                observation.observationId = this.publicationRevision;
            }

            messages.push({
                type,
                text,
                sender,
                tick: observation.tick,
                observationId: observation.observationId || undefined,
                fromSelf
            });
        }
        for (const key of this.messageObservations.keys()) {
            if (!activeKeys.has(key)) this.messageObservations.delete(key);
        }

        // Return in chronological order (oldest first, newest last) so .slice(-N)
        // callers and the formatter pick up the MOST RECENT messages.
        messages.reverse();
        return messages;
    }

    private collectMenuActions(): MenuAction[] {
        const c = this.client as any;
        const actions: MenuAction[] = [];

        const menuOption = c.menuOption || [];
        const menuAction = c.menuAction || [];
        const menuParamA = c.menuParamA || [];
        const menuParamB = c.menuParamB || [];
        const menuParamC = c.menuParamC || [];
        const menuSize = c.menuNumEntries || 0;

        for (let i = 0; i < menuSize; i++) {
            actions.push({
                option: menuOption[i] || '',
                actionCode: menuAction[i] || 0,
                paramA: menuParamA[i] || 0,
                paramB: menuParamB[i] || 0,
                paramC: menuParamC[i] || 0
            });
        }

        return actions;
    }

    private collectShopState(): ShopState {
        const c = this.client as any;
        const shopState: ShopState = {
            isOpen: false,
            title: '',
            shopItems: [],
            playerItems: []
        };

        // Use the Client's isShopOpen() method if available (uses private properties correctly)
        const isShopOpenViaMethod = typeof c.isShopOpen === 'function' ? c.isShopOpen() : false;

        if (isShopOpenViaMethod) {
            shopState.isOpen = true;

            // Get shop title from component 3901 (com_76 in shop_template)
            try {
                const titleComponent = IfType.list[3901];
                if (titleComponent && titleComponent.text) {
                    shopState.title = titleComponent.text;
                }
            } catch { /* ignore */ }

            // Read shop configuration from varps (127=shop_buy, 128=shop_sell, 129=shop_haggle)
            const varps = c.var || [];
            const shopConfig: ShopConfig = {
                buyMultiplier: varps[127] || 60,    // Default from shopkeeper.param
                sellMultiplier: varps[128] || 100,  // Default from shopkeeper.param
                haggle: varps[129] || 10,           // Default from shopkeeper.param
            };
            shopState.shopConfig = shopConfig;

            // Collect shop items from the shop inventory (with prices)
            shopState.shopItems = this.collectInventoryItems(SHOP_TEMPLATE_INV_ID, shopConfig);

            // Collect player items from the shop side panel (for selling)
            shopState.playerItems = this.collectInventoryItems(SHOP_TEMPLATE_SIDE_INV_ID, shopConfig);
        }

        return shopState;
    }

    private collectBankState(): BankState {
        const c = this.client as any;
        const bankState: BankState = {
            isOpen: false,
            items: [],
            // varp 115 = %bankcert (varp.pack), the note/item withdrawal toggle.
            noteMode: (c.var?.[115] ?? 0) === 1
        };

        // Use the Client's isBankOpen() method if available
        const isBankOpenViaMethod = typeof c.isBankOpen === 'function' ? c.isBankOpen() : false;

        if (isBankOpenViaMethod) {
            bankState.isOpen = true;

            // Use the Client's getBankItems() method if available
            if (typeof c.getBankItems === 'function') {
                const rawItems = c.getBankItems();
                bankState.items = rawItems.map((item: any) => ({
                    slot: item.slot,
                    id: item.id,
                    name: item.name,
                    count: item.count
                }));
            }
        }

        return bankState;
    }

    /**
     * Player-to-player trade state, read from the trademain / tradeconfirm
     * interfaces. Works on both screens:
     * - offer screen: offers from trademain:inv / trademain:otherinv, accept
     *   flags parsed from the trademain:status text.
     * - confirm screen: the engine transmits to inv1 (<=13 items) OR inv2
     *   (14+), so read whichever is non-empty; the unused variant is zeroed
     *   by UPDATE_INV_STOP_TRANSMIT when a trade closes. The partner name is
     *   read from trademain:otherplayer, which retains its text from the
     *   offer screen of the same trade.
     */
    private collectTradeState(): TradeState {
        const c = this.client as any;
        const mainModalId = c.mainModalId ?? -1;

        if (mainModalId !== TRADE_MAIN_ID && mainModalId !== TRADE_CONFIRM_ID) {
            return {
                isOpen: false,
                screen: null,
                partner: null,
                myOffer: [],
                theirOffer: [],
                myAccepted: false,
                partnerAccepted: false
            };
        }

        const componentText = (id: number): string => {
            try {
                return IfType.list[id]?.text ?? '';
            } catch {
                return '';
            }
        };

        // "Trading With: <name>" — set on the offer screen, retained on confirm.
        const partnerText = componentText(TRADE_MAIN_PARTNER_TEXT_ID);
        const partnerMatch = partnerText.match(/^Trading With:\s*(.+)$/i);
        const partner = partnerMatch ? partnerMatch[1].trim() : null;

        if (mainModalId === TRADE_MAIN_ID) {
            const status = componentText(TRADE_MAIN_STATUS_TEXT_ID);
            return {
                isOpen: true,
                screen: 'offer',
                partner,
                myOffer: this.collectTradeItems(TRADE_MAIN_INV_ID),
                theirOffer: this.collectTradeItems(TRADE_MAIN_OTHER_INV_ID),
                myAccepted: /waiting for other player/i.test(status),
                partnerAccepted: /other player has accepted/i.test(status)
            };
        }

        const status = componentText(TRADE_CONFIRM_STATUS_TEXT_ID);
        const myInv1 = this.collectTradeItems(TRADE_CONFIRM_INV1_ID);
        const theirInv1 = this.collectTradeItems(TRADE_CONFIRM_OTHER_INV1_ID);
        return {
            isOpen: true,
            screen: 'confirm',
            partner,
            myOffer: myInv1.length > 0 ? myInv1 : this.collectTradeItems(TRADE_CONFIRM_INV2_ID),
            theirOffer: theirInv1.length > 0 ? theirInv1 : this.collectTradeItems(TRADE_CONFIRM_OTHER_INV2_ID),
            myAccepted: /waiting for other player/i.test(status),
            partnerAccepted: /other player has accepted/i.test(status)
        };
    }

    private collectTradeItems(interfaceId: number): TradeItem[] {
        return this.collectInventoryItems(interfaceId).map(item => ({
            slot: item.slot,
            id: item.id,
            name: item.name,
            count: item.count
        }));
    }

    /**
     * Calculate shop price using the game's formula from shop.rs2
     * Formula: scale(max(100, multiplier - min(1000, max(-5000, stockDiff * haggle))), 1000, baseCost)
     */
    private calcShopValue(baseCost: number, haggle: number, multiplier: number, stockDiff: number): number {
        const int5Raw = Math.min(1000, Math.max(-5000, stockDiff * haggle));
        const int5 = Math.max(100, multiplier - int5Raw);
        return Math.floor(baseCost * int5 / 1000);
    }

    private collectInventoryItems(interfaceId: number, shopConfig?: ShopConfig): ShopItem[] {
        const items: ShopItem[] = [];

        try {
            const component = IfType.list[interfaceId];
            if (!component || !component.linkObjType || !component.linkObjNumber) {
                return items;
            }

            for (let slot = 0; slot < component.linkObjType.length; slot++) {
                const objId = component.linkObjType[slot];
                const count = component.linkObjNumber[slot];

                if (objId > 0) {
                    let name = 'Unknown';
                    let baseCost = 1;
                    try {
                        const obj = ObjType.list(objId - 1);
                        name = obj.name || 'Unknown';
                        baseCost = obj.cost || 1;
                    } catch { /* ignore */ }

                    // Calculate prices using shop config (stockDiff=0 for price at current stock)
                    let buyPrice = baseCost;
                    let sellPrice = baseCost;
                    if (shopConfig) {
                        // Buy price = what player pays TO buy FROM shop (uses sellMultiplier)
                        buyPrice = this.calcShopValue(baseCost, shopConfig.haggle, shopConfig.sellMultiplier, 0);
                        // Sell price = what player receives when selling TO shop (uses buyMultiplier)
                        sellPrice = this.calcShopValue(baseCost, shopConfig.haggle, shopConfig.buyMultiplier, 0);
                        // Ensure buy price is at least 1
                        if (buyPrice < 1) buyPrice = 1;
                    }

                    items.push({
                        slot,
                        id: objId - 1,
                        name,
                        count,
                        baseCost,
                        buyPrice,
                        sellPrice
                    });
                }
            }
        } catch { /* ignore errors */ }

        return items;
    }
}
