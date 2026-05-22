import AnimBase, { AnimTransform } from '#/dash3d/AnimBase.js';

import Packet from '#/io/Packet.js';

export default class AnimFrame {
    static list: AnimFrame[] = [];

    delay: number = -1;
    base: AnimBase | null = null;
    size: number = 0;
    ti: Int32Array | null = null; // transform index
    tx: Int32Array | null = null; // transform x
    ty: Int32Array | null = null; // transform y
    tz: Int32Array | null = null; // transform z

    static opaque: boolean[] = [];

    static init(total: number) {
        this.list = new Array(total + 1);
        this.opaque = new Array(total + 1);
        for (let i = 0; i < total + 1; i++) {
            this.opaque[i] = true;
        }
    }

    static unpack(data: Uint8Array) {
        const buf = new Packet(data);
        buf.pos = data.length - 8;

        const headLength = buf.g2();
        const tran1Length = buf.g2();
        const tran2Length = buf.g2();
        const delLength = buf.g2();
        let pos = 0;

        const head = new Packet(data);
        head.pos = pos;
        pos += headLength + 2;

        const tran1 = new Packet(data);
        tran1.pos = pos;
        pos += tran1Length;

        const tran2 = new Packet(data);
        tran2.pos = pos;
        pos += tran2Length;

        const del = new Packet(data);
        del.pos = pos;
        pos += delLength;

        const baseBuf = new Packet(data);
        baseBuf.pos = pos;
        const base = new AnimBase(baseBuf);

        const total = head.g2();
        const tempTi: Int32Array = new Int32Array(500);
        const tempTx: Int32Array = new Int32Array(500);
        const tempTy: Int32Array = new Int32Array(500);
        const tempTz: Int32Array = new Int32Array(500);

        for (let i: number = 0; i < total; i++) {
            const id: number = head.g2();

            const frame: AnimFrame = (this.list[id] = new AnimFrame());
            frame.delay = del.g1();
            frame.base = base;

            const groupCount: number = head.g1();
            let lastGroup: number = -1;
            let current: number = 0;

            for (let j: number = 0; j < groupCount; j++) {
                if (!base.type) {
                    throw new Error();
                }

                const flags: number = tran1.g1();
                if (flags > 0) {
                    if (base.type[j] !== 0) {
                        for (let group: number = j - 1; group > lastGroup; group--) {
                            if (base.type[group] === 0) {
                                tempTi[current] = group;
                                tempTx[current] = 0;
                                tempTy[current] = 0;
                                tempTz[current] = 0;
                                current++;
                                break;
                            }
                        }
                    }

                    tempTi[current] = j;

                    let defaultValue: number = 0;
                    if (base.type[tempTi[current]] === AnimTransform.SCALE) {
                        defaultValue = 128;
                    }

                    if ((flags & 0x1) === 0) {
                        tempTx[current] = defaultValue;
                    } else {
                        tempTx[current] = tran2.gsmarts();
                    }

                    if ((flags & 0x2) === 0) {
                        tempTy[current] = defaultValue;
                    } else {
                        tempTy[current] = tran2.gsmarts();
                    }

                    if ((flags & 0x4) === 0) {
                        tempTz[current] = defaultValue;
                    } else {
                        tempTz[current] = tran2.gsmarts();
                    }

                    lastGroup = j;
                    current++;

                    if (base.type[j] === AnimTransform.TRANSPARENCY) {
                        this.opaque[id] = false;
                    }
                }
            }

            frame.size = current;
            frame.ti = new Int32Array(current);
            frame.tx = new Int32Array(current);
            frame.ty = new Int32Array(current);
            frame.tz = new Int32Array(current);

            for (let j: number = 0; j < current; j++) {
                frame.ti[j] = tempTi[j];
                frame.tx[j] = tempTx[j];
                frame.ty[j] = tempTy[j];
                frame.tz[j] = tempTz[j];
            }
        }
    }

    static get(id: number) {
        return AnimFrame.list[id];
    }

    static animateTransparencies(frame: number) {
        return frame === -1;
    }
}
