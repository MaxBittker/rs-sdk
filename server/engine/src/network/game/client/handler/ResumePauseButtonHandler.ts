import Player from '#/engine/entity/Player.js';
import ScriptState from '#/engine/script/ScriptState.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import ResumePauseButton from '#/network/game/client/model/ResumePauseButton.js';

export default class ResumePauseButtonHandler extends ClientGameMessageHandler<ResumePauseButton> {
    handle(_message: ResumePauseButton, player: Player): boolean {
        if (!player.activeScript || player.activeScript.execution !== ScriptState.PAUSEBUTTON) {
            return false;
        }

        // A pending choice (if_addresumebutton) must be answered with IF_BUTTON
        // on one of the registered options. Resuming here would resolve the
        // choice from the stale last_com — silently picking whatever option
        // the player clicked last (e.g. re-declining the Al Kharid toll).
        if (player.resumeButtons.length > 0) {
            return false;
        }

        player.executeScript(player.activeScript, true, true);
        return true;
    }
}
