#!/usr/bin/env bun
/**
 * Item Wiki Generator
 * Parses server content files and generates markdown wiki pages for all items.
 * Run: bun wiki/generate-items.ts
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, relative } from 'path';

const CONTENT_DIR = join(import.meta.dir, '..', 'server', 'content');
const WIKI_DIR = join(import.meta.dir);
const ITEM_DIR = join(WIKI_DIR, 'items');
const SHOP_DIR = join(WIKI_DIR, 'shops');
const NPC_DIR = join(WIKI_DIR, 'npcs');

// ─── Types ───────────────────────────────────────────────────────────────────

interface ItemConfig {
    configName: string;
    name: string;
    desc: string;
    cost: number;
    weight: string;
    members: boolean;
    stackable: boolean;
    tradeable: string; // "yes", "no", or "" (default yes)
    category: string;
    wearpos: string;
    wearpos2: string;
    wearpos3: string;
    dummyitem: string;
    iops: string[]; // iop1-iop5
    countRefs: string[]; // count1-count9 item refs (visual variants)
    params: Map<string, string>;
    sourcePath: string;
}

interface ShopSource {
    shopTitle: string;
    shopSlug: string;
    buyPrice: number; // what player pays
}

interface NpcDropSource {
    npcName: string;
    npcSlug: string;
    rarity: string;
}

interface SpawnLocation {
    mapSquare: string;
    area: string;
    level: number;
    quantity: number;
}

type ItemCategory = 'Weapon' | 'Armour' | 'Ammunition' | 'Rune' | 'Food' | 'Potion' | 'Tool' | 'Quest Item' | 'Other';

interface ItemPage {
    displayName: string;
    config: ItemConfig; // primary config
    category: ItemCategory;
    equipSlot: string | null;
    shops: ShopSource[];
    drops: NpcDropSource[];
    spawns: SpawnLocation[];
}

// ─── Wearpos Display Names ───────────────────────────────────────────────────

const WEARPOS_NAMES: Record<string, string> = {
    'hat': 'Head',
    'back': 'Back',
    'front': 'Front',
    'righthand': 'Weapon',
    'torso': 'Body',
    'lefthand': 'Shield',
    'arms': 'Arms',
    'legs': 'Legs',
    'head': 'Head',
    'hands': 'Hands',
    'feet': 'Feet',
    'jaw': 'Jaw',
    'ring': 'Ring',
    'quiver': 'Ammo',
};

// ─── Combat Stat Keys ────────────────────────────────────────────────────────

const ATTACK_STATS = ['stabattack', 'slashattack', 'crushattack', 'magicattack', 'rangeattack'];
const DEFENCE_STATS = ['stabdefence', 'slashdefence', 'crushdefence', 'magicdefence', 'rangedefence'];
const BONUS_STATS = ['strengthbonus', 'rangebonus', 'prayerbonus'];
const STAT_DISPLAY: Record<string, string> = {
    'stabattack': 'Stab Attack',
    'slashattack': 'Slash Attack',
    'crushattack': 'Crush Attack',
    'magicattack': 'Magic Attack',
    'rangeattack': 'Range Attack',
    'stabdefence': 'Stab Defence',
    'slashdefence': 'Slash Defence',
    'crushdefence': 'Crush Defence',
    'magicdefence': 'Magic Defence',
    'rangedefence': 'Range Defence',
    'strengthbonus': 'Strength Bonus',
    'rangebonus': 'Range Bonus',
    'prayerbonus': 'Prayer Bonus',
    'levelrequire': 'Level Requirement',
    'attackrate': 'Attack Speed',
};

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseObjConfigs(content: string, sourcePath: string): Map<string, ItemConfig> {
    const configs = new Map<string, ItemConfig>();
    let current: ItemConfig | null = null;

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('//') || line.startsWith('/ ')) continue;

        const sectionMatch = line.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            if (current) configs.set(current.configName, current);
            current = makeEmptyItemConfig(sectionMatch[1], sourcePath);
            continue;
        }

        if (!current || !line) continue;

        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();

        switch (key) {
            case 'name': current.name = value; break;
            case 'desc': current.desc = value; break;
            case 'cost': current.cost = parseInt(value) || 0; break;
            case 'weight': current.weight = value; break;
            case 'members': current.members = value === 'yes'; break;
            case 'stackable': current.stackable = value === 'yes'; break;
            case 'tradeable': current.tradeable = value; break;
            case 'category': current.category = value; break;
            case 'wearpos': current.wearpos = value; break;
            case 'wearpos2': current.wearpos2 = value; break;
            case 'wearpos3': current.wearpos3 = value; break;
            case 'dummyitem': current.dummyitem = value; break;
            case 'iop1': current.iops[0] = value; break;
            case 'iop2': current.iops[1] = value; break;
            case 'iop3': current.iops[2] = value; break;
            case 'iop4': current.iops[3] = value; break;
            case 'iop5': current.iops[4] = value; break;
            case 'param': {
                const commaIdx = value.indexOf(',');
                if (commaIdx !== -1) {
                    current.params.set(value.slice(0, commaIdx), value.slice(commaIdx + 1));
                }
                break;
            }
            default: {
                const countMatch = key.match(/^count(\d+)$/);
                if (countMatch) {
                    const parts = value.split(',');
                    if (parts.length >= 1) {
                        current.countRefs.push(parts[0]);
                    }
                }
                break;
            }
        }
    }
    if (current) configs.set(current.configName, current);
    return configs;
}

function makeEmptyItemConfig(configName: string, sourcePath: string): ItemConfig {
    return {
        configName,
        name: '',
        desc: '',
        cost: 0,
        weight: '',
        members: false,
        stackable: false,
        tradeable: '',
        category: '',
        wearpos: '',
        wearpos2: '',
        wearpos3: '',
        dummyitem: '',
        iops: ['', '', '', '', ''],
        countRefs: [],
        params: new Map(),
        sourcePath,
    };
}

function findFilesRecursive(dir: string, ext: string): string[] {
    const results: string[] = [];
    function walk(d: string) {
        const entries = readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(d, entry.name);
            if (entry.isDirectory()) walk(fullPath);
            else if (entry.name.endsWith(ext)) results.push(fullPath);
        }
    }
    walk(dir);
    return results;
}

function prettifyConfigName(name: string): string {
    return name
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
}

function slugify(name: string): string {
    return name.toLowerCase()
        .replace(/['']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// ─── Shop Data Parser (reparse .inv files for item cross-reference) ─────────

interface ShopStockEntry {
    shopConfigName: string;
    shopTitle: string;
    itemConfigName: string;
    quantity: number;
    sellMultiplier: number; // shop_sell_multiplier (price when shop sells to player)
}

function parseShopData(): Map<string, ShopStockEntry[]> {
    // Parse shop titles and multipliers from NPC files
    interface ShopNpcInfo {
        title: string;
        sellMultiplier: number;
    }
    const shopInfo = new Map<string, ShopNpcInfo>();
    const npcFiles = findFilesRecursive(join(CONTENT_DIR, 'scripts'), '.npc');
    for (const file of npcFiles) {
        const content = readFileSync(file, 'utf-8');
        let currentParams = new Map<string, string>();
        function flushNpc() {
            if (currentParams.has('owned_shop')) {
                const shopName = currentParams.get('owned_shop')!;
                if (!shopInfo.has(shopName)) {
                    shopInfo.set(shopName, {
                        title: (currentParams.get('shop_title') || prettifyConfigName(shopName)).replace(/\.$/, ''),
                        sellMultiplier: parseInt(currentParams.get('shop_sell_multiplier') || '1000'),
                    });
                }
            }
        }
        for (const rawLine of content.split('\n')) {
            const line = rawLine.trim();
            if (line.startsWith('//') || line.startsWith('/ ')) continue;
            if (line.match(/^\[([^\]]+)\]$/)) {
                flushNpc();
                currentParams = new Map();
                continue;
            }
            if (line.startsWith('param=')) {
                const val = line.slice(6);
                const commaIdx = val.indexOf(',');
                if (commaIdx !== -1) {
                    currentParams.set(val.slice(0, commaIdx), val.slice(commaIdx + 1));
                }
            }
        }
        flushNpc();
    }

    // Parse shop inventories
    const itemToShops = new Map<string, ShopStockEntry[]>();
    const invFiles = findFilesRecursive(join(CONTENT_DIR, 'scripts'), '.inv');
    for (const file of invFiles) {
        const content = readFileSync(file, 'utf-8');
        let currentShopName = '';
        let isShop = false;

        for (const rawLine of content.split('\n')) {
            const line = rawLine.trim();
            if (line.startsWith('//') || line.startsWith('/ ')) continue;

            const sectionMatch = line.match(/^\[([^\]]+)\]$/);
            if (sectionMatch) {
                currentShopName = sectionMatch[1];
                isShop = false;
                continue;
            }

            if (line === 'restock=yes') isShop = true;
            if (line === 'scope=temp') isShop = false;

            if (isShop && line.startsWith('stock')) {
                const eqIdx = line.indexOf('=');
                if (eqIdx === -1) continue;
                const value = line.slice(eqIdx + 1).trim();
                const parts = value.split(',');
                if (parts.length >= 2) {
                    const itemConfig = parts[0].trim();
                    const info = shopInfo.get(currentShopName);
                    const shopTitle = info?.title || prettifyConfigName(currentShopName);
                    const sellMultiplier = info?.sellMultiplier || 1000;

                    if (!itemToShops.has(itemConfig)) itemToShops.set(itemConfig, []);
                    itemToShops.get(itemConfig)!.push({
                        shopConfigName: currentShopName,
                        shopTitle,
                        itemConfigName: itemConfig,
                        quantity: parseInt(parts[1]) || 0,
                        sellMultiplier,
                    });
                }
            }
        }
    }

    return itemToShops;
}

// ─── NPC Drop Data Parser (from generated NPC pages) ────────────────────────

function parseNpcDropData(): Map<string, NpcDropSource[]> {
    const itemToDrops = new Map<string, NpcDropSource[]>();

    if (!existsSync(NPC_DIR)) return itemToDrops;

    const npcFiles = readdirSync(NPC_DIR).filter(f => f.endsWith('.md'));
    for (const file of npcFiles) {
        const content = readFileSync(join(NPC_DIR, file), 'utf-8');
        const npcNameMatch = content.match(/^# (.+)$/m);
        if (!npcNameMatch) continue;
        const npcName = npcNameMatch[1];
        const npcSlug = file.replace('.md', '');

        // Parse "Always drops: ItemName" lines
        const alwaysDrops = content.matchAll(/^Always drops: (.+?)(?:\s*\(x\d+\))?$/gm);
        for (const match of alwaysDrops) {
            const itemName = match[1].trim();
            if (!itemToDrops.has(itemName)) itemToDrops.set(itemName, []);
            itemToDrops.get(itemName)!.push({ npcName, npcSlug, rarity: 'Always' });
        }

        // Parse drop table rows: | ItemName (xQty) | N/D |
        const dropRows = content.matchAll(/^\| (.+?) \| (\d+\/\d+(?:\s*\(members\))?) \|$/gm);
        for (const match of dropRows) {
            let itemName = match[1].trim();
            const rarity = match[2].trim();
            // Remove quantity suffix
            itemName = itemName.replace(/\s*\(x[\d-]+\)$/, '');
            if (itemName === 'Item') continue; // skip header

            if (!itemToDrops.has(itemName)) itemToDrops.set(itemName, []);
            // Avoid duplicate NPC entries for same item
            const existing = itemToDrops.get(itemName)!;
            if (!existing.some(d => d.npcSlug === npcSlug)) {
                existing.push({ npcName, npcSlug, rarity });
            }
        }
    }

    return itemToDrops;
}

// ─── Map Spawn Parser ───────────────────────────────────────────────────────

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

function parseObjSpawns(
    mapsDir: string,
    objIdToName: Map<number, string>
): Map<string, SpawnLocation[]> {
    const spawns = new Map<string, SpawnLocation[]>();
    const mapFiles = readdirSync(mapsDir).filter(f => f.endsWith('.jm2'));

    for (const file of mapFiles) {
        const match = file.match(/^m(\d+)_(\d+)\.jm2$/);
        if (!match) continue;
        const mapX = parseInt(match[1]);
        const mapZ = parseInt(match[2]);
        const mapSquare = `m${mapX}_${mapZ}`;
        const area = MAP_SQUARE_AREAS[mapSquare] || mapSquare;

        const content = readFileSync(join(mapsDir, file), 'utf-8');
        const objSectionStart = content.indexOf('==== OBJ ====');
        if (objSectionStart === -1) continue;

        const afterObj = content.slice(objSectionStart + '==== OBJ ===='.length);
        const nextSection = afterObj.indexOf('====');
        const objBlock = nextSection === -1 ? afterObj : afterObj.slice(0, nextSection);

        for (const line of objBlock.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            // Format: level localX localZ: itemID quantity
            const m = trimmed.match(/^(\d+)\s+(\d+)\s+(\d+):\s*(\d+)\s+(\d+)$/);
            if (!m) continue;
            const level = parseInt(m[1]);
            const objId = parseInt(m[4]);
            const quantity = parseInt(m[5]);

            const configName = objIdToName.get(objId);
            if (!configName) continue;

            if (!spawns.has(configName)) spawns.set(configName, []);
            spawns.get(configName)!.push({ mapSquare, area, level, quantity });
        }
    }

    return spawns;
}

// ─── Categorization ──────────────────────────────────────────────────────────

function categorizeItem(config: ItemConfig): { category: ItemCategory; equipSlot: string | null } {
    const hasAttackStats = ATTACK_STATS.some(s => config.params.has(s));
    const hasDefenceStats = DEFENCE_STATS.some(s => config.params.has(s));
    const wearSlot = config.wearpos ? (WEARPOS_NAMES[config.wearpos] || config.wearpos) : null;

    // Ammunition: stackable + quiver slot or arrow/bolt category
    if (config.wearpos === 'quiver' || (config.stackable && config.category.includes('arrow')) ||
        (config.stackable && config.category.includes('bolt')) ||
        (config.stackable && config.category.includes('dart')) ||
        (config.stackable && config.category.includes('javelin')) ||
        (config.stackable && config.category.includes('throwing'))) {
        if (hasAttackStats || config.wearpos === 'quiver') {
            return { category: 'Ammunition', equipSlot: 'Ammo' };
        }
    }

    // Weapons: righthand + attack stats
    if (config.wearpos === 'righthand' && hasAttackStats) {
        return { category: 'Weapon', equipSlot: wearSlot };
    }

    // Armour: wearable + defence stats (not weapons)
    if (config.wearpos && config.wearpos !== 'righthand' && (hasDefenceStats || hasAttackStats)) {
        return { category: 'Armour', equipSlot: wearSlot };
    }

    // Runes
    if (config.category.includes('rune') || config.sourcePath.includes('runes')) {
        return { category: 'Rune', equipSlot: null };
    }

    // Food: iop1=Eat
    if (config.iops[0] === 'Eat') {
        return { category: 'Food', equipSlot: null };
    }

    // Potions: iop1=Drink
    if (config.iops[0] === 'Drink') {
        return { category: 'Potion', equipSlot: null };
    }

    // Quest items: from quest paths + untradeable
    if (config.sourcePath.includes('quest') && config.tradeable === 'no') {
        return { category: 'Quest Item', equipSlot: null };
    }

    // Tools: axes, pickaxes, etc. that are wieldable
    if (config.wearpos === 'righthand' && !hasAttackStats) {
        return { category: 'Tool', equipSlot: wearSlot };
    }

    // Equipable items without combat stats (cosmetic/utility)
    if (config.wearpos) {
        return { category: 'Armour', equipSlot: wearSlot };
    }

    return { category: 'Other', equipSlot: null };
}

function hasCombatStats(config: ItemConfig): boolean {
    return [...ATTACK_STATS, ...DEFENCE_STATS, ...BONUS_STATS].some(s => config.params.has(s));
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

function main() {
    console.log('Item Wiki Generator');
    console.log('===================\n');

    // ─── Step 1: Parse all item configs ─────────────────────────────────

    console.log('Step 1: Parsing item configs...');

    const allConfigs = new Map<string, ItemConfig>();

    // Parse all.obj (base configs)
    const allObjContent = readFileSync(join(CONTENT_DIR, 'scripts', '_unpack', '225', 'all.obj'), 'utf-8');
    const baseConfigs = parseObjConfigs(allObjContent, 'scripts/_unpack/225/all.obj');
    for (const [name, config] of baseConfigs) allConfigs.set(name, config);
    console.log(`  all.obj: ${baseConfigs.size} configs`);

    // Parse extra .obj files (override base)
    const objFiles = findFilesRecursive(join(CONTENT_DIR, 'scripts'), '.obj');
    let extraCount = 0;
    for (const file of objFiles) {
        if (file.includes('_unpack')) continue;
        const content = readFileSync(file, 'utf-8');
        const relPath = relative(CONTENT_DIR, file);
        const configs = parseObjConfigs(content, relPath);
        for (const [name, config] of configs) {
            const existing = allConfigs.get(name);
            if (existing) {
                // Merge: extra overrides specific fields
                if (config.name) existing.name = config.name;
                if (config.desc) existing.desc = config.desc;
                if (config.cost) existing.cost = config.cost;
                if (config.weight) existing.weight = config.weight;
                if (config.members) existing.members = config.members;
                if (config.stackable) existing.stackable = config.stackable;
                if (config.tradeable) existing.tradeable = config.tradeable;
                if (config.category) existing.category = config.category;
                if (config.wearpos) existing.wearpos = config.wearpos;
                if (config.wearpos2) existing.wearpos2 = config.wearpos2;
                if (config.wearpos3) existing.wearpos3 = config.wearpos3;
                if (config.dummyitem) existing.dummyitem = config.dummyitem;
                for (let i = 0; i < 5; i++) {
                    if (config.iops[i]) existing.iops[i] = config.iops[i];
                }
                for (const [k, v] of config.params) existing.params.set(k, v);
                if (config.sourcePath !== 'scripts/_unpack/225/all.obj') {
                    existing.sourcePath = config.sourcePath;
                }
            } else {
                allConfigs.set(name, config);
            }
            extraCount++;
        }
    }
    console.log(`  Extra .obj files: ${extraCount} configs from ${objFiles.length - 1} files`);
    console.log(`  Total configs: ${allConfigs.size}`);

    // ─── Step 2: Build set of count variant refs (visual-only items) ────

    const countVariantRefs = new Set<string>();
    for (const [, config] of allConfigs) {
        for (const ref of config.countRefs) {
            countVariantRefs.add(ref);
        }
    }
    console.log(`  Count variant refs: ${countVariantRefs.size}`);

    // ─── Step 3: Parse pack file ───────────────────────────────────────

    console.log('\nStep 2: Loading pack file...');
    const objPackContent = readFileSync(join(CONTENT_DIR, 'pack', 'obj.pack'), 'utf-8');
    const certConfigNames = new Set<string>();
    const objIdToName = new Map<number, string>();
    for (const line of objPackContent.split('\n')) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const id = parseInt(line.slice(0, eqIdx));
        const name = line.slice(eqIdx + 1).trim();
        if (!isNaN(id) && name) {
            objIdToName.set(id, name);
            if (name.startsWith('cert_')) {
                certConfigNames.add(name);
            }
        }
    }
    console.log(`  Pack entries: ${objIdToName.size}, cert names: ${certConfigNames.size}`);

    // ─── Step 4: Get tutorial item config names ─────────────────────────

    const tutorialObjFile = join(CONTENT_DIR, 'scripts', 'tutorial', 'configs', 'tutorial.obj');
    const tutorialItems = new Set<string>();
    if (existsSync(tutorialObjFile)) {
        const content = readFileSync(tutorialObjFile, 'utf-8');
        const configs = parseObjConfigs(content, 'tutorial');
        for (const name of configs.keys()) tutorialItems.add(name);
    }
    console.log(`  Tutorial items: ${tutorialItems.size}`);

    // ─── Step 5: Filter items ───────────────────────────────────────────

    console.log('\nStep 3: Filtering items...');

    const filteredConfigs = new Map<string, ItemConfig>();
    let filtered = 0;
    const filterReasons = new Map<string, number>();

    function filterOut(reason: string) {
        filtered++;
        filterReasons.set(reason, (filterReasons.get(reason) || 0) + 1);
    }

    for (const [name, config] of allConfigs) {
        // No name
        if (!config.name) { filterOut('no name'); continue; }
        // Cert/noted variants
        if (certConfigNames.has(name)) { filterOut('cert'); continue; }
        if (name.startsWith('cert_')) { filterOut('cert prefix'); continue; }
        // Tutorial items
        if (tutorialItems.has(name)) { filterOut('tutorial'); continue; }
        // Internal dummy rendering variants (count refs)
        if (countVariantRefs.has(name)) { filterOut('count variant'); continue; }
        // Dummyitem (visual-only internal items)
        if (config.dummyitem === 'inv_only') { filterOut('dummyitem'); continue; }
        // Template items (cert template)
        if (name === 'template_for_cert') { filterOut('cert template'); continue; }

        filteredConfigs.set(name, config);
    }

    console.log(`  Filtered out ${filtered} items:`);
    for (const [reason, count] of [...filterReasons.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${reason}: ${count}`);
    }
    console.log(`  Remaining: ${filteredConfigs.size} items`);

    // ─── Step 6: Deduplicate by display name ────────────────────────────

    console.log('\nStep 4: Deduplicating by display name...');

    const pagesByName = new Map<string, ItemConfig[]>();
    for (const [, config] of filteredConfigs) {
        if (!pagesByName.has(config.name)) {
            pagesByName.set(config.name, []);
        }
        pagesByName.get(config.name)!.push(config);
    }

    // For items with same display name, pick the best config (prefer canonical versions)
    const bestConfigs = new Map<string, ItemConfig>();
    for (const [name, configs] of pagesByName) {
        // Sort: prefer non-quest, then with stats, then with wearpos, then higher cost
        configs.sort((a, b) => {
            // Prefer non-quest paths over quest paths
            const aQuest = a.sourcePath.includes('quest') ? 1 : 0;
            const bQuest = b.sourcePath.includes('quest') ? 1 : 0;
            if (aQuest !== bQuest) return aQuest - bQuest;
            // Prefer tradeable over untradeable
            const aUntradeable = a.tradeable === 'no' ? 1 : 0;
            const bUntradeable = b.tradeable === 'no' ? 1 : 0;
            if (aUntradeable !== bUntradeable) return aUntradeable - bUntradeable;
            // Prefer items with combat stats
            const aStats = hasCombatStats(a) ? 1 : 0;
            const bStats = hasCombatStats(b) ? 1 : 0;
            if (aStats !== bStats) return bStats - aStats;
            // Prefer equipable items
            const aWear = a.wearpos ? 1 : 0;
            const bWear = b.wearpos ? 1 : 0;
            if (aWear !== bWear) return bWear - aWear;
            // Higher cost as tiebreaker
            return b.cost - a.cost;
        });
        bestConfigs.set(name, configs[0]);
    }
    console.log(`  Deduplicated to ${bestConfigs.size} unique items`);

    // ─── Step 7: Parse shop and drop data ───────────────────────────────

    console.log('\nStep 5: Parsing shop and NPC drop data...');

    const itemToShops = parseShopData();
    console.log(`  Items sold in shops: ${itemToShops.size}`);

    const itemToDrops = parseNpcDropData();
    console.log(`  Items dropped by NPCs: ${itemToDrops.size}`);

    // Parse ground item spawns from map files
    const itemSpawns = parseObjSpawns(join(CONTENT_DIR, 'maps'), objIdToName);
    console.log(`  Items with ground spawns: ${itemSpawns.size}`);

    // ─── Step 8: Build item pages ───────────────────────────────────────

    console.log('\nStep 6: Building item pages...');

    const itemPages: ItemPage[] = [];

    for (const [displayName, config] of bestConfigs) {
        const { category, equipSlot } = categorizeItem(config);

        // Find shop sources for this item (by config name, check all configs with this display name)
        const shops: ShopSource[] = [];
        const variants = pagesByName.get(displayName) || [config];
        for (const variant of variants) {
            const shopEntries = itemToShops.get(variant.configName);
            if (shopEntries) {
                for (const entry of shopEntries) {
                    if (!shops.some(s => s.shopSlug === slugify(entry.shopTitle))) {
                        // Compute buy price: item.cost * sellMultiplier / 1000 (min 1)
                        const baseCost = config.cost;
                        const buyPrice = Math.max(1, Math.floor(baseCost * entry.sellMultiplier / 1000));
                        shops.push({
                            shopTitle: entry.shopTitle,
                            shopSlug: slugify(entry.shopTitle),
                            buyPrice,
                        });
                    }
                }
            }
        }

        // Find NPC drop sources (by display name)
        const drops = itemToDrops.get(displayName) || [];

        // Find ground spawns (by config name, check all variants)
        const spawns: SpawnLocation[] = [];
        const seenSpawnAreas = new Set<string>();
        for (const variant of variants) {
            const variantSpawns = itemSpawns.get(variant.configName);
            if (variantSpawns) {
                for (const spawn of variantSpawns) {
                    const key = `${spawn.mapSquare}_${spawn.level}`;
                    if (!seenSpawnAreas.has(key)) {
                        seenSpawnAreas.add(key);
                        spawns.push(spawn);
                    }
                }
            }
        }

        itemPages.push({
            displayName,
            config,
            category,
            equipSlot,
            shops,
            drops,
            spawns,
        });
    }

    // Sort alphabetically
    itemPages.sort((a, b) => a.displayName.localeCompare(b.displayName));
    console.log(`  Built ${itemPages.length} item pages`);

    // Category breakdown
    const catCounts = new Map<string, number>();
    for (const page of itemPages) {
        catCounts.set(page.category, (catCounts.get(page.category) || 0) + 1);
    }
    for (const [cat, count] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${cat}: ${count}`);
    }

    // ─── Step 9: Generate markdown ──────────────────────────────────────

    console.log('\nStep 7: Generating markdown...');

    mkdirSync(ITEM_DIR, { recursive: true });

    const pageIndex: { name: string; file: string; category: ItemCategory }[] = [];

    for (const page of itemPages) {
        const slug = slugify(page.displayName);
        const fileName = `${slug}.md`;
        const filePath = join(ITEM_DIR, fileName);

        const md = generateItemMarkdown(page);
        writeFileSync(filePath, md);

        pageIndex.push({ name: page.displayName, file: fileName, category: page.category });
    }

    console.log(`  Generated ${pageIndex.length} item pages`);

    // ─── Step 10: Update README ─────────────────────────────────────────

    console.log('\nStep 8: Updating README...');
    updateReadme(pageIndex);

    console.log('\nDone!');
}

// ─── Generate Markdown ───────────────────────────────────────────────────────

function generateItemMarkdown(page: ItemPage): string {
    const lines: string[] = [];
    const config = page.config;
    const isEquipment = page.equipSlot !== null;

    lines.push(`# ${page.displayName}`);
    lines.push('');

    if (config.desc) {
        lines.push(`*${config.desc}*`);
        lines.push('');
    }

    // Info table
    lines.push('| Detail | |');
    lines.push('|---|---|');
    lines.push(`| **Type** | ${page.category} |`);
    lines.push(`| **Members** | ${config.members ? 'Yes' : 'No'} |`);

    if (config.weight) {
        lines.push(`| **Weight** | ${config.weight} |`);
    }

    lines.push(`| **Value** | ${config.cost} gp |`);

    if (isEquipment) {
        lines.push(`| **Equipable** | Yes — ${page.equipSlot} |`);
    }

    if (config.stackable) {
        lines.push('| **Stackable** | Yes |');
    }

    if (config.tradeable === 'no') {
        lines.push('| **Tradeable** | No |');
    }

    lines.push('');

    // Combat stats for equipment
    if (isEquipment && hasCombatStats(config)) {
        lines.push('## Combat Stats');
        lines.push('');
        lines.push('| Stat | Value |');
        lines.push('|------|-------|');

        for (const stat of [...ATTACK_STATS, ...DEFENCE_STATS, ...BONUS_STATS]) {
            const value = config.params.get(stat);
            if (value !== undefined) {
                const numVal = parseInt(value);
                const prefix = numVal > 0 ? '+' : '';
                lines.push(`| ${STAT_DISPLAY[stat]} | ${prefix}${value} |`);
            }
        }

        // Level requirement
        const levelReq = config.params.get('levelrequire');
        if (levelReq && levelReq !== '0') {
            lines.push(`| ${STAT_DISPLAY['levelrequire']} | ${levelReq} |`);
        }

        // Attack speed
        const attackRate = config.params.get('attackrate');
        if (attackRate) {
            lines.push(`| ${STAT_DISPLAY['attackrate']} | ${attackRate} |`);
        }

        lines.push('');
    }

    // Spawn locations section
    if (page.spawns.length > 0) {
        lines.push('## Spawn Locations');
        lines.push('');
        lines.push('| Area | Floor | Quantity |');
        lines.push('|------|-------|----------|');

        // Group by area + level, sum quantities
        const byAreaLevel = new Map<string, { area: string; level: number; count: number }>();
        for (const spawn of page.spawns) {
            const key = `${spawn.area}_${spawn.level}`;
            if (!byAreaLevel.has(key)) {
                byAreaLevel.set(key, { area: spawn.area, level: spawn.level, count: 0 });
            }
            byAreaLevel.get(key)!.count += spawn.quantity;
        }

        const sortedAreas = [...byAreaLevel.values()].sort((a, b) => a.area.localeCompare(b.area));
        for (const data of sortedAreas) {
            const floorStr = data.level === 0 ? 'Ground' : `Floor ${data.level}`;
            lines.push(`| ${data.area} | ${floorStr} | ${data.count} |`);
        }

        lines.push('');
    }

    // Sources section
    if (page.shops.length > 0 || page.drops.length > 0) {
        lines.push('## Sources');
        lines.push('');

        for (const shop of page.shops) {
            lines.push(`- Sold by: [${shop.shopTitle}](../shops/${shop.shopSlug}.md) for ${shop.buyPrice} gp`);
        }

        for (const drop of page.drops) {
            lines.push(`- Dropped by: [${drop.npcName}](../npcs/${drop.npcSlug}.md) (${drop.rarity})`);
        }

        lines.push('');
    }

    return lines.join('\n');
}

// ─── Update README ───────────────────────────────────────────────────────────

function updateReadme(pages: { name: string; file: string; category: ItemCategory }[]) {
    const readmePath = join(WIKI_DIR, 'README.md');
    if (!existsSync(readmePath)) {
        console.log('  No wiki/README.md; skipping index update');
        return;
    }
    let content = readFileSync(readmePath, 'utf-8');

    // Remove existing Items section if present
    const itemsStart = content.indexOf('## Items');
    if (itemsStart !== -1) {
        const afterItems = content.slice(itemsStart + 8);
        const nextSection = afterItems.search(/\n## /);
        if (nextSection !== -1) {
            content = content.slice(0, itemsStart) + content.slice(itemsStart + 8 + nextSection + 1);
        } else {
            content = content.slice(0, itemsStart).trimEnd() + '\n';
        }
    }

    // Sort alphabetically
    pages.sort((a, b) => a.name.localeCompare(b.name));

    // Generate Items section
    const section = [
        '## Items',
        '',
        '| Item | Type |',
        '|------|------|',
    ];

    for (const page of pages) {
        section.push(`| [${page.name}](items/${page.file}) | ${page.category} |`);
    }
    section.push('');

    // Insert before Shops section if it exists, otherwise before NPCs, otherwise append
    const shopsStart = content.indexOf('## Shops');
    if (shopsStart !== -1) {
        content = content.slice(0, shopsStart) + section.join('\n') + '\n' + content.slice(shopsStart);
    } else {
        const npcsStart = content.indexOf('## NPCs');
        if (npcsStart !== -1) {
            content = content.slice(0, npcsStart) + section.join('\n') + '\n' + content.slice(npcsStart);
        } else {
            content = content.trimEnd() + '\n\n' + section.join('\n');
        }
    }

    writeFileSync(readmePath, content);
    console.log(`  Updated README.md with ${pages.length} item entries`);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main();
