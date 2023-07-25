import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import Loc from '#lostcity/entity/Loc.js';
import Npc from '#lostcity/entity/Npc.js';
import Obj from '#lostcity/entity/Obj.js';
import Player from '#lostcity/entity/Player.js';

export type Interaction = {
    mode: ServerTriggerType; // TODO: accept trigger type or npc mode
    target: Player | Npc | Loc | Obj;
    x: number;
    z: number;
    ap: boolean;
    apRange: number;
    apRangeCalled: boolean;
}
