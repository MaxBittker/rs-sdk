import Component from '#/cache/config/Component.js';
import Player from '#/engine/entity/Player.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ScriptState from '#/engine/script/ScriptState.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import IfButton from '#/network/game/client/model/IfButton.js';
import Environment from '#/util/Environment.js';

export default class IfButtonHandler extends ClientGameMessageHandler<IfButton> {
    handle(message: IfButton, player: Player): boolean {
        const { com: comId } = message;

        const com = Component.get(comId);
        if (typeof com === 'undefined' || com.buttonType === Component.NO_BUTTON) {
            // bad client: component is not acceptable for this packet
            return false;
        } else if (!player.isComponentVisible(com)) {
            // bad client or lag: component is not visible
            return false;
        }

        player.lastCom = comId;

        if (player.resumeButtons.indexOf(player.lastCom) !== -1) {
            if (player.activeScript && player.activeScript.execution === ScriptState.PAUSEBUTTON) {
                player.executeScript(player.activeScript, true, true);
            }
        } else {
            const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.IF_BUTTON, comId, -1);
            if (script) {
                const root = Component.get(com.rootLayer);
                player.executeScript(ScriptRunner.init(script, player), root.overlay == false);
            } else if (Environment.node.debug) {
                player.messageGame(`No trigger for [if_button,${com.comName}]`);
            }
        }

        return true;
    }
}
