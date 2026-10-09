// Grant an item into an OFFLINE player's bank by patching their .sav on disk.
//
// Usage (run on the box, from /opt/server/engine or anywhere):
//   bun grant-bank-item.ts <username> <objId> [count] [--wait] [--inspect] [--players-dir=data/players/main] [--web=http://localhost:8080]
//
// A save only takes effect on a fresh login - while the world holds the
// character the in-memory state wins and the next autosave/logout overwrites
// the file (see World.removePlayerWithoutSave / savePlayers). So with --wait
// this polls /playerpositions until the player is gone, waits for the logout
// save to land (file quiet for QUIET_MS), patches, then keeps re-verifying for
// a while in case a late save overwrites the patch.
//
// Byte layout mirrors Player.save() / PlayerLoading.load() at SAV_VERSION 7.
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const SAV_MAGIC = 0x2004;
const SAV_VERSION = 7;
const INV_BANK = 95;
const BANK_CAPACITY = 240; // ^bank_total_slots
const QUIET_MS = 15_000;
const VERIFY_MS = 90_000;

const argv = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];
for (const a of argv) {
    if (a.startsWith('--')) {
        const [k, v] = a.slice(2).split('=');
        flags.set(k, v ?? 'true');
    } else {
        positional.push(a);
    }
}
const [usernameArg, objArg, countArg] = positional;
if (!usernameArg || !objArg) {
    console.error('usage: grant-bank-item.ts <username> <objId> [count] [--wait] [--players-dir=...] [--web=...]');
    process.exit(1);
}
const username = usernameArg.toLowerCase().replace(/[^a-z0-9]/g, '_');
const objId = parseInt(objArg, 10);
const count = Math.max(1, parseInt(countArg ?? '1', 10) || 1);
const wait = flags.get('wait') === 'true';
const playersDir = flags.get('players-dir') ?? 'data/players/main';
const web = flags.get('web') ?? 'http://localhost:8080';
const savPath = join(playersDir, `${username}.sav`);

const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);

// ---- CRC (Packet.getcrc) ----
const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
        let r = i;
        for (let b = 0; b < 8; b++) r = (r & 1) === 1 ? (r >>> 1) ^ 0xedb88320 : r >>> 1;
        t[i] = r;
    }
    return t;
})();
function crc32(src: Uint8Array, len: number): number {
    let crc = 0xffffffff;
    for (let i = 0; i < len; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ src[i]) & 0xff];
    return ~crc;
}

// ---- reader ----
class Reader {
    pos = 0;
    constructor(public buf: Uint8Array) {}
    g1() { return this.buf[this.pos++]; }
    g2() { return ((this.buf[this.pos++] << 8) | this.buf[this.pos++]) >>> 0; }
    g4() { return ((this.buf[this.pos++] << 24) | (this.buf[this.pos++] << 16) | (this.buf[this.pos++] << 8) | this.buf[this.pos++]) | 0; }
    gVarInt() {
        let byte = this.buf[this.pos++];
        let result = 0;
        while ((byte & 0x80) !== 0) {
            result = (result | (byte & 0x7f)) << 7;
            byte = this.buf[this.pos++];
        }
        return (result | byte) >>> 0;
    }
}

type Slot = { id: number; count: number } | null;
interface Parsed {
    invCountPos: number;
    invCount: number;
    /** byte range of the bank block [start, end), or null if the save has no bank inv */
    bank: { start: number; end: number; size: number; slots: Slot[] } | null;
    /** where the inv section ends (start of afk zones) */
    invSectionEnd: number;
}

function parse(buf: Uint8Array): Parsed {
    const r = new Reader(buf);
    if (r.g2() !== SAV_MAGIC) throw new Error('not a save file');
    const version = r.g2();
    if (version !== SAV_VERSION) throw new Error(`save version ${version} != ${SAV_VERSION}; refusing to patch`);
    const stored = ((buf[buf.length - 4] << 24) | (buf[buf.length - 3] << 16) | (buf[buf.length - 2] << 8) | buf[buf.length - 1]) | 0;
    if (stored !== crc32(buf, buf.length - 4)) throw new Error('CRC mismatch on existing save');

    r.g2(); r.g2(); r.g1(); // x, z, level
    r.pos += 7 + 5 + 1; // body, colors, gender
    r.g2(); // runenergy
    r.g4(); // playtime
    for (let i = 0; i < 21; i++) { r.g4(); r.g1(); }
    const varpCount = r.g2();
    for (let i = 0; i < varpCount; i++) { r.g2(); r.gVarInt(); }

    const invCountPos = r.pos;
    const invCount = r.g1();
    let bank: Parsed['bank'] = null;
    for (let i = 0; i < invCount; i++) {
        const start = r.pos;
        const type = r.g2();
        const size = r.g2();
        const slots: Slot[] = new Array(size).fill(null);
        for (let s = 0; s < size; s++) {
            const id = r.g2() - 1;
            if (id === -1) continue;
            let c = r.g1();
            if (c === 255) c = r.g4();
            slots[s] = { id, count: c };
        }
        if (type === INV_BANK) bank = { start, end: r.pos, size, slots };
    }
    return { invCountPos, invCount, bank, invSectionEnd: r.pos };
}

function encodeBank(size: number, slots: Slot[]): number[] {
    const out: number[] = [];
    const p1 = (v: number) => out.push(v & 0xff);
    const p2 = (v: number) => out.push((v >>> 8) & 0xff, v & 0xff);
    const p4 = (v: number) => out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    p2(INV_BANK);
    p2(size);
    for (let s = 0; s < size; s++) {
        const o = slots[s];
        if (!o) { p2(0); continue; }
        p2(o.id + 1);
        if (o.count >= 255) { p1(255); p4(o.count); } else p1(o.count);
    }
    return out;
}

/** Returns the slot holding objId, or -1. */
function bankSlotOf(buf: Uint8Array): number {
    const p = parse(buf);
    if (!p.bank) return -1;
    return p.bank.slots.findIndex(s => s && s.id === objId);
}

function patch(buf: Uint8Array): Uint8Array {
    const p = parse(buf);
    let size: number, slots: Slot[], start: number, end: number, invCount = p.invCount;
    if (p.bank) {
        ({ size, slots, start, end } = p.bank);
    } else {
        // never banked: append a fresh bank block at the end of the inv section
        size = BANK_CAPACITY;
        slots = new Array(size).fill(null);
        start = end = p.invSectionEnd;
        invCount++;
    }
    const existing = slots.findIndex(s => s && s.id === objId);
    if (existing !== -1) throw new Error(`bank already has obj ${objId} in slot ${existing}`);
    const free = slots.findIndex(s => !s);
    if (free === -1) throw new Error('bank is full');
    slots[free] = { id: objId, count };
    log(`placing obj ${objId} x${count} in bank slot ${free} (bank ${slots.filter(Boolean).length}/${size} used)`);

    const block = encodeBank(size, slots);
    const head = buf.subarray(0, start);
    const tail = buf.subarray(end, buf.length - 4);
    const out = new Uint8Array(head.length + block.length + tail.length + 4);
    out.set(head, 0);
    out.set(block, head.length);
    out.set(tail, head.length + block.length);
    out[p.invCountPos] = invCount;
    const crc = crc32(out, out.length - 4);
    out[out.length - 4] = (crc >>> 24) & 0xff;
    out[out.length - 3] = (crc >>> 16) & 0xff;
    out[out.length - 2] = (crc >>> 8) & 0xff;
    out[out.length - 1] = crc & 0xff;
    parse(out); // round-trip sanity check
    return out;
}

function writeAtomic(bytes: Uint8Array): void {
    const tmp = `${savPath}.tmp`;
    writeFileSync(tmp, bytes);
    renameSync(tmp, savPath);
}

async function isOnline(): Promise<boolean | null> {
    try {
        const res = await fetch(`${web}/playerpositions`);
        const players = (await res.json()) as { name: string }[];
        return players.some(p => p.name.toLowerCase().replace(/[^a-z0-9]/g, '_') === username);
    } catch (e) {
        log('playerpositions fetch failed:', (e as Error).message);
        return null;
    }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
    if (!existsSync(savPath)) throw new Error(`${savPath} does not exist`);
    log(`target ${savPath}, obj ${objId} x${count}`);

    const initial = parse(new Uint8Array(readFileSync(savPath)));
    log(`save ok: ${initial.invCount} invs, bank ${initial.bank ? `${initial.bank.slots.filter(Boolean).length}/${initial.bank.size} used` : 'absent'}, online=${await isOnline()}`);
    if (flags.get('inspect') === 'true') return;

    if (bankSlotOf(new Uint8Array(readFileSync(savPath))) !== -1) {
        log('already present in bank; nothing to do');
        return;
    }

    // 1. wait for the player to leave the world
    for (;;) {
        const online = await isOnline();
        if (online === false) break;
        if (!wait) throw new Error(online ? `${username} is online; rerun with --wait` : 'cannot reach web server');
        await sleep(10_000);
    }
    log(`${username} is offline`);

    // 2. wait for the logout save to land and the file to go quiet
    let mtime = statSync(savPath).mtimeMs;
    let quietSince = Date.now();
    while (Date.now() - quietSince < QUIET_MS) {
        await sleep(1000);
        const now = statSync(savPath).mtimeMs;
        if (now !== mtime) { mtime = now; quietSince = Date.now(); log('save file changed, waiting for quiet'); }
    }

    // 3. patch; if they came back online between the check and now, go around again
    if (await isOnline()) { log('came back online before patch; restarting wait'); return main(); }
    const before = new Uint8Array(readFileSync(savPath));
    const after = patch(before);
    writeAtomic(after);
    log(`wrote ${after.length} bytes (was ${before.length})`);

    // 4. keep verifying for a bit - a late engine save can overwrite us
    const until = Date.now() + VERIFY_MS;
    while (Date.now() < until) {
        await sleep(3000);
        const cur = new Uint8Array(readFileSync(savPath));
        if (bankSlotOf(cur) !== -1) continue;
        if (await isOnline()) { log('player logged in and save was rewritten without the item; restarting wait'); return main(); }
        log('save was overwritten without the item; re-patching');
        writeAtomic(patch(cur));
    }
    log(`done: obj ${objId} is in ${username}'s bank slot ${bankSlotOf(new Uint8Array(readFileSync(savPath)))}`);
}

main().catch(e => { log('FAILED:', e.message); process.exit(1); });
