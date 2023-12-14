import { Socket } from 'net';
import { WebSocket } from 'ws';

import Isaac from '#jagex2/io/Isaac.js';
import Packet from '#jagex2/io/Packet.js';

import Player from '#lostcity/entity/Player.js';

export default class ClientSocket {
    static TCP = 0;
    static WEBSOCKET = 1;

    socket: Socket | WebSocket;
    type = -1;
    state = -1;
    remoteAddress: string;
    totalBytesRead = 0;
    totalBytesWritten = 0;

    encryptor: Isaac | null = null;
    decryptor: Isaac | null = null;

    // we only want to receive 5KB per tick to mitigate bad actors
    in = new Uint8Array(5000);
    inOffset = 0;

    // we limit the amount of packets we receive per opcode (no more than 10) to mitigate bad actors
    inCount = new Uint8Array(256);

    // packets are flushed in up to 5KB chunks
    out = new Uint8Array(5000);
    outOffset = 0;

    player: Player | null = null;

    constructor(socket: Socket | WebSocket, remoteAddress: string, type = ClientSocket.TCP, state = -1) {
        this.socket = socket;
        this.remoteAddress = remoteAddress;
        this.type = type;
        this.state = state;
    }
    
    isTCP() {
        return this.type === ClientSocket.TCP;
    }

    isWebSocket() {
        return this.type === ClientSocket.WEBSOCKET;
    }

    send(data: Uint8Array) {
        if (!this.socket) {
            return;
        }

        this.totalBytesWritten += data.length;
        if (this.isTCP()) {
            (this.socket as Socket).write(data);
        } else if (this.isWebSocket()) {
            (this.socket as WebSocket).send(data);
        }
    }

    // close the connection gracefully
    close() {
        if (!this.socket) {
            return;
        }

        // TODO: revisit this to make sure no overflow attacks can be done
        setTimeout(() => {
            if (this.isTCP()) {
                (this.socket as Socket).end();
            } else if (this.isWebSocket()) {
                (this.socket as WebSocket).close();
            }
        }, 10);
    }

    // terminate the connection immediately
    terminate() {
        if (!this.socket) {
            return;
        }

        if (this.isTCP()) {
            (this.socket as Socket).destroy();
        } else if (this.isWebSocket()) {
            (this.socket as WebSocket).terminate();
        }
    }

    reset() {
        this.inOffset = 0;
        this.inCount.fill(0);
    }

    get untilNextFlush() {
        return this.out.length - this.outOffset;
    }

    write(data: Packet | Uint8Array) {
        const dataArray = (data as Packet).data || data;

        let offset = 0;
        let remaining = dataArray.length;

        // pack as much data as we can into a single 5kb chunk, then flush and repeat
        while (remaining > 0) {
            const untilNextFlush = this.out.length - this.outOffset;

            if (remaining > untilNextFlush) {
                this.out.set(dataArray.slice(offset, offset + untilNextFlush), this.outOffset);
                this.outOffset += untilNextFlush;
                this.flush();
                offset += untilNextFlush;
                remaining -= untilNextFlush;
            } else {
                this.out.set(dataArray.slice(offset, offset + remaining), this.outOffset);
                this.outOffset += remaining;
                offset += remaining;
                remaining = 0;
            }
        }
    }

    writeNaive(data: Uint8Array) {
        if (this.outOffset + data.length > this.out.length) {
            this.flush();
        }

        this.out.set(data, this.outOffset);
        this.outOffset += data.length;
    }

    flush() {
        if (this.outOffset) {
            // console.log('Flushing', this.out.slice(0, this.outOffset), this.outOffset);
            this.send(this.out.slice(0, this.outOffset));
            this.outOffset = 0;
        }
    }
}
