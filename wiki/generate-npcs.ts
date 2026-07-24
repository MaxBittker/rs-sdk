#!/usr/bin/env bun
/**
 * NPC Wiki Generator
 * Parses server content files and generates markdown wiki pages for all NPCs.
 * Run: bun wiki/generate-npcs.ts
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, basename, dirname, relative } from 'path';

const CONTENT_DIR = join(import.meta.dir, '..', 'server', 'content');
const WIKI_DIR = join(import.meta.dir);
const NPC_DIR = join(WIKI_DIR, 'npcs');

// ─── Types ───────────────────────────────────────────────────────────────────

interface NpcConfig {
    configName: string;
    name: string;
    desc: string;
    vislevel: string; // number or "hide"
    hitpoints: number;
    attack: number;
    strength: number;
    defence: number;
    category: string;
    huntmode: string;
    wanderrange: number;
    maxrange: number;
    respawnrate: number;
    defaultmode: string;
    givechase: string;
    moverestrict: string;
    ops: string[]; // op1-op5
    params: Map<string, string>;
    sourcePath: string; // file this config came from
    hasPatrol: boolean;
}

interface SpawnLocation {
    mapX: number;
    mapZ: number;
    globalX: number;
    globalZ: number;
    level: number;
    mapSquare: string; // e.g. "m50_50"
}

interface DropEntry {
    itemConfigName: string;
    quantity: string; // "1" or "2-12" for ranges
    numerator: number;
    denominator: number;
    membersOnly: boolean;
}

interface AlwaysDrop {
    itemConfigName: string;
    quantity: number;
}

interface DropTable {
    triggerNames: string[]; // config names or _category names that use this table
    alwaysDrop: boolean; // whether it uses npc_param(death_drop)
    entries: DropEntry[];
    alwaysDropItems: AlwaysDrop[]; // additional always-drop items (like raw_chicken for chicken)
    clueTier: string | null; // "easy", "medium", "hard"
}

interface NpcPage {
    displayName: string;
    variants: NpcConfig[];
    spawns: SpawnLocation[];
    drops: DropEntry[];
    alwaysDropItem: string | null; // from death_drop param
    alwaysDropExtra: AlwaysDrop[]; // additional always-drops (cow hide, raw chicken, etc)
    clueTier: string | null;
}

// ─── Area Name Mappings ──────────────────────────────────────────────────────

const SOURCE_PATH_AREAS: Record<string, string> = {
    'area_lumbridge': 'Lumbridge',
    'area_alkharid': 'Al Kharid',
    'area_ardougne_east': 'East Ardougne',
    'area_ardougne_west': 'West Ardougne',
    'area_barbarian_village': 'Barbarian Village',
    'area_barbarian_outpost': 'Barbarian Outpost',
    'area_brimhaven': 'Brimhaven',
    'area_camelot': 'Camelot',
    'area_canifis': 'Canifis',
    'area_catherby': 'Catherby',
    'area_combat_training': 'Combat Training Camp',
    'area_desert': 'Desert',
    'area_draynor': 'Draynor Village',
    'area_edgeville': 'Edgeville',
    'area_entrana': 'Entrana',
    'area_falador': 'Falador',
    'area_fishing_platform': 'Fishing Platform',
    'area_gnome': 'Tree Gnome Stronghold',
    'area_karamja': 'Karamja',
    'area_lostcity': 'Zanaris',
    'area_mage_arena': 'Mage Arena',
    'area_port_sarim': 'Port Sarim',
    'area_rimmington': 'Rimmington',
    'area_seers': "Seers' Village",
    'area_shilo': 'Shilo Village',
    'area_taverly': 'Taverley',
    'area_varrock': 'Varrock',
    'area_white_wolf_mountain': 'White Wolf Mountain',
    'area_wilderness': 'Wilderness',
    'area_wizard_tower': 'Wizard Tower',
    'area_yanille': 'Yanille',
    'areas_heroes_guild': "Heroes' Guild",
    'monastery': 'Monastery',
};

const MAP_SQUARE_AREAS: Record<string, string> = {
    'm50_50': 'Lumbridge',
    'm49_50': 'Lumbridge (west)',
    'm51_50': 'Lumbridge (east)',
    'm50_49': 'Al Kharid',
    'm51_49': 'Al Kharid',
    'm49_49': 'Al Kharid (south)',
    'm48_50': 'Edgeville area',
    'm48_51': 'Edgeville area',
    'm49_51': 'Barbarian Village',
    'm49_52': 'Barbarian Village',
    'm50_51': 'Varrock (south)',
    'm50_52': 'Varrock',
    'm51_51': 'Varrock (east)',
    'm51_52': 'Varrock (east)',
    'm50_53': 'Varrock (north)',
    'm45_50': 'Falador (south)',
    'm46_50': 'Falador',
    'm46_51': 'Falador (north)',
    'm47_50': 'Falador (east)',
    'm45_51': 'Falador (west)',
    'm44_50': 'Rimmington',
    'm44_49': 'Karamja',
    'm45_49': 'Karamja',
    'm43_49': 'Karamja (west)',
    'm44_48': 'Brimhaven',
    'm47_51': 'Taverley',
    'm47_52': 'Taverley (north)',
    'm41_50': "Seers' Village area",
    'm42_50': 'Catherby',
    'm40_50': 'Ardougne',
    'm40_49': 'Ardougne (south)',
    'm39_50': 'Ardougne (west)',
    'm40_48': 'Ardougne area',
    'm39_49': 'West Ardougne',
    'm41_49': 'Yanille area',
    'm41_48': 'Yanille',
    'm48_52': 'Wilderness (low)',
    'm48_53': 'Wilderness',
    'm48_54': 'Wilderness',
    'm49_53': 'Wilderness',
    'm49_54': 'Wilderness',
    'm50_54': 'Wilderness',
    'm50_55': 'Wilderness (deep)',
    'm51_53': 'Wilderness',
    'm51_54': 'Wilderness',
    'm46_52': 'Camelot area',
    'm43_50': 'Gnome Stronghold',
    'm43_51': 'Gnome Stronghold',
    'm42_49': 'Fight Arena area',
    'm52_50': 'Canifis area',
    'm53_50': 'Canifis',
    'm53_51': 'Morytania',
    'm44_51': 'Entrana',
    'm45_48': 'Shilo Village area',
    'm46_48': 'Shilo Village area',
    'm43_48': 'Feldip Hills',
    'm48_49': 'Desert',
    'm49_48': 'Desert',
};

// ─── Parser: INI Config ──────────────────────────────────────────────────────

function parseIniConfigs(content: string, sourcePath: string): Map<string, NpcConfig> {
    const configs = new Map<string, NpcConfig>();
    let current: NpcConfig | null = null;

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        // skip comments
        if (line.startsWith('//') || line.startsWith('/ ')) continue;

        const sectionMatch = line.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            if (current) configs.set(current.configName, current);
            current = makeEmptyConfig(sectionMatch[1], sourcePath);
            continue;
        }

        if (!current || !line || line === '') {
            continue;
        }

        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();

        switch (key) {
            case 'name': current.name = value; break;
            case 'desc': current.desc = value; break;
            case 'vislevel': current.vislevel = value; break;
            case 'hitpoints': current.hitpoints = parseInt(value) || 0; break;
            case 'attack': current.attack = parseInt(value) || 0; break;
            case 'strength': current.strength = parseInt(value) || 0; break;
            case 'defence': current.defence = parseInt(value) || 0; break;
            case 'category': current.category = value; break;
            case 'huntmode': current.huntmode = value; break;
            case 'wanderrange': current.wanderrange = parseInt(value) || 0; break;
            case 'maxrange': current.maxrange = parseInt(value) || 0; break;
            case 'respawnrate': current.respawnrate = parseInt(value) || 0; break;
            case 'defaultmode': current.defaultmode = value; break;
            case 'givechase': current.givechase = value; break;
            case 'moverestrict': current.moverestrict = value; break;
            case 'op1': current.ops[0] = value; break;
            case 'op2': current.ops[1] = value; break;
            case 'op3': current.ops[2] = value; break;
            case 'op4': current.ops[3] = value; break;
            case 'op5': current.ops[4] = value; break;
            case 'param': {
                const commaIdx = value.indexOf(',');
                if (commaIdx !== -1) {
                    current.params.set(value.slice(0, commaIdx), value.slice(commaIdx + 1));
                }
                break;
            }
            default: {
                if (key.startsWith('patrol')) {
                    current.hasPatrol = true;
                }
                break;
            }
        }
    }
    if (current) configs.set(current.configName, current);
    return configs;
}

function makeEmptyConfig(configName: string, sourcePath: string): NpcConfig {
    return {
        configName,
        name: '',
        desc: '',
        vislevel: '',
        hitpoints: 0,
        attack: 0,
        strength: 0,
        defence: 0,
        category: '',
        huntmode: '',
        wanderrange: 0,
        maxrange: 0,
        respawnrate: 0,
        defaultmode: '',
        givechase: '',
        moverestrict: '',
        ops: ['', '', '', '', ''],
        params: new Map(),
        sourcePath,
        hasPatrol: false,
    };
}

// ─── Parser: Obj Configs (for display names) ────────────────────────────────

function parseObjConfigs(content: string): Map<string, string> {
    const names = new Map<string, string>();
    let currentName = '';
    let currentDisplayName = '';

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('//') || line.startsWith('/ ')) continue;

        const sectionMatch = line.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            if (currentName && currentDisplayName) {
                names.set(currentName, currentDisplayName);
            }
            currentName = sectionMatch[1];
            currentDisplayName = '';
            continue;
        }

        if (line.startsWith('name=')) {
            currentDisplayName = line.slice(5);
        }
    }
    if (currentName && currentDisplayName) {
        names.set(currentName, currentDisplayName);
    }
    return names;
}

// ─── Parser: Pack File ───────────────────────────────────────────────────────

function parsePackFile(content: string): { idToName: Map<number, string>; nameToId: Map<string, number> } {
    const idToName = new Map<number, string>();
    const nameToId = new Map<string, number>();
    for (const line of content.split('\n')) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const id = parseInt(line.slice(0, eqIdx));
        const name = line.slice(eqIdx + 1).trim();
        if (!isNaN(id) && name) {
            idToName.set(id, name);
            nameToId.set(name, id);
        }
    }
    return { idToName, nameToId };
}

// ─── Parser: Map Spawns ──────────────────────────────────────────────────────

function parseMapSpawns(
    mapsDir: string,
    npcIdToName: Map<number, string>
): Map<string, SpawnLocation[]> {
    const spawns = new Map<string, SpawnLocation[]>();
    const mapFiles = readdirSync(mapsDir).filter(f => f.endsWith('.jm2'));

    for (const file of mapFiles) {
        const match = file.match(/^m(\d+)_(\d+)\.jm2$/);
        if (!match) continue;
        const mapX = parseInt(match[1]);
        const mapZ = parseInt(match[2]);
        const mapSquare = `m${mapX}_${mapZ}`;

        const content = readFileSync(join(mapsDir, file), 'utf-8');
        const npcSectionStart = content.indexOf('==== NPC ====');
        if (npcSectionStart === -1) continue;

        const afterNpc = content.slice(npcSectionStart + '==== NPC ===='.length);
        // NPC section goes until the next ==== or end of file
        const nextSection = afterNpc.indexOf('====');
        const npcBlock = nextSection === -1 ? afterNpc : afterNpc.slice(0, nextSection);

        for (const line of npcBlock.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            // Format: level localX localZ: npcID
            const m = trimmed.match(/^(\d+)\s+(\d+)\s+(\d+):\s*(\d+)$/);
            if (!m) continue;
            const level = parseInt(m[1]);
            const localX = parseInt(m[2]);
            const localZ = parseInt(m[3]);
            const npcId = parseInt(m[4]);

            const configName = npcIdToName.get(npcId);
            if (!configName) continue;

            const globalX = mapX * 64 + localX;
            const globalZ = mapZ * 64 + localZ;

            if (!spawns.has(configName)) spawns.set(configName, []);
            spawns.get(configName)!.push({ mapX, mapZ, globalX, globalZ, level, mapSquare });
        }
    }

    return spawns;
}

// ─── Parser: Drop Tables ─────────────────────────────────────────────────────

interface ParsedDropFile {
    triggers: Map<string, string>; // configName/category -> label name (or "inline")
    labels: Map<string, DropTableData>; // label name -> parsed data
}

interface DropTableData {
    hasDeathDrop: boolean;
    entries: DropEntry[];
    alwaysItems: AlwaysDrop[];
    clueTier: string | null;
}

function parseDropTables(dropsDir: string): Map<string, DropTable> {
    const files = readdirSync(dropsDir).filter(f => f.endsWith('.rs2') && f !== 'shared_droptables.rs2' && f !== 'drop_table.rs2');

    // Map from trigger name (config name or _category) to DropTable
    const result = new Map<string, DropTable>();

    for (const file of files) {
        const content = readFileSync(join(dropsDir, file), 'utf-8');
        const parsed = parseDropFile(content);

        for (const [triggerName, target] of parsed.triggers) {
            const data = parsed.labels.get(target);
            if (!data) continue;

            if (!result.has(target)) {
                result.set(target, {
                    triggerNames: [],
                    alwaysDrop: data.hasDeathDrop,
                    entries: data.entries,
                    alwaysDropItems: data.alwaysItems,
                    clueTier: data.clueTier,
                });
            }
            result.get(target)!.triggerNames.push(triggerName);
        }
    }

    return result;
}

function parseDropFile(content: string): ParsedDropFile {
    const triggers = new Map<string, string>();
    const labels = new Map<string, DropTableData>();

    const lines = content.split('\n');
    let currentLabel: string | null = null;
    let currentData: DropTableData | null = null;
    let denominator = 128; // default
    let lastThreshold = 0;

    function finishLabel() {
        if (currentLabel && currentData) {
            labels.set(currentLabel, currentData);
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('//')) continue;

        // Trigger line: [ai_queue3,name] @label; or [ai_queue3,name] without @
        const triggerMatch = line.match(/^\[ai_queue3,([^\]]+)\]\s*(?:@(\w+)\s*;)?/);
        if (triggerMatch) {
            const triggerName = triggerMatch[1];
            const labelRef = triggerMatch[2];

            if (labelRef) {
                triggers.set(triggerName, labelRef);
            } else {
                // Inline drop table - use trigger name as label
                finishLabel();
                currentLabel = `_inline_${triggerName}`;
                currentData = { hasDeathDrop: false, entries: [], alwaysItems: [], clueTier: null };
                denominator = 128;
                lastThreshold = 0;
                triggers.set(triggerName, currentLabel);
            }
            continue;
        }

        // Label line: [label,name]
        const labelMatch = line.match(/^\[label,(\w+)\]/);
        if (labelMatch) {
            finishLabel();
            currentLabel = labelMatch[1];
            currentData = { hasDeathDrop: false, entries: [], alwaysItems: [], clueTier: null };
            denominator = 128;
            lastThreshold = 0;
            continue;
        }

        if (!currentData) continue;

        // Death drop line
        if (line.includes('npc_param(death_drop)')) {
            currentData.hasDeathDrop = true;
            continue;
        }

        // Clue scroll detection
        if (line.includes('trail_easycluedrop')) {
            currentData.clueTier = 'easy';
        } else if (line.includes('trail_mediumcluedrop')) {
            currentData.clueTier = currentData.clueTier === 'easy' ? 'easy' : 'medium';
        } else if (line.includes('trail_hardcluedrop')) {
            currentData.clueTier = currentData.clueTier ? currentData.clueTier : 'hard';
        }

        // Random declaration: def_int $random = random(N);
        const randomMatch = line.match(/random\((\d+)\)/);
        if (randomMatch && line.includes('def_int')) {
            denominator = parseInt(randomMatch[1]);
            lastThreshold = 0;
            continue;
        }

        // Always-drop items (outside the if/else chain, plain obj_add)
        // These come after the death_drop line but before the random() declaration
        if (line.includes('obj_add(npc_coord,') && !line.includes('npc_param(death_drop)') && !currentData.entries.length) {
            const alwaysMatch = line.match(/obj_add\(npc_coord,\s*([^,]+),\s*(\d+)/);
            if (alwaysMatch && !line.includes('$random') && !line.includes('$drop') && !line.includes('$rng')) {
                // Check if we're inside an if block - simple heuristic: no if/else context
                const prevLines = lines.slice(Math.max(0, i - 3), i).join(' ');
                if (!prevLines.includes('if (') && !prevLines.includes('else if') && !prevLines.includes('random(')) {
                    currentData.alwaysItems.push({
                        itemConfigName: alwaysMatch[1].trim(),
                        quantity: parseInt(alwaysMatch[2]),
                    });
                    continue;
                }
            }
        }

        // If/else if threshold: if ($random < N) or else if ($random < N) or ($dropint < N) or ($rng < N)
        const threshMatch = line.match(/(?:if|else\s+if)\s*\(\s*\$\w+\s*<\s*(\d+)\s*\)/);
        if (threshMatch) {
            const newThreshold = parseInt(threshMatch[1]);
            const numerator = newThreshold - lastThreshold;

            // Collect all lines belonging to this branch until the next } else if or closing }
            const blockLines: string[] = [line];
            for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
                const jline = lines[j].trim();
                // Stop at next else-if branch or end of chain
                if (jline.startsWith('} else if') || jline === '}') break;
                blockLines.push(jline);
            }
            const block = blockLines.join('\n');

            // Check for members-only variant
            const membersCheck = block.includes('map_members = ^true');
            const hasFallback = block.includes('} else {');

            // Parse obj_add calls with awareness of members/F2P branches
            // obj_add patterns: obj_add(npc_coord, item, qty, duration) or obj_add(npc_coord, ~func, duration)
            const objAddPattern = /obj_add\(npc_coord,\s*([^,)]+),\s*(.+?),\s*\^lootdrop_duration\)/g;
            const sharedCallPattern = /obj_add\(npc_coord,\s*~(\w+),\s*\^lootdrop_duration\)/g;

            if (membersCheck && hasFallback) {
                // Split block into members and F2P sections
                const membersIdx = block.indexOf('map_members = ^true');
                const elseIdx = block.indexOf('} else {', membersIdx);
                const membersBlock = block.slice(membersIdx, elseIdx || block.length);
                const f2pBlock = elseIdx !== -1 ? block.slice(elseIdx) : '';

                // Add members items
                for (const m of membersBlock.matchAll(objAddPattern)) {
                    const itemName = m[1].trim();
                    const rawQty = m[2].trim();
                    if (itemName.startsWith('~')) continue;
                    currentData.entries.push({
                        itemConfigName: itemName,
                        quantity: parseQuantity(rawQty),
                        numerator, denominator,
                        membersOnly: true,
                    });
                }
                for (const m of membersBlock.matchAll(sharedCallPattern)) {
                    currentData.entries.push({
                        itemConfigName: `~${m[1]}`, quantity: '1',
                        numerator, denominator, membersOnly: true,
                    });
                }

                // Add F2P fallback items
                for (const m of f2pBlock.matchAll(objAddPattern)) {
                    const itemName = m[1].trim();
                    const rawQty = m[2].trim();
                    if (itemName.startsWith('~')) continue;
                    currentData.entries.push({
                        itemConfigName: itemName,
                        quantity: parseQuantity(rawQty),
                        numerator, denominator,
                        membersOnly: false,
                    });
                }
            } else {
                // Regular block (no members split, or members-only with no fallback)
                const isMembers = membersCheck && !hasFallback;

                for (const m of block.matchAll(objAddPattern)) {
                    const itemName = m[1].trim();
                    const rawQty = m[2].trim();
                    if (itemName.startsWith('~')) continue;
                    currentData.entries.push({
                        itemConfigName: itemName,
                        quantity: parseQuantity(rawQty),
                        numerator, denominator,
                        membersOnly: isMembers,
                    });
                }
                for (const m of block.matchAll(sharedCallPattern)) {
                    currentData.entries.push({
                        itemConfigName: `~${m[1]}`, quantity: '1',
                        numerator, denominator, membersOnly: isMembers,
                    });
                }
            }

            lastThreshold = newThreshold;
            continue;
        }
    }

    finishLabel();
    return { triggers, labels };
}

// ─── Parse Quantity Expression ────────────────────────────────────────────────

function parseQuantity(raw: string): string {
    const rangeMatch = raw.match(/~random_range\((\d+)\s*,\s*(\d+)\)/);
    if (rangeMatch) return `${rangeMatch[1]}-${rangeMatch[2]}`;
    // Plain integer
    const num = parseInt(raw);
    if (!isNaN(num)) return String(num);
    return raw;
}

// ─── Prettify Config Names ───────────────────────────────────────────────────

function prettifyConfigName(name: string): string {
    return name
        .replace(/_/g, ' ')
        .replace(/\b(\d+)\b/g, '$1') // keep numbers
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/\bcert\b/i, 'Certificate')
        .trim();
}

function getObjDisplayName(configName: string, objNames: Map<string, string>): string {
    // Handle shared table references
    if (configName === '~randomherb') return 'Herbs (varies)';
    if (configName === '~randomjewel') return 'Gems (varies)';
    if (configName === '~ultrarare_getitem') return 'Rare drop table';
    if (configName === '~megararetable') return 'Mega-rare drop table';
    if (configName === '~randomjunk') return 'Junk items (varies)';
    if (configName.startsWith('~')) return prettifyConfigName(configName.slice(1));

    return objNames.get(configName) || prettifyConfigName(configName);
}

// ─── Derive Area Name ────────────────────────────────────────────────────────

function getAreaFromSourcePath(sourcePath: string): string | null {
    // Extract area directory name from source path
    const match = sourcePath.match(/scripts\/(?:areas\/)?(\w+)\//);
    if (!match) return null;
    const dirName = match[1];
    return SOURCE_PATH_AREAS[dirName] || null;
}

function getAreaFromMapSquare(mapSquare: string): string {
    return MAP_SQUARE_AREAS[mapSquare] || mapSquare;
}

// ─── Movement Description ────────────────────────────────────────────────────

function getMovementDesc(config: NpcConfig): string {
    if (config.defaultmode === 'patrol' || config.hasPatrol) return 'Patrol';
    if (config.moverestrict === 'nomove') return 'Stationary';
    if (config.wanderrange > 0) return `Wander (range ${config.wanderrange})`;
    if (config.moverestrict === 'indoors') return 'Stationary (indoors)';
    return 'Wander';
}

// ─── Attack Style from Param ─────────────────────────────────────────────────

function getAttackStyle(params: Map<string, string>): string {
    const dt = params.get('damagetype') || '';
    if (dt.includes('stab')) return 'Stab';
    if (dt.includes('slash')) return 'Slash';
    if (dt.includes('crush')) return 'Crush';
    if (dt.includes('magic')) return 'Magic';
    if (dt.includes('range')) return 'Ranged';
    return 'Crush'; // default
}

// ─── Check if NPC is Combat ──────────────────────────────────────────────────

function isCombatNpc(config: NpcConfig): boolean {
    return config.vislevel !== '' && config.vislevel !== 'hide' && config.hitpoints > 0;
}

// ─── Check if NPC has Combat Stats ───────────────────────────────────────────

function hasCombatStats(config: NpcConfig): boolean {
    return config.params.has('attackbonus') || config.params.has('strengthbonus') ||
        config.params.has('stabdefence') || config.params.has('slashdefence') ||
        config.params.has('crushdefence') || config.params.has('magicdefence') ||
        config.params.has('rangedefence');
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

function main() {
    console.log('NPC Wiki Generator');
    console.log('==================\n');

    // ─── Step 1: Parse all data sources ──────────────────────────────────

    console.log('Step 1: Parsing data sources...');

    // 1a: NPC pack (ID map)
    const npcPackContent = readFileSync(join(CONTENT_DIR, 'pack', 'npc.pack'), 'utf-8');
    const npcPack = parsePackFile(npcPackContent);
    console.log(`  npc.pack: ${npcPack.idToName.size} entries`);

    // 1b: Obj pack (ID map)
    const objPackContent = readFileSync(join(CONTENT_DIR, 'pack', 'obj.pack'), 'utf-8');
    const objPack = parsePackFile(objPackContent);
    console.log(`  obj.pack: ${objPack.idToName.size} entries`);

    // 1c: NPC configs from all.npc
    const allNpcContent = readFileSync(join(CONTENT_DIR, 'scripts', '_unpack', '225', 'all.npc'), 'utf-8');
    const allNpcConfigs = parseIniConfigs(allNpcContent, 'scripts/_unpack/225/all.npc');
    console.log(`  all.npc: ${allNpcConfigs.size} configs`);

    // 1d: NPC configs from script area/quest config files
    const npcConfigFiles = findFilesRecursive(join(CONTENT_DIR, 'scripts'), '.npc');
    const extraNpcConfigs = new Map<string, NpcConfig>();
    for (const file of npcConfigFiles) {
        if (file.includes('_unpack')) continue; // already parsed
        const content = readFileSync(file, 'utf-8');
        const relPath = relative(CONTENT_DIR, file);
        const configs = parseIniConfigs(content, relPath);
        for (const [name, config] of configs) {
            extraNpcConfigs.set(name, config);
        }
    }
    console.log(`  Area/quest NPC configs: ${extraNpcConfigs.size} configs from ${npcConfigFiles.length - 1} files`);

    // 1e: Merge NPC configs (extra configs override all.npc for matching names)
    const allConfigs = new Map<string, NpcConfig>();
    for (const [name, config] of allNpcConfigs) {
        allConfigs.set(name, config);
    }
    for (const [name, config] of extraNpcConfigs) {
        const existing = allConfigs.get(name);
        if (existing) {
            // Merge: extra config overrides specific fields if set, keep the rest
            if (config.name) existing.name = config.name;
            if (config.desc) existing.desc = config.desc;
            if (config.vislevel) existing.vislevel = config.vislevel;
            if (config.hitpoints) existing.hitpoints = config.hitpoints;
            if (config.attack) existing.attack = config.attack;
            if (config.strength) existing.strength = config.strength;
            if (config.defence) existing.defence = config.defence;
            if (config.category) existing.category = config.category;
            if (config.huntmode) existing.huntmode = config.huntmode;
            if (config.wanderrange) existing.wanderrange = config.wanderrange;
            if (config.maxrange) existing.maxrange = config.maxrange;
            if (config.respawnrate) existing.respawnrate = config.respawnrate;
            if (config.defaultmode) existing.defaultmode = config.defaultmode;
            if (config.givechase) existing.givechase = config.givechase;
            if (config.moverestrict) existing.moverestrict = config.moverestrict;
            if (config.hasPatrol) existing.hasPatrol = config.hasPatrol;
            for (const [k, v] of config.params) existing.params.set(k, v);
            for (let j = 0; j < 5; j++) {
                if (config.ops[j]) existing.ops[j] = config.ops[j];
            }
            // Keep the more specific source path
            if (config.sourcePath !== 'scripts/_unpack/225/all.npc') {
                existing.sourcePath = config.sourcePath;
            }
        } else {
            allConfigs.set(name, config);
        }
    }
    console.log(`  Total merged NPC configs: ${allConfigs.size}`);

    // 1f: Obj display names
    const objNames = new Map<string, string>();
    // Parse all.obj using bash since Read tool can't handle .obj extension
    const allObjContent = readFileSync(join(CONTENT_DIR, 'scripts', '_unpack', '225', 'all.obj'), 'utf-8');
    const allObjNames = parseObjConfigs(allObjContent);
    for (const [k, v] of allObjNames) objNames.set(k, v);

    // Parse extra .obj config files
    const objConfigFiles = findFilesRecursive(join(CONTENT_DIR, 'scripts'), '.obj');
    for (const file of objConfigFiles) {
        if (file.includes('_unpack')) continue;
        const content = readFileSync(file, 'utf-8');
        const names = parseObjConfigs(content);
        for (const [k, v] of names) {
            if (!objNames.has(k)) objNames.set(k, v);
        }
    }
    console.log(`  Obj display names: ${objNames.size}`);

    // 1g: NPC spawns from map files
    const spawns = parseMapSpawns(join(CONTENT_DIR, 'maps'), npcPack.idToName);
    console.log(`  Map spawns: ${spawns.size} NPCs with spawn data`);

    // 1h: Drop tables
    const dropTables = parseDropTables(join(CONTENT_DIR, 'scripts', 'drop tables', 'scripts'));
    console.log(`  Drop tables: ${dropTables.size} tables parsed`);

    // Build category map: category name -> list of config names
    const categoryMap = new Map<string, string[]>();
    for (const [configName, config] of allConfigs) {
        if (config.category) {
            if (!categoryMap.has(config.category)) categoryMap.set(config.category, []);
            categoryMap.get(config.category)!.push(configName);
        }
    }

    // ─── Step 2: Filter ──────────────────────────────────────────────────

    console.log('\nStep 2: Filtering NPCs...');

    // Get tutorial and antimacro config names
    const tutorialFile = join(CONTENT_DIR, 'scripts', 'tutorial', 'configs', 'tutorial.npc');
    const tutorialConfigs = new Set<string>();
    if (existsSync(tutorialFile)) {
        const content = readFileSync(tutorialFile, 'utf-8');
        const configs = parseIniConfigs(content, 'tutorial');
        for (const name of configs.keys()) tutorialConfigs.add(name);
    }

    const antimacroFile = join(CONTENT_DIR, 'scripts', 'macro events', 'configs', 'antimacro.npc');
    const antimacroConfigs = new Set<string>();
    if (existsSync(antimacroFile)) {
        const content = readFileSync(antimacroFile, 'utf-8');
        const configs = parseIniConfigs(content, 'antimacro');
        for (const name of configs.keys()) antimacroConfigs.add(name);
    }

    const filteredConfigs = new Map<string, NpcConfig>();
    let filtered = 0;
    for (const [name, config] of allConfigs) {
        // Skip tutorial NPCs
        if (tutorialConfigs.has(name)) { filtered++; continue; }
        // Skip antimacro NPCs
        if (antimacroConfigs.has(name)) { filtered++; continue; }
        // Skip NPCs with macro event categories
        if (config.category.startsWith('macro_event')) { filtered++; continue; }
        // Skip NPCs with no name
        if (!config.name) { filtered++; continue; }

        filteredConfigs.set(name, config);
    }
    console.log(`  Filtered out ${filtered} NPCs (tutorial, antimacro, unnamed)`);
    console.log(`  Remaining: ${filteredConfigs.size} configs`);

    // ─── Step 3: Deduplicate by display name ─────────────────────────────

    console.log('\nStep 3: Deduplicating by display name...');

    const pagesByName = new Map<string, NpcPage>();
    for (const [configName, config] of filteredConfigs) {
        const displayName = config.name;

        if (!pagesByName.has(displayName)) {
            pagesByName.set(displayName, {
                displayName,
                variants: [],
                spawns: [],
                drops: [],
                alwaysDropItem: null,
                alwaysDropExtra: [],
                clueTier: null,
            });
        }

        const page = pagesByName.get(displayName)!;
        page.variants.push(config);
    }
    console.log(`  Deduplicated to ${pagesByName.size} unique NPC pages`);

    // ─── Step 4: Resolve drops and spawns ────────────────────────────────

    console.log('\nStep 4: Resolving drops and spawns...');

    for (const [displayName, page] of pagesByName) {
        // Collect spawns from all variants
        const seenMapSquares = new Set<string>();
        for (const variant of page.variants) {
            const variantSpawns = spawns.get(variant.configName) || [];
            for (const spawn of variantSpawns) {
                if (!seenMapSquares.has(`${spawn.mapSquare}_${spawn.level}`)) {
                    seenMapSquares.add(`${spawn.mapSquare}_${spawn.level}`);
                    page.spawns.push(spawn);
                }
            }
        }

        // Resolve death_drop (always drop item)
        // Count all variants - those without explicit death_drop default to "bones" for combat NPCs
        const deathDropCounts = new Map<string, number>();
        for (const variant of page.variants) {
            const dd = variant.params.get('death_drop');
            if (dd === 'null') {
                // Explicitly drops nothing
            } else if (dd) {
                deathDropCounts.set(dd, (deathDropCounts.get(dd) || 0) + 1);
            } else if (isCombatNpc(variant)) {
                // No explicit death_drop → default is "bones"
                deathDropCounts.set('bones', (deathDropCounts.get('bones') || 0) + 1);
            }
        }
        if (deathDropCounts.size > 0) {
            // Pick the most common death_drop
            let bestDrop = '';
            let bestCount = 0;
            for (const [drop, count] of deathDropCounts) {
                if (count > bestCount) { bestDrop = drop; bestCount = count; }
            }
            page.alwaysDropItem = bestDrop;
        }

        // Find drop table
        for (const variant of page.variants) {
            // Check direct config name trigger
            for (const [, table] of dropTables) {
                if (table.triggerNames.includes(variant.configName)) {
                    if (page.drops.length === 0) {
                        page.drops = [...table.entries];
                        page.alwaysDropExtra = [...table.alwaysDropItems];
                        if (table.clueTier) page.clueTier = table.clueTier;
                    }
                    break;
                }
            }
            if (page.drops.length > 0) break;

            // Check _category trigger
            if (variant.category) {
                for (const [, table] of dropTables) {
                    if (table.triggerNames.includes(`_${variant.category}`)) {
                        if (page.drops.length === 0) {
                            page.drops = [...table.entries];
                            page.alwaysDropExtra = [...table.alwaysDropItems];
                            if (table.clueTier) page.clueTier = table.clueTier;
                        }
                        break;
                    }
                }
                if (page.drops.length > 0) break;
            }
        }
    }

    // ─── Step 5: Generate markdown ───────────────────────────────────────

    console.log('\nStep 5: Generating markdown...');

    mkdirSync(NPC_DIR, { recursive: true });

    let generated = 0;
    const pageIndex: { name: string; file: string }[] = [];

    for (const [displayName, page] of pagesByName) {
        const slug = displayName.toLowerCase()
            .replace(/['']/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        const fileName = `${slug}.md`;
        const filePath = join(NPC_DIR, fileName);

        const md = generateNpcMarkdown(page, objNames);
        writeFileSync(filePath, md);

        pageIndex.push({ name: displayName, file: fileName });
        generated++;
    }

    console.log(`  Generated ${generated} NPC pages`);

    // ─── Step 6: Update README ───────────────────────────────────────────

    console.log('\nStep 6: Updating README...');
    updateReadme(pageIndex);

    console.log('\nDone!');
}

// ─── Generate Markdown for One NPC Page ──────────────────────────────────────

function generateNpcMarkdown(page: NpcPage, objNames: Map<string, string>): string {
    const primary = page.variants[0];
    const combat = isCombatNpc(primary);
    const lines: string[] = [];

    // Title
    lines.push(`# ${page.displayName}`);
    lines.push('');

    // Info table
    lines.push('| Detail | |');
    lines.push('|---|---|');

    // Combat level - show range if variants differ
    const vislevels = [...new Set(page.variants.map(v => v.vislevel).filter(v => v && v !== 'hide'))];
    if (vislevels.length > 1) {
        const nums = vislevels.map(v => parseInt(v)).filter(n => !isNaN(n)).sort((a, b) => a - b);
        if (nums.length > 1) {
            lines.push(`| **Combat Level** | ${nums[0]}-${nums[nums.length - 1]} |`);
        } else {
            lines.push(`| **Combat Level** | ${vislevels[0]} |`);
        }
    } else if (vislevels.length === 1) {
        lines.push(`| **Combat Level** | ${vislevels[0]} |`);
    } else {
        lines.push('| **Combat Level** | None |');
    }

    // Hitpoints
    const hps = [...new Set(page.variants.map(v => v.hitpoints).filter(h => h > 0))].sort((a, b) => a - b);
    if (hps.length > 1) {
        lines.push(`| **Hitpoints** | ${hps[0]}-${hps[hps.length - 1]} |`);
    } else if (hps.length === 1) {
        lines.push(`| **Hitpoints** | ${hps[0]} |`);
    } else {
        lines.push('| **Hitpoints** | N/A |');
    }

    // Description
    lines.push(`| **Description** | ${primary.desc || 'N/A'} |`);

    // Aggressive
    const isAggressive = page.variants.some(v => v.huntmode.includes('aggressive'));
    lines.push(`| **Aggressive** | ${isAggressive ? 'Yes' : 'No'} |`);

    // Movement
    lines.push(`| **Movement** | ${getMovementDesc(primary)} |`);

    // Respawn (only for combat NPCs)
    if (combat) {
        const respawnRates = [...new Set(page.variants.map(v => v.respawnrate).filter(r => r > 0))].sort((a, b) => a - b);
        if (respawnRates.length > 0) {
            if (respawnRates.length > 1) {
                lines.push(`| **Respawn** | ${respawnRates[0]}-${respawnRates[respawnRates.length - 1]} ticks |`);
            } else {
                lines.push(`| **Respawn** | ${respawnRates[0]} ticks |`);
            }
        }
    }

    lines.push('');

    // Combat Stats section (only if NPC has param stats)
    if (hasCombatStats(primary)) {
        lines.push('## Combat Stats');
        lines.push('');
        lines.push('| Stat | Value |');
        lines.push('|------|-------|');

        const atkBonus = primary.params.get('attackbonus') || '0';
        const strBonus = primary.params.get('strengthbonus') || '0';
        const stabDef = primary.params.get('stabdefence') || '0';
        const slashDef = primary.params.get('slashdefence') || '0';
        const crushDef = primary.params.get('crushdefence') || '0';
        const magicDef = primary.params.get('magicdefence') || '0';
        const rangeDef = primary.params.get('rangedefence') || '0';
        const style = getAttackStyle(primary.params);

        lines.push(`| Attack Bonus | ${atkBonus} |`);
        lines.push(`| Strength Bonus | ${strBonus} |`);
        lines.push(`| Stab Defence | ${stabDef} |`);
        lines.push(`| Slash Defence | ${slashDef} |`);
        lines.push(`| Crush Defence | ${crushDef} |`);
        lines.push(`| Magic Defence | ${magicDef} |`);
        lines.push(`| Range Defence | ${rangeDef} |`);
        lines.push(`| Attack Style | ${style} |`);
        lines.push('');
    }

    // Locations section
    if (page.spawns.length > 0) {
        lines.push(page.spawns.length > 1 ? '## Locations' : '## Location');
        lines.push('');
        lines.push('| Area | Map | Coordinate samples |');
        lines.push('|------|-----|--------------------|');

        // Group spawns by area while retaining useful exact coordinates. Limit
        // samples so very common NPCs do not produce enormous generated pages.
        const byArea = new Map<string, { squares: Set<string>; coordinates: Set<string> }>();
        for (const spawn of page.spawns) {
            const area = getAreaFromMapSquare(spawn.mapSquare);
            if (!byArea.has(area)) {
                byArea.set(area, { squares: new Set(), coordinates: new Set() });
            }
            const group = byArea.get(area)!;
            group.squares.add(spawn.mapSquare);
            const floor = spawn.level > 0 ? ` L${spawn.level}` : '';
            group.coordinates.add(`(${spawn.globalX}, ${spawn.globalZ})${floor}`);
        }

        // Sort by area name
        const sortedAreas = [...byArea.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        for (const [area, group] of sortedAreas) {
            const squareList = [...group.squares].sort().join(', ');
            const allCoordinates = [...group.coordinates].sort();
            const coordinateList = allCoordinates.slice(0, 12).join(', ');
            const overflow = allCoordinates.length > 12 ? `, +${allCoordinates.length - 12} more` : '';
            lines.push(`| ${area} | ${squareList} | ${coordinateList}${overflow} |`);
        }
        lines.push('');
    } else if (primary.hasPatrol || primary.defaultmode === 'patrol') {
        lines.push('## Location');
        lines.push('');
        lines.push('| Area | Coordinates |');
        lines.push('|------|------------|');
        const area = getAreaFromSourcePath(primary.sourcePath);
        if (area) {
            lines.push(`| ${area} | Patrols around the area |`);
        } else {
            lines.push('| Unknown | Patrols around the area |');
        }
        lines.push('');
    }

    // Interactions section (for non-combat NPCs with ops)
    if (!combat) {
        const ops = primary.ops.filter(op => op && op !== 'Attack');
        if (ops.length > 0) {
            lines.push('## Interactions');
            lines.push('');
            lines.push('| Option | Action |');
            lines.push('|--------|--------|');
            for (const op of ops) {
                lines.push(`| ${op} | ${op} |`);
            }
            lines.push('');
        }
    }

    // Drops section
    lines.push('## Drops');
    lines.push('');

    const alwaysDropName = page.alwaysDropItem ? getObjDisplayName(page.alwaysDropItem, objNames) : null;

    if (combat && alwaysDropName && page.alwaysDropItem !== 'null') {
        lines.push(`Always drops: ${alwaysDropName}`);
        lines.push('');
    }

    // Always-drop extra items (like raw chicken, cow hide)
    if (page.alwaysDropExtra.length > 0) {
        for (const item of page.alwaysDropExtra) {
            const name = getObjDisplayName(item.itemConfigName, objNames);
            if (item.quantity > 1) {
                lines.push(`Always drops: ${name} (x${item.quantity})`);
            } else {
                lines.push(`Always drops: ${name}`);
            }
        }
        lines.push('');
    }

    if (page.drops.length > 0) {
        lines.push('| Item | Rarity |');
        lines.push('|------|--------|');

        for (const drop of page.drops) {
            const itemName = getObjDisplayName(drop.itemConfigName, objNames);
            let qtyStr = '';
            if (drop.quantity !== '1') {
                qtyStr = ` (x${drop.quantity})`;
            }
            const membersStr = drop.membersOnly ? ' (members)' : '';
            lines.push(`| ${itemName}${qtyStr} | ${drop.numerator}/${drop.denominator}${membersStr} |`);
        }
        lines.push('');
    } else if (!combat || (!alwaysDropName && page.alwaysDropExtra.length === 0)) {
        lines.push(`${page.displayName} has no drops.`);
        lines.push('');
    }

    // Notes section
    const notes = generateNotes(page);
    if (notes.length > 0) {
        lines.push('## Notes');
        lines.push('');
        for (const note of notes) {
            lines.push(`- ${note}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// ─── Generate Notes ──────────────────────────────────────────────────────────

function generateNotes(page: NpcPage): string[] {
    const notes: string[] = [];
    const primary = page.variants[0];

    // Quest association from source path
    const questMatch = primary.sourcePath.match(/quests\/quest_(\w+)\//);
    if (questMatch) {
        const questName = prettifyConfigName(questMatch[1]);
        notes.push(`Associated with the **${questName}** quest.`);
    }

    // Variants info
    if (page.variants.length > 1) {
        notes.push(`Has ${page.variants.length} visual variants (${page.variants.map(v => v.configName).join(', ')}).`);
    }

    // Hunt mode / behavior notes
    if (primary.huntmode === 'cowardly') {
        notes.push('Will flee from combat when attacked.');
    }
    if (primary.givechase === 'false') {
        notes.push('Does not chase players.');
    }
    if (primary.huntmode.includes('aggressive')) {
        notes.push('Will attack nearby players on sight.');
    }

    // Pickpocket
    if (primary.ops.includes('Pickpocket')) {
        notes.push('Can be pickpocketed for Thieving experience.');
    }

    // Category info
    if (primary.category && !primary.category.startsWith('category_')) {
        const prettyCategory = prettifyConfigName(primary.category);
        notes.push(`Category: ${prettyCategory}.`);
    }

    // Clue scroll
    if (page.clueTier) {
        notes.push(`Can drop ${page.clueTier} clue scrolls.`);
    }

    return notes;
}

// ─── Update README ───────────────────────────────────────────────────────────

function updateReadme(pages: { name: string; file: string }[]) {
    const readmePath = join(WIKI_DIR, 'README.md');
    if (!existsSync(readmePath)) {
        console.log('  No wiki/README.md; skipping index update');
        return;
    }
    let content = readFileSync(readmePath, 'utf-8');

    // Remove existing NPCs section if present
    const npcsStart = content.indexOf('## NPCs');
    if (npcsStart !== -1) {
        // Find the next ## section after NPCs, or end of file
        const afterNpcs = content.slice(npcsStart + 7);
        const nextSection = afterNpcs.search(/\n## /);
        if (nextSection !== -1) {
            content = content.slice(0, npcsStart) + content.slice(npcsStart + 7 + nextSection + 1);
        } else {
            content = content.slice(0, npcsStart).trimEnd() + '\n';
        }
    }

    // Sort alphabetically
    pages.sort((a, b) => a.name.localeCompare(b.name));

    // Generate NPCs section
    const npcSection = [
        '## NPCs',
        '',
        '| NPC | Combat Level |',
        '|-----|-------------|',
    ];

    for (const page of pages) {
        // Read back the file to get combat level
        const filePath = join(NPC_DIR, page.file);
        const md = readFileSync(filePath, 'utf-8');
        const levelMatch = md.match(/\*\*Combat Level\*\*\s*\|\s*([^|]+)\|/);
        const level = levelMatch ? levelMatch[1].trim() : 'None';
        npcSection.push(`| [${page.name}](npcs/${page.file}) | ${level} |`);
    }
    npcSection.push('');

    // Append to content
    content = content.trimEnd() + '\n\n' + npcSection.join('\n');

    writeFileSync(readmePath, content);
    console.log(`  Updated README.md with ${pages.length} NPC entries`);
}

// ─── Utility: Find files recursively ─────────────────────────────────────────

function findFilesRecursive(dir: string, ext: string): string[] {
    const results: string[] = [];

    function walk(d: string) {
        const entries = readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(d, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.name.endsWith(ext)) {
                results.push(fullPath);
            }
        }
    }

    walk(dir);
    return results;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main();
