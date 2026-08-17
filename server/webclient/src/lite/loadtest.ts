// Local load generator: log N idle lite sessions into a server so the engine can be
// profiled with many players (fresh accounts all spawn on the same tile, which
// reproduces a stacked crowd). Pair with the management endpoints:
//   curl localhost:8898/tickstats ; curl 'localhost:8898/profile?ms=3000'
//
//   cd server/webclient
//   bun src/lite/loadtest.ts --n=300 [--host=localhost:8888] [--prefix=load] [--minutes=10]
import { startSession, type LiteSession } from './session.js';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args.set(m[1], m[2]);
}
const n = Number(args.get('n') ?? 100);
const host = args.get('host') ?? 'localhost:8888';
const prefix = args.get('prefix') ?? 'load';
const minutes = Number(args.get('minutes') ?? 10);
const batch = Number(args.get('batch') ?? 10);

const sessions: LiteSession[] = [];
let failed = 0;
const t0 = Date.now();
for (let i = 0; i < n; i += batch) {
    const wave = [];
    for (let j = i; j < Math.min(n, i + batch); j++) {
        const username = `${prefix}${String(j).padStart(3, '0')}`;
        wave.push(
            startSession({ host, username, password: 'loadtest', quiet: true, profanityFilter: false })
                .then(s => sessions.push(s))
                .catch(err => {
                    failed++;
                    console.error(`[loadtest] ${username}: ${err instanceof Error ? err.message : err}`);
                })
        );
    }
    await Promise.all(wave);
    console.log(`[loadtest] ${sessions.length} in game, ${failed} failed (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

console.log(`[loadtest] holding ${sessions.length} sessions for ${minutes} min`);
await Bun.sleep(minutes * 60_000);
for (const s of sessions) s.stop();
console.log('[loadtest] done');
