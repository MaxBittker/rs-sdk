// Append-only NDJSON event log. One file per run; every bot writes to it.
// Analysis (prices, flows, wealth) is derived from this plus the public market API.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const RUN_ID = process.env.ECON_RUN ?? '_dev';
export const RUN_DIR = join(import.meta.dir, '..', '..', 'runs', RUN_ID);
const FILE = join(RUN_DIR, 'events.ndjson');
mkdirSync(dirname(FILE), { recursive: true });

export type Emit = (ev: string, data?: Record<string, unknown>) => void;

export function makeEmit(bot: string, role: string): Emit {
    return (ev, data = {}) => {
        const line = JSON.stringify({ t: Date.now(), bot, role, ev, ...data });
        appendFileSync(FILE, line + '\n');
        if (process.env.ECON_VERBOSE !== '0') console.log(`[${bot}] ${ev}`, Object.keys(data).length ? JSON.stringify(data) : '');
    };
}
