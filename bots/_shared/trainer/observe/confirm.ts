export function confirmByXpDelta(beforeXp: number, afterXp: number): boolean {
    return afterXp > beforeXp;
}

export function confirmByItemGain(
    beforeNames: string[],
    afterNames: string[],
    pattern: RegExp,
): boolean {
    const before = beforeNames.filter((n) => pattern.test(n)).length;
    const after = afterNames.filter((n) => pattern.test(n)).length;
    return after > before;
}
