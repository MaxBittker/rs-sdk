export const enum ClientProt {
    MARKET_SEARCH = 243, // rs-sdk: query string + displayed item ID (0 = filter)
    NO_TIMEOUT = 181, // index: 6 - NXT naming

    IDLE_TIMER = 145, // index: 30
    EVENT_MOUSE_CLICK = 224, // index: 31
    EVENT_MOUSE_MOVE = 229, // index: 32
    EVENT_APPLET_FOCUS = 149, // index: 33
    EVENT_CAMERA_POSITION = 193, // index: 35

    ANTICHEAT_OPLOGIC1 = 195, // index: 60
    ANTICHEAT_OPLOGIC2 = 81, // index: 61
    ANTICHEAT_OPLOGIC3 = 122, // index: 62
    ANTICHEAT_OPLOGIC4 = 49, // index: 63
    ANTICHEAT_OPLOGIC5 = 46, // index: 64
    ANTICHEAT_OPLOGIC6 = 73, // index: 65
    ANTICHEAT_OPLOGIC7 = 133, // index: 66
    ANTICHEAT_OPLOGIC8 = 168, // index: 67
    ANTICHEAT_OPLOGIC9 = 88, // index: 68

    ANTICHEAT_CYCLELOGIC1 = 130, // index: 70
    ANTICHEAT_CYCLELOGIC2 = 154, // index: 71
    ANTICHEAT_CYCLELOGIC3 = 125, // index: 72
    ANTICHEAT_CYCLELOGIC4 = 137, // index: 73
    ANTICHEAT_CYCLELOGIC5 = 85, // index: 74
    ANTICHEAT_CYCLELOGIC6 = 255, // index: 75
    ANTICHEAT_CYCLELOGIC7 = 232, // index: 76

    OPOBJ1 = 97, // index: 80 - NXT naming
    OPOBJ2 = 4, // index: 81 - NXT naming
    OPOBJ3 = 110, // index: 82 - NXT naming
    OPOBJ4 = 147, // index: 83 - NXT naming
    OPOBJ5 = 22, // index: 84 - NXT naming
    OPOBJT = 241, // index: 88 - NXT naming
    OPOBJU = 55, // index: 89 - NXT naming

    OPNPC1 = 252, // index: 100 - NXT naming
    OPNPC2 = 21, // index: 101 - NXT naming
    OPNPC3 = 178, // index: 102 - NXT naming
    OPNPC4 = 30, // index: 103 - NXT naming
    OPNPC5 = 247, // index: 104 - NXT naming
    OPNPCT = 108, // index: 108 - NXT naming
    OPNPCU = 160, // index: 109 - NXT naming

    OPLOC1 = 10, // index: 120 - NXT naming
    OPLOC2 = 45, // index: 121 - NXT naming
    OPLOC3 = 196, // index: 122 - NXT naming
    OPLOC4 = 53, // index: 123 - NXT naming
    OPLOC5 = 126, // index: 124 - NXT naming
    OPLOCT = 218, // index: 128 - NXT naming
    OPLOCU = 184, // index: 129 - NXT naming

    OPPLAYER1 = 220, // index: 140 - NXT naming
    OPPLAYER2 = 51, // index: 141 - NXT naming
    OPPLAYER3 = 13, // index: 142 - NXT naming
    OPPLAYER4 = 189, // index: 143 - NXT naming
    OPPLAYER5 = 69, // index: 144 - NXT naming
    OPPLAYERT = 138, // index: 148 - NXT naming
    OPPLAYERU = 16, // index: 149 - NXT naming

    OPHELD1 = 76, // index: 160 - name based on runescript trigger
    OPHELD2 = 177, // index: 161 - name based on runescript trigger
    OPHELD3 = 40, // index: 162 - name based on runescript trigger
    OPHELD4 = 191, // index: 163 - name based on runescript trigger
    OPHELD5 = 79, // index: 164 - name based on runescript trigger
    OPHELDT = 112, // index: 168 - name based on runescript trigger
    OPHELDU = 200, // index: 169 - name based on runescript trigger

    INV_BUTTON1 = 44, // index: 190 - NXT has "IF_BUTTON1" but for our interface system, this makes more sense
    INV_BUTTON2 = 111, // index: 191 - NXT has "IF_BUTTON2" but for our interface system, this makes more sense
    INV_BUTTON3 = 124, // index: 192 - NXT has "IF_BUTTON3" but for our interface system, this makes more sense
    INV_BUTTON4 = 248, // index: 193 - NXT has "IF_BUTTON4" but for our interface system, this makes more sense
    INV_BUTTON5 = 227, // index: 194 - NXT has "IF_BUTTON5" but for our interface system, this makes more sense

    IF_BUTTON = 86, // index: 200 - NXT naming
    RESUME_PAUSEBUTTON = 166, // index: 201 - NXT naming
    CLOSE_MODAL = 93, // index: 202 - NXT naming
    RESUME_P_COUNTDIALOG = 180, // index: 203 - NXT naming
    TUT_CLICKSIDE = 146, // index: 204

    MAP_BUILD_COMPLETE = 214, // index: 241 - NXT naming
    MOVE_OPCLICK = 67, // index: 242 - comes with OP packets, name based on other MOVE packets
    SEND_SNAPSHOT = 94, // index: 243 - NXT naming
    MOVE_MINIMAPCLICK = 236, // index: 244 - NXT naming
    INV_BUTTOND = 253, // index: 245 - NXT has "IF_BUTTOND" but for our interface system, this makes more sense
    IGNORELIST_DEL = 251, // index: 246 - NXT naming
    IGNORELIST_ADD = 192, // index: 247 - NXT naming
    IDK_SAVEDESIGN = 27, // index: 248 - based on function name
    CHAT_SETMODE = 161, // index: 249 - NXT naming
    MESSAGE_PRIVATE = 107, // index: 250 - NXT naming
    FRIENDLIST_DEL = 203, // index: 251 - NXT naming
    FRIENDLIST_ADD = 235, // index: 252 - NXT naming
    CLIENT_CHEAT = 34, // index: 253 - NXT naming
    MESSAGE_PUBLIC = 156, // index: 254 - NXT naming
    MOVE_GAMECLICK = 234, // index: 255 - NXT naming
};
