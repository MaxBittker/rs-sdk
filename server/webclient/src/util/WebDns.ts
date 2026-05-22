export type ReverseDnsOptions = {
    endpoint?: string;
    signal?: AbortSignal;
};

type DnsJsonAnswer = {
    name: string;
    type: number;
    TTL: number;
    data: string;
};

type DnsJsonResponse = {
    Status: number;
    Answer?: DnsJsonAnswer[];
};

const PTR_RECORD_TYPE = 12;
const DEFAULT_DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

export async function reverseDnsLookup(ip: string, options: ReverseDnsOptions = {}): Promise<(string | null)[]> {
    const reverseName = buildReverseName(ip);
    const endpoint = options.endpoint ?? DEFAULT_DOH_ENDPOINT;
    const url = new URL(endpoint);

    url.searchParams.set('name', reverseName);
    url.searchParams.set('type', 'PTR');

    const response = await fetch(url.toString(), {
        headers: {
            accept: 'application/dns-json',
        },
        signal: options.signal,
    });

    if (!response.ok) {
        throw new Error(`DoH request failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as DnsJsonResponse;

    if (payload.Status !== 0) {
        if (payload.Status === 3) {
            return [null];
        }
        throw new Error(`DoH response returned DNS status ${payload.Status}`);
    }

    const answers = payload.Answer ?? [];
    const hostnames = answers
        .filter((answer) => answer.type === PTR_RECORD_TYPE)
        .map((answer) => answer.data.replace(/\.$/, ''));
    return hostnames.length > 0 ? hostnames : [null];
}

function buildReverseName(ip: string): string {
    const trimmed = ip.trim();
    if (trimmed.includes(':')) {
        return ipv6ToArpa(trimmed);
    }
    if (trimmed.includes('.')) {
        return ipv4ToArpa(trimmed);
    }
    throw new Error('Invalid IP address');
}

function ipv4ToArpa(ip: string): string {
    const parts = ip.split('.');
    if (parts.length !== 4) {
        throw new Error('Invalid IPv4 address');
    }

    const octets = parts.map((part) => {
        if (!/^\d+$/.test(part)) {
            throw new Error('Invalid IPv4 address');
        }
        const value = Number(part);
        if (!Number.isInteger(value) || value < 0 || value > 255) {
            throw new Error('Invalid IPv4 address');
        }
        return value;
    });

    return `${octets[3]}.${octets[2]}.${octets[1]}.${octets[0]}.in-addr.arpa`;
}

function ipv6ToArpa(ip: string): string {
    const normalized = ip.split('%')[0];
    const hextets = expandIpv6(normalized);
    const hexString = hextets.join('');
    const nibbles = hexString.split('').reverse().join('.');
    return `${nibbles}.ip6.arpa`;
}

function expandIpv6(ip: string): string[] {
    const doubleColonParts = ip.split('::');
    if (doubleColonParts.length > 2) {
        throw new Error('Invalid IPv6 address');
    }

    const [leftRaw, rightRaw = ''] = doubleColonParts;
    const leftParts = splitIpv6Parts(leftRaw);
    const rightParts = splitIpv6Parts(rightRaw);

    const totalParts = leftParts.length + rightParts.length;
    const missingParts = doubleColonParts.length === 2 ? 8 - totalParts : 0;
    if (missingParts < 0 || (doubleColonParts.length === 1 && totalParts !== 8)) {
        throw new Error('Invalid IPv6 address');
    }

    const fullParts = [
        ...leftParts,
        ...Array.from({ length: missingParts }, () => '0'),
        ...rightParts,
    ];

    if (fullParts.length !== 8) {
        throw new Error('Invalid IPv6 address');
    }

    return fullParts.map((part) => {
        if (!/^[0-9a-fA-F]{1,4}$/.test(part)) {
            throw new Error('Invalid IPv6 address');
        }
        const value = Number.parseInt(part, 16);
        if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
            throw new Error('Invalid IPv6 address');
        }
        return value.toString(16).padStart(4, '0');
    });
}

function splitIpv6Parts(part: string): string[] {
    if (!part) {
        return [];
    }

    const chunks = part.split(':');
    const last = chunks[chunks.length - 1];
    if (last && last.includes('.')) {
        const ipv4Parts = ipv4ToHextets(last);
        return [...chunks.slice(0, -1), ...ipv4Parts];
    }

    return chunks;
}

function ipv4ToHextets(ip: string): string[] {
    const parts = ip.split('.');
    if (parts.length !== 4) {
        throw new Error('Invalid IPv4 address');
    }

    const octets = parts.map((part) => {
        if (!/^\d+$/.test(part)) {
            throw new Error('Invalid IPv4 address');
        }
        const value = Number(part);
        if (!Number.isInteger(value) || value < 0 || value > 255) {
            throw new Error('Invalid IPv4 address');
        }
        return value;
    });

    const high = (octets[0] << 8) | octets[1];
    const low = (octets[2] << 8) | octets[3];
    return [high.toString(16), low.toString(16)];
}
