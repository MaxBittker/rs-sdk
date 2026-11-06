/**
 * Map square -> area name, derived from the world map's own place labels
 * (server/content/maps/labels.txt, the file the world map packer reads).
 *
 * A map square is 64x64 tiles; m{X}_{Z} covers x = X*64..X*64+63 and
 * z = Z*64..Z*64+63. Underground areas sit 6400 tiles north of the surface
 * they belong to, so they are named after the surface square above them.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export interface MapLabel {
    name: string;
    x: number;
    z: number;
    /** 0 = landmark, 1 = town, 2 = region (kingdom, island). */
    size: number;
}

const UNDERGROUND_OFFSET = 6400;
/**
 * A town label sits near the town's middle, often across a square edge from
 * most of the town (Draynor Village's is 4 tiles north of m48_50), so a town
 * this close to a square's centre names it before any landmark does.
 */
const MAX_TOWN_DISTANCE = 48;
/** Otherwise the nearest label this close to the centre names the square. */
const MAX_PLACE_DISTANCE = 64;
/** A region label (e.g. "Wilderness") further than this doesn't name it either. */
const MAX_REGION_DISTANCE = 256;

export function parseMapLabels(text: string): MapLabel[] {
    const labels: MapLabel[] = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('=')) continue;
        const [name, x, z, size] = line.substring(1).split(',');
        if (!name || x === undefined || z === undefined) continue;
        labels.push({
            // A "/" is a line break on the world map.
            name: name.split('/').map(s => s.trim()).filter(Boolean).join(' '),
            x: parseInt(x),
            z: parseInt(z),
            size: parseInt(size ?? '0') || 0,
        });
    }
    return labels;
}

export function loadMapLabels(contentDir: string): MapLabel[] {
    return parseMapLabels(readFileSync(join(contentDir, 'maps', 'labels.txt'), 'ascii'));
}

function nearest(labels: MapLabel[], x: number, z: number, maxDistance: number): MapLabel | null {
    let best: MapLabel | null = null;
    let bestDistance = Infinity;
    for (const label of labels) {
        const distance = Math.hypot(label.x - x, label.z - z);
        if (distance <= maxDistance && distance < bestDistance) {
            best = label;
            bestDistance = distance;
        }
    }
    return best;
}

/**
 * Name a map square after the world map label that best describes it: a
 * nearby town, else the nearest label of any kind (landmark, town, island or
 * kingdom), else a distant region label such as "Wilderness". Falls back to
 * the square id ("m50_50") when nothing is close.
 */
export function areaForMapSquare(labels: MapLabel[], mapX: number, mapZ: number): string {
    let surfaceZ = mapZ;
    let suffix = '';
    if (mapZ * 64 >= UNDERGROUND_OFFSET) {
        surfaceZ = mapZ - UNDERGROUND_OFFSET / 64;
        suffix = ' (underground)';
    }

    const centreX = mapX * 64 + 32;
    const centreZ = surfaceZ * 64 + 32;

    const label =
        nearest(labels.filter(l => l.size === 1), centreX, centreZ, MAX_TOWN_DISTANCE) ??
        nearest(labels, centreX, centreZ, MAX_PLACE_DISTANCE) ??
        nearest(labels.filter(l => l.size === 2), centreX, centreZ, MAX_REGION_DISTANCE);

    return label ? label.name + suffix : `m${mapX}_${mapZ}`;
}

/** Area names for "m{X}_{Z}" keys, computed once per run. */
export function createMapSquareAreaLookup(contentDir: string): (mapSquare: string) => string {
    const labels = loadMapLabels(contentDir);
    const cache = new Map<string, string>();
    return (mapSquare: string): string => {
        let area = cache.get(mapSquare);
        if (area === undefined) {
            const match = mapSquare.match(/^m(\d+)_(\d+)$/);
            area = match ? areaForMapSquare(labels, parseInt(match[1]), parseInt(match[2])) : mapSquare;
            cache.set(mapSquare, area);
        }
        return area;
    };
}
