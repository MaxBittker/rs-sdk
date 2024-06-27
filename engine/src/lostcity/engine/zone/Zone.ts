import ObjType from '#lostcity/cache/config/ObjType.js';

import Loc from '#lostcity/entity/Loc.js';
import Npc from '#lostcity/entity/Npc.js';
import Obj from '#lostcity/entity/Obj.js';
import Player from '#lostcity/entity/Player.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';
import {Position} from '#lostcity/entity/Position.js';

import World from '#lostcity/engine/World.js';
import ZoneMap from '#lostcity/engine/zone/ZoneMap.js';
import ZoneEvent from '#lostcity/engine/zone/ZoneEvent.js';
import ZoneEventType from '#lostcity/engine/zone/ZoneEventType.js';

import UpdateZonePartialEnclosed from '#lostcity/network/outgoing/model/UpdateZonePartialEnclosed.js';
import UpdateZoneFullFollows from '#lostcity/network/outgoing/model/UpdateZoneFullFollows.js';
import UpdateZonePartialFollows from '#lostcity/network/outgoing/model/UpdateZonePartialFollows.js';
import ObjAdd from '#lostcity/network/outgoing/model/ObjAdd.js';
import LocAddChange from '#lostcity/network/outgoing/model/LocAddChange.js';
import LocDel from '#lostcity/network/outgoing/model/LocDel.js';
import MapProjAnim from '#lostcity/network/outgoing/model/MapProjAnim.js';
import MapAnim from '#lostcity/network/outgoing/model/MapAnim.js';
import ObjDel from '#lostcity/network/outgoing/model/ObjDel.js';
import ObjCount from '#lostcity/network/outgoing/model/ObjCount.js';
import ObjReveal from '#lostcity/network/outgoing/model/ObjReveal.js';
import LocAnim from '#lostcity/network/outgoing/model/LocAnim.js';
import LocMerge from '#lostcity/network/outgoing/model/LocMerge.js';
import ServerProtRepository from '#lostcity/network/225/outgoing/prot/ServerProtRepository.js';
import ZoneMessageEncoder from '#lostcity/network/outgoing/codec/ZoneMessageEncoder.js';
import ZoneMessage from '#lostcity/network/outgoing/ZoneMessage.js';

export default class Zone {
    readonly index: number; // packed coord
    readonly x: number;
    readonly z: number;
    readonly level: number;

    // zone entities
    private readonly players: Set<number> = new Set(); // list of player uids
    private readonly npcs: Set<number> = new Set(); // list of npc nids (not uid because type may change)
    private readonly locs: (Loc[] | null)[] = [];
    private readonly objs: (Obj[] | null)[] = [];

    // zone events
    private readonly events: Set<ZoneEvent> = new Set();
    private shared: Uint8Array | null = null;

    constructor(index: number) {
        this.index = index;
        const coord: Position = ZoneMap.unpackIndex(index);
        this.x = coord.x >> 3;
        this.z = coord.z >> 3;
        this.level = coord.level;
    }

    enter(entity: PathingEntity): void {
        if (entity instanceof Player) {
            this.players.add(entity.uid);
            World.getZoneGrid(this.level).flag(this.x, this.z);
        } else if (entity instanceof Npc) {
            this.npcs.add(entity.nid);
        }
    }

    leave(entity: PathingEntity): void {
        if (entity instanceof Player) {
            this.players.delete(entity.uid);
            if (this.players.size === 0) {
                World.getZoneGrid(this.level).unflag(this.x, this.z);
            }
        } else if (entity instanceof Npc) {
            this.npcs.delete(entity.nid);
        }
    }

    tick(tick: number): void {
        let updated: boolean;
        do {
            updated = false;
            for (const obj of this.getAllObjsUnsafe()) {
                if (!obj.updateLifeCycle(tick) || obj.lastLifecycleTick === tick) {
                    continue;
                }
                if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
                    if (obj.receiverId !== -1) {
                        World.revealObj(obj);
                    } else {
                        World.removeObj(obj, 0);
                        updated = true;
                    }
                } else if (obj.lifecycle === EntityLifeCycle.RESPAWN) {
                    World.addObj(obj, -1, 0);
                    updated = true;
                }
            }
            for (const loc of this.getAllLocsUnsafe()) {
                if (!loc.updateLifeCycle(tick) || loc.lastLifecycleTick === tick) {
                    continue;
                }
                if (loc.lifecycle === EntityLifeCycle.DESPAWN) {
                    World.removeLoc(loc, 0);
                    updated = true;
                } else if (loc.lifecycle === EntityLifeCycle.RESPAWN) {
                    World.addLoc(loc, 0);
                    updated = true;
                }
            }
        } while (updated);
    }

    computeShared(): void {
        this.shared = null;

        let length: number = 0;
        const enclosed: Uint8Array[] = [];
        for (const event of this.events.values()) {
            if (event.type !== ZoneEventType.ENCLOSED) {
                continue;
            }
            const encoder: ZoneMessageEncoder<ZoneMessage> | undefined = ServerProtRepository.getZoneEncoder(event.message);
            if (typeof encoder === 'undefined') {
                continue;
            }
            const bytes: Uint8Array = encoder.enclose(event.message);
            enclosed.push(bytes);
            length += bytes.length;
        }

        if (enclosed.length === 0 || length === 0) {
            return;
        }

        const shared: Uint8Array = new Uint8Array(length);
        let ptr: number = 0;
        for (const bytes of enclosed) {
            shared.set(bytes, ptr);
            ptr += bytes.length;
        }

        this.shared = shared;
    }

    writeFullFollows(player: Player): void {
        // full update necessary to clear client zone memory
        player.write(new UpdateZoneFullFollows(this.x, this.z, player.originX, player.originZ));
        for (const obj of this.getAllObjsUnsafe(true)) {
            if (obj.receiverId !== -1 && obj.receiverId !== player.pid) {
                continue;
            }
            player.write(new UpdateZonePartialFollows(this.x, this.z, player.originX, player.originZ));
            if (obj.lifecycle === EntityLifeCycle.DESPAWN && obj.checkLifeCycle(World.currentTick)) {
                player.write(new ObjAdd(Position.packZoneCoord(obj.x, obj.z), obj.type, obj.count));
            } else if (obj.lifecycle === EntityLifeCycle.RESPAWN && obj.checkLifeCycle(World.currentTick)) {
                player.write(new ObjAdd(Position.packZoneCoord(obj.x, obj.z), obj.type, obj.count));
            }
        }
        for (const loc of this.getAllLocsUnsafe(true)) {
            if (loc.lifecycle === EntityLifeCycle.DESPAWN && loc.checkLifeCycle(World.currentTick)) {
                player.write(new LocAddChange(Position.packZoneCoord(loc.x, loc.z), loc.type, loc.shape, loc.angle));
            } else if (loc.lifecycle === EntityLifeCycle.RESPAWN && !loc.checkLifeCycle(World.currentTick)) {
                player.write(new LocDel(Position.packZoneCoord(loc.x, loc.z), loc.shape, loc.angle));
            }
        }
    }

    writePartialEncloses(player: Player): void {
        if (!this.shared) {
            return;
        }
        player.write(new UpdateZonePartialEnclosed(this.x, this.z, player.originX, player.originZ, this.shared));
    }

    writePartialFollows(player: Player): void {
        if (this.events.size === 0) {
            return;
        }
        player.write(new UpdateZonePartialFollows(this.x, this.z, player.originX, player.originZ));
        for (const event of this.events) {
            if (event.type !== ZoneEventType.FOLLOWS) {
                continue;
            }
            if (event.receiverId !== -1 && event.receiverId !== player.pid) {
                continue;
            }
            player.write(event.message);
        }
    }

    reset(): void {
        this.events.clear();
    }

    // ---- static locs/objs are added during world init ----

    addStaticLoc(loc: Loc): void {
        const coord: number = Position.packZoneCoord(loc.x, loc.z);
        const locs: Loc[] | null = this.locs[coord];
        if (!locs) {
            this.locs[coord] = [];
        }
        this.locs[coord]?.push(loc);
        this.sortLocs(coord);
    }

    addStaticObj(obj: Obj): void {
        const coord: number = Position.packZoneCoord(obj.x, obj.z);
        const objs: Obj[] | null = this.objs[coord];
        if (!objs) {
            this.objs[coord] = [];
        }
        this.objs[coord]?.push(obj);
        this.sortObjs(coord);
    }

    // ----

    addLoc(loc: Loc): void {
        const coord: number = Position.packZoneCoord(loc.x, loc.z);
        if (loc.lifecycle === EntityLifeCycle.DESPAWN) {
            const locs: Loc[] | null = this.locs[coord];
            if (!locs) {
                this.locs[coord] = [];
            }
            this.locs[coord]?.push(loc);
        }
        this.sortLocs(coord);

        this.events.add({
            type: ZoneEventType.ENCLOSED,
            receiverId: -1,
            message: new LocAddChange(coord, loc.type, loc.shape, loc.angle)
        });
    }

    removeLoc(loc: Loc): void {
        const coord: number = Position.packZoneCoord(loc.x, loc.z);
        if (loc.lifecycle === EntityLifeCycle.DESPAWN) {
            const locs: Loc[] | null = this.locs[coord];
            if (locs) {
                for (let index: number = 0; index < locs.length; index++) {
                    if (loc === locs[index]) {
                        locs.splice(index, 1);
                        break;
                    }
                }
            }
        }
        this.sortLocs(coord);

        this.events.add({
            type: ZoneEventType.ENCLOSED,
            receiverId: -1,
            message: new LocDel(coord, loc.shape, loc.angle)
        });
    }

    getLoc(x: number, z: number, type: number): Loc | null {
        for (const loc of this.getLocsSafe(Position.packZoneCoord(x, z))) {
            if (loc.type === type) {
                return loc;
            }
        }
        return null;
    }

    mergeLoc(loc: Loc, player: Player, startCycle: number, endCycle: number, south: number, east: number, north: number, west: number): void {
        this.events.add({
            type: ZoneEventType.ENCLOSED,
            receiverId: -1,
            message: new LocMerge(loc.x, loc.z, loc.shape, loc.angle, loc.type, startCycle, endCycle, player.pid, east, south, west, north)
        });
    }

    animLoc(loc: Loc, seq: number): void {
        this.events.add({
            type: ZoneEventType.ENCLOSED,
            receiverId: -1,
            message: new LocAnim(Position.packZoneCoord(loc.x, loc.z), loc.shape, loc.angle, seq)
        });
    }

    // ----

    addObj(obj: Obj, receiverId: number): void {
        const coord: number = Position.packZoneCoord(obj.x, obj.z);
        if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
            const objs: Obj[] | null = this.objs[coord];
            if (!objs) {
                this.objs[coord] = [];
            }
            this.objs[coord]?.push(obj);
        }
        this.sortObjs(coord);

        if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
            this.events.add({
                type: ZoneEventType.FOLLOWS,
                receiverId: receiverId,
                message: new ObjAdd(coord, obj.type, obj.count)
            });
        } else if (obj.lifecycle === EntityLifeCycle.RESPAWN) {
            this.events.add({
                type: ZoneEventType.ENCLOSED,
                receiverId: receiverId,
                message: new ObjAdd(coord, obj.type, obj.count)
            });
        }
    }

    revealObj(obj: Obj, receiverId: number): void {
        const coord: number = Position.packZoneCoord(obj.x, obj.z);
        obj.receiverId = -1;
        obj.reveal = -1;
        this.sortObjs(coord);

        this.events.add({
            type: ZoneEventType.ENCLOSED,
            receiverId: -1,
            message: new ObjReveal(coord, obj.type, obj.count, receiverId)
        });
    }

    changeObj(obj: Obj, receiverId: number, oldCount: number, newCount: number): void {
        const coord: number = Position.packZoneCoord(obj.x, obj.z);
        obj.count = newCount;
        this.sortObjs(coord);

        this.events.add({
            type: ZoneEventType.FOLLOWS,
            receiverId: receiverId,
            message: new ObjCount(coord, obj.type, oldCount, newCount)
        });
    }

    removeObj(obj: Obj): void {
        const coord: number = Position.packZoneCoord(obj.x, obj.z);
        if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
            const objs: Obj[] | null = this.objs[coord];
            if (objs) {
                for (let index: number = 0; index < objs.length; index++) {
                    if (obj === objs[index]) {
                        objs.splice(index, 1);
                        break;
                    }
                }
            }
        }
        this.sortObjs(coord);

        if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
            this.events.add({
                type: ZoneEventType.FOLLOWS,
                receiverId: -1,
                message: new ObjDel(coord, obj.type)
            });
        } else if (obj.lifecycle === EntityLifeCycle.RESPAWN) {
            this.events.add({
                type: ZoneEventType.ENCLOSED,
                receiverId: -1,
                message: new ObjDel(coord, obj.type)
            });
        }
    }

    // ---- not tied to any entities ----

    animMap(x: number, z: number, spotanim: number, height: number, delay: number): void {
        this.events.add({
            type: ZoneEventType.ENCLOSED,
            receiverId: -1,
            message: new MapAnim(Position.packZoneCoord(x, z), spotanim, height, delay)
        });
    }

    mapProjAnim(x: number, z: number, dstX: number, dstZ: number, target: number, spotanim: number, srcHeight: number, dstHeight: number, startDelay: number, endDelay: number, peak: number, arc: number): void {
        this.events.add({
            type: ZoneEventType.ENCLOSED,
            receiverId: -1,
            message: new MapProjAnim(x, z, dstX, dstZ, target, spotanim, srcHeight, dstHeight, startDelay, endDelay, peak, arc)
        });
    }

    getObj(x: number, z: number, type: number, receiverId: number): Obj | null {
        for (const obj of this.getObjsSafe(Position.packZoneCoord(x, z))) {
            if ((obj.receiverId !== -1 && obj.receiverId !== receiverId) || obj.type !== type) {
                continue;
            }
            return obj;
        }
        return null;
    }

    *getAllPlayersSafe(): IterableIterator<Player> {
        for (const uid of this.players) {
            const player: Player | null = World.getPlayerByUid(uid);
            if (player && player.checkLifeCycle(World.currentTick)) {
                yield player;
            }
        }
    }

    *getAllNpcsSafe(): IterableIterator<Npc> {
        for (const nid of this.npcs) {
            const npc: Npc | null = World.getNpc(nid);
            if (npc && npc.checkLifeCycle(World.currentTick)) {
                yield npc;
            }
        }
    }

    *getAllObjsSafe(): IterableIterator<Obj> {
        for (let index: number = 0; index < this.objs.length; index++) {
            const objs: Obj[] | null = this.objs[index];
            if (objs) {
                for (let i: number = 0; i < objs.length; i++) {
                    const obj: Obj = objs[i];
                    if (obj.checkLifeCycle(World.currentTick)) {
                        yield obj;
                    }
                }
            }
        }
    }

    *getObjsSafe(coord: number): IterableIterator<Obj> {
        const objs: Obj[] | null = this.objs[coord];
        if (objs) {
            for (let i: number = 0; i < objs.length; i++) {
                const obj: Obj = objs[i];
                if (obj.checkLifeCycle(World.currentTick)) {
                    yield obj;
                }
            }
        }
    }

    *getObjsUnsafe(coord: number): IterableIterator<Obj> {
        const objs: Obj[] | null = this.objs[coord];
        if (objs) {
            for (let i: number = 0; i < objs.length; i++) {
                yield objs[i];
            }
        }
    }

    *getAllObjsUnsafe(reverse: boolean = false): IterableIterator<Obj> {
        for (let index: number = 0; index < this.objs.length; index++) {
            const objs: Obj[] | null = this.objs[index];
            if (objs) {
                if (reverse) {
                    for (let i: number = objs.length - 1; i >= 0; i--) {
                        yield objs[i];
                    }
                } else {
                    for (let i: number = 0; i < objs.length; i++) {
                        yield objs[i];
                    }
                }
            }
        }
    }

    *getAllLocsSafe(): IterableIterator<Loc> {
        for (let index: number = 0; index < this.locs.length; index++) {
            const locs: Loc[] | null = this.locs[index];
            if (locs) {
                for (let i: number = 0; i < locs.length; i++) {
                    const loc: Loc = locs[i];
                    if (loc.checkLifeCycle(World.currentTick)) {
                        yield loc;
                    }
                }
            }
        }
    }

    *getLocsSafe(coord: number): IterableIterator<Loc> {
        const locs: Loc[] | null = this.locs[coord];
        if (locs) {
            for (let i: number = 0; i < locs.length; i++) {
                const loc: Loc = locs[i];
                if (loc.checkLifeCycle(World.currentTick)) {
                    yield loc;
                }
            }
        }
    }

    *getLocsUnsafe(coord: number): IterableIterator<Loc> {
        const locs: Loc[] | null = this.locs[coord];
        if (locs) {
            for (let i: number = 0; i < locs.length; i++) {
                yield locs[i];
            }
        }
    }

    *getAllLocsUnsafe(reverse: boolean = false): IterableIterator<Loc> {
        for (let index: number = 0; index < this.locs.length; index++) {
            const locs: Loc[] | null = this.locs[index];
            if (locs) {
                if (reverse) {
                    for (let i: number = locs.length - 1; i >= 0; i--) {
                        yield locs[i];
                    }
                } else {
                    for (let i: number = 0; i < locs.length; i++) {
                        yield locs[i];
                    }
                }
            }
        }
    }

    private sortObjs(coord: number): void {
        const objs: Obj[] | null = this.objs[coord];
        if (!objs) {
            return;
        }

        let topCost: number = -99999999;
        let topObj: Obj | null = null;

        for (const obj of objs) {
            const type: ObjType = ObjType.get(obj.type);
            let cost: number = type.cost;

            if (type.stackable) {
                cost *= obj.count + 1;
            }

            cost += obj.lifecycle;

            if (cost > topCost) {
                topCost = cost;
                topObj = obj;
            }
        }

        if (!topObj) {
            return;
        }

        if (objs[0] !== topObj) {
            objs.splice(objs.indexOf(topObj), 1);
            objs.unshift(topObj);
        }
    }

    private sortLocs(coord: number): void {
        const locs: Loc[] | null = this.locs[coord];
        if (!locs) {
            return;
        }

        let topCost: number = -99999999;
        let topLoc: Loc | null = null;

        for (const loc of locs) {
            const cost: number = loc.lifecycle;
            if (cost > topCost) {
                topCost = cost;
                topLoc = loc;
            }
        }

        if (!topLoc) {
            return;
        }

        if (locs[0] !== topLoc) {
            locs.splice(locs.indexOf(topLoc), 1);
            locs.unshift(topLoc);
        }
    }
}
