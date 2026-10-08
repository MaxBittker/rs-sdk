// Local prototype: refresh only the public bank hiscore fields from production.
// Usage: bun tools/server/preview-bank-census.ts --snapshot=/path/to/snapshot.json --port=8795
import { parseBankSnapshots } from '../../src/web/pages/BankHiscores.js';
import type { BankHiscoreRow } from '../../src/web/pages/BankHiscores.js';
import { summarizeBankItems, renderBankItemCensus } from '../../src/web/pages/BankItemCensus.js';

const args = new Map(
    process.argv.slice(2).map(arg => {
        const [key, ...value] = arg.replace(/^--/, '').split('=');
        return [key, value.join('=')];
    })
);
const snapshotPath = args.get('snapshot');
if (!snapshotPath) throw new Error('Pass --snapshot=/path/to/snapshot.json');
const port = Number(args.get('port') || 8795);
type Snapshot = { capturedAt: string; profile: string; rows: BankHiscoreRow[] };
const load = (snapshot: Snapshot) => ({ capturedAt: snapshot.capturedAt, profile: snapshot.profile, census: summarizeBankItems(parseBankSnapshots(snapshot.rows)) });
let data = load((await Bun.file(snapshotPath).json()) as Snapshot);
let refreshing: Promise<void> | null = null;

const remoteScript = [
    'const { Database } = require("bun:sqlite");',
    'const database = new Database("/opt/server/data/db.sqlite", { readonly: true });',
    'const hidden = new Set((process.env.HISCORES_HIDDEN_NAMES || "").split(",").map(n => n.trim().toLowerCase()).filter(Boolean));',
    'const rows = database.query("SELECT account.username, hiscore_bank.value, hiscore_bank.items FROM hiscore_bank JOIN account ON account.id = hiscore_bank.account_id WHERE hiscore_bank.profile = ? AND account.staffmodlevel <= 1").all("main").filter(row => !hidden.has(row.username.toLowerCase()));',
    'console.log(JSON.stringify({ capturedAt: new Date().toISOString(), profile: "main", rows })); database.close();'
].join(' ');
const refresh = async () => {
    const child = Bun.spawn(['fly', 'ssh', 'console', '--app', 'rs-sdk-demo', '--quiet', '--command', `bun -e '${remoteScript}'`], { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (code !== 0) throw new Error(`Production snapshot read failed: ${stderr}`);
    const snapshot = JSON.parse(stdout) as Snapshot;
    const next = load(snapshot);
    await Bun.write(snapshotPath, stdout);
    data = next;
};

Bun.serve({
    hostname: '127.0.0.1',
    port,
    idleTimeout: 60,
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/refresh' && request.method === 'POST') {
            try {
                refreshing ??= refresh();
                await refreshing;
                return Response.redirect(new URL('/hiscores/bank/items', url), 303);
            } catch {
                return new Response('Could not refresh production data. The last snapshot is still available. Go back to the census and try again.', { status: 502 });
            } finally {
                refreshing = null;
            }
        }
        if (url.pathname === '/' || url.pathname === '/hiscores/bank/items') {
            return renderBankItemCensus(data.census, url, { profile: data.profile, capturedAt: data.capturedAt, holdersBaseUrl: 'https://rs-sdk-demo.fly.dev/hiscores/bank', assetBaseUrl: 'https://rs-sdk-demo.fly.dev', refresh: true });
        }
        return new Response('Not found', { status: 404 });
    }
});
console.log(`Bank census prototype: http://127.0.0.1:${port}/hiscores/bank/items`);
console.log(`Snapshot: ${data.census.banks.toLocaleString('en-US')} production banks, ${data.census.items.length} distinct items, captured ${data.capturedAt}`);
