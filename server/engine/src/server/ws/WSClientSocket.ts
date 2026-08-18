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

    // rs-sdk: while World.processClientsOut() runs, outgoing packets are coalesced into one
    // websocket message per client (that phase writes ~20 packets per player per tick -
    // player/npc info, zones, invs, stats - and a frame + syscall each profiled at ~20% of
    // the tick thread with ~1000 players). Outside that phase - script replies, dialogs,
    // login/logout, anything mid-tick - packets go out immediately as before, so their
    // latency is unchanged. Clients read the socket as a byte stream (ClientStream queues
    // frames), so framing is not observable.
    static batching = false;
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

        if (!WSClientSocket.batching || this.state !== 1 || !this.player) {
            // keep the stream in order: anything batched earlier goes first
            if (this.pendingLen > 0) {
                this.flush();
            }
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

    // World brackets processClientsOut() with these
    static beginBatch(): void {
        WSClientSocket.batching = true;
    }

    static endBatch(): void {
        WSClientSocket.batching = false;
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
