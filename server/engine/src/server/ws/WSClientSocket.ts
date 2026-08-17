import ClientSocket from '#/server/ClientSocket.js';

type RuntimeWebSocket = {
    send(data: Uint8Array): number | void;
    close(): void;
    terminate(): void;
};

// Rate-limited logging for dropped websocket sends (diagnosing silent outbound data loss)
let droppedSendCount = 0;
let lastDropLog = 0;

// rs-sdk: sockets with batched-but-unflushed output; World flushes them once per tick
const pendingFlush: Set<WSClientSocket> = new Set();

export default class WSClientSocket extends ClientSocket {
    socket: RuntimeWebSocket | null = null;

    // rs-sdk: outgoing game packets are coalesced into one websocket message per tick.
    // Upstream writes each packet with its own send(); on TCP the kernel coalesces that,
    // on websockets it is a frame + syscall per packet (~20 per player per tick), which
    // profiled at ~20% of the tick thread with ~1000 players. The client side reads the
    // socket as a byte stream (ClientStream queues frames), so framing is not observable.
    private pending: Uint8Array = new Uint8Array(4096);
    private pendingLen = 0;

    constructor() {
        super();
    }

    init(socket: RuntimeWebSocket, remoteAddress: string) {
        this.socket = socket;
        this.remoteAddress = remoteAddress;
    }

    send(src: Uint8Array): void {
        if (!this.socket) {
            return;
        }

        // login negotiation and non-player replies go straight out - they are single
        // small packets whose latency matters and nothing would flush them otherwise
        if (this.state !== 1 || !this.player) {
            this.sendNow(src);
            return;
        }

        if (this.pendingLen + src.length > this.pending.length) {
            let size = this.pending.length * 2;
            while (size < this.pendingLen + src.length) {
                size *= 2;
            }
            const grown = new Uint8Array(size);
            grown.set(this.pending.subarray(0, this.pendingLen));
            this.pending = grown;
        }
        this.pending.set(src, this.pendingLen);
        this.pendingLen += src.length;
        pendingFlush.add(this);
    }

    flush(): void {
        if (this.pendingLen === 0) {
            pendingFlush.delete(this);
            return;
        }
        const data = this.pending.subarray(0, this.pendingLen);
        this.pendingLen = 0;
        pendingFlush.delete(this);
        this.sendNow(data);
    }

    // flush every socket that batched output this tick; called by World once per cycle
    static flushAll(): void {
        for (const socket of pendingFlush) {
            socket.flush();
        }
    }

    private sendNow(src: Uint8Array): void {
        if (!this.socket) {
            return;
        }
        // Bun's ServerWebSocket.send returns a status: -1 = backpressure (enqueued),
        // 0 = DROPPED (connection closed/closing), >0 = bytes sent. Dropped sends were
        // previously silent - clients would hang on "Connecting to server..." or
        // "Loading - please wait." with no server-side trace.
        const result = this.socket.send(src);
        if (result === 0) {
            droppedSendCount++;
            const now = Date.now();
            if (now - lastDropLog > 5000) {
                lastDropLog = now;
                console.warn(`[WSClientSocket] send() dropped ${src.length} bytes to ${this.remoteAddress} (ws closed/closing; ${droppedSendCount} drops total)`);
            }
        }
    }

    close(): void {
        // deliver anything still batched (logout packet, login rejection) before closing
        this.flush();

        // give time to acknowledge and receive packets
        this.state = -1;

        setTimeout(() => {
            if (this.socket) {
                this.socket.close();
            }
        }, 1000);
    }

    // the peer is gone (ws close event) - nothing batched can be delivered any more
    discard(): void {
        this.pendingLen = 0;
        pendingFlush.delete(this);
    }

    terminate(): void {
        this.state = -1;
        this.discard();

        if (this.socket) {
            this.socket.terminate();
        }
    }
}
