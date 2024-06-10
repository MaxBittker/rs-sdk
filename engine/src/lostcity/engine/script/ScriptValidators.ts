import LocType from '#lostcity/cache/config/LocType.js';
import ParamType from '#lostcity/cache/config/ParamType.js';
import NpcType from '#lostcity/cache/config/NpcType.js';
import HuntType from '#lostcity/cache/config/HuntType.js';
import NpcMode from '#lostcity/entity/NpcMode.js';
import SpotanimType from '#lostcity/cache/config/SpotanimType.js';
import EnumType from '#lostcity/cache/config/EnumType.js';
import ObjType from '#lostcity/cache/config/ObjType.js';
import {Inventory} from '#lostcity/engine/Inventory.js';
import InvType from '#lostcity/cache/config/InvType.js';
import CategoryType from '#lostcity/cache/config/CategoryType.js';
import IdkType from '#lostcity/cache/config/IdkType.js';
import HuntVis from '#lostcity/entity/hunt/HuntVis.js';
import {LocAngle, LocShape} from '@2004scape/rsmod-pathfinder';
import {Position} from '#lostcity/entity/Position.js';
import {ConfigType} from '#lostcity/cache/config/ConfigType.js';
import SeqType from '#lostcity/cache/config/SeqType.js';
import VarPlayerType from '#lostcity/cache/config/VarPlayerType.js';
import VarNpcType from '#lostcity/cache/config/VarNpcType.js';
import VarSharedType from '#lostcity/cache/config/VarSharedType.js';
import FontType from '#lostcity/cache/config/FontType.js';
import MesanimType from '#lostcity/cache/config/MesanimType.js';
import StructType from '#lostcity/cache/config/StructType.js';
import DbRowType from '#lostcity/cache/config/DbRowType.js';
import DbTableType from '#lostcity/cache/config/DbTableType.js';
import NpcStat from '#lostcity/entity/NpcStat.js';
import HitType from '#lostcity/entity/HitType.js';
import PlayerStat from '#lostcity/entity/PlayerStat.js';

interface ScriptValidator<T, R> {
    validate(input: T): R;
}

class ScriptInputNumberNotNullValidator implements ScriptValidator<number, number> {
    validate(input: number): number {
        if (input !== -1) return input;
        throw Error('An input number was null(-1).');
    }
}

class ScriptInputStringNotNullValidator implements ScriptValidator<string, string> {
    validate(input: string): string {
        if (input.length > 0) return input;
        throw Error('An input string was null(-1).');
    }
}

class ScriptInputConfigTypeValidator<T extends ConfigType | FontType> implements ScriptValidator<number, T> {
    private readonly type: (input: number) => T;
    private readonly count: (input: number) => boolean;
    private readonly name: string;

    constructor(type: (input: number) => T, count: (input: number) => boolean, name: string) {
        this.type = type;
        this.count = count;
        this.name = name;
    }

    validate(input: number): T {
        if (this.count(input)) return this.type(input);
        throw new Error(`An input for a ${this.name} type was not valid to use. Input was ${input}.`);
    }
}

class ScriptInputRangeValidator<T> implements ScriptValidator<number, T> {
    protected readonly min: number;
    protected readonly max: number;
    protected readonly name: string;

    constructor(min: number, max: number, name: string) {
        this.min = min;
        this.max = max;
        this.name = name;
    }

    validate(input: number): T {
        if (input >= this.min && input <= this.max) {
            return input as T;
        }
        throw new Error(`An input for a ${this.name} was out of range. Range should be: ${this.min} to ${this.max}. Input was ${input}.`);
    }
}

class ScriptInputCoordValidator extends ScriptInputRangeValidator<Position> {
    validate(input: number): Position {
        if (input >= this.min && input <= this.max) {
            return Position.unpackCoord(input);
        }
        throw new Error(`An input for a ${this.name} was out of range. Range should be: ${this.min} to ${this.max}. Input was ${input}.`);
    }
}

export const NumberNotNull: ScriptValidator<number, number> = new ScriptInputNumberNotNullValidator();
export const StringNotNull: ScriptValidator<string, string> = new ScriptInputStringNotNullValidator();
export const LocTypeValid: ScriptValidator<number, LocType> = new ScriptInputConfigTypeValidator(LocType.get, (input: number) => input >= 0 && input < LocType.count, 'Loc');
export const LocAngleValid: ScriptValidator<number, LocAngle> = new ScriptInputRangeValidator(LocAngle.WEST, LocAngle.SOUTH, 'LocAngle');
export const LocShapeValid: ScriptValidator<number, LocShape> = new ScriptInputRangeValidator(LocShape.WALL_STRAIGHT, LocShape.GROUND_DECOR, 'LocShape');
export const DurationValid: ScriptValidator<number, number> = new ScriptInputRangeValidator(1, 2147483647, 'Duration');
export const CoordValid: ScriptValidator<number, Position> = new ScriptInputCoordValidator(0, 2147483647, 'Coord');
export const ParamTypeValid: ScriptValidator<number, ParamType> = new ScriptInputConfigTypeValidator(ParamType.get, (input: number) => input >= 0 && input < ParamType.count, 'Param');
export const NpcTypeValid: ScriptValidator<number, NpcType> = new ScriptInputConfigTypeValidator(NpcType.get, (input: number) => input >= 0 && input < NpcType.count, 'Npc');
export const NpcStatValid: ScriptValidator<number, NpcStat> = new ScriptInputRangeValidator(NpcStat.HITPOINTS, NpcStat.RANGED, 'NpcStat');
export const PlayerStatValid: ScriptValidator<number, PlayerStat> = new ScriptInputRangeValidator(PlayerStat.ATTACK, PlayerStat.RUNECRAFT, 'PlayerStat');
export const QueueValid: ScriptValidator<number, number> = new ScriptInputRangeValidator(0, 19, 'AIQueue');
export const HuntTypeValid: ScriptValidator<number, HuntType> = new ScriptInputConfigTypeValidator(HuntType.get, (input: number) => input >= 0 && input < HuntType.count, 'Hunt');
export const NpcModeValid: ScriptValidator<number, NpcMode> = new ScriptInputRangeValidator(NpcMode.NULL, NpcMode.APNPC5, 'NpcMode');
export const HitTypeValid: ScriptValidator<number, HitType> = new ScriptInputRangeValidator(HitType.BLOCK, HitType.POISON, 'Hit');
export const SpotAnimTypeValid: ScriptValidator<number, SpotanimType> = new ScriptInputConfigTypeValidator(SpotanimType.get, (input: number) => input >= 0 && input < SpotanimType.count, 'Spotanim');
export const EnumTypeValid: ScriptValidator<number, EnumType> = new ScriptInputConfigTypeValidator(EnumType.get, (input: number) => input >= 0 && input < EnumType.count, 'Enum');
export const ObjTypeValid: ScriptValidator<number, ObjType> = new ScriptInputConfigTypeValidator(ObjType.get, (input: number) => input >= 0 && input < ObjType.count, 'Obj');
export const ObjStackValid: ScriptValidator<number, number> = new ScriptInputRangeValidator(1, Inventory.STACK_LIMIT, 'ObjStack');
export const InvTypeValid: ScriptValidator<number, InvType> = new ScriptInputConfigTypeValidator(InvType.get, (input: number) => input >= 0 && input < InvType.count, 'Inv');
export const CategoryTypeValid: ScriptValidator<number, CategoryType> = new ScriptInputConfigTypeValidator(CategoryType.get, (input: number) => input >= 0 && input < CategoryType.count, 'Cat');
export const IDKTypeValid: ScriptValidator<number, IdkType> = new ScriptInputConfigTypeValidator(IdkType.get, (input: number) => input >= 0 && input < IdkType.count, 'Idk');
export const HuntVisValid: ScriptValidator<number, HuntVis> = new ScriptInputRangeValidator(HuntVis.OFF, HuntVis.LINEOFWALK, 'HuntVis');
export const SeqTypeValid: ScriptValidator<number, SeqType> = new ScriptInputConfigTypeValidator(SeqType.get, (input: number) => input >= 0 && input < SeqType.count, 'Seq');
export const VarPlayerValid: ScriptValidator<number, VarPlayerType> = new ScriptInputConfigTypeValidator(VarPlayerType.get, (input: number) => input >= 0 && input < VarPlayerType.count, 'Varp');
export const VarNpcValid: ScriptValidator<number, VarNpcType> = new ScriptInputConfigTypeValidator(VarNpcType.get, (input: number) => input >= 0 && input < VarNpcType.count, 'Varn');
export const VarSharedValid: ScriptValidator<number, VarSharedType> = new ScriptInputConfigTypeValidator(VarSharedType.get, (input: number) => input >= 0 && input < VarSharedType.count, 'Vars');
export const FontTypeValid: ScriptValidator<number, FontType> = new ScriptInputConfigTypeValidator(FontType.get, (input: number) => input >= 0 && input < FontType.count, 'Font');
export const MesanimValid: ScriptValidator<number, MesanimType> = new ScriptInputConfigTypeValidator(MesanimType.get, (input: number) => input >= 0 && input < MesanimType.count, 'Mesanim');
export const StructTypeValid: ScriptValidator<number, StructType> = new ScriptInputConfigTypeValidator(StructType.get, (input: number) => input >= 0 && input < StructType.count, 'Struct');
export const DbRowTypeValid: ScriptValidator<number, DbRowType> = new ScriptInputConfigTypeValidator(DbRowType.get, (input: number) => input >= 0 && input < DbRowType.count, 'Dbrow');
export const DbTableTypeValid: ScriptValidator<number, DbTableType> = new ScriptInputConfigTypeValidator(DbTableType.get, (input: number) => input >= 0 && input < DbTableType.count, 'Dbtable');

export function check<T, R>(input: T, validator: ScriptValidator<T, R>): R {
    return validator.validate(input);
}