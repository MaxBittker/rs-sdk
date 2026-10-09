// Census of who holds a given obj across every player save + the GE database.
//
//   bun find-item-owners.ts <objId>[,objId...] [--players-dir=data/players/main] [--ge=data/market.sqlite]
//
// Scans every .sav (any SAV_VERSION >= 5; older saves lack inv sizes and are
// reported as skipped), every inventory type inside it (inv 93, worn 94,
// bank 95, ...), then the GE offers table for items sitting in escrow
// (open/partial sell offers) or in uncollected fill boxes.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';

const argv = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];
for (const a of argv) {
    if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags.set(k, v ?? 'true'); }
    else positional.push(a);
}
if (!positional[0]) { console.error('usage: find-item-owners.ts <objId>[,objId...] [--players-dir=...] [--ge=...]'); process.exit(1); }
const targets = new Set(positional[0].split(',').map(s => parseInt(s, 10)));
const playersDir = flags.get('players-dir') ?? 'data/players/main';
const gePath = flags.get('ge') ?? 'data/market.sqlite';
const INV_NAMES: Record<number, string> = { 93: 'inv', 94: 'worn', 95: 'bank' };

class Reader {
    pos = 0;
    constructor(public buf: Uint8Array) {}
    g1() { return this.buf[this.pos++]; }
    g2() { return ((this.buf[this.pos++] << 8) | this.buf[this.pos++]) >>> 0; }
    g4() { return ((this.buf[this.pos++] << 24) | (this.buf[this.pos++] << 16) | (this.buf[this.pos++] << 8) | this.buf[this.pos++]) | 0; }
    gVarInt() {
        let byte = this.buf[this.pos++]; let result = 0;
        while ((byte & 0x80) !== 0) { result = (result | (byte & 0x7f)) << 7; byte = this.buf[this.pos++]; }
        return (result | byte) >>> 0;
    }
}

interface Hit { inv: string; slot: number; id: number; count: number }
function scan(buf: Uint8Array): { version: number; hits: Hit[] } {
    const r = new Reader(buf);
    if (r.g2() !== 0x2004) throw new Error('bad magic');
    const version = r.g2();
    if (version < 5) throw new Error(`save version ${version} < 5 (no inv sizes)`);
    r.g2(); r.g2(); r.g1();
    r.pos += 7 + 5 + 1;
    r.g2();
    if (version >= 2) r.g4(); else r.g2();
    for (let i = 0; i < 21; i++) { r.g4(); r.g1(); }
    const varpCount = r.g2();
    if (version >= 7) for (let i = 0; i < varpCount; i++) { r.g2(); r.gVarInt(); }
    else for (let i = 0; i < varpCount; i++) r.g4();
    const invCount = r.g1();
    const hits: Hit[] = [];
    for (let i = 0; i < invCount; i++) {
        const type = r.g2();
        const size = r.g2();
        for (let s = 0; s < size; s++) {
            const id = r.g2() - 1;
            if (id === -1) continue;
            let c = r.g1();
            if (c === 255) c = r.g4();
            if (targets.has(id)) hits.push({ inv: INV_NAMES[type] ?? `inv${type}`, slot: s, id, count: c });
        }
    }
    return { version, hits };
}

let files = 0, skipped: string[] = [], total = 0;
const rows: string[] = [];
for (const f of readdirSync(playersDir).filter(f => f.endsWith('.sav')).sort()) {
    files++;
    try {
        const { hits } = scan(new Uint8Array(readFileSync(join(playersDir, f))));
        for (const h of hits) { total += h.count; rows.push(`${f.slice(0, -4)}\t${h.inv}[${h.slot}]\tobj ${h.id}\tx${h.count}`); }
    } catch (e) { skipped.push(`${f}: ${(e as Error).message}`); }
}
console.log(`scanned ${files} saves in ${playersDir}; ${rows.length} stacks, ${total} items total`);
for (const r of rows) console.log('  ' + r);
if (skipped.length) { console.log(`skipped ${skipped.length}:`); for (const s of skipped) console.log('  ' + s); }

try {
    const db = new Database(gePath, { readonly: true });
    const ids = [...targets].join(',');
    const offers = db.query(`SELECT id, owner, slot, item, side, quantity, remaining, filled, state, items, coins FROM offers WHERE item IN (${ids}) ORDER BY id`).all() as any[];
    let escrow = 0, boxed = 0;
    console.log(`\nGE offers touching obj ${ids}: ${offers.length}`);
    for (const o of offers) {
        // sell escrow = remaining unsold; fill box = items not yet collected (buy side)
        const held = o.side === 'sell' ? (o.slot >= 0 ? o.remaining : 0) : o.items;
        if (o.side === 'sell' && o.slot >= 0) escrow += o.remaining; else if (o.side === 'buy') boxed += o.items;
        console.log(`  #${o.id} ${o.owner} ${o.side} slot=${o.slot} qty=${o.quantity} remaining=${o.remaining} filled=${o.filled} state=${o.state} itemsInBox=${o.items} coins=${o.coins} held=${held}`);
    }
    console.log(`sell escrow: ${escrow}, uncollected in buy boxes: ${boxed}`);
    const trades = db.query(`SELECT COUNT(*) n, COALESCE(SUM(quantity),0) q FROM trades WHERE item IN (${ids})`).get() as any;
    console.log(`GE trades ever: ${trades.n} (${trades.q} items)`);
} catch (e) { console.log(`\nGE db ${gePath}: ${(e as Error).message}`); }
