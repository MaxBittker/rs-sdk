import ServerGameProt from '#/network/game/server/ServerGameProt.js';

export default class ServerGameZoneProt extends ServerGameProt {
    // zone protocol
    static readonly LOC_MERGE = new ServerGameZoneProt(176, 14); // todo: rename to P_LOCMERGE
    static readonly LOC_ANIM = new ServerGameZoneProt(48, 4);
    static readonly OBJ_DEL = new ServerGameZoneProt(52, 3);
    static readonly OBJ_REVEAL = new ServerGameZoneProt(219, 7);
    static readonly LOC_ADD_CHANGE = new ServerGameZoneProt(138, 4);
    static readonly MAP_PROJANIM = new ServerGameZoneProt(107, 15);
    static readonly LOC_DEL = new ServerGameZoneProt(173, 2);
    static readonly OBJ_COUNT = new ServerGameZoneProt(95, 7);
    static readonly MAP_ANIM = new ServerGameZoneProt(85, 6);
    static readonly OBJ_ADD = new ServerGameZoneProt(81, 5);
}
