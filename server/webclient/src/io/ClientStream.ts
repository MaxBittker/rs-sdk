export default class ClientStream {
    private readonly socket: WebSocket;
    private readonly wsin: WebSocketReader;
    private readonly wsout: WebSocketWriter;

    private dummy: boolean = false;
    private remoteClosed: boolean = false;

    static async openSocket(host: string, secured: boolean): Promise<WebSocket> {
        return await new Promise<WebSocket>((resolve, reject): void => {
            const protocol: string = secured ? 'wss' : 'ws';
            const ws: WebSocket = new WebSocket(`${protocol}://${host}`, 'binary');

            ws.addEventListener('open', (): void => {
                resolve(ws);
            });

            ws.addEventListener('error', (): void => {
                reject(ws);
            });
        });
    }

    constructor(socket: WebSocket) {
        socket.onclose = this.onclose;
        socket.onerror = this.onerror;
        this.wsin = new WebSocketReader(socket, 30000);
        this.wsout = new WebSocketWriter(socket, 5000);
        this.socket = socket;
    }

    get host(): string {
        return this.socket.url.split('/')[2];
    }

    get port(): number {
        return parseInt(this.socket.url.split(':')[2], 10);
    }

    // note: Java throws IOException on failure
    get available(): number {
        if (this.dummy || this.remoteClosed) {
            return 0;
        }

        return this.wsin.available;
    }

    // note: Java throws IOException on failure
    write(src: Uint8Array, len: number): void {
        if (this.dummy || this.remoteClosed) {
            return;
        }

        this.wsout.write(src, len);
    }

    // note: Java throws IOException on failure
    async read(): Promise<number> {
        if (this.dummy) {
            return 0;
        }
        if (this.remoteClosed) {
            return -1;
        }

        return await this.wsin.read();
    }

    // note: Java throws IOException on failure
    async readBytes(dst: Uint8Array, off: number, len: number): Promise<void> {
        if (this.dummy) {
            return;
        }
        if (this.remoteClosed) {
            throw this.socket;
        }

        await this.wsin.readBytes(dst, off, len);
    }

    close(): void {
        if (this.dummy) {
            return;
        }

        this.dummy = true;
        this.socket.close();
        this.wsin.close();
        this.wsout.close();
    }

    private onclose = (_event: CloseEvent): void => {
        if (this.dummy) {
            return;
        }

        this.remoteClose();
    };

    private onerror = (_event: Event): void => {
        if (this.dummy) {
            return;
        }

        this.remoteClose();
    };

    private remoteClose(): void {
        this.remoteClosed = true;
        this.wsin.close();
        this.wsout.close();
    }
}

class WebSocketWriter {
    private readonly socket: WebSocket;
    private readonly limit: number;

    private closed: boolean = false;
    private ioerror: boolean = false;

    constructor(socket: WebSocket, limit: number) {
        this.socket = socket;
        this.limit = limit;
    }

    write(src: Uint8Array, len: number): void {
        if (this.closed) {
            return;
        }
        if (this.ioerror) {
            this.ioerror = false;
            throw this.socket;
        }
        if (len > this.limit - 100) {
            throw this.socket;
        }
        if (this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        try {
            this.socket.send(src.slice(0, len));
        } catch (_e) {
            this.ioerror = true;
        }
    }

    close(): void {
        this.closed = true;
    }

    fail(): void {
        this.ioerror = true;
    }
}

class WebSocketEvent {
    private readonly bytes: Uint8Array;
    private position: number;

    constructor(bytes: Uint8Array) {
        this.bytes = bytes;
        this.position = 0;
    }

    get available(): number {
        return this.bytes.length - this.position;
    }

    get read(): number {
        return this.bytes[this.position++];
    }

    get len(): number {
        return this.bytes.length;
    }

    readBytes(dst: Uint8Array, off: number, len: number): number {
        const count = Math.min(len, this.available);
        dst.set(this.bytes.subarray(this.position, this.position + count), off);
        this.position += count;
        return count;
    }
}

class WebSocketReader {
    private readonly timeoutMs: number;

    private queue: WebSocketEvent[] = [];
    private queueRead: number = 0;
    private event: WebSocketEvent | null = null;
    private callback: ((data: WebSocketEvent) => void) | null = null;
    private timeout: ReturnType<typeof setTimeout> | null = null;
    private rejectRead: (() => void) | null = null;
    private closed: boolean = false;
    private total: number = 0;

    constructor(socket: WebSocket, timeoutMs: number) {
        this.socket = socket;
        this.timeoutMs = timeoutMs;
        socket.binaryType = 'arraybuffer';
        socket.onmessage = this.onmessage;
    }

    private readonly socket: WebSocket;

    get available(): number {
        return this.total;
    }

    private onmessage = (e: MessageEvent): void => {
        if (this.closed) {
            return;
        }

        const event: WebSocketEvent = new WebSocketEvent(new Uint8Array(e.data));

        this.total += event.available;

        if (this.callback) {
            const cb = this.callback;
            this.callback = null;
            cb(event);
        } else {
            this.queue.push(event);
        }
    };

    async read(): Promise<number> {
        if (this.closed) {
            throw this.socket;
        }

        const event = this.nextEvent() ?? (await this.waitForEvent());
        this.total--;
        return event.read;
    }

    async readBytes(dst: Uint8Array, off: number, len: number): Promise<Uint8Array> {
        if (this.closed) {
            throw this.socket;
        }

        let remaining = len;
        let dstPos = off;

        while (remaining > 0) {
            const event = this.nextEvent() ?? (await this.waitForEvent());
            const count = event.readBytes(dst, dstPos, remaining);
            this.total -= count;
            dstPos += count;
            remaining -= count;
        }

        return dst;
    }

    close(): void {
        this.closed = true;
        this.callback = null;
        this.clearTimeout();
        this.rejectRead?.();
        this.rejectRead = null;
        this.event = null;
        this.queue = [];
        this.queueRead = 0;
    }

    fail(): void {
        this.closed = true;
        this.callback = null;
        this.clearTimeout();
        this.rejectRead?.();
        this.rejectRead = null;
    }

    private nextEvent(): WebSocketEvent | null {
        if (this.event && this.event.available > 0) {
            return this.event;
        }

        this.event = null;

        while (this.queueRead < this.queue.length) {
            const event = this.queue[this.queueRead++];
            if (event.available > 0) {
                this.event = event;
                this.compactQueue();
                return event;
            }
        }

        this.compactQueue();
        return null;
    }

    private compactQueue(): void {
        if (this.queueRead > 32 && this.queueRead * 2 > this.queue.length) {
            this.queue = this.queue.slice(this.queueRead);
            this.queueRead = 0;
        } else if (this.queueRead === this.queue.length) {
            this.queue = [];
            this.queueRead = 0;
        }
    }

    private async waitForEvent(): Promise<WebSocketEvent> {
        if (this.callback) {
            throw new Error();
        }

        return await new Promise<WebSocketEvent>((resolve, reject): void => {
            this.rejectRead = (): void => {
                this.callback = null;
                this.clearTimeout();
                reject(this.socket);
            };

            this.timeout = setTimeout((): void => {
                this.callback = null;
                this.timeout = null;
                this.rejectRead = null;
                reject(this.socket);
            }, this.timeoutMs);

            this.callback = (event: WebSocketEvent): void => {
                this.clearTimeout();
                this.rejectRead = null;
                this.event = event;
                resolve(event);
            };
        });
    }

    private clearTimeout(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }
}
