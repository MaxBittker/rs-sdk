// BotSDK.ts - Bot Development SDK for RuneScape 2 Client
// Provides a textual overview of game state for bot development

import type { Client } from '#/client/Client.js';
import type ClientNpc from '#/dash3d/ClientNpc.js';
import type ClientPlayer from '#/dash3d/ClientPlayer.js';
import type ClientObj from '#/dash3d/ClientObj.js';
import Component from '#/config/Component.js';
import ObjType from '#/config/ObjType.js';
import NpcType from '#/config/NpcType.js';
import LocType from '#/config/LocType.js';
import type LinkList from '#/datastruct/LinkList.js';
import { AgentPanel } from './AgentPanel.js';

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
    options: string[];                        // Display-only list of option texts
    optionsWithIndex: InventoryItemOption[];  // Options with their actual op index
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
    options: string[];           // Display-only list of option texts
    optionsWithIndex: NpcOption[];  // Options with their actual op index
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
    options: string[];           // Display-only list of option texts
    optionsWithIndex: LocOption[];  // Options with their actual op index
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
    shopItems: ShopItem[];      // Items the shop is selling
    playerItems: ShopItem[];    // Player inventory items (for selling)
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
    menuActions: MenuAction[];
    shop: ShopState;
    inGame: boolean;
}

// State collector class
export class BotStateCollector {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    collectState(): BotState {
        const c = this.client as any; // Access private members

        return {
            tick: c.loopCycle || 0,
            player: this.collectPlayerState(),
            skills: this.collectSkills(),
            inventory: this.collectInventory(INVENTORY_INTERFACE_ID),
            equipment: this.collectInventory(EQUIPMENT_INTERFACE_ID),
            combatStyle: this.collectCombatStyle(),
            nearbyNpcs: this.collectNearbyNpcs(),
            nearbyPlayers: this.collectNearbyPlayers(),
            nearbyLocs: this.collectNearbyLocs(),
            groundItems: this.collectGroundItems(),
            gameMessages: this.collectGameMessages(),
            menuActions: this.collectMenuActions(),
            shop: this.collectShopState(),
            inGame: c.ingame || false
        };
    }

    private collectPlayerState(): PlayerState | null {
        const c = this.client as any;
        const player = c.localPlayer;

        if (!player) return null;

        return {
            name: player.name || 'Unknown',
            combatLevel: player.combatLevel || 0,
            x: player.x || 0,
            z: player.z || 0,
            worldX: (c.sceneBaseTileX || 0) + ((player.x || 0) >> 7),
            worldZ: (c.sceneBaseTileZ || 0) + ((player.z || 0) >> 7),
            level: c.currentLevel || 0,
            runEnergy: c.runenergy || 0,
            runWeight: c.runweight || 0
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
                    const options: string[] = [];
                    const optionsWithIndex: InventoryItemOption[] = [];

                    try {
                        const obj = ObjType.get(objId - 1);
                        name = obj.name || 'Unknown';

                        // Get inventory options (iop) from the object type
                        if (obj.iop) {
                            for (let opIdx = 0; opIdx < obj.iop.length; opIdx++) {
                                const op = obj.iop[opIdx];
                                if (op) {
                                    options.push(op);
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
                        options,
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

        for (let i = 0; i < npcCount; i++) {
            const npcIndex = npcIds[i];
            const npc = npcArray[npcIndex] as ClientNpc | null;

            if (!npc || !npc.type) continue;

            const npcType = npc.type as NpcType;
            const dx = (npc.x || 0) - (player.x || 0);
            const dz = (npc.z || 0) - (player.z || 0);
            const distance = Math.max(Math.abs(dx), Math.abs(dz)) >> 7;

            const options: string[] = [];
            const optionsWithIndex: NpcOption[] = [];
            if (npcType.op) {
                for (let opIdx = 0; opIdx < npcType.op.length; opIdx++) {
                    const op = npcType.op[opIdx];
                    if (op) {
                        options.push(op);
                        optionsWithIndex.push({ text: op, opIndex: opIdx + 1 }); // opIndex is 1-based
                    }
                }
            }

            npcs.push({
                index: npcIndex,
                name: npcType.name || 'Unknown',
                combatLevel: npcType.vislevel || 0,
                x: npc.x || 0,
                z: npc.z || 0,
                distance,
                options,
                optionsWithIndex
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

        for (let i = 0; i < playerCount; i++) {
            const playerIndex = playerIds[i];
            const player = playerArray[playerIndex] as ClientPlayer | null;

            if (!player || player === localPlayer || !player.name) continue;

            const dx = (player.x || 0) - (localPlayer.x || 0);
            const dz = (player.z || 0) - (localPlayer.z || 0);
            const distance = Math.max(Math.abs(dx), Math.abs(dz)) >> 7;

            players.push({
                index: playerIndex,
                name: player.name,
                combatLevel: player.combatLevel || 0,
                x: player.x || 0,
                z: player.z || 0,
                distance
            });
        }

        // Sort by distance
        players.sort((a, b) => a.distance - b.distance);
        return players;
    }

    private collectNearbyLocs(): NearbyLoc[] {
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

        // Scan nearby tiles
        const scanRadius = 15;
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
                                const options: string[] = [];
                                const optionsWithIndex: LocOption[] = [];
                                if (locType.op) {
                                    for (let i = 0; i < locType.op.length; i++) {
                                        const op = locType.op[i];
                                        if (op) {
                                            options.push(op);
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
                                    options,
                                    optionsWithIndex
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
                                const options: string[] = [];
                                const optionsWithIndex: LocOption[] = [];
                                if (locType.op) {
                                    for (let i = 0; i < locType.op.length; i++) {
                                        const op = locType.op[i];
                                        if (op) {
                                            options.push(op);
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
                                    options,
                                    optionsWithIndex
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
                                const options: string[] = [];
                                const optionsWithIndex: LocOption[] = [];
                                if (locType.op) {
                                    for (let i = 0; i < locType.op.length; i++) {
                                        const op = locType.op[i];
                                        if (op) {
                                            options.push(op);
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
                                    options,
                                    optionsWithIndex
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
                                const options: string[] = [];
                                const optionsWithIndex: LocOption[] = [];
                                if (locType.op) {
                                    for (let i = 0; i < locType.op.length; i++) {
                                        const op = locType.op[i];
                                        if (op) {
                                            options.push(op);
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
                                    options,
                                    optionsWithIndex
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

    private collectGroundItems(): GroundItem[] {
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

        // Scan nearby tiles (within reasonable range)
        const scanRadius = 15;
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

        // Get the 5 most recent messages (index 0 is most recent)
        for (let i = 0; i < 5; i++) {
            const text = messageText[i];
            if (text) {
                messages.push({
                    type: messageType[i] || 0,
                    text: text,
                    sender: messageSender[i] || '',
                    tick: messageTick[i] || 0
                });
            }
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

            // Collect shop items from the shop inventory
            shopState.shopItems = this.collectInventoryItems(SHOP_TEMPLATE_INV_ID);

            // Collect player items from the shop side panel (for selling)
            shopState.playerItems = this.collectInventoryItems(SHOP_TEMPLATE_SIDE_INV_ID);
        }

        return shopState;
    }

    private collectInventoryItems(interfaceId: number): ShopItem[] {
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
                    try {
                        const obj = ObjType.get(objId - 1);
                        name = obj.name || 'Unknown';
                    } catch { /* ignore */ }

                    items.push({
                        slot,
                        id: objId - 1,
                        name,
                        count
                    });
                }
            }
        } catch { /* ignore errors */ }

        return items;
    }
}

// Format state as text for display
export function formatBotState(state: BotState): string {
    const lines: string[] = [];

    lines.push('=== BOT SDK STATE ===');
    lines.push(`Tick: ${state.tick} | In Game: ${state.inGame}`);
    lines.push('');

    // Player info
    if (state.player) {
        const p = state.player;
        lines.push('--- PLAYER ---');
        lines.push(`${p.name} (Combat ${p.combatLevel})`);
        lines.push(`Position: (${p.worldX}, ${p.worldZ}) Level ${p.level}`);
        lines.push(`Run Energy: ${p.runEnergy}% | Weight: ${p.runWeight}kg`);
        lines.push('');
    }

    // Key stats (Hitpoints, Attack, Strength, Defence)
    lines.push('--- KEY STATS ---');
    const keySkills = ['Hitpoints', 'Attack', 'Strength', 'Defence', 'Magic', 'Ranged', 'Prayer'];
    for (const skillName of keySkills) {
        const skill = state.skills.find(s => s.name === skillName);
        if (skill) {
            const xpStr = skill.experience.toLocaleString();
            lines.push(`${skill.name}: ${skill.level}/${skill.baseLevel} (${xpStr} xp)`);
        }
    }
    lines.push('');

    // Inventory summary
    lines.push('--- INVENTORY ---');
    if (state.inventory.length === 0) {
        lines.push('Empty');
    } else {
        const itemCounts: Map<string, number> = new Map();
        for (const item of state.inventory) {
            const key = item.name;
            itemCounts.set(key, (itemCounts.get(key) || 0) + item.count);
        }
        for (const [name, qty] of itemCounts) {
            lines.push(`${name} x${qty}`);
        }
    }
    lines.push('');

    // Nearby NPCs
    lines.push('--- NEARBY NPCS ---');
    if (state.nearbyNpcs.length === 0) {
        lines.push('None');
    } else {
        for (let i = 0; i < Math.min(5, state.nearbyNpcs.length); i++) {
            const npc = state.nearbyNpcs[i];
            const lvlStr = npc.combatLevel > 0 ? ` (Lvl ${npc.combatLevel})` : '';
            const opStr = npc.options.length > 0 ? ` [${npc.options.join(', ')}]` : '';
            lines.push(`${npc.name}${lvlStr} - ${npc.distance} tiles${opStr}`);
        }
        if (state.nearbyNpcs.length > 5) {
            lines.push(`... and ${state.nearbyNpcs.length - 5} more`);
        }
    }
    lines.push('');

    // Nearby Players
    lines.push('--- NEARBY PLAYERS ---');
    if (state.nearbyPlayers.length === 0) {
        lines.push('None');
    } else {
        for (let i = 0; i < Math.min(5, state.nearbyPlayers.length); i++) {
            const pl = state.nearbyPlayers[i];
            lines.push(`${pl.name} (Combat ${pl.combatLevel}) - ${pl.distance} tiles`);
        }
        if (state.nearbyPlayers.length > 5) {
            lines.push(`... and ${state.nearbyPlayers.length - 5} more`);
        }
    }
    lines.push('');

    // Nearby Locations (interactable objects)
    lines.push('--- NEARBY OBJECTS ---');
    if (state.nearbyLocs.length === 0) {
        lines.push('None');
    } else {
        for (let i = 0; i < Math.min(8, state.nearbyLocs.length); i++) {
            const loc = state.nearbyLocs[i];
            const opStr = loc.options.length > 0 ? ` [${loc.options.join(', ')}]` : '';
            lines.push(`${loc.name} at (${loc.x}, ${loc.z}) - ${loc.distance} tiles${opStr}`);
        }
        if (state.nearbyLocs.length > 8) {
            lines.push(`... and ${state.nearbyLocs.length - 8} more`);
        }
    }
    lines.push('');

    // Ground items
    lines.push('--- GROUND ITEMS ---');
    if (state.groundItems.length === 0) {
        lines.push('None');
    } else {
        for (let i = 0; i < Math.min(5, state.groundItems.length); i++) {
            const item = state.groundItems[i];
            lines.push(`${item.name} x${item.count} - ${item.distance} tiles`);
        }
        if (state.groundItems.length > 5) {
            lines.push(`... and ${state.groundItems.length - 5} more`);
        }
    }
    lines.push('');

    // Recent game messages
    lines.push('--- RECENT MESSAGES ---');
    if (state.gameMessages.length === 0) {
        lines.push('None');
    } else {
        for (const msg of state.gameMessages) {
            // Strip color tags
            const cleanText = msg.text.replace(/@\w+@/g, '');
            if (msg.sender) {
                lines.push(`${msg.sender}: ${cleanText}`);
            } else {
                lines.push(cleanText);
            }
        }
    }
    lines.push('');

    // Current menu actions (if menu is visible)
    if (state.menuActions.length > 1) {
        lines.push('--- AVAILABLE ACTIONS ---');
        for (let i = 0; i < Math.min(8, state.menuActions.length); i++) {
            const action = state.menuActions[i];
            // Strip color tags like @whi@, @cya@, etc.
            const cleanOption = action.option.replace(/@\w+@/g, '');
            lines.push(`${i + 1}. ${cleanOption}`);
        }
        if (state.menuActions.length > 8) {
            lines.push(`... and ${state.menuActions.length - 8} more`);
        }
    }

    // Shop state (if open)
    if (state.shop && state.shop.isOpen) {
        lines.push('');
        lines.push('--- SHOP OPEN ---');
        lines.push(`Title: ${state.shop.title}`);
        lines.push('');
        lines.push('Shop Items (Buy):');
        if (state.shop.shopItems.length === 0) {
            lines.push('  None');
        } else {
            for (const item of state.shop.shopItems.slice(0, 10)) {
                lines.push(`  [${item.slot}] ${item.name} x${item.count}`);
            }
            if (state.shop.shopItems.length > 10) {
                lines.push(`  ... and ${state.shop.shopItems.length - 10} more`);
            }
        }
        lines.push('');
        lines.push('Your Items (Sell):');
        if (state.shop.playerItems.length === 0) {
            lines.push('  None');
        } else {
            for (const item of state.shop.playerItems.slice(0, 10)) {
                lines.push(`  [${item.slot}] ${item.name} x${item.count}`);
            }
            if (state.shop.playerItems.length > 10) {
                lines.push(`  ... and ${state.shop.playerItems.length - 10} more`);
            }
        }
    }

    return lines.join('\n');
}

// Extended world state interface for agent (includes dialog/modal/interface)
export interface BotWorldState extends BotState {
    dialog: {
        isOpen: boolean;
        options: Array<{ index: number; text: string }>;
        isWaiting: boolean;
    };
    interface: {
        isOpen: boolean;
        interfaceId: number;
        options: Array<{ index: number; text: string }>;
        debugInfo: string[];
    };
    modalOpen: boolean;
    modalInterface: number;
}

// Format world state for agent - includes dialog/modal info
export function formatWorldStateForAgent(state: BotWorldState, goal: string): string {
    const lines: string[] = [];

    lines.push(`## Current Goal: ${goal}`);
    lines.push(`Tick: ${state.tick}`);

    if (state.player) {
        lines.push('');
        lines.push('### Player');
        lines.push(`Name: ${state.player.name}, Combat Level: ${state.player.combatLevel}`);
        lines.push(`Position: (${state.player.worldX}, ${state.player.worldZ}), Level: ${state.player.level}`);
        lines.push(`Run Energy: ${state.player.runEnergy}%`);
    }

    // Modal state
    if (state.modalOpen) {
        lines.push('');
        lines.push(`### Modal Interface Open: ${state.modalInterface}`);
        if (state.modalInterface === 269) {
            lines.push('(This is the character design screen - use acceptCharacterDesign to continue)');
        }
    }

    // Dialog state
    if (state.dialog.isOpen) {
        lines.push('');
        lines.push('### Dialog Open');
        if (state.dialog.isWaiting) {
            lines.push('(Waiting for server response...)');
        } else if (state.dialog.options.length > 0) {
            lines.push('Options:');
            for (const opt of state.dialog.options) {
                lines.push(`  ${opt.index}. ${opt.text}`);
            }
        } else {
            lines.push('(Click to continue available - use optionIndex: 0)');
        }
    }

    // Interface state (crafting menus like fletching)
    if (state.interface && state.interface.isOpen) {
        lines.push('');
        lines.push(`### Interface Open (id: ${state.interface.interfaceId})`);
        if (state.interface.options.length > 0) {
            lines.push('Options (use "rsbot action interface <N>" to select):');
            for (const opt of state.interface.options) {
                lines.push(`  ${opt.index}. ${opt.text}`);
            }
        } else {
            lines.push('(No selectable options detected)');
        }
    }

    // Shop state
    if (state.shop && state.shop.isOpen) {
        lines.push('');
        lines.push('### Shop Open');
        lines.push(`Title: ${state.shop.title}`);
        lines.push('');
        lines.push('**Shop Items (to buy):**');
        if (state.shop.shopItems.length === 0) {
            lines.push('  (Empty)');
        } else {
            for (const item of state.shop.shopItems) {
                lines.push(`  - [slot ${item.slot}] ${item.name} x${item.count} (id: ${item.id})`);
            }
        }
        lines.push('');
        lines.push('**Your Items (to sell):**');
        if (state.shop.playerItems.length === 0) {
            lines.push('  (Empty)');
        } else {
            for (const item of state.shop.playerItems) {
                lines.push(`  - [slot ${item.slot}] ${item.name} x${item.count} (id: ${item.id})`);
            }
        }
        lines.push('');
        lines.push('Actions: Use shopBuy(slot, amount) or shopSell(slot, amount)');
    }

    // Nearby NPCs
    if (state.nearbyNpcs.length > 0) {
        lines.push('');
        lines.push('### Nearby NPCs');
        for (const npc of state.nearbyNpcs.slice(0, 8)) {
            const lvl = npc.combatLevel > 0 ? ` (Lvl ${npc.combatLevel})` : '';
            const opts = npc.options.length > 0 ? ` [${npc.options.join(', ')}]` : '';
            lines.push(`- ${npc.name}${lvl} - ${npc.distance} tiles away, index: ${npc.index}${opts}`);
        }
    }

    // Nearby Objects (trees, rocks, doors, etc.)
    if (state.nearbyLocs && state.nearbyLocs.length > 0) {
        lines.push('');
        lines.push('### Nearby Objects');
        for (const loc of state.nearbyLocs.slice(0, 10)) {
            const opts = loc.options.length > 0 ? ` [${loc.options.join(', ')}]` : '';
            lines.push(`- ${loc.name} at (${loc.x}, ${loc.z}) - ${loc.distance} tiles, id: ${loc.id}${opts}`);
        }
    }

    // Inventory summary
    if (state.inventory.length > 0) {
        lines.push('');
        lines.push('### Inventory');
        const itemCounts = new Map<string, number>();
        for (const item of state.inventory) {
            itemCounts.set(item.name, (itemCounts.get(item.name) || 0) + item.count);
        }
        for (const [name, qty] of itemCounts) {
            lines.push(`  ${name} x${qty}`);
        }
    }

    // Ground items
    if (state.groundItems.length > 0) {
        lines.push('');
        lines.push('### Ground Items Nearby');
        for (const item of state.groundItems.slice(0, 5)) {
            lines.push(`- ${item.name} x${item.count} at (${item.x}, ${item.z}), ${item.distance} tiles`);
        }
    }

    // Recent game messages
    if (state.gameMessages && state.gameMessages.length > 0) {
        lines.push('');
        lines.push('### Recent Messages');
        for (const msg of state.gameMessages) {
            const cleanText = msg.text.replace(/@\w+@/g, '');
            if (msg.sender) {
                lines.push(`- ${msg.sender}: ${cleanText}`);
            } else {
                lines.push(`- ${cleanText}`);
            }
        }
    }

    return lines.join('\n');
}

// Global instance reference (set when overlay is created)
let globalBotOverlay: BotOverlay | null = null;

export function getBotOverlay(): BotOverlay | null {
    return globalBotOverlay;
}

// Packet log entry interface
export interface PacketLogEntry {
    timestamp: number;
    opcode: number;
    name: string;
    size: number;
    data: string;
}

// HTML Overlay class for displaying state
export class BotOverlay {
    private container: HTMLDivElement;
    private content: HTMLPreElement;
    private collector: BotStateCollector;
    private visible: boolean = true;
    private minimized: boolean = true;
    private client: Client;

    // Packet log panel
    private packetLogContainer: HTMLDivElement;
    private packetLogContent: HTMLPreElement;
    private packetLogVisible: boolean = false;
    private packetLogEnabled: boolean = false;

    // Agent SDK panel
    private agentPanel: AgentPanel;

    constructor(client: Client) {
        this.client = client;
        this.collector = new BotStateCollector(client);
        this.agentPanel = new AgentPanel(client);

        // Create overlay container
        this.container = document.createElement('div');
        this.container.id = 'bot-sdk-overlay';
        this.container.style.cssText = `
            width: 100%;
            max-width: 320px;
            background: rgba(0, 0, 0, 0.85);
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 11px;
            color: #04A800;
            overflow: hidden;
            margin-top: 10px;
        `;

        // Create header with controls
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 10px;
            background: rgba(4, 168, 0, 0.2);
        `;
        header.innerHTML = `
            <span style="font-weight: bold;">BOT SDK</span>
            <div>
                <button id="bot-agent" style="background: none; border: 1px solid #FFD700; color: #FFD700; cursor: pointer; padding: 2px 8px; margin-right: 4px; font-size: 10px; font-weight: bold;">AGENT</button>
                <button id="bot-packets" style="background: none; border: 1px solid #04A800; color: #04A800; cursor: pointer; padding: 2px 8px; font-size: 10px;">PKT</button>
            </div>
        `;

        // Create content area
        this.content = document.createElement('pre');
        this.content.id = 'bot-sdk-content';
        this.content.style.cssText = `
            margin: 0;
            padding: 10px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            display: none;
        `;

        this.container.appendChild(header);
        this.container.appendChild(this.content);

        // Mount to sdk-panel-container if it exists, otherwise fall back to body
        const sdkContainer = document.getElementById('sdk-panel-container');
        if (sdkContainer) {
            sdkContainer.appendChild(this.container);
        } else {
            document.body.appendChild(this.container);
        }

        // Create packet log panel (separate draggable panel)
        this.packetLogContainer = document.createElement('div');
        this.packetLogContainer.id = 'bot-packet-log';
        this.packetLogContainer.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            width: 450px;
            max-height: 500px;
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #FF6600;
            border-radius: 8px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 10px;
            color: #FF6600;
            z-index: 10001;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            display: none;
        `;

        // Packet log header
        const packetHeader = document.createElement('div');
        packetHeader.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 10px;
            background: rgba(255, 102, 0, 0.2);
            border-bottom: 1px solid #FF6600;
            cursor: move;
        `;
        packetHeader.innerHTML = `
            <span style="font-weight: bold;">PACKET LOG</span>
            <div>
                <button id="pkt-toggle" style="background: #333; border: 1px solid #FF6600; color: #FF6600; cursor: pointer; padding: 2px 8px; margin-right: 4px; font-size: 10px;">OFF</button>
                <button id="pkt-clear" style="background: none; border: 1px solid #FF6600; color: #FF6600; cursor: pointer; padding: 2px 8px; margin-right: 4px; font-size: 10px;">Clear</button>
                <button id="pkt-copy" style="background: none; border: 1px solid #FF6600; color: #FF6600; cursor: pointer; padding: 2px 8px; margin-right: 4px; font-size: 10px;">Copy</button>
                <button id="pkt-close" style="background: none; border: 1px solid #FF6600; color: #FF6600; cursor: pointer; padding: 2px 8px;">X</button>
            </div>
        `;

        // Packet log content
        this.packetLogContent = document.createElement('pre');
        this.packetLogContent.id = 'bot-packet-content';
        this.packetLogContent.style.cssText = `
            margin: 0;
            padding: 10px;
            overflow-y: auto;
            max-height: 430px;
            white-space: pre;
            word-wrap: normal;
            overflow-x: auto;
        `;
        this.packetLogContent.textContent = 'Packet logging disabled. Click "OFF" button to enable.\n\nUsage:\n1. Click "OFF" to toggle logging ON\n2. Perform actions in-game\n3. Click "Copy" to copy log to clipboard\n4. Click "Clear" to clear the log';

        this.packetLogContainer.appendChild(packetHeader);
        this.packetLogContainer.appendChild(this.packetLogContent);
        document.body.appendChild(this.packetLogContainer);

        // Setup event handlers
        const packetsBtn = document.getElementById('bot-packets');
        const agentBtn = document.getElementById('bot-agent');
        const pktToggle = document.getElementById('pkt-toggle');
        const pktClear = document.getElementById('pkt-clear');
        const pktCopy = document.getElementById('pkt-copy');
        const pktClose = document.getElementById('pkt-close');

        packetsBtn?.addEventListener('click', () => this.togglePacketLog());
        agentBtn?.addEventListener('click', () => this.toggleAgentMode());
        pktToggle?.addEventListener('click', () => this.togglePacketLogging());
        pktClear?.addEventListener('click', () => this.clearPacketLog());
        pktCopy?.addEventListener('click', () => this.copyPacketLog());
        pktClose?.addEventListener('click', () => this.togglePacketLog());

        // Make packet log panel draggable (main panel is now inline)
        this.makeDraggable(packetHeader, this.packetLogContainer);

        // Set global reference
        globalBotOverlay = this;
    }

    private makeDraggable(handle: HTMLElement, container?: HTMLElement): void {
        const targetContainer = container || this.container;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            // Handle both left and right positioned elements
            if (targetContainer.style.left) {
                startLeft = parseInt(targetContainer.style.left) || 10;
            } else {
                startLeft = window.innerWidth - targetContainer.offsetWidth - (parseInt(targetContainer.style.right) || 10);
            }
            startTop = parseInt(targetContainer.style.top) || 10;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            targetContainer.style.left = `${startLeft + dx}px`;
            targetContainer.style.right = 'auto';
            targetContainer.style.top = `${startTop + dy}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    // Agent SDK panel toggle
    toggleAgentMode(): void {
        this.agentPanel.toggle();
    }

    // Tick the agent panel (called from client's main loop)
    tickAgentPanel(): void {
        this.agentPanel.tick();
    }

    // Check if agent panel is visible
    isAgentPanelVisible(): boolean {
        return this.agentPanel.isVisible();
    }

    // Packet log panel methods
    togglePacketLog(): void {
        this.packetLogVisible = !this.packetLogVisible;
        this.packetLogContainer.style.display = this.packetLogVisible ? 'block' : 'none';
    }

    togglePacketLogging(): void {
        this.packetLogEnabled = !this.packetLogEnabled;
        this.client.setPacketLogging(this.packetLogEnabled);

        const toggleBtn = document.getElementById('pkt-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = this.packetLogEnabled ? 'ON' : 'OFF';
            toggleBtn.style.background = this.packetLogEnabled ? '#FF6600' : '#333';
            toggleBtn.style.color = this.packetLogEnabled ? '#000' : '#FF6600';
        }

        if (this.packetLogEnabled) {
            // Set up callback for real-time updates
            this.client.setPacketLogCallback((entry) => this.addPacketLogEntry(entry));
            this.packetLogContent.textContent = '--- Packet logging started ---\n';
        } else {
            this.client.setPacketLogCallback(null);
            this.packetLogContent.textContent += '\n--- Packet logging stopped ---\n';
        }
    }

    private addPacketLogEntry(entry: PacketLogEntry): void {
        const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false });
        const line = `[${time}] ${entry.name.padEnd(20)} | size: ${entry.size.toString().padStart(3)} | ${entry.data}\n`;
        this.packetLogContent.textContent += line;

        // Auto-scroll to bottom
        this.packetLogContent.scrollTop = this.packetLogContent.scrollHeight;
    }

    clearPacketLog(): void {
        this.client.clearPacketLog();
        this.packetLogContent.textContent = this.packetLogEnabled
            ? '--- Log cleared ---\n'
            : 'Packet logging disabled. Click "OFF" button to enable.\n';
    }

    copyPacketLog(): void {
        const text = this.packetLogContent.textContent || '';
        navigator.clipboard.writeText(text).then(() => {
            // Flash the copy button to indicate success
            const copyBtn = document.getElementById('pkt-copy');
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                copyBtn.style.background = '#FF6600';
                copyBtn.style.color = '#000';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.style.background = 'none';
                    copyBtn.style.color = '#FF6600';
                }, 1000);
            }
        }).catch(err => {
            console.error('Failed to copy packet log:', err);
        });
    }

    toggleMinimize(): void {
        this.minimized = !this.minimized;
        this.content.style.display = this.minimized ? 'none' : 'block';
        this.container.style.maxHeight = this.minimized ? 'auto' : '600px';
    }

    toggle(): void {
        this.visible = !this.visible;
        this.container.style.display = this.visible ? 'block' : 'none';
    }

    show(): void {
        this.visible = true;
        this.container.style.display = 'block';
    }

    hide(): void {
        this.visible = false;
        this.container.style.display = 'none';
    }

    isVisible(): boolean {
        return this.visible;
    }

    update(): void {
        if (!this.visible || this.minimized) return;

        const state = this.collector.collectState();
        this.content.textContent = formatBotState(state);
    }

    getState(): BotState {
        return this.collector.collectState();
    }

    destroy(): void {
        // Clean up packet log callback
        if (this.packetLogEnabled) {
            this.client.setPacketLogCallback(null);
        }
        this.container.remove();
        this.packetLogContainer.remove();
        globalBotOverlay = null;
    }
}

