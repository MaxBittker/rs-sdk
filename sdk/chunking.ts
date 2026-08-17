/**
 * Chat message chunking, shared by the SDK's say() and the gateway's HTTP say
 * endpoint. Lives in its own module so the gateway can import it without
 * pulling in the full SDK (pathfinding, collision data, puppeteer glue).
 */

/**
 * Nibble-cost mirror of the client's WordPack encoding: the 13 most common
 * chars pack to 1 nibble, everything else (digits, punctuation, rarer letters)
 * to 2. Chat frames carry a 1-byte length, so packed text is limited to ~240
 * bytes (480 nibbles) regardless of the char cap - digit-heavy text hits it
 * well before 400 chars.
 */
const WORDPACK_COMMON_CHARS = ' etaoihnsrdlu';
const MAX_PACKED_NIBBLES = 240 * 2;

function packedNibbles(text: string): number {
    let nibbles = 0;
    for (const ch of text.toLowerCase()) {
        nibbles += WORDPACK_COMMON_CHARS.includes(ch) ? 1 : 2;
    }
    return nibbles;
}

/**
 * Split text into chunks on word boundaries such that each chunk fits both the
 * char cap and the wire's packed-byte budget (so the client never silently
 * truncates a chunk). Words too big for one chunk are hard-split so nothing is
 * dropped. Exported for tests.
 */
export function chunkMessage(text: string, maxLen: number): string[] {
    const fits = (s: string) => s.length <= maxLen && packedNibbles(s) <= MAX_PACKED_NIBBLES;
    const chunks: string[] = [];
    let current = '';
    for (const word of text.trim().split(/\s+/)) {
        // A single oversized word: flush, then hard-split it greedily.
        if (!fits(word)) {
            if (current) { chunks.push(current); current = ''; }
            let rest = word;
            while (rest.length > 0) {
                let take = Math.min(rest.length, maxLen);
                while (take > 1 && !fits(rest.slice(0, take))) take--;
                chunks.push(rest.slice(0, take));
                rest = rest.slice(take);
            }
            continue;
        }
        const candidate = current ? `${current} ${word}` : word;
        if (fits(candidate)) {
            current = candidate;
        } else {
            if (current) chunks.push(current);
            current = word;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}
