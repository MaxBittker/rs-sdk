import ObjType from '#/cache/config/ObjType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import EntityLifeCycle from '#/engine/entity/EntityLifeCycle.js';
import Loc from '#/engine/entity/Loc.js';
import NonPathingEntity from '#/engine/entity/NonPathingEntity.js';
import Npc from '#/engine/entity/Npc.js';
import Obj from '#/engine/entity/Obj.js';
import PathingEntity from '#/engine/entity/PathingEntity.js';
import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import ZoneEvent from '#/engine/zone/ZoneEvent.js';
import ZoneEventType from '#/engine/zone/ZoneEventType.js';
import ZoneMap from '#/engine/zone/ZoneMap.js';
import Packet from '#/io/Packet.js';
import ServerProtRepository from '#/network/rs225/server/prot/ServerProtRepository.js';
import ZoneMessageEncoder from '#/network/server/codec/ZoneMessageEncoder.js';
import LocAddChange from '#/network/server/model/LocAddChange.js';
import LocAnim from '#/network/server/model/LocAnim.js';
import LocDel from '#/network/server/model/LocDel.js';
import LocMerge from '#/network/server/model/LocMerge.js';
import MapAnim from '#/network/server/model/MapAnim.js';
import MapProjAnim from '#/network/server/model/MapProjAnim.js';
import ObjAdd from '#/network/server/model/ObjAdd.js';
import ObjCount from '#/network/server/model/ObjCount.js';
import ObjDel from '#/network/server/model/ObjDel.js';
import ObjReveal from '#/network/server/model/ObjReveal.js';
import UpdateZoneFullFollows from '#/network/server/model/UpdateZoneFullFollows.js';
import UpdateZonePartialEnclosed from '#/network/server/model/UpdateZonePartialEnclosed.js';
import UpdateZonePartialFollows from '#/network/server/model/UpdateZonePartialFollows.js';
import ZoneMessage from '#/network/server/ZoneMessage.js';
import Environment from '#/util/Environment.js';
import LinkList from '#/util/LinkList.js';

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
    private readonly locs: LinkList<Loc> = new LinkList();
    private readonly objs: LinkList<Obj> = new LinkList();
    private locsCount: number = 0;
    private objsCount: number = 0;
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
        this.entityEvents = new Map();
    }

    get totalLocs(): number {
        return this.locsCount;
    }

    get totalObjs(): number {
        return this.objsCount;
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
        for (const obj of this.getAllObjsUnsafe()) {
            if (!obj.updateLifeCycle(tick) || obj.lastLifecycleTick === tick) {
                continue;
            }
            if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
                if (obj.reveal !== -1) {
                    World.revealObj(obj);
                } else {
                    World.removeObj(obj, 0);
                }
            } else if (obj.lifecycle === EntityLifeCycle.RESPAWN) {
                World.addObj(obj, Obj.NO_RECEIVER, 0);
            }
        }

        for (const loc of this.getAllLocsUnsafe()) {
            if (!loc.updateLifeCycle(tick) || loc.lastLifecycleTick === tick) {
                continue;
            }
            if (loc.lifecycle === EntityLifeCycle.DESPAWN) {
                World.removeLoc(loc, 0);
            } else if (loc.lifecycle === EntityLifeCycle.RESPAWN && loc.isChanged()) {
                World.revertLoc(loc);
            } else if (loc.lifecycle === EntityLifeCycle.RESPAWN) {
                World.addLoc(loc, 0);
            }
        }

        this.computeShared();
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
        const currentTick: number = World.currentTick;
        // full update necessary to clear client zone memory
        player.write(new UpdateZoneFullFollows(this.x, this.z, player.originX, player.originZ));
        for (const obj of this.getAllObjsUnsafe(true)) {
            if (obj.lastLifecycleTick === currentTick || (obj.receiver64 !== Obj.NO_RECEIVER && obj.receiver64 !== player.hash64)) {
                continue;
            }
            player.write(new UpdateZonePartialFollows(this.x, this.z, player.originX, player.originZ));
            if (obj.lifecycle === EntityLifeCycle.DESPAWN && obj.checkLifeCycle(currentTick)) {
                player.write(new ObjAdd(CoordGrid.packZoneCoord(obj.x, obj.z), obj.type, obj.count));
            } else if (obj.lifecycle === EntityLifeCycle.RESPAWN && obj.checkLifeCycle(currentTick)) {
                player.write(new ObjAdd(CoordGrid.packZoneCoord(obj.x, obj.z), obj.type, obj.count));
            }
        }
        for (const loc of this.getAllLocsUnsafe(true)) {
            if (loc.lastLifecycleTick === currentTick) {
                continue;
            }
            // Send dynamic locs to the client
            if (loc.lifecycle === EntityLifeCycle.DESPAWN && loc.isValid()) {
                player.write(new LocAddChange(CoordGrid.packZoneCoord(loc.x, loc.z), loc.type, loc.shape, loc.angle));
            }
            // Inform the client that a static loc is not currently active
            else if (loc.lifecycle === EntityLifeCycle.RESPAWN && !loc.isValid()) {
                player.write(new LocDel(CoordGrid.packZoneCoord(loc.x, loc.z), loc.shape, loc.angle));
            }
            // Send 'changed' static locs to the client
            else if (loc.lifecycle === EntityLifeCycle.RESPAWN && loc.isChanged()) {
                player.write(new LocAddChange(CoordGrid.packZoneCoord(loc.x, loc.z), loc.type, loc.shape, loc.angle));
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
    writePartialEncloses(player: Player): void {
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
        player.write(new UpdateZonePartialFollows(this.x, this.z, player.originX, player.originZ));
        for (const event of this.follows()) {
            if (event.receiver64 !== Obj.NO_RECEIVER && event.receiver64 !== player.hash64) {
                continue;
            }
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
        this.locs.addTail(loc);
        this.locsCount++;
        loc.isActive = true;
    }

    addStaticObj(obj: Obj): void {
        const coord: number = CoordGrid.packZoneCoord(obj.x, obj.z);
        this.objs.addTail(obj);
        this.objsCount++;
        obj.isRevealed = true;
        obj.isActive = true;
    }

    // ---- locs ----

    addLoc(loc: Loc): void {
        const coord: number = CoordGrid.packZoneCoord(loc.x, loc.z);
        if (loc.lifecycle === EntityLifeCycle.DESPAWN) {
            this.locs.addTail(loc);
            this.locsCount++;
        }
        loc.revert();
        loc.isActive = true;
        this.queueEvent(loc, new ZoneEvent(ZoneEventType.ENCLOSED, -1n, new LocAddChange(coord, loc.type, loc.shape, loc.angle)));
    }

    changeLoc(loc: Loc) {
        // If a loc is inactive, it should be set to active when we call a change
        loc.isActive = true;
        const coord: number = CoordGrid.packZoneCoord(loc.x, loc.z);
        this.queueEvent(loc, new ZoneEvent(ZoneEventType.ENCLOSED, -1n, new LocAddChange(coord, loc.type, loc.shape, loc.angle)));
    }

    removeLoc(loc: Loc): void {
        const coord: number = CoordGrid.packZoneCoord(loc.x, loc.z);
        if (loc.lifecycle === EntityLifeCycle.DESPAWN) {
            loc.unlink();
            this.locsCount--;
        }

        this.clearQueuedEvents(loc);
        loc.isActive = false;

        this.queueEvent(loc, new ZoneEvent(ZoneEventType.ENCLOSED, -1n, new LocDel(coord, loc.shape, loc.angle)));
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
            if (this.totalObjs >= Zone.OBJS) {
                // Make room for the Obj in the zone if need
                for (const obj2 of this.getAllObjsUnsafe()) {
                    if (obj2.lifecycle === EntityLifeCycle.DESPAWN) {
                        World.removeObj(obj2, 0);
                        break;
                    }
                }
            }

            this.objs.addTail(obj);
            this.objsCount++;
        }

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

        this.queueEvent(obj, new ZoneEvent(ZoneEventType.ENCLOSED, receiver64, new ObjReveal(coord, obj.type, obj.count, World.getPlayerByHash64(receiver64)?.pid ?? 0)));
    }

    changeObj(obj: Obj, receiver64: bigint, oldCount: number, newCount: number): void {
        obj.count = newCount;
        obj.lastChange = World.currentTick;

        const coord: number = CoordGrid.packZoneCoord(obj.x, obj.z);

        this.queueEvent(obj, new ZoneEvent(ZoneEventType.FOLLOWS, receiver64, new ObjCount(coord, obj.type, oldCount, newCount)));
    }

    removeObj(obj: Obj): void {
        const coord: number = CoordGrid.packZoneCoord(obj.x, obj.z);
        if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
            obj.unlink();
            this.objsCount--;
        }

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
        for (let obj = this.objs.head(); obj !== null; obj = this.objs.next()) {
            if (obj.isValid()) {
                const save = this.locs.cursor;
                yield obj;
                this.locs.cursor = save;
            }
        }
    }

    /**
     * Generates objs that are currently "visible" in this zone on the specified coord (tile).
     * "visible" meaning they are active on the server and available to the client.
     */
    *getObjsSafe(coord: number): IterableIterator<Obj> {
        for (let obj = this.objs.head(); obj !== null; obj = this.objs.next()) {
            if (obj.isValid() && CoordGrid.packZoneCoord(obj.x, obj.z) === coord) {
                const save = this.locs.cursor;
                yield obj;
                this.locs.cursor = save;
            }
        }
    }

    /**
     * Generates objs in this zone on the specified coord (tile).
     * Does not guarantee that the objs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getObjsUnsafe(coord: number): IterableIterator<Obj> {
        for (let obj = this.objs.head(); obj !== null; obj = this.objs.next()) {
            if (CoordGrid.packZoneCoord(obj.x, obj.z) === coord) {
                const save = this.locs.cursor;
                yield obj;
                this.locs.cursor = save;
            }
        }
    }

    /**
     * Generates all objs in this zone.
     * Does not guarantee that the objs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllObjsUnsafe(reverse: boolean = false): IterableIterator<Obj> {
        for (let obj = reverse ? this.objs.tail() : this.objs.head(); obj !== null; obj = reverse ? this.objs.prev() : this.objs.next()) {
            const save = this.locs.cursor;
            yield obj;
            this.locs.cursor = save;
        }
    }

    /**
     * Generates all locs that are currently "visible" in this zone.
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllLocsSafe(): IterableIterator<Loc> {
        for (let loc = this.locs.head(); loc !== null; loc = this.locs.next()) {
            if (loc.isValid()) {
                const save = this.locs.cursor;
                yield loc;
                this.locs.cursor = save;
            }
        }
    }

    /**
     * Generates locs that are currently "visible" in this zone on the specified coord (tile).
     * "visible" meaning they are active on the server and available to the client.
     */
    *getLocsSafe(coord: number): IterableIterator<Loc> {
        for (let loc = this.locs.head(); loc !== null; loc = this.locs.next()) {
            if (loc.isValid() && CoordGrid.packZoneCoord(loc.x, loc.z) === coord) {
                const save = this.locs.cursor;
                yield loc;
                this.locs.cursor = save;
            }
        }
    }

    /**
     * Generates locs in this zone on the specified coord (tile).
     * Does not guarantee that the locs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getLocsUnsafe(coord: number): IterableIterator<Loc> {
        for (let loc = this.locs.head(); loc !== null; loc = this.locs.next()) {
            if (CoordGrid.packZoneCoord(loc.x, loc.z) === coord) {
                const save = this.locs.cursor;
                yield loc;
                this.locs.cursor = save;
            }
        }
    }

    /**
     * Generates all locs in this zone.
     * Does not guarantee that the locs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllLocsUnsafe(reverse: boolean = false): IterableIterator<Loc> {
        for (let loc = reverse ? this.locs.tail() : this.locs.head(); loc !== null; loc = reverse ? this.locs.prev() : this.locs.next()) {
            const save = this.locs.cursor;
            yield loc;
            this.locs.cursor = save;
        }
    }

    /**
     * Generates all npcs in this zone.
     * Does not guarantee that the npcs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllNpcsUnsafe(): IterableIterator<Npc> {
        for (const nid of this.npcs) {
            const npc = World.getNpc(nid);
            if (npc) {
                yield npc;
            }
        }
    }

    /**
     * Generates all players in this zone.
     * Does not guarantee that the players are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllPlayersUnsafe(): IterableIterator<Player> {
        for (const uid of this.players) {
            const player: Player | null = World.getPlayerByUid(uid);
            if (player) {
                yield player;
            }
        }
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
