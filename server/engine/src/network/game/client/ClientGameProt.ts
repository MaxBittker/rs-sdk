export default class ClientGameProt {
    static byId: ClientGameProt[] = [];

    static readonly MARKET_SEARCH = new ClientGameProt(243, -1); // rs-sdk: bounded GE text/select

    static readonly NO_TIMEOUT = new ClientGameProt(181, 0);

    static readonly IDLE_TIMER = new ClientGameProt(145, 0);
    static readonly EVENT_MOUSE_CLICK = new ClientGameProt(224, 4);
    static readonly EVENT_MOUSE_MOVE = new ClientGameProt(229, -1);
    static readonly EVENT_APPLET_FOCUS = new ClientGameProt(149, 1);
    static readonly EVENT_CAMERA_POSITION = new ClientGameProt(193, 4);

    static readonly ANTICHEAT_OPLOGIC1 = new ClientGameProt(195, 4);
    static readonly ANTICHEAT_OPLOGIC2 = new ClientGameProt(81, 2);
    static readonly ANTICHEAT_OPLOGIC3 = new ClientGameProt(122, 4);
    static readonly ANTICHEAT_OPLOGIC4 = new ClientGameProt(49, 1);
    static readonly ANTICHEAT_OPLOGIC5 = new ClientGameProt(46, 1);
    static readonly ANTICHEAT_OPLOGIC6 = new ClientGameProt(73, 2);
    static readonly ANTICHEAT_OPLOGIC7 = new ClientGameProt(133, 4);
    static readonly ANTICHEAT_OPLOGIC8 = new ClientGameProt(168, 1);
    static readonly ANTICHEAT_OPLOGIC9 = new ClientGameProt(88, 3);

    static readonly ANTICHEAT_CYCLELOGIC1 = new ClientGameProt(130, -1);
    static readonly ANTICHEAT_CYCLELOGIC2 = new ClientGameProt(154, -1);
    static readonly ANTICHEAT_CYCLELOGIC3 = new ClientGameProt(125, 1);
    static readonly ANTICHEAT_CYCLELOGIC4 = new ClientGameProt(137, 1);
    static readonly ANTICHEAT_CYCLELOGIC5 = new ClientGameProt(85, 0);
    static readonly ANTICHEAT_CYCLELOGIC6 = new ClientGameProt(255, 1);
    static readonly ANTICHEAT_CYCLELOGIC7 = new ClientGameProt(232, 0);

    static readonly OPOBJ1 = new ClientGameProt(97, 6);
    static readonly OPOBJ2 = new ClientGameProt(4, 6);
    static readonly OPOBJ3 = new ClientGameProt(110, 6);
    static readonly OPOBJ4 = new ClientGameProt(147, 6);
    static readonly OPOBJ5 = new ClientGameProt(22, 6);
    static readonly OPOBJT = new ClientGameProt(241, 8);
    static readonly OPOBJU = new ClientGameProt(55, 12);

    static readonly OPNPC1 = new ClientGameProt(252, 2);
    static readonly OPNPC2 = new ClientGameProt(21, 2);
    static readonly OPNPC3 = new ClientGameProt(178, 2);
    static readonly OPNPC4 = new ClientGameProt(30, 2);
    static readonly OPNPC5 = new ClientGameProt(247, 2);
    static readonly OPNPCT = new ClientGameProt(108, 4);
    static readonly OPNPCU = new ClientGameProt(160, 8);

    static readonly OPLOC1 = new ClientGameProt(10, 6);
    static readonly OPLOC2 = new ClientGameProt(45, 6);
    static readonly OPLOC3 = new ClientGameProt(196, 6);
    static readonly OPLOC4 = new ClientGameProt(53, 6);
    static readonly OPLOC5 = new ClientGameProt(126, 6);
    static readonly OPLOCT = new ClientGameProt(218, 8);
    static readonly OPLOCU = new ClientGameProt(184, 12);

    static readonly OPPLAYER1 = new ClientGameProt(220, 2);
    static readonly OPPLAYER2 = new ClientGameProt(51, 2);
    static readonly OPPLAYER3 = new ClientGameProt(13, 2);
    static readonly OPPLAYER4 = new ClientGameProt(189, 2);
    static readonly OPPLAYER5 = new ClientGameProt(69, 2);
    static readonly OPPLAYERT = new ClientGameProt(138, 4);
    static readonly OPPLAYERU = new ClientGameProt(16, 8);

    static readonly OPHELD1 = new ClientGameProt(76, 6);
    static readonly OPHELD2 = new ClientGameProt(177, 6);
    static readonly OPHELD3 = new ClientGameProt(40, 6);
    static readonly OPHELD4 = new ClientGameProt(191, 6);
    static readonly OPHELD5 = new ClientGameProt(79, 6);
    static readonly OPHELDT = new ClientGameProt(112, 8);
    static readonly OPHELDU = new ClientGameProt(200, 12);

    static readonly INV_BUTTON1 = new ClientGameProt(44, 6);
    static readonly INV_BUTTON2 = new ClientGameProt(111, 6);
    static readonly INV_BUTTON3 = new ClientGameProt(124, 6);
    static readonly INV_BUTTON4 = new ClientGameProt(248, 6);
    static readonly INV_BUTTON5 = new ClientGameProt(227, 6);

    static readonly IF_BUTTON = new ClientGameProt(86, 2);
    static readonly RESUME_PAUSEBUTTON = new ClientGameProt(166, 2);
    static readonly CLOSE_MODAL = new ClientGameProt(93, 0);
    static readonly RESUME_P_COUNTDIALOG = new ClientGameProt(180, 4);
    static readonly TUT_CLICKSIDE = new ClientGameProt(146, 1);

    static readonly MAP_BUILD_COMPLETE = new ClientGameProt(214, 0);
    static readonly MOVE_OPCLICK = new ClientGameProt(67, -1);
    static readonly REPORT_ABUSE = new ClientGameProt(94, 10); // todo: rename to SEND_SNAPSHOT
    static readonly MOVE_MINIMAPCLICK = new ClientGameProt(236, -1);
    static readonly INV_BUTTOND = new ClientGameProt(253, 7);
    static readonly IGNORELIST_DEL = new ClientGameProt(251, 8);
    static readonly IGNORELIST_ADD = new ClientGameProt(192, 8);
    static readonly IDK_SAVEDESIGN = new ClientGameProt(27, 13);
    static readonly CHAT_SETMODE = new ClientGameProt(161, 3);
    static readonly MESSAGE_PRIVATE = new ClientGameProt(107, -1);
    static readonly FRIENDLIST_DEL = new ClientGameProt(203, 8);
    static readonly FRIENDLIST_ADD = new ClientGameProt(235, 8);
    static readonly CLIENT_CHEAT = new ClientGameProt(34, -1);
    static readonly MESSAGE_PUBLIC = new ClientGameProt(156, -1);
    static readonly MOVE_GAMECLICK = new ClientGameProt(234, -1);

    constructor(
        readonly id: number,
        readonly length: number
    ) {
        ClientGameProt.byId[id] = this;
    }
}
