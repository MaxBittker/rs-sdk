// A player who reaches 0 hp on the tick a Castle Wars game ends must get the Castle Wars
// death (nothing lost), not the normal one. [queue,player_death] picks the death type from
// coord, and [queue,castlewars_end] teleports to the lobby first, so the order of the two
// queues decided which death applied. Runs the real compiled scripts in data/pack.
import { strict as assert } from 'node:assert';
const { default: World } = await import('../../src/engine/World.js');
const { default: ObjType } = await import('../../src/cache/config/ObjType.js');
const { default: InvType } = await import('../../src/cache/config/InvType.js');
const { default: VarPlayerType } = await import('../../src/cache/config/VarPlayerType.js');
const { default: Packet } = await import('../../src/io/Packet.js');
const { PlayerLoading } = await import('../../src/engine/entity/PlayerLoading.js');
const { PlayerQueueType } = await import('../../src/engine/entity/PlayerQueueRequest.js');
const { default: ScriptProvider } = await import('../../src/engine/script/ScriptProvider.js');
const { PlayerStat } = await import('../../src/engine/entity/PlayerStat.js');
const { default: FontType } = await import('../../src/cache/config/FontType.js');

FontType.load('data/pack');
World.reload();
(World as any).gameMap.init();

const inv = InvType.getId('inv');
const worn = InvType.getId('worn');
const arrows = ObjType.getId('iron_arrow');
const sword = ObjType.getId('bronze_sword');
const shield = ObjType.getId('wooden_shield');
const bow = ObjType.getId('magic_shortbow');
const yew = ObjType.getId('yew_shortbow');
const team = VarPlayerType.getId('castlewars_team');
const script = (name: string) => {
    const s = ScriptProvider.getByName(name);
    assert(s, name);
    return s;
};
const end = script('[queue,castlewars_end]');
const death = script('[queue,player_death]');
const pvpDamage = script('[queue,pvp_damage]');

let tick = 0;
const step = () => {
    World.currentTick = ++tick;
    (World as any).processPlayers();
};

let n = 0;
function fighter(hp: number) {
    const p = PlayerLoading.load(`cwdeath${n + 1}`, new Packet(new Uint8Array()), null);
    p.x = 2399; p.z = 3103; p.level = 0; // central island
    p.baseLevels[PlayerStat.HITPOINTS] = 30;
    p.levels[PlayerStat.HITPOINTS] = hp;
    p.vars[team] = 0; // saradomin
    p.invAdd(inv, arrows, 3000);
    p.invAdd(inv, sword, 1);
    p.invAdd(inv, shield, 1);
    p.invAdd(inv, bow, 1);
    p.invAdd(inv, yew, 1);
    World.playerLoop.add(BigInt(++n), p);
    // what World's login does: a real uid is what p_finduid(uid) and damage(uid, ...) look up
    (World as any).players[n] = p;
    p.slot = n;
    p.uid = ((Number(p.username37 & 0x1fffffn) << 11) | p.slot) >>> 0;
    (World as any).gameMap.getZone(p.x, p.z, p.level).enter(p);
    step(); // settle
    return p;
}

function settle(p: any) {
    for (let i = 0; i < 20; i++) {
        step();
        // dismiss the end-of-game result box like a player (or a bot) would
        if (p.containsModalInterface()) p.closeModal();
    }
    return {
        x: p.x, z: p.z, level: p.level,
        hp: p.levels[PlayerStat.HITPOINTS],
        arrows: p.invTotal(inv, arrows) + p.invTotal(worn, arrows),
        bows: p.invTotal(inv, yew) + p.invTotal(worn, yew)
    };
}

const inLobby = (r: { x: number; z: number; level: number }) => Math.abs(r.x - 2441) <= 3 && Math.abs(r.z - 3090) <= 3 && r.level === 0;
const results: string[] = [];
function check(label: string, r: ReturnType<typeof settle>) {
    results.push(`${label}: ${JSON.stringify(r)}`);
    assert.equal(r.arrows, 3000, `${label}: kept arrows`);
    assert.equal(r.bows, 1, `${label}: kept yew shortbow`);
    assert(inLobby(r), `${label}: ended in the Castle Wars lobby, not ${r.x},${r.z},${r.level}`);
    assert(r.hp > 0, `${label}: alive`);
}

// 1. lethal hit lands the same tick as castlewars_end, ahead of it in the queue: the hit
//    appends player_death behind castlewars_end, which teleports to the lobby first.
{
    const p = fighter(5);
    p.enqueueScript(pvpDamage, PlayerQueueType.NORMAL, 0, [10]);
    p.enqueueScript(end, PlayerQueueType.STRONG, 0, [0]);
    check('hit then end', settle(p));
}

// 2. already at 0 hp with player_death queued behind castlewars_end.
{
    const p = fighter(0);
    p.enqueueScript(end, PlayerQueueType.STRONG, 0, [0]);
    p.enqueueScript(death, PlayerQueueType.NORMAL, 0, [0]);
    check('end then death', settle(p));
}

// 3. projectile still in flight when the game ends: it must not land in the lobby.
{
    const p = fighter(5);
    p.enqueueScript(pvpDamage, PlayerQueueType.NORMAL, 2, [10]);
    p.enqueueScript(end, PlayerQueueType.STRONG, 0, [0]);
    check('in-flight hit', settle(p));
}

// 4. control: died before the game ended (death runs first) still gets the Castle Wars death.
{
    const p = fighter(0);
    p.enqueueScript(death, PlayerQueueType.NORMAL, 0, [0]);
    p.enqueueScript(end, PlayerQueueType.STRONG, 0, [0]);
    check('death then end', settle(p));
}

console.log(results.join('\n'));
console.log('castlewars-end-death ok');
process.exit(0);
