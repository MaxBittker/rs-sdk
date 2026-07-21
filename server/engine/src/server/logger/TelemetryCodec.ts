import { deflateRawSync, inflateRawSync } from 'zlib';

// Binary codec for player telemetry track segments. A segment is one player's
// consecutive samples (same session + ip), delta-encoded and deflated:
//   version byte
//   varint: sample count
//   varint: first sample epoch seconds, x, z, level, xp (absolute)
//   per remaining sample: varint dt, zigzag dx, dz, dlevel, dxp
// Deltas are tiny (a few tiles / a few hundred xp per 30s) and idle players
// produce runs of zeros, so this lands around 2-4 bytes per sample.

const SEGMENT_VERSION = 1;

export type TelemetrySample = {
    epoch: number; // unix seconds
    x: number;
    z: number;
    level: number;
    xp: number;
};

function pushVarint(out: number[], value: number) {
    if (value < 0 || !Number.isSafeInteger(value)) {
        throw new Error(`varint out of range: ${value}`);
    }
    while (value > 0x7f) {
        out.push((value & 0x7f) | 0x80);
        value = Math.floor(value / 128);
    }
    out.push(value);
}

function pushZigzag(out: number[], value: number) {
    pushVarint(out, value < 0 ? -value * 2 - 1 : value * 2);
}

class Reader {
    private pos = 0;

    constructor(private buf: Buffer) {}

    varint(): number {
        let value = 0;
        let shift = 1;
        for (;;) {
            const byte = this.buf[this.pos++];
            if (byte === undefined) {
                throw new Error('telemetry segment truncated');
            }
            value += (byte & 0x7f) * shift;
            if ((byte & 0x80) === 0) {
                return value;
            }
            shift *= 128;
        }
    }

    zigzag(): number {
        const raw = this.varint();
        return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
    }

    get done(): boolean {
        return this.pos >= this.buf.length;
    }
}

export function encodeSegment(samples: TelemetrySample[]): Buffer {
    if (samples.length === 0) {
        throw new Error('cannot encode empty segment');
    }

    const out: number[] = [SEGMENT_VERSION];
    pushVarint(out, samples.length);

    const first = samples[0];
    pushVarint(out, first.epoch);
    pushVarint(out, first.x);
    pushVarint(out, first.z);
    pushVarint(out, first.level);
    pushVarint(out, first.xp);

    let prev = first;
    for (let i = 1; i < samples.length; i++) {
        const s = samples[i];
        pushVarint(out, s.epoch - prev.epoch);
        pushZigzag(out, s.x - prev.x);
        pushZigzag(out, s.z - prev.z);
        pushZigzag(out, s.level - prev.level);
        pushZigzag(out, s.xp - prev.xp);
        prev = s;
    }

    return deflateRawSync(Buffer.from(out));
}

export function decodeSegment(data: Buffer): TelemetrySample[] {
    const buf = inflateRawSync(data);
    if (buf[0] !== SEGMENT_VERSION) {
        throw new Error(`unknown telemetry segment version: ${buf[0]}`);
    }

    const reader = new Reader(buf.subarray(1));
    const count = reader.varint();

    const samples: TelemetrySample[] = [];
    let prev: TelemetrySample = {
        epoch: reader.varint(),
        x: reader.varint(),
        z: reader.varint(),
        level: reader.varint(),
        xp: reader.varint()
    };
    samples.push(prev);

    for (let i = 1; i < count; i++) {
        prev = {
            epoch: prev.epoch + reader.varint(),
            x: prev.x + reader.zigzag(),
            z: prev.z + reader.zigzag(),
            level: prev.level + reader.zigzag(),
            xp: prev.xp + reader.zigzag()
        };
        samples.push(prev);
    }

    return samples;
}
