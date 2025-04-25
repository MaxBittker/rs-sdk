import Player from '#/engine/entity/Player.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import CloseModal from '#/network/client/model/game/CloseModal.js';

export default class CloseModalHandler extends MessageHandler<CloseModal> {
    handle(_message: CloseModal, player: Player): boolean {
        // For whatever reason the modal is not closed directly here.
        // This was tested in osrs by sending close modal and being traded
        // on the same tick. If you have pid, the trade works. If the other
        // player has pid, they get told you are still busy.
        // Another test is to send close modal and open a new interface same
        // tick. In this case the new interface will also end up closed.
        player.requestModalClose = true;
        return true;
    }
}
