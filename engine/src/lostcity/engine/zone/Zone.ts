import Packet from '#jagex2/io/Packet.js';
import Loc from '#lostcity/entity/Loc.js';
import Npc from '#lostcity/entity/Npc.js';
import Obj from '#lostcity/entity/Obj.js';
import Player from '#lostcity/entity/Player.js';
import { ServerProt, ServerProtEncoders } from '#lostcity/server/ServerProt.js';
import World from '#lostcity/engine/World.js';
import { LocShapes } from '#lostcity/engine/collision/LocShape.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import LocType from '#lostcity/cache/LocType.js';
import BlockWalk from '#lostcity/entity/BlockWalk.js';

export default class Zone {
    index = -1; // packed coord
    level = 0;

    // zone entities
    players: Set<number> = new Set(); // list of player uids
    npcs: Set<number> = new Set(); // list of npc nids (not uid because type may change)

    // locs - bits 0-2 = x (local), bits 3-5 = z (local), bits 6-7 = layer, bit 8 = static
    // loc info - bits 0-15 = type, bits 16-20 = shape, bits 21-23 = angle
    locs: Set<number> = new Set();
    locInfo: Map<number, number> = new Map();

    buffer: Packet = new Packet();
    events: Packet[] = [];
    locAdd: Set<number> = new Set();
    locDel: Set<number> = new Set();

    constructor(index: number, level: number) {
        this.index = index;
        this.level = level;
    }

    cycle() {
        // despawn

        // respawn

        // shared events (this tick)
        this.computeSharedEvents();
    }

    computeSharedEvents() {
        this.buffer = new Packet();

        for (const packed of this.locAdd) {
            const info = this.locInfo.get(packed);
            if (typeof info === 'undefined') {
                continue;
            }

            const x = packed & 0x7;
            const z = (packed >> 3) & 0x7;

            const id = info & 0xFFFF;
            const shape = (info >> 16) & 0x1F;
            const angle = (info >> 21) & 3;

            const buf = Zone.write(ServerProt.LOC_ADD_CHANGE, x, z, shape, angle, id);
            this.buffer.pdata(buf);
        }

        for (const packed of this.locDel) {
            const info = this.locInfo.get(packed);
            if (typeof info === 'undefined') {
                continue;
            }

            const x = packed & 0x7;
            const z = (packed >> 3) & 0x7;

            const shape = (info >> 16) & 0x1F;
            const angle = (info >> 21) & 3;

            const buf = Zone.write(ServerProt.LOC_DEL, x, z, shape, angle);
            this.buffer.pdata(buf);
        }

        for (const event of this.events) {
            this.buffer.pdata(event);
        }

        this.locAdd = new Set();
        this.locDel = new Set();
        this.events = [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static write(opcode: ServerProt, ...args: any[]) {
        const buf = new Packet();
        buf.p1(opcode);
        ServerProtEncoders[opcode](buf, ...args);
        return buf;
    }

    anim(x: number, z: number, spotanim: number, height: number, delay: number) {
        this.events.push(Zone.write(ServerProt.MAP_ANIM, x, z, spotanim, height, delay));
    }

    projanim(x: number, z: number, dstX: number, dstZ: number, target: number, spotanim: number, srcHeight: number, dstHeight: number, startDelay: number, endDelay: number, peak: number, arc: number) {
        this.events.push(Zone.write(ServerProt.MAP_PROJANIM, x, z, dstX, dstZ, target, spotanim, srcHeight, dstHeight, startDelay, endDelay, peak, arc));
    }

    locmerge(loc: Loc, player: Player, startCycle: number, endCycle: number, south: number, east: number, north: number, west: number) {
        this.events.push(Zone.write(ServerProt.LOC_MERGE, loc.x, loc.z, loc.shape, loc.angle, loc.type, startCycle, endCycle, player.pid, east, south, west, north));
    }

    locanim(loc: Loc, seq: number) {
        this.events.push(Zone.write(ServerProt.LOC_ANIM, loc.x, loc.z, loc.shape, loc.angle, seq));
    }

    // ----

    enter(entity: PathingEntity) {
        if (entity instanceof Player && !this.players.has(entity.uid)) {
            this.players.add(entity.uid);
        } else if (entity instanceof Npc && !this.npcs.has(entity.nid)) {
            this.npcs.add(entity.nid);

            switch (entity.blockWalk) {
                case BlockWalk.NPC:
                    World.collisionManager.changeNpcCollision(entity.width, entity.x, entity.z, entity.level, true);
                    break;
                case BlockWalk.ALL:
                    World.collisionManager.changeNpcCollision(entity.width, entity.x, entity.z, entity.level, true);
                    World.collisionManager.changePlayerCollision(entity.width, entity.x, entity.z, entity.level, true);
                    break;
            }
        }
    }

    leave(entity: PathingEntity) {
        if (entity instanceof Player) {
            this.players.delete(entity.uid);
        } else if (entity instanceof Npc) {
            this.npcs.delete(entity.nid);

            switch (entity.blockWalk) {
                case BlockWalk.NPC:
                    World.collisionManager.changeNpcCollision(entity.width, entity.x, entity.z, entity.level, false);
                    break;
                case BlockWalk.ALL:
                    World.collisionManager.changeNpcCollision(entity.width, entity.x, entity.z, entity.level, false);
                    World.collisionManager.changePlayerCollision(entity.width, entity.x, entity.z, entity.level, false);
                    break;
            }
        }
    }

    // ----

    addStaticLoc(absX: number, absZ: number, id: number, shape: number, angle: number) {
        const x = absX & 0x7;
        const z = absZ & 0x7;

        const packed = x | (z << 3) | (LocShapes.layer(shape) << 6) | (1 << 8);
        const packedInfo = id | (shape << 16) | (angle << 21);

        this.locs.add(packed);
        this.locInfo.set(packed, packedInfo);

        const type = LocType.get(id);

        if (type.blockwalk) {
            World.collisionManager.changeLocCollision(shape, angle, type.blockrange, type.length, type.width, type.active, absX, absZ, this.level, true);
        }
    }

    addLoc(absX: number, absZ: number, id: number, shape: number, angle: number, duration: number) {
        const x = absX & 0x7;
        const z = absZ & 0x7;

        const packed = x | (z << 3) | (LocShapes.layer(shape) << 6);
        const packedInfo = id | (shape << 16) | (angle << 21);

        this.locs.add(packed);
        this.locInfo.set(packed, packedInfo);

        const type = LocType.get(id);

        if (type.blockwalk) {
            World.collisionManager.changeLocCollision(shape, angle, type.blockrange, type.length, type.width, type.active, absX, absZ, this.level, true);
        }

        if (this.locDel.has(packed)) {
            this.locDel.delete(packed);
        }

        this.locAdd.add(packed);
    }

    removeLoc(absX: number, absZ: number, shape: number, duration: number) {
        const x = absX & 0x7;
        const z = absZ & 0x7;

        // delete dynamic loc if it exists
        const packed = x | (z << 3) | (LocShapes.layer(shape) << 6);
        const info = this.locInfo.get(packed);
        if (this.locs.has(packed) && typeof info !== 'undefined') {
            this.locs.delete(packed);
            this.locInfo.delete(packed);

            const type = LocType.get(info & 0xFFFF);
            const angle = (info >> 21) & 3;

            if (type.blockwalk) {
                World.collisionManager.changeLocCollision(shape, angle, type.blockrange, type.length, type.width, type.active, absX, absZ, this.level, false);
            }
        }

        // (temporarily) delete static loc if it exists
        const staticPacked = packed | (1 << 8);
        const staticInfo = this.locInfo.get(staticPacked);
        if (this.locs.has(staticPacked) && typeof staticInfo !== 'undefined') {
            const type = LocType.get(staticInfo & 0xFFFF);
            const angle = (staticInfo >> 21) & 3;

            if (type.blockwalk) {
                World.collisionManager.changeLocCollision(shape, angle, type.blockrange, type.length, type.width, type.active, absX, absZ, this.level, false);
            }
        }

        if (this.locAdd.has(packed)) {
            this.locAdd.delete(packed);
        }

        this.locDel.add(packed);
    }

    getLoc(absX: number, absZ: number, layer: number): Loc | null {
        const x = absX & 0x7;
        const z = absZ & 0x7;

        // dynamic loc on the same layer takes precedence over static loc
        const packed = x | (z << 3) | (layer << 6);
        const info = this.locInfo.get(packed);

        if (this.locs.has(packed) && typeof info !== 'undefined') {
            const id = info & 0xFFFF;
            const shape = (info >> 16) & 0x1F;
            const angle = (info >> 21) & 3;

            // legacy code compatibility
            const type = LocType.get(id);
            return new Loc(this.level, absX, absZ, type.width, type.length, id, shape, angle);
        }

        // static loc
        const staticPacked = packed | (1 << 8);
        const staticInfo = this.locInfo.get(staticPacked);

        if (this.locs.has(staticPacked) && typeof staticInfo !== 'undefined') {
            const id = staticInfo & 0xFFFF;
            const shape = (staticInfo >> 16) & 0x1F;
            const angle = (staticInfo >> 21) & 3;

            // legacy code compatibility
            const type = LocType.get(id);
            return new Loc(this.level, absX, absZ, type.width, type.length, id, shape, angle);
        }

        return null;
    }

    // ----

    addStaticObj(obj: Obj) {
    }

    addObj(obj: Obj, receiver: Player | null, duration: number) {
    }

    removeObj(obj: Obj, receiver: Player | null, subtractTick: number = 0) {
    }

    getObj(x: number, z: number, type: number): Obj | null {
        return null;
    }
}
