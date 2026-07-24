#!/usr/bin/env bun

import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';

export type WikiKind = 'item' | 'npc' | 'shop' | 'quest' | 'other';

export interface WikiSearchRecord {
    kind: WikiKind;
    name: string;
    aliases: string[];
    path: string;
    summary?: string;
    coordinates: Array<{ x: number; z: number }>;
    mapSquares: string[];
    mapSquareBounds: Array<{
        mapSquare: string;
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
    }>;
    obtainability: string[];
}

function kindFor(relativePath: string): WikiKind {
    const directory = relativePath.split(sep)[0];
    if (directory === 'items') return 'item';
    if (directory === 'npcs') return 'npc';
    if (directory === 'shops') return 'shop';
    if (directory === 'quests') return 'quest';
    return 'other';
}

function normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stripMarkdown(value: string): string {
    return value
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function section(content: string, heading: string): string {
    const start = content.search(new RegExp(`^## ${heading}\\s*$`, 'im'));
    if (start < 0) return '';
    const body = content.slice(start).replace(/^## [^\n]+\n/i, '');
    const next = body.search(/^## /m);
    return next < 0 ? body : body.slice(0, next);
}

function unique<T>(values: T[], key: (value: T) => string): T[] {
    const seen = new Set<string>();
    return values.filter(value => {
        const id = key(value);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

async function markdownFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async entry => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return markdownFiles(path);
        return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
    }));
    return nested.flat();
}

function recordFromMarkdown(wikiDir: string, path: string, content: string): WikiSearchRecord | null {
    const heading = content.match(/^# (.+)$/m)?.[1]?.trim();
    if (!heading) return null;

    const relativePath = relative(wikiDir, path);
    const slug = basename(path, '.md');
    const description = content.match(/^\*([^*\n]+)\*$/m)?.[1] ??
        content.match(/\|\s*\*\*Description\*\*\s*\|\s*([^|]+)\|/i)?.[1];
    const coordinates = unique(
        [...content.matchAll(/\((\d{3,5}),\s*(\d{3,5})\)/g)]
            .map(match => ({ x: Number(match[1]), z: Number(match[2]) })),
        coordinate => `${coordinate.x},${coordinate.z}`,
    );
    const mapSquares = [...new Set(
        [...content.matchAll(/\bm\d+_\d+\b/g)].map(match => match[0]),
    )];
    const mapSquareBounds = mapSquares.map(mapSquare => {
        const match = mapSquare.match(/^m(\d+)_(\d+)$/)!;
        const minX = Number(match[1]) * 64;
        const minZ = Number(match[2]) * 64;
        return {
            mapSquare,
            minX,
            maxX: minX + 63,
            minZ,
            maxZ: minZ + 63,
        };
    });
    const sourceText = section(content, 'Sources');
    const obtainability = sourceText
        .split('\n')
        .filter(line => /^\s*-\s+/.test(line))
        .map(line => stripMarkdown(line.replace(/^\s*-\s+/, '')))
        .filter(Boolean);
    const aliases = [...new Set([
        slug,
        normalize(slug),
        normalize(heading),
        normalize(heading).replace(/\b\d+\b/g, '').trim(),
    ].filter(alias => alias && alias !== heading))];

    return {
        kind: kindFor(relativePath),
        name: heading,
        aliases,
        path: relativePath.split(sep).join('/'),
        summary: description ? stripMarkdown(description) : undefined,
        coordinates,
        mapSquares,
        mapSquareBounds,
        obtainability,
    };
}

export async function buildWikiIndex(wikiDir = import.meta.dir): Promise<WikiSearchRecord[]> {
    const files = await markdownFiles(wikiDir);
    const records = await Promise.all(files.map(async path =>
        recordFromMarkdown(wikiDir, path, await readFile(path, 'utf8'))
    ));
    return records
        .filter((record): record is WikiSearchRecord => record !== null)
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

export function searchWiki(
    records: WikiSearchRecord[],
    query: string,
    options: { kind?: WikiKind; limit?: number } = {},
): WikiSearchRecord[] {
    const needle = normalize(query);
    const terms = needle.split(' ').filter(Boolean);
    const scored = records
        .filter(record => !options.kind || record.kind === options.kind)
        .map(record => {
            const name = normalize(record.name);
            const aliases = record.aliases.map(normalize);
            const searchable = normalize([
                record.name,
                ...record.aliases,
                record.summary ?? '',
                ...record.obtainability,
                ...record.mapSquares,
                ...record.mapSquareBounds.map(
                    bounds => `${bounds.minX} ${bounds.maxX} ${bounds.minZ} ${bounds.maxZ}`
                ),
                ...record.coordinates.map(({ x, z }) => `${x} ${z}`),
            ].join(' '));
            let score = 0;
            if (name === needle) score += 100;
            if (aliases.includes(needle)) score += 80;
            if (name.startsWith(needle)) score += 50;
            if (name.includes(needle)) score += 30;
            if (terms.every(term => searchable.includes(term))) score += 10;
            return { record, score };
        })
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name));

    return scored.slice(0, options.limit ?? 20).map(result => result.record);
}

function parseCli(argv: string[]): {
    query: string;
    json: boolean;
    kind?: WikiKind;
    limit: number;
} {
    let json = false;
    let kind: WikiKind | undefined;
    let limit = 20;
    const queryParts: string[] = [];

    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index]!;
        if (argument === '--json') {
            json = true;
        } else if (argument === '--kind') {
            kind = argv[++index] as WikiKind;
        } else if (argument === '--limit') {
            limit = Number(argv[++index]);
        } else {
            queryParts.push(argument);
        }
    }

    if (kind && !['item', 'npc', 'shop', 'quest', 'other'].includes(kind)) {
        throw new Error(`Unknown wiki kind: ${kind}`);
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        throw new Error('--limit must be an integer from 1 to 500');
    }
    const query = queryParts.join(' ').trim();
    if (!query) {
        throw new Error('Usage: bun wiki/search.ts [--json] [--kind item|npc|shop|quest] [--limit N] <query>');
    }
    return { query, json, kind, limit };
}

async function main(): Promise<void> {
    const options = parseCli(process.argv.slice(2));
    const results = searchWiki(await buildWikiIndex(), options.query, options);

    if (options.json) {
        console.log(JSON.stringify({ query: options.query, count: results.length, results }, null, 2));
        return;
    }

    for (const result of results) {
        const locations = [
            ...result.coordinates.map(({ x, z }) => `(${x}, ${z})`),
            ...result.mapSquares,
        ].join(', ');
        console.log(`${result.kind.padEnd(5)} ${result.name} — wiki/${result.path}${locations ? ` — ${locations}` : ''}`);
        if (result.summary) console.log(`      ${result.summary}`);
        if (result.obtainability.length) console.log(`      ${result.obtainability.slice(0, 3).join('; ')}`);
    }
}

if (import.meta.main) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
