import { parentPort } from 'worker_threads';

import LoggerClient from '#/server/logger/LoggerClient.js';

import Environment from '#/util/Environment.js';

const client = new LoggerClient(Environment.NODE_ID);

if (Environment.STANDALONE_BUNDLE) {
    self.onmessage = async msg => {
        try {
            await handleRequests(self, msg.data);
        } catch (err) {
            console.error(err);
        }
    };

    client.onMessage((opcode, data) => {
        self.postMessage({ opcode, data });
    });
} else {
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
}

type ParentPort = {
    postMessage: (msg: any) => void;
};

async function handleRequests(_parentPort: ParentPort, msg: any) {
    const { type } = msg;

    switch (type) {
        case 'session_log': {
            if (Environment.LOGGER_SERVER) {
                // todo: batch up logs, cache account->username queries
                const { username, session_uuid, timestamp, coord, event, event_type } = msg;
                await client.sessionLog(username, session_uuid, timestamp, coord, event, event_type);
            }
            break;
        }
        case 'report': {
            if (Environment.LOGGER_SERVER) {
                const { username, coord, offender, reason } = msg;
                await client.report(username, coord, offender, reason);
            }
            break;
        }
        case 'input_track': {
            if (Environment.LOGGER_SERVER) {
                const { username, session_uuid, timestamp, coord, events } = msg;
                await client.inputTrack(username, session_uuid, timestamp, coord, events);
            }
            break;
        }
        // todo: store session's packet traffic for analysis
        default:
            console.error('Unknown message type: ' + msg.type);
            break;
    }
}
