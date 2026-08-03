import type { KitSpec, TaskName } from '../types';

export const COOK_RAW_BATCH = 4;

export const FOOD =
    /^(?!.*(?:tin|dish|uncooked|raw|burnt))(?:shrimps?|anchovies|trout|salmon|tuna|lobster|swordfish|shark|meat|chicken|beef|bread|cake|(?:\w+\s+)?pie)$/i;
const AXE = /^(?:bronze|iron|steel|black|mithril|adamant|adamantite|rune|dragon)?\s*axe$/i;
const PICKAXE = /pickaxe/i;
const KNIFE = /knife/i;
const NET = /small fishing net|\bnet\b/i;
const TINDERBOX = /tinderbox/i;
const LOGS = /logs?/i;
const RAW_FOOD = /raw\s+(shrimps?|trout|salmon|anchovies|beef|chicken|meat)/i;
const COINS = /coins?/i;

export const TOOL_PATTERNS: Record<string, RegExp> = {
    axe: AXE,
    pickaxe: PICKAXE,
    knife: KNIFE,
    net: NET,
    tinderbox: TINDERBOX,
};

const leanDeposit = ['axe', 'pickaxe', 'net', 'tinderbox', 'knife'];

export const TASK_KITS: Record<TaskName, KitSpec> = {
    thieving: {
        keep: [COINS, FOOD],
        withdraw: [{ pattern: FOOD, n: 4 }],
        depositTools: leanDeposit,
    },
    woodcutting: {
        keep: [AXE, LOGS, KNIFE, COINS],
        withdraw: [{ pattern: AXE, n: 1, label: 'axe' }],
        depositTools: ['pickaxe', 'net', 'tinderbox'],
    },
    firemaking: {
        keep: [TINDERBOX, LOGS, COINS],
        withdraw: [
            { pattern: TINDERBOX, n: 1, label: 'tinderbox' },
            { pattern: LOGS, n: 20 },
        ],
        depositTools: ['axe', 'pickaxe', 'net', 'knife'],
    },
    fletching: {
        keep: [KNIFE, LOGS, /bow|shaft/i, COINS],
        withdraw: [
            { pattern: KNIFE, n: 1, label: 'knife' },
            { pattern: LOGS, n: 20 },
        ],
        depositTools: ['axe', 'pickaxe', 'net', 'tinderbox'],
    },
    selling: {
        keep: [/bow/i, COINS],
        withdraw: [{ pattern: /bow/i, n: 20 }],
        depositTools: leanDeposit,
    },
    fishing: {
        keep: [NET, RAW_FOOD, FOOD, COINS],
        withdraw: [{ pattern: NET, n: 1, label: 'net' }],
        depositTools: ['axe', 'pickaxe', 'tinderbox', 'knife'],
    },
    cooking: {
        keep: [RAW_FOOD, FOOD, COINS],
        withdraw: [{ pattern: RAW_FOOD, n: 16 }],
        depositTools: leanDeposit,
    },
    mining: {
        keep: [PICKAXE, /ore|clay|coal/i, COINS],
        withdraw: [{ pattern: PICKAXE, n: 1, label: 'pickaxe' }],
        depositTools: ['axe', 'net', 'tinderbox', 'knife'],
    },
    combat: {
        keep: [FOOD, /sword|scimitar|dagger|mace|axe/i, /cow\s*hide|cowhide/i, COINS],
        withdraw: [{ pattern: FOOD, n: 8 }],
        depositTools: ['pickaxe', 'net', 'tinderbox', 'knife'],
    },
    bank: {
        keep: [COINS, FOOD],
        withdraw: [],
        depositTools: [],
    },
    supply: {
        keep: [COINS],
        withdraw: [{ pattern: COINS, n: 50 }],
        depositTools: leanDeposit,
    },
};

export function kitForTask(task: TaskName): KitSpec {
    return TASK_KITS[task] ?? TASK_KITS.bank;
}
