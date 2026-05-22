import { gunzipSync } from 'fflate';

import type { Client } from '#/client/Client.js';

import LinkList2 from '#/datastruct/LinkList2.js';
import LinkList from '#/datastruct/LinkList.js';

import type JagFile from '#/io/JagFile.js';
import OnDemandProvider from '#/io/OnDemandProvider.js';
import OnDemandRequest from '#/io/OnDemandRequest.js';
import Packet from '#/io/Packet.js';

export default class OnDemand extends OnDemandProvider {
    versions: number[][] = [];
    crcs: number[][] = [];
    modelUse: number[] = [];
    mapIndex: number[] = [];
    mapLand: number[] = [];
    mapLoc: number[] = [];
    mapFree: number[] = [];
    animFrameIndex: number[] = [];
    midiJingle: number[] = [];
    running: boolean = true;
    app: Client;
    requests: LinkList2<OnDemandRequest> = new LinkList2();
    completed: LinkList<OnDemandRequest> = new LinkList();
    message: string = '';
    cycle: number = 0;
    failCount: number = 0;
    worker: Worker | null = null;
    private lastIngame: boolean = false;
    private workerMessageId: number = 0;
    private workerAcks: Map<number, () => void> = new Map();

    constructor(versionlist: JagFile, app: Client) {
        super();

        const version: string[] = ['model_version', 'anim_version', 'midi_version', 'map_version'];
        for (let i = 0; i < 4; i++) {
            const data = versionlist.read(version[i]);
            if (!data) {
                throw new Error();
            }

            const count = data.length / 2;
            const buf = new Packet(data);

            this.versions[i] = new Array(count);

            for (let j = 0; j < count; j++) {
                this.versions[i][j] = buf.g2();
            }
        }

        const crc: string[] = ['model_crc', 'anim_crc', 'midi_crc', 'map_crc'];
        for (let i = 0; i < 4; i++) {
            const data = versionlist.read(crc[i]);
            if (!data) {
                throw new Error();
            }

            const count = data.length / 4;
            const buf = new Packet(data);

            this.crcs[i] = new Array(count);

            for (let j = 0; j < count; j++) {
                this.crcs[i][j] = buf.g4();
            }
        }

        let data = versionlist.read('model_index');
        if (data) {
            const count = this.versions[0].length;
            this.modelUse = new Array(count);

            for (let i = 0; i < count; i++) {
                if (i < data.length) {
                    this.modelUse[i] = data[i];
                } else {
                    this.modelUse[i] = 0;
                }
            }
        }

        data = versionlist.read('map_index');
        if (data) {
            const count = data.length / 7;
            const buf = new Packet(data);

            this.mapIndex = new Array(count);
            this.mapLand = new Array(count);
            this.mapLoc = new Array(count);
            this.mapFree = new Array(count);

            for (let i = 0; i < count; i++) {
                this.mapIndex[i] = buf.g2();
                this.mapLand[i] = buf.g2();
                this.mapLoc[i] = buf.g2();
                this.mapFree[i] = buf.g1();
            }
        }

        data = versionlist.read('anim_index');
        if (data) {
            const count = data.length / 2;
            const buf = new Packet(data);

            this.animFrameIndex = new Array(count);
            for (let i = 0; i < count; i++) {
                this.animFrameIndex[i] = buf.g2();
            }
        }

        data = versionlist.read('midi_index');
        if (data) {
            const count = data.length;
            const buf = new Packet(data);

            this.midiJingle = new Array(count);
            for (let i = 0; i < count; i++) {
                this.midiJingle[i] = buf.g1();
            }
        }

        this.app = app;
        this.running = true;
        this.startWorker();
    }

    stop() {
        this.running = false;
        this.worker?.postMessage({ type: 'stop' });
        this.worker?.terminate();
        this.worker = null;
        for (const resolve of this.workerAcks.values()) {
            resolve();
        }
        this.workerAcks.clear();
    }

    getFileCount(archive: number) {
        return this.versions[archive].length;
    }

    getAnimFrameCount() {
        return this.animFrameIndex.length;
    }

    getMapFile(x: number, z: number, type: number) {
        const map = (x << 8) + z;

        for (let i = 0; i < this.mapIndex.length; i++) {
            if (this.mapIndex[i] === map) {
                if (type === 0) {
                    return this.mapLand[i];
                } else {
                    return this.mapLoc[i];
                }
            }
        }

        return -1;
    }

    async prefetchMaps(members: boolean) {
        const count = this.mapIndex.length;
        for (let i = 0; i < count; i++) {
            if (members || this.mapFree[i] !== 0) {
                await this.prefetchPriority(3, this.mapLoc[i], 2);
                await this.prefetchPriority(3, this.mapLand[i], 2);
            }
        }
    }

    hasMapLocFile(file: number) {
        for (let i = 0; i < this.mapIndex.length; i++) {
            if (this.mapLoc[i] === file) {
                return true;
            }
        }

        return false;
    }

    getModelUse(id: number) {
        return this.modelUse[id] & 0xFF;
    }

    isMidiJingle(id: number) {
        return this.midiJingle[id] === 1;
    }

    requestModel(id: number) {
        this.request(0, id);
    }

    request(archive: number, file: number) {
        if (archive < 0 || archive > this.versions.length || file < 0 || file > this.versions[archive].length || this.versions[archive][file] === 0) {
            return;
        }

        for (let req = this.requests.head(); req !== null; req = this.requests.next()) {
            if (req.archive === archive && req.file === file) {
                return;
            }
        }

        const req = new OnDemandRequest();
        req.archive = archive;
        req.file = file;
        req.urgent = true;

        this.requests.push(req);
        this.postWorker({
            type: 'request',
            archive,
            file
        });
    }

    remaining() {
        return this.requests.size();
    }

    loop(): OnDemandRequest | null {
        const req = this.completed.popFront();
        if (req === null) {
            return null;
        }

        req.unlink2();

        if (req.data === null) {
            return req;
        }

        req.data = gunzipSync(req.data.subarray(0, req.data.length - 2));
        return req;
    }

    async prefetchPriority(archive: number, file: number, priority: number) {
        if (!this.app.db || this.versions[archive][file] === 0) {
            return;
        }

        await this.postWorkerAck({
            type: 'prefetchPriority',
            archive,
            file,
            priority
        });
    }

    clearPrefetches() {
        this.postWorker({ type: 'clearPrefetches' });
    }

    prefetch(archive: number, file: number) {
        if (!this.app.db || this.versions[archive][file] === 0) {
            return;
        }

        this.postWorker({
            type: 'prefetch',
            archive,
            file
        });
    }

    async run() {
        if (!this.running) {
            return;
        }

        this.startWorker();
        this.cycle++;

        if (this.lastIngame !== this.app.ingame) {
            this.lastIngame = this.app.ingame;
            this.postWorker({
                type: 'setIngame',
                ingame: this.app.ingame
            });
        }
    }

    private startWorker(): void {
        if (this.worker) {
            return;
        }

        const worker = new Worker(new URL('./ondemandworker.js', import.meta.url), { type: 'module' });
        this.worker = worker;
        this.lastIngame = this.app.ingame;

        worker.onmessage = (event: MessageEvent): void => {
            const message = event.data as
                | { type: 'completed'; archive: number; file: number; urgent: boolean; data: ArrayBuffer | null }
                | { type: 'message'; message: string }
                | { type: 'failCount'; failCount: number }
                | { type: 'ack'; id: number }
                | { type: 'error'; error: string };

            if (message.type === 'completed') {
                this.receiveCompleted(message.archive, message.file, message.urgent, message.data);
            } else if (message.type === 'message') {
                this.message = message.message;
            } else if (message.type === 'failCount') {
                this.failCount = message.failCount;
            } else if (message.type === 'ack') {
                const resolve = this.workerAcks.get(message.id);
                if (resolve) {
                    this.workerAcks.delete(message.id);
                    resolve();
                }
            } else if (message.type === 'error') {
                console.error(message.error);
            }
        };

        worker.onerror = (event: ErrorEvent): void => {
            console.error(event.message);
            for (const resolve of this.workerAcks.values()) {
                resolve();
            }
            this.workerAcks.clear();
        };

        worker.postMessage({
            type: 'init',
            versions: this.versions,
            crcs: this.crcs,
            host: window.location.host,
            secured: window.location.protocol === 'https:',
            ingame: this.app.ingame,
            dbEnabled: !!this.app.db
        });
    }

    private postWorker(message: unknown): void {
        this.startWorker();
        this.worker?.postMessage(message);
    }

    private async postWorkerAck(message: Record<string, unknown>): Promise<void> {
        this.startWorker();

        await new Promise<void>((resolve): void => {
            const id = ++this.workerMessageId;
            this.workerAcks.set(id, resolve);
            this.worker?.postMessage({
                ...message,
                id
            });
        });
    }

    private receiveCompleted(archive: number, file: number, urgent: boolean, data: ArrayBuffer | null): void {
        let req = this.findRequest(archive, file);
        if (!req) {
            req = new OnDemandRequest();
        }

        req.archive = archive;
        req.file = file;
        req.urgent = urgent;
        req.data = data ? new Uint8Array(data) : null;

        this.completed.push(req);
    }

    private findRequest(archive: number, file: number): OnDemandRequest | null {
        for (let req = this.requests.head(); req !== null; req = this.requests.next()) {
            if (req.archive === archive && req.file === file) {
                return req;
            }
        }

        return null;
    }
}
