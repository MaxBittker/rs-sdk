import fs from 'fs';

import { CompileServerScript } from '@lostcityrs/runescript';

import Component from '#/cache/config/Component.js';
import DbTableType from '#/cache/config/DbTableType.js';
import InvType from '#/cache/config/InvType.js';
import ParamType from '#/cache/config/ParamType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import VarNpcType from '#/cache/config/VarNpcType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import VarSharedType from '#/cache/config/VarSharedType.js';
import { NpcModeMap } from '#/engine/entity/NpcMode.js';
import { NpcStatMap } from '#/engine/entity/NpcStat.js';
import { PlayerStatMap } from '#/engine/entity/PlayerStat.js';
import { ScriptOpcodeMap } from '#/engine/script/ScriptOpcode.js';
import ScriptOpcodePointers from '#/engine/script/ScriptOpcodePointers.js';
import Environment from '#/util/Environment.js';
import VarBitType from '#/cache/config/VarBitType.js';
import { readTextFile } from '#tools/pack/FsCache.js';
import { loadDirExtFull } from '#tools/pack/Parse.js';

class CompilerTypeInfo {
    max: number = -1;
    map: Record<string, string> = {};

    // info for some configs
    vartype: Record<string, string> = {};
    protect: Record<string, boolean> = {};

    // info for commands only
    require: Record<string, string> = {};
    require2: Record<string, string> = {};
    conditional: Record<string, boolean> = {};
    set: Record<string, string> = {};
    set2: Record<string, string> = {};
    corrupt: Record<string, string> = {};
    corrupt2: Record<string, string> = {};

    static load(file: string) {
        const pack = new CompilerTypeInfo();

        if (!fs.existsSync(file)) {
            return pack;
        }

        const lines = readTextFile(file).split(/\r?\n/);
        for (const line of lines) {
            if (!line.length || line.indexOf('=') === -1) {
                continue;
            }

            const [id, name] = line.split('=');
            pack.add(parseInt(id), name);
        }

        return pack;
    }

    static loadArray(input: string[]) {
        const pack = new CompilerTypeInfo();

        for (let i = 0; i < input.length; i++) {
            pack.add(i, input[i].toLowerCase());
        }

        return pack;
    }

    static loadRecords(input: Record<string, string>, valueAsKey: boolean = false) {
        const pack = new CompilerTypeInfo();

        for (const [key, value] of Object.entries(input)) {
            if (valueAsKey) {
                pack.map[value] = key;
            } else {
                pack.map[key] = value;
            }
        }

        return pack;
    }

    static loadMap(input: Map<string, number>, valueAsKey: boolean = false) {
        const pack = new CompilerTypeInfo();

        for (const [key, value] of input) {
            if (valueAsKey) {
                pack.map[value.toString()] = key.toLowerCase();
            } else {
                pack.map[key.toLowerCase()] = value.toString();
            }
        }

        return pack;
    }

    add(id: number, name: string, updateMax: boolean = true) {
        this.map[id] = name;

        if (updateMax && this.max < id) {
            this.max = id + 1;
        }
    }
}

export function runServerCompiler() {
    const allCommands = Array.from(ScriptOpcodeMap.entries()).sort((a, b) => a[1] - b[1]);
    const commandInfo = new CompilerTypeInfo();
    for (let i = 0; i < allCommands.length; i++) {
        const [name, opcode] = allCommands[i];
        const pointers = ScriptOpcodePointers[opcode];

        commandInfo.add(opcode, name.toLowerCase());

        if (!pointers) {
            continue;
        }

        if (pointers.require) {
            commandInfo.require[opcode] = pointers.require.join(',');

            if (pointers.require2) {
                commandInfo.require2[opcode] = pointers.require2.join(',');
            }
        }

        if (pointers.set) {
            if (pointers.conditional) {
                commandInfo.conditional[opcode] = true;
            }

            commandInfo.set[opcode] = pointers.set.join(',');

            if (pointers.set2) {
                commandInfo.set2[opcode] = pointers.set2.join(',');
            }
        }

        if (pointers.corrupt) {
            commandInfo.corrupt[opcode] = pointers.corrupt.join(',');

            if (pointers.corrupt2) {
                commandInfo.corrupt[opcode] = pointers.corrupt2.join(',');
            }
        }
    }

    const allConstants: Record<string, string> = {};
    loadDirExtFull(`${Environment.build.srcDir}/scripts`, '.constant', src => {
        for (let i = 0; i < src.length; i++) {
            if (!src[i] || src[i].startsWith('//')) {
                continue;
            }

            const parts = src[i].split('=');

            let name = parts[0].trim();
            if (name.startsWith('^')) {
                name = name.substring(1);
            }

            let value = parts[1].trim();
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.substring(1, value.length - 1);
            }

            allConstants[name] = value;
        }
    });
    const constantInfo = CompilerTypeInfo.loadRecords(allConstants);

    // load id mapping files
    const npcInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/npc.pack`);
    const objInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/obj.pack`);
    const invInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/inv.pack`);
    const seqInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/seq.pack`);
    const idkInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/idk.pack`);
    const spotanimInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/spotanim.pack`);
    const locInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/loc.pack`);
    const componentInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/interface.pack`);
    const interfaceInfo = new CompilerTypeInfo();
    const overlayInfo = new CompilerTypeInfo();
    const varpInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/varp.pack`);
    const varbitInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/varbit.pack`);
    const varnInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/varn.pack`);
    const varsInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/vars.pack`);
    const paramInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/param.pack`);
    const structInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/struct.pack`);
    const enumInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/enum.pack`);
    const huntInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/hunt.pack`);
    const mesanimInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/mesanim.pack`);
    const synthInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/synth.pack`);
    const categoryInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/category.pack`);
    const runescriptInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/script.pack`);
    const dbtableInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/dbtable.pack`);
    const dbcolumnInfo = new CompilerTypeInfo();
    const dbrowInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/dbrow.pack`);
    const midiInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/midi.pack`);

    // load extra context for compiler
    InvType.load('data/pack');
    const writeinvInfo = CompilerTypeInfo.load(`${Environment.build.srcDir}/pack/inv.pack`);
    for (let id = 0; id <= writeinvInfo.max; id++) {
        if (typeof writeinvInfo.map[id] === 'undefined') {
            continue;
        }

        const inv = InvType.get(id);
        writeinvInfo.protect[id] = inv.protect;
    }

    Component.load('data/pack');
    for (let id = 0; id <= componentInfo.max; id++) {
        if (typeof componentInfo.map[id] === 'undefined') {
            continue;
        }

        const com = Component.get(id);
        const name = com.comName || componentInfo.map[id];

        interfaceInfo.add(id, name);

        if (com.overlay) {
            overlayInfo.add(id, name);
        }
    }

    VarPlayerType.load('data/pack');
    for (let id = 0; id <= varpInfo.max; id++) {
        if (typeof varpInfo.map[id] === 'undefined') {
            continue;
        }

        const varp = VarPlayerType.get(id);
        varpInfo.vartype[id] = ScriptVarType.getType(varp.type);
        varpInfo.protect[id] = varp.protect;
    }

    VarBitType.load('data/pack');
    for (let id = 0; id <= varbitInfo.max; id++) {
        if (typeof varbitInfo.map[id] === 'undefined') {
            continue;
        }

        const varbit = VarBitType.get(id);
        const basevar = VarPlayerType.get(varbit.basevar);
        varbitInfo.vartype[id] = ScriptVarType.getType(basevar.type);
        varbitInfo.protect[id] = basevar.protect;
    }

    VarNpcType.load('data/pack');
    for (let id = 0; id <= varnInfo.max; id++) {
        if (typeof varnInfo.map[id] === 'undefined') {
            continue;
        }

        const varn = VarNpcType.get(id);
        varnInfo.vartype[id] = ScriptVarType.getType(varn.type);
    }

    VarSharedType.load('data/pack');
    for (let id = 0; id <= varsInfo.max; id++) {
        if (typeof varsInfo.map[id] === 'undefined') {
            continue;
        }

        const vars = VarSharedType.get(id);
        varsInfo.vartype[id] = ScriptVarType.getType(vars.type);
    }

    ParamType.load('data/pack');
    for (let id = 0; id <= paramInfo.max; id++) {
        if (typeof paramInfo.map[id] === 'undefined') {
            continue;
        }

        const param = ParamType.get(id);
        paramInfo.vartype[id] = param.getType();
    }

    DbTableType.load('data/pack');
    for (let id = 0; id <= dbtableInfo.max; id++) {
        if (typeof dbtableInfo.map[id] === 'undefined') {
            continue;
        }

        const table = DbTableType.get(id);
        for (let column = 0; column < table.columnNames.length; column++) {
            const types = table.types[column].map((t: number) => ScriptVarType.getType(t));

            const columnIndex = ((table.id & 0xffff) << 12) | ((column & 0x7f) << 4);
            dbcolumnInfo.add(columnIndex, `${table.debugname}:${table.columnNames[column]}`, false);
            dbcolumnInfo.vartype[columnIndex] = types.join(',');

            if (types.length > 1) {
                for (let tuple = 0; tuple < types.length; tuple++) {
                    const tupleIndex = ((table.id & 0xffff) << 12) | ((column & 0x7f) << 4) | ((tuple + 1) & 0xf);
                    dbcolumnInfo.add(tupleIndex, `${table.debugname}:${table.columnNames[column]}:${tuple}`, false);
                    dbcolumnInfo.vartype[tupleIndex] = types[tuple];
                }
            }
        }
    }

    // prepare meta mapping files
    const statInfo = CompilerTypeInfo.loadMap(PlayerStatMap, true);
    const npcStatInfo = CompilerTypeInfo.loadMap(NpcStatMap, true);
    const npcModeInfo = CompilerTypeInfo.loadMap(NpcModeMap, true);
    const fontmetricsInfo = CompilerTypeInfo.loadArray(['p11_full', 'p12_full', 'b12_full', 'q8_full']);
    const locshapeInfo = CompilerTypeInfo.loadArray([
        'wall_straight',
        'wall_diagonalcorner',
        'wall_l',
        'wall_squarecorner',
        'walldecor_straight_nooffset',
        'walldecor_straight_offset',
        'walldecor_diagonal_offset',
        'walldecor_diagonal_nooffset',
        'walldecor_diagonal_both',
        'wall_diagonal',
        'centrepiece_straight',
        'centrepiece_diagonal',
        'roof_straight',
        'roof_diagonal_with_roofedge',
        'roof_diagonal',
        'roof_l_concave',
        'roof_l_convex',
        'roof_flat',
        'roofedge_straight',
        'roofedge_diagonalcorner',
        'roofedge_l',
        'roofedge_squarecorner',
        'grounddecor'
    ]);

    CompileServerScript({
        symbols: {
            command: commandInfo,

            constant: constantInfo,
            npc: npcInfo,
            obj: objInfo,
            inv: invInfo,
            writeinv: writeinvInfo,
            seq: seqInfo,
            idk: idkInfo,
            spotanim: spotanimInfo,
            loc: locInfo,
            component: componentInfo,
            interface: interfaceInfo,
            overlayinterface: overlayInfo,
            varp: varpInfo,
            varbit: varbitInfo,
            varn: varnInfo,
            vars: varsInfo,
            param: paramInfo,
            struct: structInfo,
            enum: enumInfo,
            hunt: huntInfo,
            mesanim: mesanimInfo,
            synth: synthInfo,
            category: categoryInfo,
            runescript: runescriptInfo,
            dbtable: dbtableInfo,
            dbcolumn: dbcolumnInfo,
            dbrow: dbrowInfo,
            midi: midiInfo,

            stat: statInfo,
            npc_stat: npcStatInfo,
            npc_mode: npcModeInfo,
            fontmetrics: fontmetricsInfo,
            locshape: locshapeInfo
        }
    });
}
