import ClientSocket from '#/server/ClientSocket.js';

type RuntimeWebSocket = {
    send(data: Uint8Array): number | void;
    close(): void;
    terminate(): void;
};

// Rate-limited logging for dropped websocket sends (diagnosing silent outbound data loss)
let droppedSendCount = 0;
let lastDropLog = 0;

export default class WSClientSocket extends ClientSocket {
    socket: RuntimeWebSocket | null = null;

    constructor() {
        super();
    }

    init(socket: RuntimeWebSocket, remoteAddress: string) {
        this.socket = socket;
        this.remoteAddress = remoteAddress;
    }

    send(src: Uint8Array): void {
        if (this.socket) {
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
    }

    close(): void {
        // give time to acknowledge and receive packets
        this.state = -1;

        setTimeout(() => {
            if (this.socket) {
                this.socket.close();
            }
        }, 1000);
    }

    terminate(): void {
        this.state = -1;

        if (this.socket) {
            this.socket.terminate();
        }
    }
}
