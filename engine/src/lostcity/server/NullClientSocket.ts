import Packet from '#jagex2/io/Packet.js';

import ClientSocket from './ClientSocket.js';

export default class NullClientSocket extends ClientSocket {
    constructor() {
        super(null, '');
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
    }

    // close the connection gracefully
    close() {
        if (!this.socket) {
            return;
        }
    }

    // terminate the connection immediately
    terminate() {
        if (!this.socket) {
            return;
        }
    }

    reset() {
        this.inOffset = 0;
        this.inCount.fill(0);
    }

    get untilNextFlush() {
        return this.out.length - this.outOffset;
    }

    write(data: Packet) {
        const dataArray = data.data || data;

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

    writeImmediate(data: Uint8Array) {
        this.send(data);
    }

    flush() {
        if (this.outOffset) {
            // console.log('Flushing', this.out.slice(0, this.outOffset), this.outOffset);
            this.send(this.out.slice(0, this.outOffset));
            this.outOffset = 0;
        }
    }
}
