enum NpcMode {
    // Default mode
    NULL = -1,
    // Do nothing
    NONE = 0,
    // Wander around the NPC's spawn point
    WANDER = 1,
    // Patrol between a list of points
    PATROL = 2,
    // Retreat from its target
    PLAYERESCAPE = 3,
    // Follow its target
    PLAYERFOLLOW = 4,
    // Face its target while within maxrange distance
    PLAYERFACE = 5,
    // Face its target while within 1 tile distance
    PLAYERFACECLOSE = 6,

    // Execute [ai_opplayerX,npc] script
    OPPLAYER1 = 7,
    OPPLAYER2 = 8,
    OPPLAYER3 = 9,
    OPPLAYER4 = 10,
    OPPLAYER5 = 11,

    // Execute [ai_applayerX,npc] script
    APPLAYER1 = 12,
    APPLAYER2 = 13,
    APPLAYER3 = 14,
    APPLAYER4 = 15,
    APPLAYER5 = 16,

    // Execute [ai_oplocX,npc] script
    OPLOC1 = 17,
    OPLOC2 = 18,
    OPLOC3 = 19,
    OPLOC4 = 20,
    OPLOC5 = 21,

    // Execute [ai_aplocX,npc] script
    APLOC1 = 22,
    APLOC2 = 23,
    APLOC3 = 24,
    APLOC4 = 25,
    APLOC5 = 26,

    // Execute [ai_opobjX,npc] script
    OPOBJ1 = 27,
    OPOBJ2 = 28,
    OPOBJ3 = 29,
    OPOBJ4 = 30,
    OPOBJ5 = 31,

    // Execute [ai_apobjX,npc] script
    APOBJ1 = 32,
    APOBJ2 = 33,
    APOBJ3 = 34,
    APOBJ4 = 35,
    APOBJ5 = 36,

    // Execute [ai_opnpcX,npc] script
    OPNPC1 = 37,
    OPNPC2 = 38,
    OPNPC3 = 39,
    OPNPC4 = 40,
    OPNPC5 = 41,

    // Execute [ai_apnpcX,npc] script
    APNPC1 = 42,
    APNPC2 = 43,
    APNPC3 = 44,
    APNPC4 = 45,
    APNPC5 = 46,

    // Execute the [ai_queueX,npc] script
    QUEUE1 = 47,
    QUEUE2 = 48,
    QUEUE3 = 49,
    QUEUE4 = 50,
    QUEUE5 = 51,
    QUEUE6 = 52,
    QUEUE7 = 53,
    QUEUE8 = 54,
    QUEUE9 = 55,
    QUEUE10 = 56,
    QUEUE11 = 57,
    QUEUE12 = 58,
    QUEUE13 = 59,
    QUEUE14 = 60,
    QUEUE15 = 61,
    QUEUE16 = 62,
    QUEUE17 = 63,
    QUEUE18 = 64,
    QUEUE19 = 65,
    QUEUE20 = 66
}

export default NpcMode;
