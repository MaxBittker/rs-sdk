import ClientStream from '#/io/ClientStream.js';

type WorkerRequest = {
    archive: number;
    file: number;
    data: Uint8Array | null;
    cycle: number;
    urgent: boolean;
};

type InitMessage = {
    type: 'init';
    versions: number[][];
    crcs: number[][];
    host: string;
    secured: boolean;
    ingame: boolean;
    dbEnabled: boolean;
};

type InboundMessage =
    | InitMessage
    | { type: 'stop' }
    | { type: 'setIngame'; ingame: boolean }
    | { type: 'request'; archive: number; file: number }
    | { type: 'prefetchPriority'; archive: number; file: number; priority: number; id?: number }
    | { type: 'prefetch'; archive: number; file: number }
    | { type: 'clearPrefetches' };

type CompletedMessage = {
    type: 'completed';
    archive: number;
    file: number;
    urgent: boolean;
    data: ArrayBuffer | null;
};

type OutboundMessage =
    | CompletedMessage
    | { type: 'message'; message: string }
    | { type: 'failCount'; failCount: number }
    | { type: 'ack'; id: number }
    | { type: 'error'; error: string };

type WorkerScope = {
    postMessage(message: OutboundMessage, transfer?: Transferable[]): void;
    addEventListener(type: 'message', listener: (event: MessageEvent<InboundMessage>) => void): void;
};

const worker = self as unknown as WorkerScope;

const CRC32_POLYNOMIAL = 0xedb88320;
const crctable = new Int32Array(256);

for (let i = 0; i < 256; i++) {
    let remainder = i;

    for (let bit = 0; bit < 8; bit++) {
        if ((remainder & 1) === 1) {
            remainder = (remainder >>> 1) ^ CRC32_POLYNOMIAL;
        } else {
            remainder >>>= 1;
        }
    }

    crctable[i] = remainder;
}

function getcrc(src: Uint8Array, offset: number, length: number): number {
    let crc = 0xffffffff;
    for (let i = offset; i < length; i++) {
        crc = (crc >>> 8) ^ crctable[(crc ^ src[i]) & 0xff];
    }
    return ~crc;
}

function asUint8Array(src: Uint8Array | Int8Array | ArrayBuffer): Uint8Array {
    if (src instanceof Uint8Array) {
        return src;
    }

    return src instanceof Int8Array ? new Uint8Array(src.buffer, src.byteOffset, src.byteLength) : new Uint8Array(src);
}

async function openDatabase(): Promise<IDBDatabase | null> {
    return await new Promise<IDBDatabase | null>((resolve): void => {
        const request = indexedDB.open('lostcity', 1);

        request.onsuccess = (): void => {
            resolve(request.result);
        };

        request.onupgradeneeded = (): void => {
            request.result.createObjectStore('cache');
        };

        request.onerror = (): void => {
            resolve(null);
        };
    });
}

async function read(db: IDBDatabase, archive: number, file: number): Promise<Uint8Array | undefined> {
    return await new Promise<Uint8Array | undefined>((resolve): void => {
        const transaction = db.transaction('cache', 'readonly');
        const store = transaction.objectStore('cache');
        const request: IDBRequest<Uint8Array | Int8Array | ArrayBuffer | undefined> = store.get(`${archive}.${file}`);

        request.onsuccess = (): void => {
            resolve(request.result ? asUint8Array(request.result) : undefined);
        };

        request.onerror = (): void => {
            resolve(undefined);
        };
    });
}

async function write(db: IDBDatabase, archive: number, file: number, src: Uint8Array | null): Promise<void> {
    if (src === null) {
        return;
    }

    await new Promise<void>((resolve): void => {
        const transaction = db.transaction('cache', 'readwrite');
        const store = transaction.objectStore('cache');
        const request = store.put(src, `${archive}.${file}`);

        request.onsuccess = (): void => {
            resolve();
        };

        request.onerror = (): void => {
            resolve();
        };
    });
}

class WorkerOnDemand {
    versions: number[][];
    crcs: number[][];
    priorities: number[][];
    topPriority: number = 0;
    running: boolean = true;
    active: boolean = false;
    ingame: boolean;
    db: IDBDatabase | null = null;
    host: string;
    secured: boolean;
    failCount: number = 0;
    urgentCount: number = 0;
    requestCount: number = 0;
    queue: WorkerRequest[] = [];
    missing: WorkerRequest[] = [];
    pending: WorkerRequest[] = [];
    prefetches: WorkerRequest[] = [];
    message: string = '';
    buf: Uint8Array = new Uint8Array(500);
    loadedPrefetchFiles: number = 0;
    totalPrefetchFiles: number = 0;
    partOffset: number = 0;
    partAvailable: number = 0;
    packetCycle: number = 0;
    noTimeoutCycle: number = 0;
    cycle: number = 0;
    socketOpenTime: number = -4000;
    current: WorkerRequest | null = null;
    stream: ClientStream | null = null;
    loopTimer: ReturnType<typeof setTimeout> | null = null;
    loopBusy: boolean = false;
    dbReady: Promise<void>;

    constructor(message: InitMessage) {
        this.versions = message.versions;
        this.crcs = message.crcs;
        this.priorities = message.versions.map((versions) => new Array(versions.length).fill(0));
        this.host = message.host;
        this.secured = message.secured;
        this.ingame = message.ingame;

        if (message.dbEnabled) {
            this.dbReady = openDatabase().then((db) => {
                this.db = db;
            });
        } else {
            this.dbReady = Promise.resolve();
        }

        this.schedule();
    }

    stop(): void {
        this.running = false;
        this.stream?.close();
        this.stream = null;
        this.db?.close();
        this.db = null;

        if (this.loopTimer) {
            clearTimeout(this.loopTimer);
            this.loopTimer = null;
        }
    }

    request(archive: number, file: number): void {
        if (!this.validFile(archive, file)) {
            return;
        }

        const req: WorkerRequest = {
            archive,
            file,
            data: null,
            cycle: 0,
            urgent: true
        };

        this.queue.push(req);
    }

    async prefetchPriority(archive: number, file: number, priority: number): Promise<void> {
        await this.dbReady;

        if (!this.db || !this.validFile(archive, file)) {
            return;
        }

        const data = await read(this.db, archive + 1, file);
        if (this.validate(data, this.crcs[archive][file], this.versions[archive][file])) {
            return;
        }

        this.priorities[archive][file] = priority;
        if (priority > this.topPriority) {
            this.topPriority = priority;
        }

        this.totalPrefetchFiles++;
    }

    async prefetch(archive: number, file: number): Promise<void> {
        await this.dbReady;

        if (!this.db || !this.validFile(archive, file) || this.priorities[archive][file] === 0 || this.topPriority === 0) {
            return;
        }

        this.prefetches.push({
            archive,
            file,
            data: null,
            cycle: 0,
            urgent: false
        });
    }

    private schedule(): void {
        if (!this.running) {
            return;
        }

        const delay = this.topPriority === 0 && this.db ? 50 : 20;
        this.loopTimer = setTimeout(() => this.tick(), delay);
    }

    private tick(): void {
        if (this.loopBusy) {
            this.schedule();
            return;
        }

        this.loopBusy = true;
        this.run()
            .catch((e: unknown) => {
                worker.postMessage({ type: 'error', error: e instanceof Error ? e.message : String(e) });
            })
            .finally(() => {
                this.loopBusy = false;
                this.schedule();
            });
    }

    private async run(): Promise<void> {
        if (!this.running) {
            return;
        }

        await this.dbReady;

        this.cycle++;
        this.active = true;

        for (let i = 0; i < 100 && this.active; i++) {
            this.active = false;

            await this.handleQueue();
            await this.handlePending();

            if (this.urgentCount === 0 && i >= 5) {
                break;
            }

            await this.handleExtra();

            if (this.stream) {
                await this.read();
            }
        }

        let loading = false;

        for (const req of this.pending) {
            if (req.urgent) {
                loading = true;
                req.cycle++;

                if (req.cycle > 50) {
                    req.cycle = 0;
                    await this.send(req);
                }
            }
        }

        if (!loading) {
            for (const req of this.pending) {
                loading = true;
                req.cycle++;

                if (req.cycle > 50) {
                    req.cycle = 0;
                    await this.send(req);
                }
            }
        }

        if (loading) {
            this.packetCycle++;

            if (this.packetCycle > 750) {
                this.stream?.close();
                this.stream = null;
                this.partAvailable = 0;
            }
        } else {
            this.packetCycle = 0;
            this.setMessage('');
        }

        if (this.ingame && this.stream && (this.topPriority > 0 || !this.db)) {
            this.noTimeoutCycle++;

            if (this.noTimeoutCycle > 500) {
                this.noTimeoutCycle = 0;

                this.buf[0] = 0;
                this.buf[1] = 0;
                this.buf[2] = 0;
                this.buf[3] = 10;

                try {
                    this.stream.write(this.buf, 4);
                } catch (_e) {
                    this.packetCycle = 5000;
                }
            }
        }
    }

    private async handleQueue(): Promise<void> {
        let req = this.queue.shift();

        while (req) {
            this.active = true;
            let data: Uint8Array | undefined;

            if (this.db) {
                data = await read(this.db, req.archive + 1, req.file);
            }

            if (!this.validate(data, this.crcs[req.archive][req.file], this.versions[req.archive][req.file])) {
                data = undefined;
            }

            if (!data) {
                this.missing.push(req);
            } else {
                req.data = data;
                this.complete(req);
            }

            req = this.queue.shift();
        }
    }

    private async handlePending(): Promise<void> {
        this.urgentCount = 0;
        this.requestCount = 0;

        for (const req of this.pending) {
            if (req.urgent) {
                this.urgentCount++;
            } else {
                this.requestCount++;
            }
        }

        while (this.urgentCount < 10) {
            const req = this.missing.shift();
            if (!req) {
                break;
            }

            if (this.priorities[req.archive][req.file] !== 0) {
                this.loadedPrefetchFiles++;
            }

            this.priorities[req.archive][req.file] = 0;
            this.pending.push(req);
            this.urgentCount++;
            await this.send(req);
            this.active = true;
        }
    }

    private async handleExtra(): Promise<void> {
        while (this.urgentCount === 0) {
            if (this.requestCount >= 10 || this.topPriority === 0) {
                return;
            }

            let extra = this.prefetches.shift();
            while (extra) {
                if (this.priorities[extra.archive][extra.file] !== 0) {
                    this.priorities[extra.archive][extra.file] = 0;
                    this.pending.push(extra);
                    await this.send(extra);
                    this.active = true;

                    if (this.loadedPrefetchFiles < this.totalPrefetchFiles) {
                        this.loadedPrefetchFiles++;
                    }

                    this.setMessage('Loading extra files - ' + ((this.loadedPrefetchFiles * 100 / this.totalPrefetchFiles) | 0) + '%');
                    this.requestCount++;

                    if (this.requestCount === 10) {
                        return;
                    }
                }

                extra = this.prefetches.shift();
            }

            for (let archive = 0; archive < 4; archive++) {
                const priorities = this.priorities[archive];
                const count = priorities.length;

                for (let file = 0; file < count; file++) {
                    if (priorities[file] === this.topPriority) {
                        priorities[file] = 0;

                        const req: WorkerRequest = {
                            archive,
                            file,
                            data: null,
                            cycle: 0,
                            urgent: false
                        };

                        this.pending.push(req);
                        await this.send(req);
                        this.active = true;

                        if (this.loadedPrefetchFiles < this.totalPrefetchFiles) {
                            this.loadedPrefetchFiles++;
                        }

                        this.setMessage('Loading extra files - ' + ((this.loadedPrefetchFiles * 100 / this.totalPrefetchFiles) | 0) + '%');
                        this.requestCount++;

                        if (this.requestCount === 10) {
                            return;
                        }
                    }
                }
            }

            this.topPriority--;
        }
    }

    private async read(): Promise<void> {
        if (!this.stream) {
            return;
        }

        try {
            const available = this.stream.available;

            if (this.partAvailable === 0 && available >= 6) {
                this.active = true;

                await this.stream.readBytes(this.buf, 0, 6);
                const archive = this.buf[0] & 0xff;
                const file = ((this.buf[1] & 0xff) << 8) + (this.buf[2] & 0xff);
                const size = ((this.buf[3] & 0xff) << 8) + (this.buf[4] & 0xff);
                const part = this.buf[5] & 0xff;

                this.current = null;

                let matched = false;
                for (const req of this.pending) {
                    if (req.archive === archive && req.file === file) {
                        this.current = req;
                        matched = true;
                    }

                    if (matched) {
                        req.cycle = 0;
                    }
                }

                if (this.current) {
                    this.packetCycle = 0;

                    if (size === 0) {
                        this.current.data = null;
                        this.complete(this.current);
                        this.current = null;
                    } else {
                        if (this.current.data === null && part === 0) {
                            this.current.data = new Uint8Array(size);
                        }

                        if (this.current.data === null && part !== 0) {
                            throw new Error('missing start of file');
                        }
                    }
                }

                this.partOffset = part * 500;
                this.partAvailable = 500;

                if (this.partAvailable > size - part * 500) {
                    this.partAvailable = size - part * 500;
                }
            }

            if (this.partAvailable > 0 && available >= this.partAvailable) {
                this.active = true;

                let dst = this.buf;
                let off = 0;

                if (this.current && this.current.data) {
                    dst = this.current.data;
                    off = this.partOffset;
                }

                await this.stream.readBytes(dst, off, this.partAvailable);

                if (this.partAvailable + this.partOffset >= dst.length && this.current) {
                    if (this.db) {
                        await write(this.db, this.current.archive + 1, this.current.file, dst);
                    }

                    this.complete(this.current);
                }

                this.partAvailable = 0;
            }
        } catch (_e) {
            this.stream?.close();
            this.stream = null;
            this.partAvailable = 0;
        }
    }

    private validate(src: Uint8Array | undefined, expectedCrc: number, expectedVersion: number): boolean {
        if (typeof src === 'undefined' || src.length < 2) {
            return false;
        }

        const trailerPos = src.length - 2;
        const version = ((src[trailerPos] & 0xff) << 8) + (src[trailerPos + 1] & 0xff);
        const crc = getcrc(src, 0, trailerPos);

        return version === expectedVersion && crc === expectedCrc;
    }

    private async send(req: WorkerRequest): Promise<void> {
        try {
            if (this.stream === null) {
                const now = performance.now();
                if (now - this.socketOpenTime < 4000) {
                    return;
                }

                this.socketOpenTime = now;
                this.stream = new ClientStream(await ClientStream.openSocket(this.host, this.secured));

                this.buf[0] = 15;
                this.stream.write(this.buf, 1);

                for (let i = 0; i < 8; i++) {
                    await this.stream.read();
                }

                this.packetCycle = 0;
            }

            this.buf[0] = req.archive;
            this.buf[1] = req.file >> 8;
            this.buf[2] = req.file;

            if (req.urgent) {
                this.buf[3] = 2;
            } else if (this.ingame) {
                this.buf[3] = 0;
            } else {
                this.buf[3] = 1;
            }

            this.stream.write(this.buf, 4);
            this.noTimeoutCycle = 0;
            this.setFailCount(-10000);
        } catch (_e) {
            this.stream?.close();
            this.stream = null;
            this.partAvailable = 0;
            this.setFailCount(this.failCount + 1);
        }
    }

    private complete(req: WorkerRequest): void {
        this.removePending(req);

        if (!req.urgent && req.archive === 3) {
            req.urgent = true;
            req.archive = 93;
        }

        if (req.urgent) {
            this.postCompleted(req);
        }
    }

    private postCompleted(req: WorkerRequest): void {
        if (req.data === null) {
            worker.postMessage({
                type: 'completed',
                archive: req.archive,
                file: req.file,
                urgent: req.urgent,
                data: null
            });
            return;
        }

        const data = req.data.byteOffset === 0 && req.data.byteLength === req.data.buffer.byteLength && req.data.buffer instanceof ArrayBuffer ? req.data : req.data.slice();
        const buffer = data.buffer as ArrayBuffer;
        worker.postMessage(
            {
                type: 'completed',
                archive: req.archive,
                file: req.file,
                urgent: req.urgent,
                data: buffer
            },
            [buffer]
        );
    }

    private removePending(req: WorkerRequest): void {
        const index = this.pending.indexOf(req);
        if (index !== -1) {
            this.pending.splice(index, 1);
        }
    }

    private validFile(archive: number, file: number): boolean {
        return archive >= 0 && archive < this.versions.length && file >= 0 && file < this.versions[archive].length && this.versions[archive][file] !== 0;
    }

    private setMessage(message: string): void {
        if (this.message === message) {
            return;
        }

        this.message = message;
        worker.postMessage({ type: 'message', message });
    }

    private setFailCount(failCount: number): void {
        if (this.failCount === failCount) {
            return;
        }

        this.failCount = failCount;
        worker.postMessage({ type: 'failCount', failCount });
    }
}

let onDemand: WorkerOnDemand | null = null;
let messageQueue: Promise<void> = Promise.resolve();

worker.addEventListener('message', (event: MessageEvent<InboundMessage>): void => {
    messageQueue = messageQueue
        .then(() => handleMessage(event.data))
        .catch((e: unknown) => {
            worker.postMessage({ type: 'error', error: e instanceof Error ? e.message : String(e) });
        });
});

async function handleMessage(message: InboundMessage): Promise<void> {
    if (message.type === 'init') {
        onDemand?.stop();
        onDemand = new WorkerOnDemand(message);
    } else if (message.type === 'stop') {
        onDemand?.stop();
        onDemand = null;
    } else if (message.type === 'setIngame') {
        if (onDemand) {
            onDemand.ingame = message.ingame;
        }
    } else if (message.type === 'request') {
        onDemand?.request(message.archive, message.file);
    } else if (message.type === 'prefetchPriority') {
        try {
            await onDemand?.prefetchPriority(message.archive, message.file, message.priority);
        } finally {
            if (typeof message.id === 'number') {
                worker.postMessage({ type: 'ack', id: message.id });
            }
        }
    } else if (message.type === 'prefetch') {
        await onDemand?.prefetch(message.archive, message.file);
    } else if (message.type === 'clearPrefetches') {
        if (onDemand) {
            onDemand.prefetches = [];
        }
    }
}
