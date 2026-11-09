import type { ServerWebSocket } from 'bun';

import { EntityLifeCycle } from '#/engine/entity/EntityLifeCycle.js';
import Npc from '#/engine/entity/Npc.js';
import Obj from '#/engine/entity/Obj.js';
import Player from '#/engine/entity/Player.js';
import { NpcStat } from '#/engine/entity/NpcStat.js';
import { PlayerStat } from '#/engine/entity/PlayerStat.js';
import World from '#/engine/World.js';
import Zone from '#/engine/zone/Zone.js';
import ZoneEvent from '#/engine/zone/ZoneEvent.js';
import { ZoneEventType } from '#/engine/zone/ZoneEventType.js';
import ZoneMap from '#/engine/zone/ZoneMap.js';
import Packet from '#/io/Packet.js';
import LocAddChange from '#/network/game/server/model/LocAddChange.js';
import LocAnim from '#/network/game/server/model/LocAnim.js';
import LocDel from '#/network/game/server/model/LocDel.js';
import LocMerge from '#/network/game/server/model/LocMerge.js';
import MapAnim from '#/network/game/server/model/MapAnim.js';
import MapProjAnim from '#/network/game/server/model/MapProjAnim.js';
import ObjAdd from '#/network/game/server/model/ObjAdd.js';
import ObjCount from '#/network/game/server/model/ObjCount.js';
import ObjDel from '#/network/game/server/model/ObjDel.js';
import ObjReveal from '#/network/game/server/model/ObjReveal.js';
import { NpcInfoProt, PlayerInfoProt } from '#/network/rsbuf/prot.js';
import { Visibility } from '#/network/rsbuf/visibility.js';
import Environment from '#/util/Environment.js';
import { networkPressure } from '#/util/NetworkPressure.js';
import { printError, printInfo } from '#/util/Logger.js';
import WordPack from '#/wordenc/WordPack.js';

import type { WebSocketData } from './websocket.js';

// rs-sdk: read-only spectator feed of live world state for external viewers (e.g. rs-world).
//
// A viewer subscribes to a tile rectangle; every tick it gets the players and npcs inside it:
// a full record the first time an entity is seen, then only what changed (movement steps,
// anims, spotanims, facing, hitmarks, overhead text, appearance, npc type). Optionally a
// low-rate roster of every online player for maps and player lists. Everything here runs
// on the tick thread right before cleanup, while each entity's per-tick info masks are still
// set, and never touches game state. Per tick: one pass bucketing entities by map square, then
// each subscriber only visits the squares it overlaps, and every entity's record is serialized
// at most once and shared by all subscribers that saw it last tick.
//
// Protocol (JSON text frames, see WORLD_FEED_VERSION):
//   client -> {t:'sub', x, z, w, h}     subscribe to tiles [x, x+w) x [z, z+h), all levels
//             {t:'roster', on}          toggle the all-player roster
//   server -> {t:'hello', v, rev, tick, tickMs, players}
//             {t:'tick', k, ms, p?, n?, rp?, rn?, reset?, w?}  once per tick while subscribed
//             {t:'roster', k, p: [[slot, name, x, z, level, combat], ...], npcs}
//
// Entity records (keys only present when relevant):
//   i     player slot / npc nid           f   1 = first sight: a full record, replaces any entity in that slot
//   t     npc type (first sight + change_type)
//   x,z,l tile coords (first sight or moved)
//   m     [walkDir, runDir?] steps taken this tick (0..7, NW=0 .. SE=7)
//   tp    1 = moved without stepping (teleport), 2 = also a jump (never interpolate)
//   ap    player appearance block, base64 (exact client player_info encoding)
//   an    [seq, delay]          sp  [spotanim, height, delay]
//   fe    face entity (npc nid, or 32768 + player slot; -1 clears)
//   fs    face fine coord [x, z] (tile * 2 + size)
//   hm    [[damage, type], ...] with hp [current, max]
//   sy    forced overhead text   ch  public chat text (players), cc [colour, effect]
//   em    exact move [startX, startZ, endX, endZ, startCycle, endCycle, facing]
//
// Zone records (w, v2): what every player sees of the engine's 8x8 zones that is not a player
// or npc. Absolute tiles x, z and level l; apply in order. Per subscriber the server holds an
// area: every zone the rect touches, on all levels. Spec: WORLD-FEED-ZONES.md.
//   za    {x, z, w, h, r?} held area (zone-aligned tiles, all levels), first in w when it changes:
//         zones newly held start at the cache default, zones outside are dropped (r = reset:
//         every zone in it starts again). The state of the newly held zones that have any follows
//         (la/ld/oa), then their events of this tick.
//   la    {x, z, l, id, s, r} loc add/change    ld  {x, z, l, s, r} loc del
//   an    {x, z, l, s, r, q, sp?} loc anim      lm  {x, z, l, id, s, r, sc, ec, p, bx} loc merge
//         sp = 1: a spin (cannon): the loc steps to the next seq of its cycle every tick by itself
//         until an `an` with q = -1 (stop) or the loc changes; the steps are not sent.
//   oa    {x, z, l, id, n} public obj add/reveal  od  {x, z, l, id}  oc  {x, z, l, id, n0, n}
//   ma    {x, z, l, id, h, d} map anim
//   pj    {x, z, l, dx, dz, tg, id, sh, dh, sd, ed, pk, ar} projectile (dx, dz absolute destination)
// Private objs (receiver is one player) are never sent; a reveal is an add.
// Zone records are opt-in: only a 'sub' with zones: true gets w.

const WORLD_FEED_VERSION = 2;
const MAX_RECT_SIZE = 384;
const MAX_BUFFERED_BYTES = 1 << 20;
const ROSTER_INTERVAL_TICKS = 10;
const MAX_CLIENT_MESSAGE_BYTES = 1024;
const SLOW_FEED_MS = 20;

type KnownEntity = {
    // Object identity, not uid: an npc's uid changes with change_type, and slots/nids are reused.
    ref: Player | Npc;
    x: number;
    z: number;
    level: number;
    seen: number;
};

type FeedRecord = Record<string, unknown>;

type Position = { x: number; z: number; level: number };

// Serialized records for one entity this tick: full (first sight) and delta (vs last tick).
// undefined = not computed yet, null = nothing to send.
type RecordJson = { full?: string | null; delta?: string | null };

type Subscriber = {
    ws: ServerWebSocket<WebSocketData>;
    lastActivityAt: number;
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    subscribed: boolean;
    roster: boolean;
    resync: boolean;
    players: Map<number, KnownEntity>;
    npcs: Map<number, KnownEntity>;
    // Zone records are opt-in ('sub' with zones: true); without them no zone work is done.
    zones: boolean;
    // The held area (zone units) and whether 'sub' may have changed it.
    area: ZoneArea | null;
    areaDirty: boolean;
};

type ZoneArea = { x0: number; z0: number; x1: number; z1: number };

const subscribers: Map<ServerWebSocket<WebSocketData>, Subscriber> = new Map();
const appearanceBase64: Map<number, { buf: Uint8Array; b64: string }> = new Map();
let lastTickAt = 0;

// Rebuilt every tick: active entities by 64x64 map square, and their serialized records.
// The bucket arrays are reused across ticks to keep the tick thread's garbage down.
const playerBuckets: Map<number, Player[]> = new Map();
const npcBuckets: Map<number, Npc[]> = new Map();
const recordJson: Map<Player | Npc, RecordJson> = new Map();
let activeNpcs = 0;

// Per tick, shared by all subscribers: a zone's event records and a zone's snapshot records
// (comma-joined JSON; '' = nothing to send).
const zoneEventsJson: Map<Zone, string> = new Map();
const zoneSnapshotJson: Map<Zone, string> = new Map();

// Zones that can differ from the cache default: those with static objs, plus every zone that had
// an event (kept while the feed is on, pruned when a snapshot finds it back at default). A gained
// area only snapshots these, so empty zones cost nothing and are never created.
const stateZones: Set<Zone> = new Set();
let stateZonesBuilt = false;
// Cannon spins: cannon_rotate plays mcannon_n_turn..mcannon_nw_turn, one step per tick. Only the
// start (an with sp) and the stop (q = -1) are sent; the viewer plays the steps in between.
const SPIN_FIRST_SEQ = 514;
const SPIN_LAST_SEQ = 521;
type Spin = { zone: Zone; x: number; z: number; l: number; s: number; r: number; seq: number; tick: number; startTick: number };
const spins: Map<number, Spin> = new Map();
// Per tick: the anims that continue a spin (not sent), and each zone's stop records.
const spinSteps: Set<LocAnim> = new Set();
const spinStopsJson: Map<Zone, string> = new Map();

function isEnabled(): boolean {
    return Environment.WORLD_FEED;
}

export function isWorldFeedPath(pathname: string): boolean {
    return pathname === '/worldfeed' || pathname === '/worldfeed/';
}

// Returns a Response to refuse the upgrade, or undefined if the socket may connect.
export function checkWorldFeedUpgrade(url: URL): Response | undefined {
    if (!isEnabled()) {
        return new Response('World feed disabled', { status: 404 });
    }
    const token = Environment.WORLD_FEED_TOKEN;
    if (token && url.searchParams.get('token') !== token) {
        return new Response('Forbidden', { status: 403 });
    }
    if (subscribers.size >= Environment.WORLD_FEED_MAX_CLIENTS) {
        return new Response('Too many world feed clients', { status: 503 });
    }
    return undefined;
}

export function onWorldFeedOpen(ws: ServerWebSocket<WebSocketData>): void {
    networkPressure.register(ws, 'world-feed', () => ws.getBufferedAmount(), () => {
        onWorldFeedClose(ws);
        ws.terminate();
    });
    subscribers.set(ws, {
        ws,
        lastActivityAt: Date.now(),
        x0: 0,
        z0: 0,
        x1: 0,
        z1: 0,
        subscribed: false,
        roster: false,
        resync: false,
        players: new Map(),
        npcs: new Map(),
        zones: false,
        area: null,
        areaDirty: false
    });

    send(ws, {
        t: 'hello',
        v: WORLD_FEED_VERSION,
        rev: Environment.engine.revision,
        tick: World.currentTick,
        tickMs: World.tickRate,
        players: World.getTotalPlayers()
    });
}

export function onWorldFeedMessage(ws: ServerWebSocket<WebSocketData>, message: Buffer | string): void {
    const sub = subscribers.get(ws);
    if (!sub || message.length > MAX_CLIENT_MESSAGE_BYTES) {
        return;
    }

    let msg: { t?: unknown; x?: unknown; z?: unknown; w?: unknown; h?: unknown; on?: unknown; zones?: unknown };
    try {
        msg = JSON.parse(message.toString());
    } catch {
        return;
    }

    sub.lastActivityAt = Date.now();
    if (msg.t === 'ping') {
        return;
    }

    if (msg.t === 'sub') {
        const x = toInt(msg.x);
        const z = toInt(msg.z);
        const w = Math.min(Math.max(toInt(msg.w), 0), MAX_RECT_SIZE);
        const h = Math.min(Math.max(toInt(msg.h), 0), MAX_RECT_SIZE);
        sub.x0 = x;
        sub.z0 = z;
        sub.x1 = x + w;
        sub.z1 = z + h;
        sub.subscribed = w > 0 && h > 0;
        sub.areaDirty = true;
        const zones = msg.zones === true;
        if (zones !== sub.zones) {
            // Turned on: the whole area is new. Turned off: nothing more is sent.
            sub.zones = zones;
            sub.area = null;
        }
    } else if (msg.t === 'roster') {
        sub.roster = msg.on === true;
    }
}

export function onWorldFeedClose(ws: ServerWebSocket<WebSocketData>): void {
    subscribers.delete(ws);
    networkPressure.remove(ws);
}

export function cycleWorldFeed(): void {
    if (isEnabled()) {
        indexStateZones();
    }
    expireIdleSubscribers(Date.now());
    if (subscribers.size === 0) {
        return;
    }

    const start = Date.now();
    const tick = World.currentTick;
    const tickMs = lastTickAt > 0 ? start - lastTickAt : World.tickRate;
    lastTickAt = start;

    const rosterDue = tick % ROSTER_INTERVAL_TICKS === 0;
    let busy = false;
    for (const sub of subscribers.values()) {
        if (sub.subscribed || (rosterDue && sub.roster)) {
            busy = true;
            break;
        }
    }
    if (!busy) {
        return;
    }

    try {
        buildBuckets();
        recordJson.clear();
        zoneEventsJson.clear();
        zoneSnapshotJson.clear();
        cycleSpins(tick);

        let roster: string | null = null;
        if (rosterDue) {
            for (const sub of subscribers.values()) {
                if (sub.roster) {
                    roster ??= JSON.stringify(buildRoster(tick));
                    send(sub.ws, roster);
                }
            }
        }

        for (const sub of subscribers.values()) {
            if (sub.subscribed) {
                cycleSubscriber(sub, tick, tickMs);
            }
        }
    } catch (err) {
        printError(err as Error);
    } finally {
        recordJson.clear();
        zoneEventsJson.clear();
        zoneSnapshotJson.clear();
    }

    const elapsed = Date.now() - start;
    if (elapsed >= SLOW_FEED_MS) {
        printInfo(`World feed took ${elapsed}ms for ${subscribers.size} subscriber(s)`);
    }
}

function expireIdleSubscribers(now: number): void {
    const idleTimeoutMs = Environment.WORLD_FEED_IDLE_TIMEOUT_MS;
    for (const [ws, sub] of subscribers) {
        if (now - sub.lastActivityAt >= idleTimeoutMs) {
            onWorldFeedClose(ws);
            try {
                ws.close(1001, 'World feed idle timeout');
            } catch {
                // The socket may already be closing; removing it still frees the slot.
            }
        }
    }
}

function bucketKey(x: number, z: number): number {
    return ((x >> 6) << 8) | (z >> 6);
}

function addToBucket<T>(buckets: Map<number, T[]>, key: number, entity: T): void {
    const list = buckets.get(key);
    if (list) {
        list.push(entity);
    } else {
        buckets.set(key, [entity]);
    }
}

function buildBuckets(): void {
    for (const list of playerBuckets.values()) {
        list.length = 0;
    }
    for (const list of npcBuckets.values()) {
        list.length = 0;
    }

    for (const player of World.playerLoop.all()) {
        if (player.isActive && player.visibility === Visibility.DEFAULT) {
            addToBucket(playerBuckets, bucketKey(player.x, player.z), player);
        }
    }

    activeNpcs = 0;
    for (const npc of World.npcs) {
        if (npc.isActive) {
            activeNpcs++;
            addToBucket(npcBuckets, bucketKey(npc.x, npc.z), npc);
        }
    }
}

function forEachInRect<T extends Player | Npc>(buckets: Map<number, T[]>, sub: Subscriber, fn: (entity: T) => void): void {
    const bx0 = sub.x0 >> 6;
    const bx1 = (sub.x1 - 1) >> 6;
    const bz0 = sub.z0 >> 6;
    const bz1 = (sub.z1 - 1) >> 6;
    for (let bx = bx0; bx <= bx1; bx++) {
        for (let bz = bz0; bz <= bz1; bz++) {
            const list = buckets.get((bx << 8) | bz);
            if (!list) {
                continue;
            }
            for (const entity of list) {
                if (inRect(sub, entity.x, entity.z)) {
                    fn(entity);
                }
            }
        }
    }
}

function cycleSubscriber(sub: Subscriber, tick: number, tickMs: number): void {
    // A slow consumer skips ticks instead of queueing them; it gets a clean resync after.
    if (sub.ws.getBufferedAmount() > MAX_BUFFERED_BYTES) {
        sub.resync = true;
        return;
    }
    const reset = sub.resync;
    if (reset) {
        sub.players.clear();
        sub.npcs.clear();
        sub.resync = false;
    }

    const players: string[] = [];
    forEachInRect(playerBuckets, sub, player => {
        const json = visit(sub.players, player.slot, player, tick, playerRecord);
        if (json) {
            players.push(json);
        }
    });

    const npcs: string[] = [];
    forEachInRect(npcBuckets, sub, npc => {
        const json = visit(sub.npcs, npc.nid, npc, tick, npcRecord);
        if (json) {
            npcs.push(json);
        }
    });

    const removedPlayers = removeUnseen(sub.players, tick);
    const removedNpcs = removeUnseen(sub.npcs, tick);

    const zoneRecords: string[] = [];
    if (sub.zones) {
        cycleZones(sub, reset, zoneRecords);
    }

    let msg = `{"t":"tick","k":${tick},"ms":${tickMs}`;
    if (reset) msg += ',"reset":1';
    if (players.length > 0) msg += `,"p":[${players.join(',')}]`;
    if (npcs.length > 0) msg += `,"n":[${npcs.join(',')}]`;
    if (removedPlayers.length > 0) msg += `,"rp":[${removedPlayers.join(',')}]`;
    if (removedNpcs.length > 0) msg += `,"rn":[${removedNpcs.join(',')}]`;
    if (zoneRecords.length > 0) msg += `,"w":[${zoneRecords.join(',')}]`;
    send(sub.ws, msg + '}');
}

// The held area changes only on 'sub' (or a reset). Every tick only the zones the engine
// tracked a change in are visited, and a gained area only snapshots the zones in stateZones.
function cycleZones(sub: Subscriber, reset: boolean, out: string[]): void {
    let gained = false;
    let before: ZoneArea | null = sub.area;
    if (sub.areaDirty || reset) {
        sub.areaDirty = false;
        const next = rectArea(sub);
        const prev = sub.area;
        if (reset || !prev || prev.x0 !== next.x0 || prev.z0 !== next.z0 || prev.x1 !== next.x1 || prev.z1 !== next.z1) {
            const r = reset ? ',"r":1' : '';
            out.push(`{"e":"za","x":${next.x0 << 3},"z":${next.z0 << 3},"w":${(next.x1 - next.x0) << 3},"h":${(next.z1 - next.z0) << 3}${r}}`);
            gained = true;
            before = reset ? null : prev;
            sub.area = next;
        }
    }

    const area = sub.area;
    if (!area || area.x1 <= area.x0 || area.z1 <= area.z0) {
        return;
    }

    for (const [zone, json] of spinStopsJson) {
        if (inArea(area, zone) && !(gained && !inArea(before, zone))) {
            out.push(json);
        }
    }

    for (const zone of World.zonesTracking) {
        if (!inArea(area, zone) || (gained && !inArea(before, zone))) {
            continue;
        }
        const json = getZoneEventsJson(zone);
        if (json) {
            out.push(json);
        }
    }

    if (gained) {
        // Zones new to the viewer: their state, then their events of this tick.
        const areaZones = (area.x1 - area.x0) * (area.z1 - area.z0) * 4;
        if (stateZones.size <= areaZones) {
            for (const zone of stateZones) {
                if (inArea(area, zone) && !inArea(before, zone)) {
                    pushGainedZone(zone, out);
                }
            }
        } else {
            for (let level = 0; level < 4; level++) {
                for (let zx = area.x0; zx < area.x1; zx++) {
                    for (let zz = area.z0; zz < area.z1; zz++) {
                        const zone = World.gameMap.findZoneIndex(ZoneMap.zoneIndex(zx << 3, zz << 3, level));
                        if (zone && stateZones.has(zone) && !inArea(before, zone)) {
                            pushGainedZone(zone, out);
                        }
                    }
                }
            }
        }
    }
}

function pushGainedZone(zone: Zone, out: string[]): void {
    const snapshot = getZoneSnapshotJson(zone);
    if (snapshot) {
        out.push(snapshot);
    }
    if (World.zonesTracking.has(zone)) {
        const json = getZoneEventsJson(zone);
        if (json) {
            out.push(json);
        }
    }
}

// Every zone (all levels) that overlaps the rect, in zone units [x0, x1) x [z0, z1).
function rectArea(sub: Subscriber): ZoneArea {
    const x0 = Math.max(sub.x0, 0) >> 3;
    const z0 = Math.max(sub.z0, 0) >> 3;
    const x1 = (Math.min(sub.x1 - 1, 0x3fff) >> 3) + 1;
    const z1 = (Math.min(sub.z1 - 1, 0x3fff) >> 3) + 1;
    return { x0, z0, x1: Math.max(x1, x0), z1: Math.max(z1, z0) };
}

function inArea(area: ZoneArea | null, zone: Zone): boolean {
    return area !== null && zone.x >= area.x0 && zone.x < area.x1 && zone.z >= area.z0 && zone.z < area.z1;
}

function spinKey(x: number, z: number, l: number, shape: number): number {
    return ((l * 16384 + x) * 16384 + z) * 32 + shape;
}

// Advances the known spins by this tick's anims, before any zone's events are built. A spin that
// did not take its next step this tick has stopped (out of ammo, picked up) and gets a stop record.
function cycleSpins(tick: number): void {
    spinSteps.clear();
    spinStopsJson.clear();
    for (const [key, spin] of spins) {
        const next = spin.seq === SPIN_LAST_SEQ ? SPIN_FIRST_SEQ : spin.seq + 1;
        let step: LocAnim | null = null;
        if (spin.tick === tick - 1 && World.zonesTracking.has(spin.zone)) {
            for (const event of spin.zone.queuedEvents) {
                const message = event.message;
                if (message instanceof LocAnim && message.seq === next && message.shape === spin.s && zoneTileX(spin.zone, message.coord) === spin.x && zoneTileZ(spin.zone, message.coord) === spin.z) {
                    step = message;
                    break;
                }
            }
        }
        if (step) {
            spin.seq = next;
            spin.tick = tick;
            spinSteps.add(step);
            continue;
        }
        spins.delete(key);
        const stop = `{"e":"an","x":${spin.x},"z":${spin.z},"l":${spin.l},"s":${spin.s},"r":${spin.r},"q":-1}`;
        const json = spinStopsJson.get(spin.zone);
        spinStopsJson.set(spin.zone, json ? `${json},${stop}` : stop);
    }
}

// Keeps stateZones up to date: zones with static objs once, then every zone with an event.
function indexStateZones(): void {
    if (!stateZonesBuilt) {
        stateZonesBuilt = true;
        for (const zone of World.gameMap.allZones()) {
            if (zone.totalObjs > 0) {
                stateZones.add(zone);
            }
        }
    }
    for (const zone of World.zonesTracking) {
        stateZones.add(zone);
    }
}

// Same rules as Zone.writeFullFollows for a player who owns no objs: public objs only, and
// skipping anything updated this tick (this tick's events follow the snapshot).
function getZoneSnapshotJson(zone: Zone): string {
    let json = zoneSnapshotJson.get(zone);
    if (json !== undefined) {
        return json;
    }
    json = '';
    const l = zone.level;
    for (const obj of zone.getAllObjsUnsafe()) {
        if (!obj.isActive || obj.receiver64 !== Obj.NO_RECEIVER || objUpdatedThisTick(zone, obj)) {
            continue;
        }
        if (obj.lifecycle === EntityLifeCycle.DESPAWN || obj.lifecycle === EntityLifeCycle.RESPAWN) {
            json += `${json ? ',' : ''}{"e":"oa","x":${obj.x},"z":${obj.z},"l":${l},"id":${obj.type},"n":${obj.count}}`;
        }
    }
    const currentTick = World.currentTick;
    for (const loc of zone.getAllLocsUnsafe()) {
        if (loc.lastLifecycleTick === currentTick) {
            continue;
        }
        if (loc.lifecycle === EntityLifeCycle.RESPAWN && !loc.isActive) {
            json += `${json ? ',' : ''}{"e":"ld","x":${loc.x},"z":${loc.z},"l":${l},"s":${loc.shape},"r":${loc.angle}}`;
        } else if ((loc.lifecycle === EntityLifeCycle.DESPAWN && loc.isActive) || (loc.lifecycle === EntityLifeCycle.RESPAWN && loc.isChanged())) {
            json += `${json ? ',' : ''}{"e":"la","x":${loc.x},"z":${loc.z},"l":${l},"id":${loc.type},"s":${loc.shape},"r":${loc.angle}}`;
        }
    }
    for (const spin of spins.values()) {
        if (spin.zone === zone && spin.startTick !== currentTick) {
            json += `${json ? ',' : ''}{"e":"an","x":${spin.x},"z":${spin.z},"l":${l},"s":${spin.s},"r":${spin.r},"q":${spin.seq},"sp":1}`;
        }
    }
    if (!json && zone.totalObjs === 0 && !World.zonesTracking.has(zone)) {
        // Back to the cache default; an event puts it back in the index.
        stateZones.delete(zone);
    }
    zoneSnapshotJson.set(zone, json);
    return json;
}

// Zone.updatedThisTick as seen by a spectator, who is never the receiver of a private obj.
function objUpdatedThisTick(zone: Zone, obj: Obj): boolean {
    const events = zone.queuedEventsOf(obj);
    if (!events) {
        return false;
    }
    for (const event of events) {
        const message = event.message;
        if (message instanceof ObjDel || message instanceof ObjReveal || (message instanceof ObjAdd && (event.type === ZoneEventType.ENCLOSED || event.receiver64 === Obj.NO_RECEIVER))) {
            return true;
        }
    }
    return false;
}

// This tick's public events in the order a client applies them: enclosed, then follows.
function getZoneEventsJson(zone: Zone): string {
    let json = zoneEventsJson.get(zone);
    if (json !== undefined) {
        return json;
    }
    const records: string[] = [];
    for (const type of [ZoneEventType.ENCLOSED, ZoneEventType.FOLLOWS]) {
        for (const event of zone.queuedEvents) {
            if (event.type !== type) {
                continue;
            }
            const record = zoneEventRecord(zone, event);
            if (record) {
                records.push(JSON.stringify(record));
            }
        }
    }
    json = records.join(',');
    zoneEventsJson.set(zone, json);
    return json;
}

function zoneEventRecord(zone: Zone, event: ZoneEvent): FeedRecord | null {
    // Enclosed events are shared with every player in view; follows only when public.
    if (event.type === ZoneEventType.FOLLOWS && event.receiver64 !== Obj.NO_RECEIVER) {
        return null;
    }
    const message = event.message;
    const l = zone.level;
    if (message instanceof LocAddChange) {
        return { e: 'la', x: zoneTileX(zone, message.coord), z: zoneTileZ(zone, message.coord), l, id: message.loc, s: message.shape, r: message.angle };
    } else if (message instanceof LocDel) {
        return { e: 'ld', x: zoneTileX(zone, message.coord), z: zoneTileZ(zone, message.coord), l, s: message.shape, r: message.angle };
    } else if (message instanceof LocAnim) {
        const x = zoneTileX(zone, message.coord);
        const z = zoneTileZ(zone, message.coord);
        if (message.seq >= SPIN_FIRST_SEQ && message.seq <= SPIN_LAST_SEQ) {
            if (spinSteps.has(message)) {
                return null;
            }
            const tick = World.currentTick;
            spins.set(spinKey(x, z, l, message.shape), { zone, x, z, l, s: message.shape, r: message.angle, seq: message.seq, tick, startTick: tick });
            return { e: 'an', x, z, l, s: message.shape, r: message.angle, q: message.seq, sp: 1 };
        }
        return { e: 'an', x, z, l, s: message.shape, r: message.angle, q: message.seq };
    } else if (message instanceof LocMerge) {
        return {
            e: 'lm',
            x: message.srcX,
            z: message.srcZ,
            l,
            id: message.locId,
            s: message.shape,
            r: message.angle,
            sc: message.startCycle,
            ec: message.endCycle,
            p: message.playerSlot,
            bx: [message.east, message.south, message.west, message.north]
        };
    } else if (message instanceof ObjAdd || message instanceof ObjReveal) {
        // for everyone but the owner (and so for a spectator) a reveal is an add
        return { e: 'oa', x: zoneTileX(zone, message.coord), z: zoneTileZ(zone, message.coord), l, id: message.obj, n: message.count };
    } else if (message instanceof ObjDel) {
        return { e: 'od', x: zoneTileX(zone, message.coord), z: zoneTileZ(zone, message.coord), l, id: message.obj };
    } else if (message instanceof ObjCount) {
        return { e: 'oc', x: zoneTileX(zone, message.coord), z: zoneTileZ(zone, message.coord), l, id: message.obj, n0: message.oldCount, n: message.newCount };
    } else if (message instanceof MapAnim) {
        return { e: 'ma', x: zoneTileX(zone, message.coord), z: zoneTileZ(zone, message.coord), l, id: message.spotanim, h: message.height, d: message.delay };
    } else if (message instanceof MapProjAnim) {
        return {
            e: 'pj',
            x: message.srcX,
            z: message.srcZ,
            l,
            dx: message.dstX,
            dz: message.dstZ,
            tg: message.target,
            id: message.spotanim,
            sh: message.srcHeight,
            dh: message.dstHeight,
            sd: message.startDelay,
            ed: message.endDelay,
            pk: message.peak,
            ar: message.arc
        };
    }
    return null;
}

function zoneTileX(zone: Zone, coord: number): number {
    return (zone.x << 3) | ((coord >> 4) & 0x7);
}

function zoneTileZ(zone: Zone, coord: number): number {
    return (zone.z << 3) | (coord & 0x7);
}

// Updates what the subscriber knows about an entity and returns its record for this tick.
function visit<T extends Player | Npc>(
    known: Map<number, KnownEntity>,
    id: number,
    entity: T,
    tick: number,
    build: (entity: T, prev: Position | null) => FeedRecord | null
): string | null {
    const prev = known.get(id);
    let json: string | null;
    if (!prev || prev.ref !== entity) {
        json = getRecordJson(entity, 'full', () => build(entity, null));
        if (json === null && entity instanceof Player) {
            // no appearance yet; try again next tick
            return null;
        }
        known.set(id, { ref: entity, x: entity.x, z: entity.z, level: entity.level, seen: tick });
        return json;
    }

    if (prev.x === entity.lastTickX && prev.z === entity.lastTickZ && prev.level === entity.lastLevel) {
        // The usual case: this subscriber saw it last tick, so the shared delta applies.
        json = getRecordJson(entity, 'delta', () => build(entity, { x: entity.lastTickX, z: entity.lastTickZ, level: entity.lastLevel }));
    } else {
        const record = build(entity, prev);
        json = record ? JSON.stringify(record) : null;
    }
    prev.x = entity.x;
    prev.z = entity.z;
    prev.level = entity.level;
    prev.seen = tick;
    return json;
}

function getRecordJson(entity: Player | Npc, kind: 'full' | 'delta', build: () => FeedRecord | null): string | null {
    let cached = recordJson.get(entity);
    if (!cached) {
        cached = {};
        recordJson.set(entity, cached);
    }
    let json = cached[kind];
    if (json === undefined) {
        const record = build();
        json = record ? JSON.stringify(record) : null;
        cached[kind] = json;
    }
    return json;
}

function playerRecord(player: Player, known: Position | null): FeedRecord | null {
    const masks = player.masks;
    const record: FeedRecord = { i: player.slot };
    let changed = false;

    if (!known) {
        const appearance = getAppearanceBase64(player);
        if (!appearance) {
            return null;
        }
        record.f = 1;
        record.x = player.x;
        record.z = player.z;
        record.l = player.level;
        record.ap = appearance;
        if (player.faceEntity !== -1) {
            record.fe = player.faceEntity;
        }
        if (player.faceAngleX !== -1) {
            record.fs = [player.faceAngleX, player.faceAngleZ];
        }
        changed = true;
    } else {
        changed = addMovement(record, player.x, player.z, player.level, player.walkDir, player.runDir, player.tele, player.jump, known);
        if (masks & PlayerInfoProt.APPEARANCE) {
            const appearance = getAppearanceBase64(player);
            if (appearance) {
                record.ap = appearance;
                changed = true;
            }
        }
        if (masks & PlayerInfoProt.FACE_ENTITY) {
            record.fe = player.faceEntity;
            changed = true;
        }
        if (masks & PlayerInfoProt.FACE_COORD) {
            record.fs = [player.faceSquareX, player.faceSquareZ];
            changed = true;
        }
    }

    if (masks & PlayerInfoProt.ANIM) {
        record.an = [player.animId, player.animDelay];
        changed = true;
    }
    if (masks & PlayerInfoProt.SPOT_ANIM) {
        record.sp = [player.spotanimId, player.spotanimHeight, player.spotanimTime];
        changed = true;
    }
    if (masks & (PlayerInfoProt.DAMAGE | PlayerInfoProt.DAMAGE2)) {
        record.hm = hitmarks(masks & PlayerInfoProt.DAMAGE, masks & PlayerInfoProt.DAMAGE2, player.hitmarkDamage, player.hitmarkType, player.hitmark2Damage, player.hitmark2Type);
        record.hp = [player.levels[PlayerStat.HITPOINTS], player.baseLevels[PlayerStat.HITPOINTS]];
        changed = true;
    }
    if (masks & PlayerInfoProt.SAY && player.sayMessage) {
        record.sy = player.sayMessage;
        changed = true;
    }
    if (masks & PlayerInfoProt.CHAT && player.chatMessage) {
        record.ch = unpackChat(player.chatMessage);
        record.cc = [player.chatColour ?? 0, player.chatEffect ?? 0];
        changed = true;
    }
    if (masks & PlayerInfoProt.EXACT_MOVE) {
        record.em = [player.exactStartX, player.exactStartZ, player.exactEndX, player.exactEndZ, player.exactMoveStart, player.exactMoveEnd, player.exactMoveFacing];
        changed = true;
    }

    return changed ? record : null;
}

function npcRecord(npc: Npc, known: Position | null): FeedRecord | null {
    const masks = npc.masks;
    const record: FeedRecord = { i: npc.nid };
    let changed = false;

    if (!known) {
        record.f = 1;
        record.t = npc.type;
        record.x = npc.x;
        record.z = npc.z;
        record.l = npc.level;
        if (npc.faceEntity !== -1) {
            record.fe = npc.faceEntity;
        }
        if (npc.faceAngleX !== -1) {
            record.fs = [npc.faceAngleX, npc.faceAngleZ];
        }
        changed = true;
    } else {
        changed = addMovement(record, npc.x, npc.z, npc.level, npc.walkDir, npc.runDir, npc.tele, npc.jump, known);
        if (masks & NpcInfoProt.CHANGE_TYPE) {
            record.t = npc.type;
            changed = true;
        }
        if (masks & NpcInfoProt.FACE_ENTITY) {
            record.fe = npc.faceEntity;
            changed = true;
        }
        if (masks & NpcInfoProt.FACE_COORD) {
            record.fs = [npc.faceSquareX, npc.faceSquareZ];
            changed = true;
        }
    }

    if (masks & NpcInfoProt.ANIM) {
        record.an = [npc.animId, npc.animDelay];
        changed = true;
    }
    if (masks & NpcInfoProt.SPOT_ANIM) {
        record.sp = [npc.spotanimId, npc.spotanimHeight, npc.spotanimTime];
        changed = true;
    }
    if (masks & (NpcInfoProt.DAMAGE | NpcInfoProt.DAMAGE2)) {
        record.hm = hitmarks(masks & NpcInfoProt.DAMAGE, masks & NpcInfoProt.DAMAGE2, npc.hitmarkDamage, npc.hitmarkType, npc.hitmark2Damage, npc.hitmark2Type);
        record.hp = [npc.levels[NpcStat.HITPOINTS], npc.baseLevels[NpcStat.HITPOINTS]];
        changed = true;
    }
    if (masks & NpcInfoProt.SAY && npc.sayMessage) {
        record.sy = npc.sayMessage;
        changed = true;
    }

    return changed ? record : null;
}

// Positions are always absolute; steps let the viewer animate the exact route walked.
function addMovement(record: FeedRecord, x: number, z: number, level: number, walkDir: number, runDir: number, tele: boolean, jump: boolean, known: Position): boolean {
    if (x === known.x && z === known.z && level === known.level) {
        return false;
    }
    record.x = x;
    record.z = z;
    record.l = level;
    if (tele || walkDir === -1 || level !== known.level) {
        record.tp = jump || level !== known.level ? 2 : 1;
    } else {
        record.m = runDir === -1 ? [walkDir] : [walkDir, runDir];
    }
    return true;
}

function hitmarks(primary: number, secondary: number, damage: number, type: number, damage2: number, type2: number): number[][] {
    const marks: number[][] = [];
    if (primary) {
        marks.push([damage, type]);
    }
    if (secondary) {
        marks.push([damage2, type2]);
    }
    return marks;
}

function buildRoster(tick: number): FeedRecord {
    const players: (string | number)[][] = [];
    for (const player of World.playerLoop.all()) {
        if (!player.isActive || player.visibility !== Visibility.DEFAULT) {
            continue;
        }
        players.push([player.slot, player.displayName, player.x, player.z, player.level, player.combatLevel]);
    }
    return { t: 'roster', k: tick, p: players, npcs: activeNpcs };
}

function removeUnseen(known: Map<number, KnownEntity>, tick: number): number[] {
    const removed: number[] = [];
    for (const [id, entity] of known) {
        if (entity.seen !== tick) {
            removed.push(id);
            known.delete(id);
        }
    }
    return removed;
}

function getAppearanceBase64(player: Player): string | null {
    const buf = player.appearanceBuf;
    if (!buf) {
        return null;
    }
    const cached = appearanceBase64.get(player.slot);
    if (cached && cached.buf === buf) {
        return cached.b64;
    }
    const b64 = Buffer.from(buf).toString('base64');
    appearanceBase64.set(player.slot, { buf, b64 });
    return b64;
}

function unpackChat(message: Uint8Array): string {
    const buf: Packet = Packet.alloc(1);
    try {
        buf.pdata(message, 0, message.length);
        buf.pos = 0;
        return WordPack.unpack(buf, message.length);
    } finally {
        buf.release();
    }
}

function inRect(sub: Subscriber, x: number, z: number): boolean {
    return x >= sub.x0 && x < sub.x1 && z >= sub.z0 && z < sub.z1;
}

function toInt(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

// Always compress, even though it costs tick-thread CPU (~7 ms per MB). WebKit drops
// (1006) a permessage-deflate socket that mixes compressed and uncompressed messages,
// so the choice can't follow tick time the way the gateway relay's does.
function send(ws: ServerWebSocket<WebSocketData>, msg: FeedRecord | string): void {
    if (!networkPressure.beforeSend(ws)) return;
    try {
        networkPressure.afterSend(ws, ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg), true));
    } catch {
        onWorldFeedClose(ws);
        ws.terminate();
    }
}

// Map dashboards can share one immutable JSON snapshot for a second.
let positionsAt = -Infinity;
let positionsJson = '[]';
export function getPlayerPositionsJson(now = Date.now()): string {
    if (now - positionsAt >= 1000 || now < positionsAt) {
        positionsJson = JSON.stringify([...World.playerLoop.all()].map(player => ({
            x: player.x, z: player.z, level: player.level, name: player.displayName
        })));
        positionsAt = now;
    }
    return positionsJson;
}
