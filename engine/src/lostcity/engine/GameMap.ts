import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import NpcType from '#lostcity/cache/NpcType.js';

import CollisionManager from '#lostcity/engine/collision/CollisionManager.js';

import ZoneManager from '#lostcity/engine/zone/ZoneManager.js';

import Npc from '#lostcity/entity/Npc.js';
import Obj from '#lostcity/entity/Obj.js';
import World from '#lostcity/engine/World.js';
import ObjType from '#lostcity/cache/ObjType.js';

export default class GameMap {
    readonly collisionManager = new CollisionManager();
    readonly zoneManager = new ZoneManager();

    init() {
        this.collisionManager.init(this.zoneManager);

        console.time('Loading game map');
        const maps = fs.readdirSync('data/pack/server/maps').filter(x => x[0] === 'm');
        for (let index = 0; index < maps.length; index++) {
            const [fileX, fileZ] = maps[index]
                .substring(1)
                .split('_')
                .map(x => parseInt(x));
            const mapsquareX = fileX << 6;
            const mapsquareZ = fileZ << 6;

            const npcMap = Packet.load(`data/pack/server/maps/n${fileX}_${fileZ}`);
            while (npcMap.available > 0) {
                const pos = npcMap.g2();
                const level = (pos >> 12) & 0x3;
                const localX = (pos >> 6) & 0x3f;
                const localZ = pos & 0x3f;

                const count = npcMap.g1();
                for (let j = 0; j < count; j++) {
                    const id = npcMap.g2();
                    const npcType = NpcType.get(id);

                    const size = npcType.size;

                    const npc = new Npc(level, mapsquareX + localX, mapsquareZ + localZ, size, size, World.getNextNid(), id, npcType.moverestrict, npcType.blockwalk);

                    if (npcType.members && World.members) {
                        World.addNpc(npc);
                    } else if (!npcType.members) {
                        World.addNpc(npc);
                    }
                }
            }

            const objMap = Packet.load(`data/pack/server/maps/o${fileX}_${fileZ}`);
            while (objMap.available > 0) {
                const pos = objMap.g2();
                const level = (pos >> 12) & 0x3;
                const localX = (pos >> 6) & 0x3f;
                const localZ = pos & 0x3f;

                const count = objMap.g1();
                for (let j = 0; j < count; j++) {
                    const objId = objMap.g2();
                    const objCount = objMap.g1();

                    const obj = new Obj(level, mapsquareX + localX, mapsquareZ + localZ, objId, objCount);

                    const objType = ObjType.get(objId);
                    if (objType.members && World.members) {
                        this.zoneManager.getZone(obj.x, obj.z, obj.level).addStaticObj(obj);
                    } else if (!objType.members) {
                        this.zoneManager.getZone(obj.x, obj.z, obj.level).addStaticObj(obj);
                    }
                }
            }
        }
        console.timeEnd('Loading game map');
    }
}
