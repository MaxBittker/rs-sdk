import type { ServerWebSocket } from 'bun';

import { CoordGrid } from '#/engine/CoordGrid.js';
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
//   client -> {t:'sub', x, z, w, h}     subscribe to tiles [x, x+w) x [z, z+h), all levels; w = h = 0
//                                       unsubscribes (applied at most once every AREA_MIN_TICKS ticks)
//             {t:'roster', on}          toggle the all-player roster
//   server -> {t:'hello', v, rev, tick, tickMs, players}
//             {t:'tick', k, ms, p?, n?, rp?, rn?, reset?, w?}  once per tick while subscribed
//             {t:'roster', k, p: [[slot, name, x, z, level, combat], ...], npcs}  the first one
//             {t:'roster', k, d:1, j, lv, m, npcs}  after that: changes since the previous one,
//                j  [[slot, name, x, z, level, combat], ...] joined (or slot taken over by someone else)
//                lv [slot, ...] left      m  [[slot, x, z, level, combat?], ...] moved (combat if changed)
//
// Entity records (keys only present when relevant):
//   i     player slot / npc nid           f   1 = first sight: a full record, replaces any entity in that slot
//   t     npc type (first sight + change_type)
//   x,z,l tile coords: first sight, teleport, or steps from a tile the viewer didn't have. Left out
//         when the steps in m start from where the entity was last tick: apply them from there.
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
// Zone records (w): what every player sees of the engine's 8x8 zones besides players and npcs.
// Absolute tiles x, z and level l; apply in order.
//   za    {x, z, w, h, r?} held area (zone-aligned tiles, all levels), first in w when it changes:
//         zones newly held start at the cache default with no objs, zones outside are dropped
//         (r = reset: every zone in it starts again). The current loc state and public ground
//         objs of newly held zones follow, then their events of this tick.
//   la    {x, z, l, id, s, r} loc add/change    ld  {x, z, l, s, r} loc del
//   an    {x, z, l, s, r, q} loc anim           lm  {x, z, l, id, s, r, sc, ec, p, bx} loc merge
//   oa    {x, z, l, id, n} public ground obj add, or a private obj revealed (id = obj type, n = count)
//   od    {x, z, l, id} one obj of that type leaves the tile
//   oc    {x, z, l, id, n0, n} obj stack count change
//   Private objs (visible to one player only) are never sent; for a viewer a reveal is an add.
//   ma    {x, z, l, id, h, d} map anim
//   pj    {x, z, l, dx, dz, tg, id, sh, dh, sd, ed, pk, ar} projectile (dx, dz absolute destination)
//   Locs (la, ld, an, lm) are never sent for the wilderness: remote rock and door state.

const WORLD_FEED_VERSION = 2;
const MAX_RECT_SIZE = 384;
const MAX_BUFFERED_BYTES = 1 << 20;
const ROSTER_INTERVAL_TICKS = 10;
const MAX_CLIENT_MESSAGE_BYTES = 1024;
const SLOW_FEED_MS = 20;
// A new area costs first-sight records for everything in it; spread rapid pans out.
const AREA_MIN_TICKS = 2;

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

type Rect = { x0: number; z0: number; x1: number; z1: number };
type ZoneArea = Rect;

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
    // Latest requested rect, applied at the next allowed tick.
    pending: Rect | null;
    areaTick: number;
    // The tick of the last roster this viewer got, and the zone area it holds.
    rosterTick: number;
    area: ZoneArea | null;
    areaDirty: boolean;
};

type RosterEntry = [slot: number, name: string, x: number, z: number, level: number, combat: number];

// This tick's zone records, built once and shared: all of them, and only the ones that follow a
// snapshot (for a zone a viewer just gained, whose loc state comes from the snapshot instead).
// Obj records follow a snapshot too: it leaves out the objs that changed this tick.
type ZoneTick = { zone: Zone; all: string; transient: string };

const subscribers: Map<ServerWebSocket<WebSocketData>, Subscriber> = new Map();
const appearanceBase64: Map<number, { buf: Uint8Array; b64: string }> = new Map();
let lastTickAt = 0;

// Rebuilt every tick: active entities by 64x64 map square.
// The bucket arrays are reused across ticks to keep the tick thread's garbage down.
// Flat arrays indexed by (squareX << 8 | squareZ), plus the keys in use to reset them.
const playerBuckets: (Player[] | undefined)[] = new Array(1 << 16);
const npcBuckets: (Npc[] | undefined)[] = new Array(1 << 16);
const playerBucketKeys: number[] = [];
const npcBucketKeys: number[] = [];
let activeNpcs = 0;

let rosterPrev: Map<number, RosterEntry> | null = null;
let rosterPrevTick = -1;

// Zones whose locs differ from the cache default, with their loc records (la/ld). Kept up to
// date from the zones that had loc events, so a viewer gaining an area only looks at these.
const locState: Map<Zone, string> = new Map();
const zoneTicks: ZoneTick[] = [];
const zoneTickByZone: Map<Zone, ZoneTick> = new Map();
// Per tick: the public ground objs of a zone, built once for every viewer that gains it.
const objSnapshots: Map<Zone, string> = new Map();

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
        pending: null,
        areaTick: -Infinity,
        rosterTick: -1,
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

    let msg: { t?: unknown; x?: unknown; z?: unknown; w?: unknown; h?: unknown; on?: unknown };
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
        sub.pending = { x0: x, z0: z, x1: x + w, z1: z + h };
    } else if (msg.t === 'roster') {
        sub.roster = msg.on === true;
        if (!sub.roster) {
            sub.rosterTick = -1;
        }
    }
}

export function onWorldFeedClose(ws: ServerWebSocket<WebSocketData>): void {
    subscribers.delete(ws);
    networkPressure.remove(ws);
}

export function cycleWorldFeed(): void {
    if (isEnabled()) {
        indexLocState();
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
        applyPendingArea(sub, tick);
        if (sub.subscribed || (rosterDue && sub.roster)) {
            busy = true;
        }
    }
    if (!busy) {
        return;
    }

    try {
        buildBuckets();
        buildZoneTicks();

        if (rosterDue) {
            sendRosters(tick);
        }


        for (const sub of subscribers.values()) {
            if (sub.subscribed) {
                cycleSubscriber(sub, tick, tickMs);
            }
        }
    } catch (err) {
        printError(err as Error);
    } finally {
        zoneTicks.length = 0;
        zoneTickByZone.clear();
        objSnapshots.clear();
    }

    const elapsed = Date.now() - start;
    if (elapsed >= SLOW_FEED_MS) {
        printInfo(`World feed took ${elapsed}ms for ${subscribers.size} subscriber(s)`);
    }
}

function applyPendingArea(sub: Subscriber, tick: number): void {
    const rect = sub.pending;
    if (!rect || tick - sub.areaTick < AREA_MIN_TICKS) {
        return;
    }
    sub.pending = null;
    if (rect.x0 === sub.x0 && rect.z0 === sub.z0 && rect.x1 === sub.x1 && rect.z1 === sub.z1 && sub.subscribed) {
        return;
    }
    sub.areaTick = tick;
    const subscribed = rect.x1 > rect.x0 && rect.z1 > rect.z0;
    if (subscribed && !sub.subscribed) {
        // Nothing was streamed while unsubscribed: start clean instead of trusting old state.
        sub.resync = true;
    } else if (!subscribed) {
        sub.players.clear();
        sub.npcs.clear();
        sub.area = null;
    }
    sub.x0 = rect.x0;
    sub.z0 = rect.z0;
    sub.x1 = rect.x1;
    sub.z1 = rect.z1;
    sub.subscribed = subscribed;
    sub.areaDirty = true;
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
    return (((x >> 6) & 0xff) << 8) | ((z >> 6) & 0xff);
}

function addToBucket<T>(buckets: (T[] | undefined)[], keys: number[], key: number, entity: T): void {
    const list = buckets[key];
    if (list) {
        if (list.length === 0) keys.push(key);
        list.push(entity);
    } else {
        buckets[key] = [entity];
        keys.push(key);
    }
}

function buildBuckets(): void {
    for (const key of playerBucketKeys) {
        playerBuckets[key]!.length = 0;
    }
    playerBucketKeys.length = 0;
    for (const key of npcBucketKeys) {
        npcBuckets[key]!.length = 0;
    }
    npcBucketKeys.length = 0;

    for (const player of World.playerLoop.all()) {
        if (player.isActive && player.visibility === Visibility.DEFAULT) {
            addToBucket(playerBuckets, playerBucketKeys, bucketKey(player.x, player.z), player);
        }
    }

    activeNpcs = 0;
    for (const npc of World.npcs) {
        if (npc.isActive) {
            activeNpcs++;
            addToBucket(npcBuckets, npcBucketKeys, bucketKey(npc.x, npc.z), npc);
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

    let seenPlayers = 0;
    let seenNpcs = 0;
    const players: string[] = [];
    const npcs: string[] = [];
    const bx0 = sub.x0 >> 6;
    const bx1 = (sub.x1 - 1) >> 6;
    const bz0 = sub.z0 >> 6;
    const bz1 = (sub.z1 - 1) >> 6;
    for (let bx = bx0; bx <= bx1; bx++) {
        for (let bz = bz0; bz <= bz1; bz++) {
            const key = ((bx & 0xff) << 8) | (bz & 0xff);
            const playerList = playerBuckets[key];
            if (playerList) {
                visitSeen = 0;
                for (let i = 0; i < playerList.length; i++) {
                    const player = playerList[i];
                    if (inRect(sub, player.x, player.z)) {
                        const json = visit(sub.players, player.slot, player, tick, playerCache);
                        if (json) players.push(json);
                    }
                }
                seenPlayers += visitSeen;
            }
            const npcList = npcBuckets[key];
            if (npcList) {
                visitSeen = 0;
                for (let i = 0; i < npcList.length; i++) {
                    const npc = npcList[i];
                    if (inRect(sub, npc.x, npc.z)) {
                        const json = visit(sub.npcs, npc.nid, npc, tick, npcCache);
                        if (json) npcs.push(json);
                    }
                }
                seenNpcs += visitSeen;
            }
        }
    }

    // Everything known was seen again (the usual tick): nothing to look for.
    const removedPlayers = seenPlayers === sub.players.size ? NONE : removeUnseen(sub.players, tick);
    const removedNpcs = seenNpcs === sub.npcs.size ? NONE : removeUnseen(sub.npcs, tick);

    let msg = `{"t":"tick","k":${tick},"ms":${tickMs}`;
    if (reset) msg += ',"reset":1';
    if (players.length > 0) msg += `,"p":[${players.join(',')}]`;
    if (npcs.length > 0) msg += `,"n":[${npcs.join(',')}]`;
    if (removedPlayers.length > 0) msg += `,"rp":[${removedPlayers.join(',')}]`;
    if (removedNpcs.length > 0) msg += `,"rn":[${removedNpcs.join(',')}]`;
    const zoneRecords: string[] = [];
    cycleZones(sub, reset, zoneRecords);
    if (zoneRecords.length > 0) msg += `,"w":[${zoneRecords.join(',')}]`;
    send(sub.ws, msg + '}');
}

// Per-tick serialized records, indexed by player slot / npc nid and stamped with the tick they
// were built in (no clearing, no per-visit allocation): full (first sight) and delta (vs last
// tick). null = nothing to send.
class RecordCache {
    full: (string | null)[] = [];
    delta: (string | null)[] = [];
    fullTick: number[] = [];
    deltaTick: number[] = [];
}
const playerCache = new RecordCache();
// Entries visit() marked seen since last reset; when every known entity was seen, nothing left.
let visitSeen = 0;
const NONE: number[] = [];
const npcCache = new RecordCache();

// known: the tile the viewer has for the entity (null = first sight); fromLastTick: known is
// where the entity was last tick, so exact steps can go without coords.
function buildRecord(entity: Player | Npc, known: Position | null, fromLastTick: boolean): FeedRecord | null {
    return entity instanceof Player ? playerRecord(entity, known, fromLastTick) : npcRecord(entity as Npc, known, fromLastTick);
}

function stringify(record: FeedRecord | null): string | null {
    return record ? JSON.stringify(record) : null;
}

// Updates what the subscriber knows about an entity and returns its record for this tick.
function visit(known: Map<number, KnownEntity>, id: number, entity: Player | Npc, tick: number, cache: RecordCache): string | null {
    const prev = known.get(id);
    let json: string | null;
    if (!prev || prev.ref !== entity) {
        if (cache.fullTick[id] === tick) {
            json = cache.full[id];
        } else {
            json = stringify(buildRecord(entity, null, false));
            cache.full[id] = json;
            cache.fullTick[id] = tick;
        }
        if (json === null && entity instanceof Player) {
            // no appearance yet; try again next tick
            return null;
        }
        visitSeen++;
        if (prev) {
            prev.ref = entity;
            prev.x = entity.x;
            prev.z = entity.z;
            prev.level = entity.level;
            prev.seen = tick;
        } else {
            known.set(id, { ref: entity, x: entity.x, z: entity.z, level: entity.level, seen: tick });
        }
        return json;
    }

    if (prev.x === entity.lastTickX && prev.z === entity.lastTickZ && prev.level === entity.lastLevel) {
        // The usual case: this subscriber saw it last tick, so the shared delta applies.
        if (cache.deltaTick[id] === tick) {
            json = cache.delta[id];
        } else {
            json = stringify(buildRecord(entity, prev, true));
            cache.delta[id] = json;
            cache.deltaTick[id] = tick;
        }
    } else {
        // Out of step with the entity (it was out of view): send coords to catch up.
        json = stringify(buildRecord(entity, prev, false));
    }
    prev.x = entity.x;
    prev.z = entity.z;
    prev.level = entity.level;
    prev.seen = tick;
    visitSeen++;
    return json;
}

function playerRecord(player: Player, known: Position | null, fromLastTick: boolean): FeedRecord | null {
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
        changed = addMovement(record, player.x, player.z, player.level, player.walkDir, player.runDir, player.tele, player.jump, known, fromLastTick);
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

function npcRecord(npc: Npc, known: Position | null, fromLastTick: boolean): FeedRecord | null {
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
        changed = addMovement(record, npc.x, npc.z, npc.level, npc.walkDir, npc.runDir, npc.tele, npc.jump, known, fromLastTick);
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

// Steps let the viewer animate the exact route walked; the coords go along unless the steps from
// last tick's tile land exactly on them.
function addMovement(record: FeedRecord, x: number, z: number, level: number, walkDir: number, runDir: number, tele: boolean, jump: boolean, known: Position, fromLastTick: boolean): boolean {
    if (x === known.x && z === known.z && level === known.level) {
        return false;
    }
    if (tele || walkDir === -1 || level !== known.level) {
        record.x = x;
        record.z = z;
        record.l = level;
        record.tp = jump || level !== known.level ? 2 : 1;
        return true;
    }
    if (!fromLastTick || !stepsLandOn(known, walkDir, runDir, x, z)) {
        record.x = x;
        record.z = z;
        record.l = level;
    }
    record.m = runDir === -1 ? [walkDir] : [walkDir, runDir];
    return true;
}

// CoordGrid.deltaX/deltaZ by direction (NW=0 .. SE=7).
const STEP_X = Int8Array.from({ length: 8 }, (_, dir) => CoordGrid.deltaX(dir));
const STEP_Z = Int8Array.from({ length: 8 }, (_, dir) => CoordGrid.deltaZ(dir));

function stepsLandOn(from: Position, walkDir: number, runDir: number, x: number, z: number): boolean {
    let sx = from.x + STEP_X[walkDir];
    let sz = from.z + STEP_Z[walkDir];
    if (runDir !== -1) {
        sx += STEP_X[runDir];
        sz += STEP_Z[runDir];
    }
    return sx === x && sz === z;
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

// ---- roster ----

// The full roster is one JSON string shared by every viewer that needs a fresh start; the delta
// (vs the previous roster) is shared by the others.
function sendRosters(tick: number): void {
    let wanted = false;
    for (const sub of subscribers.values()) {
        if (sub.roster) {
            wanted = true;
            break;
        }
    }
    if (!wanted) {
        return;
    }

    const entries: RosterEntry[] = [];
    const current: Map<number, RosterEntry> = new Map();
    for (const player of World.playerLoop.all()) {
        if (!player.isActive || player.visibility !== Visibility.DEFAULT) {
            continue;
        }
        const entry: RosterEntry = [player.slot, player.displayName, player.x, player.z, player.level, player.combatLevel];
        entries.push(entry);
        current.set(player.slot, entry);
    }

    const prev = rosterPrev;
    const prevTick = rosterPrevTick;
    let full: string | null = null;
    let delta: string | null = null;
    for (const sub of subscribers.values()) {
        if (!sub.roster) {
            continue;
        }
        if (prev && sub.rosterTick === prevTick) {
            delta ??= rosterDelta(tick, prev, current);
            send(sub.ws, delta);
        } else {
            full ??= JSON.stringify({ t: 'roster', k: tick, p: entries, npcs: activeNpcs });
            send(sub.ws, full);
        }
        sub.rosterTick = tick;
    }
    rosterPrev = current;
    rosterPrevTick = tick;
}

function rosterDelta(tick: number, prev: Map<number, RosterEntry>, current: Map<number, RosterEntry>): string {
    const joined: RosterEntry[] = [];
    const left: number[] = [];
    const moved: number[][] = [];
    for (const [slot, entry] of current) {
        const old = prev.get(slot);
        if (!old || old[1] !== entry[1]) {
            joined.push(entry);
        } else if (old[2] !== entry[2] || old[3] !== entry[3] || old[4] !== entry[4] || old[5] !== entry[5]) {
            moved.push(old[5] === entry[5] ? [slot, entry[2], entry[3], entry[4]] : [slot, entry[2], entry[3], entry[4], entry[5]]);
        }
    }
    for (const slot of prev.keys()) {
        if (!current.has(slot)) {
            left.push(slot);
        }
    }
    return JSON.stringify({ t: 'roster', k: tick, d: 1, j: joined, lv: left, m: moved, npcs: activeNpcs });
}

// ---- zones ----

function isWilderness(x: number, z: number): boolean {
    return x >= 2944 && x < 3392 && ((z >= 3520 && z < 6400) || (z >= 9920 && z < 12800));
}

// Locs are hidden in the wilderness (remote rock and door state); zones are 8x8 and the
// wilderness bounds are zone-aligned, so the zone's origin decides.
function hidesLocs(zone: Zone): boolean {
    return isWilderness(zone.x << 3, zone.z << 3);
}

// Every tick, even with no viewers: re-snapshot the zones whose locs changed, so the index of
// zones that differ from the cache stays exact. Only zones with loc events are scanned.
function indexLocState(): void {
    for (const zone of World.zonesTracking) {
        if (!hasLocStateEvent(zone) || hidesLocs(zone)) {
            continue;
        }
        const snapshot = locSnapshot(zone);
        if (snapshot) {
            locState.set(zone, snapshot);
        } else {
            locState.delete(zone);
        }
    }
}

function hasLocStateEvent(zone: Zone): boolean {
    for (const event of zone.queuedEvents) {
        if (event.message instanceof LocAddChange || event.message instanceof LocDel) {
            return true;
        }
    }
    return false;
}

// The zone's locs that differ from the cache, as Zone.writeFullFollows sends them.
function locSnapshot(zone: Zone): string {
    let json = '';
    const l = zone.level;
    for (const loc of zone.getAllLocsUnsafe()) {
        if (loc.lifecycle === EntityLifeCycle.RESPAWN && !loc.isActive) {
            json += `${json ? ',' : ''}{"e":"ld","x":${loc.x},"z":${loc.z},"l":${l},"s":${loc.shape},"r":${loc.angle}}`;
        } else if ((loc.lifecycle === EntityLifeCycle.DESPAWN && loc.isActive) || (loc.lifecycle === EntityLifeCycle.RESPAWN && loc.isActive && loc.isChanged())) {
            json += `${json ? ',' : ''}{"e":"la","x":${loc.x},"z":${loc.z},"l":${l},"id":${loc.type},"s":${loc.shape},"r":${loc.angle}}`;
        }
    }
    return json;
}

function buildZoneTicks(): void {
    for (const zone of World.zonesTracking) {
        const hideLocs = hidesLocs(zone);
        let all = '';
        let transient = '';
        // Enclosed events first, then follows: the order a client applies them.
        for (const type of [ZoneEventType.ENCLOSED, ZoneEventType.FOLLOWS]) {
            for (const event of zone.queuedEvents) {
                if (event.type !== type) {
                    continue;
                }
                const record = zoneEventRecord(zone, event, hideLocs);
                if (!record) {
                    continue;
                }
                const json = JSON.stringify(record);
                all += all ? ',' + json : json;
                if (record.e === 'an' || record.e === 'ma' || record.e === 'pj' || record.e === 'oa' || record.e === 'od' || record.e === 'oc') {
                    transient += transient ? ',' + json : json;
                }
            }
        }
        if (all) {
            const entry = { zone, all, transient };
            zoneTicks.push(entry);
            zoneTickByZone.set(zone, entry);
        }
    }
}

// The public ground objs of a zone, as Zone.writeFullFollows sends them to a player who owns
// none: skipping the objs that changed this tick, whose events follow the snapshot.
function objSnapshot(zone: Zone): string {
    let json = objSnapshots.get(zone);
    if (json !== undefined) {
        return json;
    }
    json = '';
    const l = zone.level;
    for (const obj of zone.getAllObjsUnsafe()) {
        if (!obj.isActive || obj.receiver64 !== Obj.NO_RECEIVER || obj.lifecycle === EntityLifeCycle.FOREVER || objChangedThisTick(zone, obj)) {
            continue;
        }
        json += `${json ? ',' : ''}{"e":"oa","x":${obj.x},"z":${obj.z},"l":${l},"id":${obj.type},"n":${obj.count}}`;
    }
    objSnapshots.set(zone, json);
    return json;
}

// Zone.updatedThisTick for a player who owns no objs.
function objChangedThisTick(zone: Zone, obj: Obj): boolean {
    const events = zone.queuedEventsOf(obj);
    if (!events) {
        return false;
    }
    for (const event of events) {
        const message = event.message;
        if (message instanceof ObjDel || message instanceof ObjReveal || (message instanceof ObjAdd && event.receiver64 === Obj.NO_RECEIVER)) {
            return true;
        }
    }
    return false;
}

// The held area changes only when the applied rect does (or on a reset). Every tick only the
// zones with events are visited. A gained area looks up each newly held zone that exists,
// without creating any: its loc state, public objs and this tick's events.
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

    for (const entry of zoneTicks) {
        const zone = entry.zone;
        if (!inArea(area, zone)) {
            continue;
        }
        if (!gained || inArea(before, zone)) {
            out.push(entry.all);
        }
    }

    if (gained) {
        // Newly held zones: their current locs and public objs, then this tick's effects.
        for (let level = 0; level < 4; level++) {
            for (let zx = area.x0; zx < area.x1; zx++) {
                for (let zz = area.z0; zz < area.z1; zz++) {
                    const zone = World.gameMap.findZone(ZoneMap.zoneIndex(zx << 3, zz << 3, level));
                    if (!zone || inArea(before, zone)) {
                        continue;
                    }
                    const locs = locState.get(zone);
                    if (locs) {
                        out.push(locs);
                    }
                    if (zone.totalObjs > 0) {
                        const objs = objSnapshot(zone);
                        if (objs) {
                            out.push(objs);
                        }
                    }
                    const transient = zoneTickByZone.get(zone)?.transient;
                    if (transient) {
                        out.push(transient);
                    }
                }
            }
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

// Public locs, objs and map effects only: no private objs, and no locs where they are hidden.
function zoneEventRecord(zone: Zone, event: ZoneEvent, hideLocs: boolean): FeedRecord | null {
    if (event.type === ZoneEventType.FOLLOWS && event.receiver64 !== -1n) {
        return null;
    }
    const message = event.message;
    const l = zone.level;
    if (message instanceof LocAddChange) {
        return hideLocs ? null : { e: 'la', x: zoneTileX(zone, message.coord), z: zoneTileZ(zone, message.coord), l, id: message.loc, s: message.shape, r: message.angle };
    } else if (message instanceof LocDel) {
        return hideLocs ? null : { e: 'ld', x: zoneTileX(zone, message.coord), z: zoneTileZ(zone, message.coord), l, s: message.shape, r: message.angle };
    } else if (message instanceof LocMerge) {
        if (hideLocs) {
            return null;
        }
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
    } else if (message instanceof LocAnim) {
        return hideLocs ? null : { e: 'an', x: zoneTileX(zone, message.coord), z: zoneTileZ(zone, message.coord), l, s: message.shape, r: message.angle, q: message.seq };
    } else if (message instanceof ObjAdd || message instanceof ObjReveal) {
        // For everyone but its owner a reveal is an add.
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

// ----

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

// Always compress, even though it costs CPU (~7 ms per MB, in the transport worker). WebKit
// drops (1006) a permessage-deflate socket that mixes compressed and uncompressed messages.
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
