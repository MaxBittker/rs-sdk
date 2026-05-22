import { db } from '#/db/query.js';
import { ChatModePrivate } from '#/engine/entity/ChatModes.js';
import Environment from '#/util/Environment.js';
import { fromBase37, toBase37 } from '#/util/JString.js';

/**
 * Stores friends data related to players.
 *
 * Responsible for database queries and caching.
 */
export class FriendServerRepository {
    private readonly profile: string;
    /**
     * playersByWorld[worldId][playerIndex] = username37 | null
     */
    private playersByWorld: (bigint | null)[][] = [];

    /**
     * worldByPlayer[username] = worldId
     */
    private worldByPlayer: Record<string, number> = {};

    /**
     * logged in player staff on any world
     */
    private playerStaff: Set<bigint> = new Set();

    /**
     * privateChatByPlayer[username] = privateChat
     */
    private privateChatByPlayer: Record<string, ChatModePrivate> = {};

    /**
     * playerFriends[username] = username37[]
     */
    private playerFriends: Record<string, bigint[]> = {};

    /**
     * playerIgnores[username] = username37[]
     */
    private playerIgnores: Record<string, bigint[]> = {};

    constructor(profile: string) {
        this.profile = profile;
    }

    public initializeWorld(world: number, size: number) {
        if (this.playersByWorld[world]) {
            return;
        }

        this.playersByWorld[world] = new Array(size).fill(null);
    }

    public isInitialized(world: number) {
        return typeof this.playersByWorld[world] !== 'undefined';
    }

    public getWorld(username37: bigint) {
        const username = fromBase37(username37);

        return this.worldByPlayer[username];
    }

    public getPrivateChat(username37: bigint) {
        const username = fromBase37(username37);

        return this.privateChatByPlayer[username];
    }

    public async register(world: number, username37: bigint, privateChat: ChatModePrivate, staffLvl: number = 0) {
        const username = fromBase37(username37);

        // add player to new world
        const newIndex = this.playersByWorld[world].findIndex(p => p === null);
        if (newIndex === -1) {
            // TODO handle this better?
            console.error(`[Friends]: World ${world} is full`);
            return false;
        }

        if (staffLvl > 1 && !this.playerStaff.has(username37)) {
            this.playerStaff.add(username37);
        }

        this.playersByWorld[world][newIndex] = username37;
        this.worldByPlayer[username] = world;
        this.privateChatByPlayer[username] = privateChat;
        await this.loadFriends(username37);

        return true;
    }

    public unregister(username37: bigint) {
        const username = fromBase37(username37);

        // if we know what world they are on, remove them from that world specifically
        const world = this.worldByPlayer[username];
        if (world) {
            const player = this.playersByWorld[world].findIndex(p => p === username37);

            if (player !== -1) {
                this.playersByWorld[world][player] = null;
                delete this.worldByPlayer[username];
                delete this.privateChatByPlayer[username];
                delete this.playerFriends[username];
                this.playerStaff.delete(username37);
                return;
            }
        }

        // otherwise, look through all worlds
        for (let i = 0; i < this.playersByWorld.length; i++) {
            if (!this.playersByWorld[i]) {
                continue;
            }

            const player = this.playersByWorld[i].findIndex(p => p === username37);

            if (player !== -1) {
                this.playersByWorld[i][player] = null;
                delete this.worldByPlayer[username];
                delete this.privateChatByPlayer[username];
                delete this.playerFriends[username];
                this.playerStaff.delete(username37);
            }
        }
    }

    public async getFriends(username37: bigint) {
        await this.loadFriends(username37);
        const username = fromBase37(username37);

        const playerFriends: [number, bigint][] = [];
        for (const [worldId, worldPlayers] of this.playersByWorld.entries()) {
            if (!worldPlayers?.length) {
                continue;
            }

            const friendsOnWorld: bigint[] = worldPlayers.filter(p => p !== null).filter(p => this.playerFriends[username].includes(p));

            if (friendsOnWorld.length === 0) {
                continue;
            }

            for (const friend of friendsOnWorld) {
                if (this.isVisibleTo(username37, friend) === false) {
                    continue;
                }

                // TODO cap to 100 friends here too?
                playerFriends.push([worldId, friend]);
            }
        }

        const remainingFriends = this.playerFriends[username].filter(f => !playerFriends.some(p => p[1] === f));
        for (const friend of remainingFriends) {
            playerFriends.push([0, friend]);
        }

        return playerFriends;
    }

    public async getIgnores(username37: bigint) {
        await this.loadIgnores(username37);

        const username = fromBase37(username37);

        return this.playerIgnores[username] ?? [];
    }

    /**
     * Get all "followers" of a player,
     * i.e. players who have the player in their friend list
     */
    public getFollowers(username37: bigint) {
        return Object.entries(this.playerFriends)
            .filter(([_, friends]) => friends.includes(username37))
            .map(([username, _]) => toBase37(username));
    }

    public async deleteFriend(username37: bigint, targetUsername37: bigint) {
        const username = fromBase37(username37);
        const targetUsername = fromBase37(targetUsername37);

        this.playerFriends[username] = this.playerFriends[username] ?? [];
        const index = this.playerFriends[username].indexOf(targetUsername37);

        if (index === -1) {
            // console.error(`[Friends]: ${username} tried to remove ${targetUsername} from their friend list, but they are not friends`);
            return;
        }

        this.playerFriends[username].splice(index, 1);

        await db
            .deleteFrom('friendlist')
            .where('profile', '=', this.profile)
            .where('account_id', 'in', db.selectFrom('account').select('id').where('username', '=', username))
            .where('friend_account_id', 'in', db.selectFrom('account').select('id').where('username', '=', targetUsername))
            .execute();
    }

    public async addFriend(username37: bigint, targetUsername37: bigint) {
        const username = fromBase37(username37);
        const targetUsername = fromBase37(targetUsername37);

        this.playerFriends[username] = this.playerFriends[username] ?? [];

        if (this.playerFriends[username].includes(targetUsername37)) {
            // console.error(`[Friends]: ${username} tried to add ${targetUsername} to their friend list, but they are already friends`);
            return;
        }

        // I tried to do all this in 1 query but Kyesly wasn't happy
        const account = await db.selectFrom('account').select(['id', 'members']).where('username', '=', username).limit(1).executeTakeFirst();
        const friendAccount = await db.selectFrom('account').select('id').where('username', '=', targetUsername).limit(1).executeTakeFirst();

        if (!account || !friendAccount) {
            // todo: respond to the client to delete their entry visually
            return;
        }

        const list = await db
            .selectFrom('friendlist')
            .where('account_id', '=', account.id)
            .select(({ fn }) => fn.countAll().as('count'))
            .executeTakeFirst();
        const limit = account.members ? 200 : 100;

        if (list && (list.count as number) >= limit) {
            return;
        }

        this.playerFriends[username].push(targetUsername37);

        await db
            .insertInto('friendlist')
            .values({
                account_id: account.id,
                profile: this.profile,
                friend_account_id: friendAccount.id
            })
            .execute();
    }

    public async addIgnore(username37: bigint, value37: bigint) {
        const username = fromBase37(username37);

        this.playerIgnores[username] = this.playerIgnores[username] ?? [];

        if (this.playerIgnores[username].includes(value37)) {
            return;
        }

        const account = await db.selectFrom('account').select('id').where('username', '=', fromBase37(username37)).limit(1).executeTakeFirst();

        if (!account) {
            return;
        }

        const { id } = account;

        const list = await db
            .selectFrom('ignorelist')
            .where('account_id', '=', id)
            .select(({ fn }) => fn.countAll().as('count'))
            .executeTakeFirst();

        if (list && (list.count as number) >= 100) {
            return;
        }

        this.playerIgnores[username].push(value37);

        let query = db.insertInto('ignorelist').values({
            account_id: id,
            profile: this.profile,
            value: fromBase37(value37)
        });

        // todo: resolve this when kyseley 0.28 releases .ignore()
        //       https://github.com/kysely-org/kysely/issues/916
        if (Environment.db.backend === 'sqlite') {
            query = query.onConflict(oc => oc.doNothing());
        } else if (Environment.db.backend === 'mysql') {
            query = query.onDuplicateKeyUpdate({
                value: fromBase37(value37)
            });
        } else {
            console.error('[Friends] Unknown DB_BACKEND');
            return;
        }

        await query.execute();
    }

    public async deleteIgnore(username37: bigint, value37: bigint) {
        const username = fromBase37(username37);

        this.playerIgnores[username] = this.playerIgnores[username] ?? [];
        const index = this.playerIgnores[username].indexOf(value37);

        if (index === -1) {
            return;
        }

        this.playerIgnores[username].splice(index, 1);

        await db
            .deleteFrom('ignorelist')
            .where('profile', '=', this.profile)
            .where('value', '=', fromBase37(value37))
            .where('account_id', 'in', db.selectFrom('account').select('id').where('username', '=', username))
            .execute();
    }

    public setChatMode(username37: bigint, privateChat: ChatModePrivate) {
        const username = fromBase37(username37);

        this.privateChatByPlayer[username] = privateChat;
    }

    /**
     * Is a player's online status visible to another player?
     *
     * @param viewer37 The player who is viewing the online status
     * @param other37 The player whose online status is being viewed
     * @returns Whether the viewer can see the other player's online status
     */
    public isVisibleTo(viewer37: bigint, other37: bigint) {
        const isViewerStaff = this.playerStaff.has(viewer37);
        const otherUsername = fromBase37(other37);

        if (isViewerStaff) {
            return true;
        }

        if (this.playerIgnores[otherUsername] && this.playerIgnores[otherUsername].includes(viewer37)) {
            return false;
        }

        const otherChatMode = this.privateChatByPlayer[otherUsername] ?? ChatModePrivate.OFF;

        if (otherChatMode === ChatModePrivate.OFF) {
            return false;
        }

        if (otherChatMode === ChatModePrivate.FRIENDS) {
            return this.playerFriends[otherUsername]?.includes(viewer37) ?? false;
        }

        return true;
    }

    private async loadFriends(username37: bigint) {
        const username = fromBase37(username37);
        const friendUsernames = await db
            .selectFrom('account as a')
            .innerJoin('friendlist as f', 'a.id', 'f.friend_account_id')
            .innerJoin('account as local', 'local.id', 'f.account_id')
            .select('a.username')
            .where('local.username', '=', username)
            .where('f.profile', '=', this.profile)
            .orderBy('f.created', 'asc')
            .execute();
        const friendUsername37s = friendUsernames.map(f => toBase37(f.username));

        this.playerFriends[username] = friendUsername37s;
    }

    private async loadIgnores(username37: bigint) {
        const username = fromBase37(username37);
        const ignores = await db
            .selectFrom('account as local')
            .innerJoin('ignorelist as i', 'local.id', 'i.account_id')
            .select('i.value')
            .where('local.username', '=', username)
            .where('i.profile', '=', this.profile)
            .orderBy('i.created', 'asc')
            .execute();

        const ignoreUsername37s = ignores.map(f => toBase37(f.value));

        this.playerIgnores[username] = ignoreUsername37s;
    }
}
