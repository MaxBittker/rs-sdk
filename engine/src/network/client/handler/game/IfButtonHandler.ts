import Component from '#/cache/config/Component.js';
import Player from '#/engine/entity/Player.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ScriptState from '#/engine/script/ScriptState.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import IfButton from '#/network/client/model/game/IfButton.js';
import Environment from '#/util/Environment.js';

export default class IfButtonHandler extends MessageHandler<IfButton> {
    handle(message: IfButton, player: Player): boolean {
        const { component: comId } = message;

        const com = Component.get(comId);
        if (typeof com === 'undefined' || !player.isComponentVisible(com)) {
            return false;
        }

        player.lastCom = comId;

        if (player.resumeButtons.indexOf(player.lastCom) !== -1) {
            if (player.activeScript && player.activeScript.execution === ScriptState.PAUSEBUTTON) {
                player.executeScript(player.activeScript, true, true);
            }
        } else {
            const root = Component.get(com.rootLayer);

            const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.IF_BUTTON, comId, -1);
            if (script) {
                player.executeScript(ScriptRunner.init(script, player), root.overlay == false);
            } else if (Environment.NODE_DEBUG) {
                player.messageGame(`No trigger for [if_button,${com.comName}]`);
            }
        }

        return true;
    }
}
