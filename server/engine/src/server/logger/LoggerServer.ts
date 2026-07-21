import { WebSocket, WebSocketServer } from 'ws';

import { sql } from 'kysely';

import { db, toDbDate } from '#/db/query.js';
import { PlayerTelemetryEvent } from '#/engine/entity/tracking/PlayerTelemetry.js';
import { encodeSegment } from '#/server/logger/TelemetryCodec.js';
import { SessionLog } from '#/engine/entity/tracking/SessionLog.js';
import { WealthTransactionEvent } from '#/engine/entity/tracking/WealthEvent.js';
import Environment from '#/util/Environment.js';
import { printInfo } from '#/util/Logger.js';

// raw telemetry rows older than this are compacted: per-player runs of samples are
// delta-encoded + deflated into player_telemetry_segment (~2-4 bytes/sample instead of
// ~180 bytes of row+index), skills blobs are moved to player_skills_log, and the raw
// rows are deleted. No granularity is lost - segments decode back to the full samples.
const TELEMETRY_COMPACT_MIN_AGE_HOURS = Number(process.env.TELEMETRY_COMPACT_MIN_AGE_HOURS ?? 2);
const TELEMETRY_COMPACT_INTERVAL_MS = 60 * 60 * 1000;
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
