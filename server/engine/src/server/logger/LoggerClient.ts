import InternalClient from '#/server/InternalClient.js';
import Environment from '#/util/Environment.js';

export default class LoggerClient extends InternalClient {
    constructor() {
        super(Environment.logger.host, Environment.logger.port);
    }

    public async sessionLog(logs: string[]) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(
            JSON.stringify({
                type: 'session_log',
                world: Environment.node.id,
                profile: Environment.node.profile,
                logs
            })
        );
    }

    public async wealthEvent(events: string[]) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(
            JSON.stringify({
                type: 'wealth_event',
                world: Environment.node.id,
                profile: Environment.node.profile,
                events
            })
        );
    }

    public async report(session_uuid: string, coord: number, offender: string, reason: number) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(
            JSON.stringify({
                type: 'report',
                world: Environment.node.id,
                profile: Environment.node.profile,
                session_uuid,
                timestamp: Date.now(),
                coord,
                offender,
                reason
            })
        );
    }

    public async inputTrack(session_uuid: string, timestamp: number, buf: string) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(
            JSON.stringify({
                type: 'input_track',
                session_uuid,
                timestamp,
                buf
            })
        );
    }
}
