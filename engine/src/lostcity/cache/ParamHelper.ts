import Packet from '#jagex2/io/Packet.js';

export type ParamMap = Map<number, number | string>;

export interface ParamHolder {
    params: ParamMap | null;
}

export const ParamHelper = {
    getStringParam: function (id: number, holder: ParamHolder, defaultValue: string | null): string {
        const value = holder.params?.get(id);
        if (typeof value !== 'string') {
            return defaultValue ?? 'null';
        }
        return value;
    },

    getIntParam: function (id: number, holder: ParamHolder, defaultValue: number): number {
        const value = holder.params?.get(id);
        if (typeof value !== 'number') {
            return defaultValue;
        }
        return value;
    },

    decodeParams: function (packet: Packet): Map<number, number | string> {
        const count = packet.g1();
        const params = new Map<number, number | string>();
        for (let i = 0; i < count; i++) {
            const key = packet.g3();
            const isString = packet.gbool();

            if (isString) {
                params.set(key, packet.gjstr());
            } else {
                params.set(key, packet.g4s());
            }
        }
        return params;
    }
};
