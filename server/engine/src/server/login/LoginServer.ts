import fs from 'fs';
import fsp from 'fs/promises';

import bcrypt from 'bcrypt';
import { WebSocket, WebSocketServer } from 'ws';

import { db, toDbDate } from '#/db/query.js';
import Player from '#/engine/entity/Player.js';
import { PlayerLoading } from '#/engine/entity/PlayerLoading.js';
import { PlayerStatEnabled } from '#/engine/entity/PlayerStat.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import { toSafeName } from '#/util/JString.js';
import { printInfo } from '#/util/Logger.js';
import { startManagementWeb } from '#/web.js';
import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';

async function updateHiscores(account: { id: number; staffmodlevel: number; banned_until: string | Date | null } | undefined, player: Player, profile: string) {
    if (!account) return;

    if (account.staffmodlevel > 1) {
        return;
    }

    if (account.banned_until !== null && new Date(account.banned_until) >= new Date()) {
        return;
    }

    const insert = [];
    const update = [];

    let totalXp = 0;
    let totalLevel = 0;
    for (let i = 0; i < player.stats.length; i++) {
        if (!PlayerStatEnabled[i]) {
            continue;
        }

        totalXp += player.stats[i];
        totalLevel += player.baseLevels[i];
    }

    const existing = await db.selectFrom('hiscore_large').select('type').select('value').select('playtime').where('account_id', '=', account.id).where('type', '=', 0).where('profile', '=', profile).executeTakeFirst();
    if (existing && (existing.value !== totalXp || existing.playtime !== player.playtime)) {
        await db
            .updateTable('hiscore_large')
            .set({
                type: 0,
                level: totalLevel,
                value: totalXp,
                playtime: player.playtime,
                date: toDbDate(new Date())
            })
            .where('account_id', '=', account.id)
            .where('type', '=', 0)
            .where('profile', '=', profile)
            .execute();
    } else if (!existing) {
        await db
            .insertInto('hiscore_large')
            .values({
                account_id: account.id,
                profile,
                type: 0,
                level: totalLevel,
                value: totalXp,
                playtime: player.playtime
            })
            .execute();
    }

    for (let stat = 0; stat < player.stats.length; stat++) {
        if (!PlayerStatEnabled[stat]) {
            continue;
        }

        if (player.baseLevels[stat] >= 15) {
            const hiscoreType = stat + 1;

            // todo: can we upsert in kysely?
            const existing = await db.selectFrom('hiscore').select('type').select('value').select('playtime').where('account_id', '=', account.id).where('type', '=', hiscoreType).where('profile', '=', profile).executeTakeFirst();
            if (existing && (existing.value !== player.stats[stat] || existing.playtime !== player.playtime)) {
                update.push({
                    type: hiscoreType,
                    level: player.baseLevels[stat],
                    value: player.stats[stat],
                    playtime: player.playtime,
                    date: toDbDate(new Date())
                });
            } else if (!existing) {
                insert.push({
                    account_id: account.id,
                    profile,
                    type: hiscoreType,
                    level: player.baseLevels[stat],
                    value: player.stats[stat],
                    playtime: player.playtime
                });
            }
        }
    }

    if (insert.length > 0) {
        await db.insertInto('hiscore').values(insert).execute();
    }

    // todo: batch update query?
    for (let i = 0; i < update.length; i++) {
        await db.updateTable('hiscore').set(update[i]).where('account_id', '=', account.id).where('type', '=', update[i].type).where('profile', '=', profile).execute();
    }

    // Update outfit hiscore
    const worn = player.getInventory(InvType.WORN);
    if (worn) {
        const items: { id: number; name: string; value: number }[] = [];
        let totalValue = 0;
        for (let slot = 0; slot < worn.capacity; slot++) {
            if (slot === 13) continue; // skip ammo slot
            const item = worn.get(slot);
            if (item) {
                const objType = ObjType.get(item.id);
                if (objType) {
                    const value = objType.cost * item.count;
                    items.push({ id: item.id, name: objType.name || `obj_${item.id}`, value });
                    totalValue += value;
                }
            }
        }

        if (items.length > 0) {
            const itemsJson = JSON.stringify(items);
            const existingOutfit = await db.selectFrom('hiscore_outfit').select('value').where('account_id', '=', account.id).where('profile', '=', profile).executeTakeFirst();
            if (existingOutfit) {
                await db.updateTable('hiscore_outfit').set({ value: totalValue, items: itemsJson, date: toDbDate(new Date()) }).where('account_id', '=', account.id).where('profile', '=', profile).execute();
            } else {
                await db.insertInto('hiscore_outfit').values({ account_id: account.id, profile, value: totalValue, items: itemsJson }).execute();
            }
        }
    }

    // Update bank hiscore
    const bankInvId = InvType.getId('bank');
    if (bankInvId !== -1) {
        const bank = player.getInventory(bankInvId);
        if (bank) {
            const bankItems: { id: number; name: string; value: number; count: number }[] = [];
            let bankTotalValue = 0;
            for (let slot = 0; slot < bank.capacity; slot++) {
                const item = bank.get(slot);
                if (item) {
                    const objType = ObjType.get(item.id);
                    if (objType) {
                        const value = objType.cost * item.count;
                        bankItems.push({ id: item.id, name: objType.name || `obj_${item.id}`, value, count: item.count });
                        bankTotalValue += value;
                    }
                }
            }

            if (bankItems.length > 0) {
                // Sort by value descending so the most valuable items appear first
                bankItems.sort((a, b) => b.value - a.value);
                const bankItemsJson = JSON.stringify(bankItems);
                const existingBank = await db.selectFrom('hiscore_bank').select('value').where('account_id', '=', account.id).where('profile', '=', profile).executeTakeFirst();
                if (existingBank) {
                    await db.updateTable('hiscore_bank').set({ value: bankTotalValue, items: bankItemsJson, date: toDbDate(new Date()) }).where('account_id', '=', account.id).where('profile', '=', profile).execute();
                } else {
                    await db.insertInto('hiscore_bank').values({ account_id: account.id, profile, value: bankTotalValue, items: bankItemsJson }).execute();
                }
            }
        }
    }
}

export default class LoginServer {
    private server: WebSocketServer;
    private loginRequests: Set<string> = new Set();
    // In-memory tracking of concurrent logins per IP
    private ipLoginCount: Map<string, Set<number>> = new Map();
    private accountIp: Map<number, string> = new Map();

    private trackLogin(ip: string, accountId: number) {
        // Remove any existing tracking for this account (handles IP changes, takeovers)
        this.untrackLogin(accountId);
        if (!this.ipLoginCount.has(ip)) {
            this.ipLoginCount.set(ip, new Set());
        }
        this.ipLoginCount.get(ip)!.add(accountId);
        this.accountIp.set(accountId, ip);
    }

    private untrackLogin(accountId: number) {
        const oldIp = this.accountIp.get(accountId);
        if (oldIp) {
            const set = this.ipLoginCount.get(oldIp);
            if (set) {
                set.delete(accountId);
                if (set.size === 0) {
                    this.ipLoginCount.delete(oldIp);
                }
            }
            this.accountIp.delete(accountId);
        }
    }

    private getLoginCountForIp(ip: string): number {
        return this.ipLoginCount.get(ip)?.size ?? 0;
    }

    rejectLoginForSafety(s: WebSocket, replyTo: number) {
        // Send opcode 7 ('Please try again') if something has gone wrong
        // during login attempt, which may be resolved by simply retrying.
        s.send(
            JSON.stringify({
                replyTo,
                response: 7
            })
        );
    }

    async wouldResetSaveFile(newSaveBytes: Buffer, profile: string, username: string) {
        // check whether `save`, if saved to disk, would have reset `username`'s progress.
        // it does this by checking whether the player's tick count has gone backwards.
        if (!fs.existsSync(`data/players/${profile}/${username}.sav`)) {
            // No existing save - no problem.
            return false;
        }
        const existingSaveRaw = await fsp.readFile(`data/players/${profile}/${username}.sav`);
        const existingSave = PlayerLoading.load('tmp', new Packet(existingSaveRaw), null);
        const newSave = PlayerLoading.load('tmp', new Packet(newSaveBytes), null);
        if (existingSave.playtime > newSave.playtime) {
            // Int32, 1 per tick logged in. Should wrap only after insane amount of years.
            return true;
        }
        return false;
    }

    constructor() {
        if (Environment.login.enabled && !Environment.easyStartup) {
            startManagementWeb();
        }

        InvType.load('data/pack');
        ObjType.load('data/pack');

        this.server = new WebSocketServer({ port: Environment.login.port, host: '0.0.0.0' }, () => {
            printInfo(`Login server listening on port ${Environment.login.port}`);
        });

        this.server.on('connection', (s: WebSocket) => {
            s.on('message', async (data: Buffer) => {
                try {
                    const msg = JSON.parse(data.toString());
                    const { type, nodeId, nodeTime, profile } = msg;

                    if (type === 'world_startup') {
                        // Untrack all accounts that were logged in on this node
                        const loggedInOnNode = await db
                            .selectFrom('account_login')
                            .select('account_id')
                            .where('logged_in', '=', nodeId)
                            .where('profile', '=', profile)
                            .execute();
                        for (const row of loggedInOnNode) {
                            this.untrackLogin(row.account_id);
                        }

                        await db
                            .updateTable('account_login')
                            .set({
                                logged_in: 0,
                                login_time: null
                            })
                            .where('logged_in', '=', nodeId)
                            .where('profile', '=', profile)
                            .execute();
                    } else if (type === 'player_login') {
                        const { nodeMembers, replyTo, username, password, uid, socket, remoteAddress, reconnecting, hasSave } = msg;
                        const safeName = toSafeName(username);

                        if (this.loginRequests.has(safeName)) {
                            s.send(
                                JSON.stringify({
                                    replyTo,
                                    response: 8
                                })
                            );
                            return;
                        }
                        this.loginRequests.add(safeName);

                        try {
                            const ipBan = await db.selectFrom('ipban').selectAll().where('ip', '=', remoteAddress).executeTakeFirst();

                            if (ipBan) {
                                s.send(
                                    JSON.stringify({
                                        replyTo,
                                        response: 7
                                    })
                                );
                                return;
                            }

                            let account = await db
                                .selectFrom('account')
                                .leftJoin('account_login', join => join.onRef('account_id', '=', 'id').on('profile', '=', profile))
                                .where('username', '=', username)
                                .selectAll()
                                .executeTakeFirst();

                            if (!Environment.website.registration && !account) {
                                // reject usernames containing banned words
                                const lower = username.toLowerCase();
                                if (Environment.BANNED_USERNAME_WORDS.some(w => lower.includes(w))) {
                                    s.send(
                                        JSON.stringify({
                                            replyTo,
                                            response: 1
                                        })
                                    );
                                    return;
                                }

                                // register the user automatically
                                const insertResult = await db
                                    .insertInto('account')
                                    .values({
                                        username,
                                        password: bcrypt.hashSync(password, 10),
                                        registration_ip: remoteAddress,
                                        registration_date: toDbDate(new Date())
                                    })
                                    .executeTakeFirst();

                                if (typeof insertResult.insertId === 'undefined') {
                                    return;
                                }

                                account = await db
                                    .selectFrom('account')
                                    .leftJoin('account_login', join => join.onRef('account_id', '=', 'id').on('profile', '=', profile))
                                    .where('username', '=', username)
                                    .selectAll()
                                    .executeTakeFirst();
                            }

                            const passwordMatch = account ? await bcrypt.compare(password, account.password) : false;

                            if (!account || !passwordMatch) {
                                // invalid username or password
                                s.send(
                                    JSON.stringify({
                                        replyTo,
                                        response: 1
                                    })
                                );
                                return;
                            }

                            if (account.banned_until !== null && new Date(account.banned_until) > new Date()) {
                                // account disabled
                                s.send(
                                    JSON.stringify({
                                        replyTo,
                                        response: 5
                                    })
                                );
                                return;
                            }

                            if (nodeMembers && !account.members) {
                                if (Environment.node.autoSubscribeMembers) {
                                    // Set members=1 for the account and proceed with login
                                    await db.updateTable('account').where('id', '=', account.id).set('members', 1).executeTakeFirstOrThrow();
                                    account.members = 1;
                                } else {
                                    s.send(
                                        JSON.stringify({
                                            replyTo,
                                            response: 9
                                        })
                                    );
                                    return;
                                }
                            }

                            if (reconnecting && account.logged_in === nodeId) {
                                await db
                                    .insertInto('session')
                                    .values({
                                        uuid: socket,
                                        account_id: account.id,
                                        profile,
                                        world: nodeId,
                                        timestamp: toDbDate(nodeTime),
                                        uid,
                                        ip: remoteAddress
                                    })
                                    .execute();

                                // Re-establish in-memory tracking on reconnect
                                this.trackLogin(remoteAddress, account.id);

                                if (!hasSave) {
                                    const save = await fsp.readFile(`data/players/${profile}/${username}.sav`);
                                    if (!save || !PlayerLoading.verify(new Packet(save))) {
                                        // Extreme safety check for savefile existing but having bad data on read:
                                        console.error('on reconnect, account_id %s had invalid save data on disk', account.id);
                                        this.rejectLoginForSafety(s, replyTo);
                                    }
                                    s.send(
                                        JSON.stringify({
                                            replyTo,
                                            response: 2,
                                            account_id: account.id,
                                            staffmodlevel: account.staffmodlevel,
                                            muted_until: account.muted_until,
                                            save: save.toString('base64'),
                                            members: account.members,
                                            messageCount: 0
                                        })
                                    );
                                } else {
                                    s.send(
                                        JSON.stringify({
                                            replyTo,
                                            response: 2,
                                            account_id: account.id,
                                            staffmodlevel: account.staffmodlevel,
                                            muted_until: account.muted_until,
                                            members: account.members,
                                            messageCount: 0
                                        })
                                    );
                                }
                                return;
                            } else if (account.logged_in !== null && account.logged_in !== 0) {
                                // Already logged in elsewhere - new login takes over
                                // Clear the old session's logged_in state so the new login can proceed
                                // The old world will handle the orphaned session gracefully on disconnect
                                console.log(`[LOGIN] Account ${username} already logged in on world ${account.logged_in}, new login taking over`);
                                this.untrackLogin(account.id);
                                await db.updateTable('account_login')
                                    .set({
                                        logged_in: 0,
                                        login_time: null
                                    })
                                    .where('account_id', '=', account.id)
                                    .where('profile', '=', profile)
                                    .executeTakeFirst();
                                // Continue with normal login - don't return
                            }

                            if (account.staffmodlevel < 2
                                && account.logged_out !== null
                                && account.logged_out !== 0
                                && account.logged_out !== nodeId
                                && account.logout_time !== null
                            ) {
                                const remaining = new Date(account.logout_time).getTime() - new Date(Date.now() - Environment.node.hopTime).getTime();
                                if (remaining > 0) {
                                    // rate limited (hop timer)
                                    s.send(
                                        JSON.stringify({
                                            replyTo,
                                            response: 10,
                                            remaining
                                        })
                                    );
                                    return;
                                }
                            }

                            await db
                                .insertInto('session')
                                .values({
                                    uuid: socket,
                                    account_id: account.id,
                                    profile,
                                    world: nodeId,
                                    timestamp: toDbDate(nodeTime),
                                    uid,
                                    ip: remoteAddress
                                })
                                .execute();

                            if (!fs.existsSync(`data/players/${profile}/${username}.sav`)) {
                                // not an error - never logged in before
                                // ^ Only not an error if the user has never logged in before:
                                if (account.logout_time !== null) {
                                    console.error('on login, account_id %s had no save data on disk!', account.id);
                                    this.rejectLoginForSafety(s, replyTo);
                                    return;
                                } else {
                                    s.send(
                                        JSON.stringify({
                                            replyTo,
                                            response: 4,
                                            account_id: account.id,
                                            staffmodlevel: account.staffmodlevel,
                                            muted_until: account.muted_until,
                                            messageCount: 0
                                        })
                                    );
                                }
                            } else {
                                const save = await fsp.readFile(`data/players/${profile}/${username}.sav`);
                                // Extreme safety check for savefile existing but having bad data on read:
                                if (!save || !PlayerLoading.verify(new Packet(save))) {
                                    console.error('on login, account_id %s had invalid save data on disk!', account.id);
                                    this.rejectLoginForSafety(s, replyTo);
                                    return;
                                }
                                s.send(
                                    JSON.stringify({
                                        replyTo,
                                        response: 0,
                                        account_id: account.id,
                                        staffmodlevel: account.staffmodlevel,
                                        save: save.toString('base64'),
                                        muted_until: account.muted_until,
                                        members: account.members,
                                        messageCount: 0
                                    })
                                );
                            }

                            // Login is valid - update account table and track IP
                            this.trackLogin(remoteAddress, account.id);
                            if (account.account_id) {
                                await db
                                    .updateTable('account_login')
                                    .set({
                                        logged_in: nodeId,
                                        login_time: toDbDate(new Date())
                                    })
                                    .where('account_id', '=', account.id)
                                    .where('profile', '=', profile)
                                    .executeTakeFirst();
                            } else {
                                await db
                                    .insertInto('account_login')
                                    .values({
                                        account_id: account.id,
                                        profile: profile,
                                        logged_in: nodeId,
                                        login_time: toDbDate(new Date())
                                    })
                                    .executeTakeFirst();
                            }
                        } finally {
                            this.loginRequests.delete(safeName);
                        }
                    } else if (type === 'player_logout') {
                        const { replyTo, username, save } = msg;

                        const raw = Buffer.from(save, 'base64');
                        if (PlayerLoading.verify(new Packet(raw)) && !(await this.wouldResetSaveFile(raw, profile, username))) {
                            if (!fs.existsSync(`data/players/${profile}`)) {
                                await fsp.mkdir(`data/players/${profile}`, { recursive: true });
                            }

                            await fsp.writeFile(`data/players/${profile}/${username}.sav`, raw);
                        } else {
                            console.error(username, 'Invalid save file');
                        }

                        const account = await db
                            .selectFrom('account')
                            .leftJoin('account_login', join => join.onRef('account_id', '=', 'id').on('profile', '=', profile))
                            .where('username', '=', username)
                            .selectAll()
                            .executeTakeFirst();

                        if (account?.account_id) {
                            this.untrackLogin(account.id);
                            await db
                                .updateTable('account_login')
                                .set({
                                    logged_in: 0,
                                    login_time: null,
                                    logged_out: nodeId,
                                    logout_time: toDbDate(new Date())
                                })
                                .where('account_id', '=', account.id)
                                .where('profile', '=', profile)
                                .executeTakeFirst();
                        }

                        s.send(
                            JSON.stringify({
                                replyTo,
                                response: 0
                            })
                        );

                        await updateHiscores(account, PlayerLoading.load(username, new Packet(raw), null), profile);
                    } else if (type === 'player_autosave') {
                        const { username, save } = msg;

                        const raw = Buffer.from(save, 'base64');
                        if (PlayerLoading.verify(new Packet(raw)) && !(await this.wouldResetSaveFile(raw, profile, username))) {
                            if (!fs.existsSync(`data/players/${profile}`)) {
                                await fsp.mkdir(`data/players/${profile}`, { recursive: true });
                            }

                            await fsp.writeFile(`data/players/${profile}/${username}.sav`, raw);
                        } else {
                            console.error(username, 'Invalid save file');
                        }
                    } else if (type === 'player_force_logout') {
                        const { username } = msg;

                        const account = await db
                            .selectFrom('account')
                            .leftJoin('account_login', join => join.onRef('account_id', '=', 'id').on('profile', '=', profile))
                            .where('username', '=', username)
                            .selectAll()
                            .executeTakeFirst();

                        if (account?.account_id) {
                            this.untrackLogin(account.id);
                            await db
                                .updateTable('account_login')
                                .set({
                                    logged_in: 0,
                                    login_time: null
                                })
                                .where('account_id', '=', account.id)
                                .where('profile', '=', profile)
                                .executeTakeFirst();
                        }
                    } else if (type === 'player_ban') {
                        const { _staff, username, until } = msg;

                        // todo: audit log

                        await db
                            .updateTable('account')
                            .set({
                                banned_until: toDbDate(until)
                            })
                            .where('username', '=', username)
                            .executeTakeFirst();
                    } else if (type === 'player_mute') {
                        const { _staff, username, until } = msg;

                        // todo: audit log

                        await db
                            .updateTable('account')
                            .set({
                                muted_until: toDbDate(until)
                            })
                            .where('username', '=', username)
                            .executeTakeFirst();
                    } else if (type === 'sdk_auth') {
                        // SDK/Gateway authentication - validates username/password for remote bot control
                        const { replyTo, password } = msg;
                        // Normalize like player_login so case differences (e.g. "Bitty" vs "bitty")
                        // resolve to the same account row.
                        const username = toSafeName(msg.username);

                        let account = await db.selectFrom('account')
                            .where('username', '=', username)
                            .select(['id', 'password', 'banned_until'])
                            .executeTakeFirst();

                        // Auto-register if account doesn't exist (same as player_login)
                        let registrationFailed = false;
                        if (!Environment.WEBSITE_REGISTRATION && !account) {
                            // reject usernames containing banned words
                            const sdkLower = username.toLowerCase();
                            if (Environment.BANNED_USERNAME_WORDS.some(w => sdkLower.includes(w))) {
                                s.send(JSON.stringify({
                                    replyTo,
                                    success: false,
                                    error: 'Username contains inappropriate language'
                                }));
                                return;
                            }

                            try {
                                const insertResult = await db
                                    .insertInto('account')
                                    .values({
                                        username,
                                        password: bcrypt.hashSync(password, 10),
                                        registration_ip: 'sdk',
                                        registration_date: toDbDate(new Date())
                                    })
                                    .executeTakeFirst();

                                if (typeof insertResult.insertId !== 'undefined') {
                                    account = await db.selectFrom('account')
                                        .where('username', '=', username)
                                        .select(['id', 'password', 'banned_until'])
                                        .executeTakeFirst();
                                } else {
                                    registrationFailed = true;
                                }
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            } catch (err: any) {
                                // Handle UNIQUE constraint violation (username already taken by race condition)
                                if (err?.code === 'SQLITE_CONSTRAINT' || err?.message?.includes('UNIQUE')) {
                                    // Username was taken between check and insert - re-fetch and try password
                                    account = await db.selectFrom('account')
                                        .where('username', '=', username)
                                        .select(['id', 'password', 'banned_until'])
                                        .executeTakeFirst();
                                } else {
                                    console.error('[SDK Auth] Registration error:', err);
                                    registrationFailed = true;
                                }
                            }
                        }

                        if (registrationFailed && !account) {
                            s.send(JSON.stringify({
                                replyTo,
                                success: false,
                                error: 'Failed to create account. Username may already be taken.'
                            }));
                            return;
                        }

                        const sdkPasswordMatch = account ? await bcrypt.compare(password, account.password) : false;

                        if (!account || !sdkPasswordMatch) {
                            s.send(JSON.stringify({
                                replyTo,
                                success: false,
                                error: 'Invalid username or password'
                            }));
                            return;
                        }

                        if (account.banned_until !== null && new Date(account.banned_until) > new Date()) {
                            s.send(JSON.stringify({
                                replyTo,
                                success: false,
                                error: 'Account is banned'
                            }));
                            return;
                        }

                        s.send(JSON.stringify({
                            replyTo,
                            success: true,
                            account_id: account.id
                        }));
                    }
                } catch (err) {
                    console.error(err);
                }
            });

            s.on('close', () => {});
            s.on('error', () => {});
        });
    }
}
