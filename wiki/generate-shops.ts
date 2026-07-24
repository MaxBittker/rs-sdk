#!/usr/bin/env bun
/**
 * Shop Wiki Generator
 * Parses server content files and generates markdown wiki pages for all shops.
 * Run: bun wiki/generate-shops.ts
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, relative } from 'path';

const CONTENT_DIR = join(import.meta.dir, '..', 'server', 'content');
const WIKI_DIR = join(import.meta.dir);
const SHOP_DIR = join(WIKI_DIR, 'shops');

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockItem {
    configName: string;
    quantity: number;
    price: number;
}

interface ShopInventory {
    name: string; // section name e.g. "axeshop"
    scope: string;
    restock: boolean;
    allstock: boolean;
    size: number;
    stock: StockItem[];
    sourcePath: string;
}

interface ShopOwner {
    npcConfigName: string;
    npcDisplayName: string;
    shopName: string; // matches ShopInventory.name
    shopTitle: string;
    sellMultiplier: number;
    buyMultiplier: number;
    delta: number;
    sourcePath: string;
}

interface ShopPage {
    shopName: string;
    shopTitle: string;
    inventory: ShopInventory;
    owners: ShopOwner[];
    location: string;
    isGeneralStore: boolean;
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

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseInvConfigs(content: string, sourcePath: string): ShopInventory[] {
    const shops: ShopInventory[] = [];
    let current: ShopInventory | null = null;

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('//') || line.startsWith('/ ')) continue;

        const sectionMatch = line.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            if (current && current.stock.length > 0) shops.push(current);
            current = {
                name: sectionMatch[1],
                scope: '',
                restock: false,
                allstock: false,
                size: 40,
                stock: [],
                sourcePath,
            };
            continue;
        }

        if (!current || !line) continue;

        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();

        if (key === 'scope') current.scope = value;
        else if (key === 'restock') current.restock = value === 'yes';
        else if (key === 'allstock') current.allstock = value === 'yes';
        else if (key === 'size') current.size = parseInt(value) || 40;
        else if (key.startsWith('stock')) {
            const parts = value.split(',');
            if (parts.length >= 3) {
                current.stock.push({
                    configName: parts[0].trim(),
                    quantity: parseInt(parts[1]) || 0,
                    price: parseInt(parts[2]) || 0,
                });
            }
        }
    }
    if (current && current.stock.length > 0) shops.push(current);
    return shops;
}

interface NpcShopInfo {
    configName: string;
    displayName: string;
    params: Map<string, string>;
    sourcePath: string;
}

function parseNpcConfigs(content: string, sourcePath: string): NpcShopInfo[] {
    const results: NpcShopInfo[] = [];
    let currentName = '';
    let currentDisplayName = '';
    let currentParams = new Map<string, string>();

    function flush() {
        if (currentName && currentParams.has('owned_shop')) {
            results.push({
                configName: currentName,
                displayName: currentDisplayName,
                params: currentParams,
                sourcePath,
            });
        }
    }

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('//') || line.startsWith('/ ')) continue;

        const sectionMatch = line.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            flush();
            currentName = sectionMatch[1];
            currentDisplayName = '';
            currentParams = new Map();
            continue;
        }

        if (!currentName || !line) continue;

        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();

        if (key === 'name') currentDisplayName = value;
        else if (key === 'param') {
            const commaIdx = value.indexOf(',');
            if (commaIdx !== -1) {
                currentParams.set(value.slice(0, commaIdx), value.slice(commaIdx + 1));
            }
        }
    }
    flush();
    return results;
}

interface ObjInfo {
    displayName: string;
    cost: number;
}

function parseObjConfigsFull(content: string): Map<string, ObjInfo> {
    const items = new Map<string, ObjInfo>();
    let currentName = '';
    let currentDisplayName = '';
    let currentCost = 0;

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('//') || line.startsWith('/ ')) continue;

        const sectionMatch = line.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            if (currentName && currentDisplayName) {
                items.set(currentName, { displayName: currentDisplayName, cost: currentCost });
            }
            currentName = sectionMatch[1];
            currentDisplayName = '';
            currentCost = 0;
            continue;
        }

        if (line.startsWith('name=')) {
            currentDisplayName = line.slice(5);
        } else if (line.startsWith('cost=')) {
            currentCost = parseInt(line.slice(5)) || 0;
        }
    }
    if (currentName && currentDisplayName) {
        items.set(currentName, { displayName: currentDisplayName, cost: currentCost });
    }
    return items;
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

function getAreaFromSourcePath(sourcePath: string): string {
    const match = sourcePath.match(/scripts\/(?:areas\/)?(\w+)\//);
    if (!match) return 'Unknown';
    return SOURCE_PATH_AREAS[match[1]] || prettifyConfigName(match[1]);
}

function slugify(name: string): string {
    return name.toLowerCase()
        .replace(/['']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

function main() {
    console.log('Shop Wiki Generator');
    console.log('===================\n');

    // ─── Step 1: Parse shop inventories ─────────────────────────────────

    console.log('Step 1: Parsing shop inventories...');

    const invFiles = findFilesRecursive(join(CONTENT_DIR, 'scripts'), '.inv');
    const allShops = new Map<string, ShopInventory>();

    for (const file of invFiles) {
        const content = readFileSync(file, 'utf-8');
        const relPath = relative(CONTENT_DIR, file);
        const shops = parseInvConfigs(content, relPath);
        for (const shop of shops) {
            // Filter non-shop inventories: must have restock=yes and not be temp scope
            if (shop.restock && shop.scope !== 'temp') {
                allShops.set(shop.name, shop);
            }
        }
    }
    console.log(`  Found ${allShops.size} shop inventories from ${invFiles.length} .inv files`);

    // ─── Step 2: Parse shop owner NPCs ──────────────────────────────────

    console.log('\nStep 2: Parsing shop owner NPCs...');

    const npcFiles = findFilesRecursive(join(CONTENT_DIR, 'scripts'), '.npc');
    const shopOwners = new Map<string, ShopOwner[]>(); // shopName -> owners

    for (const file of npcFiles) {
        const content = readFileSync(file, 'utf-8');
        const relPath = relative(CONTENT_DIR, file);
        const npcs = parseNpcConfigs(content, relPath);

        for (const npc of npcs) {
            const shopName = npc.params.get('owned_shop')!;
            const owner: ShopOwner = {
                npcConfigName: npc.configName,
                npcDisplayName: npc.displayName,
                shopName,
                shopTitle: npc.params.get('shop_title') || prettifyConfigName(shopName),
                sellMultiplier: parseInt(npc.params.get('shop_sell_multiplier') || '1000'),
                buyMultiplier: parseInt(npc.params.get('shop_buy_multiplier') || '600'),
                delta: parseInt(npc.params.get('shop_delta') || '10'),
                sourcePath: relPath,
            };

            if (!shopOwners.has(shopName)) shopOwners.set(shopName, []);
            shopOwners.get(shopName)!.push(owner);
        }
    }

    let totalOwners = 0;
    for (const owners of shopOwners.values()) totalOwners += owners.length;
    console.log(`  Found ${totalOwners} shop owners for ${shopOwners.size} shops`);

    // ─── Step 3: Load item data (names + costs) ────────────────────────

    console.log('\nStep 3: Loading item data...');

    const objData = new Map<string, ObjInfo>();
    const allObjContent = readFileSync(join(CONTENT_DIR, 'scripts', '_unpack', '225', 'all.obj'), 'utf-8');
    const allObjData = parseObjConfigsFull(allObjContent);
    for (const [k, v] of allObjData) objData.set(k, v);

    const objConfigFiles = findFilesRecursive(join(CONTENT_DIR, 'scripts'), '.obj');
    for (const file of objConfigFiles) {
        if (file.includes('_unpack')) continue;
        const content = readFileSync(file, 'utf-8');
        const parsed = parseObjConfigsFull(content);
        for (const [k, v] of parsed) {
            const existing = objData.get(k);
            if (existing) {
                // Merge: override name/cost if set
                if (v.displayName) existing.displayName = v.displayName;
                if (v.cost) existing.cost = v.cost;
            } else {
                objData.set(k, v);
            }
        }
    }
    console.log(`  Loaded ${objData.size} items`);

    // ─── Step 4: Build shop pages ───────────────────────────────────────

    console.log('\nStep 4: Building shop pages...');

    const shopPages: ShopPage[] = [];

    for (const [shopName, inventory] of allShops) {
        const owners = shopOwners.get(shopName) || [];
        const primaryOwner = owners[0];

        const shopTitle = (primaryOwner?.shopTitle || prettifyConfigName(shopName)).replace(/\.$/, '');
        const location = primaryOwner
            ? getAreaFromSourcePath(primaryOwner.sourcePath)
            : getAreaFromSourcePath(inventory.sourcePath);

        shopPages.push({
            shopName,
            shopTitle,
            inventory,
            owners,
            location,
            isGeneralStore: inventory.allstock,
        });
    }

    // Sort by shop title
    shopPages.sort((a, b) => a.shopTitle.localeCompare(b.shopTitle));
    console.log(`  Built ${shopPages.length} shop pages`);

    // ─── Step 5: Generate markdown ──────────────────────────────────────

    console.log('\nStep 5: Generating markdown...');

    mkdirSync(SHOP_DIR, { recursive: true });

    const pageIndex: { name: string; file: string; location: string }[] = [];

    for (const page of shopPages) {
        const slug = slugify(page.shopTitle);
        const fileName = `${slug}.md`;
        const filePath = join(SHOP_DIR, fileName);

        const md = generateShopMarkdown(page, objData);
        writeFileSync(filePath, md);

        pageIndex.push({ name: page.shopTitle, file: fileName, location: page.location });
    }

    console.log(`  Generated ${pageIndex.length} shop pages`);

    // ─── Step 6: Update README ──────────────────────────────────────────

    console.log('\nStep 6: Updating README...');
    updateReadme(pageIndex);

    console.log('\nDone!');
}

// ─── Generate Markdown ───────────────────────────────────────────────────────

function generateShopMarkdown(page: ShopPage, objData: Map<string, ObjInfo>): string {
    const lines: string[] = [];
    const primaryOwner = page.owners[0];

    // Price multipliers (confusing naming in source: shop_sell_multiplier = price when shop sells TO player)
    const sellToPlayerMul = primaryOwner?.sellMultiplier || 1000;
    const buyFromPlayerMul = primaryOwner?.buyMultiplier || 600;

    lines.push(`# ${page.shopTitle}`);
    lines.push('');

    // Info table
    lines.push('| Detail | |');
    lines.push('|---|---|');

    // Owner(s)
    if (page.owners.length > 0) {
        const ownerLinks = page.owners.map(o => {
            const npcSlug = slugify(o.npcDisplayName);
            const npcPagePath = `../npcs/${npcSlug}.md`;
            return `[${o.npcDisplayName}](${npcPagePath})`;
        });
        lines.push(`| **Owner** | ${ownerLinks.join(', ')} |`);
    } else {
        lines.push('| **Owner** | Unknown |');
    }

    lines.push(`| **Location** | ${page.location} |`);
    lines.push(`| **Type** | ${page.isGeneralStore ? 'General Store' : 'Specialty Shop'} |`);

    lines.push('');

    // Stock table with computed prices
    lines.push('## Stock');
    lines.push('');
    lines.push('| Item | Stock | Buy Price | Sell Price |');
    lines.push('|------|-------|-----------|------------|');

    for (const item of page.inventory.stock) {
        const info = objData.get(item.configName);
        const displayName = info?.displayName || prettifyConfigName(item.configName);
        const baseCost = info?.cost || 0;

        // Buy price = what player pays to buy from shop (at normal stock)
        const buyPrice = Math.max(1, Math.floor(baseCost * sellToPlayerMul / 1000));
        // Sell price = what player gets selling to shop (at normal stock)
        const sellPrice = Math.floor(baseCost * buyFromPlayerMul / 1000);

        const itemSlug = slugify(displayName);
        const itemLink = `[${displayName}](../items/${itemSlug}.md)`;
        lines.push(`| ${itemLink} | ${item.quantity} | ${buyPrice} gp | ${sellPrice} gp |`);
    }

    lines.push('');
    return lines.join('\n');
}

// ─── Update README ───────────────────────────────────────────────────────────

function updateReadme(pages: { name: string; file: string; location: string }[]) {
    const readmePath = join(WIKI_DIR, 'README.md');
    if (!existsSync(readmePath)) {
        console.log('  No wiki/README.md; skipping index update');
        return;
    }
    let content = readFileSync(readmePath, 'utf-8');

    // Remove existing Shops section if present
    const shopsStart = content.indexOf('## Shops');
    if (shopsStart !== -1) {
        const afterShops = content.slice(shopsStart + 8);
        const nextSection = afterShops.search(/\n## /);
        if (nextSection !== -1) {
            content = content.slice(0, shopsStart) + content.slice(shopsStart + 8 + nextSection + 1);
        } else {
            content = content.slice(0, shopsStart).trimEnd() + '\n';
        }
    }

    // Sort alphabetically
    pages.sort((a, b) => a.name.localeCompare(b.name));

    // Generate Shops section
    const section = [
        '## Shops',
        '',
        '| Shop | Location |',
        '|------|----------|',
    ];

    for (const page of pages) {
        section.push(`| [${page.name}](shops/${page.file}) | ${page.location} |`);
    }
    section.push('');

    // Insert before NPCs section if it exists, otherwise append
    const npcsStart = content.indexOf('## NPCs');
    if (npcsStart !== -1) {
        content = content.slice(0, npcsStart) + section.join('\n') + '\n' + content.slice(npcsStart);
    } else {
        content = content.trimEnd() + '\n\n' + section.join('\n');
    }

    writeFileSync(readmePath, content);
    console.log(`  Updated README.md with ${pages.length} shop entries`);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main();
