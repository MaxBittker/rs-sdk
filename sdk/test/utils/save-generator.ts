/**
 * Save File Generator
 * Creates pre-configured save files for testing specific scenarios.
 *
 * Usage:
 *   import { generateSave, TestPresets } from './utils/save-generator';
 *
 *   // Create a save file with custom config
 *   await generateSave('mybot', {
 *       position: { x: 3285, z: 3365 },  // SE Varrock mine
 *       skills: { Mining: 15 },
 *       inventory: [{ id: 1265, count: 1 }],  // Bronze pickaxe
 *   });
 *
 *   // Or use a preset
 *   await generateSave('miner1', TestPresets.MINER_AT_VARROCK);
 */

import * as fs from 'fs';
import * as path from 'path';

// Constants from PlayerLoading
const SAV_MAGIC = 0x2004;
const SAV_VERSION = 6;

// Common inventory type IDs (from game config)
export const InvTypes = {
    INV: 93,      // Main inventory (28 slots)
    WORN: 94,     // Equipment (14 slots)
    BANK: 95,     // Bank (496 slots)
};

// Common item IDs
export const Items = {
    // Tools
    BRONZE_AXE: 1351,
    BRONZE_PICKAXE: 1265,
    TINDERBOX: 590,
    SMALL_FISHING_NET: 303,
    HAMMER: 2347,
    CHISEL: 1755,
    KNIFE: 946,

    // Weapons
    BRONZE_SWORD: 1277,
    BRONZE_DAGGER: 1205,
    WOODEN_SHIELD: 1171,
    SHORTBOW: 841,
    BRONZE_ARROW: 882,

    // Resources
    LOGS: 1511,
    OAK_LOGS: 1521,
    RAW_SHRIMPS: 317,
    SHRIMPS: 315,
    COPPER_ORE: 436,
    TIN_ORE: 438,
    BRONZE_BAR: 2349,
    IRON_BAR: 2351,
    STEEL_BAR: 2353,
    MITHRIL_BAR: 2359,
    ADAMANTITE_BAR: 2361,
    RUNITE_BAR: 2363,

    // Runes
    AIR_RUNE: 556,
    MIND_RUNE: 558,
    WATER_RUNE: 555,
    EARTH_RUNE: 557,
    FIRE_RUNE: 554,
    BODY_RUNE: 559,
    NATURE_RUNE: 561,
    LAW_RUNE: 563,

    // Crafting materials
    WOOL: 1737,
    BALL_OF_WOOL: 1759,
    FLAX: 1779,
    BOW_STRING: 1777,
    LEATHER: 1741,
    HARD_LEATHER: 1743,
    GREEN_DRAGONHIDE: 1745,
    BLUE_DRAGONHIDE: 2505,
    RED_DRAGONHIDE: 2507,
    BLACK_DRAGONHIDE: 2509,
    SOFT_CLAY: 1761,
    NEEDLE: 1733,
    THREAD: 1734,

    // Herblore
    GUAM_LEAF: 249,          // Clean guam leaf
    EYE_OF_NEWT: 221,        // Secondary ingredient for attack potion
    VIAL_OF_WATER: 227,      // Base for unfinished potions
    GUAM_POTION_UNF: 91,     // Unfinished guam potion
    ATTACK_POTION_3: 121,    // 3-dose attack potion

    // Runecrafting
    RUNE_ESSENCE: 1436,      // Basic essence for crafting runes
    PURE_ESSENCE: 7936,      // Pure essence (for higher runes)
    AIR_TALISMAN: 1438,      // Talisman to enter air altar

    // Other
    COINS: 995,
    BUCKET: 1925,
    POT: 1931,
    BREAD: 2309,
    BONES: 526,
    BIG_BONES: 532,
};

// Spell component IDs (from content/pack/interface.pack)
export const Spells = {
    // Combat spells
    WIND_STRIKE: 1152,
    CONFUSE: 1153,
    WATER_STRIKE: 1154,
    ENCHANT_LVL1: 1155,  // Sapphire
    EARTH_STRIKE: 1156,
    WEAKEN: 1157,
    FIRE_STRIKE: 1158,
    WIND_BOLT: 1160,
    CURSE: 1161,
    LOW_ALCHEMY: 1162,
    WATER_BOLT: 1163,
    VARROCK_TELEPORT: 1164,
    ENCHANT_LVL2: 1165,  // Emerald
    EARTH_BOLT: 1166,
    LUMBRIDGE_TELEPORT: 1167,
    FIRE_BOLT: 1169,
    FALADOR_TELEPORT: 1170,
    WIND_BLAST: 1172,
    SUPERHEAT: 1173,
    CAMELOT_TELEPORT: 1174,
    WATER_BLAST: 1175,
    ENCHANT_LVL3: 1176,  // Ruby
    EARTH_BLAST: 1177,
    HIGH_ALCHEMY: 1178,
    ENCHANT_LVL4: 1180,  // Diamond
    FIRE_BLAST: 1181,
    WIND_WAVE: 1183,
    WATER_WAVE: 1185,
    ENCHANT_LVL5: 1187,  // Dragonstone
    EARTH_WAVE: 1188,
    FIRE_WAVE: 1189,
    BIND: 1572,
};

// Skill indices
export const Skills = {
    ATTACK: 0,
    DEFENCE: 1,
    STRENGTH: 2,
    HITPOINTS: 3,
    RANGED: 4,
    PRAYER: 5,
    MAGIC: 6,
    COOKING: 7,
    WOODCUTTING: 8,
    FLETCHING: 9,
    FISHING: 10,
    FIREMAKING: 11,
    CRAFTING: 12,
    SMITHING: 13,
    MINING: 14,
    HERBLORE: 15,
    AGILITY: 16,
    THIEVING: 17,
    RUNECRAFT: 20,
};

// Known locations
export const Locations = {
    LUMBRIDGE_CASTLE: { x: 3222, z: 3218 },
    LUMBRIDGE_SPINNING_WHEEL: { x: 3209, z: 3213, level: 2 },  // 2nd floor of castle
    LUMBRIDGE_SHOP: { x: 3212, z: 3246 },
    ALKHARID_FISHING: { x: 3267, z: 3148 },  // Safe shrimp spot near Al Kharid palace
    DRAYNOR_FISHING: { x: 3086, z: 3230 },  // WARNING: Near dark wizards!
    VARROCK_SE_MINE: { x: 3285, z: 3365 },
    VARROCK_TEA_STALL: { x: 3269, z: 3410 },  // SE Varrock, near tea stall
    ALKHARID_MINE: { x: 3300, z: 3310 },
    ALKHARID_FURNACE: { x: 3274, z: 3186 },
    VARROCK_WEST_BANK: { x: 3185, z: 3436 },
    FALADOR_MINE: { x: 3045, z: 9780, level: 0 },  // Dwarven mine
    EDGEVILLE_DUNGEON: { x: 3132, z: 9912, level: 0 },  // Edgeville dungeon entrance area
    ZANARIS: { x: 3220, z: 9592, level: 0 },  // Lost City (Zanaris)
    GNOME_STRONGHOLD_AGILITY: { x: 2474, z: 3436 },  // Gnome Agility Course start
};

export interface SaveConfig {
    position?: { x: number; z: number; level?: number };
    skills?: Record<string, number>;  // Skill name -> level
    inventory?: Array<{ id: number; count: number }>;
    equipment?: Array<{ id: number; count: number; slot: number }>;
    bank?: Array<{ id: number; count: number }>;  // Bank items (up to 496 slots)
    coins?: number;
    varps?: Record<number, number>;  // Varp ID -> value (281=tutorial progress)
    appearance?: {
        body?: number[];
        colors?: number[];
        gender?: number;
    };
}

// CRC32 calculation (matches engine's Packet.getcrc)
const CRC32_TABLE = new Int32Array(256);
const CRC32_POLYNOMIAL = 0xedb88320;

// Initialize CRC table
for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
        if ((crc & 1) === 1) {
            crc = (crc >>> 1) ^ CRC32_POLYNOMIAL;
        } else {
            crc = crc >>> 1;
        }
    }
    CRC32_TABLE[i] = crc;
}

function getCRC32(data: Uint8Array, offset: number, length: number): number {
    let crc = 0xffffffff;
    for (let i = offset; i < length; i++) {
        const tableIndex = (crc ^ (data[i] ?? 0)) & 0xff;
        crc = (crc >>> 8) ^ (CRC32_TABLE[tableIndex] ?? 0);
    }
    return ~crc;
}

// Calculate XP for a given level (RS formula)
// Must match engine's levelExperience calculation: Math.floor(acc / 4) * 10
function getExpByLevel(level: number): number {
    let xp = 0;
    for (let i = 1; i < level; i++) {
        xp += Math.floor(i + 300 * Math.pow(2, i / 10));
    }
    return Math.floor(xp / 4) * 10;  // ×10 to match engine format
}

// Binary writer helper
class BinaryWriter {
    private buffer: Uint8Array;
    private view: DataView;
    public pos: number = 0;

    constructor(size: number = 4096) {
        this.buffer = new Uint8Array(size);
        this.view = new DataView(this.buffer.buffer);
    }

    p1(value: number): void {
        this.buffer[this.pos++] = value & 0xff;
    }

    p2(value: number): void {
        this.view.setUint16(this.pos, value, false);  // Big-endian
        this.pos += 2;
    }

    p4(value: number): void {
        this.view.setInt32(this.pos, value, false);  // Big-endian
        this.pos += 4;
    }

    p8(value: bigint): void {
        this.view.setBigInt64(this.pos, value, false);  // Big-endian
        this.pos += 8;
    }

    getData(): Uint8Array {
        return this.buffer.subarray(0, this.pos);
    }
}

/**
 * Generate a save file with the given configuration
 */
export function createSaveData(config: SaveConfig): Uint8Array {
    const writer = new BinaryWriter(8192);

    // Header
    writer.p2(SAV_MAGIC);
    writer.p2(SAV_VERSION);

    // Position (default: Lumbridge)
    const pos = config.position ?? Locations.LUMBRIDGE_CASTLE;
    writer.p2(pos.x);
    writer.p2(pos.z);
    const posLevel = (pos as { level?: number }).level ?? 0;
    writer.p1(posLevel);

    // Appearance - body parts (7 values)
    const body = config.appearance?.body ?? [0, 10, 18, 26, 33, 36, 42];
    for (let i = 0; i < 7; i++) {
        const val = body[i] ?? -1;
        writer.p1(val === -1 ? 255 : val);
    }

    // Appearance - colors (5 values)
    const colors = config.appearance?.colors ?? [0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) {
        writer.p1(colors[i] ?? 0);
    }

    // Gender
    writer.p1(config.appearance?.gender ?? 0);

    // Run energy (max = 10000)
    writer.p2(10000);

    // Playtime (ticks)
    writer.p4(1000);

    // Skills (21 total)
    // Build a case-insensitive skill name lookup
    const skillLevels: Record<string, number> = {};
    if (config.skills) {
        for (const [name, level] of Object.entries(config.skills)) {
            skillLevels[name.toUpperCase()] = level;
        }
    }

    for (let i = 0; i < 21; i++) {
        let level = 1;
        let xp = 0;

        // Find skill by index (case-insensitive lookup)
        for (const [skillName, skillIndex] of Object.entries(Skills)) {
            if (skillIndex === i && skillLevels[skillName]) {
                level = skillLevels[skillName];
                xp = getExpByLevel(level);
                break;
            }
        }

        // Hitpoints defaults to 10
        if (i === Skills.HITPOINTS && level === 1) {
            level = 10;
            xp = getExpByLevel(10);
        }

        writer.p4(xp);   // Experience
        writer.p1(level); // Current level
    }

    // Variables (varps) - write count of 309 (typical)
    // Set tutorial progress (varp 281) to 1000 to mark tutorial complete
    const varpCount = 309;
    const varps = new Array(varpCount).fill(0);
    varps[281] = 1000;  // Tutorial complete

    // Apply custom varps if specified
    if (config.varps) {
        for (const [id, value] of Object.entries(config.varps)) {
            const idx = parseInt(id);
            if (idx >= 0 && idx < varpCount) {
                varps[idx] = value;
            }
        }
    }

    writer.p2(varpCount);
    for (let i = 0; i < varpCount; i++) {
        writer.p4(varps[i]);
    }

    // Inventories
    // Build inventory items array
    const invItems: Array<{ id: number; count: number } | null> = new Array(28).fill(null);
    const wornItems: Array<{ id: number; count: number } | null> = new Array(14).fill(null);

    // Add coins if specified
    if (config.coins && config.coins > 0) {
        // Find first empty slot
        for (let i = 0; i < 28; i++) {
            if (!invItems[i]) {
                invItems[i] = { id: Items.COINS, count: config.coins };
                break;
            }
        }
    }

    // Add inventory items
    if (config.inventory) {
        let slot = 0;
        for (const item of config.inventory) {
            // Find next empty slot
            while (slot < 28 && invItems[slot]) slot++;
            if (slot >= 28) break;
            invItems[slot] = item;
            slot++;
        }
    }

    // Add equipment items
    if (config.equipment) {
        for (const item of config.equipment) {
            if (item.slot >= 0 && item.slot < 14) {
                wornItems[item.slot] = { id: item.id, count: item.count };
            }
        }
    }

    // Build bank items array (496 slots)
    const BANK_SIZE = 496;
    const bankItems: Array<{ id: number; count: number } | null> = new Array(BANK_SIZE).fill(null);
    if (config.bank) {
        for (let i = 0; i < config.bank.length && i < BANK_SIZE; i++) {
            bankItems[i] = config.bank[i] ?? null;
        }
    }

    // Count non-empty inventories
    const hasInv = invItems.some(i => i !== null);
    const hasWorn = wornItems.some(i => i !== null);
    const hasBank = bankItems.some(i => i !== null);
    const invCount = (hasInv ? 1 : 0) + (hasWorn ? 1 : 0) + (hasBank ? 1 : 0);

    writer.p1(invCount);

    // Write main inventory
    if (hasInv) {
        writer.p2(InvTypes.INV);  // Type ID
        writer.p2(28);            // Capacity
        for (let i = 0; i < 28; i++) {
            const item = invItems[i];
            if (!item) {
                writer.p2(0);  // Empty slot
            } else {
                writer.p2(item.id + 1);  // Item ID (1-indexed)
                if (item.count >= 255) {
                    writer.p1(255);
                    writer.p4(item.count);
                } else {
                    writer.p1(item.count);
                }
            }
        }
    }

    // Write worn equipment
    if (hasWorn) {
        writer.p2(InvTypes.WORN);  // Type ID
        writer.p2(14);             // Capacity
        for (let i = 0; i < 14; i++) {
            const item = wornItems[i];
            if (!item) {
                writer.p2(0);  // Empty slot
            } else {
                writer.p2(item.id + 1);  // Item ID (1-indexed)
                if (item.count >= 255) {
                    writer.p1(255);
                    writer.p4(item.count);
                } else {
                    writer.p1(item.count);
                }
            }
        }
    }

    // Write bank
    if (hasBank) {
        writer.p2(InvTypes.BANK);  // Type ID
        writer.p2(BANK_SIZE);      // Capacity
        for (let i = 0; i < BANK_SIZE; i++) {
            const item = bankItems[i];
            if (!item) {
                writer.p2(0);  // Empty slot
            } else {
                writer.p2(item.id + 1);  // Item ID (1-indexed)
                if (item.count >= 255) {
                    writer.p1(255);
                    writer.p4(item.count);
                } else {
                    writer.p1(item.count);
                }
            }
        }
    }

    // AFK zones (empty)
    writer.p1(0);  // Count
    writer.p2(0);  // Last AFK zone

    // Chat modes (packed byte: public << 4 | private << 2 | trade)
    writer.p1(0);

    // Last login time
    writer.p8(BigInt(Date.now()));

    // Get data without CRC
    const dataWithoutCRC = writer.getData();

    // Calculate and append CRC
    const crc = getCRC32(dataWithoutCRC, 0, dataWithoutCRC.length);
    writer.p4(crc);

    return writer.getData();
}

/**
 * Generate and save a save file for a bot
 */
export async function generateSave(
    username: string,
    config: SaveConfig,
    profile: string = 'main'
): Promise<string> {
    const saveData = createSaveData(config);

    // Determine save path - check both possible engine locations
    const serverEnginePath = path.join(process.cwd(), 'server/engine/data/players', profile);
    const rootEnginePath = path.join(process.cwd(), 'engine/data/players', profile);
    const baseDir = fs.existsSync(path.join(process.cwd(), 'server/engine/data/players'))
        ? serverEnginePath
        : rootEnginePath;
    const savePath = path.join(baseDir, `${username.toLowerCase()}.sav`);

    // Ensure directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Write save file
    fs.writeFileSync(savePath, saveData);
    console.log(`[SaveGenerator] Created save file: ${savePath}`);

    return savePath;
}

/**
 * Pre-configured test presets
 *
 * These are user-defined starting constraints for scripts.
 * Agents must use one of these presets - they cannot create custom saveConfigs.
 * The preset is a fixed constraint (like the goal), not something to optimize.
 */
export const TestPresets = {
    // Standard post-tutorial Lumbridge spawn - all skills level 1
    LUMBRIDGE_SPAWN: {
        position: Locations.LUMBRIDGE_CASTLE,
        inventory: [
            { id: Items.BRONZE_AXE, count: 1 },
            { id: Items.TINDERBOX, count: 1 },
            { id: Items.SMALL_FISHING_NET, count: 1 },
            { id: Items.SHRIMPS, count: 1 },
            { id: Items.BUCKET, count: 1 },
            { id: Items.POT, count: 1 },
            { id: Items.BREAD, count: 1 },
            { id: Items.BRONZE_PICKAXE, count: 1 },
            { id: Items.BRONZE_DAGGER, count: 1 },
            { id: Items.BRONZE_SWORD, count: 1 },
            { id: Items.WOODEN_SHIELD, count: 1 },
            { id: Items.SHORTBOW, count: 1 },
            { id: Items.BRONZE_ARROW, count: 25 },
            { id: Items.AIR_RUNE, count: 25 },
            { id: Items.MIND_RUNE, count: 15 },
            { id: Items.WATER_RUNE, count: 6 },
            { id: Items.EARTH_RUNE, count: 4 },
            { id: Items.BODY_RUNE, count: 2 },
        ],
    } as SaveConfig,

    // Miner at SE Varrock mine with pickaxe
    MINER_AT_VARROCK: {
        position: Locations.VARROCK_SE_MINE,
        skills: { Mining: 1 },
        inventory: [
            { id: Items.BRONZE_PICKAXE, count: 1 },
        ],
    } as SaveConfig,

    // Miner at Al-Kharid mine (good for mining -> smithing flow)
    MINER_AT_ALKHARID: {
        position: Locations.ALKHARID_MINE,
        skills: { Mining: 1, Smithing: 1 },
        inventory: [
            { id: Items.BRONZE_PICKAXE, count: 1 },
            { id: Items.HAMMER, count: 1 },
        ],
    } as SaveConfig,

    // Fisher at Al Kharid with net (safe from enemies)
    FISHER_AT_ALKHARID: {
        position: Locations.ALKHARID_FISHING,
        skills: { Fishing: 1 },
        inventory: [
            { id: Items.SMALL_FISHING_NET, count: 1 },
        ],
    } as SaveConfig,

    // Fisher at Draynor with net (WARNING: near dark wizards!)
    FISHER_AT_DRAYNOR: {
        position: Locations.DRAYNOR_FISHING,
        skills: { Fishing: 1 },
        inventory: [
            { id: Items.SMALL_FISHING_NET, count: 1 },
        ],
    } as SaveConfig,

    // Fisher+Cook at Al-Kharid (SAFE!) - cook at range, bank fish
    FISHER_COOK_AT_DRAYNOR: {
        position: Locations.ALKHARID_FISHING,  // Safe from dark wizards
        skills: { Fishing: 1, Cooking: 1 },
        inventory: [
            { id: Items.SMALL_FISHING_NET, count: 1 },
        ],
    } as SaveConfig,

    // Woodcutter at Lumbridge with axe and tinderbox
    WOODCUTTER_AT_LUMBRIDGE: {
        position: Locations.LUMBRIDGE_CASTLE,
        skills: { Woodcutting: 1, Firemaking: 1 },
        inventory: [
            { id: Items.BRONZE_AXE, count: 1 },
            { id: Items.TINDERBOX, count: 1 },
        ],
    } as SaveConfig,

    // Combat trainer with basic gear
    COMBAT_TRAINER: {
        position: Locations.LUMBRIDGE_CASTLE,
        skills: { Attack: 1, Strength: 1, Defence: 1 },
        inventory: [
            { id: Items.BRONZE_SWORD, count: 1 },
            { id: Items.WOODEN_SHIELD, count: 1 },
            { id: Items.BREAD, count: 10 },
        ],
    } as SaveConfig,

    // Thief at Varrock tea stall (level 5 required)
    THIEF_AT_VARROCK: {
        position: Locations.VARROCK_TEA_STALL,
        skills: { Thieving: 5 },
    } as SaveConfig,

    // Agility trainer at Gnome Stronghold course
    GNOME_AGILITY: {
        position: Locations.GNOME_STRONGHOLD_AGILITY,
        skills: { Agility: 1 },
    } as SaveConfig,
};

/** Type for a single test preset (value from TestPresets) */
export type TestPreset = SaveConfig;

// CLI usage
if (import.meta.main) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: bun run test/utils/save-generator.ts <username> <preset>');
        console.log('Presets:', Object.keys(TestPresets).join(', '));
        process.exit(1);
    }

    const username = args[0]!;
    const presetName = args[1]!;
    const preset = TestPresets[presetName as keyof typeof TestPresets];

    if (!preset) {
        console.error(`Unknown preset: ${presetName}`);
        console.log('Available presets:', Object.keys(TestPresets).join(', '));
        process.exit(1);
    }

    generateSave(username, preset);
}
