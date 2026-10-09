import type { ServerWebSocket } from 'bun';

import Npc from '#/engine/entity/Npc.js';
import Player from '#/engine/entity/Player.js';
import { NpcStat } from '#/engine/entity/NpcStat.js';
import { PlayerStat } from '#/engine/entity/PlayerStat.js';
import World from '#/engine/World.js';
import { WorldStat } from '#/engine/WorldStat.js';
import Packet from '#/io/Packet.js';
import { NpcInfoProt, PlayerInfoProt } from '#/network/rsbuf/prot.js';
import { Visibility } from '#/network/rsbuf/visibility.js';
import Environment from '#/util/Environment.js';
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
//             {t:'tick', k, ms, p?, n?, rp?, rn?, reset?}  once per tick while subscribed
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

const WORLD_FEED_VERSION = 1;
const MAX_RECT_SIZE = 384;
const MAX_BUFFERED_BYTES = 1 << 20;
const ROSTER_INTERVAL_TICKS = 5;
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
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    subscribed: boolean;
    roster: boolean;
    resync: boolean;
    players: Map<number, KnownEntity>;
    npcs: Map<number, KnownEntity>;
};

const subscribers: Map<ServerWebSocket<WebSocketData>, Subscriber> = new Map();
const appearanceBase64: Map<number, { buf: Uint8Array; b64: string }> = new Map();
let lastTickAt = 0;

// Rebuilt every tick: active entities by 64x64 map square, and their serialized records.
// The bucket arrays are reused across ticks to keep the tick thread's garbage down.
const playerBuckets: Map<number, Player[]> = new Map();
const npcBuckets: Map<number, Npc[]> = new Map();
const recordJson: Map<Player | Npc, RecordJson> = new Map();
let activeNpcs = 0;

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
    subscribers.set(ws, {
        ws,
        x0: 0,
        z0: 0,
        x1: 0,
        z1: 0,
        subscribed: false,
        roster: false,
        resync: false,
        players: new Map(),
        npcs: new Map()
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
    } else if (msg.t === 'roster') {
        sub.roster = msg.on === true;
    }
}

export function onWorldFeedClose(ws: ServerWebSocket<WebSocketData>): void {
    subscribers.delete(ws);
}

export function cycleWorldFeed(): void {
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
    }

    const elapsed = Date.now() - start;
    if (elapsed >= SLOW_FEED_MS) {
        printInfo(`World feed took ${elapsed}ms for ${subscribers.size} subscriber(s)`);
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

    let msg = `{"t":"tick","k":${tick},"ms":${tickMs}`;
    if (reset) msg += ',"reset":1';
    if (players.length > 0) msg += `,"p":[${players.join(',')}]`;
    if (npcs.length > 0) msg += `,"n":[${npcs.join(',')}]`;
    if (removedPlayers.length > 0) msg += `,"rp":[${removedPlayers.join(',')}]`;
    if (removedNpcs.length > 0) msg += `,"rn":[${removedNpcs.join(',')}]`;
    send(sub.ws, msg + '}');
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

// Compression costs tick-thread CPU (~7 ms per MB); skip it when the last tick ran long,
// the same trade the gateway relay makes.
function send(ws: ServerWebSocket<WebSocketData>, msg: FeedRecord | string): void {
    const compress = World.lastCycleStats[WorldStat.CYCLE] < World.tickRate * 0.75;
    try {
        ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg), compress);
    } catch {
        subscribers.delete(ws);
    }
}
