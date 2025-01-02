import InternalClient from '#/server/InternalClient.js';

import Environment from '#/util/Environment.js';

export default class LoggerClient extends InternalClient {
    private nodeId = 0;

    constructor(nodeId: number) {
        super(Environment.LOGGER_HOST, Environment.LOGGER_PORT);

        this.nodeId = nodeId;
    }

    public async sessionLog(username: string, session_uuid: string, timestamp: number, coord: number, event: string, event_type: number) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'session_log',
            game: Environment.NODE_GAME,
            username,
            session_uuid,
            timestamp,
            coord,
            event,
            event_type
        }));
    }
}
