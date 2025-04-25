import ObjType from '#/cache/config/ObjType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import { EntityLifeCycle } from '#/engine/entity/EntityLifeCycle.js';
import Loc from '#/engine/entity/Loc.js';
import NonPathingEntity from '#/engine/entity/NonPathingEntity.js';
import Npc from '#/engine/entity/Npc.js';
import Obj from '#/engine/entity/Obj.js';
import PathingEntity from '#/engine/entity/PathingEntity.js';
import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import ZoneEvent from '#/engine/zone/ZoneEvent.js';
import { ZoneEventType } from '#/engine/zone/ZoneEventType.js';
import ZoneMap from '#/engine/zone/ZoneMap.js';
import Packet from '#/io/Packet.js';
import ZoneMessageEncoder from '#/network/server/codec/ZoneMessageEncoder.js';
import LocAddChange from '#/network/server/model/game/LocAddChange.js';
import LocAnim from '#/network/server/model/game/LocAnim.js';
import LocDel from '#/network/server/model/game/LocDel.js';
import LocMerge from '#/network/server/model/game/LocMerge.js';
import MapAnim from '#/network/server/model/game/MapAnim.js';
import MapProjAnim from '#/network/server/model/game/MapProjAnim.js';
import ObjAdd from '#/network/server/model/game/ObjAdd.js';
import ObjCount from '#/network/server/model/game/ObjCount.js';
import ObjDel from '#/network/server/model/game/ObjDel.js';
import ObjReveal from '#/network/server/model/game/ObjReveal.js';
import UpdateZoneFullFollows from '#/network/server/model/game/UpdateZoneFullFollows.js';
import UpdateZonePartialEnclosed from '#/network/server/model/game/UpdateZonePartialEnclosed.js';
import UpdateZonePartialFollows from '#/network/server/model/game/UpdateZonePartialFollows.js';
import { ServerProtRepository } from '#/network/server/prot/ServerProt.js';
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
    private readonly players: LinkList<Player> = new LinkList();
    private readonly npcs: LinkList<Npc> = new LinkList();
    private readonly locs: LinkList<Loc> = new LinkList();
    private readonly objs: LinkList<Obj> = new LinkList();
    private playersCount: number = 0;
    private npcsCount: number = 0;
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
            this.players.addTail(entity);
            this.playersCount++;
            World.gameMap.getZoneGrid(this.level).flag(this.x, this.z);
        } else if (entity instanceof Npc) {
            this.npcs.addTail(entity);
            this.npcsCount++;
        }
    }

    leave(entity: PathingEntity): void {
        entity.unlink();
        if (entity instanceof Player) {
            this.playersCount--;
            if (this.playersCount === 0) {
                World.gameMap.getZoneGrid(this.level).unflag(this.x, this.z);
            }
        } else if (entity instanceof Npc) {
            this.npcsCount--;
        }
    }

    computeShared(): void {
        const buf: Packet = Packet.alloc(1);
        for (const event of this.enclosed()) {
            // console.log(event.message);
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
            if (obj.lifecycle === EntityLifeCycle.DESPAWN && obj.isActive) {
                player.write(new ObjAdd(CoordGrid.packZoneCoord(obj.x, obj.z), obj.type, obj.count));
            } else if (obj.lifecycle === EntityLifeCycle.RESPAWN && obj.isActive) {
                player.write(new ObjAdd(CoordGrid.packZoneCoord(obj.x, obj.z), obj.type, obj.count));
            }
        }
        for (const loc of this.getAllLocsUnsafe(true)) {
            if (loc.lastLifecycleTick === currentTick) {
                continue;
            }
            // Send dynamic locs to the client
            if (loc.lifecycle === EntityLifeCycle.DESPAWN && loc.isActive) {
                player.write(new LocAddChange(CoordGrid.packZoneCoord(loc.x, loc.z), loc.type, loc.shape, loc.angle));
            }
            // Inform the client that a static loc is not currently active
            else if (loc.lifecycle === EntityLifeCycle.RESPAWN && !loc.isActive) {
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
        this.locs.addTail(loc);
        this.locsCount++;
        loc.isActive = true;
    }

    addStaticObj(obj: Obj): void {
        this.objs.addTail(obj);
        this.objsCount++;
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
            this.queueEvent(obj, new ZoneEvent(ZoneEventType.ENCLOSED, receiver64, new ObjAdd(coord, obj.type, obj.count)));
        } else if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
            this.queueEvent(obj, new ZoneEvent(ZoneEventType.FOLLOWS, receiver64, new ObjAdd(coord, obj.type, obj.count)));
        }
    }

    revealObj(obj: Obj): void {
        const objType: ObjType = ObjType.get(obj.type);

        obj.lastChange = -1;

        // If the obj is not tradeable, or it's members in an f2p world, or it's already revealed, then skip
        if (!objType.tradeable || (objType.members && !Environment.NODE_MEMBERS) || obj.reveal === -1) {
            obj.reveal = -1;
            return;
        }

        const initialReceiver = obj.receiver64;
        obj.receiver64 = Obj.NO_RECEIVER;
        obj.reveal = -1;
        obj.lastChange = -1;

        const coord: number = CoordGrid.packZoneCoord(obj.x, obj.z);

        this.queueEvent(obj, new ZoneEvent(ZoneEventType.ENCLOSED, initialReceiver, new ObjReveal(coord, obj.type, obj.count, World.getPlayerByHash64(initialReceiver)?.pid ?? 0)));
    }

    changeObj(obj: Obj, oldCount: number, newCount: number): void {
        obj.count = newCount;
        obj.lastChange = World.currentTick;

        const coord: number = CoordGrid.packZoneCoord(obj.x, obj.z);

        this.queueEvent(obj, new ZoneEvent(ZoneEventType.FOLLOWS, obj.receiver64, new ObjCount(coord, obj.type, oldCount, newCount)));
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
    *getAllPlayersSafe(reverse: boolean = false): IterableIterator<Player> {
        for (const player of this.players.all(reverse)) {
            if (player.isValid()) {
                yield player;
            }
        }
    }

    /**
     * Generates npcs that are currently "visible" in this zone.
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllNpcsSafe(reverse: boolean = false): IterableIterator<Npc> {
        for (const npc of this.npcs.all(reverse)) {
            if (npc.isValid()) {
                yield npc;
            }
        }
    }

    /**
     * Generates all objs that are currently "visible" in this zone.
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllObjsSafe(reverse: boolean = false): IterableIterator<Obj> {
        for (const obj of this.objs.all(reverse)) {
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
        for (const obj of this.objs.all()) {
            if (obj.isValid() && CoordGrid.packZoneCoord(obj.x, obj.z) === coord) {
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
        for (const obj of this.objs.all()) {
            if (CoordGrid.packZoneCoord(obj.x, obj.z) === coord) {
                yield obj;
            }
        }
    }

    /**
     * Generates all objs in this zone.
     * Does not guarantee that the objs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllObjsUnsafe(reverse: boolean = false): IterableIterator<Obj> {
        for (const obj of this.objs.all(reverse)) {
            yield obj;
        }
    }

    /**
     * Generates all locs that are currently "visible" in this zone.
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllLocsSafe(reverse: boolean = false): IterableIterator<Loc> {
        for (const loc of this.locs.all(reverse)) {
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
        for (const loc of this.locs.all()) {
            if (loc.isValid() && CoordGrid.packZoneCoord(loc.x, loc.z) === coord) {
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
        for (const loc of this.locs.all()) {
            if (CoordGrid.packZoneCoord(loc.x, loc.z) === coord) {
                yield loc;
            }
        }
    }

    /**
     * Generates all locs in this zone.
     * Does not guarantee that the locs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllLocsUnsafe(reverse: boolean = false): IterableIterator<Loc> {
        for (const loc of this.locs.all(reverse)) {
            yield loc;
        }
    }

    /**
     * Generates all npcs in this zone.
     * Does not guarantee that the npcs are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllNpcsUnsafe(reverse: boolean = false): IterableIterator<Npc> {
        for (const npc of this.npcs.all(reverse)) {
            yield npc;
        }
    }

    /**
     * Generates all players in this zone.
     * Does not guarantee that the players are currently "visible".
     * "visible" meaning they are active on the server and available to the client.
     */
    *getAllPlayersUnsafe(reverse: boolean = false): IterableIterator<Player> {
        for (const player of this.players.all(reverse)) {
            yield player;
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
