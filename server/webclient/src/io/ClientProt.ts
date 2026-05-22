export const enum ClientProt {
    NO_TIMEOUT = 120, // index: 6 - NXT naming

    IDLE_TIMER = 209, // index: 30
    EVENT_MOUSE_CLICK = 20, // index: 31
    EVENT_MOUSE_MOVE = 222, // index: 32
    EVENT_APPLET_FOCUS = 73, // index: 33
    EVENT_CAMERA_POSITION = 53, // index: 35

    ANTICHEAT_OPLOGIC1 = 219, // index: 60
    ANTICHEAT_OPLOGIC2 = 201, // index: 61
    ANTICHEAT_OPLOGIC3 = 41, // index: 62
    ANTICHEAT_OPLOGIC4 = 80, // index: 63
    ANTICHEAT_OPLOGIC5 = 235, // index: 64
    ANTICHEAT_OPLOGIC6 = 250, // index: 65
    ANTICHEAT_OPLOGIC7 = 25, // index: 66
    ANTICHEAT_OPLOGIC8 = 0, // index: 67
    ANTICHEAT_OPLOGIC9 = 24, // index: 68

    ANTICHEAT_CYCLELOGIC1 = 12, // index: 70
    ANTICHEAT_CYCLELOGIC2 = 149, // index: 71
    ANTICHEAT_CYCLELOGIC3 = 52, // index: 72
    ANTICHEAT_CYCLELOGIC4 = 230, // index: 73
    ANTICHEAT_CYCLELOGIC5 = 100, // index: 74
    ANTICHEAT_CYCLELOGIC6 = 188, // index: 75
    ANTICHEAT_CYCLELOGIC7 = 89, // index: 76

    OPOBJ1 = 247, // index: 80 - NXT naming
    OPOBJ2 = 169, // index: 81 - NXT naming
    OPOBJ3 = 108, // index: 82 - NXT naming
    OPOBJ4 = 62, // index: 83 - NXT naming
    OPOBJ5 = 117, // index: 84 - NXT naming
    OPOBJT = 91, // index: 88 - NXT naming
    OPOBJU = 39, // index: 89 - NXT naming

    OPNPC1 = 236, // index: 100 - NXT naming
    OPNPC2 = 233, // index: 101 - NXT naming
    OPNPC3 = 223, // index: 102 - NXT naming
    OPNPC4 = 147, // index: 103 - NXT naming
    OPNPC5 = 189, // index: 104 - NXT naming
    OPNPCT = 181, // index: 108 - NXT naming
    OPNPCU = 150, // index: 109 - NXT naming

    OPLOC1 = 215, // index: 120 - NXT naming
    OPLOC2 = 103, // index: 121 - NXT naming
    OPLOC3 = 187, // index: 122 - NXT naming
    OPLOC4 = 157, // index: 123 - NXT naming
    OPLOC5 = 127, // index: 124 - NXT naming
    OPLOCT = 213, // index: 128 - NXT naming
    OPLOCU = 60, // index: 129 - NXT naming

    OPPLAYER1 = 109, // index: 140 - NXT naming
    OPPLAYER2 = 166, // index: 141 - NXT naming
    OPPLAYER3 = 196, // index: 142 - NXT naming
    OPPLAYER4 = 98, // index: 143 - NXT naming
    OPPLAYER5 = 174, // index: 144 - NXT naming
    OPPLAYERT = 240, // index: 148 - NXT naming
    OPPLAYERU = 36, // index: 149 - NXT naming

    OPHELD1 = 185, // index: 160 - name based on runescript trigger
    OPHELD2 = 2, // index: 161 - name based on runescript trigger
    OPHELD3 = 123, // index: 162 - name based on runescript trigger
    OPHELD4 = 216, // index: 163 - name based on runescript trigger
    OPHELD5 = 42, // index: 164 - name based on runescript trigger
    OPHELDT = 135, // index: 168 - name based on runescript trigger
    OPHELDU = 136, // index: 169 - name based on runescript trigger

    INV_BUTTON1 = 74, // index: 190 - NXT has "IF_BUTTON1" but for our interface system, this makes more sense
    INV_BUTTON2 = 82, // index: 191 - NXT has "IF_BUTTON2" but for our interface system, this makes more sense
    INV_BUTTON3 = 239, // index: 192 - NXT has "IF_BUTTON3" but for our interface system, this makes more sense
    INV_BUTTON4 = 179, // index: 193 - NXT has "IF_BUTTON4" but for our interface system, this makes more sense
    INV_BUTTON5 = 46, // index: 194 - NXT has "IF_BUTTON5" but for our interface system, this makes more sense

    IF_BUTTON = 9, // index: 200 - NXT naming
    RESUME_PAUSEBUTTON = 72, // index: 201 - NXT naming
    CLOSE_MODAL = 51, // index: 202 - NXT naming
    RESUME_P_COUNTDIALOG = 102, // index: 203 - NXT naming
    TUT_CLICKSIDE = 94, // index: 204

    MAP_BUILD_COMPLETE = 214, // index: 241 - NXT naming
    MOVE_OPCLICK = 138, // index: 242 - comes with OP packets, name based on other MOVE packets
    SEND_SNAPSHOT = 137, // index: 243 - NXT naming
    MOVE_MINIMAPCLICK = 86, // index: 244 - NXT naming
    INV_BUTTOND = 93, // index: 245 - NXT has "IF_BUTTOND" but for our interface system, this makes more sense
    IGNORELIST_DEL = 101, // index: 246 - NXT naming
    IGNORELIST_ADD = 255, // index: 247 - NXT naming
    IDK_SAVEDESIGN = 125, // index: 248 - based on function name
    CHAT_SETMODE = 154, // index: 249 - NXT naming
    MESSAGE_PRIVATE = 139, // index: 250 - NXT naming
    FRIENDLIST_DEL = 106, // index: 251 - NXT naming
    FRIENDLIST_ADD = 13, // index: 252 - NXT naming
    CLIENT_CHEAT = 224, // index: 253 - NXT naming
    MESSAGE_PUBLIC = 253, // index: 254 - NXT naming
    MOVE_GAMECLICK = 207, // index: 255 - NXT naming
};
