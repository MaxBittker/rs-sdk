// Lumbridge pickpocket swarm: N lite clients in one process, each driven by an
// in-process tick loop instead of the SDK gateway.
//
//   cd server/webclient
//   bun src/lite/swarm.ts pplum01 pplum02 ... [--collector=pplum01] [--minutes=N]
//
// Why in-process: runner.ts round-trips every action through the gateway, so a
// pickpocket costs a WebSocket RTT plus a full state broadcast before the next
// one can be aimed - about 2.0s per attempt measured against prod. Here the same
// BotStateCollector and ActionExecutor run against LiteClient directly on the
// game-tick callback, so an attempt costs the 2 ticks the engine actually needs.
//
// Roles. Every bot pickpockets the men east of Lumbridge castle and hoovers up
// loose coins. Workers hand their coins over by dropping them where they stand
// once they are holding DROP_AT; the collector is the one bot that never drops,
// so its stack converges on the fleet total. A failed pickpocket costs
// 1 hp and there is no food shop in Lumbridge, so bots do die - that is fine and
// deliberate: they respawn at full hp two tiles from the men, and whatever they
// were carrying lands on the ground for the swarm to pick straight back up.
// The collector stops pickpocketing once its stack passes SAFE_STACK, because a
// death would scatter the whole pile.
//
// Sessions end for reasons that have nothing to do with the bot (socket dropped,
// world restarted, a packet handler failing in a burst), and a fleet that loses
// one bot an hour still looks healthy on the stats line. So every bot is
// supervised: `onEnd` re-logs it in with backoff, keeping its stats and its share
// of the gold, and the report marks anything that is currently offline.

import { fileURLToPath } from 'node:url';

import { startSession, type LiteSession, type SessionEnd } from './session.js';
import { BotStateCollector } from '#/bot/StateCollector.js';
import { ActionExecutor } from '#/bot/ActionExecutor.js';
import type { BotAction, BotWorldState } from '#/bot/types.js';
import type { Client } from '#/client/Client.js';
import type { LiteClient } from './LiteClient.js';

// East of Lumbridge castle. The men that spawn at x=3216 are INSIDE the castle
// and are not routable from the courtyard - 274 makes the client pathfind, so
// those are silent no-ops. The reachable cluster is the open ground at x=3230-3234.
const MEN_X = 3231;
const MEN_Z = 3218;
const DROP_AT = 120; // gp a worker carries before making a hand-off run
const SAFE_STACK = 500; // collector retires from pickpocketing once holding this
const COLLECTOR_HP_FLOOR = 6; // ...and well before a stun could ever kill it
const HP_CASH_OUT = 3; // workers hand off their coins before they die
// An attempt spans 2+ engine ticks inside a p_delay, and ops that arrive during
// it are refused rather than queued, so there is nothing to gain by firing on a
// cadence: leave an attempt alone until it resolves. This is the backstop for
// the case where nothing resolves and the server said nothing either; a refusal
// the server DID signal is caught by opFeedback and retried the next tick.
const PICK_RETRY_TICKS = Number(process.env.PICK_RETRY ?? 6);
const OWN_DROP_IGNORE_TICKS = 400; // a hand-off stays "not mine to retake" this long
const UNREACHABLE_TICKS = 50; // how long to skip a man local routing could not reach
const STUN_TICKS = 8; // %stunned in pickpocket.rs2; further opnpc3 is dropped
// The engine holds a dropped session open for a few seconds and answers
// "already logged in" until it lets go, so the first retry always waits.
const RELOGIN_MS = 5_000;
const RELOGIN_MAX_MS = 60_000;

interface Stats {
    picks: number;
    stuns: number;
    deaths: number;
    drops: number;
    droppedGp: number;
    pickedUpGp: number;
    relogins: number;
    /** Attempts the server refused outright. A high count means something is
     *  blocking ops - a modal, a stun, an npc that left view - not bad luck. */
    rejected: number;
}

class PickpocketBot {
    private session: LiteSession | null = null;
    private client: LiteClient | null = null;
    private collector: BotStateCollector | null = null;
    private executor: ActionExecutor | null = null;

    private tick = 0;
    private waitTicks = 0;
    private lastHp = 0;
    private seenHp = false;
    private lastCoins = 0;
    private lastPickTick = -99;
    private awaitingPick = false;
    /** opFeedback.opRejectedCount as of the last attempt sent. */
    private pickRejectCursor = 0;
    private busy = false;
    /** npcIndex -> tick until which local routing said it cannot be reached. */
    private unreachable = new Map<number, number>();
    /** "x,z" -> tick until which a coin pile was not routable. */
    private unreachablePiles = new Map<string, number>();
    /** "x,z" -> tick until which a pile there is our own un-collected hand-off. */
    private myDrops = new Map<string, number>();
    lastFailure = '';

    readonly stats: Stats = { picks: 0, stuns: 0, deaths: 0, drops: 0, droppedGp: 0, pickedUpGp: 0, relogins: 0, rejected: 0 };
    coins = 0;
    thieving = 1;
    hp = 10;

    constructor(
        readonly name: string,
        readonly isCollector: boolean
    ) {}

    get online(): boolean {
        return this.client !== null && this.client.isInGame();
    }

    /**
     * Take ownership of a freshly logged-in session. Stats and the gold this bot
     * is carrying survive a re-login; everything keyed to the old session does
     * not - npc indices are per-session, and the tick counter restarts at 0, so
     * stale deadlines in these maps would read as far-future and never expire.
     */
    attach(session: LiteSession): void {
        this.session = session;
        this.client = session.client;
        const asClient = this.client as unknown as Client;
        this.collector = new BotStateCollector(asClient);
        this.executor = new ActionExecutor(asClient);
        this.executor.setScanProvider(this.collector);

        this.tick = 0;
        this.waitTicks = 0;
        this.seenHp = false;
        this.lastPickTick = -99;
        this.awaitingPick = false;
        this.busy = false;
        this.unreachable.clear();
        this.unreachablePiles.clear();
        this.myDrops.clear();

        this.client.setOnGameTickCallback(() => {
            this.tick++;
            this.onTick().catch(e => console.error(`[${this.name}] tick error:`, e));
        });
    }

    stop(): void {
        this.client?.setOnGameTickCallback(null);
        this.session?.stop();
        this.session = null;
        this.client = null;
    }

    private exec(action: BotAction): void {
        if (!this.executor) return;
        if (DEBUG === this.name) {
            console.log(`  t${this.tick} ${action.type}(${action.reason}) hp=${this.hp} gp=${this.coins}`);
        }
        const res = this.executor.execute(action);
        if (!(res instanceof Promise) && !res.success) {
            this.lastFailure = `${action.type}:${res.reason ?? res.message}`;
            if (DEBUG === this.name) console.log(`  t${this.tick} FAILED ${this.lastFailure}`);
        }
        if (res instanceof Promise) {
            // Only routing actions (walkTo over long distances) go async.
            this.busy = true;
            res.catch(() => undefined).finally(() => {
                this.busy = false;
            });
        }
    }

    private coinsIn(state: BotWorldState): number {
        return state.inventory.filter(i => /^coins$/i.test(i.name)).reduce((a, i) => a + i.count, 0);
    }

    private async onTick(): Promise<void> {
        if (!this.client || !this.collector) return;
        if (this.busy) return;
        if (this.waitTicks > 0) {
            this.waitTicks--;
            return;
        }

        const state = this.collector.collectState(this.tick, true) as BotWorldState | null;
        if (!state?.player) return;

        // Level-ups fire constantly here and block every op server-side.
        if (this.client.isDialogOpen()) {
            this.exec({ type: 'clickDialogOption', optionIndex: 0, reason: 'level up' });
            return;
        }
        if (this.client.isModalOpen()) {
            this.exec({ type: 'closeModal', reason: 'unblock inventory' });
            return;
        }

        // The server can take an op and throw it away - stunned, mid-action, or
        // a modal open underneath - and the only thing it sends back is
        // UNSET_MAP_FLAG. Without this the bot sits out the whole retry window
        // waiting for a resolution that was never coming.
        if (this.awaitingPick && state.opFeedback.opRejectedCount > this.pickRejectCursor) {
            this.stats.rejected++;
            this.awaitingPick = false;
        }

        const hp = state.skills.find(s => /hitpoint/i.test(s.name))?.level ?? 0;
        const coins = this.coinsIn(state);
        this.hp = hp;
        this.coins = coins;
        this.thieving = state.skills.find(s => /thieving/i.test(s.name))?.level ?? 1;

        // Score the previous tick from the deltas rather than blocking on a
        // confirmation - a pickpocket resolves 2-3 ticks after it is sent, and
        // waiting for that round-trip is what made the gateway version slow.
        if (this.seenHp) {
            if (hp - this.lastHp >= 3) {
                // hp snapped back up: died and respawned. (Regen is 1 at a time,
                // and a death reads as 0 for a tick, so >=3 is unambiguous.)
                this.stats.deaths++;
                this.awaitingPick = false;
            } else if (hp < this.lastHp) {
                this.stats.stuns++;
                this.lastHp = hp;
                this.awaitingPick = false;
                this.waitTicks = STUN_TICKS; // %stunned drops further opnpc3 anyway
                return;
            }
        }
        // seenHp gates this too: the first tick of a session (or of a re-login)
        // only resynchronises the baselines, or a restored inventory would score
        // as a pickpocket.
        if (this.seenHp && coins > this.lastCoins) {
            this.stats.picks++;
            this.awaitingPick = false;
        }
        this.lastHp = hp;
        this.lastCoins = coins;
        if (hp > 0) this.seenHp = true; // skills read 0 on the first tick after login

        const px = state.player.worldX;
        const pz = state.player.worldZ;

        // --- back on station ---------------------------------------------------
        // Everyone works the same cluster, collector included - it is one of the
        // ten pickpockets, it just never drops what it collects.
        if (Math.hypot(px - MEN_X, pz - MEN_Z) > 12) {
            this.exec({ type: 'walkTo', x: MEN_X, z: MEN_Z, running: true, reason: 'return to station' });
            this.waitTicks = 4;
            return;
        }

        // --- hand off: drop in place ------------------------------------------
        // Dropping where we stand rather than walking to a rendezvous tile. The
        // whole fleet works a handful of tiles, so the collector can reach any
        // pile, and a walk-to-drop state machine was costing more than it saved.
        if (!this.isCollector && (coins >= DROP_AT || (coins > 0 && hp <= HP_CASH_OUT))) {
            const slot = state.inventory.find(i => /^coins$/i.test(i.name))?.slot;
            if (slot !== undefined) {
                this.exec({ type: 'dropItem', slot, reason: 'hand off to collector' });
                this.stats.drops++;
                this.stats.droppedGp += coins;
                // Do not immediately hoover our own hand-off back up.
                this.myDrops.set(`${px},${pz}`, this.tick + OWN_DROP_IGNORE_TICKS);
                this.awaitingPick = false;
            }
            this.waitTicks = 1;
            return;
        }

        // --- hoover up loose coins ---------------------------------------------
        const pile = state.groundItems
            .filter(g => /^coins$/i.test(g.name))
            .filter(g => Math.abs(g.x - px) <= 12 && Math.abs(g.z - pz) <= 12)
            .filter(g => g.reachable !== false) // taking routes 0x0 - you must stand on the pile
            .filter(g => (this.unreachablePiles.get(`${g.x},${g.z}`) ?? 0) < this.tick)
            // Only skip our OWN fresh hand-off; anything else on the floor is fair game.
            .filter(g => this.isCollector || (this.myDrops.get(`${g.x},${g.z}`) ?? 0) < this.tick)
            // ...but a worker must not take a pile big enough to put it straight
            // back over DROP_AT, or hand-offs ping-pong around the workers and
            // never reach the collector. Measured: 60 drops against 100 picks.
            .filter(g => this.isCollector || coins + g.count < DROP_AT)
            .sort((a, b) => b.count - a.count || a.distance - b.distance)[0];
        if (pile) {
            this.lastFailure = '';
            this.exec({ type: 'pickupItem', x: pile.x, z: pile.z, itemId: pile.id, reason: 'loose gold' });
            if (this.lastFailure.endsWith('cant_reach')) {
                this.unreachablePiles.set(`${pile.x},${pile.z}`, this.tick + UNREACHABLE_TICKS);
                return;
            }
            this.stats.pickedUpGp += pile.count;
            this.waitTicks = 2;
            return;
        }

        // --- a loaded collector stops taking stun damage ------------------------
        // Death scatters the entire stack, so once the collector is actually
        // holding the fleet's money it retires from pickpocketing and does nothing
        // but pick up. Nothing in this area attacks players, so a collector that
        // never fails a pickpocket can never die, and its hp regenerates to full.
        if (this.isCollector && (coins >= SAFE_STACK || hp <= COLLECTOR_HP_FLOOR)) {
            this.waitTicks = 2;
            return;
        }

        // --- the actual work ----------------------------------------------------
        // Lumbridge castle walls sit between the courtyard and half the men, and
        // 274 makes the CLIENT route (clientRoutefinder=true), so an unreachable
        // target is a silent no-op rather than a server-side walk.
        //
        // `reachable` answers that up front now (StateCollector runs the router's
        // own flood fill - see bot/reach.ts), so the castle men are skipped
        // without spending a tick each discovering it. The blacklist stays as a
        // backstop: reachability is a prediction of the route, and a man who is
        // routable but permanently mid-something still needs parking.
        const candidates = state.nearbyNpcs
            .filter(n => /^man$/i.test(n.name))
            .filter(n => n.optionsWithIndex.some(o => /pickpocket/i.test(o.text)))
            .filter(n => n.reachable !== false)
            .filter(n => (this.unreachable.get(n.index) ?? 0) < this.tick)
            .sort((a, b) => a.distance - b.distance);
        const man = candidates[0];
        if (!man) {
            this.exec({ type: 'walkTo', x: MEN_X, z: MEN_Z, running: true, reason: 'find men' });
            this.waitTicks = 5;
            return;
        }
        // Leave an outstanding attempt alone until it lands or times out.
        if (this.awaitingPick && this.tick - this.lastPickTick < PICK_RETRY_TICKS) return;
        const opt = man.optionsWithIndex.find(o => /pickpocket/i.test(o.text))!;
        if (DEBUG === this.name) {
            const msgs = state.gameMessages.slice(-2).map(m => m.text).join(' | ');
            console.log(`  t${this.tick} me(${px},${pz}) man#${man.index}(${man.x},${man.z}) d=${man.distance} op=${opt.opIndex} :: ${msgs}`);
        }
        this.lastFailure = '';
        this.exec({ type: 'interactNpc', npcIndex: man.index, optionIndex: opt.opIndex, reason: 'pickpocket' });
        if (this.lastFailure.endsWith('cant_reach')) {
            this.unreachable.set(man.index, this.tick + UNREACHABLE_TICKS);
            return; // no packet went out - try a different man on the next tick
        }
        this.lastPickTick = this.tick;
        this.awaitingPick = true;
        this.pickRejectCursor = state.opFeedback.opRejectedCount;
    }
}

// ------------------------------------------------------------------ CLI entry

const argv = process.argv.slice(2);
const names = argv.filter(a => !a.startsWith('-'));
if (names.length === 0) {
    console.error('Usage: bun src/lite/swarm.ts <bot> [<bot>...] [--collector=<bot>] [--minutes=N]');
    process.exit(1);
}
const collectorName = argv.find(a => a.startsWith('--collector='))?.slice('--collector='.length) ?? names[0];
const minutes = Number(argv.find(a => a.startsWith('--minutes='))?.slice('--minutes='.length) ?? 0);
const DEBUG = argv.find(a => a.startsWith('--debug='))?.slice('--debug='.length) ?? '';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

async function readEnv(bot: string): Promise<Record<string, string>> {
    const text = await Bun.file(`${repoRoot}bots/${bot}/bot.env`).text();
    return Object.fromEntries(
        text
            .split('\n')
            .filter(l => l.includes('=') && !l.startsWith('#'))
            .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
    );
}

let shuttingDown = false;

/** Log a bot in and hand it the session, arranging for its own resurrection. */
async function login(bot: PickpocketBot): Promise<void> {
    const env = await readEnv(bot.name);
    const session = await startSession({
        host: env.SERVER || 'localhost',
        username: env.BOT_USERNAME!,
        password: env.PASSWORD!,
        quiet: true,
        onEnd: (end: SessionEnd) => onSessionEnd(bot, end)
    });
    bot.attach(session);
}

function onSessionEnd(bot: PickpocketBot, end: SessionEnd): void {
    if (shuttingDown || end.reason === 'stopped') {
        return;
    }
    console.warn(`[swarm] ${bot.name} lost its session (${end.reason}) - re-logging in`);
    void relogin(bot);
}

/** Retry forever: the world may be restarting, and a bot is no use logged out. */
async function relogin(bot: PickpocketBot): Promise<void> {
    let delay = RELOGIN_MS;
    while (!shuttingDown) {
        await Bun.sleep(delay);
        if (shuttingDown) {
            return;
        }
        try {
            await login(bot);
            bot.stats.relogins++;
            console.log(`[swarm] ${bot.name} back online (${bot.stats.relogins} re-logins so far)`);
            return;
        } catch (e) {
            console.error(`[swarm] ${bot.name} re-login failed (${e}); retrying in ${Math.round(delay / 1000)}s`);
            delay = Math.min(delay * 2, RELOGIN_MAX_MS);
        }
    }
}

const bots: PickpocketBot[] = [];
for (const name of names) {
    const bot = new PickpocketBot(name, name === collectorName);
    bots.push(bot);
    try {
        await login(bot);
        console.log(`[swarm] ${name} logged in${bot.isCollector ? ' (COLLECTOR)' : ''}`);
    } catch (e) {
        console.error(`[swarm] ${name} failed to log in: ${e}`);
        void relogin(bot); // keep trying in the background rather than losing the bot
    }
    await Bun.sleep(1500); // stagger so the login server is not hammered
}

if (!bots.some(b => b.online)) {
    console.error('[swarm] nothing logged in');
    process.exit(1);
}

const startedAt = Date.now();
const report = setInterval(() => {
    const mins = (Date.now() - startedAt) / 60_000;
    const total = bots.reduce((a, b) => a + b.stats.picks, 0);
    const held = bots.reduce((a, b) => a + b.coins, 0);
    const collector = bots.find(b => b.isCollector);
    const online = bots.filter(b => b.online).length;
    console.log(
        `\n[swarm] ${mins.toFixed(1)}m | ${online}/${bots.length} online | ${total} picks | ${held} gp live in the fleet | ` +
            `collector ${collector?.name} holds ${collector?.coins ?? 0} gp`
    );
    for (const b of bots) {
        console.log(
            `  ${b.name.padEnd(9)} th${String(b.thieving).padStart(2)} hp${String(b.hp).padStart(2)} ` +
                `${String(b.coins).padStart(7)} gp | ${b.stats.picks} picks ${b.stats.stuns} stuns ` +
                `${b.stats.deaths} deaths ${b.stats.drops} drops ${b.stats.pickedUpGp} gp off the floor` +
                (b.stats.rejected ? ` ${b.stats.rejected} refused` : '') +
                (b.stats.relogins ? ` ${b.stats.relogins} re-logins` : '') +
                (b.online ? '' : '  <- OFFLINE') +
                (b.isCollector ? '  <- COLLECTOR' : '')
        );
    }
}, 30_000);

function shutdown(): void {
    shuttingDown = true;
    clearInterval(report);
    const collector = bots.find(b => b.isCollector);
    console.log(`\n[swarm] stopping. Collector ${collector?.name} holds ${collector?.coins ?? 0} gp.`);
    for (const b of bots) b.stop();
    process.exit(0);
}

process.on('SIGINT', shutdown);
if (minutes > 0) setTimeout(shutdown, minutes * 60_000);
