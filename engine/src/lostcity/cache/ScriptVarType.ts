export default class ScriptVarType {
    static INT = 105; // i
    static AUTOINT = 97; // a - virtual type used for enum keys
    static STRING = 115; // s
    static ENUM = 103; // g
    static OBJ = 111; // o
    static LOC = 108; // l
    static COMPONENT = 73; // I
    static NAMEDOBJ = 79; // O
    static STRUCT = 74; // J
    static BOOLEAN = 49; // 1
    static COORD = 99; // c
    static CATEGORY = 121; // y
    static SPOTANIM = 116; // t
    static NPC = 110; // n
    static INV = 118; // v
    static SYNTH = 80; // P
    static SEQ = 65; // A
    static STAT = 83; // S
    static VARP = 86; // V - virtual type necessary for dbrow values

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
                char = 'a';
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
