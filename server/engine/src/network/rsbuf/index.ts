import { CoordGrid } from './coord.js';
import { ZoneMap } from './grid.js';
import { Npc } from './npc.js';
import { NpcInfoEncoder, PlayerInfoEncoder } from './info.js';
import { Player, Chat, ExactMove } from './player.js';
import { NpcInfoProt, PlayerInfoProt } from './prot.js';
import { NpcRenderer, PlayerRenderer } from './renderer.js';
import { Visibility } from './visibility.js';

const PLAYERS: Array<Player | null> = Array<Player | null>(2048).fill(null);
const PLAYER_GRID = new Map<number, number[]>();
const PLAYER_RENDERER = new PlayerRenderer();
const PLAYER_INFO = new PlayerInfoEncoder();

const NPCS: Array<Npc | null> = Array<Npc | null>(16384).fill(null);
const NPC_RENDERER = new NpcRenderer();
const NPC_INFO = new NpcInfoEncoder();

const ZONE_MAP = new ZoneMap();

export { NpcInfoProt, PlayerInfoProt, Visibility };

export function computePlayer(
    x: number,
    y: number,
    z: number,
    originX: number,
    originZ: number,
    pid: number,
    tele: boolean,
    jump: boolean,
    runDir: number,
    walkDir: number,
    visibility: Visibility,
    active: boolean,
    masks: number,
    appearance: Uint8Array,
    lastAppearance: number,
    faceEntity: number,
    faceX: number,
    faceZ: number,
    orientationX: number,
    orientationZ: number,
    damageTaken: number,
    damageType: number,
    damageTaken2: number,
    damageType2: number,
    currentHitpoints: number,
    baseHitpoints: number,
    animId: number,
    animDelay: number,
    say: string | null | undefined,
    message: Uint8Array | null | undefined,
    color: number,
    effect: number,
    ignored: number,
    graphicId: number,
    graphicHeight: number,
    graphicDelay: number,
    exactStartX: number,
    exactStartZ: number,
    exactEndX: number,
    exactEndZ: number,
    exactMoveStart: number,
    exactMoveEnd: number,
    exactMoveDirection: number
): void {
    if (pid === -1) {
        return;
    }

    const player = PLAYERS[pid];
    if (!player) {
        return;
    }

    const origin = CoordGrid.from(originX, y, originZ);
    const coord = CoordGrid.from(x, y, z);
    const exactMove = exactStartX === -1 ? null : new ExactMove(exactStartX, exactStartZ, exactEndX, exactEndZ, exactMoveStart, exactMoveEnd, exactMoveDirection);
    const chat = message == null ? null : new Chat(message.slice(), color, effect, ignored);

    if (coord.packed !== player.coord.packed && (CoordGrid.zone(coord.x()) !== CoordGrid.zone(player.coord.x()) || CoordGrid.zone(coord.z()) !== CoordGrid.zone(player.coord.z()) || coord.y() !== player.coord.y())) {
        ZONE_MAP.zone(player.coord.x(), player.coord.y(), player.coord.z()).removePlayer(pid);
        ZONE_MAP.zone(coord.x(), coord.y(), coord.z()).addPlayer(pid);
    }

    player.coord = coord;
    player.origin = origin;
    player.tele = tele;
    player.jump = jump;
    player.runDir = runDir;
    player.walkDir = walkDir;
    player.visibility = visibility;
    player.active = active;
    player.masks = masks >>> 0;
    player.appearance = appearance.slice();
    player.lastAppearance = lastAppearance;
    player.faceEntity = faceEntity;
    player.faceX = faceX;
    player.faceZ = faceZ;
    player.orientationX = orientationX;
    player.orientationZ = orientationZ;
    player.damageTaken = damageTaken;
    player.damageType = damageType;
    player.damageTaken2 = damageTaken2;
    player.damageType2 = damageType2;
    player.currentHitpoints = currentHitpoints;
    player.baseHitpoints = baseHitpoints;
    player.animId = animId;
    player.animDelay = animDelay;
    player.say = say ?? null;
    player.chat = chat;
    player.graphicId = graphicId;
    player.graphicHeight = graphicHeight;
    player.graphicDelay = graphicDelay;
    player.exactMove = exactMove;

    PLAYER_RENDERER.computeInfo(player);

    const list = PLAYER_GRID.get(player.coord.packed);
    if (list) {
        list.push(pid);
    } else {
        PLAYER_GRID.set(player.coord.packed, [pid]);
    }
}

export function playerInfo(pos: number, pid: number, dx: number, dz: number, rebuild: boolean): Uint8Array {
    if (pid === -1) {
        return new Uint8Array(0);
    }

    const player = PLAYERS[pid];
    if (!player) {
        return new Uint8Array(0);
    }

    return PLAYER_INFO.encode(pos, PLAYER_RENDERER, PLAYERS, ZONE_MAP, PLAYER_GRID, player, dx, dz, rebuild);
}

export function addPlayer(pid: number): void {
    if (pid === -1) {
        return;
    }
    PLAYERS[pid] = new Player(pid);
}

export function removePlayer(pid: number): void {
    if (pid === -1) {
        return;
    }

    const player = PLAYERS[pid];
    if (player) {
        ZONE_MAP.zone(player.coord.x(), player.coord.y(), player.coord.z()).removePlayer(pid);
        for (const nid of player.build.npcs.iter()) {
            const npc = NPCS[nid];
            if (npc) {
                npc.observers = Math.max(npc.observers - 1, 0);
            }
        }
        player.build.cleanup();
    }

    PLAYER_RENDERER.removePermanent(pid);
    PLAYERS[pid] = null;
}

export function hasPlayer(pid: number, other: number): boolean {
    if (pid === -1 || other === -1) {
        return false;
    }
    return PLAYERS[pid]?.build.players.contains(other) ?? false;
}

export function computeNpc(
    x: number,
    y: number,
    z: number,
    nid: number,
    ntype: number,
    tele: boolean,
    jump: boolean,
    runDir: number,
    walkDir: number,
    active: boolean,
    masks: number,
    faceEntity: number,
    faceX: number,
    faceZ: number,
    orientationX: number,
    orientationZ: number,
    damageTaken: number,
    damageType: number,
    damageTaken2: number,
    damageType2: number,
    currentHitpoints: number,
    baseHitpoints: number,
    animId: number,
    animDelay: number,
    say: string | null | undefined,
    graphicId: number,
    graphicHeight: number,
    graphicDelay: number
): void {
    if (nid === -1 || ntype === -1) {
        return;
    }

    const npc = NPCS[nid];
    if (!npc) {
        return;
    }

    const coord = CoordGrid.from(x, y, z);
    if (coord.packed !== npc.coord.packed && (CoordGrid.zone(coord.x()) !== CoordGrid.zone(npc.coord.x()) || CoordGrid.zone(coord.z()) !== CoordGrid.zone(npc.coord.z()) || coord.y() !== npc.coord.y())) {
        ZONE_MAP.zone(npc.coord.x(), npc.coord.y(), npc.coord.z()).removeNpc(nid);
        ZONE_MAP.zone(coord.x(), coord.y(), coord.z()).addNpc(nid);
    }

    npc.ntype = ntype;
    npc.coord = coord;
    npc.tele = tele;
    npc.jump = jump;
    npc.runDir = runDir;
    npc.walkDir = walkDir;
    npc.active = active;
    npc.masks = masks >>> 0;
    npc.faceEntity = faceEntity;
    npc.faceX = faceX;
    npc.faceZ = faceZ;
    npc.orientationX = orientationX;
    npc.orientationZ = orientationZ;
    npc.damageTaken = damageTaken;
    npc.damageType = damageType;
    npc.damageTaken2 = damageTaken2;
    npc.damageType2 = damageType2;
    npc.currentHitpoints = currentHitpoints;
    npc.baseHitpoints = baseHitpoints;
    npc.animId = animId;
    npc.animDelay = animDelay;
    npc.say = say ?? null;
    npc.graphicId = graphicId;
    npc.graphicHeight = graphicHeight;
    npc.graphicDelay = graphicDelay;

    NPC_RENDERER.computeInfo(npc);
}

export function npcInfo(pos: number, pid: number, dx: number, dz: number, rebuild: boolean): Uint8Array {
    if (pid === -1) {
        return new Uint8Array(0);
    }

    const player = PLAYERS[pid];
    if (!player) {
        return new Uint8Array(0);
    }

    return NPC_INFO.encode(pos, NPC_RENDERER, NPCS, ZONE_MAP, player, dx, dz, rebuild);
}

export function addNpc(nid: number, ntype: number): void {
    if (nid === -1 || ntype === -1) {
        return;
    }
    NPCS[nid] = new Npc(nid, ntype);
}

export function removeNpc(nid: number): void {
    if (nid === -1) {
        return;
    }

    const npc = NPCS[nid];
    if (npc) {
        ZONE_MAP.zone(npc.coord.x(), npc.coord.y(), npc.coord.z()).removeNpc(nid);
    }
    NPC_RENDERER.removePermanent(nid);
    NPCS[nid] = null;
}

export function hasNpc(pid: number, nid: number): boolean {
    if (pid === -1 || nid === -1) {
        return false;
    }
    return PLAYERS[pid]?.build.npcs.contains(nid) ?? false;
}

export function getNpcObservers(nid: number): number {
    if (nid === -1) {
        return 0;
    }
    return NPCS[nid]?.observers ?? 0;
}

export function cleanup(): void {
    PLAYER_GRID.clear();
    PLAYER_RENDERER.removeTemporary();
    NPC_RENDERER.removeTemporary();

    for (const player of PLAYERS) {
        player?.cleanup();
    }
    for (const npc of NPCS) {
        npc?.cleanup();
    }
}

export function cleanupPlayerBuildArea(pid: number): void {
    if (pid === -1) {
        return;
    }
    PLAYERS[pid]?.build.cleanup();
}
