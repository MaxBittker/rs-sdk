export function toBase37(string: string): bigint {
    string = string.trim();
    let l: bigint = 0n;

    for (let i: number = 0; i < string.length && i < 12; i++) {
        const c: number = string.charCodeAt(i);
        l *= 37n;

        if (c >= 0x41 && c <= 0x5a) {
            // A-Z
            l += BigInt(c + 1 - 0x41);
        } else if (c >= 0x61 && c <= 0x7a) {
            // a-z
            l += BigInt(c + 1 - 0x61);
        } else if (c >= 0x30 && c <= 0x39) {
            // 0-9
            l += BigInt(c + 27 - 0x30);
        }
    }

    return l;
}

// prettier-ignore
const BASE37_LOOKUP: string[] = [
  '_', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i',
  'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's',
  't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
];

export function fromBase37(value: bigint): string {
    // >= 37 to the 12th power
    if (value < 0n || value >= 6582952005840035281n) {
        return 'invalid_name';
    }

    let len: number = 0;
    const chars: string[] = Array(12);
    while (value !== 0n) {
        const l1: bigint = value;
        value /= 37n;
        chars[11 - len++] = BASE37_LOOKUP[Number(l1 - value * 37n)];
    }

    return chars.slice(12 - len).join('');
}

export function toTitleCase(str: string): string {
    return str.replace(/\w\S*/g, (txt: string): string => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export function toSafeName(name: string): string {
    return fromBase37(toBase37(name));
}

export function toDisplayName(name: string): string {
    return toTitleCase(toSafeName(name).replaceAll('_', ' '));
}
