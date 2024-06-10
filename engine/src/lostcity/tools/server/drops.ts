import fs from 'fs';

import InvType from '#lostcity/cache/config/InvType.js';
import NpcType from '#lostcity/cache/config/NpcType.js';
import World from '#lostcity/engine/World.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import Npc from '#lostcity/entity/Npc.js';
import { PlayerLoading } from '#lostcity/entity/PlayerLoading.js';
import ObjType from '#lostcity/cache/config/ObjType.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';

import Environment from '#lostcity/util/Environment.js';

Environment.CLIRUNNER = true;

const args = process.argv.slice(2);

if (args.length < 1) {
    console.error('Usage: drops.ts <npc name> [iterations]');
    process.exit(1);
}

const npcName = args[0];
const iterations = parseInt(args[1] ?? '1000');

await World.start(true);

const player = PlayerLoading.loadFromFile('clirunner');
player.x = 3222;
player.z = 3222;
player.level = 0;
World.addPlayer(player);
await World.cycle(false);

const npcType = NpcType.getByName(npcName);
if (!npcType) {
    console.error('NPC type not found');
    process.exit(1);
}

const deathScript = ScriptProvider.getByTrigger(ServerTriggerType.AI_QUEUE3, npcType.id, -1);
if (!deathScript) {
    console.error('Death script not found');
    process.exit(1);
}

const npc = new Npc(0, 3222, 3221, 1, 1, EntityLifeCycle.RESPAWN, World.getNextNid(), npcType.id, npcType.moverestrict, npcType.blockwalk);
World.addNpc(npc, -1);
npc.addHero(player.uid, 1);

for (let i = 0; i < iterations; i++) {
    const state = ScriptRunner.init(deathScript, npc);
    ScriptRunner.execute(state);
}

const bank = player.getInventory(InvType.getByName('bank')!.id)!;
const items = bank.items.filter(x => x).sort((a, b) => b!.count - a!.count);

console.log('----');
fs.writeFileSync('dump/drop.log', '');
for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) {
        continue;
    }

    const itemDef = ObjType.get(item.id);
    if (itemDef) {
        console.log(`${itemDef.name} ${item.count}`);
        fs.appendFileSync('dump/drop.log', `${itemDef.name} ${item.count}\n`);
    }
}

process.exit(0);
