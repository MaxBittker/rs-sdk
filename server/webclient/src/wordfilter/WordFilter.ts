import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';

export default class WordFilter {
    private static readonly PERIOD: Uint16Array = new Uint16Array(
        ['d', 'o', 't']
            .join('')
            .split('')
            .map((char): number => char.charCodeAt(0))
    );

    private static readonly AMPERSAT: Uint16Array = new Uint16Array(
        ['(', 'a', ')']
            .join('')
            .split('')
            .map((char): number => char.charCodeAt(0))
    );

    private static readonly SLASH: Uint16Array = new Uint16Array(
        ['s', 'l', 'a', 's', 'h']
            .join('')
            .split('')
            .map((char): number => char.charCodeAt(0))
    );

    private static whitelist: string[] = ['cook', "cook's", 'cooks', 'seeks', 'sheet', 'woop', 'woops', 'faq'];

    private static readonly tlds: Uint16Array[] = [];
    private static readonly tldTypes: number[] = [];
    private static readonly badWords: Uint16Array[] = [];
    private static readonly badCombinations: number[][][] = [];
    private static readonly domains: Uint16Array[] = [];
    private static readonly fragments: number[] = [];

    static unpack(wordenc: JagFile): void {
        const fragments: Packet = new Packet(wordenc.read('fragmentsenc.txt'));
        const bad: Packet = new Packet(wordenc.read('badenc.txt'));
        const domain: Packet = new Packet(wordenc.read('domainenc.txt'));
        const tld: Packet = new Packet(wordenc.read('tldlist.txt'));
        this.read(bad, domain, fragments, tld);
    }

    static filter(input: string): string {
        const characters: string[] = [...input];
        this.format(characters);
        const trimmed: string = characters.join('').trim();
        const lowercase: string = trimmed.toLowerCase();
        const filtered: string[] = [...lowercase];
        this.filterTlds(filtered);
        this.filterBadWords(filtered);
        this.filterDomains(filtered);
        this.filterFragments(filtered);
        for (let index: number = 0; index < this.whitelist.length; index++) {
            let offset: number = -1;
            while ((offset = lowercase.indexOf(this.whitelist[index], offset + 1)) !== -1) {
                const whitelisted: string[] = [...this.whitelist[index]];
                for (let charIndex: number = 0; charIndex < whitelisted.length; charIndex++) {
                    filtered[charIndex + offset] = whitelisted[charIndex];
                }
            }
        }
        this.replaceUppercases(filtered, [...trimmed]);
        this.formatUppercases(filtered);
        return filtered.join('').trim();
    }

    private static read(bad: Packet, domain: Packet, fragments: Packet, tld: Packet): void {
        this.readBadWords(bad);
        this.readDomains(domain);
        this.readFragments(fragments);
        this.readTld(tld);
    }

    private static readTld(packet: Packet): void {
        const count: number = packet.g4();
        for (let index: number = 0; index < count; index++) {
            this.tldTypes[index] = packet.g1();
            this.tlds[index] = new Uint16Array(packet.g1()).map((): number => packet.g1());
        }
    }

    private static readBadWords(packet: Packet): void {
        const count: number = packet.g4();
        for (let index: number = 0; index < count; index++) {
            this.badWords[index] = new Uint16Array(packet.g1()).map((): number => packet.g1());
            const combos: number[][] = new Array(packet.g1()).fill([]).map((): number[] => [packet.g1b(), packet.g1b()]);
            if (combos.length > 0) {
                this.badCombinations[index] = combos;
            }
        }
    }

    private static readDomains(packet: Packet): void {
        const count: number = packet.g4();
        for (let index: number = 0; index < count; index++) {
            this.domains[index] = new Uint16Array(packet.g1()).map((): number => packet.g1());
        }
    }

    private static readFragments(packet: Packet): void {
        const count: number = packet.g4();
        for (let index: number = 0; index < count; index++) {
            this.fragments[index] = packet.g2();
        }
    }

    private static filterTlds(chars: string[]): void {
        const period: string[] = [...chars];
        const slash: string[] = [...chars];
        this.filterBadCombinations(null, period, this.PERIOD);
        this.filterBadCombinations(null, slash, this.SLASH);
        for (let index: number = 0; index < this.tlds.length; index++) {
            this.filterTld(slash, this.tldTypes[index], chars, this.tlds[index], period);
        }
    }

    private static filterBadWords(chars: string[]): void {
        for (let comboIndex: number = 0; comboIndex < 2; comboIndex++) {
            for (let index: number = this.badWords.length - 1; index >= 0; index--) {
                this.filterBadCombinations(this.badCombinations[index], chars, this.badWords[index]);
            }
        }
    }

    private static filterDomains(chars: string[]): void {
        const ampersat: string[] = [...chars];
        const period: string[] = [...chars];
        this.filterBadCombinations(null, ampersat, this.AMPERSAT);
        this.filterBadCombinations(null, period, this.PERIOD);
        for (let index: number = this.domains.length - 1; index >= 0; index--) {
            this.filterDomain(period, ampersat, this.domains[index], chars);
        }
    }

    private static filterFragments(chars: string[]): void {
        for (let currentIndex: number = 0; currentIndex < chars.length; ) {
            const numberIndex: number = this.indexOfNumber(chars, currentIndex);
            if (numberIndex === -1) {
                return;
            }

            let isSymbolOrNotLowercaseAlpha: boolean = false;
            for (let index: number = currentIndex; index >= 0 && index < numberIndex && !isSymbolOrNotLowercaseAlpha; index++) {
                if (!this.isSymbol(chars[index]) && !this.isNotLowercaseAlpha(chars[index])) {
                    isSymbolOrNotLowercaseAlpha = true;
                }
            }

            let startIndex: number = 0;

            if (isSymbolOrNotLowercaseAlpha) {
                startIndex = 0;
            }

            if (startIndex === 0) {
                startIndex = 1;
                currentIndex = numberIndex;
            }

            let value: number = 0;
            for (let index: number = numberIndex; index < chars.length && index < currentIndex; index++) {
                value = value * 10 + chars[index].charCodeAt(0) - 48;
            }

            if (value <= 255 && currentIndex - numberIndex <= 8) {
                startIndex++;
            } else {
                startIndex = 0;
            }

            if (startIndex === 4) {
                this.maskChars(numberIndex, currentIndex, chars);
                startIndex = 0;
            }
            currentIndex = this.indexOfNonNumber(currentIndex, chars);
        }
    }

    private static isBadFragment(chars: string[]): boolean {
        if (this.isNumericalChars(chars)) {
            return true;
        }

        const value: number = this.getInteger(chars);
        const fragments: number[] = this.fragments;
        const fragmentsLength: number = fragments.length;

        if (value === fragments[0] || value === fragments[fragmentsLength - 1]) {
            return true;
        }

        let start: number = 0;
        let end: number = fragmentsLength - 1;

        while (start <= end) {
            const mid: number = ((start + end) / 2) | 0;
            if (value === fragments[mid]) {
                return true;
            } else if (value < fragments[mid]) {
                end = mid - 1;
            } else {
                start = mid + 1;
            }
        }
        return false;
    }

    private static getInteger(chars: string[]): number {
        if (chars.length > 6) {
            return 0;
        }
        let value: number = 0;
        for (let index: number = 0; index < chars.length; index++) {
            const char: string = chars[chars.length - index - 1];
            if (this.isLowercaseAlpha(char)) {
                value = value * 38 + char.charCodeAt(0) + 1 - 'a'.charCodeAt(0);
            } else if (char === "'") {
                value = value * 38 + 27;
            } else if (this.isNumerical(char)) {
                value = value * 38 + char.charCodeAt(0) + 28 - '0'.charCodeAt(0);
            } else if (char !== '\u0000') {
                return 0;
            }
        }
        return value;
    }

    private static indexOfNumber(chars: string[], offset: number): number {
        for (let index: number = offset; index < chars.length && index >= 0; index++) {
            if (this.isNumerical(chars[index])) {
                return index;
            }
        }
        return -1;
    }

    private static indexOfNonNumber(offset: number, chars: string[]): number {
        for (let index: number = offset; index < chars.length && index >= 0; index++) {
            if (!this.isNumerical(chars[index])) {
                return index;
            }
        }
        return chars.length;
    }

    private static getEmulatedDomainCharLen(nextChar: string, domainChar: string, currentChar: string): number {
        if (domainChar === currentChar) {
            return 1;
        } else if (domainChar === 'o' && currentChar === '0') {
            return 1;
        } else if (domainChar === 'o' && currentChar === '(' && nextChar === ')') {
            return 2;
        } else if (domainChar === 'c' && (currentChar === '(' || currentChar === '<' || currentChar === '[')) {
            return 1;
        } else if (domainChar === 'e' && currentChar === '€') {
            return 1;
        } else if (domainChar === 's' && currentChar === '$') {
            return 1;
        } else if (domainChar === 'l' && currentChar === 'i') {
            return 1;
        }
        return 0;
    }

    private static filterDomain(period: string[], ampersat: string[], domain: Uint16Array, chars: string[]): void {
        const domainLength: number = domain.length;
        const charsLength: number = chars.length;
        for (let index: number = 0; index <= charsLength - domainLength; index++) {
            const { matched, currentIndex } = this.findMatchingDomain(index, domain, chars);
            if (!matched) {
                continue;
            }
            const ampersatStatus: number = this.prefixSymbolStatus(index, chars, 3, ampersat, ['@']);
            const periodStatus: number = this.suffixSymbolStatus(currentIndex - 1, chars, 3, period, ['.', ',']);
            const shouldFilter: boolean = ampersatStatus > 2 || periodStatus > 2;
            if (!shouldFilter) {
                continue;
            }
            this.maskChars(index, currentIndex, chars);
        }
    }

    private static findMatchingDomain(
        startIndex: number,
        domain: Uint16Array,
        chars: string[]
    ): {
        matched: boolean;
        currentIndex: number;
    } {
        const domainLength: number = domain.length;
        let currentIndex: number = startIndex;
        let domainIndex: number = 0;

        while (currentIndex < chars.length && domainIndex < domainLength) {
            const currentChar: string = chars[currentIndex];
            const nextChar: string = currentIndex + 1 < chars.length ? chars[currentIndex + 1] : '\u0000';
            const currentLength: number = this.getEmulatedDomainCharLen(nextChar, String.fromCharCode(domain[domainIndex]), currentChar);

            if (currentLength > 0) {
                currentIndex += currentLength;
                domainIndex++;
            } else {
                if (domainIndex === 0) break;
                const previousLength: number = this.getEmulatedDomainCharLen(nextChar, String.fromCharCode(domain[domainIndex - 1]), currentChar);

                if (previousLength > 0) {
                    currentIndex += previousLength;
                    if (domainIndex === 1) startIndex++;
                } else {
                    if (domainIndex >= domainLength || !this.isSymbol(currentChar)) break;
                    currentIndex++;
                }
            }
        }

        return { matched: domainIndex >= domainLength, currentIndex };
    }

    private static filterBadCombinations(combos: number[][] | null, chars: string[], bads: Uint16Array): void {
        if (bads.length > chars.length) {
            return;
        }
        for (let startIndex: number = 0; startIndex <= chars.length - bads.length; startIndex++) {
            let currentIndex: number = startIndex;
            const { currentIndex: updatedCurrentIndex, badIndex, hasSymbol, hasNumber, hasDigit } = this.processBadCharacters(chars, bads, currentIndex);
            currentIndex = updatedCurrentIndex;
            let currentChar: string = chars[currentIndex];
            let nextChar: string = currentIndex + 1 < chars.length ? chars[currentIndex + 1] : '\u0000';
            if (!(badIndex >= bads.length && (!hasNumber || !hasDigit))) {
                continue;
            }
            let shouldFilter: boolean = true;
            let localIndex: number;
            if (hasSymbol) {
                let isBeforeSymbol: boolean = false;
                let isAfterSymbol: boolean = false;
                if (startIndex - 1 < 0 || (this.isSymbol(chars[startIndex - 1]) && chars[startIndex - 1] !== "'")) {
                    isBeforeSymbol = true;
                }
                if (currentIndex >= chars.length || (this.isSymbol(chars[currentIndex]) && chars[currentIndex] !== "'")) {
                    isAfterSymbol = true;
                }
                if (!isBeforeSymbol || !isAfterSymbol) {
                    let isSubstringValid: boolean = false;
                    localIndex = startIndex - 2;
                    if (isBeforeSymbol) {
                        localIndex = startIndex;
                    }
                    while (!isSubstringValid && localIndex < currentIndex) {
                        if (localIndex >= 0 && (!this.isSymbol(chars[localIndex]) || chars[localIndex] === "'")) {
                            const localSubString: string[] = [];
                            let localSubStringIndex: number;
                            for (
                                localSubStringIndex = 0;
                                localSubStringIndex < 3 && localIndex + localSubStringIndex < chars.length && (!this.isSymbol(chars[localIndex + localSubStringIndex]) || chars[localIndex + localSubStringIndex] === "'");
                                localSubStringIndex++
                            ) {
                                localSubString[localSubStringIndex] = chars[localIndex + localSubStringIndex];
                            }
                            let isSubStringValidCondition: boolean = true;
                            if (localSubStringIndex === 0) {
                                isSubStringValidCondition = false;
                            }
                            if (localSubStringIndex < 3 && localIndex - 1 >= 0 && (!this.isSymbol(chars[localIndex - 1]) || chars[localIndex - 1] === "'")) {
                                isSubStringValidCondition = false;
                            }
                            if (isSubStringValidCondition && !this.isBadFragment(localSubString)) {
                                isSubstringValid = true;
                            }
                        }
                        localIndex++;
                    }
                    if (!isSubstringValid) {
                        shouldFilter = false;
                    }
                }
            } else {
                currentChar = ' ';
                if (startIndex - 1 >= 0) {
                    currentChar = chars[startIndex - 1];
                }
                nextChar = ' ';
                if (currentIndex < chars.length) {
                    nextChar = chars[currentIndex];
                }
                const current: number = this.getIndex(currentChar);
                const next: number = this.getIndex(nextChar);
                if (combos && this.comboMatches(current, combos, next)) {
                    shouldFilter = false;
                }
            }
            if (!shouldFilter) {
                continue;
            }
            let numeralCount: number = 0;
            let alphaCount: number = 0;
            for (let index: number = startIndex; index < currentIndex; index++) {
                if (this.isNumerical(chars[index])) {
                    numeralCount++;
                } else if (this.isAlpha(chars[index])) {
                    alphaCount++;
                }
            }
            if (numeralCount <= alphaCount) {
                this.maskChars(startIndex, currentIndex, chars);
            }
        }
    }

    private static processBadCharacters(
        chars: string[],
        bads: Uint16Array,
        startIndex: number
    ): {
        currentIndex: number;
        badIndex: number;
        hasSymbol: boolean;
        hasNumber: boolean;
        hasDigit: boolean;
    } {
        let index: number = startIndex;
        let badIndex: number = 0;
        let count: number = 0;
        let hasSymbol: boolean = false;
        let hasNumber: boolean = false;
        let hasDigit: boolean = false;

        for (; index < chars.length && !(hasNumber && hasDigit); ) {
            if (index >= chars.length || (hasNumber && hasDigit)) {
                break;
            }
            const currentChar: string = chars[index];
            const nextChar: string = index + 1 < chars.length ? chars[index + 1] : '\u0000';
            let currentLength: number;

            if (badIndex < bads.length && (currentLength = this.getEmulatedBadCharLen(nextChar, String.fromCharCode(bads[badIndex]), currentChar)) > 0) {
                if (currentLength === 1 && this.isNumerical(currentChar)) {
                    hasNumber = true;
                }
                if (currentLength === 2 && (this.isNumerical(currentChar) || this.isNumerical(nextChar))) {
                    hasNumber = true;
                }
                index += currentLength;
                badIndex++;
            } else {
                if (badIndex === 0) {
                    break;
                }
                let previousLength: number;
                if ((previousLength = this.getEmulatedBadCharLen(nextChar, String.fromCharCode(bads[badIndex - 1]), currentChar)) > 0) {
                    index += previousLength;
                } else {
                    if (badIndex >= bads.length || !this.isNotLowercaseAlpha(currentChar)) {
                        break;
                    }
                    if (this.isSymbol(currentChar) && currentChar !== "'") {
                        hasSymbol = true;
                    }
                    if (this.isNumerical(currentChar)) {
                        hasDigit = true;
                    }
                    index++;
                    count++;
                    if ((((count * 100) / (index - startIndex)) | 0) > 90) {
                        break;
                    }
                }
            }
        }
        return { currentIndex: index, badIndex, hasSymbol, hasNumber, hasDigit };
    }

    private static getEmulatedBadCharLen(nextChar: string, badChar: string, currentChar: string): number {
        if (badChar === currentChar) {
            return 1;
        }
        if (badChar >= 'a' && badChar <= 'm') {
            if (badChar === 'a') {
                if (currentChar !== '4' && currentChar !== '@' && currentChar !== '^') {
                    if (currentChar === '/' && nextChar === '\\') {
                        return 2;
                    }
                    return 0;
                }
                return 1;
            }
            if (badChar === 'b') {
                if (currentChar !== '6' && currentChar !== '8') {
                    if (currentChar === '1' && nextChar === '3') {
                        return 2;
                    }
                    return 0;
                }
                return 1;
            }
            if (badChar === 'c') {
                if (currentChar !== '(' && currentChar !== '<' && currentChar !== '{' && currentChar !== '[') {
                    return 0;
                }
                return 1;
            }
            if (badChar === 'd') {
                if (currentChar === '[' && nextChar === ')') {
                    return 2;
                }
                return 0;
            }
            if (badChar === 'e') {
                if (currentChar !== '3' && currentChar !== '€') {
                    return 0;
                }
                return 1;
            }
            if (badChar === 'f') {
                if (currentChar === 'p' && nextChar === 'h') {
                    return 2;
                }
                if (currentChar === '£') {
                    return 1;
                }
                return 0;
            }
            if (badChar === 'g') {
                if (currentChar !== '9' && currentChar !== '6') {
                    return 0;
                }
                return 1;
            }
            if (badChar === 'h') {
                if (currentChar === '#') {
                    return 1;
                }
                return 0;
            }
            if (badChar === 'i') {
                if (currentChar !== 'y' && currentChar !== 'l' && currentChar !== 'j' && currentChar !== '1' && currentChar !== '!' && currentChar !== ':' && currentChar !== ';' && currentChar !== '|') {
                    return 0;
                }
                return 1;
            }
            if (badChar === 'j') {
                return 0;
            }
            if (badChar === 'k') {
                return 0;
            }
            if (badChar === 'l') {
                if (currentChar !== '1' && currentChar !== '|' && currentChar !== 'i') {
                    return 0;
                }
                return 1;
            }
            if (badChar === 'm') {
                return 0;
            }
        }
        if (badChar >= 'n' && badChar <= 'z') {
            if (badChar === 'n') {
                return 0;
            }
            if (badChar === 'o') {
                if (currentChar !== '0' && currentChar !== '*') {
                    if ((currentChar !== '(' || nextChar !== ')') && (currentChar !== '[' || nextChar !== ']') && (currentChar !== '{' || nextChar !== '}') && (currentChar !== '<' || nextChar !== '>')) {
                        return 0;
                    }
                    return 2;
                }
                return 1;
            }
            if (badChar === 'p') {
                return 0;
            }
            if (badChar === 'q') {
                return 0;
            }
            if (badChar === 'r') {
                return 0;
            }
            if (badChar === 's') {
                if (currentChar !== '5' && currentChar !== 'z' && currentChar !== '$' && currentChar !== '2') {
                    return 0;
                }
                return 1;
            }
            if (badChar === 't') {
                if (currentChar !== '7' && currentChar !== '+') {
                    return 0;
                }
                return 1;
            }
            if (badChar === 'u') {
                if (currentChar === 'v') {
                    return 1;
                }
                if ((currentChar !== '\\' || nextChar !== '/') && (currentChar !== '\\' || nextChar !== '|') && (currentChar !== '|' || nextChar !== '/')) {
                    return 0;
                }
                return 2;
            }
            if (badChar === 'v') {
                if ((currentChar !== '\\' || nextChar !== '/') && (currentChar !== '\\' || nextChar !== '|') && (currentChar !== '|' || nextChar !== '/')) {
                    return 0;
                }
                return 2;
            }
            if (badChar === 'w') {
                if (currentChar === 'v' && nextChar === 'v') {
                    return 2;
                }
                return 0;
            }
            if (badChar === 'x') {
                if ((currentChar !== ')' || nextChar !== '(') && (currentChar !== '}' || nextChar !== '{') && (currentChar !== ']' || nextChar !== '[') && (currentChar !== '>' || nextChar !== '<')) {
                    return 0;
                }
                return 2;
            }
            if (badChar === 'y') {
                return 0;
            }
            if (badChar === 'z') {
                return 0;
            }
        }
        if (badChar >= '0' && badChar <= '9') {
            if (badChar === '0') {
                if (currentChar === 'o' || currentChar === 'O') {
                    return 1;
                } else if ((currentChar !== '(' || nextChar !== ')') && (currentChar !== '{' || nextChar !== '}') && (currentChar !== '[' || nextChar !== ']')) {
                    return 0;
                } else {
                    return 2;
                }
            } else if (badChar === '1') {
                return currentChar === 'l' ? 1 : 0;
            } else {
                return 0;
            }
        } else if (badChar === ',') {
            return currentChar === '.' ? 1 : 0;
        } else if (badChar === '.') {
            return currentChar === ',' ? 1 : 0;
        } else if (badChar === '!') {
            return currentChar === 'i' ? 1 : 0;
        }
        return 0;
    }

    private static comboMatches(currentIndex: number, combos: number[][], nextIndex: number): boolean {
        let start: number = 0;
        let end: number = combos.length - 1;

        while (start <= end) {
            const mid: number = ((start + end) / 2) | 0;
            if (combos[mid][0] === currentIndex && combos[mid][1] === nextIndex) {
                return true;
            } else if (currentIndex < combos[mid][0] || (currentIndex === combos[mid][0] && nextIndex < combos[mid][1])) {
                end = mid - 1;
            } else {
                start = mid + 1;
            }
        }
        return false;
    }

    private static getIndex(char: string): number {
        if (this.isLowercaseAlpha(char)) {
            return char.charCodeAt(0) + 1 - 'a'.charCodeAt(0);
        } else if (char === "'") {
            return 28;
        } else if (this.isNumerical(char)) {
            return char.charCodeAt(0) + 29 - '0'.charCodeAt(0);
        }
        return 27;
    }

    private static filterTld(slash: string[], tldType: number, chars: string[], tld: Uint16Array, period: string[]): void {
        if (tld.length > chars.length) {
            return;
        }
        for (let index: number = 0; index <= chars.length - tld.length; index++) {
            const { currentIndex, tldIndex } = this.processTlds(chars, tld, index);
            if (tldIndex < tld.length) {
                continue;
            }
            let shouldFilter: boolean = false;
            const periodFilterStatus: number = this.prefixSymbolStatus(index, chars, 3, period, [',', '.']);
            const slashFilterStatus: number = this.suffixSymbolStatus(currentIndex - 1, chars, 5, slash, ['\\', '/']);
            if (tldType === 1 && periodFilterStatus > 0 && slashFilterStatus > 0) {
                shouldFilter = true;
            }
            if (tldType === 2 && ((periodFilterStatus > 2 && slashFilterStatus > 0) || (periodFilterStatus > 0 && slashFilterStatus > 2))) {
                shouldFilter = true;
            }
            if (tldType === 3 && periodFilterStatus > 0 && slashFilterStatus > 2) {
                shouldFilter = true;
            }
            if (!shouldFilter) {
                continue;
            }
            let startFilterIndex: number = index;
            let endFilterIndex: number = currentIndex - 1;
            let foundPeriod: boolean = false;
            let periodIndex: number;
            if (periodFilterStatus > 2) {
                if (periodFilterStatus === 4) {
                    foundPeriod = false;
                    for (periodIndex = index - 1; periodIndex >= 0; periodIndex--) {
                        if (foundPeriod) {
                            if (period[periodIndex] !== '*') {
                                break;
                            }
                            startFilterIndex = periodIndex;
                        } else if (period[periodIndex] === '*') {
                            startFilterIndex = periodIndex;
                            foundPeriod = true;
                        }
                    }
                }
                foundPeriod = false;
                for (periodIndex = startFilterIndex - 1; periodIndex >= 0; periodIndex--) {
                    if (foundPeriod) {
                        if (this.isSymbol(chars[periodIndex])) {
                            break;
                        }
                        startFilterIndex = periodIndex;
                    } else if (!this.isSymbol(chars[periodIndex])) {
                        foundPeriod = true;
                        startFilterIndex = periodIndex;
                    }
                }
            }
            if (slashFilterStatus > 2) {
                if (slashFilterStatus === 4) {
                    foundPeriod = false;
                    for (periodIndex = endFilterIndex + 1; periodIndex < chars.length; periodIndex++) {
                        if (foundPeriod) {
                            if (slash[periodIndex] !== '*') {
                                break;
                            }
                            endFilterIndex = periodIndex;
                        } else if (slash[periodIndex] === '*') {
                            endFilterIndex = periodIndex;
                            foundPeriod = true;
                        }
                    }
                }
                foundPeriod = false;
                for (periodIndex = endFilterIndex + 1; periodIndex < chars.length; periodIndex++) {
                    if (foundPeriod) {
                        if (this.isSymbol(chars[periodIndex])) {
                            break;
                        }
                        endFilterIndex = periodIndex;
                    } else if (!this.isSymbol(chars[periodIndex])) {
                        foundPeriod = true;
                        endFilterIndex = periodIndex;
                    }
                }
            }
            this.maskChars(startFilterIndex, endFilterIndex + 1, chars);
        }
    }

    private static processTlds(
        chars: string[],
        tld: Uint16Array,
        currentIndex: number
    ): {
        currentIndex: number;
        tldIndex: number;
    } {
        let tldIndex: number = 0;
        while (currentIndex < chars.length && tldIndex < tld.length) {
            const currentChar: string = chars[currentIndex];
            const nextChar: string = currentIndex + 1 < chars.length ? chars[currentIndex + 1] : '\u0000';
            let currentLength: number;

            if ((currentLength = this.getEmulatedDomainCharLen(nextChar, String.fromCharCode(tld[tldIndex]), currentChar)) > 0) {
                currentIndex += currentLength;
                tldIndex++;
            } else {
                if (tldIndex === 0) {
                    break;
                }
                let previousLength: number;
                if ((previousLength = this.getEmulatedDomainCharLen(nextChar, String.fromCharCode(tld[tldIndex - 1]), currentChar)) > 0) {
                    currentIndex += previousLength;
                } else {
                    if (!this.isSymbol(currentChar)) {
                        break;
                    }
                    currentIndex++;
                }
            }
        }
        return { currentIndex, tldIndex };
    }

    private static isSymbol(char: string): boolean {
        return !this.isAlpha(char) && !this.isNumerical(char);
    }

    private static isNotLowercaseAlpha(char: string): boolean {
        return this.isLowercaseAlpha(char) ? char === 'v' || char === 'x' || char === 'j' || char === 'q' || char === 'z' : true;
    }

    private static isAlpha(char: string): boolean {
        return this.isLowercaseAlpha(char) || this.isUppercaseAlpha(char);
    }

    private static isNumerical(char: string): boolean {
        return char >= '0' && char <= '9';
    }

    private static isLowercaseAlpha(char: string): boolean {
        return char >= 'a' && char <= 'z';
    }

    private static isUppercaseAlpha(char: string): boolean {
        return char >= 'A' && char <= 'Z';
    }

    private static isNumericalChars(chars: string[]): boolean {
        for (let index: number = 0; index < chars.length; index++) {
            if (!this.isNumerical(chars[index]) && chars[index] !== '\u0000') {
                return false;
            }
        }
        return true;
    }

    private static maskChars(offset: number, length: number, chars: string[]): void {
        for (let index: number = offset; index < length; index++) {
            chars[index] = '*';
        }
    }

    private static maskedCountBackwards(chars: string[], offset: number): number {
        let count: number = 0;
        for (let index: number = offset - 1; index >= 0 && this.isSymbol(chars[index]); index--) {
            if (chars[index] === '*') {
                count++;
            }
        }
        return count;
    }

    private static maskedCountForwards(chars: string[], offset: number): number {
        let count: number = 0;
        for (let index: number = offset + 1; index < chars.length && this.isSymbol(chars[index]); index++) {
            if (chars[index] === '*') {
                count++;
            }
        }
        return count;
    }

    private static maskedCharsStatus(chars: string[], filtered: string[], offset: number, length: number, prefix: boolean): number {
        const count: number = prefix ? this.maskedCountBackwards(filtered, offset) : this.maskedCountForwards(filtered, offset);
        if (count >= length) {
            return 4;
        } else if (this.isSymbol(prefix ? chars[offset - 1] : chars[offset + 1])) {
            return 1;
        }
        return 0;
    }

    private static prefixSymbolStatus(offset: number, chars: string[], length: number, symbolChars: string[], symbols: string[]): number {
        if (offset === 0) {
            return 2;
        }
        for (let index: number = offset - 1; index >= 0 && this.isSymbol(chars[index]); index--) {
            if (symbols.includes(chars[index])) {
                return 3;
            }
        }
        return this.maskedCharsStatus(chars, symbolChars, offset, length, true);
    }

    private static suffixSymbolStatus(offset: number, chars: string[], length: number, symbolChars: string[], symbols: string[]): number {
        if (offset + 1 === chars.length) {
            return 2;
        }
        for (let index: number = offset + 1; index < chars.length && this.isSymbol(chars[index]); index++) {
            if (symbols.includes(chars[index])) {
                return 3;
            }
        }
        return this.maskedCharsStatus(chars, symbolChars, offset, length, false);
    }

    private static format(chars: string[]): void {
        let pos: number = 0;
        for (let index: number = 0; index < chars.length; index++) {
            if (this.isCharacterAllowed(chars[index])) {
                chars[pos] = chars[index];
            } else {
                chars[pos] = ' ';
            }
            if (pos === 0 || chars[pos] !== ' ' || chars[pos - 1] !== ' ') {
                pos++;
            }
        }
        for (let index: number = pos; index < chars.length; index++) {
            chars[index] = ' ';
        }
    }

    private static isCharacterAllowed(char: string): boolean {
        return (char >= ' ' && char <= '\u007f') || char === ' ' || char === '\n' || char === '\t' || char === '£' || char === '€';
    }

    private static replaceUppercases(chars: string[], comparison: string[]): void {
        for (let index: number = 0; index < comparison.length; index++) {
            if (chars[index] !== '*' && this.isUppercaseAlpha(comparison[index])) {
                chars[index] = comparison[index];
            }
        }
    }

    private static formatUppercases(chars: string[]): void {
        let flagged: boolean = true;
        for (let index: number = 0; index < chars.length; index++) {
            const char: string = chars[index];
            if (!this.isAlpha(char)) {
                flagged = true;
            } else if (flagged) {
                if (this.isLowercaseAlpha(char)) {
                    flagged = false;
                }
            } else if (this.isUppercaseAlpha(char)) {
                chars[index] = String.fromCharCode(char.charCodeAt(0) + 'a'.charCodeAt(0) - 65);
            }
        }
    }
}
