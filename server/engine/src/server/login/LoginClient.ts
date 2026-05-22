import InternalClient from '#/server/InternalClient.js';
import Environment from '#/util/Environment.js';

export class LoginClient extends InternalClient {
    private nodeId = 0;

    constructor(nodeId: number) {
        super(Environment.login.host, Environment.login.port);

        this.nodeId = nodeId;
    }

    public async worldStartup() {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(
            JSON.stringify({
                type: 'world_startup',
                nodeId: this.nodeId,
                nodeTime: Date.now(),
                profile: Environment.node.profile
            })
        );
    }

    public async playerLogin(username: string, password: string, uid: number, socket: string, remoteAddress: string, reconnecting: boolean, hasSave: boolean) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return { reply: -1, account_id: -1, save: null, muted_until: null, members: false };
        }

        const reply = await this.wsr.fetchSync({
            type: 'player_login',
            nodeId: this.nodeId,
            nodeTime: Date.now(),
            nodeMembers: Environment.node.members,
            profile: Environment.node.profile,

            socket,
            remoteAddress,
            uid,
            username,
            password,
            reconnecting,
            hasSave
        });

        if (reply.error) {
            return { reply: -1, account_id: -1, save: null, muted_until: null, members: false };
        }

        const { response, account_id, staffmodlevel, save, muted_until, members, messageCount, remaining } = reply.result;
        return {
            reply: response,
            account_id,
            staffmodlevel,
            save: save ? Buffer.from(save, 'base64') : null,
            muted_until,
            members,
            messageCount,
            remaining
        };
    }

    // returns true if the login server acknowledged the logout
    public async playerLogout(username: string, save: Uint8Array) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return false;
        }

        const reply = await this.wsr.fetchSync({
            type: 'player_logout',
            nodeId: this.nodeId,
            nodeTime: Date.now(),
            profile: Environment.node.profile,
            username,
            save: Buffer.from(save).toString('base64')
        });

        if (reply.error) {
            return false;
        }

        return reply.result.response === 0;
    }

    // we don't care about acknowledgement, send the save and continue on
    public async playerAutosave(username: string, save: Uint8Array) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(
            JSON.stringify({
                type: 'player_autosave',
                nodeId: this.nodeId,
                nodeTime: Date.now(),
                profile: Environment.node.profile,
                username,
                save: Buffer.from(save).toString('base64')
            })
        );
    }

    // in case the player is stuck logged-in
    public async playerForceLogout(username: string) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(
            JSON.stringify({
                type: 'player_force_logout',
                nodeId: this.nodeId,
                nodeTime: Date.now(),
                profile: Environment.node.profile,
                username
            })
        );
    }

    public async playerBan(staff: string, username: string, until: Date) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(
            JSON.stringify({
                type: 'player_ban',
                nodeId: this.nodeId,
                nodeTime: Date.now(),
                staff,
                username,
                until
            })
        );
    }

    public async playerMute(staff: string, username: string, until: Date) {
        await this.connect();

        if (!this.ws || !this.wsr || !this.wsr.checkIfWsLive()) {
            return;
        }

        this.ws.send(
            JSON.stringify({
                type: 'player_mute',
                nodeId: this.nodeId,
                nodeTime: Date.now(),
                staff,
                username,
                until
            })
        );
    }
}
