import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { db } from '../../src/db/query.js';
import { handleHiscoresBankPage } from '../../src/web/pages/hiscores.js';

const database = new Database('db.sqlite');
database.exec(`
    CREATE TABLE account (id INTEGER PRIMARY KEY, username TEXT, staffmodlevel INTEGER);
    CREATE TABLE hiscore_bank (account_id INTEGER, profile TEXT, value INTEGER, items TEXT);
`);
const item = (name: string, value: number, count = 100) => ({ name, value, count });
let accountId = 0;
function bank(username: string, value: number, items: ReturnType<typeof item>[], profile = 'main', staff = 0) {
    database.query('INSERT INTO account VALUES (?, ?, ?)').run(++accountId, username, staff);
    database.query('INSERT INTO hiscore_bank VALUES (?, ?, ?, ?)').run(accountId, profile, value, JSON.stringify(items));
}
for (let i = 0; i < 50; i++) bank(`rich${String(i).padStart(2, '0')}`, 1000000, [item('Lobster', 999980), item('Shrimps', 20)]);
bank('shrimp-holder', 1100, [item('Raw shrimps', 400), item('Shrimps', 600), item('Lobster', 100)]);
bank('Private', 2000000, [item('Shrimps', 2000000)]);
bank('staff', 3000000, [item('Shrimps', 3000000)], 'main', 2);
bank('other-profile', 4000000, [item('Shrimps', 4000000)], 'iron');
bank('literal', 7, [item('100%_rare [fish]', 7)]);
database.close();

const request = async (path: string) => {
    const response = await handleHiscoresBankPage(new URL(`http://localhost${path}`));
    assert.ok(response);
    assert.equal(response.status, 200);
    return response.text();
};

try {
    const all = await request('/hiscores/bank');
    assert.ok(all.includes('name="q"'));
    assert.ok(all.includes('placeholder="e.g. shrimp"'));
    assert.ok(all.includes('rich00'));
    assert.ok(!all.includes('shrimp-holder'));
    assert.ok(!all.includes('>Private</a>'));
    assert.ok(!all.includes('>staff</a>'));

    const filtered = await request('/hiscores/bank?q=%20ShRiMp%20');
    assert.ok(filtered.includes('value="ShRiMp"'));
    assert.ok(filtered.includes('<b>Matching Items</b>'));
    assert.ok(filtered.indexOf('>shrimp-holder</a>') < filtered.indexOf('>rich00</a>'));
    assert.ok(filtered.includes('title="1,000 gp">1,000</td>'));
    assert.ok(filtered.includes('Raw shrimps'));
    assert.ok(!filtered.includes('Lobster'));
    assert.ok(!filtered.includes('>Private</a>'));
    assert.ok(!filtered.includes('>staff</a>'));
    assert.ok(!filtered.includes('>other-profile</a>'));
    assert.equal((filtered.match(/<td align="right">\d+<\/td>/g) || []).length, 50);

    const iron = await request('/highscores/bank/?q=shrimp&profile=iron');
    assert.ok(iron.includes('>other-profile</a>'));
    assert.ok(!iron.includes('>shrimp-holder</a>'));
    assert.ok(iron.includes('name="profile" value="iron"'));
    assert.ok(iron.includes('href="/hiscores/bank?profile=iron"'));

    const empty = await request('/hiscores/bank?q=no-such-item');
    assert.ok(empty.includes('No banked items match &ldquo;no-such-item&rdquo;'));
    assert.ok(!(empty.match(/<td align="right">\d+<\/td>/g) || []).length);
    assert.ok((await request('/hiscores/bank?q=%25_')).includes('>literal</a>'));
    assert.ok((await request('/hiscores/bank?q=%20%20')).includes('<b>Top Items</b>'));

    const malicious = '<script>alert("x")</script>';
    const escaped = await request(`/hiscores/bank?q=${encodeURIComponent(malicious)}`);
    assert.ok(!escaped.includes(malicious));
    assert.ok(escaped.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
    assert.equal(await handleHiscoresBankPage(new URL('http://localhost/hiscores/outfit?q=shrimp')), null);

    // Different searches share one snapshot; refresh it when the leaderboard TTL expires.
    const updater = new Database('db.sqlite');
    updater.query('UPDATE hiscore_bank SET items = ? WHERE account_id = ?').run(JSON.stringify([item('Raw shrimps', 5000)]), 51);
    updater.close();
    assert.ok((await request('/hiscores/bank?q=raw%20shrimp')).includes('title="400 gp">400</td>'));
    const originalNow = Date.now;
    const afterExpiry = originalNow() + 60001;
    try {
        Date.now = () => afterExpiry;
        assert.ok((await request('/hiscores/bank?q=raw%20shrimp')).includes('title="5,000 gp">5,000</td>'));
    } finally {
        Date.now = originalNow;
    }
    console.log('Bank hiscores HTTP checks passed');
} finally {
    await db.destroy();
}
