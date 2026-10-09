// Full item census: total count + distinct holders per obj across every player
// save (all inv types) and GE escrow. Prints JSON to stdout.
//   bun item-census.ts [--players-dir=data/players/main] [--ge=data/market.sqlite]
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';

const flags = new Map<string, string>();
for (const a of process.argv.slice(2)) if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags.set(k, v ?? 'true'); }
const playersDir = flags.get('players-dir') ?? 'data/players/main';
const gePath = flags.get('ge') ?? 'data/market.sqlite';

class Reader {
    pos = 0;
    constructor(public buf: Uint8Array) {}
    g1() { return this.buf[this.pos++]; }
    g2() { return ((this.buf[this.pos++] << 8) | this.buf[this.pos++]) >>> 0; }
    g4() { return ((this.buf[this.pos++] << 24) | (this.buf[this.pos++] << 16) | (this.buf[this.pos++] << 8) | this.buf[this.pos++]) | 0; }
    gVarInt() { let b = this.buf[this.pos++]; let r = 0; while ((b & 0x80) !== 0) { r = (r | (b & 0x7f)) << 7; b = this.buf[this.pos++]; } return (r | b) >>> 0; }
}

const count = new Map<number, number>();
const holders = new Map<number, Set<string>>();
const add = (id: number, c: number, who: string) => {
    count.set(id, (count.get(id) ?? 0) + c);
    let h = holders.get(id); if (!h) holders.set(id, (h = new Set())); h.add(who);
};

function scan(buf: Uint8Array, who: string) {
    const r = new Reader(buf);
    if (r.g2() !== 0x2004) throw new Error('bad magic');
    const version = r.g2();
    if (version < 5) throw new Error(`save version ${version} < 5`);
    r.g2(); r.g2(); r.g1(); r.pos += 13; r.g2();
    if (version >= 2) r.g4(); else r.g2();
    for (let i = 0; i < 21; i++) { r.g4(); r.g1(); }
    const varpCount = r.g2();
    if (version >= 7) for (let i = 0; i < varpCount; i++) { r.g2(); r.gVarInt(); } else for (let i = 0; i < varpCount; i++) r.g4();
    const invCount = r.g1();
    for (let i = 0; i < invCount; i++) {
        r.g2(); const size = r.g2();
        for (let s = 0; s < size; s++) {
            const id = r.g2() - 1; if (id === -1) continue;
            let c = r.g1(); if (c === 255) c = r.g4();
            add(id, c, who);
        }
    }
}

let files = 0, skipped = 0;
for (const f of readdirSync(playersDir)) {
    if (!f.endsWith('.sav')) continue;
    files++;
    try { scan(new Uint8Array(readFileSync(join(playersDir, f))), f.slice(0, -4)); } catch { skipped++; }
}
let geItems = 0;
try {
    const db = new Database(gePath, { readonly: true });
    for (const o of db.query(`SELECT owner, item, side, slot, remaining, items FROM offers`).all() as any[]) {
        const held = o.side === 'sell' ? (o.slot >= 0 ? o.remaining : 0) : o.items;
        if (held > 0) { add(o.item, held, 'ge:' + o.owner); geItems += held; }
    }
} catch {}
const out: Record<string, [number, number]> = {};
for (const [id, c] of count) out[id] = [c, holders.get(id)!.size];
console.log(JSON.stringify({ files, skipped, geItems, items: out }));
