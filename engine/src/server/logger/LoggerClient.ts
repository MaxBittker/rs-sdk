import InputTrackingEvent from '#/engine/entity/tracking/InputEvent.js';
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
            world: Environment.NODE_ID,
            profile: Environment.NODE_PROFILE,
            username,
            session_uuid,
            timestamp,
            coord,
            event,
            event_type
        }));
    }

    public async report(username: string, coord: number, offender: string, reason: number) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'report',
            world: Environment.NODE_ID,
            profile: Environment.NODE_PROFILE,
            username,
            timestamp: Date.now(),
            coord,
            offender,
            reason
        }));
    }

    public async inputTrack(username: string, session_uuid: string, timestamp: number, coord: number, events: InputTrackingEvent[]) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'input_track',
            world: Environment.NODE_ID,
            profile: Environment.NODE_PROFILE,
            username,
            session_uuid,
            timestamp,
            coord,
            events
        }));
    }
}
