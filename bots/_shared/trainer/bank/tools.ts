/** Catalog of early-game tools: what to buy, where, min coins. */
import { TRAINING_AREAS } from '../knowledge/wiki';
import type { TaskName, WorldPoint } from '../types';

export interface ToolNeed {
    id: string;
    /** Match inventory/equipment */
    pattern: RegExp;
    /** Preferred shop buy name */
    buyName: string;
    /** Shop NPC name pattern */
    shopNpc: RegExp;
    /** Walk destination */
    dest: WorldPoint;
    minCoins: number;
    tasks: TaskName[];
}

export const TOOL_CATALOG: ToolNeed[] = [
    {
        id: 'bronze-axe',
        pattern: /^(?:bronze|iron|steel|black|mithril|adamant|adamantite|rune|dragon)?\s*axe$/i,
        buyName: 'Bronze axe',
        shopNpc: /^bob$/i,
        dest: TRAINING_AREAS.bobAxes,
        minCoins: 16,
        tasks: ['woodcutting', 'firemaking'],
    },
    {
        id: 'bronze-pickaxe',
        pattern: /pickaxe/i,
        buyName: 'Bronze pickaxe',
        shopNpc: /^bob$/i,
        dest: TRAINING_AREAS.bobAxes,
        minCoins: 1,
        tasks: ['mining'],
    },
    {
        id: 'knife',
        pattern: /^knife$/i,
        buyName: 'Knife',
        shopNpc: /shop\s*keeper|shopkeeper/i,
        dest: TRAINING_AREAS.generalStore,
        minCoins: 6,
        tasks: ['fletching', 'woodcutting'],
    },
    {
        id: 'tinderbox',
        pattern: /tinderbox/i,
        buyName: 'Tinderbox',
        shopNpc: /shop\s*keeper|shopkeeper/i,
        dest: TRAINING_AREAS.generalStore,
        minCoins: 1,
        tasks: ['firemaking'],
    },
    {
        id: 'small-net',
        pattern: /small fishing net|\bnet\b/i,
        buyName: 'Small fishing net',
        shopNpc: /shop\s*keeper|shopkeeper|gerrant/i,
        dest: TRAINING_AREAS.generalStore,
        minCoins: 5,
        tasks: ['fishing'],
    },
];

export function toolForTask(task: TaskName): ToolNeed | null {
    return TOOL_CATALOG.find((t) => t.tasks.includes(task)) ?? null;
}

export function toolByPattern(pattern: RegExp): ToolNeed | null {
    const src = pattern.source.toLowerCase();
    return (
        TOOL_CATALOG.find((t) => t.pattern.source.toLowerCase() === src) ??
        TOOL_CATALOG.find((t) => src.includes(t.id.split('-').pop()!)) ??
        null
    );
}
