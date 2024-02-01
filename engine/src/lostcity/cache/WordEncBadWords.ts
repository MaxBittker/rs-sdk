import WordEnc from '#lostcity/cache/WordEnc.js';
import WordEncFragments from '#lostcity/cache/WordEncFragments.js';

export default class WordEncBadWords {
    private readonly wordEncFragments: WordEncFragments;

    readonly bads: Uint16Array[] = [];
    readonly badCombinations: number[][][] = [];

    constructor(wordEncFragments: WordEncFragments) {
        this.wordEncFragments = wordEncFragments;
    }

    filter(chars: string[]): void {
        for (let comboIndex = 0; comboIndex < 2; comboIndex++) {
            for (let index = this.bads.length - 1; index >= 0; index--) {
                this.filterBadCombinations(this.badCombinations[index], chars, this.bads[index]);
            }
        }
    }

    filterBadCombinations(combos: number[][] | null, chars: string[], bads: Uint16Array): void {
        if (bads.length > chars.length) {
            return;
        }
        for (let startIndex = 0; startIndex <= chars.length - bads.length; startIndex++) {
            let currentIndex = startIndex;
            const { currentIndex: updatedCurrentIndex, badIndex, hasSymbol, hasNumber, hasDigit } = this.processBadCharacters(chars, bads, currentIndex);
            currentIndex = updatedCurrentIndex;
            let currentChar = chars[currentIndex];
            let nextChar = currentIndex + 1 < chars.length ? chars[currentIndex + 1] : '\u0000';
            if (!(badIndex >= bads.length && (!hasNumber || !hasDigit))) {
                continue;
            }
            let shouldFilter = true;
            let localIndex;
            if (hasSymbol) {
                let isBeforeSymbol = false;
                let isAfterSymbol = false;
                if (startIndex - 1 < 0 || (WordEnc.isSymbol(chars[startIndex - 1]) && chars[startIndex - 1] != "'")) {
                    isBeforeSymbol = true;
                }
                if (currentIndex >= chars.length || (WordEnc.isSymbol(chars[currentIndex]) && chars[currentIndex] != "'")) {
                    isAfterSymbol = true;
                }
                if (!isBeforeSymbol || !isAfterSymbol) {
                    let isSubstringValid = false;
                    localIndex = startIndex - 2;
                    if (isBeforeSymbol) {
                        localIndex = startIndex;
                    }
                    while (!isSubstringValid && localIndex < currentIndex) {
                        if (localIndex >= 0 && (!WordEnc.isSymbol(chars[localIndex]) || chars[localIndex] == "'")) {
                            const localSubString: string[] = [];
                            let localSubStringIndex;
                            for (
                                localSubStringIndex = 0;
                                localSubStringIndex < 3 && localIndex + localSubStringIndex < chars.length && (!WordEnc.isSymbol(chars[localIndex + localSubStringIndex]) || chars[localIndex + localSubStringIndex] == "'");
                                localSubStringIndex++
                            ) {
                                localSubString[localSubStringIndex] = chars[localIndex + localSubStringIndex];
                            }
                            let isSubStringValidCondition = true;
                            if (localSubStringIndex == 0) {
                                isSubStringValidCondition = false;
                            }
                            if (localSubStringIndex < 3 && localIndex - 1 >= 0 && (!WordEnc.isSymbol(chars[localIndex - 1]) || chars[localIndex - 1] == "'")) {
                                isSubStringValidCondition = false;
                            }
                            if (isSubStringValidCondition && !this.wordEncFragments.isBadFragment(localSubString)) {
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
                const current = this.getIndex(currentChar);
                const next = this.getIndex(nextChar);
                if (combos != null && this.comboMatches(current, combos, next)) {
                    shouldFilter = false;
                }
            }
            if (!shouldFilter) {
                continue;
            }
            let numeralCount = 0;
            let alphaCount = 0;
            for (let index = startIndex; index < currentIndex; index++) {
                if (WordEnc.isNumerical(chars[index])) {
                    numeralCount++;
                } else if (WordEnc.isAlpha(chars[index])) {
                    alphaCount++;
                }
            }
            if (numeralCount <= alphaCount) {
                WordEnc.maskChars(startIndex, currentIndex, chars);
            }
        }
    }

    private processBadCharacters(
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
        let index = startIndex;
        let badIndex = 0;
        let count = 0;
        let hasSymbol = false;
        let hasNumber = false;
        let hasDigit = false;

        for (; index < chars.length && !(hasNumber && hasDigit); ) {
            if (index >= chars.length || (hasNumber && hasDigit)) {
                break;
            }
            const currentChar = chars[index];
            const nextChar = index + 1 < chars.length ? chars[index + 1] : '\u0000';
            let currentLength: number;

            if (badIndex < bads.length && (currentLength = this.getEmulatedBadCharLen(nextChar, String.fromCharCode(bads[badIndex]), currentChar)) > 0) {
                if (currentLength === 1 && WordEnc.isNumerical(currentChar)) {
                    hasNumber = true;
                }
                if (currentLength === 2 && (WordEnc.isNumerical(currentChar) || WordEnc.isNumerical(nextChar))) {
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
                    if (badIndex >= bads.length || !WordEnc.isNotLowercaseAlpha(currentChar)) {
                        break;
                    }
                    if (WordEnc.isSymbol(currentChar) && currentChar !== "'") {
                        hasSymbol = true;
                    }
                    if (WordEnc.isNumerical(currentChar)) {
                        hasDigit = true;
                    }
                    index++;
                    count++;
                    if ((count * 100) / (index - startIndex) > 90) {
                        break;
                    }
                }
            }
        }
        return {
            currentIndex: index,
            badIndex,
            hasSymbol,
            hasNumber,
            hasDigit
        };
    }

    private getEmulatedBadCharLen(nextChar: string, badChar: string, currentChar: string): number {
        if (badChar == currentChar) {
            return 1;
        }
        if (badChar >= 'a' && badChar <= 'm') {
            if (badChar == 'a') {
                if (currentChar != '4' && currentChar != '@' && currentChar != '^') {
                    if (currentChar == '/' && nextChar == '\\') {
                        return 2;
                    }
                    return 0;
                }
                return 1;
            }
            if (badChar == 'b') {
                if (currentChar != '6' && currentChar != '8') {
                    if (currentChar == '1' && nextChar == '3') {
                        return 2;
                    }
                    return 0;
                }
                return 1;
            }
            if (badChar == 'c') {
                if (currentChar != '(' && currentChar != '<' && currentChar != '{' && currentChar != '[') {
                    return 0;
                }
                return 1;
            }
            if (badChar == 'd') {
                if (currentChar == '[' && nextChar == ')') {
                    return 2;
                }
                return 0;
            }
            if (badChar == 'e') {
                if (currentChar != '3' && currentChar != '€') {
                    return 0;
                }
                return 1;
            }
            if (badChar == 'f') {
                if (currentChar == 'p' && nextChar == 'h') {
                    return 2;
                }
                if (currentChar == '£') {
                    return 1;
                }
                return 0;
            }
            if (badChar == 'g') {
                if (currentChar != '9' && currentChar != '6') {
                    return 0;
                }
                return 1;
            }
            if (badChar == 'h') {
                if (currentChar == '#') {
                    return 1;
                }
                return 0;
            }
            if (badChar == 'i') {
                if (currentChar != 'y' && currentChar != 'l' && currentChar != 'j' && currentChar != '1' && currentChar != '!' && currentChar != ':' && currentChar != ';' && currentChar != '|') {
                    return 0;
                }
                return 1;
            }
            if (badChar == 'j') {
                return 0;
            }
            if (badChar == 'k') {
                return 0;
            }
            if (badChar == 'l') {
                if (currentChar != '1' && currentChar != '|' && currentChar != 'i') {
                    return 0;
                }
                return 1;
            }
            if (badChar == 'm') {
                return 0;
            }
        }
        if (badChar >= 'n' && badChar <= 'z') {
            if (badChar == 'n') {
                return 0;
            }
            if (badChar == 'o') {
                if (currentChar != '0' && currentChar != '*') {
                    if ((currentChar != '(' || nextChar != ')') && (currentChar != '[' || nextChar != ']') && (currentChar != '{' || nextChar != '}') && (currentChar != '<' || nextChar != '>')) {
                        return 0;
                    }
                    return 2;
                }
                return 1;
            }
            if (badChar == 'p') {
                return 0;
            }
            if (badChar == 'q') {
                return 0;
            }
            if (badChar == 'r') {
                return 0;
            }
            if (badChar == 's') {
                if (currentChar != '5' && currentChar != 'z' && currentChar != '$' && currentChar != '2') {
                    return 0;
                }
                return 1;
            }
            if (badChar == 't') {
                if (currentChar != '7' && currentChar != '+') {
                    return 0;
                }
                return 1;
            }
            if (badChar == 'u') {
                if (currentChar == 'v') {
                    return 1;
                }
                if ((currentChar != '\\' || nextChar != '/') && (currentChar != '\\' || nextChar != '|') && (currentChar != '|' || nextChar != '/')) {
                    return 0;
                }
                return 2;
            }
            if (badChar == 'v') {
                if ((currentChar != '\\' || nextChar != '/') && (currentChar != '\\' || nextChar != '|') && (currentChar != '|' || nextChar != '/')) {
                    return 0;
                }
                return 2;
            }
            if (badChar == 'w') {
                if (currentChar == 'v' && nextChar == 'v') {
                    return 2;
                }
                return 0;
            }
            if (badChar == 'x') {
                if ((currentChar != ')' || nextChar != '(') && (currentChar != '}' || nextChar != '{') && (currentChar != ']' || nextChar != '[') && (currentChar != '>' || nextChar != '<')) {
                    return 0;
                }
                return 2;
            }
            if (badChar == 'y') {
                return 0;
            }
            if (badChar == 'z') {
                return 0;
            }
        }
        if (badChar >= '0' && badChar <= '9') {
            if (badChar == '0') {
                if (currentChar == 'o' || currentChar == 'O') {
                    return 1;
                } else if ((currentChar != '(' || nextChar != ')') && (currentChar != '{' || nextChar != '}') && (currentChar != '[' || nextChar != ']')) {
                    return 0;
                } else {
                    return 2;
                }
            } else if (badChar == '1') {
                return currentChar == 'l' ? 1 : 0;
            } else {
                return 0;
            }
        } else if (badChar == ',') {
            return currentChar == '.' ? 1 : 0;
        } else if (badChar == '.') {
            return currentChar == ',' ? 1 : 0;
        } else if (badChar == '!') {
            return currentChar == 'i' ? 1 : 0;
        }
        return 0;
    }

    private comboMatches(currentIndex: number, combos: number[][], nextIndex: number): boolean {
        let start = 0;
        let end = combos.length - 1;

        while (start <= end) {
            const mid = Math.floor((start + end) / 2); // client does not floor here
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

    private getIndex(char: string): number {
        if (WordEnc.isLowercaseAlpha(char)) {
            return char.charCodeAt(0) + 1 - 'a'.charCodeAt(0);
        } else if (char == "'") {
            return 28;
        } else if (WordEnc.isNumerical(char)) {
            return char.charCodeAt(0) + 29 - '0'.charCodeAt(0);
        }
        return 27;
    }
}
