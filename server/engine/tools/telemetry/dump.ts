// Dump a player's telemetry track (compacted segments + recent raw rows) as JSONL.
//
//   bun tools/telemetry/dump.ts <username> [hours=24]
//
// Each line: {"epoch":..,"time":"..","x":..,"z":..,"level":..,"xp":..,"ip":..,"session":..}

import { db } from '#/db/query.js';
import { decodeSegment } from '#/server/logger/TelemetryCodec.js';

const username = process.argv[2];
const hours = Number(process.argv[3] ?? 24);

if (!username) {
    console.error('usage: bun tools/telemetry/dump.ts <username> [hours=24]');
    process.exit(1);
}

const since = new Date(Date.now() - hours * 3600_000).toISOString().slice(0, 19).replace('T', ' ');

const segments = await db
    .selectFrom('player_telemetry_segment')
    .selectAll()
    .where('username', '=', username)
    .where('end_time', '>=', since)
    .orderBy('start_time')
    .execute();

for (const seg of segments) {
    for (const s of decodeSegment(Buffer.from(seg.data))) {
        console.log(
            JSON.stringify({
                epoch: s.epoch,
                time: new Date(s.epoch * 1000).toISOString(),
                x: s.x,
                z: s.z,
                level: s.level,
                xp: s.xp,
                ip: seg.ip,
                session: seg.session_uuid
            })
        );
    }
}

const raw = await db
    .selectFrom('player_telemetry')
    .selectAll()
    .where('username', '=', username)
    .where('timestamp', '>=', since)
    .orderBy('id')
    .execute();

for (const r of raw) {
    const epoch = Math.floor(new Date(String(r.timestamp).replace(' ', 'T') + 'Z').getTime() / 1000);
    console.log(
        JSON.stringify({
            epoch,
            time: new Date(epoch * 1000).toISOString(),
            x: r.x,
            z: r.z,
            level: r.level,
            xp: r.total_xp,
            ip: r.ip,
            session: r.session_uuid
        })
    );
}

process.exit(0);
