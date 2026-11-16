import Packet from '#/io/Packet.js';

export default class WordPack {
    // prettier-ignore
    private static TABLE: string[] = [
        ' ', 'e', 't', 'a', 'o', 'i', 'h', 'n', 's', 'r', 'd', 'l', 'u',
        'm', 'w', 'c', 'y', 'f', 'g', 'p', 'b', 'v', 'k', 'x', 'j', 'q', 'z',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
        ' ', '!', '?', '.', ',', ':', ';', '(', ')', '-', '&', '*', '\\', '\'', '@', '#', '+', '=', '£', '$', '%', '"', '[', ']'
    ];

    private static builder: string[] = [];
    // rs-sdk: upstream sizes this 100 bytes; our chat packs up to ~241 bytes (MAX_PACKED_BYTES + carry).
    private static temp: Packet = new Packet(new Uint8Array(256));

    // Safety bound only, NOT the chat cap. The real per-message limit is the
    // server-configured maxMessageLength, enforced at the call sites (Client.say,
    // lite say) before pack and by the server before broadcast. 512 sits above
    // the wire ceiling (~509 chars: 1-byte frame length, ~2 chars per packed
    // byte), so this clamp never truncates a legitimate message.
    private static readonly MAX_CHARS = 512;

    static unpack(word: Packet, length: number): string {
        let pos: number = 0;
        let carry: number = -1;
        let nibble: number;
        for (let index: number = 0; index < length && pos < this.MAX_CHARS; index++) {
            const value: number = word.g1();
            nibble = (value >> 4) & 0xf;
            if (carry !== -1) {
                this.builder[pos++] = this.TABLE[(carry << 4) + nibble - 195];
                carry = -1;
            } else if (nibble < 13) {
                this.builder[pos++] = this.TABLE[nibble];
            } else {
                carry = nibble;
            }
            nibble = value & 0xf;
            if (carry !== -1) {
                this.builder[pos++] = this.TABLE[(carry << 4) + nibble - 195];
                carry = -1;
            } else if (nibble < 13) {
                this.builder[pos++] = this.TABLE[nibble];
            } else {
                carry = nibble;
            }
        }
        let uppercase: boolean = true;
        for (let index: number = 0; index < pos; index++) {
            const char: string = this.builder[index];
            if (uppercase && char >= 'a' && char <= 'z') {
                this.builder[index] = char.toUpperCase();
                uppercase = false;
            }
            if (char === '.' || char === '!' || char === '?') {
                uppercase = true;
            }
        }
        return this.builder.slice(0, pos).join('');
    }

    static sanitize(str: string): string {
        this.temp.pos = 0;
        this.pack(this.temp, str);
        const length: number = this.temp.pos;
        this.temp.pos = 0;
        return this.unpack(this.temp, length);
    }

    /**
     * Frame-safety clamp, mirroring the engine's WordPack. Chat frames carry a
     * 1-byte length; digits/punctuation pack to 2 nibbles (vs 1 for common
     * chars), so long text heavy in those can exceed 255 packed bytes even
     * under the char cap - the length byte would wrap and corrupt the stream.
     */
    private static readonly MAX_PACKED_BYTES = 240;

    private static truncateToByteBudget(str: string): string {
        let nibbles: number = 0;
        for (let index: number = 0; index < str.length; index++) {
            let currentChar: number = this.TABLE.indexOf(str.charAt(index));
            if (currentChar < 0) currentChar = 0; // pack() maps unknown chars to ' ' (1 nibble)
            nibbles += currentChar > 12 ? 2 : 1;
            if (nibbles > this.MAX_PACKED_BYTES * 2) {
                return str.substring(0, index);
            }
        }
        return str;
    }

    static pack(word: Packet, str: string): void {
        if (str.length > this.MAX_CHARS) {
            str = str.substring(0, this.MAX_CHARS);
        }
        str = str.toLowerCase();
        str = this.truncateToByteBudget(str);
        let carry: number = -1;
        for (let index: number = 0; index < str.length; index++) {
            const char: string = str.charAt(index);
            let currentChar: number = 0;
            for (let lookupIndex: number = 0; lookupIndex < this.TABLE.length; lookupIndex++) {
                if (char === this.TABLE[lookupIndex]) {
                    currentChar = lookupIndex;
                    break;
                }
            }
            if (currentChar > 12) {
                currentChar += 195;
            }
            if (carry === -1) {
                if (currentChar < 13) {
                    carry = currentChar;
                } else {
                    word.p1(currentChar);
                }
            } else if (currentChar < 13) {
                word.p1((carry << 4) + currentChar);
                carry = -1;
            } else {
                word.p1((carry << 4) + (currentChar >> 4));
                carry = currentChar & 0xf;
            }
        }
        if (carry !== -1) {
            word.p1(carry << 4);
        }
    }
}
