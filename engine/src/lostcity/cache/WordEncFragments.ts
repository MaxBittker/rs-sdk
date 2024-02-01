import WordEnc from '#lostcity/cache/WordEnc.js';

export default class WordEncFragments {
    readonly fragments: number[] = [];

    filter(chars: string[]): void {
        for (let currentIndex = 0; currentIndex < chars.length; ) {
            const numberIndex = this.indexOfNumber(chars, currentIndex);
            if (numberIndex === -1) {
                return;
            }

            let isSymbolOrNotLowercaseAlpha = false;
            for (let index = currentIndex; index >= 0 && index < numberIndex && !isSymbolOrNotLowercaseAlpha; index++) {
                if (!WordEnc.isSymbol(chars[index]) && !WordEnc.isNotLowercaseAlpha(chars[index])) {
                    isSymbolOrNotLowercaseAlpha = true;
                }
            }

            let startIndex = 0;

            if (isSymbolOrNotLowercaseAlpha) {
                startIndex = 0;
            }

            if (startIndex === 0) {
                startIndex = 1;
                currentIndex = numberIndex;
            }

            let value = 0;
            for (let index = numberIndex; index < chars.length && index < currentIndex; index++) {
                value = value * 10 + chars[index].charCodeAt(0) - 48;
            }

            if (value <= 255 && currentIndex - numberIndex <= 8) {
                startIndex++;
            } else {
                startIndex = 0;
            }

            if (startIndex === 4) {
                WordEnc.maskChars(numberIndex, currentIndex, chars);
                startIndex = 0;
            }
            currentIndex = this.indexOfNonNumber(currentIndex, chars);
        }
    }

    isBadFragment(chars: string[]): boolean {
        if (WordEnc.isNumericalChars(chars)) {
            return true;
        }

        const value = this.getInteger(chars);
        const fragments = this.fragments;
        const fragmentsLength = fragments.length;

        if (value === fragments[0] || value === fragments[fragmentsLength - 1]) {
            return true;
        }

        let start = 0;
        let end = fragmentsLength - 1;

        while (start <= end) {
            const mid = Math.floor((start + end) / 2); // client does not floor here
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

    private getInteger(chars: string[]): number {
        if (chars.length > 6) {
            return 0;
        }
        let value = 0;
        for (let index = 0; index < chars.length; index++) {
            const char = chars[chars.length - index - 1];
            if (WordEnc.isLowercaseAlpha(char)) {
                value = value * 38 + char.charCodeAt(0) + 1 - 'a'.charCodeAt(0);
            } else if (char == "'") {
                value = value * 38 + 27;
            } else if (WordEnc.isNumerical(char)) {
                value = value * 38 + char.charCodeAt(0) + 28 - '0'.charCodeAt(0);
            } else if (char != '\u0000') {
                return 0;
            }
        }
        return value;
    }

    private indexOfNumber(chars: string[], offset: number): number {
        for (let index = offset; index < chars.length && index >= 0; index++) {
            if (WordEnc.isNumerical(chars[index])) {
                return index;
            }
        }
        return -1;
    }

    private indexOfNonNumber(offset: number, chars: string[]): number {
        for (let index = offset; index < chars.length && index >= 0; index++) {
            if (!WordEnc.isNumerical(chars[index])) {
                return index;
            }
        }
        return chars.length;
    }
}
