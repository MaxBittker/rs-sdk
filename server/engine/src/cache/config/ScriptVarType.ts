export default class ScriptVarType {
    static readonly INT = 105; // i
    static readonly AUTOINT = 255; // ÿ - virtual type used for enum keys
    static readonly STRING = 115; // s
    static readonly ENUM = 103; // g
    static readonly OBJ = 111; // o
    static readonly LOC = 108; // l
    static readonly COMPONENT = 73; // I
    static readonly NAMEDOBJ = 79; // O
    static readonly STRUCT = 74; // J
    static readonly BOOLEAN = 49; // 1
    static readonly COORD = 99; // c
    static readonly CATEGORY = 121; // y
    static readonly SPOTANIM = 116; // t
    static readonly NPC = 110; // n
    static readonly INV = 118; // v
    static readonly SYNTH = 80; // P
    static readonly SEQ = 65; // A
    static readonly STAT = 83; // S
    static readonly VARP = 86; // V
    static readonly PLAYER_UID = 112; // p
    static readonly NPC_UID = 78; // N
    static readonly INTERFACE = 97; // a
    static readonly NPC_STAT = 254; // þ
    static readonly IDKIT = 75; // K
    static readonly DBROW = 208; // Ð
    static readonly MIDI = 77; // M

    static getType(type: number) {
        switch (type) {
            case ScriptVarType.INT:
                return 'int';
            case ScriptVarType.STRING:
                return 'string';
            case ScriptVarType.ENUM:
                return 'enum';
            case ScriptVarType.OBJ:
                return 'obj';
            case ScriptVarType.LOC:
                return 'loc';
            case ScriptVarType.COMPONENT:
                return 'component';
            case ScriptVarType.NAMEDOBJ:
                return 'namedobj';
            case ScriptVarType.STRUCT:
                return 'struct';
            case ScriptVarType.BOOLEAN:
                return 'boolean';
            case ScriptVarType.COORD:
                return 'coord';
            case ScriptVarType.CATEGORY:
                return 'category';
            case ScriptVarType.SPOTANIM:
                return 'spotanim';
            case ScriptVarType.NPC:
                return 'npc';
            case ScriptVarType.INV:
                return 'inv';
            case ScriptVarType.SYNTH:
                return 'synth';
            case ScriptVarType.SEQ:
                return 'seq';
            case ScriptVarType.STAT:
                return 'stat';
            case ScriptVarType.AUTOINT:
                return 'autoint';
            case ScriptVarType.VARP:
                return 'varp';
            case ScriptVarType.PLAYER_UID:
                return 'player_uid';
            case ScriptVarType.NPC_UID:
                return 'npc_uid';
            case ScriptVarType.INTERFACE:
                return 'interface';
            case ScriptVarType.NPC_STAT:
                return 'npc_stat';
            case ScriptVarType.IDKIT:
                return 'idkit';
            case ScriptVarType.DBROW:
                return 'dbrow';
            case ScriptVarType.MIDI:
                return 'midi';
            default:
                return 'unknown';
        }
    }

    static getTypeChar(type: string) {
        let char = 'i'; // sane default

        switch (type) {
            case 'int':
                char = 'i';
                break;
            case 'autoint':
                char = 'ÿ';
                break;
            case 'string':
                char = 's';
                break;
            // official, despite how weird some are:
            case 'enum':
                char = 'g';
                break;
            case 'obj':
                char = 'o';
                break;
            case 'loc':
                char = 'l';
                break;
            case 'component': // may not need this on server
                char = 'I';
                break;
            case 'namedobj':
                char = 'O';
                break;
            case 'struct':
                char = 'J';
                break;
            case 'boolean':
                char = '1';
                break;
            case 'coord':
                char = 'c';
                break;
            case 'category':
                char = 'y';
                break;
            case 'spotanim':
                char = 't';
                break;
            case 'npc':
                char = 'n';
                break;
            case 'inv':
                char = 'v';
                break;
            case 'synth':
                char = 'P';
                break;
            case 'seq':
                char = 'A';
                break;
            case 'stat':
                char = 'S';
                break;
            case 'varp':
                char = 'V';
                break;
            case 'player_uid':
                char = 'p';
                break;
            case 'npc_uid':
                char = 'N';
                break;
            case 'interface':
                char = 'a';
                break;
            case 'npc_stat':
                char = 'þ';
                break;
            case 'idkit':
                char = 'K';
                break;
            case 'dbrow':
                char = 'Ð';
                break;
            case 'midi':
                char = 'M';
                break;
            default:
                return null;
        }

        return char.charCodeAt(0);
    }

    static getDefault(type: number) {
        if (type === ScriptVarType.STRING) {
            return '';
        } else if (type === ScriptVarType.BOOLEAN) {
            return 0;
        } else {
            return -1;
        }
    }
}
