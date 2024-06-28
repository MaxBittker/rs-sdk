import fs from 'fs';
import { loadDir, loadPack } from '#lostcity/util/NameMap.js';
import ParamType from '#lostcity/cache/config/ParamType.js';
import DbTableType from '#lostcity/cache/config/DbTableType.js';
import ScriptVarType from '#lostcity/cache/config/ScriptVarType.js';
import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import VarPlayerType from '#lostcity/cache/config/VarPlayerType.js';
import VarNpcType from '#lostcity/cache/config/VarNpcType.js';
import VarSharedType from '#lostcity/cache/config/VarSharedType.js';
import ScriptOpcodePointers from '#lostcity/engine/script/ScriptOpcodePointers.js';
import Component from '#lostcity/cache/config/Component.js';
import InvType from '#lostcity/cache/config/InvType.js';

export function generateServerSymbols() {
    fs.mkdirSync('data/symbols', { recursive: true });

    const constants: Record<string, string> = {};
    loadDir('data/src/scripts', '.constant', src => {
        for (let i = 0; i < src.length; i++) {
            if (!src[i] || src[i].startsWith('//')) {
                continue;
            }

            const parts = src[i].split('=');
            let name = parts[0].trim();
            const value = parts[1].trim();

            if (name.startsWith('^')) {
                name = name.substring(1);
            }

            constants[name] = value;
        }
    });
    let constantSymbols = '';
    for (const name in constants) {
        constantSymbols += `${name}\t${constants[name]}\n`;
    }
    fs.writeFileSync('data/symbols/constant.sym', constantSymbols);

    let npcSymbols = '';
    const npcs = loadPack('data/src/pack/npc.pack');
    for (let i = 0; i < npcs.length; i++) {
        npcSymbols += `${i}\t${npcs[i]}\n`;
    }
    fs.writeFileSync('data/symbols/npc.sym', npcSymbols);

    let objSymbols = '';
    const objs = loadPack('data/src/pack/obj.pack');
    for (let i = 0; i < objs.length; i++) {
        objSymbols += `${i}\t${objs[i]}\n`;
    }
    fs.writeFileSync('data/symbols/obj.sym', objSymbols);

    InvType.load('data/pack');
    let invSymbols = '';
    let writeInvSymbols = '';
    const invs = loadPack('data/src/pack/inv.pack');
    for (let i = 0; i < invs.length; i++) {
        if (!invs[i]) {
            continue;
        }

        const type = InvType.get(i);
        invSymbols += `${i}\t${invs[i]}\n`;
        writeInvSymbols += `${i}\t${invs[i]}\tnone\t${type.protect}\n`;
    }
    fs.writeFileSync('data/symbols/inv.sym', invSymbols);
    fs.writeFileSync('data/symbols/writeinv.sym', writeInvSymbols);

    let seqSymbols = '';
    const seqs = loadPack('data/src/pack/seq.pack');
    for (let i = 0; i < seqs.length; i++) {
        if (!seqs[i]) {
            continue;
        }

        seqSymbols += `${i}\t${seqs[i]}\n`;
    }
    fs.writeFileSync('data/symbols/seq.sym', seqSymbols);

    let idkSymbols = '';
    const idks = loadPack('data/src/pack/idk.pack');
    for (let i = 0; i < idks.length; i++) {
        if (!idks[i]) {
            continue;
        }

        idkSymbols += `${i}\t${idks[i]}\n`;
    }
    fs.writeFileSync('data/symbols/idk.sym', idkSymbols);

    let spotanimSymbols = '';
    const spotanims = loadPack('data/src/pack/spotanim.pack');
    for (let i = 0; i < spotanims.length; i++) {
        if (!spotanims[i]) {
            continue;
        }

        spotanimSymbols += `${i}\t${spotanims[i]}\n`;
    }
    fs.writeFileSync('data/symbols/spotanim.sym', spotanimSymbols);

    let locSymbols = '';
    const locs = loadPack('data/src/pack/loc.pack');
    for (let i = 0; i < locs.length; i++) {
        if (!locs[i]) {
            continue;
        }

        locSymbols += `${i}\t${locs[i]}\n`;
    }
    fs.writeFileSync('data/symbols/loc.sym', locSymbols);

    Component.load('data/pack');
    let comSymbols = '';
    let interfaceSymbols = '';
    let overlaySymbols = '';
    const coms = loadPack('data/src/pack/interface.pack');
    for (let i = 0; i < coms.length; i++) {
        if (!coms[i] || coms[i] === 'null:null') {
            continue;
        }

        const com = Component.get(i);
        if (coms[i].indexOf(':') !== -1) {
            comSymbols += `${i}\t${coms[i]}\n`;
        } else if (com.overlay) {
            overlaySymbols += `${i}\t${coms[i]}\n`;
        } else {
            interfaceSymbols += `${i}\t${coms[i]}\n`;
        }

        // temporary: until compiler updates
        if (com.overlay) {
            interfaceSymbols += `${i}\t${coms[i]}\n`;
        }
    }
    fs.writeFileSync('data/symbols/component.sym', comSymbols);
    fs.writeFileSync('data/symbols/interface.sym', interfaceSymbols);
    fs.writeFileSync('data/symbols/overlayinterface.sym', overlaySymbols);

    VarPlayerType.load('data/pack');
    let varpSymbols = '';
    const varps = loadPack('data/src/pack/varp.pack');
    for (let i = 0; i < varps.length; i++) {
        if (!varps[i]) {
            continue;
        }

        const varp = VarPlayerType.get(i);
        varpSymbols += `${i}\t${varps[i]}\t${ScriptVarType.getType(varp.type)}\t${varp.protect}\n`;
    }
    fs.writeFileSync('data/symbols/varp.sym', varpSymbols);

    VarNpcType.load('data/pack');
    let varnSymbols = '';
    const varns = loadPack('data/src/pack/varn.pack');
    for (let i = 0; i < varns.length; i++) {
        if (!varns[i]) {
            continue;
        }

        const varn = VarNpcType.get(i);
        varnSymbols += `${i}\t${varns[i]}\t${ScriptVarType.getType(varn.type)}\n`;
    }
    fs.writeFileSync('data/symbols/varn.sym', varnSymbols);

    VarSharedType.load('data/pack');
    let varsSymbols = '';
    const varss = loadPack('data/src/pack/vars.pack');
    for (let i = 0; i < varss.length; i++) {
        if (!varss[i]) {
            continue;
        }

        const vars = VarSharedType.get(i);
        varsSymbols += `${i}\t${varss[i]}\t${ScriptVarType.getType(vars.type)}\n`;
    }
    fs.writeFileSync('data/symbols/vars.sym', varsSymbols);

    ParamType.load('data/pack');

    let paramSymbols = '';
    const params = loadPack('data/src/pack/param.pack');
    for (let i = 0; i < params.length; i++) {
        if (!params[i]) {
            continue;
        }

        const config = ParamType.get(i);
        paramSymbols += `${i}\t${params[i]}\t${config.getType()}\n`;
    }
    fs.writeFileSync('data/symbols/param.sym', paramSymbols);

    let structSymbols = '';
    const structs = loadPack('data/src/pack/struct.pack');
    for (let i = 0; i < structs.length; i++) {
        structSymbols += `${i}\t${structs[i]}\n`;
    }
    fs.writeFileSync('data/symbols/struct.sym', structSymbols);

    let enumSymbols = '';
    const enums = loadPack('data/src/pack/enum.pack');
    for (let i = 0; i < enums.length; i++) {
        enumSymbols += `${i}\t${enums[i]}\n`;
    }
    fs.writeFileSync('data/symbols/enum.sym', enumSymbols);

    let huntSymbols = '';
    const hunts = loadPack('data/src/pack/hunt.pack');
    for (let i = 0; i < hunts.length; i++) {
        huntSymbols += `${i}\t${hunts[i]}\n`;
    }
    fs.writeFileSync('data/symbols/hunt.sym', huntSymbols);

    let mesanimSymbols = '';
    const mesanims = loadPack('data/src/pack/mesanim.pack');
    for (let i = 0; i < mesanims.length; i++) {
        mesanimSymbols += `${i}\t${mesanims[i]}\n`;
    }
    fs.writeFileSync('data/symbols/mesanim.sym', mesanimSymbols);

    let synthSymbols = '';
    const synths = loadPack('data/src/pack/sound.pack');
    for (let i = 0; i < synths.length; i++) {
        synthSymbols += `${i}\t${synths[i]}\n`;
    }
    fs.writeFileSync('data/symbols/synth.sym', synthSymbols);

    let categorySymbols = '';
    const categories = loadPack('data/src/pack/category.pack');
    for (let i = 0; i < categories.length; i++) {
        if (!categories[i]) {
            continue;
        }

        categorySymbols += `${i}\t${categories[i]}\n`;
    }
    fs.writeFileSync('data/symbols/category.sym', categorySymbols);

    let scriptSymbols = '';
    const scripts = loadPack('data/src/pack/script.pack');
    for (let i = 0; i < scripts.length; i++) {
        if (!scripts[i]) {
            continue;
        }

        scriptSymbols += `${i}\t${scripts[i]}\n`;
    }
    fs.writeFileSync('data/symbols/runescript.sym', scriptSymbols);

    let commandSymbols = '';
    const commands = Object.keys(ScriptOpcode);
    for (let i = 0; i < commands.length / 2; i++) {
        const command = ScriptOpcode[commands[i] as any];
        const pointers = ScriptOpcodePointers[commands[i]];

        // format:
        // opcode<tab>command<tab>require<tab>corrupt<tab>set<tab>conditional<tab>secondary<tab>secondaryRequire

        const opcode = commands[i];
        if (pointers) {
            commandSymbols += `${opcode}\t${command.toLowerCase()}`;
        } else {
            commandSymbols += `${opcode}\t${command.toLowerCase()}\n`;
        }

        if (!pointers) {
            continue;
        }

        commandSymbols += '\t';

        if (pointers.require) {
            commandSymbols += pointers.require.join(',');
            if (pointers.require2) {
                commandSymbols += ':';
                commandSymbols += pointers.require2.join(',');
            }
        } else {
            commandSymbols += 'none';
        }

        commandSymbols += '\t';

        if (pointers.set) {
            if (pointers.conditional) {
                commandSymbols += 'CONDITIONAL:';
            }
            commandSymbols += pointers.set.join(',');
            if (pointers.set2) {
                commandSymbols += ':';
                commandSymbols += pointers.set2.join(',');
            }
        } else {
            commandSymbols += 'none';
        }

        commandSymbols += '\t';

        if (pointers.corrupt) {
            commandSymbols += pointers.corrupt.join(',');
            if (pointers.corrupt2) {
                commandSymbols += ':';
                commandSymbols += pointers.corrupt2.join(',');
            }
        } else {
            commandSymbols += 'none';
        }

        commandSymbols += '\n';
    }
    fs.writeFileSync('data/symbols/commands.sym', commandSymbols);

    DbTableType.load('data/pack');

    let dbTableSymbols = '';
    let dbColumnSymbols = '';
    const dbtables = loadPack('data/src/pack/dbtable.pack');
    for (let i = 0; i < dbtables.length; i++) {
        if (!dbtables[i]) {
            continue;
        }

        dbTableSymbols += `${i}\t${dbtables[i]}\n`;

        const table = DbTableType.get(i);
        for (let j = 0; j < table.columnNames.length; j++) {
            const columnIndex = (table.id << 12) | (j << 4);
            const types = table.types[j].map((t: number) => ScriptVarType.getType(t)).join(',');

            dbColumnSymbols += `${columnIndex}\t${table.debugname}:${table.columnNames[j]}\t${types}\n`;
        }
    }
    fs.writeFileSync('data/symbols/dbtable.sym', dbTableSymbols);
    fs.writeFileSync('data/symbols/dbcolumn.sym', dbColumnSymbols);

    let dbRowSymbols = '';
    const dbrows = loadPack('data/src/pack/dbrow.pack');
    for (let i = 0; i < dbrows.length; i++) {
        if (!dbrows[i]) {
            continue;
        }

        dbRowSymbols += `${i}\t${dbrows[i]}\n`;
    }
    fs.writeFileSync('data/symbols/dbrow.sym', dbRowSymbols);

    const stats = [
        'attack',
        'defence',
        'strength',
        'hitpoints',
        'ranged',
        'prayer',
        'magic',
        'cooking',
        'woodcutting',
        'fletching',
        'fishing',
        'firemaking',
        'crafting',
        'smithing',
        'mining',
        'herblore',
        'agility',
        'thieving',
        'stat18',
        'stat19',
        'runecraft'
    ];

    fs.writeFileSync('data/symbols/stat.sym', stats.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

    const npcStats = ['attack', 'defence', 'strength', 'hitpoints', 'ranged', 'magic'];

    fs.writeFileSync('data/symbols/npc_stat.sym', npcStats.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

    const locshapes = [
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
    ];

    fs.writeFileSync('data/symbols/locshape.sym', locshapes.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

    const fonts = ['p11', 'p12', 'b12', 'q8'];
    fs.writeFileSync('data/symbols/fontmetrics.sym', fonts.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

    const npcmodes = [
        '-1\tnull',
        '0\tnone',
        '1\twander',
        '2\tpatrol',
        '3\tplayerescape',
        '4\tplayerfollow',
        '5\tplayerface',
        '6\tplayerfaceclose',
        '7\topplayer1',
        '8\topplayer2',
        '9\topplayer3',
        '10\topplayer4',
        '11\topplayer5',
        '12\tapplayer1',
        '13\tapplayer2',
        '14\tapplayer3',
        '15\tapplayer4',
        '16\tapplayer5',
        '17\toploc1',
        '18\toploc2',
        '19\toploc3',
        '20\toploc4',
        '21\toploc5',
        '22\taploc1',
        '23\taploc2',
        '24\taploc3',
        '25\taploc4',
        '26\taploc5',
        '27\topobj1',
        '28\topobj2',
        '29\topobj3',
        '30\topobj4',
        '31\topobj5',
        '32\tapobj1',
        '33\tapobj2',
        '34\tapobj3',
        '35\tapobj4',
        '36\tapobj5',
        '37\topnpc1',
        '38\topnpc2',
        '39\topnpc3',
        '40\topnpc4',
        '41\topnpc5',
        '42\tapnpc1',
        '43\tapnpc2',
        '44\tapnpc3',
        '45\tapnpc4',
        '46\tapnpc5'
    ];
    fs.writeFileSync('data/symbols/npc_mode.sym', npcmodes.join('\n') + '\n');

    // ----

    if (fs.existsSync('data/pack/server/scripts')) {
        fs.readdirSync('data/pack/server/scripts').forEach(file => {
            fs.unlinkSync(`data/pack/server/scripts/${file}`);
        });
    }
}
