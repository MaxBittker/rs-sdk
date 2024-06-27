// https://gist.github.com/Z-Kris/90e687fd1502ed095804393f550ebfcc
export default class ZoneGrid {
    private static readonly GRID_SIZE: number = 2048;
    private static readonly INT_BITS: number = 5;
    private static readonly INT_BITS_FLAG: number = (1 << this.INT_BITS) - 1;
    private static readonly DEFAULT_GRID_SIZE: number = this.GRID_SIZE * (this.GRID_SIZE >> this.INT_BITS);

    private readonly grid: Int32Array;

    constructor(size: number = ZoneGrid.DEFAULT_GRID_SIZE) {
        this.grid = new Int32Array(size);
    }

    private index(zoneX: number, zoneY: number): number {
        return (zoneX << ZoneGrid.INT_BITS) | (zoneY >>> ZoneGrid.INT_BITS);
    }

    flag(zoneX: number, zoneY: number): void {
        this.grid[this.index(zoneX, zoneY)] |= (1 << (zoneY & ZoneGrid.INT_BITS_FLAG));
    }

    unflag(zoneX: number, zoneY: number): void {
        this.grid[this.index(zoneX, zoneY)] &= ~(1 << (zoneY & ZoneGrid.INT_BITS_FLAG));
    }

    isFlagged(zoneX: number, zoneY: number, radius: number): boolean {
        const minX: number = Math.max(0, zoneX - radius);
        const maxX: number = Math.min(ZoneGrid.GRID_SIZE - 1, zoneX + radius);
        const minY: number = Math.max(0, zoneY - radius);
        const maxY: number = Math.min(ZoneGrid.GRID_SIZE - 1, zoneY + radius);
        const bits: number = ZoneGrid.INT_BITS_FLAG;
        const startY: number = minY & ~bits;
        const endY: number = maxY >>> ZoneGrid.INT_BITS << ZoneGrid.INT_BITS;
        for (let x: number = minX; x <= maxX; x++) {
            for (let y: number = startY; y <= endY; y += 32) {
                const index: number = this.index(x, y);
                const line: number = this.grid[index];
                let trailingTrimmed: number = line;
                if (y + bits > maxY) {
                    trailingTrimmed = line & ((1 << (maxY - y + 1)) - 1);
                }
                let leadingTrimmed: number = trailingTrimmed;
                if (y < minY) {
                    leadingTrimmed = trailingTrimmed >>> (minY - y);
                }
                if (leadingTrimmed !== 0) {
                    return true;
                }
            }
        }
        return false;
    }
}