/**
 * Compiled wiki skill/quest facts — never load raw markdown at runtime.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface WikiFact {
    id: string;
    kind: 'skill' | 'quest';
    title: string;
    tables: Array<{ heading: string; rows: string[][] }>;
    itemsNeeded: string[];
    keyNpcs: string[];
    locations: string[];
}

export interface WikiIndex {
    generatedAt: string;
    count: number;
    byId: Record<string, WikiFact>;
}

const INDEX_PATH = join(import.meta.dir, '../data/wiki-index.json');
let cached: WikiIndex | null = null;

export function loadWikiIndex(): WikiIndex {
    if (cached) return cached;
    if (!existsSync(INDEX_PATH)) {
        cached = { generatedAt: '', count: 0, byId: {} };
        return cached;
    }
    cached = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as WikiIndex;
    return cached;
}

export function getSkillFact(id: string): WikiFact | null {
    return loadWikiIndex().byId[id] ?? null;
}

/** Read a compiled quest fact by id. */
export const getQuestFact = getSkillFact;

/**
 * From a skill guide "Trees" / resource table, pick the best row the player can use.
 * Supports name-first rows like [Tree, Level, Log Type, Locations] and
 * level-first rows like [Level, Ore, Locations].
 */
export function bestResourceForLevel(
    skillId: string,
    level: number,
    tableHeadingRe: RegExp = /trees|ores?|fish|spots?/i,
): { name: string; level: number; product: string; locations: string } | null {
    const fact = getSkillFact(skillId);
    if (!fact) return null;

    let best: { name: string; level: number; product: string; locations: string } | null = null;
    for (const table of fact.tables) {
        if (!tableHeadingRe.test(table.heading)) continue;
        for (const row of table.rows.slice(1)) {
            const numericFirst = !Number.isNaN(Number.parseInt(row[0] ?? '', 10));
            const nameIndex = numericFirst ? 1 : 0;
            const levelIndex = numericFirst ? 0 : 1;
            const name = row[nameIndex]?.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim() ?? '';
            const lvl = Number.parseInt(row[levelIndex] ?? '1', 10);
            if (!name || Number.isNaN(lvl) || lvl > level) continue;
            const product = (row[numericFirst ? 1 : 2] ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
            const locations = (row[numericFirst ? 2 : 3] ?? row[2] ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
            if (!best || lvl >= best.level) {
                best = { name, level: lvl, product, locations };
            }
        }
    }
    return best;
}

/** Known early-game training anchors (wiki + learnings). */
export const TRAINING_AREAS = {
    lumbridgeMen: { x: 3222, z: 3218, label: 'Lumbridge men' },
    lumbridgeTrees: { x: 3192, z: 3234, label: 'Lumbridge trees' },
    draynorWillows: { x: 3087, z: 3236, label: 'Draynor willows' },
    seVarrockMine: { x: 3285, z: 3365, label: 'SE Varrock mine' },
    lumbridgeCows: { x: 3253, z: 3267, label: 'Lumbridge cows' },
    lumbridgeSwampFish: { x: 3241, z: 3150, label: 'Lumbridge swamp fishing' },
    lumbridgeRange: { x: 3212, z: 3216, label: 'Lumbridge castle range' },
    bobAxes: { x: 3230, z: 3203, label: "Bob's axes" },
    generalStore: { x: 3212, z: 3246, label: 'Lumbridge general store' },
    lumbridgeBank: { x: 3208, z: 3220, label: 'Lumbridge bank' },
} as const;
