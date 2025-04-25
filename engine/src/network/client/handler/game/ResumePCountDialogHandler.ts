import Player from '#/engine/entity/Player.js';
import ScriptState from '#/engine/script/ScriptState.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import ResumePCountDialog from '#/network/client/model/game/ResumePCountDialog.js';

export default class ResumePCountDialogHandler extends MessageHandler<ResumePCountDialog> {
    handle(message: ResumePCountDialog, player: Player): boolean {
        const { input } = message;

        if (!player.activeScript || player.activeScript.execution !== ScriptState.COUNTDIALOG) {
            return false;
        }

        player.activeScript.lastInt = input;
        player.executeScript(player.activeScript, true, true);
        return true;
    }
}
