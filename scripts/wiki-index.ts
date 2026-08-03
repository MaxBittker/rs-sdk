#!/usr/bin/env bun
/**
 * Compile wiki skill/quest markdown tables into a compact JSON index.
 * Runtime bots never load raw wiki markdown.
 *
 * Usage: bun scripts/wiki-index.ts
 * Output: bots/_shared/trainer/data/wiki-index.json
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const OUT_DIR = join(ROOT, 'bots/_shared/trainer/data');
const OUT_FILE = join(OUT_DIR, 'wiki-index.json');

interface WikiFact {
    id: string;
    kind: 'skill' | 'quest';
    title: string;
    tables: Array<{ heading: string; rows: string[][] }>;
    itemsNeeded: string[];
    keyNpcs: string[];
    locations: string[];
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

function extractListAfter(md: string, headingRe: RegExp): string[] {
    const lines = md.split(/\r?\n/);
    const out: string[] = [];
    let capture = false;
    for (const line of lines) {
        if (headingRe.test(line)) {
            capture = true;
            continue;
        }
        if (capture) {
            if (/^#{1,3}\s+/.test(line)) break;
            const bullet = line.match(/^\s*[-*]\s+(.*)/);
            if (bullet) out.push(bullet[1].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim());
            const pipe = line.match(/^\|([^|]+)\|/);
            if (pipe && !/^-{2,}/.test(pipe[1].trim())) {
                const cell = pipe[1].trim();
                if (cell && !/^items?$/i.test(cell)) out.push(cell);
            }
        }
    }
    return out;
}

function indexDir(dir: string, kind: 'skill' | 'quest'): WikiFact[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((file) => {
            const id = file.replace(/\.md$/, '');
            const md = readFileSync(join(dir, file), 'utf8');
            const title = (md.match(/^#\s+(.*)/)?.[1] ?? id).trim();
            const tables = parseTables(md);
            return {
                id,
                kind,
                title,
                tables: tables.slice(0, 8),
                itemsNeeded: extractListAfter(md, /items?\s+needed/i),
                keyNpcs: extractListAfter(md, /key\s+npcs?/i),
                locations: extractListAfter(md, /locations?/i),
            } satisfies WikiFact;
        });
}

function main() {
    const skills = indexDir(join(ROOT, 'wiki/skills'), 'skill');
    const quests = indexDir(join(ROOT, 'wiki/quests'), 'quest');
    const facts = [...skills, ...quests];
    mkdirSync(OUT_DIR, { recursive: true });
    const payload = {
        generatedAt: new Date().toISOString(),
        count: facts.length,
        byId: Object.fromEntries(facts.map((f) => [f.id, f])),
    };
    writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
    console.log(`Wrote ${facts.length} facts → ${OUT_FILE}`);
}

main();
