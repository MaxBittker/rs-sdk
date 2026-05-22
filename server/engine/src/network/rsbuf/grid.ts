export class Zone {
    readonly players = new Set<number>();
    readonly npcs = new Set<number>();

    addPlayer(player: number): void {
        this.players.add(player);
    }

    removePlayer(player: number): void {
        this.players.delete(player);
    }

    addNpc(npc: number): void {
        this.npcs.add(npc);
    }

    removeNpc(npc: number): void {
        this.npcs.delete(npc);
    }
}

export class ZoneMap {
    readonly zones = new Map<number, Zone>();

    static zoneIndex(x: number, y: number, z: number): number {
        return (((x >> 3) & 0x7ff) | (((z >> 3) & 0x7ff) << 11) | ((y & 0x3) << 22)) >>> 0;
    }

    static unpackIndex(index: number): [number, number, number] {
        const x = (index & 0x7ff) << 3;
        const z = ((index >>> 11) & 0x7ff) << 3;
        const y = index >>> 22;
        return [x, y, z];
    }

    zone(x: number, y: number, z: number): Zone {
        const index = ZoneMap.zoneIndex(x, y, z);
        let zone = this.zones.get(index);
        if (!zone) {
            zone = new Zone();
            this.zones.set(index, zone);
        }
        return zone;
    }
}
