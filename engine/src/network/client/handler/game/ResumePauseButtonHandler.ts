import Player from '#/engine/entity/Player.js';
import ScriptState from '#/engine/script/ScriptState.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import ResumePauseButton from '#/network/client/model/game/ResumePauseButton.js';

export default class ResumePauseButtonHandler extends MessageHandler<ResumePauseButton> {
    handle(_message: ResumePauseButton, player: Player): boolean {
        if (!player.activeScript || player.activeScript.execution !== ScriptState.PAUSEBUTTON) {
            return false;
        }

        player.executeScript(player.activeScript, true, true);
        return true;
    }
}
