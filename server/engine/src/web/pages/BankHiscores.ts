export type BankHiscoreRow = { username: string; value: number; items: string };
export type BankItem = { id?: number; name: string; value: number; count: number };
export type BankSnapshot = { username: string; items: BankItem[] };

// Parse each bank once per snapshot, rather than once per search. A damaged row should
// not prevent other players' banks from appearing in the filtered leaderboard.
export function parseBankSnapshots(rows: BankHiscoreRow[]): BankSnapshot[] {
    return rows.flatMap(row => {
        try {
            const items: unknown = JSON.parse(row.items);
            if (!Array.isArray(items)) return [];
            return [
                {
                    username: row.username,
                    items: items.filter((item): item is BankItem => item !== null && typeof item === 'object' && typeof item.name === 'string' && Number.isFinite(item.value) && item.value >= 0 && Number.isFinite(item.count) && item.count > 0)
                }
            ];
        } catch {
            return [];
        }
    });
}

export function rankMatchingBanks(banks: BankSnapshot[], substring: string): BankHiscoreRow[] {
    const needle = substring.trim().toLowerCase();
    const matches = banks.flatMap(bank => {
        const items = bank.items.filter(item => item.name.toLowerCase().includes(needle));
        if (items.length === 0) return [];
        // Saved item values already include stack quantities.
        const value = items.reduce((total, item) => total + item.value, 0);
        return [{ username: bank.username, value, items }];
    });
    return matches
        .sort((a, b) => b.value - a.value || a.username.localeCompare(b.username, 'en'))
        .slice(0, 50)
        .map(row => ({ username: row.username, value: row.value, items: JSON.stringify(row.items.sort((a, b) => b.value - a.value)) }));
}
