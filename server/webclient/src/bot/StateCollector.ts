// StateCollector.ts - Collects game state from the client
// Extracts all relevant game data for bot decision-making

import type { Client } from '#/client/Client.js';
import type ClientNpc from '#/dash3d/ClientNpc.js';
import type ClientPlayer from '#/dash3d/ClientPlayer.js';
import type ClientObj from '#/dash3d/ClientObj.js';
import Component from '#/config/Component.js';
import ObjType from '#/config/ObjType.js';
import NpcType from '#/config/NpcType.js';
import LocType from '#/config/LocType.js';
import type LinkList from '#/datastruct/LinkList.js';

import {
    SKILL_NAMES,
    INVENTORY_INTERFACE_ID,
    EQUIPMENT_INTERFACE_ID,
    SHOP_TEMPLATE_INV_ID,
    SHOP_TEMPLATE_SIDE_INV_ID,
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
    type PlayerState,
    type CombatStyleState,
    type CombatStyleOption,
    type CombatEvent,
    type DialogState,
    type InterfaceState,
    type PrayerState
} from './types.js';
import type { ScanProvider } from './ActionExecutor.js';

/** Cached prayer component discovery result */
interface PrayerComponentMap {
    /** Component IDs for each prayer (indexed 0-14) */
    componentIds: number[];
    /** Varp IDs for each prayer (indexed 0-14) */
    varpIds: number[];
}

export class BotStateCollector implements ScanProvider {
    private client: Client;
    // Combat event tracking
    private combatEvents: CombatEvent[] = [];
    private lastPlayerDamageCycles: Int32Array = new Int32Array(4);
    private lastNpcDamageCycles: Map<number, Int32Array> = new Map();
    private static readonly MAX_EVENTS = 50;
    private static readonly EVENT_EXPIRY_TICKS = 50;

    // Cached prayer component map (built once on first use)
    private prayerComponentMap: PrayerComponentMap | null = null;

    constructor(client: Client) {
        this.client = client;
    }

    collectState(): BotState {
        const c = this.client as any; // Access private members
        const currentTick = c.loopCycle || 0;

        // Collect combat events (must be done before returning state)
        this.collectCombatEvents(currentTick);

        return {
            tick: currentTick,
            player: this.collectPlayerState(),
            skills: this.collectSkills(),
            inventory: this.collectInventory(INVENTORY_INTERFACE_ID),
            equipment: this.collectInventory(EQUIPMENT_INTERFACE_ID),
            combatStyle: this.collectCombatStyle(),
            nearbyNpcs: this.collectNearbyNpcs(),
            nearbyPlayers: this.collectNearbyPlayers(),
            nearbyLocs: this.scanNearbyLocs(),
            groundItems: this.scanGroundItems(),
            gameMessages: this.collectGameMessages(),
            recentDialogs: this.collectRecentDialogs(),
            menuActions: this.collectMenuActions(),
            shop: this.collectShopState(),
            bank: this.collectBankState(),
            inGame: c.ingame || false,
            combatEvents: [...this.combatEvents], // Return copy of events
            dialog: this.collectDialogState(),
            interface: this.collectInterfaceState(),
            modalOpen: (c.viewportInterfaceId ?? -1) !== -1,
            modalInterface: c.viewportInterfaceId ?? -1,
            prayers: this.collectPrayerState()
        };
    }

    /**
     * Discover prayer components by scanning Component.types for toggle buttons
     * that check a varp == 1. Groups by parent layer to find the prayer interface
     * (the one with exactly 15 toggle buttons).
     */
    buildPrayerComponentMap(): PrayerComponentMap | null {
        if (this.prayerComponentMap) return this.prayerComponentMap;

        // Find all toggle buttons (buttonType === 4) whose first script is load_var (opcode 5)
        // and whose comparator checks == 1 (scriptComparator[0] === 1 means "equals", scriptOperand[0] === 1)
        const togglesByParent = new Map<number, Array<{ id: number; varpId: number }>>();

        for (let i = 0; i < Component.types.length; i++) {
            const com = Component.types[i];
            if (!com || com.buttonType !== 4) continue; // Not a toggle button
            if (!com.scripts || !com.scripts[0]) continue;
            if (!com.scriptComparator || !com.scriptOperand) continue;

            const script = com.scripts[0];
            // Script must be: [5, varpId, 0] - load_var then return
            if (script.length < 3 || script[0] !== 5 || script[2] !== 0) continue;

            // Comparator must check equals (type 1 = equals) and operand must be 1
            if (com.scriptComparator[0] !== 1 || com.scriptOperand[0] !== 1) continue;

            const varpId = script[1];
            const parent = com.layer;

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
                const skillLevel = c.skillLevel || [];
                const skillBaseLevel = c.skillBaseLevel || [];
                defaultState.prayerPoints = skillLevel[prayerSkillIndex] || 0;
                defaultState.prayerLevel = skillBaseLevel[prayerSkillIndex] || 0;
            }

            // Discover prayer components and read varp states
            const map = this.buildPrayerComponentMap();
            if (!map) return defaultState;

            const varps = c.varps || [];
            for (let i = 0; i < map.varpIds.length; i++) {
                defaultState.activePrayers[i] = varps[map.varpIds[i]] === 1;
            }
        } catch { /* ignore errors */ }

        return defaultState;
    }

    private collectDialogState(): DialogState {
        const c = this.client as any;
        const isOpen = c.chatInterfaceId !== -1;
        const isWaiting = c.pressedContinueOption || false;

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

    private collectRecentDialogs(): Array<{ text: string[]; tick: number; interfaceId: number }> {
        if (typeof this.client.getDialogHistory === 'function') {
            return this.client.getDialogHistory();
        }
        return [];
    }

    private collectInterfaceState(): InterfaceState {
        const c = this.client as any;
        const interfaceId = c.viewportInterfaceId ?? -1;
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
                    // New damage detected
                    const damage = player.damageValues[i] || 0;
                    this.combatEvents.push({
                        tick: currentTick,
                        type: 'damage_taken',
                        damage,
                        sourceType: 'npc', // Assume NPC source for now
                        sourceIndex: player.targetId ?? -1,
                        targetType: 'player',
                        targetIndex: -1 // Self
                    });
                }
                this.lastPlayerDamageCycles[i] = cycle;
            }
        }

        // Detect NPC damage (when player deals damage to NPCs)
        const npcArray = c.npcs || [];
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
                    // Check if player is targeting this NPC (likely we dealt the damage)
                    const playerTarget = player?.targetId ?? -1;
                    const isPlayerSource = playerTarget === npcIndex;

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

        // Clean up tracking for NPCs no longer nearby
        const activeNpcIndices = new Set<number>();
        for (let i = 0; i < npcCount; i++) {
            activeNpcIndices.add(npcIds[i]);
        }
        for (const npcIndex of this.lastNpcDamageCycles.keys()) {
            if (!activeNpcIndices.has(npcIndex)) {
                this.lastNpcDamageCycles.delete(npcIndex);
            }
        }

        // Limit event buffer size
        if (this.combatEvents.length > BotStateCollector.MAX_EVENTS) {
            this.combatEvents = this.combatEvents.slice(-BotStateCollector.MAX_EVENTS);
        }
    }

    private collectPlayerState(): PlayerState | null {
        const c = this.client as any;
        const player = c.localPlayer;
        const loopCycle = c.loopCycle || 0;

        if (!player) return null;

        // Get player's combat state
        const targetId = player.targetId ?? -1;
        // combatCycle is set to loopCycle + 400 when damage is taken/dealt
        // So if combatCycle > loopCycle, we're in combat (within 400 ticks of last hit)
        const combatCycle = player.combatCycle ?? -1000;
        const inCombat = targetId !== -1 || combatCycle > loopCycle;

        // Find most recent damage tick from damageCycles array
        let lastDamageTick = -1;
        const damageCycles = player.damageCycles;
        if (damageCycles) {
            for (let i = 0; i < damageCycles.length; i++) {
                if (damageCycles[i] > lastDamageTick) {
                    lastDamageTick = damageCycles[i];
                }
            }
        }

        // Hitpoints is skill index 3
        const skillLevel = c.skillLevel || [];
        const skillBaseLevel = c.skillBaseLevel || [];

        return {
            name: player.name || 'Unknown',
            combatLevel: player.combatLevel || 0,
            hp: skillLevel[3] || 0,
            maxHp: skillBaseLevel[3] || 0,
            x: player.x || 0,
            z: player.z || 0,
            worldX: (c.sceneBaseTileX || 0) + ((player.x || 0) >> 7),
            worldZ: (c.sceneBaseTileZ || 0) + ((player.z || 0) >> 7),
            level: c.currentLevel || 0,
            runEnergy: c.runenergy || 0,
            runWeight: c.runweight || 0,
            animId: player.primarySeqId ?? -1,
            spotanimId: player.spotanimId ?? -1,
            combat: {
                inCombat,
                targetIndex: targetId,
                lastDamageTick
            }
        };
    }

    private collectSkills(): SkillState[] {
        const c = this.client as any;
        const skills: SkillState[] = [];

        const skillLevel = c.skillLevel || [];
        const skillBaseLevel = c.skillBaseLevel || [];
        const skillExperience = c.skillExperience || [];

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

    // Combat style varp ID (com_mode) - this is determined by the server's varp pack order
    // In most RS2 servers, com_mode is at a low index. We'll try common indices.
    private static readonly VARP_COM_MODE = 43; // Standard RS2 attack style varp

    private collectCombatStyle(): CombatStyleState {
        const c = this.client as any;

        // Default state
        const defaultState: CombatStyleState = {
            currentStyle: 0,
            weaponName: 'Unarmed',
            styles: []
        };

        try {
            // Get current combat style from varp
            // Try to find the varp by checking what's a reasonable value (0-3)
            let currentStyle = 0;
            const varps = c.varps || [];

            // Try common varp indices for com_mode
            // Check indices that could contain 0-3 values
            for (const tryIndex of [43, 11, 12, 13, 42, 44]) {
                const val = varps[tryIndex];
                if (val !== undefined && val >= 0 && val <= 3) {
                    currentStyle = val;
                    break;
                }
            }

            // Get equipped weapon
            const equipment = this.collectInventory(EQUIPMENT_INTERFACE_ID);
            const weapon = equipment.find(item => item.slot === 3); // Slot 3 is right hand (weapon)
            const weaponName = weapon?.name || 'Unarmed';

            // Determine combat styles based on weapon type
            // For simplicity, we'll use the standard melee styles
            // More sophisticated logic would check weapon category
            let styles: CombatStyleOption[] = [];

            if (!weapon || weaponName === 'Unarmed') {
                // Unarmed combat
                styles = [
                    { index: 0, name: 'Punch', type: 'Accurate', trainedSkill: 'Attack' },
                    { index: 1, name: 'Kick', type: 'Aggressive', trainedSkill: 'Strength' },
                    { index: 2, name: 'Block', type: 'Defensive', trainedSkill: 'Defence' }
                ];
            } else {
                // Check weapon name to determine style types
                const wn = weaponName.toLowerCase();

                if (wn.includes('bow') || wn.includes('crossbow')) {
                    // Ranged weapons
                    styles = [
                        { index: 0, name: 'Accurate', type: 'Accurate', trainedSkill: 'Ranged' },
                        { index: 1, name: 'Rapid', type: 'Rapid', trainedSkill: 'Ranged' },
                        { index: 2, name: 'Longrange', type: 'Longrange', trainedSkill: 'Defence' }
                    ];
                } else if (wn.includes('staff') || wn.includes('wand')) {
                    // Magic weapons
                    styles = [
                        { index: 0, name: 'Bash', type: 'Accurate', trainedSkill: 'Attack' },
                        { index: 1, name: 'Pound', type: 'Aggressive', trainedSkill: 'Strength' },
                        { index: 2, name: 'Focus', type: 'Defensive', trainedSkill: 'Defence' }
                    ];
                } else if (wn.includes('scimitar') || wn.includes('sword') || wn.includes('dagger') || wn.includes('longsword')) {
                    // Slashing/stabbing weapons (4 styles)
                    styles = [
                        { index: 0, name: 'Chop', type: 'Accurate', trainedSkill: 'Attack' },
                        { index: 1, name: 'Slash', type: 'Aggressive', trainedSkill: 'Strength' },
                        { index: 2, name: 'Lunge', type: 'Controlled', trainedSkill: 'Shared' },
                        { index: 3, name: 'Block', type: 'Defensive', trainedSkill: 'Defence' }
                    ];
                } else if (wn.includes('mace') || wn.includes('hammer') || wn.includes('maul')) {
                    // Crush weapons (3 styles)
                    styles = [
                        { index: 0, name: 'Pound', type: 'Accurate', trainedSkill: 'Attack' },
                        { index: 1, name: 'Pummel', type: 'Aggressive', trainedSkill: 'Strength' },
                        { index: 2, name: 'Block', type: 'Defensive', trainedSkill: 'Defence' }
                    ];
                } else if (wn.includes('2h') || wn.includes('godsword') || wn.includes('battleaxe')) {
                    // 2-handed weapons (4 styles)
                    styles = [
                        { index: 0, name: 'Chop', type: 'Accurate', trainedSkill: 'Attack' },
                        { index: 1, name: 'Slash', type: 'Aggressive', trainedSkill: 'Strength' },
                        { index: 2, name: 'Smash', type: 'Aggressive', trainedSkill: 'Strength' },
                        { index: 3, name: 'Block', type: 'Defensive', trainedSkill: 'Defence' }
                    ];
                } else {
                    // Default melee (4 styles - sword-like)
                    styles = [
                        { index: 0, name: 'Stab', type: 'Accurate', trainedSkill: 'Attack' },
                        { index: 1, name: 'Lunge', type: 'Aggressive', trainedSkill: 'Strength' },
                        { index: 2, name: 'Slash', type: 'Controlled', trainedSkill: 'Shared' },
                        { index: 3, name: 'Block', type: 'Defensive', trainedSkill: 'Defence' }
                    ];
                }
            }

            // Ensure currentStyle is within valid range
            if (currentStyle >= styles.length) {
                currentStyle = 0;
            }

            return {
                currentStyle,
                weaponName,
                styles
            };
        } catch {
            return defaultState;
        }
    }

    private collectInventory(interfaceId: number): InventoryItem[] {
        const items: InventoryItem[] = [];

        try {
            const component = Component.types[interfaceId];
            if (!component || !component.invSlotObjId || !component.invSlotObjCount) {
                return items;
            }

            for (let slot = 0; slot < component.invSlotObjId.length; slot++) {
                const objId = component.invSlotObjId[slot];
                const count = component.invSlotObjCount[slot];

                if (objId > 0) {
                    let name = 'Unknown';
                    const optionsWithIndex: InventoryItemOption[] = [];

                    try {
                        const obj = ObjType.get(objId - 1);
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

    private collectNearbyNpcs(): NearbyNpc[] {
        const c = this.client as any;
        const npcs: NearbyNpc[] = [];
        const player = c.localPlayer;

        if (!player) return npcs;

        const npcArray = c.npcs || [];
        const npcIds = c.npcIds || [];
        const npcCount = c.npcCount || 0;
        // Scene base coordinates for converting local coords to world coords
        const baseX = c.sceneBaseTileX || 0;
        const baseZ = c.sceneBaseTileZ || 0;

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

            const hp = npc.health || 0;
            const maxHp = npc.totalHealth || 0;
            // healthPercent is null until NPC takes damage (server only sends health on hit)
            const healthPercent = maxHp > 0 ? Math.round((hp / maxHp) * 100) : null;
            const targetId = npc.targetId ?? -1;
            // combatCycle is set to loopCycle + 400 when NPC takes damage
            const combatCycle = npc.combatCycle ?? -1000;
            const loopCycle = c.loopCycle || 0;
            // NPC is in combat if it has a target OR was hit recently (within 400 ticks)
            const inCombat = targetId !== -1 || combatCycle > loopCycle;

            // Convert fine-grained local coords (128 units/tile) to world coordinates
            const npcWorldX = baseX + (npcX >> 7);
            const npcWorldZ = baseZ + (npcZ >> 7);

            npcs.push({
                index: npcIndex,
                name: npcType.name || 'Unknown',
                combatLevel: npcType.vislevel || 0,
                x: npcWorldX,
                z: npcWorldZ,
                distance,
                hp,
                maxHp,
                healthPercent,
                targetIndex: targetId,
                inCombat,
                combatCycle,
                animId: npc.primarySeqId ?? -1,
                spotanimId: npc.spotanimId ?? -1,
                optionsWithIndex,
                options: optionsWithIndex.map(o => o.text)
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
        const baseX = c.sceneBaseTileX || 0;
        const baseZ = c.sceneBaseTileZ || 0;

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
                index: playerIndex,
                name: player.name,
                combatLevel: player.combatLevel || 0,
                x: playerWorldX,
                z: playerWorldZ,
                distance
            });
        }

        // Sort by distance
        players.sort((a, b) => a.distance - b.distance);
        return players;
    }

    // On-demand scanning for nearby locations (implements ScanProvider)
    scanNearbyLocs(radius?: number): NearbyLoc[] {
        const c = this.client as any;
        const locs: NearbyLoc[] = [];
        const player = c.localPlayer;
        const scene = c.scene;

        if (!player || !scene) return locs;

        const currentLevel = c.currentLevel || 0;
        const playerTileX = (player.x || 0) >> 7;
        const playerTileZ = (player.z || 0) >> 7;
        const baseX = c.sceneBaseTileX || 0;
        const baseZ = c.sceneBaseTileZ || 0;

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
                const locTypecode = scene.getLocTypecode(currentLevel, tileX, tileZ);
                if (locTypecode !== 0) {
                    const locId = (locTypecode >> 14) & 0x7fff;
                    const key = `${locId}_${tileX}_${tileZ}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        try {
                            const locType = LocType.get(locId);
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
                                locs.push({
                                    id: locId,
                                    name: locType.name,
                                    x: baseX + tileX,
                                    z: baseZ + tileZ,
                                    distance,
                                    optionsWithIndex,
                                    options: optionsWithIndex.map(o => o.text)
                                });
                            }
                        } catch { /* ignore errors */ }
                    }
                }

                // Check for wall objects (doors, gates, etc.)
                const wallTypecode = scene.getWallTypecode(currentLevel, tileX, tileZ);
                if (wallTypecode !== 0) {
                    const wallId = (wallTypecode >> 14) & 0x7fff;
                    const key = `wall_${wallId}_${tileX}_${tileZ}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        try {
                            const locType = LocType.get(wallId);
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
                                    distance,
                                    optionsWithIndex,
                                    options: optionsWithIndex.map(o => o.text)
                                });
                            }
                        } catch { /* ignore errors */ }
                    }
                }

                // Check for wall decorations (furnaces, ranges, etc.)
                const decorTypecode = scene.getDecorTypecode(currentLevel, tileZ, tileX);
                if (decorTypecode !== 0) {
                    const decorId = (decorTypecode >> 14) & 0x7fff;
                    const key = `decor_${decorId}_${tileX}_${tileZ}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        try {
                            const locType = LocType.get(decorId);
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
                                    distance,
                                    optionsWithIndex,
                                    options: optionsWithIndex.map(o => o.text)
                                });
                            }
                        } catch { /* ignore errors */ }
                    }
                }

                // Check for ground decorations
                const groundDecorTypecode = scene.getGroundDecorTypecode(currentLevel, tileX, tileZ);
                if (groundDecorTypecode !== 0) {
                    const groundDecorId = (groundDecorTypecode >> 14) & 0x7fff;
                    const key = `gdecor_${groundDecorId}_${tileX}_${tileZ}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        try {
                            const locType = LocType.get(groundDecorId);
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
                                    distance,
                                    optionsWithIndex,
                                    options: optionsWithIndex.map(o => o.text)
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
        const c = this.client as any;
        const items: GroundItem[] = [];
        const player = c.localPlayer;

        if (!player) return items;

        const objStacks = c.objStacks;
        if (!objStacks) return items;

        const currentLevel = c.currentLevel || 0;
        const playerTileX = (player.x || 0) >> 7;
        const playerTileZ = (player.z || 0) >> 7;
        const baseX = c.sceneBaseTileX || 0;
        const baseZ = c.sceneBaseTileZ || 0;

        // Scan nearby tiles (default 15 tile radius)
        const scanRadius = radius ?? 15;
        for (let dx = -scanRadius; dx <= scanRadius; dx++) {
            for (let dz = -scanRadius; dz <= scanRadius; dz++) {
                const tileX = playerTileX + dx;
                const tileZ = playerTileZ + dz;

                if (tileX < 0 || tileX >= 104 || tileZ < 0 || tileZ >= 104) continue;

                const stack = objStacks[currentLevel]?.[tileX]?.[tileZ] as LinkList | null;
                if (!stack) continue;

                // Iterate through the link list
                let obj = stack.head();
                while (obj) {
                    const clientObj = obj as ClientObj;
                    if (clientObj.index !== undefined) {
                        let name = 'Unknown';
                        try {
                            const objType = ObjType.get(clientObj.index);
                            name = objType.name || 'Unknown';
                        } catch { /* ignore */ }

                        const distance = Math.max(Math.abs(dx), Math.abs(dz));
                        items.push({
                            id: clientObj.index,
                            name,
                            count: clientObj.count || 1,
                            x: baseX + tileX,
                            z: baseZ + tileZ,
                            distance
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

    private collectGameMessages(): GameMessage[] {
        const c = this.client as any;
        const messages: GameMessage[] = [];

        const messageText = c.messageText || [];
        const messageSender = c.messageSender || [];
        const messageType = c.messageType || [];
        const messageTick = c.messageTick || [];

        // Get recent messages (up to 5)
        for (let i = 0; i < 10; i++) {
            const text = messageText[i];
            const type = messageType[i] || 0;

            if (text) {
                messages.push({
                    type: type,
                    text: text,
                    sender: messageSender[i] || '',
                    tick: messageTick[i] || 0
                });
            }

            if (messages.length >= 5) break;
        }

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
        const menuSize = c.menuSize || 0;

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
                const titleComponent = Component.types[3901];
                if (titleComponent && titleComponent.text) {
                    shopState.title = titleComponent.text;
                }
            } catch { /* ignore */ }

            // Read shop configuration from varps (127=shop_buy, 128=shop_sell, 129=shop_haggle)
            const varps = c.varps || [];
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
            items: []
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
            const component = Component.types[interfaceId];
            if (!component || !component.invSlotObjId || !component.invSlotObjCount) {
                return items;
            }

            for (let slot = 0; slot < component.invSlotObjId.length; slot++) {
                const objId = component.invSlotObjId[slot];
                const count = component.invSlotObjCount[slot];

                if (objId > 0) {
                    let name = 'Unknown';
                    let baseCost = 1;
                    try {
                        const obj = ObjType.get(objId - 1);
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
