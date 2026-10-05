// Byte accounting behind GET /traffic: which bots, subscription modes, Fly
// edges and source hosts the gateway's bandwidth goes to.
//
// Sizes are JSON string lengths (== bytes for ASCII payloads), measured before
// WebSocket framing or compression, so they are what the relay pushes, not an
// exact wire count. Counters are cumulative; snapshots every 10s give rolling
// windows without per-caller state.

export type TrafficKind =
    | 'bot_in'      // bot client -> gateway (state frames, action results)
    | 'bot_out'     // gateway -> bot client (actions, status)
    | 'sdk_in'      // SDK -> gateway (connect, actions)
    | 'sdk_out'     // gateway -> SDK (state frames, results)
    | 'http_out'    // HTTP responses (/state, /chat, ...)
    | 'pending_in'  // frames on sockets not yet registered as bot or SDK
    | 'dedup_skipped'   // info: state bytes NOT sent because the frame repeated the last one
    | 'sametick_out';   // info: bytes sent for a 2nd+ frame in the same tick (what a per-tick merge would save)

export interface ConnectionLabel {
    edge: string;   // Fly edge region that accepted the client, 'direct' if none
    ip: string;     // client IP as seen by Fly, '' if unknown
    via?: string;   // 'relay' (engine /gateway proxy) or 'direct' (public listener)
}

const SNAPSHOT_MS = 10_000;
const MAX_SNAPSHOTS = 61; // 10 minutes of history

// Fly list prices (North America/Europe), used only for the rough $/month
// column: egress leaves the edge, and every byte crossing from a non-iad edge
// to the iad Machine also pays the cross-region hop, in both directions.
const EGRESS_USD_PER_GB = 0.02;
const CROSS_REGION_USD_PER_GB = 0.006;
const MACHINE_REGION = 'iad';
const SECONDS_PER_MONTH = 30 * 24 * 3600;

const SEP = '\t';
const OUT_KINDS = new Set<TrafficKind>(['bot_out', 'sdk_out', 'http_out']);
const INFO_KINDS = new Set<TrafficKind>(['dedup_skipped', 'sametick_out']);

interface Snapshot {
    at: number;
    bytes: Map<string, number>;
    frames: Map<string, number>;
}

export interface LiveSessions {
    bots: string[];
    sdks: { bot: string; mode: string }[];
}

interface Row {
    inBytes: number;
    outBytes: number;
    outFrames: number;
    stateFramesIn: number;
    hopBytes: number;   // bytes that crossed a non-iad edge, either direction
}

function emptyRow(): Row {
    return { inBytes: 0, outBytes: 0, outFrames: 0, stateFramesIn: 0, hopBytes: 0 };
}

/** Swarm label from an account name: lowercase, trailing digits/separators dropped. */
export function groupOf(bot: string): string {
    const base = bot.toLowerCase().replace(/[\d_\-]+$/, '');
    return base || bot.toLowerCase();
}

export class TrafficMeter {
    private bytes = new Map<string, number>();
    private frames = new Map<string, number>();
    private snapshots: Snapshot[] = [];
    private readonly startedAt: number;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(private now: () => number = Date.now) {
        this.startedAt = now();
        this.snapshot();
    }

    start(): void {
        this.timer = setInterval(() => this.snapshot(), SNAPSHOT_MS);
        (this.timer as any).unref?.();
    }

    record(kind: TrafficKind, bot: string, mode: string, label: ConnectionLabel | undefined, length: number): void {
        const key = [kind, bot, mode, label?.edge ?? 'direct', label?.ip ?? '', label?.via ?? 'relay'].join(SEP);
        this.bytes.set(key, (this.bytes.get(key) ?? 0) + length);
        this.frames.set(key, (this.frames.get(key) ?? 0) + 1);
    }

    snapshot(): void {
        this.snapshots.push({ at: this.now(), bytes: new Map(this.bytes), frames: new Map(this.frames) });
        if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift();
    }

    report(windowSec: number, live: LiveSessions) {
        const now = this.now();
        // Newest snapshot at least windowSec old, so the window is never shorter
        // than asked; with less history than that, the oldest snapshot we have.
        const target = now - windowSec * 1000;
        const base = this.snapshots.findLast(s => s.at <= target) ?? this.snapshots[0];
        const seconds = Math.max(1, (now - base.at) / 1000);

        const byKind = new Map<string, number>();
        const byGroup = new Map<string, Row & { byMode: Map<string, number> }>();
        const byEdge = new Map<string, Row>();
        const byIp = new Map<string, Row & { groups: Set<string> }>();
        const byBot = new Map<string, Row>();
        const byVia = new Map<string, Row & { groups: Set<string> }>();

        for (const [key, total] of this.bytes) {
            const delta = total - (base.bytes.get(key) ?? 0);
            if (delta <= 0) continue;
            const frameDelta = (this.frames.get(key) ?? 0) - (base.frames.get(key) ?? 0);
            const [kind, bot, mode, edge, ip, via] = key.split(SEP) as [TrafficKind, string, string, string, string, string];
            const out = OUT_KINDS.has(kind);
            const hop = edge !== MACHINE_REGION;
            const add = (row: Row) => {
                if (out) {
                    row.outBytes += delta;
                    row.outFrames += frameDelta;
                } else {
                    row.inBytes += delta;
                    if (kind === 'bot_in') row.stateFramesIn += frameDelta;
                }
                if (hop) row.hopBytes += delta;
            };

            byKind.set(kind, (byKind.get(kind) ?? 0) + delta);
            if (INFO_KINDS.has(kind)) continue;

            const group = bot ? groupOf(bot) : '(unregistered sockets)';
            let g = byGroup.get(group);
            if (!g) byGroup.set(group, g = { ...emptyRow(), byMode: new Map() });
            add(g);
            if (kind === 'sdk_out') g.byMode.set(mode, (g.byMode.get(mode) ?? 0) + delta);

            let e = byEdge.get(edge);
            if (!e) byEdge.set(edge, e = emptyRow());
            add(e);

            let i = byIp.get(ip || '(unknown)');
            if (!i) byIp.set(ip || '(unknown)', i = { ...emptyRow(), groups: new Set() });
            add(i);
            if (bot) i.groups.add(group);

            let v = byVia.get(via);
            if (!v) byVia.set(via, v = { ...emptyRow(), groups: new Set() });
            add(v);
            if (bot) v.groups.add(group);

            if (bot) {
                let b = byBot.get(bot);
                if (!b) byBot.set(bot, b = emptyRow());
                add(b);
            }
        }

        // Live connection counts per group, so a group's bytes can be read
        // against how many bots and subscriptions it is running right now.
        const liveBots = new Map<string, number>();
        for (const bot of live.bots) liveBots.set(groupOf(bot), (liveBots.get(groupOf(bot)) ?? 0) + 1);
        const liveSubs = new Map<string, Record<string, number>>();
        for (const sdk of live.sdks) {
            const counts = liveSubs.get(groupOf(sdk.bot)) ?? {};
            counts[sdk.mode] = (counts[sdk.mode] ?? 0) + 1;
            liveSubs.set(groupOf(sdk.bot), counts);
        }

        const mbps = (n: number) => +(n / seconds / 1e6).toFixed(3);
        const usdPerMonth = (row: Row) => +((row.outBytes * EGRESS_USD_PER_GB + row.hopBytes * CROSS_REGION_USD_PER_GB)
            / 1e9 / seconds * SECONDS_PER_MONTH).toFixed(0);
        const shape = (row: Row) => ({
            inMBps: mbps(row.inBytes),
            outMBps: mbps(row.outBytes),
            avgOutFrameKB: row.outFrames ? +(row.outBytes / row.outFrames / 1000).toFixed(1) : 0,
            estUsdPerMonth: usdPerMonth(row)
        });
        const sortByCost = <T extends { estUsdPerMonth: number; outMBps: number }>(rows: T[]) =>
            rows.sort((a, b) => b.estUsdPerMonth - a.estUsdPerMonth || b.outMBps - a.outMBps);

        // Fold single-account "groups" together; they are individual players,
        // not swarms, and would otherwise bury the table.
        const groups: any[] = [];
        const other = { ...emptyRow(), byMode: new Map<string, number>(), members: 0 };
        for (const [group, row] of byGroup) {
            if ((liveBots.get(group) ?? 0) <= 1 && group !== '(unregistered sockets)') {
                other.inBytes += row.inBytes;
                other.outBytes += row.outBytes;
                other.outFrames += row.outFrames;
                other.stateFramesIn += row.stateFramesIn;
                other.hopBytes += row.hopBytes;
                for (const [mode, n] of row.byMode) other.byMode.set(mode, (other.byMode.get(mode) ?? 0) + n);
                other.members++;
                continue;
            }
            const bots = liveBots.get(group) ?? 0;
            groups.push({
                group,
                bots,
                subs: liveSubs.get(group) ?? {},
                ...shape(row),
                publishHzPerBot: bots ? +(row.stateFramesIn / seconds / bots).toFixed(2) : 0,
                sdkOutMBpsByMode: Object.fromEntries([...row.byMode].map(([m, n]) => [m, mbps(n)]))
            });
        }
        if (other.members) {
            groups.push({
                group: `(single accounts: ${other.members})`,
                bots: other.members,
                subs: {},
                ...shape(other),
                publishHzPerBot: +(other.stateFramesIn / seconds / other.members).toFixed(2),
                sdkOutMBpsByMode: Object.fromEntries([...other.byMode].map(([m, n]) => [m, mbps(n)]))
            });
        }

        return {
            windowSec: +seconds.toFixed(0),
            uptimeSec: +((now - this.startedAt) / 1000).toFixed(0),
            note: 'JSON payload bytes before WebSocket framing/compression; $ uses NA list prices (egress $0.02/GB + cross-region $0.006/GB for non-iad edges)',
            totals: Object.fromEntries([...byKind].map(([k, n]) => [k, mbps(n)])),
            groups: sortByCost(groups),
            edges: sortByCost([...byEdge].map(([edge, row]) => ({ edge, ...shape(row) }))),
            paths: sortByCost([...byVia].map(([via, row]) => ({ via, groups: [...row.groups].slice(0, 12), ...shape(row) }))),
            sources: sortByCost([...byIp].map(([ip, row]) => ({ ip, groups: [...row.groups].slice(0, 8), ...shape(row) }))).slice(0, 25),
            topBots: sortByCost([...byBot].map(([bot, row]) => ({ bot, ...shape(row) }))).slice(0, 25)
        };
    }
}

/** Fixed-width text rendering of report() for reading over `fly ssh console`. */
export function formatTrafficReport(r: ReturnType<TrafficMeter['report']>): string {
    const lines: string[] = [];
    const pad = (s: unknown, n: number) => String(s).padEnd(n);
    const num = (s: unknown, n: number) => String(s).padStart(n);
    lines.push(`window ${r.windowSec}s (uptime ${r.uptimeSec}s) — ${r.note}`);
    lines.push(`totals MB/s: ${Object.entries(r.totals).map(([k, v]) => `${k}=${v}`).join('  ')}`);
    lines.push('');
    lines.push(`${pad('group', 28)}${num('bots', 5)} ${pad('subs', 22)}${num('pub Hz', 7)}${num('in MB/s', 9)}${num('out MB/s', 10)}${num('frame KB', 10)}${num('$/mo', 7)}  sdk out by mode`);
    for (const g of r.groups) {
        const subs = Object.entries(g.subs).map(([m, n]) => `${m}:${n}`).join(' ');
        const modes = Object.entries(g.sdkOutMBpsByMode).map(([m, v]) => `${m}=${v}`).join(' ');
        lines.push(`${pad(g.group, 28)}${num(g.bots, 5)} ${pad(subs, 22)}${num(g.publishHzPerBot, 7)}${num(g.inMBps, 9)}${num(g.outMBps, 10)}${num(g.avgOutFrameKB, 10)}${num(g.estUsdPerMonth, 7)}  ${modes}`);
    }
    lines.push('');
    lines.push(`${pad('edge', 10)}${num('in MB/s', 9)}${num('out MB/s', 10)}${num('$/mo', 7)}`);
    for (const e of r.edges) lines.push(`${pad(e.edge, 10)}${num(e.inMBps, 9)}${num(e.outMBps, 10)}${num(e.estUsdPerMonth, 7)}`);
    lines.push('');
    lines.push(`${pad('path', 10)}${num('in MB/s', 9)}${num('out MB/s', 10)}${num('$/mo', 7)}  groups (out MB/s is pre-compression)`);
    for (const p of r.paths) lines.push(`${pad(p.via, 10)}${num(p.inMBps, 9)}${num(p.outMBps, 10)}${num(p.estUsdPerMonth, 7)}  ${p.groups.join(',')}`);
    lines.push('');
    lines.push(`${pad('source ip', 40)}${num('in MB/s', 9)}${num('out MB/s', 10)}${num('$/mo', 7)}  groups`);
    for (const s of r.sources) lines.push(`${pad(s.ip, 40)}${num(s.inMBps, 9)}${num(s.outMBps, 10)}${num(s.estUsdPerMonth, 7)}  ${s.groups.join(',')}`);
    return lines.join('\n') + '\n';
}

// Which top-level state fields carry the bytes, and how much of each repeats
// unchanged from the bot's previous frame (what a send-only-changes protocol
// would save). Every `every`-th frame per bot is paired with the next one and
// both are measured, so the cost is ~2/every of the frames re-stringified.
interface FieldStat {
    bytes: number;
    unchangedBytes: number;
}

export class StateFieldSampler {
    private countdown = new Map<string, number>();
    private pending = new Map<string, Map<string, string>>();
    private stats = new Map<string, Map<string, FieldStat>>(); // group -> field -> stat
    private pairs = new Map<string, number>();                 // group -> sampled frame pairs

    constructor(private every = 30, private random: () => number = Math.random) {}

    observe(bot: string, state: Record<string, unknown>): void {
        const previous = this.pending.get(bot);
        if (previous) {
            this.pending.delete(bot);
            const group = groupOf(bot);
            let fields = this.stats.get(group);
            if (!fields) this.stats.set(group, fields = new Map());
            for (const [field, value] of Object.entries(state)) {
                const json = JSON.stringify(value) ?? '';
                let stat = fields.get(field);
                if (!stat) fields.set(field, stat = { bytes: 0, unchangedBytes: 0 });
                stat.bytes += json.length;
                if (previous.get(field) === json) stat.unchangedBytes += json.length;
            }
            this.pairs.set(group, (this.pairs.get(group) ?? 0) + 1);
            return;
        }
        // Random first phase so bots that connected together don't sample together.
        const left = (this.countdown.get(bot) ?? Math.ceil(this.random() * this.every)) - 1;
        if (left > 0) {
            this.countdown.set(bot, left);
            return;
        }
        this.countdown.set(bot, this.every);
        this.pending.set(bot, new Map(Object.entries(state).map(([field, value]) => [field, JSON.stringify(value) ?? ''])));
    }

    report() {
        const summarize = (fields: Map<string, FieldStat>, pairs: number) => {
            const total = [...fields.values()].reduce((n, f) => n + f.bytes, 0);
            const unchanged = [...fields.values()].reduce((n, f) => n + f.unchangedBytes, 0);
            return {
                pairs,
                avgFrameKB: pairs ? +(total / pairs / 1000).toFixed(1) : 0,
                unchangedPct: total ? +(100 * unchanged / total).toFixed(1) : 0,
                fields: [...fields]
                    .map(([field, f]) => ({
                        field,
                        sharePct: total ? +(100 * f.bytes / total).toFixed(1) : 0,
                        avgKB: pairs ? +(f.bytes / pairs / 1000).toFixed(2) : 0,
                        unchangedPct: f.bytes ? +(100 * f.unchangedBytes / f.bytes).toFixed(1) : 0
                    }))
                    .sort((a, b) => b.sharePct - a.sharePct)
            };
        };
        const all = new Map<string, FieldStat>();
        let allPairs = 0;
        const groups = [...this.stats].map(([group, fields]) => {
            for (const [field, f] of fields) {
                const a = all.get(field) ?? { bytes: 0, unchangedBytes: 0 };
                a.bytes += f.bytes;
                a.unchangedBytes += f.unchangedBytes;
                all.set(field, a);
            }
            allPairs += this.pairs.get(group) ?? 0;
            return { group, ...summarize(fields, this.pairs.get(group) ?? 0) };
        }).sort((a, b) => b.pairs * b.avgFrameKB - a.pairs * a.avgFrameKB);
        return { all: summarize(all, allPairs), groups };
    }
}

export function formatFieldReport(r: ReturnType<StateFieldSampler['report']>, topFields = 10): string {
    const lines: string[] = [];
    const block = (name: string, s: typeof r.all) => {
        lines.push(`${name}: ${s.pairs} sampled frames, avg ${s.avgFrameKB} KB, ${s.unchangedPct}% of bytes unchanged from the previous frame`);
        for (const f of s.fields.slice(0, topFields)) {
            lines.push(`    ${f.field.padEnd(22)}${String(f.sharePct).padStart(6)}% of bytes ${String(f.avgKB).padStart(8)} KB/frame ${String(f.unchangedPct).padStart(6)}% unchanged`);
        }
    };
    block('ALL BOTS', r.all);
    for (const g of r.groups.slice(0, 12)) {
        lines.push('');
        block(g.group, g);
    }
    return lines.join('\n') + '\n';
}
