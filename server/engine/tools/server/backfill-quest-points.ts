// One-off: fill the quest points hiscore (hiscore type QUEST_POINTS_HISCORE_TYPE) for players who
// haven't saved since it shipped. Saves from before then don't hold %qp (it was temp-scoped), so
// the total is recounted from the saved quest progress varps by evaluating the conditions in
// [proc,count_questpoints] - the same proc the login trigger runs. Any condition form this tool
// doesn't understand is a hard error rather than a silent miscount.
//
// Only reads saves of accounts whose overall row shows MIN_PLAYTIME_TICKS of playtime or
// MIN_TOTAL_LEVEL total level (every quest holder seen at launch was far above both), and never
// replaces an existing row, so totals written live by the login server always win.
//
// Run from server/engine with the world's GE_DATABASE (PlayerLoading prefers the exchange
// checkpoint over the .sav, same as the login server):
//   GE_DATABASE=/opt/server/data/market.sqlite bun tools/server/backfill-quest-points.ts [--dry-run] [--verify]
// --verify only checks the recount against %qp in saves written since the varp became perm.
import fs from 'fs';
import path from 'path';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import VarBitType from '#/cache/config/VarBitType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import { db } from '#/db/query.js';
import type Player from '#/engine/entity/Player.js';
import { PlayerLoading } from '#/engine/entity/PlayerLoading.js';
import Packet from '#/io/Packet.js';
import { QUEST_POINTS_HISCORE_TYPE } from '#/web/utils.js';

const dryRun = process.argv.includes('--dry-run');
const verify = process.argv.includes('--verify');

const PROFILE = 'main';
const MIN_PLAYTIME_TICKS = 12_000; // 1h at the 300ms prod tickrate
const MIN_TOTAL_LEVEL = 100;
const CONTENT_DIR = '../content';

InvType.load('data/pack');
ObjType.load('data/pack');
VarPlayerType.load('data/pack');
VarBitType.load('data/pack');

// ---- quest table from [proc,count_questpoints]

const constants = new Map<string, number>([
    ['true', 1],
    ['false', 0]
]);
function loadConstants(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            loadConstants(file);
        } else if (entry.name.endsWith('.constant')) {
            for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
                const m = line.match(/^\^(\w+)\s*=\s*(-?\d+)\s*$/);
                if (m) constants.set(m[1], Number(m[2]));
            }
        }
    }
}
loadConstants(`${CONTENT_DIR}/scripts`);

function constant(name: string): number {
    const value = constants.get(name);
    if (value === undefined) throw new Error(`unknown constant ^${name}`);
    return value;
}

// %name as a reader over a loaded save: a varp, or a varbit's slice of its base varp
function resolveVar(name: string): (player: Player) => number {
    const varp = VarPlayerType.getId(name);
    if (varp !== -1) return player => player.vars[varp] ?? 0;
    const varbit = VarBitType.getByName(name);
    if (!varbit) throw new Error(`unknown var %${name}`);
    return player => getbitRange(player.vars[varbit.basevar] ?? 0, varbit.startbit, varbit.endbit);
}

function getbitRange(value: number, start: number, end: number): number {
    return (value >>> start) & (end - start >= 31 ? -1 : (1 << (end - start + 1)) - 1);
}

const scripts = fs.readFileSync(`${CONTENT_DIR}/scripts/general/scripts/quests.rs2`, 'utf8');
function procBody(source: string, name: string): string {
    const start = source.indexOf(`[proc,${name}]`);
    if (start === -1) throw new Error(`[proc,${name}] not found`);
    const end = source.indexOf('\n[', start + 1);
    return source.slice(start, end === -1 ? undefined : end);
}

// `~proc` used as a condition: only a getbit_range of a var is supported
function procValue(name: string): (player: Player) => number {
    const m = procBody(findProcSource(name), name).match(/return\s*\(\s*getbit_range\(%(\w+),\s*(\d+),\s*(\d+)\)\s*\)\s*;/);
    if (!m) throw new Error(`unsupported condition proc ~${name}`);
    const read = resolveVar(m[1]);
    const [start, end] = [Number(m[2]), Number(m[3])];
    return player => getbitRange(read(player), start, end);
}

function findProcSource(procName: string): string {
    const found: string[] = [];
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (entry.name.endsWith('.rs2') && fs.readFileSync(file, 'utf8').includes(`[proc,${procName}]`)) found.push(file);
        }
    };
    walk(`${CONTENT_DIR}/scripts`);
    if (found.length !== 1) throw new Error(`expected one definition of ~${procName}, found ${found.length}`);
    return fs.readFileSync(found[0], 'utf8');
}

function parseClause(clause: string): (player: Player) => boolean {
    let m = clause.match(/^%(\w+)\s*(=|>=)\s*\^(\w+)$/);
    if (m) {
        const read = resolveVar(m[1]);
        const target = constant(m[3]);
        return m[2] === '=' ? player => read(player) === target : player => read(player) >= target;
    }
    m = clause.match(/^testbit\(%(\w+),\s*\^(\w+)\)\s*=\s*\^true$/);
    if (m) {
        const read = resolveVar(m[1]);
        const bit = constant(m[2]);
        return player => ((read(player) >>> bit) & 1) === 1;
    }
    m = clause.match(/^~(\w+)\s*=\s*\^(\w+)$/);
    if (m) {
        const value = procValue(m[1]);
        const target = constant(m[2]);
        return player => value(player) === target;
    }
    throw new Error(`unsupported count_questpoints condition: ${clause}`);
}

type Quest = { condition: string; points: number; complete: (player: Player) => boolean };
const quests: Quest[] = [];
const body = procBody(scripts, 'count_questpoints');
const blocks = [...body.matchAll(/^if \((.+)\) \{[^\n]*\n\s*\$questpoints = add\(\$questpoints, \^(\w+)\);\s*\n\}/gm)];
if (blocks.length !== (body.match(/^if \(/gm) ?? []).length || blocks.length === 0) {
    throw new Error(`parsed ${blocks.length} quests but count_questpoints has ${(body.match(/^if \(/gm) ?? []).length} if-blocks`);
}
for (const [, condition, pointsName] of blocks) {
    const clauses = condition.split('|').map(c => parseClause(c.trim()));
    quests.push({ condition, points: constant(pointsName), complete: player => clauses.some(c => c(player)) });
}
console.log(`${quests.length} quests, ${quests.reduce((n, q) => n + q.points, 0)} quest points available`);

function countQuestPoints(player: Player): number {
    let qp = 0;
    for (const quest of quests) {
        if (quest.complete(player)) qp += quest.points;
    }
    return qp;
}

// ---- saves

const qpVarp = VarPlayerType.getId('qp');

function loadSave(username: string): Player | null {
    const file = `data/players/${PROFILE}/${username}.sav`;
    if (!fs.existsSync(file)) return null;
    return PlayerLoading.load(username, new Packet(fs.readFileSync(file)), null);
}

if (verify) {
    // saves written since %qp became perm carry the login trigger's own count
    const rows = await db.selectFrom('hiscore').innerJoin('account', 'account.id', 'hiscore.account_id').select(['account.username']).where('hiscore.profile', '=', PROFILE).where('hiscore.type', '=', QUEST_POINTS_HISCORE_TYPE).execute();
    let checked = 0;
    let mismatched = 0;
    for (const { username } of rows) {
        const player = loadSave(username);
        const saved = player?.vars[qpVarp] ?? 0;
        if (!player || saved === 0) continue;
        checked++;
        const counted = countQuestPoints(player);
        if (counted !== saved) {
            mismatched++;
            console.log(`MISMATCH ${username}: saved %qp=${saved}, recounted ${counted}`);
        }
    }
    console.log(`[verify] ${checked} saves with %qp checked, ${mismatched} mismatched`);
    process.exit(mismatched === 0 ? 0 : 1);
}

const candidates = await db
    .selectFrom('hiscore_large')
    .innerJoin('account', 'account.id', 'hiscore_large.account_id')
    .leftJoin('hiscore', join => join.onRef('hiscore.account_id', '=', 'hiscore_large.account_id').on('hiscore.profile', '=', PROFILE).on('hiscore.type', '=', QUEST_POINTS_HISCORE_TYPE))
    .select(['account.id', 'account.username', 'account.banned_until'])
    .where('hiscore_large.profile', '=', PROFILE)
    .where('hiscore_large.type', '=', 0)
    .where('account.staffmodlevel', '<=', 1)
    .where('hiscore.account_id', 'is', null)
    .where(eb => eb.or([eb('hiscore_large.playtime', '>=', MIN_PLAYTIME_TICKS), eb('hiscore_large.level', '>=', MIN_TOTAL_LEVEL)]))
    .execute();

const now = new Date();
const rows: { account_id: number; profile: string; type: number; level: number; value: number; playtime: number }[] = [];
const distribution = new Map<number, number>();
let banned = 0;
let noSave = 0;
let noQuests = 0;
let failed = 0;
for (const candidate of candidates) {
    if (candidate.banned_until !== null && new Date(candidate.banned_until) >= now) {
        banned++;
        continue;
    }
    try {
        const player = loadSave(candidate.username);
        if (!player) {
            noSave++;
            continue;
        }
        const qp = player.vars[qpVarp] || countQuestPoints(player);
        if (qp < 1) {
            noQuests++;
            continue;
        }
        rows.push({ account_id: candidate.id, profile: PROFILE, type: QUEST_POINTS_HISCORE_TYPE, level: qp, value: qp, playtime: player.playtime });
        distribution.set(qp, (distribution.get(qp) ?? 0) + 1);
    } catch (err) {
        failed++;
        console.error(candidate.username, err instanceof Error ? err.message : err);
    }
}

// short batches so the live login server's own hiscore writes are never blocked for long
if (!dryRun) {
    for (let i = 0; i < rows.length; i += 200) {
        await db.insertInto('hiscore').values(rows.slice(i, i + 200)).orIgnore().execute();
    }
}

const top = [...distribution.entries()].sort((a, b) => b[0] - a[0]).slice(0, 8).map(([qp, n]) => `${qp}qp x${n}`).join(', ');
console.log(`${dryRun ? '[dry run] ' : ''}${candidates.length} candidates without a quest row: ${rows.length} ${dryRun ? 'would be filled' : 'filled'} (top: ${top}), ${noQuests} with no quests, ${noSave} without a save, ${banned} banned, ${failed} failed`);
process.exit(0);
