const enum ScriptPointer {
    ActivePlayer,
    ActivePlayer2,
    ProtectedActivePlayer,
    ProtectedActivePlayer2,
    ActiveNpc,
    ActiveNpc2,
    ActiveLoc,
    ActiveLoc2,
    ActiveObj,
    ActiveObj2
}

export const ActiveNpc: ScriptPointer[] = [ScriptPointer.ActiveNpc, ScriptPointer.ActiveNpc2];
export const ActiveLoc: ScriptPointer[] = [ScriptPointer.ActiveLoc, ScriptPointer.ActiveLoc2];
export const ActiveObj: ScriptPointer[] = [ScriptPointer.ActiveObj, ScriptPointer.ActiveObj2];
export const ActivePlayer: ScriptPointer[] = [ScriptPointer.ActivePlayer, ScriptPointer.ActivePlayer2];
export const ProtectedActivePlayer: ScriptPointer[] = [ScriptPointer.ProtectedActivePlayer, ScriptPointer.ProtectedActivePlayer2];

export default ScriptPointer;
