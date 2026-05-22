import DbRowType from '#/cache/config/DbRowType.js';
import DbTableIndex from '#/cache/config/DbTableIndex.js';
import DbTableType from '#/cache/config/DbTableType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import { ScriptOpcode } from '#/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';
import { check, DbRowTypeValid, DbTableTypeValid } from '#/engine/script/ScriptValidators.js';
import ScriptState from '#/engine/script/ScriptState.js';

function db_find(state: ScriptState, withCount: boolean) {
    const isString = state.popInt() == 2;

    const query = isString ? state.popString() : state.popInt();
    const tableColumnPacked = state.popInt();

    state.dbTable = check((tableColumnPacked >> 12) & 0xffff, DbTableTypeValid);
    state.dbRow = -1;
    state.dbRowQuery = DbTableIndex.find(query, tableColumnPacked);

    if (withCount) {
        state.pushInt(state.dbRowQuery.length);
    }
}

function db_listall(state: ScriptState, withCount: boolean) {
    const table = state.popInt();

    state.dbTable = check(table, DbTableTypeValid);
    state.dbRow = -1;
    state.dbRowQuery = [];

    const rows = DbRowType.getInTable(table);
    for (const row of rows) {
        state.dbRowQuery.push(row.id);
    }

    if (withCount) {
        state.pushInt(state.dbRowQuery.length);
    }
}

function db_find_refine(state: ScriptState, withCount: boolean) {
    const isString = state.popInt() == 2;
    const query = isString ? state.popString() : state.popInt();
    const tableColumnPacked = state.popInt();

    const found = DbTableIndex.find(query, tableColumnPacked);

    // merge with previous query
    const prevQuery = state.dbRowQuery;
    state.dbRow = -1;
    state.dbRowQuery = [];

    for (let i = 0; i < prevQuery.length; i++) {
        if (found.includes(prevQuery[i])) {
            state.dbRowQuery.push(prevQuery[i]);
        }
    }

    if (withCount) {
        state.pushInt(state.dbRowQuery.length);
    }
}

const DebugOps: CommandHandlers = {
    [ScriptOpcode.DB_FIND]: state => {
        db_find(state, false);
    },

    [ScriptOpcode.DB_FIND_WITH_COUNT]: state => {
        db_find(state, true);
    },

    [ScriptOpcode.DB_LISTALL]: state => {
        db_listall(state, false);
    },

    [ScriptOpcode.DB_LISTALL_WITH_COUNT]: state => {
        db_listall(state, true);
    },

    [ScriptOpcode.DB_FINDNEXT]: state => {
        if (!state.dbTable) {
            throw new Error('No table selected');
        }

        if (state.dbRow + 1 >= state.dbRowQuery.length) {
            state.pushInt(-1); // null
            return;
        }

        state.dbRow++;

        state.pushInt(check(state.dbRowQuery[state.dbRow], DbRowTypeValid).id);
    },

    [ScriptOpcode.DB_GETFIELD]: state => {
        const [row, packed, listIndex] = state.popInts(3);

        const fieldTable = (packed >> 12) & 0xffff;
        const fieldColumn = (packed >> 4) & 0x7f;
        const tupleIndex = (packed & 0xF) - 1;

        const rowType: DbRowType = check(row, DbRowTypeValid);
        const tableType: DbTableType = check(fieldTable, DbTableTypeValid);

        const valueTypes = tableType.types[fieldColumn];
        let off = 0;
        let len = valueTypes.length;
        if (tupleIndex >= 0) {
            if (tupleIndex >= len) {
                throw new Error(`Tuple index out-of-bounds. Requested: ${tupleIndex}, Max: ${len}`);
            }

            off = tupleIndex;
            len = tupleIndex + 1;
        }

        let values: (string | number)[];
        if (rowType.tableId !== fieldTable) {
            values = tableType.getDefault(fieldColumn);
        } else {
            values = rowType.getValue(fieldColumn, listIndex);
        }

        for (let i = off; i < len; i++) {
            if (valueTypes[i] === ScriptVarType.STRING) {
                state.pushString(values[i] as string);
            } else {
                state.pushInt(values[i] as number);
            }
        }
    },

    [ScriptOpcode.DB_GETFIELDCOUNT]: state => {
        const [row, tableColumnPacked] = state.popInts(2);

        const table = (tableColumnPacked >> 12) & 0xffff;
        const column = (tableColumnPacked >> 4) & 0x7f;

        const rowType: DbRowType = check(row, DbRowTypeValid);
        const tableType: DbTableType = check(table, DbTableTypeValid);

        if (rowType.tableId !== table) {
            state.pushInt(0);
            return;
        }

        state.pushInt(rowType.columnValues[column].length / tableType.types[column].length);
    },

    [ScriptOpcode.DB_FINDBYINDEX]: state => {
        if (!state.dbTable) {
            throw new Error('No table selected');
        }

        const index = state.popInt();

        if (index < 0 || index >= state.dbRowQuery.length) {
            state.pushInt(-1); // null
            return;
        }

        state.pushInt(check(state.dbRowQuery[index], DbRowTypeValid).id);
    },

    [ScriptOpcode.DB_FIND_REFINE]: state => {
        db_find_refine(state, false);
    },

    [ScriptOpcode.DB_FIND_REFINE_WITH_COUNT]: state => {
        db_find_refine(state, true);
    },

    [ScriptOpcode.DB_GETROWTABLE]: state => {
        state.pushInt(check(state.popInt(), DbRowTypeValid).tableId);
    },
};

export default DebugOps;
