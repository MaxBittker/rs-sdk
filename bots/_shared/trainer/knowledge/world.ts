/**
 * Runtime world knowledge — loads compiled world-index.json (never raw wiki md).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { WorldPoint } from '../types';

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
    points: WorldPoint[];
}

export interface WorldObstacle {
    id: string;
    kind: 'toll_gate' | 'gate';
    point: WorldPoint;
    eastOfX?: number;
    notes?: string;
}

export interface WorldIndex {
    generatedAt: string;
    npcCount: number;
    shopCount: number;
    npcs: WorldNpc[];
    shops: WorldShop[];
    obstacles: WorldObstacle[];
}

const INDEX_PATH = join(import.meta.dir, '../data/world-index.json');

let cached: WorldIndex | null = null;

export function loadWorldIndex(): WorldIndex {
    if (cached) return cached;
    if (!existsSync(INDEX_PATH)) {
        cached = {
            generatedAt: '',
            npcCount: 0,
            shopCount: 0,
            npcs: [],
            shops: [],
            obstacles: [
                {
                    id: 'alkharid_toll',
                    kind: 'toll_gate',
                    point: { x: 3268, z: 3228, label: 'Al Kharid toll gate' },
                    eastOfX: 3268,
                },
            ],
        };
        return cached;
    }
    cached = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as WorldIndex;
    return cached;
}

export function distanceSq(a: { x: number; z: number }, b: { x: number; z: number }): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz;
}

export function isEastOfAlKharidGate(point: { x: number }): boolean {
    const toll = loadWorldIndex().obstacles.find((o) => o.id === 'alkharid_toll');
    return point.x > (toll?.eastOfX ?? 3268);
}

export interface NearestOpts {
    westOfGateOnly?: boolean;
}

function filterPoints(points: WorldPoint[], opts?: NearestOpts): WorldPoint[] {
    if (!opts?.westOfGateOnly) return points;
    return points.filter((p) => !isEastOfAlKharidGate(p));
}

export function nearestNpc(
    namePattern: RegExp | string,
    from: { x: number; z: number },
    opts?: NearestOpts,
): { npc: WorldNpc; point: WorldPoint; distSq: number } | null {
    const re = typeof namePattern === 'string' ? new RegExp(namePattern, 'i') : namePattern;
    let best: { npc: WorldNpc; point: WorldPoint; distSq: number } | null = null;
    for (const npc of loadWorldIndex().npcs) {
        if (!re.test(npc.name) && !re.test(npc.id)) continue;
        for (const point of filterPoints(npc.points, opts)) {
            const d = distanceSq(from, point);
            if (!best || d < best.distSq) best = { npc, point, distSq: d };
        }
    }
    return best;
}

export function nearestShop(
    itemPattern: RegExp | string,
    from: { x: number; z: number },
    opts?: NearestOpts,
): { shop: WorldShop; point: WorldPoint; stockItem: string; distSq: number } | null {
    const re = typeof itemPattern === 'string' ? new RegExp(itemPattern, 'i') : itemPattern;
    let best: { shop: WorldShop; point: WorldPoint; stockItem: string; distSq: number } | null = null;
    for (const shop of loadWorldIndex().shops) {
        const stockItem = shop.stock.find((s) => re.test(s));
        if (!stockItem) continue;
        for (const point of filterPoints(shop.points, opts)) {
            const d = distanceSq(from, point);
            if (!best || d < best.distSq) best = { shop, point, stockItem, distSq: d };
        }
    }
    return best;
}
