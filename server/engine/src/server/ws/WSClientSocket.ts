import ClientSocket from '#/server/ClientSocket.js';

type RuntimeWebSocket = {
    send(data: Uint8Array): void;
    close(): void;
    terminate(): void;
};

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
            this.socket.send(src);
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
