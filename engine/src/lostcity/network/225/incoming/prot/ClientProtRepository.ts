import MessageDecoder from '#lostcity/network/incoming/codec/MessageDecoder.js';
import MessageHandler from '#lostcity/network/incoming/handler/MessageHandler.js'; 
import ClientProt from '#lostcity/network/225/incoming/prot/ClientProt.js';
import IncomingMessage from '#lostcity/network/incoming/IncomingMessage.js';
import ClientCheatDecoder from '#lostcity/network/225/incoming/codec/ClientCheatDecoder.js';
import CloseModalDecoder from '#lostcity/network/225/incoming/codec/CloseModalDecoder.js';
import IdleTimerDecoder from '#lostcity/network/225/incoming/codec/IdleTimerDecoder.js';
import IfButtonDecoder from '#lostcity/network/225/incoming/codec/IfButtonDecoder.js';
import IfPlayerDesignDecoder from '#lostcity/network/225/incoming/codec/IfPlayerDesignDecoder.js';
import InvButtonDecoder from '#lostcity/network/225/incoming/codec/InvButtonDecoder.js';
import InvButtonDDecoder from '#lostcity/network/225/incoming/codec/InvButtonDDecoder.js';
import MessagePrivateDecoder from '#lostcity/network/225/incoming/codec/MessagePrivateDecoder.js';
import MessagePublicDecoder from '#lostcity/network/225/incoming/codec/MessagePublicDecoder.js';
import OpHeldDecoder from '#lostcity/network/225/incoming/codec/OpHeldDecoder.js';
import OpHeldTDecoder from '#lostcity/network/225/incoming/codec/OpHeldTDecoder.js';
import OpHeldUDecoder from '#lostcity/network/225/incoming/codec/OpHeldUDecoder.js';
import OpLocDecoder from '#lostcity/network/225/incoming/codec/OpLocDecoder.js';
import OpLocTDecoder from '#lostcity/network/225/incoming/codec/OpLocTDecoder.js';
import OpLocUDecoder from '#lostcity/network/225/incoming/codec/OpLocUDecoder.js';
import OpNpcDecoder from '#lostcity/network/225/incoming/codec/OpNpcDecoder.js';
import OpNpcTDecoder from '#lostcity/network/225/incoming/codec/OpNpcTDecoder.js';
import OpNpcUDecoder from '#lostcity/network/225/incoming/codec/OpNpcUDecoder.js';
import OpObjDecoder from '#lostcity/network/225/incoming/codec/OpObjDecoder.js';
import OpObjTDecoder from '#lostcity/network/225/incoming/codec/OpObjTDecoder.js';
import OpObjUDecoder from '#lostcity/network/225/incoming/codec/OpObjUDecoder.js';
import OpPlayerDecoder from '#lostcity/network/225/incoming/codec/OpPlayerDecoder.js';
import OpPlayerTDecoder from '#lostcity/network/225/incoming/codec/OpPlayerTDecoder.js';
import OpPlayerUDecoder from '#lostcity/network/225/incoming/codec/OpPlayerUDecoder.js';
import RebuildGetMapsDecoder from '#lostcity/network/225/incoming/codec/RebuildGetMapsDecoder.js';
import ResumePauseButtonDecoder from '#lostcity/network/225/incoming/codec/ResumePauseButtonDecoder.js';
import ResumePCountDialogDecoder from '#lostcity/network/225/incoming/codec/ResumePCountDialogDecoder.js';
import TutorialClickSideDecoder from '#lostcity/network/225/incoming/codec/TutorialClickSideDecoder.js';
import InvButtonHandler from '../handler/InvButtonHandler.js';
import ClientCheatHandler from '#lostcity/network/225/incoming/handler/ClientCheatHandler.js';
import CloseModalHandler from '#lostcity/network/225/incoming/handler/CloseModalHandler.js';
import IdleTimerHandler from '#lostcity/network/225/incoming/handler/IdleTimerHandler.js';
import IfButtonHandler from '#lostcity/network/225/incoming/handler/IfButtonHandler.js';
import IfPlayerDesignHandler from '#lostcity/network/225/incoming/handler/IfPlayerDesignHandler.js';
import InvButtonDHandler from '#lostcity/network/225/incoming/handler/InvButtonDHandler.js';
import MessagePrivateHandler from '#lostcity/network/225/incoming/handler/MessagePrivateHandler.js';
import MessagePublicHandler from '#lostcity/network/225/incoming/handler/MessagePublicHandler.js';
import OpHeldHandler from '#lostcity/network/225/incoming/handler/OpHeldHandler.js';
import OpHeldTHandler from '#lostcity/network/225/incoming/handler/OpHeldTHandler.js';
import OpHeldUHandler from '#lostcity/network/225/incoming/handler/OpHeldUHandler.js';
import OpLocHandler from '#lostcity/network/225/incoming/handler/OpLocHandler.js';
import OpLocTHandler from '#lostcity/network/225/incoming/handler/OpLocTHandler.js';
import OpLocUHandler from '#lostcity/network/225/incoming/handler/OpLocUHandler.js';
import OpNpcHandler from '#lostcity/network/225/incoming/handler/OpNpcHandler.js';
import OpNpcTHandler from '#lostcity/network/225/incoming/handler/OpNpcTHandler.js';
import OpNpcUHandler from '#lostcity/network/225/incoming/handler/OpNpcUHandler.js';
import OpObjHandler from '#lostcity/network/225/incoming/handler/OpObjHandler.js';
import OpObjTHandler from '#lostcity/network/225/incoming/handler/OpObjTHandler.js';
import OpObjUHandler from '#lostcity/network/225/incoming/handler/OpObjUHandler.js';
import OpPlayerHandler from '#lostcity/network/225/incoming/handler/OpPlayerHandler.js';
import OpPlayerTHandler from '#lostcity/network/225/incoming/handler/OpPlayerTHandler.js';
import OpPlayerUHandler from '#lostcity/network/225/incoming/handler/OpPlayerUHandler.js';
import RebuildGetMapsHandler from '#lostcity/network/225/incoming/handler/RebuildGetMapsHandler.js';
import ResumePauseButtonHandler from '#lostcity/network/225/incoming/handler/ResumePauseButtonHandler.js';
import ResumePCountDialogHandler from '#lostcity/network/225/incoming/handler/ResumePCountDialogHandler.js';
import TutorialClickSideHandler from '#lostcity/network/225/incoming/handler/TutorialClickSideHandler.js';
import MoveClickDecoder from '#lostcity/network/225/incoming/codec/MoveClickDecoder.js';
import MoveClickHandler from '#lostcity/network/225/incoming/handler/MoveClickHandler.js';

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
        // this.bind(new FriendListAddDecoder(), new FriendListAddHandler());
        // this.bind(new FriendListDelDecoder(), new FriendListDelHandler());
        this.bind(new IdleTimerDecoder(), new IdleTimerHandler());
        this.bind(new IfButtonDecoder(), new IfButtonHandler());
        this.bind(new IfPlayerDesignDecoder(), new IfPlayerDesignHandler());
        // this.bind(new IgnoreListAddDecoder(), new IgnoreListAddHandler());
        // this.bind(new IgnoreListDelDecoder(), new IgnoreListDelHandler());
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
    }

    getDecoder(prot: ClientProt) {
        return this.decoders.get(prot.id);
    }

    getHandler(prot: ClientProt) {
        return this.handlers.get(prot.id);
    }
}

export default new ClientProtRepository();
