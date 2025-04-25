import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import ChatSetModeHandler from '#/network/client/handler/game/ChatSetModeHandler.js';
import ClientCheatHandler from '#/network/client/handler/game/ClientCheatHandler.js';
import CloseModalHandler from '#/network/client/handler/game/CloseModalHandler.js';
import EventTrackingHandler from '#/network/client/handler/game/EventTrackingHandler.js';
import FriendListAddHandler from '#/network/client/handler/game/FriendListAddHandler.js';
import FriendListDelHandler from '#/network/client/handler/game/FriendListDelHandler.js';
import IdleTimerHandler from '#/network/client/handler/game/IdleTimerHandler.js';
import IfButtonHandler from '#/network/client/handler/game/IfButtonHandler.js';
import IfPlayerDesignHandler from '#/network/client/handler/game/IfPlayerDesignHandler.js';
import IgnoreListAddHandler from '#/network/client/handler/game/IgnoreListAddHandler.js';
import IgnoreListDelHandler from '#/network/client/handler/game/IgnoreListDelHandler.js';
import InvButtonDHandler from '#/network/client/handler/game/InvButtonDHandler.js';
import InvButtonHandler from '#/network/client/handler/game/InvButtonHandler.js';
import MessagePrivateHandler from '#/network/client/handler/game/MessagePrivateHandler.js';
import MessagePublicHandler from '#/network/client/handler/game/MessagePublicHandler.js';
import MoveClickHandler from '#/network/client/handler/game/MoveClickHandler.js';
import OpHeldHandler from '#/network/client/handler/game/OpHeldHandler.js';
import OpHeldTHandler from '#/network/client/handler/game/OpHeldTHandler.js';
import OpHeldUHandler from '#/network/client/handler/game/OpHeldUHandler.js';
import OpLocHandler from '#/network/client/handler/game/OpLocHandler.js';
import OpLocTHandler from '#/network/client/handler/game/OpLocTHandler.js';
import OpLocUHandler from '#/network/client/handler/game/OpLocUHandler.js';
import OpNpcHandler from '#/network/client/handler/game/OpNpcHandler.js';
import OpNpcTHandler from '#/network/client/handler/game/OpNpcTHandler.js';
import OpNpcUHandler from '#/network/client/handler/game/OpNpcUHandler.js';
import OpObjHandler from '#/network/client/handler/game/OpObjHandler.js';
import OpObjTHandler from '#/network/client/handler/game/OpObjTHandler.js';
import OpObjUHandler from '#/network/client/handler/game/OpObjUHandler.js';
import OpPlayerHandler from '#/network/client/handler/game/OpPlayerHandler.js';
import OpPlayerTHandler from '#/network/client/handler/game/OpPlayerTHandler.js';
import OpPlayerUHandler from '#/network/client/handler/game/OpPlayerUHandler.js';
import RebuildGetMapsHandler from '#/network/client/handler/game/RebuildGetMapsHandler.js';
import ReportAbuseHandler from '#/network/client/handler/game/ReportAbuseHandler.js';
import ResumePauseButtonHandler from '#/network/client/handler/game/ResumePauseButtonHandler.js';
import ResumePCountDialogHandler from '#/network/client/handler/game/ResumePCountDialogHandler.js';
import TutorialClickSideHandler from '#/network/client/handler/game/TutorialClickSideHandler.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import IncomingMessage from '#/network/client/IncomingMessage.js';
import ChatSetModeDecoder from '#/network/rs225/client/codec/game/ChatSetModeDecoder.js';
import ClientCheatDecoder from '#/network/rs225/client/codec/game/ClientCheatDecoder.js';
import CloseModalDecoder from '#/network/rs225/client/codec/game/CloseModalDecoder.js';
import EventTrackingDecoder from '#/network/rs225/client/codec/game/EventTrackingDecoder.js';
import FriendListAddDecoder from '#/network/rs225/client/codec/game/FriendListAddDecoder.js';
import FriendListDelDecoder from '#/network/rs225/client/codec/game/FriendListDelDecoder.js';
import IdleTimerDecoder from '#/network/rs225/client/codec/game/IdleTimerDecoder.js';
import IfButtonDecoder from '#/network/rs225/client/codec/game/IfButtonDecoder.js';
import IfPlayerDesignDecoder from '#/network/rs225/client/codec/game/IfPlayerDesignDecoder.js';
import IgnoreListAddDecoder from '#/network/rs225/client/codec/game/IgnoreListAddDecoder.js';
import IgnoreListDelDecoder from '#/network/rs225/client/codec/game/IgnoreListDelDecoder.js';
import InvButtonDDecoder from '#/network/rs225/client/codec/game/InvButtonDDecoder.js';
import InvButtonDecoder from '#/network/rs225/client/codec/game/InvButtonDecoder.js';
import MessagePrivateDecoder from '#/network/rs225/client/codec/game/MessagePrivateDecoder.js';
import MessagePublicDecoder from '#/network/rs225/client/codec/game/MessagePublicDecoder.js';
import MoveClickDecoder from '#/network/rs225/client/codec/game/MoveClickDecoder.js';
import OpHeldDecoder from '#/network/rs225/client/codec/game/OpHeldDecoder.js';
import OpHeldTDecoder from '#/network/rs225/client/codec/game/OpHeldTDecoder.js';
import OpHeldUDecoder from '#/network/rs225/client/codec/game/OpHeldUDecoder.js';
import OpLocDecoder from '#/network/rs225/client/codec/game/OpLocDecoder.js';
import OpLocTDecoder from '#/network/rs225/client/codec/game/OpLocTDecoder.js';
import OpLocUDecoder from '#/network/rs225/client/codec/game/OpLocUDecoder.js';
import OpNpcDecoder from '#/network/rs225/client/codec/game/OpNpcDecoder.js';
import OpNpcTDecoder from '#/network/rs225/client/codec/game/OpNpcTDecoder.js';
import OpNpcUDecoder from '#/network/rs225/client/codec/game/OpNpcUDecoder.js';
import OpObjDecoder from '#/network/rs225/client/codec/game/OpObjDecoder.js';
import OpObjTDecoder from '#/network/rs225/client/codec/game/OpObjTDecoder.js';
import OpObjUDecoder from '#/network/rs225/client/codec/game/OpObjUDecoder.js';
import OpPlayerDecoder from '#/network/rs225/client/codec/game/OpPlayerDecoder.js';
import OpPlayerTDecoder from '#/network/rs225/client/codec/game/OpPlayerTDecoder.js';
import OpPlayerUDecoder from '#/network/rs225/client/codec/game/OpPlayerUDecoder.js';
import RebuildGetMapsDecoder from '#/network/rs225/client/codec/game/RebuildGetMapsDecoder.js';
import ReportAbuseDecoder from '#/network/rs225/client/codec/game/ReportAbuseDecoder.js';
import ResumePauseButtonDecoder from '#/network/rs225/client/codec/game/ResumePauseButtonDecoder.js';
import ResumePCountDialogDecoder from '#/network/rs225/client/codec/game/ResumePCountDialogDecoder.js';
import TutorialClickSideDecoder from '#/network/rs225/client/codec/game/TutorialClickSideDecoder.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

class ClientProtRepository {
    decoders: Map<number, MessageDecoder<IncomingMessage>> = new Map();
    handlers: Map<number, MessageHandler<IncomingMessage>> = new Map();

    private bind(decoder: MessageDecoder<IncomingMessage>, handler?: MessageHandler<IncomingMessage>) {
        if (this.decoders.has(decoder.prot.id)) {
            throw new Error(`[ClientProtRepository] Already defines a ${decoder.prot.id}.`);
        }

        this.decoders.set(decoder.prot.id, decoder);

        if (handler) {
            this.handlers.set(decoder.prot.id, handler);
        }
    }

    constructor() {
        this.bind(new ClientCheatDecoder(), new ClientCheatHandler());
        this.bind(new CloseModalDecoder(), new CloseModalHandler());
        this.bind(new FriendListAddDecoder(), new FriendListAddHandler());
        this.bind(new FriendListDelDecoder(), new FriendListDelHandler());
        this.bind(new IdleTimerDecoder(), new IdleTimerHandler());
        this.bind(new IfButtonDecoder(), new IfButtonHandler());
        this.bind(new IfPlayerDesignDecoder(), new IfPlayerDesignHandler());
        this.bind(new IgnoreListAddDecoder(), new IgnoreListAddHandler());
        this.bind(new IgnoreListDelDecoder(), new IgnoreListDelHandler());
        this.bind(new InvButtonDecoder(ClientProt.INV_BUTTON1, 1), new InvButtonHandler());
        this.bind(new InvButtonDecoder(ClientProt.INV_BUTTON2, 2), new InvButtonHandler());
        this.bind(new InvButtonDecoder(ClientProt.INV_BUTTON3, 3), new InvButtonHandler());
        this.bind(new InvButtonDecoder(ClientProt.INV_BUTTON4, 4), new InvButtonHandler());
        this.bind(new InvButtonDecoder(ClientProt.INV_BUTTON5, 5), new InvButtonHandler());
        this.bind(new InvButtonDDecoder(), new InvButtonDHandler());
        this.bind(new MessagePrivateDecoder(), new MessagePrivateHandler());
        this.bind(new MessagePublicDecoder(), new MessagePublicHandler());
        this.bind(new MoveClickDecoder(ClientProt.MOVE_GAMECLICK), new MoveClickHandler());
        this.bind(new MoveClickDecoder(ClientProt.MOVE_OPCLICK), new MoveClickHandler());
        this.bind(new MoveClickDecoder(ClientProt.MOVE_MINIMAPCLICK), new MoveClickHandler());
        // this.bind(new NoTimeoutDecoder(), new NoTimeoutHandler());
        this.bind(new OpHeldDecoder(ClientProt.OPHELD1, 1), new OpHeldHandler());
        this.bind(new OpHeldDecoder(ClientProt.OPHELD2, 2), new OpHeldHandler());
        this.bind(new OpHeldDecoder(ClientProt.OPHELD3, 3), new OpHeldHandler());
        this.bind(new OpHeldDecoder(ClientProt.OPHELD4, 4), new OpHeldHandler());
        this.bind(new OpHeldDecoder(ClientProt.OPHELD5, 5), new OpHeldHandler());
        this.bind(new OpHeldTDecoder(), new OpHeldTHandler());
        this.bind(new OpHeldUDecoder(), new OpHeldUHandler());
        this.bind(new OpLocDecoder(ClientProt.OPLOC1, 1), new OpLocHandler());
        this.bind(new OpLocDecoder(ClientProt.OPLOC2, 2), new OpLocHandler());
        this.bind(new OpLocDecoder(ClientProt.OPLOC3, 3), new OpLocHandler());
        this.bind(new OpLocDecoder(ClientProt.OPLOC4, 4), new OpLocHandler());
        this.bind(new OpLocDecoder(ClientProt.OPLOC5, 5), new OpLocHandler());
        this.bind(new OpLocTDecoder(), new OpLocTHandler());
        this.bind(new OpLocUDecoder(), new OpLocUHandler());
        this.bind(new OpNpcDecoder(ClientProt.OPNPC1, 1), new OpNpcHandler());
        this.bind(new OpNpcDecoder(ClientProt.OPNPC2, 2), new OpNpcHandler());
        this.bind(new OpNpcDecoder(ClientProt.OPNPC3, 3), new OpNpcHandler());
        this.bind(new OpNpcDecoder(ClientProt.OPNPC4, 4), new OpNpcHandler());
        this.bind(new OpNpcDecoder(ClientProt.OPNPC5, 5), new OpNpcHandler());
        this.bind(new OpNpcTDecoder(), new OpNpcTHandler());
        this.bind(new OpNpcUDecoder(), new OpNpcUHandler());
        this.bind(new OpObjDecoder(ClientProt.OPOBJ1, 1), new OpObjHandler());
        this.bind(new OpObjDecoder(ClientProt.OPOBJ2, 2), new OpObjHandler());
        this.bind(new OpObjDecoder(ClientProt.OPOBJ3, 3), new OpObjHandler());
        this.bind(new OpObjDecoder(ClientProt.OPOBJ4, 4), new OpObjHandler());
        this.bind(new OpObjDecoder(ClientProt.OPOBJ5, 5), new OpObjHandler());
        this.bind(new OpObjTDecoder(), new OpObjTHandler());
        this.bind(new OpObjUDecoder(), new OpObjUHandler());
        this.bind(new OpPlayerDecoder(ClientProt.OPPLAYER1, 1), new OpPlayerHandler());
        this.bind(new OpPlayerDecoder(ClientProt.OPPLAYER2, 2), new OpPlayerHandler());
        this.bind(new OpPlayerDecoder(ClientProt.OPPLAYER3, 3), new OpPlayerHandler());
        this.bind(new OpPlayerDecoder(ClientProt.OPPLAYER4, 4), new OpPlayerHandler());
        this.bind(new OpPlayerTDecoder(), new OpPlayerTHandler());
        this.bind(new OpPlayerUDecoder(), new OpPlayerUHandler());
        this.bind(new RebuildGetMapsDecoder(), new RebuildGetMapsHandler());
        this.bind(new ResumePauseButtonDecoder(), new ResumePauseButtonHandler());
        this.bind(new ResumePCountDialogDecoder(), new ResumePCountDialogHandler());
        this.bind(new TutorialClickSideDecoder(), new TutorialClickSideHandler());
        this.bind(new ChatSetModeDecoder(), new ChatSetModeHandler());
        this.bind(new EventTrackingDecoder(), new EventTrackingHandler());
        this.bind(new ReportAbuseDecoder(), new ReportAbuseHandler());
    }

    getDecoder(prot: ClientProt) {
        return this.decoders.get(prot.id);
    }

    getHandler(prot: ClientProt) {
        return this.handlers.get(prot.id);
    }
}

export default new ClientProtRepository();
