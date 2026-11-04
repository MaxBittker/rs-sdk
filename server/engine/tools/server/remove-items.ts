// Remove every stack of the given objs from an OFFLINE player's save (all inv
// types: inv, worn, bank, ...). Patches both the .sav and the GE ledger
// checkpoint (market.sqlite `accounts`), which PlayerLoading.load prefers.
//
// Usage (run on the box):
//   bun remove-items.ts <username> <objId,objId,...> [--wait] [--inspect]
//       [--players-dir=data/players/main] [--db=data/market.sqlite] [--web=http://localhost:8080]
//       [--backup-dir=data/item-removal-backups]
//
// Original bytes of both copies are written to --backup-dir before any change.
// Online/offline handling mirrors grant-bank-item.ts: with --wait it polls
// /playerpositions until the player is gone, waits for the logout save to go
// quiet, patches, then re-verifies for VERIFY_MS in case a late save lands.
//
// Byte layout mirrors Player.save() / PlayerLoading.load() for SAV_VERSION 7-10.
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const SAV_MAGIC = 0x2004;
const INV_BANK = 95;
const QUIET_MS = +(process.env.QUIET_MS ?? 15_000);
const VERIFY_MS = +(process.env.VERIFY_MS ?? 90_000);

const flags = new Map<string, string>();
const positional: string[] = [];
for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags.set(k, v ?? 'true'); }
    else positional.push(a);
}
const [userArg, objsArg] = positional;
if (!userArg || !objsArg) {
    console.error('usage: remove-items.ts <username> <objId,...> [--wait] [--inspect]');
    process.exit(1);
}
const username = userArg.toLowerCase().replace(/[^a-z0-9]/g, '_');
const objs = new Set(objsArg.split(',').map(s => parseInt(s, 10)));
const wait = flags.get('wait') === 'true';
const playersDir = flags.get('players-dir') ?? 'data/players/main';
const web = flags.get('web') ?? 'http://localhost:8080';
const dbPath = flags.get('db') ?? process.env.GE_DATABASE ?? 'data/market.sqlite';
const backupDir = flags.get('backup-dir') ?? 'data/item-removal-backups';
const savPath = join(playersDir, `${username}.sav`);
const log = (...a: unknown[]) => console.log(new Date().toISOString(), username, ...a);

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) { let r = i; for (let b = 0; b < 8; b++) r = (r & 1) === 1 ? (r >>> 1) ^ 0xedb88320 : r >>> 1; t[i] = r; }
    return t;
})();
function crc32(src: Uint8Array, len: number): number {
    let crc = 0xffffffff;
    for (let i = 0; i < len; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ src[i]) & 0xff];
    return ~crc;
}

class Reader {
    pos = 0;
    constructor(public buf: Uint8Array) {}
    g1() { return this.buf[this.pos++]; }
    g2() { return ((this.buf[this.pos++] << 8) | this.buf[this.pos++]) >>> 0; }
    g4() { return ((this.buf[this.pos++] << 24) | (this.buf[this.pos++] << 16) | (this.buf[this.pos++] << 8) | this.buf[this.pos++]) | 0; }
    gVarInt() { let b = this.buf[this.pos++]; let r = 0; while ((b & 0x80) !== 0) { r = (r | (b & 0x7f)) << 7; b = this.buf[this.pos++]; } return (r | b) >>> 0; }
}

type Slot = { id: number; count: number } | null;
interface Inv { type: number; size: number; slots: Slot[] }
interface Parsed { invStart: number; invEnd: number; invs: Inv[] }

function parse(buf: Uint8Array): Parsed {
    const r = new Reader(buf);
    if (r.g2() !== SAV_MAGIC) throw new Error('not a save file');
    const version = r.g2();
    if (version < 7 || version > 10) throw new Error(`save version ${version} outside 7-10; refusing`);
    const stored = ((buf[buf.length - 4] << 24) | (buf[buf.length - 3] << 16) | (buf[buf.length - 2] << 8) | buf[buf.length - 1]) | 0;
    if (stored !== crc32(buf, buf.length - 4)) throw new Error('CRC mismatch');
    r.g2(); r.g2(); r.g1(); r.pos += 13; r.g2(); r.g4();
    for (let i = 0; i < 21; i++) { r.g4(); r.g1(); }
    const varpCount = r.g2();
    for (let i = 0; i < varpCount; i++) { r.g2(); r.gVarInt(); }
    const invStart = r.pos;
    const invCount = r.g1();
    const invs: Inv[] = [];
    for (let i = 0; i < invCount; i++) {
        const type = r.g2(), size = r.g2();
        const slots: Slot[] = new Array(size).fill(null);
        for (let s = 0; s < size; s++) {
            const id = r.g2() - 1;
            if (id === -1) continue;
            let c = r.g1();
            if (c === 255) c = r.g4();
            slots[s] = { id, count: c };
        }
        invs.push({ type, size, slots });
    }
    return { invStart, invEnd: r.pos, invs };
}

function encodeInvs(invs: Inv[]): number[] {
    const out: number[] = [];
    const p1 = (v: number) => out.push(v & 0xff);
    const p2 = (v: number) => out.push((v >>> 8) & 0xff, v & 0xff);
    const p4 = (v: number) => out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    p1(invs.length);
    for (const inv of invs) {
        p2(inv.type); p2(inv.size);
        for (const o of inv.slots) {
            if (!o) { p2(0); continue; }
            p2(o.id + 1);
            if (o.count >= 255) { p1(255); p4(o.count); } else p1(o.count);
        }
    }
    return out;
}

const held = (buf: Uint8Array) => parse(buf).invs.reduce((a, inv) => a + inv.slots.reduce((b, s) => b + (s && objs.has(s.id) ? s.count : 0), 0), 0);
const describe = (buf: Uint8Array) => parse(buf).invs.flatMap(inv => inv.slots.flatMap((s, i) => (s && objs.has(s.id) ? [`inv${inv.type}[${i}] obj ${s.id} x${s.count}`] : []))).join(', ') || 'none';

function strip(buf: Uint8Array): { out: Uint8Array; removed: number } {
    const p = parse(buf);
    let removed = 0;
    for (const inv of p.invs) {
        for (let s = 0; s < inv.size; s++) {
            const o = inv.slots[s];
            if (o && objs.has(o.id)) { removed += o.count; inv.slots[s] = null; }
        }
        if (inv.type === INV_BANK) {
            // bank is a compacting inv; don't leave holes
            const filled = inv.slots.filter(Boolean);
            inv.slots = [...filled, ...new Array(inv.size - filled.length).fill(null)];
        }
    }
    const block = encodeInvs(p.invs);
    const head = buf.subarray(0, p.invStart);
    const tail = buf.subarray(p.invEnd, buf.length - 4);
    const out = new Uint8Array(head.length + block.length + tail.length + 4);
    out.set(head, 0); out.set(block, head.length); out.set(tail, head.length + block.length);
    const crc = crc32(out, out.length - 4);
    out[out.length - 4] = (crc >>> 24) & 0xff; out[out.length - 3] = (crc >>> 16) & 0xff; out[out.length - 2] = (crc >>> 8) & 0xff; out[out.length - 1] = crc & 0xff;
    if (held(out) !== 0) throw new Error('round-trip check failed');
    return { out, removed };
}

const db = existsSync(dbPath) ? new Database(dbPath, { strict: true }) : null;
db?.exec('PRAGMA busy_timeout=5000');
const readLedger = () => db?.query<{ save: Uint8Array }, [string]>('SELECT save FROM accounts WHERE owner=?').get(username)?.save;
const readSav = () => new Uint8Array(readFileSync(savPath));
const done = () => held(readSav()) === 0 && (() => { const l = readLedger(); return !l || held(l) === 0; })();

let backedUp = false;
function backup() {
    if (backedUp) return;
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(join(backupDir, `${username}.${stamp}.sav`), readSav());
    const l = readLedger();
    if (l) writeFileSync(join(backupDir, `${username}.${stamp}.ledger.sav`), l);
    backedUp = true;
    log(`backed up to ${backupDir}/${username}.${stamp}.*`);
}

function apply() {
    backup();
    const sav = readSav();
    if (held(sav) > 0) {
        const { out, removed } = strip(sav);
        writeFileSync(`${savPath}.tmp`, out);
        renameSync(`${savPath}.tmp`, savPath);
        log(`sav: removed ${removed}`);
    }
    const l = readLedger();
    if (l && held(l) > 0) {
        const { out, removed } = strip(l);
        db!.query('UPDATE accounts SET save=? WHERE owner=?').run(out, username);
        log(`ledger: removed ${removed}`);
    }
}

async function isOnline(): Promise<boolean | null> {
    try {
        const players = (await (await fetch(`${web}/playerpositions`)).json()) as { name: string }[];
        return players.some(p => p.name.toLowerCase().replace(/[^a-z0-9]/g, '_') === username);
    } catch (e) { log('playerpositions fetch failed:', (e as Error).message); return null; }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main(): Promise<void> {
    if (!existsSync(savPath)) throw new Error(`${savPath} does not exist`);
    const l = readLedger();
    log(`sav holds ${held(readSav())} [${describe(readSav())}]; ledger ${l ? `holds ${held(l)} [${describe(l)}]` : 'absent'}; online=${await isOnline()}`);
    if (flags.get('inspect') === 'true') return;
    if (done()) { log('nothing to remove'); return; }

    for (;;) {
        const online = await isOnline();
        if (online === false) break;
        if (!wait) throw new Error(online ? 'online; rerun with --wait' : 'cannot reach web server');
        await sleep(10_000);
    }
    log('offline');
    let mtime = statSync(savPath).mtimeMs, quietSince = Date.now();
    while (Date.now() - quietSince < QUIET_MS) {
        await sleep(1000);
        const now = statSync(savPath).mtimeMs;
        if (now !== mtime) { mtime = now; quietSince = Date.now(); log('save changed, waiting for quiet'); }
    }
    if (await isOnline()) { log('back online before patch; restarting wait'); return main(); }
    apply();

    const until = Date.now() + VERIFY_MS;
    while (Date.now() < until) {
        await sleep(3000);
        if (done()) continue;
        if (await isOnline()) { log('logged in before the patch stuck; restarting wait'); return main(); }
        log('save overwritten; re-patching');
        apply();
    }
    const fin = readLedger();
    log(`done: sav holds ${held(readSav())}${fin ? `, ledger holds ${held(fin)}` : ''}`);
}

main().catch(e => { log('FAILED:', (e as Error).message); process.exit(1); });
