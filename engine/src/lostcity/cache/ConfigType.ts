import Packet from '#jagex2/io/Packet.js';

export abstract class ConfigType {
    readonly id: number;

    debugname: string | null = null;

    constructor(id: number) {
        this.id = id;
    }

    abstract decode(code: number, dat: Packet): void;

    decodeType(dat: Packet): void {
        while (dat.available > 0) {
            const code: number = dat.g1();
            if (code === 0) {
                break;
            }

            this.decode(code, dat);
        }
    }
}
