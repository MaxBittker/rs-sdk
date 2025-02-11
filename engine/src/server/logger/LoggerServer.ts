import { WebSocketServer } from 'ws';

import Environment from '#/util/Environment.js';
import { printInfo } from '#/util/Logger.js';
import { db, toDbDate } from '#/db/query.js';
import InputTrackingEvent from '#/engine/entity/tracking/InputEvent.js';

export default class LoggerServer {
    private server: WebSocketServer;

    constructor() {
        this.server = new WebSocketServer({ port: Environment.LOGGER_PORT, host: '0.0.0.0' }, () => {
            printInfo(`Logger server listening on port ${Environment.LOGGER_PORT}`);
        });

        this.server.on('connection', (socket: WebSocket) => {
            socket.on('message', async (data: Buffer) => {
                try {
                    const msg = JSON.parse(data.toString());
                    const { type } = msg;

                    switch (type) {
                        case 'session_log': {
                            const { world, profile, username, session_uuid, timestamp, coord, event, event_type } = msg;

                            const account = await db.selectFrom('account').where('username', '=', username).selectAll().executeTakeFirst();

                            if (!account) {
                                console.log(msg);
                            } else {
                                await db.insertInto('account_session').values({
                                    account_id: account.id,
                                    world,
                                    profile,
                                    session_uuid,

                                    timestamp: toDbDate(timestamp),
                                    coord,
                                    event,
                                    event_type
                                }).execute();
                            }

                            break;
                        }
                        case 'report': {
                            const { world, profile, username, timestamp, coord, offender, reason } = msg;

                            const account = await db.selectFrom('account').where('username', '=', username).selectAll().executeTakeFirstOrThrow();

                            await db.insertInto('report').values({
                                account_id: account.id,
                                world,
                                profile,

                                timestamp: toDbDate(timestamp),
                                coord,
                                offender,
                                reason
                            }).execute();

                            break;
                        }
                        case 'input_track': {
                            const { username, session_uuid, timestamp, coord, events } = msg;

                            const account = await db.selectFrom('account').where('username', '=', username).selectAll().executeTakeFirst();
                            if (!account) {
                                console.log(msg);
                            } else {
                                const report = await db.insertInto('input_report').values({
                                    account_id: account.id,
                                    session_uuid,
                                    timestamp: toDbDate(timestamp),
                                }).executeTakeFirst();
                                const values = events.map((e: InputTrackingEvent) => {
                                    return {
                                        input_report_id: report.insertId,
                                        input_type: e.type,
                                        seq: e.seq,
                                        delta: e.delta,
                                        coord: coord,
                                        mouse_x: e.mouseX,
                                        mouse_y: e.mouseY,
                                        key_code: e.keyPress
                                    };
                                });
                                await db.insertInto('input_report_event').values(values).execute();
                            }
                            break;
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            });

            socket.on('close', () => {});
            socket.on('error', () => {});
        });
    }
}
