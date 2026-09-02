import { db, toDbDate } from '#/db/query.js';
import Environment from '#/util/Environment.js';
import { tryParseInt } from '#/util/TryParse.js';
import { escapeHtml, SKILL_NAMES, ENABLED_SKILLS } from '../utils.js';
import { playerSpriteUrl } from '#/web/sprites/SpriteRenderer.js';

const hiddenNames = Environment.HISCORES_HIDDEN_NAMES;

// Shared CSS styles for hiscores pages
const HISCORES_STYLES = `
    body, p, td { font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
    body { background: #000; color: #fff; margin: 0; padding: 0; }
    a { text-decoration: none; }
    .b { border-style: outset; border-width: 3pt; border-color: #373737; }
    .b2 { border-style: outset; border-width: 3pt; border-color: #570700; }
    .e { border: 2px solid #382418; }
    .c { text-decoration: none; color: #fff; }
    .c:hover { text-decoration: underline; }
    .white { text-decoration: none; color: #FFFFFF; }
    .red { text-decoration: none; color: #E10505; }
    .lblue { text-decoration: none; color: #9DB8C3; }
    .dblue { text-decoration: none; color: #0D6083; }
    .yellow { text-decoration: none; color: #FFE139; }
    .green { text-decoration: none; color: #04A800; }
    .purple { text-decoration: none; color: #C503FD; }
    .text-orange { color: #ffbb22; }
    select { background-color: #B1977E; }
    input { margin-top: 4px; }
`;

// Format gold value with K/M suffixes
function formatGold(value: number): string {
    if (value >= 10_000_000) {
        return `${Math.floor(value / 1_000_000)}M`;
    }
    if (value >= 100_000) {
        return `${Math.floor(value / 1_000)}K`;
    }
    return value.toLocaleString();
}

// Format stack count with K/M/B suffixes, no decimals
function formatStackCount(count: number): string {
    if (count >= 1_000_000_000) {
        return `${Math.floor(count / 1_000_000_000)}B`;
    }
    if (count >= 1_000_000) {
        return `${Math.floor(count / 1_000_000)}M`;
    }
    if (count >= 1_000) {
        return `${Math.floor(count / 1_000)}K`;
    }
    return `${count}`;
}

// Format playtime (in game ticks) to human-readable string
function formatPlaytime(ticks: number): string {
    const totalSeconds = Math.floor(ticks * (Environment.NODE_TICKRATE / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

// rs-sdk: ranked lists are served from a short-lived cache. Every hiscores request used to
// materialise the whole hiscore/hiscore_large table (160k+ rows) on the tick thread; a burst
// of page loads was enough to freeze the world for seconds. The list changes on player save
// (autosave is 15 min), so a 60s TTL is invisible to users.
type RankedRow = { username: string; level: number; playtime: number };
const RANKED_TTL_MS = Number(process.env.HISCORES_CACHE_MS ?? 60_000);
const rankedCache = new Map<string, { at: number; rows: RankedRow[]; pending: Promise<RankedRow[]> | null }>();

// category 0 = overall (hiscore_large type 0), otherwise hiscore type = category
async function getRankedList(profile: string, category: number): Promise<RankedRow[]> {
    const key = `${profile}:${category}`;
    const now = Date.now();
    const cached = rankedCache.get(key);
    if (cached && now - cached.at < RANKED_TTL_MS) {
        return cached.rows;
    }
    if (cached?.pending) {
        return cached.pending;
    }
    const load = (async () => {
        let rows: RankedRow[];
        if (category === 0) {
            let query = db
                .selectFrom('hiscore_large')
                .innerJoin('account', 'account.id', 'hiscore_large.account_id')
                .select(['account.username', 'hiscore_large.level', 'hiscore_large.playtime'])
                .where('hiscore_large.type', '=', 0)
                .where('hiscore_large.profile', '=', profile)
                .where('account.staffmodlevel', '<=', 1)
                .orderBy('hiscore_large.level', 'desc')
                .orderBy('hiscore_large.playtime', 'asc');
            if (hiddenNames.length > 0) {
                query = query.where(eb => eb.not(eb(eb.fn('lower', ['account.username']), 'in', hiddenNames)));
            }
            rows = await query.execute();
        } else {
            let query = db
                .selectFrom('hiscore')
                .innerJoin('account', 'account.id', 'hiscore.account_id')
                .select(['account.username', 'hiscore.level', 'hiscore.playtime'])
                .where('hiscore.type', '=', category)
                .where('hiscore.profile', '=', profile)
                .where('account.staffmodlevel', '<=', 1)
                .orderBy('hiscore.level', 'desc')
                .orderBy('hiscore.playtime', 'asc');
            if (hiddenNames.length > 0) {
                query = query.where(eb => eb.not(eb(eb.fn('lower', ['account.username']), 'in', hiddenNames)));
            }
            rows = await query.execute();
        }
        rankedCache.set(key, { at: Date.now(), rows, pending: null });
        return rows;
    })();
    rankedCache.set(key, { at: cached?.at ?? 0, rows: cached?.rows ?? [], pending: load });
    try {
        return await load;
    } catch (err) {
        rankedCache.delete(key);
        throw err;
    }
}

// rank of a player in a ranked list (1-based), or null when absent
function rankIn(rows: RankedRow[], username: string): number | null {
    const lower = username.toLowerCase();
    const idx = rows.findIndex(r => r.username.toLowerCase() === lower);
    return idx === -1 ? null : idx + 1;
}

// Player profile page handler
export async function handleHiscoresPlayerPage(url: URL): Promise<Response | null> {
    const match = url.pathname.match(/^\/hi(?:gh)?scores\/player\/([^/]+)\/?$/);
    if (!match) {
        return null;
    }

    const username = decodeURIComponent(match[1]);
    const profile = (url.searchParams.get('profile') || 'main').replace(/[^a-zA-Z0-9_-]/g, '');

    // Find the account
    const accountQuery = db.selectFrom('account').select(['id', 'username']).where('username', '=', username).where('staffmodlevel', '<=', 1);
    const account = await (hiddenNames.length > 0 ? accountQuery.where(eb => eb.not(eb(eb.fn('lower', ['username']), 'in', hiddenNames))) : accountQuery).executeTakeFirst();

    if (!account) {
        return new Response(`Player "${escapeHtml(username)}" not found.`, {
            status: 404,
            headers: { 'Content-Type': 'text/html' }
        });
    }

    // Get overall stats
    const overallStats = await db.selectFrom('hiscore_large').select(['level', 'value', 'playtime']).where('account_id', '=', account.id).where('profile', '=', profile).where('type', '=', 0).executeTakeFirst();

    // Get overall rank (by level DESC, playtime ASC) from the cached ranked list
    let overallRank = '-';
    if (overallStats) {
        const rank = rankIn(await getRankedList(profile, 0), account.username);
        overallRank = rank ? String(rank) : '-';
    }

    // Get individual skill stats
    const skillStats = await db.selectFrom('hiscore').select(['type', 'level', 'value', 'playtime']).where('account_id', '=', account.id).where('profile', '=', profile).execute();

    // Build skill rows with ranks
    const skillRows: string[] = [];

    // Overall row first
    skillRows.push(`
        <tr>
            <td><a href="/hiscores?category=0&profile=${profile}" class="c">Overall</a></td>
            <td align="right">${overallRank}</td>
            <td align="right">${overallStats ? overallStats.level.toLocaleString() : '-'}</td>
            <td align="right">${overallStats ? formatPlaytime(overallStats.playtime) : '-'}</td>
        </tr>
    `);

    // Individual skills
    for (const skill of ENABLED_SKILLS) {
        const stat = skillStats.find(s => s.type === skill.id + 1);
        let rank = '-';

        if (stat) {
            const r = rankIn(await getRankedList(profile, skill.id + 1), account.username);
            rank = r ? String(r) : '-';
        }

        const iconFile = skill.name.toLowerCase() + '.png';
        skillRows.push(`
            <tr>
                <td><a href="/hiscores?category=${skill.id + 1}&profile=${profile}" class="c"><img src="/img/skill/${iconFile}" width="16" height="16" style="vertical-align:middle;margin-right:4px">${skill.name}</a></td>
                <td align="right">${rank}</td>
                <td align="right">${stat ? stat.level.toLocaleString() : '-'}</td>
                <td align="right">${stat ? formatPlaytime(stat.playtime) : '-'}</td>
            </tr>
        `);
    }

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Hiscores for ${escapeHtml(account.username)}</title>
    <style>${HISCORES_STYLES}</style>
</head>
<body>
<table width="100%" height="100%" cellpadding="0" cellspacing="0">
    <tr>
        <td valign="middle">
            <center>
                <div style="width: 600px; position: relative;">

<!-- Top edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_a.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_d.jpg" width="100" height="43"></td>
    </tr>
</table>

<!-- Main content area -->
<table width="600" cellpadding="0" cellspacing="0" border="0" background="/img/background2.jpg">
    <tr>
        <td valign="bottom">
            <center>
                <br>
                <!-- Title box -->
                <table width="350" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <center>
                                <b>Hiscores for ${escapeHtml(account.username)}</b><br>
                                <a href="/" class="c">Main menu</a> | <a href="/hiscores?profile=${profile}" class="c">All Hiscores</a>
                            </center>
                        </td>
                    </tr>
                </table>
                <br>

                <!-- Profile selector -->
                <center>
                    <form method="GET" action="/hiscores/player/${encodeURIComponent(account.username)}">
                        <select name="profile" onchange="this.form.submit()">
                            <option value="main"${profile === 'main' ? ' selected' : ''}>Main</option>
                        </select>
                    </form>
                </center>

                <!-- Stats table -->
                <table width="400" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <table width="100%" cellspacing="2" cellpadding="2">
                                <tr>
                                    <td><b>Skill</b></td>
                                    <td align="right"><b>Rank</b></td>
                                    <td align="right"><b>Level</b></td>
                                    <td align="right"><b>Time</b></td>
                                </tr>
                                ${skillRows.join('')}
                            </table>
                        </td>
                    </tr>
                </table>

                <br>
            </center>
        </td>
    </tr>
</table>

<!-- Bottom edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_g2.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_h2.jpg" width="100" height="43"></td>
    </tr>
</table>

                </div>
            </center>
        </td>
    </tr>
</table>
</body>
</html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

export async function handleHiscoresPage(url: URL): Promise<Response | null> {
    if (!/^\/hi(?:gh)?scores\/?$/.test(url.pathname)) {
        return null;
    }

    const category = tryParseInt(url.searchParams.get('category'), -1);
    const profile = (url.searchParams.get('profile') || 'main').replace(/[^a-zA-Z0-9_-]/g, '');
    const playerSearch = url.searchParams.get('player')?.toLowerCase().trim() || '';
    const rankSearch = tryParseInt(url.searchParams.get('rank'), -1);

    let rows: { rank: number; username: string; level: number; playtime: number }[] = [];
    let selectedSkill = 'Overall';
    let searchedPlayer: { rank: number; username: string; level: number; playtime: number } | null = null;

    if (category === -1 || category === 0) {
        // Overall - cached ranked list of hiscore_large
        const allResults = await getRankedList(profile, 0);

        // Handle rank search - show 21 entries starting from that rank
        const startRank = rankSearch > 0 ? rankSearch - 1 : 0;
        rows = allResults.slice(startRank, startRank + 21).map((r, i) => ({
            rank: startRank + i + 1,
            username: r.username,
            level: r.level,
            playtime: r.playtime
        }));

        if (playerSearch) {
            const idx = allResults.findIndex(r => r.username.toLowerCase() === playerSearch);
            if (idx !== -1) {
                const r = allResults[idx];
                searchedPlayer = { rank: idx + 1, username: r.username, level: r.level, playtime: r.playtime };
            }
        }
        selectedSkill = 'Overall';
    } else {
        // Individual skill - query hiscore
        const skillIndex = category - 1;
        const skillName = SKILL_NAMES[skillIndex];
        if (skillName) {
            const allResults = await getRankedList(profile, category);

            const startRank = rankSearch > 0 ? rankSearch - 1 : 0;
            rows = allResults.slice(startRank, startRank + 21).map((r, i) => ({
                rank: startRank + i + 1,
                username: r.username,
                level: r.level,
                playtime: r.playtime
            }));

            if (playerSearch) {
                const idx = allResults.findIndex(r => r.username.toLowerCase() === playerSearch);
                if (idx !== -1) {
                    const r = allResults[idx];
                    searchedPlayer = { rank: idx + 1, username: r.username, level: r.level, playtime: r.playtime };
                }
            }
            selectedSkill = skillName;
        }
    }

    const skillOptions = [{ id: 0, name: 'Overall' }, ...ENABLED_SKILLS.map(s => ({ id: s.id + 1, name: s.name }))];

    const currentCategory = category === -1 ? 0 : category;

    // Build skill links for sidebar
    const skillLinks =
        skillOptions
            .map(s => {
                const icon = s.name === 'Overall' ? '' : `<img src="/img/skill/${s.name.toLowerCase()}.png" width="15" height="15" style="vertical-align:middle;margin-right:3px">`;
                return `<tr><td><a href="/hiscores?category=${s.id}&profile=${profile}" class="c">${icon}${s.name}</a></td></tr>`;
            })
            .join('\n') +
        `\n<tr><td>&nbsp;</td></tr>\n<tr><td><a href="/hiscores/outfit?profile=${profile}" class="c text-orange">Equipment</a></td></tr>` +
        `\n<tr><td><a href="/hiscores/bank?profile=${profile}" class="c text-orange">Bank</a></td></tr>` +
        `\n<tr><td><a href="/hiscores/koth?profile=${profile}" class="c text-orange">King of the Hill</a></td></tr>`;

    // Build data rows
    const rankCol = rows.map(r => `${r.rank}<br>`).join('\n');
    const nameCol = rows.map(r => `<a href="/hiscores/player/${encodeURIComponent(r.username)}?profile=${profile}" class="c">${escapeHtml(r.username)}</a><br>`).join('\n');
    const levelCol = rows.map(r => `${r.level.toLocaleString()}<br>`).join('\n');
    const timeCol = rows.map(r => `${formatPlaytime(r.playtime)}<br>`).join('\n');

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>${selectedSkill} Hiscores</title>
    <style>
        body, p, td { font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
        body { background: #000; color: #fff; margin: 0; padding: 0; }
        a { text-decoration: none; }
        .b { border-style: outset; border-width: 3pt; border-color: #373737; }
        .b2 { border-style: outset; border-width: 3pt; border-color: #570700; }
        .e { border: 2px solid #382418; }
        .c { text-decoration: none; color: #fff; }
        .c:hover { text-decoration: underline; }
        .white { text-decoration: none; color: #FFFFFF; }
        .red { text-decoration: none; color: #E10505; }
        .lblue { text-decoration: none; color: #9DB8C3; }
        .dblue { text-decoration: none; color: #0D6083; }
        .yellow { text-decoration: none; color: #FFE139; }
        .green { text-decoration: none; color: #04A800; }
        .purple { text-decoration: none; color: #C503FD; }
        .text-orange { color: #ffbb22; }
        select { background-color: #B1977E; }
        input { margin-top: 4px; }
    </style>
</head>
<body>
<table width="100%" height="100%" cellpadding="0" cellspacing="0">
    <tr>
        <td valign="middle">
            <center>
                <div style="width: 600px; position: relative;">

<!-- Top edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_a.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_d.jpg" width="100" height="43"></td>
    </tr>
</table>

<!-- Main content area -->
<table width="600" cellpadding="0" cellspacing="0" border="0" background="/img/background2.jpg">
    <tr>
        <td valign="bottom">
            <center>
                <br>
                <!-- Title box -->
                <table width="250" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <center>
                                <b>${selectedSkill} Hiscores</b><br>
                                <a href="/" class="c">Main menu</a>
                            </center>
                        </td>
                    </tr>
                </table>
                <br>

                <!-- Profile selector -->
                <center>
                    <form id="profile-select-form" method="GET" action="/hiscores">
                        <input type="hidden" name="category" value="${currentCategory}">
                        <select name="profile" id="profile" onchange="this.form.submit()">
                            <option value="main"${profile === 'main' ? ' selected' : ''}>Main</option>
                        </select>
                    </form>
                </center>

                <!-- Two column layout: skills + data -->
                <table>
                    <tr>
                        <td width="160" valign="top">
                            <center>
                                <b>Select hiscore table</b><br>
                                <table width="150" height="400" bgcolor="black" cellpadding="4">
                                    <tr>
                                        <td class="e" valign="top">
                                            <center>
                                                <table height="380" cellspacing="1" cellpadding="0">
                                                    ${skillLinks}
                                                </table>
                                            </center>
                                        </td>
                                    </tr>
                                </table>
                            </center>
                        </td>

                        <td width="290" valign="top">
                            <center>
                                <b>${selectedSkill} Hiscores</b><br>
                                <table width="300" height="400" bgcolor="black" cellpadding="4">
                                    <tr>
                                        <td class="e" valign="top">
                                            ${
                                                rows.length > 0
                                                    ? `<table>
                                                <tr>
                                                    <td align="right" valign="top">
                                                        <b>Rank</b><br>
                                                        ${rankCol}
                                                    </td>
                                                    <td>&nbsp;</td>
                                                    <td valign="top">
                                                        <b>Name</b><br>
                                                        ${nameCol}
                                                    </td>
                                                    <td>&nbsp;</td>
                                                    <td valign="top">
                                                        <b>Level</b><br>
                                                        ${levelCol}
                                                    </td>
                                                    <td>&nbsp;</td>
                                                    <td align="right" valign="top">
                                                        <b>Time</b><br>
                                                        ${timeCol}
                                                    </td>
                                                </tr>
                                            </table>`
                                                    : '<center><br>No players found</center>'
                                            }
                                        </td>
                                    </tr>
                                </table>
                            </center>
                        </td>
                    </tr>
                </table>

                <br>

                <!-- Search boxes -->
                <table>
                    <tr>
                        <td>
                            <table width="200" bgcolor="black" cellpadding="4">
                                <tr>
                                    <td class="b" bgcolor="#474747" background="/img/stoneback.gif">
                                        <center>
                                            <form action="/hiscores">
                                                <b>Search by rank</b><br>
                                                <input type="number" maxlength="12" size="12" name="rank" value="">
                                                <input type="hidden" name="category" value="${currentCategory}">
                                                <input type="hidden" name="profile" value="${profile}">
                                                <br>
                                                <input type="submit" value="Search">
                                            </form>
                                        </center>
                                    </td>
                                </tr>
                            </table>
                        </td>
                        <td>&nbsp;&nbsp;&nbsp;</td>
                        <td>
                            <table width="200" bgcolor="black" cellpadding="4">
                                <tr>
                                    <td class="b" bgcolor="#474747" background="/img/stoneback.gif">
                                        <center>
                                            <form action="/hiscores" autocomplete="off">
                                                <b>Search by name</b><br>
                                                <input type="text" maxlength="12" size="12" name="player" value="${escapeHtml(playerSearch)}" autocomplete="off">
                                                <input type="hidden" name="category" value="${currentCategory}">
                                                <input type="hidden" name="profile" value="${profile}">
                                                <br>
                                                <input type="submit" value="Search">
                                            </form>
                                        </center>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>

                ${
                    searchedPlayer
                        ? `
                <br>
                <table width="400" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <center>
                                <b>Search Result</b><br>
                                Rank: ${searchedPlayer.rank} |
                                <a href="/hiscores/player/${encodeURIComponent(searchedPlayer.username)}?profile=${profile}" class="c">${escapeHtml(searchedPlayer.username)}</a> |
                                Level: ${searchedPlayer.level.toLocaleString()} |
                                Time: ${formatPlaytime(searchedPlayer.playtime)}
                            </center>
                        </td>
                    </tr>
                </table>
                `
                        : playerSearch
                          ? `
                <br>
                <table width="400" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <center>Player "${escapeHtml(playerSearch)}" not found.</center>
                        </td>
                    </tr>
                </table>
                `
                          : ''
                }

                <br>
            </center>
        </td>
    </tr>
</table>

<!-- Bottom edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_g2.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_h2.jpg" width="100" height="43"></td>
    </tr>
</table>

                </div>
            </center>
        </td>
    </tr>
</table>
</body>
</html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

// Richest outfit leaderboard handler
export async function handleHiscoresOutfitPage(url: URL): Promise<Response | null> {
    const match = url.pathname.match(/^\/hi(?:gh)?scores\/outfit\/?$/);
    if (!match) return null;

    const profile = (url.searchParams.get('profile') || 'main').replace(/[^a-zA-Z0-9_-]/g, '');

    let query = db
        .selectFrom('hiscore_outfit')
        .innerJoin('account', 'account.id', 'hiscore_outfit.account_id')
        .select(['account.username', 'hiscore_outfit.value', 'hiscore_outfit.items'])
        .where('hiscore_outfit.profile', '=', profile)
        .where('account.staffmodlevel', '<=', 1)
        .orderBy('hiscore_outfit.value', 'desc')
        .limit(50);
    if (hiddenNames.length > 0) {
        query = query.where(eb => eb.not(eb(eb.fn('lower', ['account.username']), 'in', hiddenNames)));
    }

    const results = await query.execute();

    const rows = results.map((r, i) => {
        let itemsList = '';
        try {
            const items = JSON.parse(r.items) as { id?: number; name: string; value: number }[];
            itemsList = items
                .map(item => {
                    if (item.id != null) {
                        return `<canvas class="item-icon" data-item-id="${item.id}" title="${escapeHtml(item.name)} (${item.value.toLocaleString()} gp)" width="32" height="32" style="image-rendering:pixelated;vertical-align:middle"></canvas>`;
                    }
                    return `<span title="${item.value.toLocaleString()} gp">${escapeHtml(item.name)}</span>`;
                })
                .join(' ');
        } catch {
            itemsList = escapeHtml(r.items);
        }
        return `
            <tr>
                <td align="right">${i + 1}</td>
                <td><a href="/hiscores/player/${encodeURIComponent(r.username)}?profile=${profile}" class="c">${escapeHtml(r.username)}</a></td>
                <td align="right" class="yellow" title="${r.value.toLocaleString()} gp">${formatGold(r.value)}</td>
                <td style="font-size:11px">${itemsList}</td>
            </tr>
        `;
    });

    // Sidebar skill links
    const skillOptions = [{ id: 0, name: 'Overall' }, ...ENABLED_SKILLS.map(s => ({ id: s.id + 1, name: s.name }))];
    const skillLinks =
        skillOptions
            .map(s => {
                const icon = s.name === 'Overall' ? '' : `<img src="/img/skill/${s.name.toLowerCase()}.png" width="15" height="15" style="vertical-align:middle;margin-right:3px">`;
                return `<tr><td><a href="/hiscores?category=${s.id}&profile=${profile}" class="c">${icon}${s.name}</a></td></tr>`;
            })
            .join('\n') +
        `\n<tr><td>&nbsp;</td></tr>\n<tr><td><a href="/hiscores/outfit?profile=${profile}" class="c text-orange">Equipment</a></td></tr>` +
        `\n<tr><td><a href="/hiscores/bank?profile=${profile}" class="c text-orange">Bank</a></td></tr>` +
        `\n<tr><td><a href="/hiscores/koth?profile=${profile}" class="c text-orange">King of the Hill</a></td></tr>`;

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Equipment Hiscores</title>
    <style>${HISCORES_STYLES}</style>
</head>
<body>
<table width="100%" height="100%" cellpadding="0" cellspacing="0">
    <tr>
        <td valign="middle">
            <center>
                <div style="width: 600px; position: relative;">

<!-- Top edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_a.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_d.jpg" width="100" height="43"></td>
    </tr>
</table>

<!-- Main content area -->
<table width="600" cellpadding="0" cellspacing="0" border="0" background="/img/background2.jpg">
    <tr>
        <td valign="bottom">
            <center>
                <br>
                <!-- Title box -->
                <table width="350" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <center>
                                <b>Equipment Hiscores</b><br>
                                <a href="/" class="c">Main menu</a> | <a href="/hiscores?profile=${profile}" class="c">All Hiscores</a>
                            </center>
                        </td>
                    </tr>
                </table>
                <br>

                <!-- Two column layout: skills + data -->
                <table>
                    <tr>
                        <td width="160" valign="top">
                            <center>
                                <b>Select hiscore table</b><br>
                                <table width="150" height="400" bgcolor="black" cellpadding="4">
                                    <tr>
                                        <td class="e" valign="top">
                                            <center>
                                                <table height="380" cellspacing="1" cellpadding="0">
                                                    ${skillLinks}
                                                </table>
                                            </center>
                                        </td>
                                    </tr>
                                </table>
                            </center>
                        </td>

                        <td width="400" valign="top">
                            <center>
                                <b>Equipment</b><br>
                                <table width="420" bgcolor="black" cellpadding="4">
                                    <tr>
                                        <td class="e" valign="top">
                                            ${
                                                rows.length > 0
                                                    ? `<table width="100%" cellspacing="2" cellpadding="2">
                                                <tr>
                                                    <td><b>#</b></td>
                                                    <td><b>Name</b></td>
                                                    <td align="right"><b>Value</b></td>
                                                    <td><b>Items</b></td>
                                                </tr>
                                                ${rows.join('')}
                                            </table>`
                                                    : '<center><br>No outfit data found</center>'
                                            }
                                        </td>
                                    </tr>
                                </table>
                            </center>
                        </td>
                    </tr>
                </table>

                <br>
            </center>
        </td>
    </tr>
</table>

<!-- Bottom edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_g2.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_h2.jpg" width="100" height="43"></td>
    </tr>
</table>

                </div>
            </center>
        </td>
    </tr>
</table>
<!-- Hidden canvas required by viewer internals -->
<canvas id="canvas" width="256" height="256" style="display:none"></canvas>
<script type="module">
    import { ItemViewer } from '/viewer/viewer.js';

    const icons = document.querySelectorAll('canvas.item-icon');
    if (icons.length > 0) {
        const viewer = new ItemViewer();
        try {
            await viewer.init('');
            let rendered = 0, failed = 0;
            for (const el of icons) {
                const id = parseInt(el.dataset.itemId);
                if (isNaN(id)) continue;
                try {
                    const icon = viewer.renderItemIconAsImageData(id);
                    if (icon) {
                        el.getContext('2d').putImageData(icon, 0, 0);
                        rendered++;
                    } else {
                        el.style.display = 'none';
                        const fallback = document.createElement('span');
                        fallback.textContent = el.title.split(' (')[0];
                        fallback.title = el.title;
                        el.parentNode.insertBefore(fallback, el);
                        failed++;
                    }
                } catch (renderErr) {
                    failed++;
                }
            }
        } catch (err) {
            console.error('ItemViewer init failed:', err);
            for (const el of icons) {
                const fallback = document.createElement('span');
                fallback.textContent = el.title.split(' (')[0];
                fallback.title = el.title;
                el.parentNode.insertBefore(fallback, el);
                el.style.display = 'none';
            }
        }
    }
</script>
</body>
</html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

// King of the Hill (Demonic Ruins) leaderboard handler.
// A loadout snapshot is the appearance-protocol encoding the engine captured:
// 12 slots of 0 (empty) / 0x100+idk / 0x200+objId, plus gender and 5 colours.
type KothLoadout = { gender: number; colors: number[]; slots: number[] };

// per-component mode across a player's capture snapshots: the outfit they
// characteristically held the hill in ("median" loadout)
function medianLoadout(loadouts: string[]): KothLoadout | null {
    const parsed: KothLoadout[] = [];
    for (const raw of loadouts) {
        try {
            const l = JSON.parse(raw);
            if (l && Array.isArray(l.colors) && Array.isArray(l.slots)) {
                parsed.push(l);
            }
        } catch {
            // skip malformed snapshots
        }
    }
    if (parsed.length === 0) {
        return null;
    }

    const mode = (values: number[]): number => {
        const counts = new Map<number, number>();
        let best = values[0];
        let bestCount = 0;
        for (const v of values) {
            const c = (counts.get(v) ?? 0) + 1;
            counts.set(v, c);
            if (c > bestCount) {
                bestCount = c;
                best = v;
            }
        }
        return best;
    };

    return {
        gender: mode(parsed.map(l => l.gender)),
        colors: parsed[0].colors.map((_, i) => mode(parsed.map(l => l.colors[i] ?? 0))),
        slots: parsed[0].slots.map((_, i) => mode(parsed.map(l => l.slots[i] ?? 0)))
    };
}

function formatAgo(dbDate: string | Date): string {
    const then = typeof dbDate === 'string' ? new Date(dbDate.replace(' ', 'T') + 'Z').getTime() : dbDate.getTime();
    const mins = Math.floor((Date.now() - then) / 60_000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 60 * 48) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
}

// the reigning king of each window, shown side by side above the table
const KING_WINDOWS = [
    { label: 'All time', ms: 0 },
    { label: 'This week', ms: 7 * 24 * 3600_000 },
    { label: 'Today', ms: 24 * 3600_000 }
];

type KothRow = { username: string; minutes: number; last_held: string | Date };
type KothKing = { label: string; ms: number; leader: { username: string; minutes: number } | undefined; sprite: KothLoadout | undefined };
type KothPageData = { results: KothRow[]; spriteFor: Map<string, KothLoadout>; kings: KothKing[] };

// Same short TTL + in-flight dedup as getRankedList: these run on the tick thread, and the
// capture table grows by one row per minute so a group-by over it is not free.
const kothCache = new Map<string, { at: number; data: KothPageData | null; pending: Promise<KothPageData> | null }>();

async function getKothPageData(profile: string, windowMs: number): Promise<KothPageData> {
    const key = `${profile}:${windowMs}`;
    const now = Date.now();
    const cached = kothCache.get(key);
    if (cached?.data && now - cached.at < RANKED_TTL_MS) {
        return cached.data;
    }
    if (cached?.pending) {
        return cached.pending;
    }
    const load = loadKothPageData(profile, windowMs).then(data => {
        kothCache.set(key, { at: Date.now(), data, pending: null });
        return data;
    });
    kothCache.set(key, { at: cached?.at ?? 0, data: cached?.data ?? null, pending: load });
    try {
        return await load;
    } catch (err) {
        kothCache.delete(key);
        throw err;
    }
}

async function loadKothPageData(profile: string, windowMs: number): Promise<KothPageData> {
    let query = db
        .selectFrom('koth_capture')
        .innerJoin('account', 'account.username', 'koth_capture.username')
        .select(({ fn }) => ['koth_capture.username', fn.countAll<number>().as('minutes'), fn.max('koth_capture.timestamp').as('last_held')])
        .where('koth_capture.profile', '=', profile)
        .where('account.staffmodlevel', '<=', 1)
        .groupBy('koth_capture.username')
        .orderBy('minutes', 'desc')
        .limit(50);
    if (windowMs > 0) {
        query = query.where('koth_capture.timestamp', '>', toDbDate(Date.now() - windowMs));
    }
    if (hiddenNames.length > 0) {
        query = query.where(eb => eb.not(eb(eb.fn('lower', ['koth_capture.username']), 'in', hiddenNames)));
    }
    const results = await query.execute();

    // median loadout for a set of players over a window
    const medianLoadouts = async (names: string[], ms: number): Promise<Map<string, KothLoadout>> => {
        const medians = new Map<string, KothLoadout>();
        if (names.length === 0) {
            return medians;
        }
        let loadoutQuery = db.selectFrom('koth_capture').select(['username', 'loadout']).where('profile', '=', profile).where('username', 'in', names);
        if (ms > 0) {
            loadoutQuery = loadoutQuery.where('timestamp', '>', toDbDate(Date.now() - ms));
        }
        const loadoutRows = await loadoutQuery.execute();
        const grouped = new Map<string, string[]>();
        for (const row of loadoutRows) {
            let list = grouped.get(row.username);
            if (!list) {
                list = [];
                grouped.set(row.username, list);
            }
            list.push(row.loadout);
        }
        for (const [name, list] of grouped) {
            const median = medianLoadout(list);
            if (median) {
                medians.set(name, median);
            }
        }
        return medians;
    };

    const spriteFor = await medianLoadouts(
        results.slice(0, 10).map(r => r.username),
        windowMs
    );

    const kings = await Promise.all(
        KING_WINDOWS.map(async w => {
            let kingQuery = db
                .selectFrom('koth_capture')
                .innerJoin('account', 'account.username', 'koth_capture.username')
                .select(({ fn }) => ['koth_capture.username', fn.countAll<number>().as('minutes')])
                .where('koth_capture.profile', '=', profile)
                .where('account.staffmodlevel', '<=', 1)
                .groupBy('koth_capture.username')
                .orderBy('minutes', 'desc')
                .limit(1);
            if (w.ms > 0) {
                kingQuery = kingQuery.where('koth_capture.timestamp', '>', toDbDate(Date.now() - w.ms));
            }
            if (hiddenNames.length > 0) {
                kingQuery = kingQuery.where(eb => eb.not(eb(eb.fn('lower', ['koth_capture.username']), 'in', hiddenNames)));
            }
            const leader = await kingQuery.executeTakeFirst();
            const sprite = leader ? (await medianLoadouts([leader.username], w.ms)).get(leader.username) : undefined;
            return { ...w, leader, sprite };
        })
    );

    return { results: results as KothRow[], spriteFor, kings };
}

export async function handleHiscoresKothPage(url: URL): Promise<Response | null> {
    const match = url.pathname.match(/^\/hi(?:gh)?scores\/koth\/?$/);
    if (!match) return null;

    const profile = (url.searchParams.get('profile') || 'main').replace(/[^a-zA-Z0-9_-]/g, '');
    const windowParam = url.searchParams.get('window') || 'all';
    const windowMs = windowParam === 'day' ? 24 * 3600_000 : windowParam === 'week' ? 7 * 24 * 3600_000 : 0;

    const { results, spriteFor, kings } = await getKothPageData(profile, windowMs);

    // sprites are rendered server-side (see web/sprites) and cached by URL, so the page is
    // plain HTML + <img> — no viewer bundle or model archives shipped to the browser
    const spriteImg = (loadout: KothLoadout, size: 'big' | 'small'): string => {
        const w = size === 'big' ? 78 : 52;
        const h = size === 'big' ? 130 : 88;
        return `<img src="${playerSpriteUrl(loadout, w, h)}" width="${w}" height="${h}" alt="" loading="lazy" decoding="async" style="image-rendering:pixelated;vertical-align:middle">`;
    };

    const rows = results.map((r, i) => {
        const sprite = spriteFor.get(r.username);
        return `
            <tr>
                <td align="right">${i + 1}</td>
                <td>${sprite ? spriteImg(sprite, 'small') : ''}</td>
                <td><a href="/hiscores/player/${encodeURIComponent(r.username)}?profile=${profile}" class="c">${escapeHtml(r.username)}</a></td>
                <td align="right" class="yellow">${Number(r.minutes).toLocaleString()}</td>
                <td align="right" style="font-size:11px">${formatAgo(r.last_held as string | Date)}</td>
            </tr>
        `;
    });

    // Sidebar skill links
    const skillOptions = [{ id: 0, name: 'Overall' }, ...ENABLED_SKILLS.map(s => ({ id: s.id + 1, name: s.name }))];
    const skillLinks =
        skillOptions
            .map(s => {
                const icon = s.name === 'Overall' ? '' : `<img src="/img/skill/${s.name.toLowerCase()}.png" width="15" height="15" style="vertical-align:middle;margin-right:3px">`;
                return `<tr><td><a href="/hiscores?category=${s.id}&profile=${profile}" class="c">${icon}${s.name}</a></td></tr>`;
            })
            .join('\n') +
        `\n<tr><td>&nbsp;</td></tr>\n<tr><td><a href="/hiscores/outfit?profile=${profile}" class="c text-orange">Equipment</a></td></tr>` +
        `\n<tr><td><a href="/hiscores/bank?profile=${profile}" class="c text-orange">Bank</a></td></tr>` +
        `\n<tr><td><a href="/hiscores/koth?profile=${profile}" class="c text-orange">King of the Hill</a></td></tr>`;

    const windowTab = (key: string, label: string): string => (windowParam === key ? `<b class="text-orange">${label}</b>` : `<a href="/hiscores/koth?window=${key}&profile=${profile}" class="c">${label}</a>`);

    const kingBanner = `<table width="400" bgcolor="black" cellpadding="6"><tr>
        ${kings
            .map(
                k => `<td class="e" width="33%" align="center" valign="bottom">
                <b style="font-size:11px">${k.label}</b><br>
                ${k.sprite ? spriteImg(k.sprite, 'small') + '<br>' : ''}
                ${k.leader ? `<a href="/hiscores/player/${encodeURIComponent(k.leader.username)}?profile=${profile}" class="c text-orange">${escapeHtml(k.leader.username)}</a><br><span class="yellow" style="font-size:11px">${Number(k.leader.minutes).toLocaleString()} min</span>` : '<span style="font-size:11px">unclaimed</span>'}
            </td>`
            )
            .join('')}
    </tr></table><br>`;

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>King of the Hill Hiscores</title>
    <style>${HISCORES_STYLES}</style>
</head>
<body>
<table width="100%" height="100%" cellpadding="0" cellspacing="0">
    <tr>
        <td valign="middle">
            <center>
                <div style="width: 600px; position: relative;">

<!-- Top edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_a.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_d.jpg" width="100" height="43"></td>
    </tr>
</table>

<!-- Main content area -->
<table width="600" cellpadding="0" cellspacing="0" border="0" background="/img/background2.jpg">
    <tr>
        <td valign="bottom">
            <center>
                <br>
                <!-- Title box -->
                <table width="350" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <center>
                                <b>King of the Hill</b><br>
                                <a href="/" class="c">Main menu</a> | <a href="/hiscores?profile=${profile}" class="c">All Hiscores</a>
                            </center>
                        </td>
                    </tr>
                </table>
                <br>

                <!-- Rules blurb -->
                <table width="400" bgcolor="black" cellpadding="6">
                    <tr>
                        <td class="e" style="font-size:12px">
                            <center>King of the hill control time for the Demonic Ruins walled area. </center>
                        </td>
                    </tr>
                </table>
                <br>

                <!-- Two column layout: skills + data -->
                <table>
                    <tr>
                        <td width="160" valign="top">
                            <center>
                                <b>Select hiscore table</b><br>
                                <table width="150" height="400" bgcolor="black" cellpadding="4">
                                    <tr>
                                        <td class="e" valign="top">
                                            <center>
                                                <table height="380" cellspacing="1" cellpadding="0">
                                                    ${skillLinks}
                                                </table>
                                            </center>
                                        </td>
                                    </tr>
                                </table>
                            </center>
                        </td>

                        <td width="400" valign="top">
                            <center>
                                <b>Kings of the Hill</b><br>
                                ${kingBanner}
                                ${windowTab('all', 'All time')} | ${windowTab('week', 'This week')} | ${windowTab('day', 'Today')}<br>
                                <table width="400" bgcolor="black" cellpadding="4">
                                    <tr>
                                        <td class="e" valign="top">
                                            ${
                                                rows.length > 0
                                                    ? `<table align="center" cellspacing="2" cellpadding="2">
                                                <tr>
                                                    <td><b>#</b></td>
                                                    <td></td>
                                                    <td><b>Name</b></td>
                                                    <td align="right"><b>Minutes</b></td>
                                                    <td align="right"><b>Last held</b></td>
                                                </tr>
                                                ${rows.join('')}
                                            </table>`
                                                    : '<center><br>No one has held the ruins yet</center>'
                                            }
                                        </td>
                                    </tr>
                                </table>
                            </center>
                        </td>
                    </tr>
                </table>

                <br>
            </center>
        </td>
    </tr>
</table>

<!-- Bottom edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_g2.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_h2.jpg" width="100" height="43"></td>
    </tr>
</table>

                </div>
            </center>
        </td>
    </tr>
</table>
</body>
</html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=30' } });
}

// Bank value leaderboard handler
export async function handleHiscoresBankPage(url: URL): Promise<Response | null> {
    const match = url.pathname.match(/^\/hi(?:gh)?scores\/bank\/?$/);
    if (!match) return null;

    const profile = (url.searchParams.get('profile') || 'main').replace(/[^a-zA-Z0-9_-]/g, '');

    let query = db
        .selectFrom('hiscore_bank')
        .innerJoin('account', 'account.id', 'hiscore_bank.account_id')
        .select(['account.username', 'hiscore_bank.value', 'hiscore_bank.items'])
        .where('hiscore_bank.profile', '=', profile)
        .where('account.staffmodlevel', '<=', 1)
        .orderBy('hiscore_bank.value', 'desc')
        .limit(50);
    if (hiddenNames.length > 0) {
        query = query.where(eb => eb.not(eb(eb.fn('lower', ['account.username']), 'in', hiddenNames)));
    }

    const results = await query.execute();

    const rows = results.map((r, i) => {
        let itemsList = '';
        try {
            const items = JSON.parse(r.items) as { id?: number; name: string; value: number; count: number }[];
            // Show up to 6 items per person
            itemsList = items
                .slice(0, 6)
                .map(item => {
                    const countLabel = item.count > 1 ? formatStackCount(item.count) : '';
                    if (item.id != null) {
                        return `<span style="display:inline-block;position:relative;vertical-align:middle;margin:0 1px;width:32px;height:32px"><canvas class="item-icon" data-item-id="${item.id}" data-item-count="${item.count}" title="${escapeHtml(item.name)}${countLabel ? ' ' + countLabel : ''} (${item.value.toLocaleString()} gp)" width="32" height="32" style="image-rendering:pixelated"></canvas>${countLabel ? `<span style="position:absolute;bottom:0;right:1px;font-size:9px;color:#ff0;text-shadow:-1px 0 #000,0 1px #000,1px 0 #000,0 -1px #000;line-height:1">${countLabel}</span>` : ''}</span>`;
                    }
                    return `<span title="${item.value.toLocaleString()} gp">${escapeHtml(item.name)}${countLabel ? ' ' + countLabel : ''}</span>`;
                })
                .join('');
        } catch {
            itemsList = escapeHtml(r.items);
        }
        return `
            <tr>
                <td align="right">${i + 1}</td>
                <td><a href="/hiscores/player/${encodeURIComponent(r.username)}?profile=${profile}" class="c">${escapeHtml(r.username)}</a></td>
                <td align="right" class="yellow" title="${r.value.toLocaleString()} gp">${formatGold(r.value)}</td>
                <td style="font-size:11px">${itemsList}</td>
            </tr>
        `;
    });

    // Sidebar skill links
    const skillOptions = [{ id: 0, name: 'Overall' }, ...ENABLED_SKILLS.map(s => ({ id: s.id + 1, name: s.name }))];
    const skillLinks =
        skillOptions
            .map(s => {
                const icon = s.name === 'Overall' ? '' : `<img src="/img/skill/${s.name.toLowerCase()}.png" width="15" height="15" style="vertical-align:middle;margin-right:3px">`;
                return `<tr><td><a href="/hiscores?category=${s.id}&profile=${profile}" class="c">${icon}${s.name}</a></td></tr>`;
            })
            .join('\n') +
        `\n<tr><td>&nbsp;</td></tr>\n<tr><td><a href="/hiscores/outfit?profile=${profile}" class="c text-orange">Equipment</a></td></tr>` +
        `\n<tr><td><a href="/hiscores/bank?profile=${profile}" class="c text-orange">Bank</a></td></tr>` +
        `\n<tr><td><a href="/hiscores/koth?profile=${profile}" class="c text-orange">King of the Hill</a></td></tr>`;

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Bank Hiscores</title>
    <style>${HISCORES_STYLES}</style>
</head>
<body>
<table width="100%" height="100%" cellpadding="0" cellspacing="0">
    <tr>
        <td valign="middle">
            <center>
                <div style="width: 600px; position: relative;">

<!-- Top edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_a.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_d.jpg" width="100" height="43"></td>
    </tr>
</table>

<!-- Main content area -->
<table width="600" cellpadding="0" cellspacing="0" border="0" background="/img/background2.jpg">
    <tr>
        <td valign="bottom">
            <center>
                <br>
                <!-- Title box -->
                <table width="350" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <center>
                                <b>Bank Hiscores</b><br>
                                <a href="/" class="c">Main menu</a> | <a href="/hiscores?profile=${profile}" class="c">All Hiscores</a>
                            </center>
                        </td>
                    </tr>
                </table>
                <br>

                <!-- Two column layout: skills + data -->
                <table>
                    <tr>
                        <td width="160" valign="top">
                            <center>
                                <b>Select hiscore table</b><br>
                                <table width="150" height="400" bgcolor="black" cellpadding="4">
                                    <tr>
                                        <td class="e" valign="top">
                                            <center>
                                                <table height="380" cellspacing="1" cellpadding="0">
                                                    ${skillLinks}
                                                </table>
                                            </center>
                                        </td>
                                    </tr>
                                </table>
                            </center>
                        </td>

                        <td width="400" valign="top">
                            <center>
                                <b>Bank</b><br>
                                <table width="420" bgcolor="black" cellpadding="4">
                                    <tr>
                                        <td class="e" valign="top">
                                            ${
                                                rows.length > 0
                                                    ? `<table width="100%" cellspacing="2" cellpadding="2">
                                                <tr>
                                                    <td><b>#</b></td>
                                                    <td><b>Name</b></td>
                                                    <td align="right"><b>Value</b></td>
                                                    <td><b>Top Items</b></td>
                                                </tr>
                                                ${rows.join('')}
                                            </table>`
                                                    : '<center><br>No bank data found</center>'
                                            }
                                        </td>
                                    </tr>
                                </table>
                            </center>
                        </td>
                    </tr>
                </table>

                <br>
            </center>
        </td>
    </tr>
</table>

<!-- Bottom edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_g2.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_h2.jpg" width="100" height="43"></td>
    </tr>
</table>

                </div>
            </center>
        </td>
    </tr>
</table>
<!-- Hidden canvas required by viewer internals -->
<canvas id="canvas" width="256" height="256" style="display:none"></canvas>
<script type="module">
    import { ItemViewer } from '/viewer/viewer.js';

    const icons = document.querySelectorAll('canvas.item-icon');
    if (icons.length > 0) {
        const viewer = new ItemViewer();
        try {
            await viewer.init('');
            let rendered = 0, failed = 0;
            for (const el of icons) {
                const id = parseInt(el.dataset.itemId);
                const count = parseInt(el.dataset.itemCount) || 1;
                if (isNaN(id)) continue;
                try {
                    const icon = viewer.renderItemIconAsImageData(id, count);
                    if (icon) {
                        el.getContext('2d').putImageData(icon, 0, 0);
                        rendered++;
                    } else {
                        el.style.display = 'none';
                        const fallback = document.createElement('span');
                        fallback.textContent = el.title.split(' (')[0];
                        fallback.title = el.title;
                        el.parentNode.insertBefore(fallback, el);
                        failed++;
                    }
                } catch (renderErr) {
                    failed++;
                }
            }
        } catch (err) {
            console.error('ItemViewer init failed:', err);
            for (const el of icons) {
                const fallback = document.createElement('span');
                fallback.textContent = el.title.split(' (')[0];
                fallback.title = el.title;
                el.parentNode.insertBefore(fallback, el);
                el.style.display = 'none';
            }
        }
    }
</script>
</body>
</html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
