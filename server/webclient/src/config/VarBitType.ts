import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';

export default class VarBitType {
    static numDefinitions: number = 0;
    static list: VarBitType[] = [];

    basevar: number = -1;
    startbit: number = 0;
    endbit: number = 0;
    debugname: string = '';

    static init(config: JagFile): void {
        const dat: Packet = new Packet(config.read('varbit.dat'));

        this.numDefinitions = dat.g2();
        this.list = new Array(this.numDefinitions);

        for (let id: number = 0; id < this.numDefinitions; id++) {
            if (!this.list[id]) {
                this.list[id] = new VarBitType();
            }

            this.list[id].decode(dat);
        }

        if (dat.pos != dat.data.length) {
            console.log('varbit load mismatch');
        }
    }

    decode(dat: Packet): void {
        while (true) {
            const code = dat.g1();
            if (code === 0) {
                break;
            }

            if (code === 1) {
                this.basevar = dat.g2();
                this.startbit = dat.g1();
                this.endbit = dat.g1();
            } else if (code === 10) {
                this.debugname = dat.gjstr();
            } else {
                console.log('Error unrecognised config code: ', code);
            }
        }
    }
}
