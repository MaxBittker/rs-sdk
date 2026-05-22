import { CoordGrid } from './coord.js';
import { ZoneMap } from './grid.js';
import type { Npc } from './npc.js';
import type { Player } from './player.js';

export class IdBitSet {
    private readonly bits: Int32Array;
    private readonly ids: number[];

    constructor(length: number, capacity: number) {
        this.bits = new Int32Array(length / 32);
        this.ids = new Array<number>(0);
        void capacity;
    }

    contains(id: number): boolean {
        return (this.bits[id >> 5] & (1 << (id & 0x1f))) !== 0;
    }

    insert(id: number): void {
        if (this.contains(id)) {
            return;
        }
        this.bits[id >> 5] |= 1 << (id & 0x1f);
        this.ids.push(id);
    }

    remove(id: number): void {
        if (!this.contains(id)) {
            return;
        }
        this.bits[id >> 5] &= ~(1 << (id & 0x1f));
        const index = this.ids.indexOf(id);
        if (index !== -1) {
            this.ids.splice(index, 1);
        }
    }

    len(): number {
        return this.ids.length;
    }

    iter(): number[] {
        return this.ids.slice();
    }

    clear(): void {
        this.bits.fill(0);
        this.ids.length = 0;
    }
}

export class BuildArea {
    static readonly INTERVAL = 10;
    static readonly PREFERRED_PLAYERS = 250;
    static readonly PREFERRED_NPCS = 255;
    static readonly PREFERRED_VIEW_DISTANCE = 15;

    readonly players = new IdBitSet(2048, BuildArea.PREFERRED_PLAYERS);
    readonly npcs = new IdBitSet(16384, BuildArea.PREFERRED_NPCS);
    private readonly appearances = new Uint32Array(2048);
    forceViewDistance = false;
    viewDistance = BuildArea.PREFERRED_VIEW_DISTANCE;
    lastResize = 0;

    cleanup(): void {
        this.players.clear();
        this.npcs.clear();
        this.appearances.fill(0);
    }

    resize(): void {
        if (this.forceViewDistance) {
            return;
        }

        if (this.players.len() >= BuildArea.PREFERRED_PLAYERS) {
            if (this.viewDistance > 1) {
                this.viewDistance--;
            }
            this.lastResize = 0;
            return;
        }

        this.lastResize++;
        if (this.lastResize >= BuildArea.INTERVAL) {
            if (this.viewDistance < BuildArea.PREFERRED_VIEW_DISTANCE) {
                this.viewDistance++;
            } else {
                this.lastResize = 0;
            }
        }
    }

    rebuildNpcs(): void {
        this.npcs.clear();
    }

    rebuildPlayers(players: Array<Player | null>, grid: Map<number, number[]>, pid: number, x: number, y: number, z: number): void {
        this.players.clear();
        this.lastResize = 0;
        this.viewDistance = BuildArea.PREFERRED_VIEW_DISTANCE;

        let count = 0;
        let decrement = false;
        for (const _player of this.getNearbyPlayersNearest(players, grid, pid, x, y, z)) {
            count++;
            if (count >= BuildArea.PREFERRED_PLAYERS) {
                decrement = true;
                break;
            }
        }

        if (decrement) {
            this.viewDistance--;
        }
    }

    hasAppearance(pid: number, tick: number): boolean {
        return this.appearances[pid] === tick >>> 0;
    }

    saveAppearance(pid: number, tick: number): void {
        this.appearances[pid] = tick >>> 0;
    }

    getNearbyPlayers(players: Array<Player | null>, grid: Map<number, number[]>, map: ZoneMap, pid: number, x: number, y: number, z: number): number[] {
        if (this.viewDistance < BuildArea.PREFERRED_VIEW_DISTANCE) {
            return this.getNearbyPlayersNearest(players, grid, pid, x, y, z);
        }
        return this.getNearbyPlayersZones(players, map, pid, x, y, z);
    }

    getNearbyPlayersZones(players: Array<Player | null>, map: ZoneMap, pid: number, x: number, y: number, z: number): number[] {
        const distance = this.viewDistance;
        const startX = Math.max(x - distance, 0) >> 3;
        const startZ = Math.max(z - distance, 0) >> 3;
        const endX = Math.min(x + distance, 0xffff) >> 3;
        const endZ = Math.min(z + distance, 0xffff) >> 3;

        const count = this.players.len();
        const nearby: number[] = [];

        for (let zx = startX; zx <= endX; zx++) {
            const zoneX = zx << 3;
            for (let zz = startZ; zz <= endZ; zz++) {
                if (nearby.length + count >= BuildArea.PREFERRED_PLAYERS) {
                    return nearby;
                }

                const zoneZ = zz << 3;
                for (const player of map.zone(zoneX, y, zoneZ).players) {
                    if (nearby.length >= BuildArea.PREFERRED_PLAYERS - count) {
                        return nearby;
                    }
                    if (this.filterPlayer(players, player, pid, x, y, z)) {
                        nearby.push(player);
                    }
                }
            }
        }

        return nearby;
    }

    getNearbyPlayersNearest(players: Array<Player | null>, grid: Map<number, number[]>, pid: number, x: number, y: number, z: number): number[] {
        const radius = this.viewDistance * 2;
        const min = -(radius >> 1);
        const max = radius >> 1;
        const length = radius ** 2;

        let dx = 0;
        let dz = 0;
        let ldx = 0;
        let ldz = -1;

        const count = this.players.len();
        const nearby: number[] = [];

        for (let index = 1; index <= length; index++) {
            if (nearby.length + count >= BuildArea.PREFERRED_PLAYERS) {
                return nearby;
            }

            if (min < dx && dx <= max && min < dz && dz <= max) {
                const set = grid.get(CoordGrid.from(x + dx, y, z + dz).packed);
                if (set) {
                    for (const player of set) {
                        if (nearby.length >= BuildArea.PREFERRED_PLAYERS - count) {
                            return nearby;
                        }
                        if (this.filterPlayer(players, player, pid, x, y, z)) {
                            nearby.push(player);
                        }
                    }
                }
            }

            if (dx === dz || (dx < 0 && dx === -dz) || (dx > 0 && dx === 1 - dz)) {
                const nextLdx = -ldz;
                ldz = ldx;
                ldx = nextLdx;
            }

            dx += ldx;
            dz += ldz;
        }

        return nearby;
    }

    getNearbyNpcs(npcs: Array<Npc | null>, map: ZoneMap, x: number, y: number, z: number): number[] {
        const distance = BuildArea.PREFERRED_VIEW_DISTANCE;
        const startX = Math.max(x - distance, 0) >> 3;
        const startZ = Math.max(z - distance, 0) >> 3;
        const endX = Math.min(x + distance, 0xffff) >> 3;
        const endZ = Math.min(z + distance, 0xffff) >> 3;

        const count = this.npcs.len();
        const nearby: number[] = [];

        for (let zx = startX; zx <= endX; zx++) {
            const zoneX = zx << 3;
            for (let zz = startZ; zz <= endZ; zz++) {
                if (nearby.length + count >= BuildArea.PREFERRED_NPCS) {
                    return nearby;
                }

                const zoneZ = zz << 3;
                for (const npc of map.zone(zoneX, y, zoneZ).npcs) {
                    if (nearby.length >= BuildArea.PREFERRED_NPCS - count) {
                        return nearby;
                    }
                    if (this.filterNpc(npcs, npc, x, y, z)) {
                        nearby.push(npc);
                    }
                }
            }
        }

        return nearby;
    }

    private filterPlayer(players: Array<Player | null>, playerId: number, pid: number, x: number, y: number, z: number): boolean {
        const other = players[playerId];
        if (!other) {
            return false;
        }

        return !(this.players.contains(playerId) || !CoordGrid.withinDistanceSw(other.coord, CoordGrid.from(x, y, z), this.viewDistance) || other.pid === -1 || other.pid === pid || other.coord.y() !== y);
    }

    private filterNpc(npcs: Array<Npc | null>, npcId: number, x: number, y: number, z: number): boolean {
        const other = npcs[npcId];
        if (!other) {
            return false;
        }

        return !(this.npcs.contains(npcId) || !CoordGrid.withinDistanceSw(other.coord, CoordGrid.from(x, y, z), BuildArea.PREFERRED_VIEW_DISTANCE) || other.nid === -1 || other.coord.y() !== y || !other.active);
    }
}
