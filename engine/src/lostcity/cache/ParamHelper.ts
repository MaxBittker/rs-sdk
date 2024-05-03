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

    decodeParams: function (dat: Packet): ParamMap {
        const count = dat.g1();
        const params = new Map<number, number | string>();
        for (let i = 0; i < count; i++) {
            const key = dat.g3();
            const isString = dat.gbool();

            if (isString) {
                params.set(key, dat.gjstr());
            } else {
                params.set(key, dat.g4());
            }
        }
        return params;
    }
};
