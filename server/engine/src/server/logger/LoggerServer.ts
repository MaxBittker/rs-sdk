import { WebSocket, WebSocketServer } from 'ws';

import { db, toDbDate } from '#/db/query.js';
import { SessionLog } from '#/engine/entity/tracking/SessionLog.js';
import { WealthTransactionEvent } from '#/engine/entity/tracking/WealthEvent.js';
import Environment from '#/util/Environment.js';
import { printInfo } from '#/util/Logger.js';

export default class LoggerServer {
    private server: WebSocketServer;

    constructor() {
        this.server = new WebSocketServer({ port: Environment.logger.port, host: '0.0.0.0' }, () => {
            printInfo(`Logger server listening on port ${Environment.logger.port}`);
        });

        this.server.on('connection', (socket: WebSocket) => {
            socket.on('message', async (data: Buffer) => {
                try {
                    const msg = JSON.parse(data.toString());
                    const { type } = msg;

                    switch (type) {
                        case 'session_log': {
                            const { logs } = msg;

                            const schemaLogs = logs.map((x: SessionLog) => ({
                                session_uuid: x.session_uuid,
                                timestamp: toDbDate(x.timestamp),
                                coord: x.coord,
                                event: x.event,
                                event_type: x.event_type
                            }));

                            await db.insertInto('session_log').values(schemaLogs).execute();
                            break;
                        }
                        case 'wealth_event': {
                            const { events } = msg;

                            const schemaEvents = events.map((x: WealthTransactionEvent) => ({
                                session_uuid: x.session_uuid,
                                timestamp: toDbDate(x.timestamp),
                                coord: x.coord,
                                event_type: x.event_type,

                                account_items: JSON.stringify(x.account_items),
                                account_value: x.account_value,

                                recipient_session: x.recipient_session,
                                recipient_items: x.recipient_items ? JSON.stringify(x.recipient_items) : null,
                                recipient_value: x.recipient_value
                            }));

                            await db.insertInto('session_wealth').values(schemaEvents).execute();
                            break;
                        }
                        case 'report': {
                            const { session_uuid, timestamp, coord, offender, reason } = msg;

                            await db
                                .insertInto('report')
                                .values({
                                    session_uuid,
                                    timestamp: toDbDate(timestamp),
                                    coord,
                                    offender,
                                    reason
                                })
                                .execute();

                            break;
                        }
                        case 'input_track': {
                            const { session_uuid, timestamp, buf } = msg;

                            await db
                                .insertInto('input_report')
                                .values({
                                    session_uuid,
                                    timestamp: toDbDate(timestamp),
                                    data: Buffer.from(buf, 'base64')
                                })
                                .execute();
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
