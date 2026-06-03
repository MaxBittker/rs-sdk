import FileStream from '#/io/FileStream.js';
import Packet from '#/io/Packet.js';
import ClientSocket from '#/server/ClientSocket.js';

import { Worker } from 'worker_threads';

type OnDemandRequest = {
    type: 'request';
    clientId: string;
    archive: number;
    file: number;
    priority: number;
};

type OnDemandClientClosed = {
    type: 'client_closed';
    clientId: string;
};

type OnDemandReloadCache = {
    type: 'reload_cache';
};

type OnDemandWorkerMessage =
    | {
          type: 'chunk';
          clientId: string;
          data: Uint8Array;
      }
    | {
          type: 'close_client';
          clientId: string;
      };

type OnDemandWorkerRequest = OnDemandRequest | OnDemandClientClosed | OnDemandReloadCache;

type WorkerWithTransfers = Worker & {
    postMessage(value: OnDemandWorkerRequest): void;
};

class OnDemand {
    cache = new FileStream('data/pack');

    private worker: WorkerWithTransfers | null = null;
    private clients: Map<string, ClientSocket> = new Map();
    private restarting: NodeJS.Timeout | null = null;

    cycle() {
        this.startWorker();
    }

    reloadCache() {
        this.cache.close();
        this.cache = new FileStream('data/pack');
        this.worker?.postMessage({
            type: 'reload_cache'
        });
    }

    onClientData(client: ClientSocket) {
        if (client.state !== 2) {
            return;
        }

        if (client.available < 4) {
            return;
        }

        const buf = Packet.alloc(0);
        while (client.available >= 4) {
            client.read(buf.data, 0, 4);
            buf.pos = 0;

            const archive = buf.g1();
            const file = buf.g2();
            const priority = buf.g1();

            if (archive > 3 || priority > 2) {
                client.close();
                return;
            }

            this.queue(client, archive, file, priority);
        }
    }

    private queue(client: ClientSocket, archive: number, file: number, priority: number) {
        const worker = this.startWorker();
        if (!worker) {
            return;
        }

        this.clients.set(client.uuid, client);
        worker.postMessage({
            type: 'request',
            clientId: client.uuid,
            archive,
            file,
            priority
        });
    }

    private startWorker(): WorkerWithTransfers | null {
        if (this.worker) {
            return this.worker;
        }

        const worker = new Worker(new URL('./OnDemandThread.ts', import.meta.url)) as WorkerWithTransfers;
        this.worker = worker;

        worker.on('message', (msg: OnDemandWorkerMessage) => this.onWorkerMessage(msg));
        worker.on('error', err => {
            console.error('OnDemand worker error:', err);
        });
        worker.on('exit', code => {
            this.worker = null;

            if (code === 0 || this.restarting) {
                return;
            }

            console.error(`OnDemand worker exited with code ${code}; restarting shortly.`);
            this.restarting = setTimeout(() => {
                this.restarting = null;
                this.startWorker();
            }, 1000);
        });

        return worker;
    }

    private onWorkerMessage(msg: OnDemandWorkerMessage) {
        const client = this.clients.get(msg.clientId);
        if (!client || client.state !== 2) {
            this.clients.delete(msg.clientId);
            this.worker?.postMessage({
                type: 'client_closed',
                clientId: msg.clientId
            });
            return;
        }

        if (msg.type === 'close_client') {
            client.close();
            this.clients.delete(msg.clientId);
            this.worker?.postMessage({
                type: 'client_closed',
                clientId: msg.clientId
            });
            return;
        }

        client.send(msg.data);
    }
}

export default new OnDemand();
