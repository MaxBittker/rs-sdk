import Packet from '#jagex2/io/Packet.js';
import { Bench } from 'tinybench';

const bench = new Bench();

const bitbuffer: Packet = Packet.alloc(40000);
bench.add('bitTest', (): void => {
    bitbuffer.bitPos = 0;

    for (let i: number = 0; i < 45714; i++) {
        bitbuffer.pBit(7, 100);
    }
});

await bench.warmup();
await bench.run();

console.table(bench.table());
