import { parentPort } from 'worker_threads';

import FileStream from '#/io/FileStream.js';

type Priority = 0 | 1 | 2;

type OnDemandRequest = {
    type: 'request';
    clientId: string;
    archive: number;
    file: number;
    priority: Priority;
};

type OnDemandClientClosed = {
    type: 'client_closed';
    clientId: string;
};

type OnDemandReloadCache = {
    type: 'reload_cache';
};

type OnDemandMessage = OnDemandRequest | OnDemandClientClosed | OnDemandReloadCache;

type PendingRequest = {
    clientId: string;
    archive: number;
    file: number;
    priority: Priority;
    key: string;
    cancelled: boolean;
};

type ActiveResponse = {
    request: PendingRequest;
    data: Uint8Array | null;
    pos: number;
    part: number;
};

type ClientQueue = {
    clientId: string;
    queues: [PendingRequest[], PendingRequest[], PendingRequest[]];
    pendingByKey: Map<string, PendingRequest>;
    pendingCount: number;
    active: ActiveResponse | null;
    scheduled: boolean;
};

type ParentPort = {
    postMessage(msg: { type: 'chunk'; clientId: string; data: Uint8Array }, transferList: Array<ArrayBufferLike>): void;
    postMessage(msg: { type: 'close_client'; clientId: string }): void;
};

const MAX_PENDING_PER_CLIENT = 2048;
const MAX_BYTES_PER_CLIENT_SLICE = 8000;
const MAX_CHUNKS_PER_CLIENT_SLICE = 16;
const MAX_PUMP_MS = 8;

let cache = new FileStream('data/pack', false, true);
const clients: Map<string, ClientQueue> = new Map();
const roundRobin: string[] = [];

let pumpScheduled = false;

if (!parentPort) throw new Error('This file must be run as a worker thread.');

parentPort.on('message', (msg: OnDemandMessage) => {
    try {
        if (msg.type === 'client_closed') {
            deleteClient(msg.clientId);
            return;
        }

        if (msg.type === 'reload_cache') {
            reloadCache();
            return;
        }

        enqueue(msg);
    } catch (err) {
        console.error(err);
    }
});

function enqueue(msg: OnDemandRequest) {
    if (msg.archive < 0 || msg.archive > 3 || msg.priority < 0 || msg.priority > 2) {
        closeClient(msg.clientId);
        return;
    }

    const client = getClient(msg.clientId);
    const key = `${msg.archive}:${msg.file}`;

    if (client.active?.request.key === key) {
        return;
    }

    const existing = client.pendingByKey.get(key);
    if (existing) {
        if (existing.priority >= msg.priority) {
            return;
        }

        existing.cancelled = true;
        client.pendingCount--;
    }

    if (client.pendingCount >= MAX_PENDING_PER_CLIENT) {
        closeClient(msg.clientId);
        return;
    }

    const request: PendingRequest = {
        clientId: msg.clientId,
        archive: msg.archive,
        file: msg.file,
        priority: msg.priority,
        key,
        cancelled: false
    };

    client.queues[msg.priority].push(request);
    client.pendingByKey.set(key, request);
    client.pendingCount++;
    scheduleClient(client);
    schedulePump();
}

function reloadCache() {
    cache.close();
    cache = new FileStream('data/pack', false, true);
}

function getClient(clientId: string): ClientQueue {
    let client = clients.get(clientId);
    if (client) {
        return client;
    }

    client = {
        clientId,
        queues: [[], [], []],
        pendingByKey: new Map(),
        pendingCount: 0,
        active: null,
        scheduled: false
    };

    clients.set(clientId, client);
    return client;
}

function scheduleClient(client: ClientQueue) {
    if (client.scheduled) {
        return;
    }

    client.scheduled = true;
    roundRobin.push(client.clientId);
}

function schedulePump() {
    if (pumpScheduled) {
        return;
    }

    pumpScheduled = true;
    setImmediate(pump);
}

function pump() {
    pumpScheduled = false;

    const started = Date.now();
    let visitsRemaining = roundRobin.length;

    while (visitsRemaining-- > 0 && Date.now() - started < MAX_PUMP_MS) {
        const clientId = roundRobin.shift();
        if (!clientId) {
            break;
        }

        const client = clients.get(clientId);
        if (!client) {
            continue;
        }

        client.scheduled = false;
        serveClient(client);

        if (hasWork(client)) {
            scheduleClient(client);
        } else {
            clients.delete(client.clientId);
        }
    }

    if (roundRobin.length > 0) {
        schedulePump();
    }
}

function serveClient(client: ClientQueue) {
    let bytes = 0;
    let chunks = 0;

    while (bytes < MAX_BYTES_PER_CLIENT_SLICE && chunks < MAX_CHUNKS_PER_CLIENT_SLICE) {
        if (!client.active) {
            const request = nextRequest(client);
            if (!request) {
                return;
            }

            client.active = {
                request,
                data: cache.read(request.archive + 1, request.file),
                pos: 0,
                part: 0
            };
        }

        const packet = nextChunk(client.active);
        postChunk(client.clientId, packet);
        bytes += packet.length;
        chunks++;

        if (!client.active.data || client.active.pos >= client.active.data.length) {
            client.active = null;
        }
    }
}

function nextRequest(client: ClientQueue): PendingRequest | null {
    for (let priority = 2; priority >= 0; priority--) {
        const queue = client.queues[priority as Priority];

        while (queue.length > 0) {
            const request = queue.shift()!;
            if (request.cancelled) {
                continue;
            }

            client.pendingByKey.delete(request.key);
            client.pendingCount--;
            return request;
        }
    }

    return null;
}

function nextChunk(response: ActiveResponse): Uint8Array {
    const { request, data } = response;

    if (!data) {
        return encodeChunk(request.archive, request.file, 0, 0, null, 0, 0);
    }

    const remaining = Math.min(500, data.length - response.pos);
    const packet = encodeChunk(request.archive, request.file, data.length, response.part, data, response.pos, remaining);
    response.pos += remaining;
    response.part++;
    return packet;
}

function encodeChunk(archive: number, file: number, length: number, part: number, data: Uint8Array | null, offset: number, count: number): Uint8Array {
    const packet = new Uint8Array(6 + count);
    packet[0] = archive;
    packet[1] = file >> 8;
    packet[2] = file;
    packet[3] = length >> 8;
    packet[4] = length;
    packet[5] = part;

    if (data && count > 0) {
        packet.set(data.subarray(offset, offset + count), 6);
    }

    return packet;
}

function postChunk(clientId: string, data: Uint8Array) {
    (parentPort as ParentPort).postMessage(
        {
            type: 'chunk',
            clientId,
            data
        },
        [data.buffer]
    );
}

function hasWork(client: ClientQueue): boolean {
    return client.active !== null || client.pendingCount > 0;
}

function closeClient(clientId: string) {
    deleteClient(clientId);
    (parentPort as ParentPort).postMessage({
        type: 'close_client',
        clientId
    });
}

function deleteClient(clientId: string) {
    const client = clients.get(clientId);
    if (!client) {
        return;
    }

    client.pendingByKey.clear();
    client.queues[0] = [];
    client.queues[1] = [];
    client.queues[2] = [];
    client.pendingCount = 0;
    client.active = null;
    clients.delete(clientId);
}
