import ServerGameProt from '#/network/game/server/ServerGameProt.js';

export default class ServerGameZoneProt extends ServerGameProt {
    // zone protocol
    static readonly LOC_MERGE = new ServerGameZoneProt(83, 14); // todo: rename to P_LOCMERGE
    static readonly LOC_ANIM = new ServerGameZoneProt(106, 4);
    static readonly OBJ_DEL = new ServerGameZoneProt(71, 3);
    static readonly OBJ_REVEAL = new ServerGameZoneProt(176, 7);
    static readonly LOC_ADD_CHANGE = new ServerGameZoneProt(90, 4);
    static readonly MAP_PROJANIM = new ServerGameZoneProt(87, 15);
    static readonly LOC_DEL = new ServerGameZoneProt(194, 2);
    static readonly OBJ_COUNT = new ServerGameZoneProt(117, 7);
    static readonly MAP_ANIM = new ServerGameZoneProt(233, 6);
    static readonly OBJ_ADD = new ServerGameZoneProt(60, 5);
}
