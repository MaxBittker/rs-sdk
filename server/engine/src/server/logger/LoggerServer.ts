import http from 'http';
import { gzipSync } from 'zlib';

import { WebSocket, WebSocketServer } from 'ws';

import { sql } from 'kysely';

import { db, toDbDate } from '#/db/query.js';
import { PlayerTelemetryEvent } from '#/engine/entity/tracking/PlayerTelemetry.js';
import { encodeSegment, decodeSegment } from '#/server/logger/TelemetryCodec.js';
import { SessionLog } from '#/engine/entity/tracking/SessionLog.js';
import { WealthTransactionEvent } from '#/engine/entity/tracking/WealthEvent.js';
import Environment from '#/util/Environment.js';
import { printInfo } from '#/util/Logger.js';

// raw telemetry rows older than this are compacted: per-player runs of samples are
// delta-encoded + deflated into player_telemetry_segment (~2-4 bytes/sample instead of
// ~180 bytes of row+index), skills blobs are moved to player_skills_log, and the raw
// rows are deleted. No granularity is lost - segments decode back to the full samples.
const TELEMETRY_COMPACT_MIN_AGE_HOURS = Number(process.env.TELEMETRY_COMPACT_MIN_AGE_HOURS ?? 1);
// 10min: under swarm load (~1100 players) raw grows ~8k rows/min, and buildTraces
// loads all uncompacted raw rows into memory - keep that window small
const TELEMETRY_COMPACT_INTERVAL_MS = 10 * 60 * 1000;
const TELEMETRY_COMPACT_STARTUP_DELAY_MS = 2 * 60 * 1000;
const TELEMETRY_COMPACT_BATCH_ROWS = 120_000;

function dbDateToEpoch(ts: string): number {
    return Math.floor(new Date(ts.replace(' ', 'T') + 'Z').getTime() / 1000);
}

async function compactTelemetry() {
    let segments = 0;
    let rowsCompacted = 0;

    for (;;) {
        const rows = await db
            .selectFrom('player_telemetry')
            .selectAll()
            .where('timestamp', '<', sql<string>`datetime('now', '-' || ${TELEMETRY_COMPACT_MIN_AGE_HOURS} || ' hours')`)
            .orderBy('id')
            .limit(TELEMETRY_COMPACT_BATCH_ROWS)
            .execute();

        if (rows.length === 0) {
            break;
        }

        // one segment per player/session/ip per hour bucket; a group split across
        // batches just yields an extra segment, which decodes the same
        const groups = new Map<string, typeof rows>();
        for (const row of rows) {
            const key = `${row.username}\0${row.session_uuid ?? ''}\0${row.ip ?? ''}\0${String(row.timestamp).slice(0, 13)}`;
            const group = groups.get(key);
            if (group) {
                group.push(row);
            } else {
                groups.set(key, [row]);
            }
        }

        for (const group of groups.values()) {
            const data = encodeSegment(
                group.map(r => ({
                    epoch: dbDateToEpoch(String(r.timestamp)),
                    x: r.x,
                    z: r.z,
                    level: r.level,
                    xp: r.total_xp
                }))
            );
            const skillRows = group.filter(r => r.skills !== null);

            await db.transaction().execute(async trx => {
                await trx
                    .insertInto('player_telemetry_segment')
                    .values({
                        username: group[0].username,
                        session_uuid: group[0].session_uuid,
                        ip: group[0].ip,
                        start_time: group[0].timestamp,
                        end_time: group[group.length - 1].timestamp,
                        sample_count: group.length,
                        data
                    })
                    .execute();

                if (skillRows.length > 0) {
                    await trx
                        .insertInto('player_skills_log')
                        .values(
                            skillRows.map(r => ({
                                timestamp: r.timestamp,
                                username: r.username,
                                total_xp: r.total_xp,
                                skills: r.skills as string
                            }))
                        )
                        .execute();
                }

                await trx
                    .deleteFrom('player_telemetry')
                    .where(
                        'id',
                        'in',
                        group.map(r => r.id)
                    )
                    .execute();
            });

            segments++;
            rowsCompacted += group.length;
        }

        if (rows.length < TELEMETRY_COMPACT_BATCH_ROWS) {
            break;
        }
    }

    if (rowsCompacted > 0) {
        printInfo(`Telemetry compaction: ${rowsCompacted} rows -> ${segments} segments`);
    }
}

// Anonymous movement traces for the map's history mode. Runs here (worker thread) so
// decoding thousands of segments never stalls the game tick; the engine web server
// proxies /playertraces to this port. Lines are flat [x1,z1,x2,z2,...] with no identity.
const TRACES_HTTP_PORT = Environment.logger.port + 1;
const TRACES_MAX_HOURS = 168;
const TRACES_MAX_POINTS = 2_000_000;
// hard ceilings on what a single build may hold in memory - a request for a busy
// window must degrade (truncate) rather than OOM the whole server
const TRACES_MAX_INPUT_POINTS = TRACES_MAX_POINTS * 4;
const TRACES_MAX_RAW_ROWS = 500_000;
// a week-wide window at swarm scale can hold 300k+ segment blobs; cap how many we
// materialize at once (most recent first) so the build can't blow memory
const TRACES_MAX_SEGMENTS = 250_000;
const TRACES_CACHE_MS = 5 * 60 * 1000;

const tracesCache = new Map<number, { at: number; buf: Buffer }>();

// only connect consecutive samples close in time AND plausibly-walkable in space -
// anything else (coarse-cadence data, teleports, login gaps) must not draw a line the
// player never walked. Broken-off samples become single-point lines, rendered as dots.
// Since corner sampling shipped (samples at every direction change), connected
// segments are exact walked paths; data collected before that draws as dots only.
const TRACES_LINE_MAX_DT = 15; // seconds
const TRACES_LINE_MAX_STEP = 70; // tiles
const TRACES_LINE_SPEED = 8; // tiles/second - fastest legit movement is ~6.7 running
const TRACES_LINE_MIN_EPOCH = Date.parse('2026-07-21T21:30:00Z') / 1000; // corner sampling deploy

function splitIntoTraces(samples: { epoch: number; x: number; z: number }[]): number[][] {
    const out: number[][] = [];
    let current: number[] = [];
    let prev: { epoch: number; x: number; z: number } | null = null;

    for (const s of samples) {
        if (prev) {
            if (s.x === prev.x && s.z === prev.z) {
                prev = s;
                continue;
            }
            const dt = s.epoch - prev.epoch;
            const step = Math.max(Math.abs(s.x - prev.x), Math.abs(s.z - prev.z));
            const maxStep = Math.max(8, Math.min(TRACES_LINE_MAX_STEP, dt * TRACES_LINE_SPEED));
            if (prev.epoch < TRACES_LINE_MIN_EPOCH || dt > TRACES_LINE_MAX_DT || step > maxStep) {
                out.push(current);
                current = [];
            }
        }
        current.push(s.x, s.z);
        prev = s;
    }
    if (current.length > 0) {
        out.push(current);
    }
    return out;
}

// drop repeated points and interior points of straight runs
function thinLine(line: number[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < line.length; i += 2) {
        const x = line[i];
        const z = line[i + 1];
        const n = out.length;
        if (n >= 2 && out[n - 2] === x && out[n - 1] === z) {
            continue;
        }
        if (n >= 4) {
            const dx1 = out[n - 2] - out[n - 4];
            const dz1 = out[n - 1] - out[n - 3];
            const dx2 = x - out[n - 2];
            const dz2 = z - out[n - 1];
            if (dx1 * dz2 === dx2 * dz1 && dx1 * dx2 + dz1 * dz2 > 0) {
                out[n - 2] = x;
                out[n - 1] = z;
                continue;
            }
        }
        out.push(x, z);
    }
    return out;
}

async function buildTraces(hours: number): Promise<Buffer> {
    const since = toDbDate(Date.now() - hours * 3600_000);
    const lines: number[][] = [];
    let points = 0;

    const segments = await db
        .selectFrom('player_telemetry_segment')
        .select(['data'])
        .where('end_time', '>=', since)
        .orderBy('end_time', 'desc')
        .limit(TRACES_MAX_SEGMENTS)
        .execute();

    let truncated = segments.length === TRACES_MAX_SEGMENTS;
    for (const seg of segments) {
        if (points >= TRACES_MAX_INPUT_POINTS) {
            truncated = true;
            break;
        }
        for (const trace of splitIntoTraces(decodeSegment(Buffer.from(seg.data)))) {
            const line = thinLine(trace);
            points += line.length / 2;
            lines.push(line);
        }
    }

    // recent rows not compacted yet - group per session so lines never span players
    const raw = await db
        .selectFrom('player_telemetry')
        .select(['username', 'session_uuid', 'timestamp', 'x', 'z'])
        .where('timestamp', '>=', since)
        .orderBy('id')
        .limit(TRACES_MAX_RAW_ROWS)
        .execute();
    if (raw.length === TRACES_MAX_RAW_ROWS) {
        truncated = true;
    }

    const rawSessions = new Map<string, { epoch: number; x: number; z: number }[]>();
    for (const r of raw) {
        const key = `${r.username}\0${r.session_uuid ?? ''}`;
        const sample = { epoch: dbDateToEpoch(String(r.timestamp)), x: r.x, z: r.z };
        const session = rawSessions.get(key);
        if (session) {
            session.push(sample);
        } else {
            rawSessions.set(key, [sample]);
        }
    }
    for (const samples of rawSessions.values()) {
        if (points >= TRACES_MAX_INPUT_POINTS) {
            truncated = true;
            break;
        }
        for (const trace of splitIntoTraces(samples)) {
            const line = thinLine(trace);
            points += line.length / 2;
            lines.push(line);
        }
    }

    if (truncated) {
        printInfo(`Traces build for ${hours}h hit input cap - result is a partial sample`);
    }

    // halve sample density until under the cap so the payload stays bounded; dot-only
    // lines can't be thinned, so bail once a pass stops making progress
    let prevPoints = Infinity;
    while (points > TRACES_MAX_POINTS && points < prevPoints) {
        prevPoints = points;
        points = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.length > 8) {
                const thinned: number[] = [];
                for (let j = 0; j < line.length; j += 4) {
                    thinned.push(line[j], line[j + 1]);
                }
                const last = line.length - 2;
                if (thinned[thinned.length - 2] !== line[last] || thinned[thinned.length - 1] !== line[last + 1]) {
                    thinned.push(line[last], line[last + 1]);
                }
                lines[i] = thinned;
            }
            points += lines[i].length / 2;
        }
    }

    return gzipSync(JSON.stringify({ hours, lines }));
}

function startTracesHttp() {
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', 'http://localhost');
            if (url.pathname !== '/traces') {
                res.writeHead(404);
                res.end();
                return;
            }

            const hours = Math.max(1, Math.min(TRACES_MAX_HOURS, Number(url.searchParams.get('hours')) || 24));

            let cached = tracesCache.get(hours);
            if (!cached || Date.now() - cached.at > TRACES_CACHE_MS) {
                cached = { at: Date.now(), buf: await buildTraces(hours) };
                tracesCache.set(hours, cached);
            }

            // served as opaque bytes so the engine's proxy fetch doesn't transparently
            // decompress; the proxy re-labels it as gzipped json for the browser
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(cached.buf);
        } catch (err) {
            console.error('Traces request failed', err);
            res.writeHead(500);
            res.end();
        }
    });
    server.listen(TRACES_HTTP_PORT, '0.0.0.0', () => {
        printInfo(`Telemetry traces listening on port ${TRACES_HTTP_PORT}`);
    });
}

let compacting = false;
async function compactTelemetrySafe() {
    if (compacting) {
        return;
    }
    compacting = true;
    try {
        await compactTelemetry();
    } catch (err) {
        console.error('Telemetry compaction failed', err);
    } finally {
        compacting = false;
    }
}

export default class LoggerServer {
    private server: WebSocketServer;

    constructor() {
        setTimeout(compactTelemetrySafe, TELEMETRY_COMPACT_STARTUP_DELAY_MS);
        setInterval(compactTelemetrySafe, TELEMETRY_COMPACT_INTERVAL_MS);
        startTracesHttp();
        this.server = new WebSocketServer({ port: Environment.logger.port, host: '0.0.0.0' }, () => {
            printInfo(`Logger server listening on port ${Environment.logger.port}`);
        });

        this.server.on('connection', (socket: WebSocket) => {
            socket.on('message', async (data: Buffer) => {
                try {
                    const msg = JSON.parse(data.toString());
                    const { type } = msg;

                    switch (type) {
                        case 'session_log': {
                            const { logs } = msg;

                            const schemaLogs = logs.map((x: SessionLog) => ({
                                session_uuid: x.session_uuid,
                                timestamp: toDbDate(x.timestamp),
                                coord: x.coord,
                                event: x.event,
                                event_type: x.event_type
                            }));

                            await db.insertInto('session_log').values(schemaLogs).execute();
                            break;
                        }
                        case 'wealth_event': {
                            const { events } = msg;

                            const schemaEvents = events.map((x: WealthTransactionEvent) => ({
                                session_uuid: x.session_uuid,
                                timestamp: toDbDate(x.timestamp),
                                coord: x.coord,
                                event_type: x.event_type,

                                account_items: JSON.stringify(x.account_items),
                                account_value: x.account_value,

                                recipient_session: x.recipient_session,
                                recipient_items: x.recipient_items ? JSON.stringify(x.recipient_items) : null,
                                recipient_value: x.recipient_value
                            }));

                            await db.insertInto('session_wealth').values(schemaEvents).execute();
                            break;
                        }
                        case 'player_telemetry': {
                            const { events } = msg;

                            const rows = events.map((x: PlayerTelemetryEvent) => ({
                                timestamp: toDbDate(x.timestamp),
                                username: x.username,
                                session_uuid: x.session_uuid,
                                x: x.x,
                                z: x.z,
                                level: x.level,
                                ip: x.ip,
                                total_xp: x.total_xp,
                                skills: x.skills
                            }));

                            await db.insertInto('player_telemetry').values(rows).execute();
                            break;
                        }
                        case 'report': {
                            const { session_uuid, timestamp, coord, offender, reason } = msg;

                            await db
                                .insertInto('report')
                                .values({
                                    session_uuid,
                                    timestamp: toDbDate(timestamp),
                                    coord,
                                    offender,
                                    reason
                                })
                                .execute();

                            break;
                        }
                        case 'input_track': {
                            const { session_uuid, timestamp, buf } = msg;

                            await db
                                .insertInto('input_report')
                                .values({
                                    session_uuid,
                                    timestamp: toDbDate(timestamp),
                                    data: Buffer.from(buf, 'base64')
                                })
                                .execute();
                            break;
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            });

            socket.on('close', () => {});
            socket.on('error', () => {});
        });
    }
}
