import { parentPort } from 'worker_threads';

import LoggerClient from '#/server/logger/LoggerClient.js';
import Environment from '#/util/Environment.js';

const client = new LoggerClient();

if (!parentPort) throw new Error('This file must be run as a worker thread.');

parentPort.on('message', async msg => {
    try {
        if (!parentPort) throw new Error('This file must be run as a worker thread.');
        await handleRequests(parentPort, msg);
    } catch (err) {
        console.error(err);
    }
});

client.onMessage((opcode, data) => {
    parentPort!.postMessage({ opcode, data });
});

type ParentPort = {
    postMessage: (msg: any) => void;
};

async function handleRequests(_parentPort: ParentPort, msg: any) {
    const { type } = msg;

    switch (type) {
        case 'session_log': {
            if (Environment.logger.enabled) {
                const { logs } = msg;
                await client.sessionLog(logs);
            }
            break;
        }
        case 'wealth_event': {
            if (Environment.logger.enabled) {
                const { events } = msg;
                await client.wealthEvent(events);
            }
            break;
        }
        case 'report': {
            if (Environment.logger.enabled) {
                const { session_uuid, coord, offender, reason } = msg;
                await client.report(session_uuid, coord, offender, reason);
            }
            break;
        }
        case 'input_track': {
            if (Environment.logger.enabled) {
                const { session_uuid, timestamp, buf } = msg;
                await client.inputTrack(session_uuid, timestamp, buf);
            }
            break;
        }
        // todo: store session's packet traffic for analysis
        default:
            console.error('Unknown message type: ' + msg.type);
            break;
    }
}
