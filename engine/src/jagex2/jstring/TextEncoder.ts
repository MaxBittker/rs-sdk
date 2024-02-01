import Packet from '#jagex2/io/Packet.js';

export default class TextEncoder {
    // prettier-ignore
    private static CHAR_LOOKUP: string[] = [
    ' ',
    'e', 't', 'a', 'o', 'i', 'h', 'n', 's', 'r', 'd', 'l', 'u', 'm',
    'w', 'c', 'y', 'f', 'g', 'p', 'b', 'v', 'k', 'x', 'j', 'q', 'z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    ' ', '!', '?', '.', ',', ':', ';', '(', ')', '-',
    '&', '*', '\\', '\'', '@', '#', '+', '=', '£', '$', '%', '"', '[', ']'
  ];

    static decode(packet: Packet, length: number): string {
        const charBuffer: string[] = [];
        let pos: number = 0;
        let carry: number = -1;
        let nibble: number;
        for (let i: number = 0; i < length && pos < 100; i++) {
            const data: number = packet.g1();
            nibble = (data >> 4) & 0xf;
            if (carry !== -1) {
                charBuffer[pos++] = this.CHAR_LOOKUP[(carry << 4) + nibble - 195];
                carry = -1;
            } else if (nibble < 13) {
                charBuffer[pos++] = this.CHAR_LOOKUP[nibble];
            } else {
                carry = nibble;
            }
            nibble = data & 0xf;
            if (carry != -1) {
                charBuffer[pos++] = this.CHAR_LOOKUP[(carry << 4) + nibble - 195];
                carry = -1;
            } else if (nibble < 13) {
                charBuffer[pos++] = this.CHAR_LOOKUP[nibble];
            } else {
                carry = nibble;
            }
        }
        return this.toSentenceCase(charBuffer.slice(0, pos).join('')).trim();
    }

    static encode(packet: Packet, input: string): void {
        if (input.length > 80) {
            input = input.substring(0, 80);
        }
        input = input.toLowerCase();
        let carry: number = -1;
        for (let i: number = 0; i < input.length; i++) {
            const char: string = input.charAt(i);
            let index: number = 0;
            for (let j: number = 0; j < this.CHAR_LOOKUP.length; j++) {
                if (char === this.CHAR_LOOKUP[j]) {
                    index = j;
                    break;
                }
            }
            if (index > 12) {
                index += 195;
            }
            if (carry == -1) {
                if (index < 13) {
                    carry = index;
                } else {
                    packet.p1(index);
                }
            } else if (index < 13) {
                packet.p1((carry << 4) + index);
                carry = -1;
            } else {
                packet.p1((carry << 4) + (index >> 4));
                carry = index & 0xf;
            }
        }
        if (carry != -1) {
            packet.p1(carry << 4);
        }
    }

    static toSentenceCase(input: string): string {
        const chars: string[] = [...input.toLowerCase()];
        let punctuation: boolean = true;
        for (let index: number = 0; index < chars.length; index++) {
            const char: string = chars[index];
            if (punctuation && char >= 'a' && char <= 'z') {
                chars[index] = char.toUpperCase();
                punctuation = false;
            }
            if (char === '.' || char === '!') {
                punctuation = true;
            }
        }
        return chars.join('');
    }
}
