import Loc from '#/engine/entity/Loc.js';
import Npc from '#/engine/entity/Npc.js';
import Obj from '#/engine/entity/Obj.js';
import Player from '#/engine/entity/Player.js';
import PathingEntity from '#/engine/entity/PathingEntity.js';
import EntityLifeCycle from '#/engine/entity/EntityLifeCycle.js';
import { CoordGrid } from '#/engine/CoordGrid.js';

import World from '#/engine/World.js';
import ZoneMap from '#/engine/zone/ZoneMap.js';
import ZoneEvent from '#/engine/zone/ZoneEvent.js';
import ZoneEventType from '#/engine/zone/ZoneEventType.js';

import UpdateZonePartialEnclosed from '#/network/server/model/UpdateZonePartialEnclosed.js';
import UpdateZoneFullFollows from '#/network/server/model/UpdateZoneFullFollows.js';
import UpdateZonePartialFollows from '#/network/server/model/UpdateZonePartialFollows.js';
import ObjAdd from '#/network/server/model/ObjAdd.js';
import LocAddChange from '#/network/server/model/LocAddChange.js';
import LocDel from '#/network/server/model/LocDel.js';
import MapProjAnim from '#/network/server/model/MapProjAnim.js';
import MapAnim from '#/network/server/model/MapAnim.js';
import ObjDel from '#/network/server/model/ObjDel.js';
import ObjCount from '#/network/server/model/ObjCount.js';
import ObjReveal from '#/network/server/model/ObjReveal.js';
import LocAnim from '#/network/server/model/LocAnim.js';
import LocMerge from '#/network/server/model/LocMerge.js';
import ServerProtRepository from '#/network/rs225/server/prot/ServerProtRepository.js';
import ZoneMessageEncoder from '#/network/server/codec/ZoneMessageEncoder.js';
import ZoneMessage from '#/network/server/ZoneMessage.js';
import ZoneEntityList, { LocList, ObjList } from '#/engine/zone/ZoneEntityList.js';
import NonPathingEntity from '#/engine/entity/NonPathingEntity.js';
import ObjType from '#/cache/config/ObjType.js';
import Environment from '#/util/Environment.js';
import Packet from '#/io/Packet.js';

export default class Zone {
    private static readonly SIZE: number = 8 * 8;
    private static readonly LOCS: number = this.SIZE << 2;
    private static readonly OBJS: number = (this.SIZE << 1) + 1;

    readonly index: number; // packed coord
    readonly x: number;
    readonly z: number;
    readonly level: number;

    // zone entities
    private readonly players: Set<number>; // list of player uids
    private readonly npcs: Set<number>; // list of npc nids (not uid because type may change)
    private readonly locs: ZoneEntityList<Loc>;
    private readonly objs: ZoneEntityList<Obj>;
    private readonly entityEvents: Map<NonPathingEntity, ZoneEvent[]>;

    // zone events
    private readonly events: Set<ZoneEvent>;
    private shared: Uint8Array | null = null;

    constructor(index: number) {
        this.index = index;
        const coord: CoordGrid = ZoneMap.unpackIndex(index);
        this.x = coord.x >> 3;
        this.z = coord.z >> 3;
        this.level = coord.level;
        this.events = new Set();
        this.players = new Set();
        this.npcs = new Set();
        this.locs = new LocList(Zone.LOCS, (loc: Loc) => World.removeLoc(loc, 100));
        this.objs = new ObjList(Zone.OBJS, (obj: Obj) => World.removeObj(obj, 100));
        this.entityEvents = new Map();
    }

    get totalLocs(): number {
        return this.locs.count;
    }

    get totalObjs(): number {
        return this.objs.count;
    }

    enter(entity: PathingEntity): void {
        if (entity instanceof Player) {
            this.players.add(entity.uid);
            World.gameMap.getZoneGrid(this.level).flag(this.x, this.z);
        } else if (entity instanceof Npc) {
            this.npcs.add(entity.nid);
        }
    }

    leave(entity: PathingEntity): void {
        if (entity instanceof Player) {
            this.players.delete(entity.uid);
            if (this.players.size === 0) {
                World.gameMap.getZoneGrid(this.level).unflag(this.x, this.z);
            }
        } else if (entity instanceof Npc) {
            this.npcs.delete(entity.nid);
        }
    }

    tick(tick: number): void {
        this.checkObjs(tick);
        this.checkLocs(tick);
        this.computeShared();
    }

    private checkObjs(tick: number): void {
        let updated: boolean;
        // despawn/change objs
        do {
            updated = false;
            for (const obj of this.getAllObjsUnsafe()) {
                if (!obj.updateLifeCycle(tick) || obj.lastLifecycleTick === tick) {
                    continue;
                }
                if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
                    if (obj.reveal !== -1) {
                        World.revealObj(obj);
                    } else {
                        World.removeObj(obj, 0);
                        updated = true;
                    }
                }
            }
        } while (updated);
        // respawn objs
        do {
            updated = false;
            for (const obj of this.getAllObjsUnsafe()) {
                if (!obj.updateLifeCycle(tick) || obj.lastLifecycleTick === tick) {
                    continue;
                }
                if (obj.lifecycle === EntityLifeCycle.RESPAWN) {
                    World.addObj(obj, Obj.NO_RECEIVER, 0);
                    updated = true;
                }
            }
        } while (updated);
    }

    private checkLocs(tick: number): void {
        let updated: boolean;
        // despawn locs
        do {
            updated = false;
            for (const loc of this.getAllLocsUnsafe()) {
                if (!loc.updateLifeCycle(tick) || loc.lastLifecycleTick === tick) {
                    continue;
                }
                if (loc.lifecycle === EntityLifeCycle.DESPAWN) {
                    const change = this.findChangeLoc(loc);
                    if (change) {
                        World.changeLoc(loc, change, 0);
                    } else {
                        World.removeLoc(loc, 0);
                    }
                    updated = true;
                }
            }
        } while (updated);
        // respawn locs
        do {
            updated = false;
            for (const loc of this.getAllLocsUnsafe()) {
                if (!loc.updateLifeCycle(tick) || loc.lastLifecycleTick === tick) {
                    continue;
                }
                if (loc.lifecycle === EntityLifeCycle.RESPAWN) {
                    World.addLoc(loc, 0);
                    updated = true;
                }
            }
        } while (updated);
    }

    computeShared(): void {
        const buf: Packet = Packet.alloc(1);
        for (const event of this.enclosed()) {
            const encoder: ZoneMessageEncoder<ZoneMessage> | undefined = ServerProtRepository.getZoneEncoder(event.message);
            if (typeof encoder === 'undefined') {
                continue;
            }
            encoder.enclose(buf, event.message);
        }

        if (buf.pos === 0) {
            buf.release();
            return;
        }

        const shared: Uint8Array = new Uint8Array(buf.pos);
        buf.pos = 0;
        buf.gdata(shared, 0, shared.length);
        buf.release();
        this.shared = shared;
    }

    /**
     * - Update the player client the current visibility of the seen zones.
     * - When UpdateZoneFullFollows is written, this completely resets the client zones to default.
     * - Default zones, meaning, no objs and the original locs.
     * - So we catch the client back up with everything that is "currently seen" in the zones.
     * - "currently seen zones" meaning all the visible objs and locs that should be visible to the client.
     * - This does not include any updates that were made to the zones "THIS TICK".
     */
    writeFullFollows(player: Player): void {
        // full update necessary to clear client zone memory
        player.write(new UpdateZoneFullFollows(this.x, this.z, player.originX, player.originZ));
        // osrs does locs first and then objs.
        for (const loc of this.getAllLocsUnsafe(true)) {
            if (loc.lifecycle === EntityLifeCycle.DESPAWN && loc.isValid()) {
                player.write(new LocAddChange(CoordGrid.packZoneCoord(loc.x, loc.z), loc.type, loc.shape, loc.angle));
            } else if (loc.lifecycle === EntityLifeCycle.RESPAWN && !loc.isValid() && !this.findChangeLoc(loc)) {
                player.write(new LocDel(CoordGrid.packZoneCoord(loc.x, loc.z), loc.shape, loc.angle));
            }
        }
        for (const obj of this.getAllObjsUnsafe(true)) {
            if (obj.receiver64 !== Obj.NO_RECEIVER && obj.receiver64 !== player.hash64) {
                continue;
            }
            // osrs sends individual partial follows even on the same tick+zone+tile.
            player.write(new UpdateZonePartialFollows(this.x, this.z, player.originX, player.originZ));
            if (obj.lifecycle === EntityLifeCycle.DESPAWN && obj.isValid()) {
                player.write(new ObjAdd(CoordGrid.packZoneCoord(obj.x, obj.z), obj.type, obj.count));
            } else if (obj.lifecycle === EntityLifeCycle.RESPAWN && obj.isValid()) {
                player.write(new ObjAdd(CoordGrid.packZoneCoord(obj.x, obj.z), obj.type, obj.count));
            }
        }
    }

    /**
     * - Update the player client with any partial enclosed "shared" zone updates.
     * - Updates are only known by the server once per cycle.
     * - So for example, if UpdateZoneFullFollows is written, then we must update the client with these
     * updates after the client is set back to the original map then updated with the "currently seen zones".
     * - "currently seen zones" meaning all the visible objs and locs that should be visible to the client.
     */
    writePartialEnclosed(player: Player): void {
        if (!this.shared) {
            return;
        }
        player.write(new UpdateZonePartialEnclosed(this.x, this.z, player.originX, player.originZ, this.shared));
    }

    /**
     * Same shit as above basically.
     */
    writePartialFollows(player: Player): void {
        if (this.events.size === 0) {
            return;
        }
        for (const event of this.follows()) {
            if (event.receiver64 !== Obj.NO_RECEIVER && event.receiver64 !== player.hash64) {
                continue;
            }
            // osrs sends individual partial follows even on the same tick+zone+tile.
            player.write(new UpdateZonePartialFollows(this.x, this.z, player.originX, player.originZ));
            player.write(event.message);
        }
    }

    reset(): void {
        this.shared = null;
        this.events.clear();
        this.entityEvents.clear();
    }

    // ---- static locs/objs are added during world init ----

    addStaticLoc(loc: Loc): void {
        const coord: number = CoordGrid.packZoneCoord(loc.x, loc.z);
        this.locs.addLast(coord, loc, true);
        this.locs.sortStack(coord, true);
        loc.isActive = true;
    }

    addStaticObj(obj: Obj): void {
        const coord: number = CoordGrid.packZoneCoord(obj.x, obj.z);
        this.objs.addLast(coord, obj, true);
        this.objs.sortStack(coord, true);
        obj.isRevealed = true;
        obj.isActive = true;
    }

    // ---- locs ----

    addLoc(loc: Loc): void {
        const coord: number = CoordGrid.packZoneCoord(loc.x, loc.z);
        if (loc.lifecycle === EntityLifeCycle.DESPAWN) {
            this.locs.addLast(coord, loc);
        }

        this.locs.sortStack(coord);
        loc.isActive = true;

        this.queueEvent(loc, new ZoneEvent(ZoneEventType.ENCLOSED, -1n, new LocAddChange(coord, loc.type, loc.shape, loc.angle)));
    }

    changeLoc(from: Loc, to: Loc): void {
        const coord: number = CoordGrid.packZoneCoord(from.x, from.z);
        if (to.lifecycle === EntityLifeCycle.DESPAWN) {
            this.locs.addLast(coord, to);
        } else if (from.lifecycle === EntityLifeCycle.DESPAWN) {
            this.locs.remove(coord, from);
        }

        this.locs.sortStack(coord);
        from.isActive = false;
        to.isActive = true;

        this.queueEvent(from, new ZoneEvent(ZoneEventType.ENCLOSED, -1n, new LocAddChange(coord, to.type, to.shape, to.angle)));
    }

    removeLoc(loc: Loc): void {
        const coord: number = CoordGrid.packZoneCoord(loc.x, loc.z);
        if (loc.lifecycle === EntityLifeCycle.DESPAWN) {
            this.locs.remove(coord, loc);
        }

        this.locs.sortStack(coord);
        this.clearQueuedEvents(loc);
        loc.isActive = false;

        if (loc.lastLifecycleTick !== World.currentTick) {
            this.queueEvent(loc, new ZoneEvent(ZoneEventType.ENCLOSED, -1n, new LocDel(coord, loc.shape, loc.angle)));
        }
    }

    getLoc(x: number, z: number, type: number): Loc | null {
        for (const loc of this.getLocsSafe(CoordGrid.packZoneCoord(x, z))) {
            if (loc.type === type) {
                return loc;
            }
        }
        return null;
    }

    mergeLoc(loc: Loc, player: Player, startCycle: number, endCycle: number, south: number, east: number, north: number, west: number): void {
        this.queueEvent(loc, new ZoneEvent(ZoneEventType.ENCLOSED, -1n, new LocMerge(loc.x, loc.z, loc.shape, loc.angle, loc.type, startCycle, endCycle, player.pid, east, south, west, north)));
    }

    animLoc(loc: Loc, seq: number): void {
        this.queueEvent(loc, new ZoneEvent(ZoneEventType.ENCLOSED, -1n, new LocAnim(CoordGrid.packZoneCoord(loc.x, loc.z), loc.shape, loc.angle, seq)));
    }

    // ---- objs ----

    addObj(obj: Obj, receiver64: bigint): void {
        const coord: number = CoordGrid.packZoneCoord(obj.x, obj.z);
        if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
            this.objs.addLast(coord, obj);
        }

        this.objs.sortStack(coord);
        obj.isActive = true;

        if (obj.lifecycle === EntityLifeCycle.RESPAWN || receiver64 === Obj.NO_RECEIVER) {
            obj.isRevealed = true;
            this.queueEvent(obj, new ZoneEvent(ZoneEventType.ENCLOSED, receiver64, new ObjAdd(coord, obj.type, obj.count)));
        } else if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
            obj.isRevealed = false;
            this.queueEvent(obj, new ZoneEvent(ZoneEventType.FOLLOWS, receiver64, new ObjAdd(coord, obj.type, obj.count)));
        }
    }

    revealObj(obj: Obj, receiver64: bigint): void {
        const objType: ObjType = ObjType.get(obj.type);
        if (!(objType.tradeable && ((objType.members && Environment.NODE_MEMBERS) || !objType.members))) {
            obj.reveal = -1;
            return;
        }

        obj.receiver64 = Obj.NO_RECEIVER;
        obj.reveal = -1;
        obj.lastChange = -1;
        obj.isRevealed = true;

        const coord: number = CoordGrid.packZoneCoord(obj.x, obj.z);
        this.objs.sortStack(coord);

        this.queueEvent(obj, new ZoneEvent(ZoneEventType.ENCLOSED, receiver64, new ObjReveal(coord, obj.type, obj.count, World.getPlayerByHash64(receiver64)?.pid ?? 0)));
    }

    changeObj(obj: Obj, receiver64: bigint, oldCount: number, newCount: number): void {
        obj.count = newCount;
        obj.lastChange = World.currentTick;

        const coord: number = CoordGrid.packZoneCoord(obj.x, obj.z);
        this.objs.sortStack(coord);

        this.queueEvent(obj, new ZoneEvent(ZoneEventType.FOLLOWS, receiver64, new ObjCount(coord, obj.type, oldCount, newCount)));
    }

    removeObj(obj: Obj): void {
        const coord: number = CoordGrid.packZoneCoord(obj.x, obj.z);
        if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
            this.objs.remove(coord, obj);
        }

        this.objs.sortStack(coord);
        this.clearQueuedEvents(obj);
        obj.isActive = false;

        if (obj.lastLifecycleTick !== World.currentTick) {
            if (obj.lifecycle === EntityLifeCycle.RESPAWN || obj.receiver64 === Obj.NO_RECEIVER) {
                this.queueEvent(obj, new ZoneEvent(ZoneEventType.ENCLOSED, Obj.NO_RECEIVER, new ObjDel(coord, obj.type)));
            } else if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
                this.queueEvent(obj, new ZoneEvent(ZoneEventType.FOLLOWS, obj.receiver64, new ObjDel(coord, obj.type)));
            }
        }
    }

    getObj(x: number, z: number, type: number, receiver64: bigint): Obj | null {
        for (const obj of this.getObjsSafe(CoordGrid.packZoneCoord(x, z))) {
            if ((obj.receiver64 === Obj.NO_RECEIVER || obj.receiver64 === receiver64) && obj.type === type) {
                return obj;
            }
        }
        return null;
    }

    getObjOfReceiver(x: number, z: number, type: number, receiver64: bigint): Obj | null {
        for (const obj of this.getObjsSafe(CoordGrid.packZoneCoord(x, z))) {
            if (obj.receiver64 === receiver64 && obj.type === type) {
                return obj;
            }
        }
        return null;
    }

    // ---- not tied to any entities ----

    animMap(x: number, z: number, spotanim: number, height: number, delay: number): void {
        this.events.add(new ZoneEvent(ZoneEventType.ENCLOSED, -1n, new MapAnim(CoordGrid.packZoneCoord(x, z), spotanim, height, delay)));
    }

    mapProjAnim(x: number, z: number, dstX: number, dstZ: number, target: number, spotanim: number, srcHeight: number, dstHeight: number, startDelay: number, endDelay: number, peak: number, arc: number): void {
        this.events.add(new ZoneEvent(ZoneEventType.ENCLOSED, -1n, new MapProjAnim(x, z, dstX, dstZ, target, spotanim, srcHeight, dstHeight, startDelay, endDelay, peak, arc)));
    }

    // ---- core functions ----

    /**
     * Generates players that are currently "visible" in this zone.
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllPlayersSafe(): IterableIterator<Player> {
        for (const uid of this.players) {
            const player: Player | null = World.getPlayerByUid(uid);
            if (player && player.isValid()) {
                yield player;
            }
        }
    }

    /**
     * Generates npcs that are currently "visible" in this zone.
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllNpcsSafe(): IterableIterator<Npc> {
        for (const nid of this.npcs) {
            const npc: Npc | undefined = World.getNpc(nid);
            if (npc && npc.isValid()) {
                yield npc;
            }
        }
    }

    /**
     * Generates all objs that are currently "visible" in this zone.
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllObjsSafe(): IterableIterator<Obj> {
        for (const obj of this.objs.all()) {
            if (obj.isValid()) {
                yield obj;
            }
        }
    }

    /**
     * Generates objs that are currently "visible" in this zone on the specified coord (tile).
     * "visible" meaning they are active on the server and available to the client.
     */
    *getObjsSafe(coord: number): IterableIterator<Obj> {
        for (const obj of this.objs.stack(coord)) {
            if (obj.isValid()) {
                yield obj;
            }
        }
    }

    /**
     * Generates objs in this zone on the specified coord (tile).
     * Does not guarantee that the objs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getObjsUnsafe(coord: number): IterableIterator<Obj> {
        yield* this.objs.stack(coord);
    }

    /**
     * Generates all objs in this zone.
     * Does not guarantee that the objs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllObjsUnsafe(reverse: boolean = false): IterableIterator<Obj> {
        yield* this.objs.all(reverse);
    }

    /**
     * Generates all locs that are currently "visible" in this zone.
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllLocsSafe(): IterableIterator<Loc> {
        for (const loc of this.locs.all()) {
            if (loc.isValid()) {
                yield loc;
            }
        }
    }

    /**
     * Generates locs that are currently "visible" in this zone on the specified coord (tile).
     * "visible" meaning they are active on the server and available to the client.
     */
    *getLocsSafe(coord: number): IterableIterator<Loc> {
        for (const loc of this.locs.stack(coord)) {
            if (loc.isValid()) {
                yield loc;
            }
        }
    }

    /**
     * Generates locs in this zone on the specified coord (tile).
     * Does not guarantee that the locs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getLocsUnsafe(coord: number): IterableIterator<Loc> {
        yield* this.locs.stack(coord);
    }

    /**
     * Generates all locs in this zone.
     * Does not guarantee that the locs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllLocsUnsafe(reverse: boolean = false): IterableIterator<Loc> {
        yield* this.locs.all(reverse);
    }

    private findChangeLoc(entity: Loc): Loc | null {
        for (const loc of this.getLocsUnsafe(CoordGrid.packZoneCoord(entity.x, entity.z))) {
            if (loc === entity) {
                continue;
            }
            if (loc.layer === entity.layer && entity.shape === loc.shape) {
                return loc;
            }
        }
        return null;
    }

    /**
     * Generates the enclosed (shared) zone events currently queued for this zone.
     * These are cleared at the end of every game cycle.
     */
    private *enclosed(): IterableIterator<ZoneEvent> {
        for (const event of this.events) {
            if (event.type === ZoneEventType.ENCLOSED) {
                yield event;
            }
        }
    }

    /**
     * Generates the follows zone events currently queued for this zone.
     * These are cleared at the end of every game cycle.
     */
    private *follows(): IterableIterator<ZoneEvent> {
        for (const event of this.events) {
            if (event.type === ZoneEventType.FOLLOWS) {
                yield event;
            }
        }
    }

    /**
     * Queue a new zone event for a specified zone entity.
     */
    private queueEvent(entity: NonPathingEntity, event: ZoneEvent): void {
        this.events.add(event);
        const exist: ZoneEvent[] | undefined = this.entityEvents.get(entity);
        if (typeof exist === 'undefined') {
            this.entityEvents.set(entity, [event]);
            return;
        }
        exist.push(event);
    }

    /**
     * Clear all the queued zone events for a specified zone entity.
     * This is important for example when objs are added into a zone than
     * what the zone can actually hold, then the cheapest objs are automatically dropped.
     * If an entity is dropped, and it had other queued events this game cycle, then
     * we should remove them, so they do not get sent out to the clients.
     */
    private clearQueuedEvents(entity: NonPathingEntity): void {
        const exist: ZoneEvent[] | undefined = this.entityEvents.get(entity);
        if (typeof exist !== 'undefined') {
            for (let index: number = 0; index < exist.length; index++) {
                this.events.delete(exist[index]);
            }
            this.entityEvents.delete(entity);
        }
    }
}
