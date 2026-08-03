export function confirmByXpDelta(beforeXp: number, afterXp: number): boolean {
    return afterXp > beforeXp;
}

function clonePatternWithoutGlobal(pattern: RegExp): RegExp {
    return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
}

export function confirmByItemGain(
    beforeNames: string[],
    afterNames: string[],
    pattern: RegExp,
): boolean {
    const re = clonePatternWithoutGlobal(pattern);
    const before = beforeNames.filter((n) => re.test(n)).length;
    const after = afterNames.filter((n) => re.test(n)).length;
    return after > before;
}
