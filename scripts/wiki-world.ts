#!/usr/bin/env bun
/**
 * Compile wiki NPC coords + shop stock into a compact world index.
 * Runtime bots never load raw wiki markdown.
 *
 * Usage: bun scripts/wiki-world.ts
 * Output: bots/_shared/trainer/data/world-index.json
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const OUT_DIR = join(ROOT, 'bots/_shared/trainer/data');
const OUT_FILE = join(OUT_DIR, 'world-index.json');

export interface WorldPoint {
    x: number;
    z: number;
    label: string;
}

export interface WorldNpc {
    id: string;
    name: string;
    points: WorldPoint[];
}

export interface WorldShop {
    id: string;
    title: string;
    owner: string | null;
    area: string | null;
    stock: string[];
    /** Resolved via owner NPC when possible. */
    points: WorldPoint[];
}

export interface WorldObstacle {
    id: string;
    kind: 'toll_gate' | 'gate';
    /** Approximate gate tile / crossing. */
    point: WorldPoint;
    /** Destinations with x >= this are "east of" the Al Kharid toll. */
    eastOfX?: number;
    notes?: string;
}

function parseTables(md: string): Array<{ heading: string; rows: string[][] }> {
    const lines = md.split(/\r?\n/);
    const tables: Array<{ heading: string; rows: string[][] }> = [];
    let heading = '';
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const h = line.match(/^#{1,3}\s+(.*)/);
        if (h) heading = h[1].trim();
        if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*-+/.test(lines[i + 1])) {
            const rows: string[][] = [];
            while (i < lines.length && lines[i].includes('|')) {
                if (/^\s*\|?\s*-+/.test(lines[i])) {
                    i += 1;
                    continue;
                }
                const cells = lines[i]
                    .split('|')
                    .map((c) => c.trim())
                    .filter((c, idx, arr) => !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === ''));
                if (cells.length) rows.push(cells);
                i += 1;
            }
            if (rows.length) tables.push({ heading, rows });
            continue;
        }
        i += 1;
    }
    return tables;
}

function stripMdLink(text: string): string {
    return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}

function detailValue(md: string, key: RegExp): string | null {
    const re = new RegExp(`\\*\\*${key.source}\\*\\*\\s*\\|\\s*(.+)`, 'i');
    const m = md.match(re);
    if (!m) return null;
    return stripMdLink(m[1].replace(/\|.*$/, '').trim());
}

function extractCoords(cell: string): Array<{ x: number; z: number }> {
    const out: Array<{ x: number; z: number }> = [];
    const re = /\((\d{3,5})\s*,\s*(\d{3,5})\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cell)) !== null) {
        out.push({ x: Number(m[1]), z: Number(m[2]) });
    }
    return out;
}

function indexNpcs(dir: string): WorldNpc[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((file) => {
            const id = file.replace(/\.md$/, '');
            const md = readFileSync(join(dir, file), 'utf8');
            const name = (md.match(/^#\s+(.*)/)?.[1] ?? id).trim();
            const tables = parseTables(md);
            const points: WorldPoint[] = [];
            for (const table of tables) {
                if (!/location/i.test(table.heading)) continue;
                for (const row of table.rows.slice(1)) {
                    const area = row[0] ?? '';
                    const coordCell = row[row.length - 1] ?? '';
                    for (const c of extractCoords(coordCell)) {
                        points.push({ x: c.x, z: c.z, label: area || name });
                    }
                }
            }
            return { id, name, points };
        })
        .filter((n) => n.points.length > 0);
}

function indexShops(dir: string, npcsByName: Map<string, WorldNpc>): WorldShop[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((file) => {
            const id = file.replace(/\.md$/, '');
            const md = readFileSync(join(dir, file), 'utf8');
            const title = (md.match(/^#\s+(.*)/)?.[1] ?? id).trim();
            const owner = detailValue(md, /Owner/) ?? null;
            const area = detailValue(md, /Location/) ?? null;
            const tables = parseTables(md);
            const stock: string[] = [];
            for (const table of tables) {
                if (!/stock/i.test(table.heading)) continue;
                for (const row of table.rows.slice(1)) {
                    const item = stripMdLink(row[0] ?? '');
                    if (item && !/^item$/i.test(item)) stock.push(item);
                }
            }
            const points: WorldPoint[] = [];
            if (owner) {
                const key = owner.toLowerCase();
                const npc = npcsByName.get(key);
                if (npc?.points?.length) {
                    for (const p of npc.points) {
                        points.push({ ...p, label: `${title} (${p.label})` });
                    }
                }
            }
            return { id, title, owner, area, stock, points };
        })
        .filter((s) => s.stock.length > 0);
}

const OBSTACLES: WorldObstacle[] = [
    {
        id: 'alkharid_toll',
        kind: 'toll_gate',
        point: { x: 3268, z: 3228, label: 'Al Kharid toll gate' },
        eastOfX: 3268,
        notes: '10gp toll or Prince Ali free passage; Border Guard dialog',
    },
    {
        id: 'lumbridge_cow_gate',
        kind: 'gate',
        point: { x: 3253, z: 3266, label: 'Lumbridge cow field gate' },
        notes: 'Opens with normal loc interact',
    },
];

function main() {
    const npcs = indexNpcs(join(ROOT, 'wiki/npcs'));
    const npcsByName = new Map(npcs.map((n) => [n.name.toLowerCase(), n]));
    const shops = indexShops(join(ROOT, 'wiki/shops'), npcsByName);

    mkdirSync(OUT_DIR, { recursive: true });
    const payload = {
        generatedAt: new Date().toISOString(),
        npcCount: npcs.length,
        shopCount: shops.length,
        npcs,
        shops,
        obstacles: OBSTACLES,
    };
    writeFileSync(OUT_FILE, JSON.stringify(payload));
    console.log(`Wrote ${npcs.length} NPCs, ${shops.length} shops, ${OBSTACLES.length} obstacles → ${OUT_FILE}`);
}

main();
