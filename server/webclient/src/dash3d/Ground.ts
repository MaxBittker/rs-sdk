// prettier-ignore
const defShapeP: Int8Array[] = [
    Int8Array.of(1, 3, 5, 7),
    Int8Array.of(1, 3, 5, 7),
    Int8Array.of(1, 3, 5, 7),
    Int8Array.of(1, 3, 5, 7, 6),
    Int8Array.of(1, 3, 5, 7, 6),
    Int8Array.of(1, 3, 5, 7, 6),
    Int8Array.of(1, 3, 5, 7, 6),
    Int8Array.of(1, 3, 5, 7, 2, 6),
    Int8Array.of(1, 3, 5, 7, 2, 8),
    Int8Array.of(1, 3, 5, 7, 2, 8),
    Int8Array.of(1, 3, 5, 7, 11, 12),
    Int8Array.of(1, 3, 5, 7, 11, 12),
    Int8Array.of(1, 3, 5, 7, 13, 14)
]; // shape points

// prettier-ignore
const defShapeF: Int8Array[] = [
    Int8Array.of(0, 1, 2, 3, 0, 0, 1, 3),
    Int8Array.of(1, 1, 2, 3, 1, 0, 1, 3),
    Int8Array.of(0, 1, 2, 3, 1, 0, 1, 3),
    Int8Array.of(0, 0, 1, 2, 0, 0, 2, 4, 1, 0, 4, 3),
    Int8Array.of(0, 0, 1, 4, 0, 0, 4, 3, 1, 1, 2, 4),
    Int8Array.of(0, 0, 4, 3, 1, 0, 1, 2, 1, 0, 2, 4),
    Int8Array.of(0, 1, 2, 4, 1, 0, 1, 4, 1, 0, 4, 3),
    Int8Array.of(0, 4, 1, 2, 0, 4, 2, 5, 1, 0, 4, 5, 1, 0, 5, 3),
    Int8Array.of(0, 4, 1, 2, 0, 4, 2, 3, 0, 4, 3, 5, 1, 0, 4, 5),
    Int8Array.of(0, 0, 4, 5, 1, 4, 1, 2, 1, 4, 2, 3, 1, 4, 3, 5),
    Int8Array.of(0, 0, 1, 5, 0, 1, 4, 5, 0, 1, 2, 4, 1, 0, 5, 3, 1, 5, 4, 3, 1, 4, 2, 3),
    Int8Array.of(1, 0, 1, 5, 1, 1, 4, 5, 1, 1, 2, 4, 0, 0, 5, 3, 0, 5, 4, 3, 0, 4, 2, 3),
    Int8Array.of(1, 0, 5, 4, 1, 0, 1, 5, 0, 0, 4, 3, 0, 4, 5, 3, 0, 5, 2, 3, 0, 1, 2, 5)
]; // shape faces

const FULL_SQUARE: number = 128;
const HALF_SQUARE: number = (FULL_SQUARE / 2) | 0;
const CORNER_SMALL: number = (FULL_SQUARE / 4) | 0;
const CORNER_BIG: number = ((FULL_SQUARE * 3) / 4) | 0;

export default class Ground {
    static readonly drawVertexX: Int32Array = new Int32Array(6);
    static readonly drawVertexY: Int32Array = new Int32Array(6);
    static readonly drawTextureVertexX: Int32Array = new Int32Array(6);
    static readonly drawTextureVertexY: Int32Array = new Int32Array(6);
    static readonly drawTextureVertexZ: Int32Array = new Int32Array(6);

    // ----

    readonly vertexX: Int32Array;
    readonly vertexY: Int32Array;
    readonly vertexZ: Int32Array;
    readonly faceColourA: Int32Array;
    readonly faceColourB: Int32Array;
    readonly faceColourC: Int32Array;
    readonly faceVertexA: Int32Array;
    readonly faceVertexB: Int32Array;
    readonly faceVertexC: Int32Array;
    readonly faceTexture: Int32Array | null;
    readonly flat: boolean;
    readonly minimapOverlay: number;
    readonly minimapUnderlay: number;
    readonly overlayShape: number;
    readonly overlayRotation: number;

    constructor(
        x: number, z: number,
        shape: number, rotation: number,
        texture: number,
        heightSW: number, heightSE: number, heightNE: number, heightNW: number,
        colourSW: number, colourSE: number, colourNE: number, colourNW: number,
        colour2SW: number, colour2SE: number, colour2NE: number, colour2NW: number,
        underlay: number, overlay: number
    ) {
        this.flat = !(heightSW !== heightSE || heightSW !== heightNE || heightSW !== heightNW);
        this.overlayShape = shape;
        this.overlayRotation = rotation;
        this.minimapUnderlay = underlay;
        this.minimapOverlay = overlay;

        const points: Int8Array = defShapeP[shape];
        const vertexCount: number = points.length;
        this.vertexX = new Int32Array(vertexCount);
        this.vertexY = new Int32Array(vertexCount);
        this.vertexZ = new Int32Array(vertexCount);
        const primaryColours: Int32Array = new Int32Array(vertexCount);
        const secondaryColours: Int32Array = new Int32Array(vertexCount);

        const sceneX: number = x * FULL_SQUARE;
        const sceneZ: number = z * FULL_SQUARE;

        for (let v: number = 0; v < vertexCount; v++) {
            let type: number = points[v];

            if ((type & 0x1) === 0 && type <= 8) {
                type = ((type - rotation - rotation - 1) & 0x7) + 1;
            }

            if (type > 8 && type <= 12) {
                type = ((type - rotation - 9) & 0x3) + 9;
            }

            if (type > 12 && type <= 16) {
                type = ((type - rotation - 13) & 0x3) + 13;
            }

            let x: number;
            let z: number;
            let y: number;
            let colour1: number;
            let colour2: number;

            if (type === 1) {
                x = sceneX;
                z = sceneZ;
                y = heightSW;
                colour1 = colourSW;
                colour2 = colour2SW;
            } else if (type === 2) {
                x = sceneX + HALF_SQUARE;
                z = sceneZ;
                y = (heightSW + heightSE) >> 1;
                colour1 = (colourSW + colourSE) >> 1;
                colour2 = (colour2SW + colour2SE) >> 1;
            } else if (type === 3) {
                x = sceneX + FULL_SQUARE;
                z = sceneZ;
                y = heightSE;
                colour1 = colourSE;
                colour2 = colour2SE;
            } else if (type === 4) {
                x = sceneX + FULL_SQUARE;
                z = sceneZ + HALF_SQUARE;
                y = (heightSE + heightNE) >> 1;
                colour1 = (colourSE + colourNE) >> 1;
                colour2 = (colour2SE + colour2NE) >> 1;
            } else if (type === 5) {
                x = sceneX + FULL_SQUARE;
                z = sceneZ + FULL_SQUARE;
                y = heightNE;
                colour1 = colourNE;
                colour2 = colour2NE;
            } else if (type === 6) {
                x = sceneX + HALF_SQUARE;
                z = sceneZ + FULL_SQUARE;
                y = (heightNE + heightNW) >> 1;
                colour1 = (colourNE + colourNW) >> 1;
                colour2 = (colour2NE + colour2NW) >> 1;
            } else if (type === 7) {
                x = sceneX;
                z = sceneZ + FULL_SQUARE;
                y = heightNW;
                colour1 = colourNW;
                colour2 = colour2NW;
            } else if (type === 8) {
                x = sceneX;
                z = sceneZ + HALF_SQUARE;
                y = (heightNW + heightSW) >> 1;
                colour1 = (colourNW + colourSW) >> 1;
                colour2 = (colour2NW + colour2SW) >> 1;
            } else if (type === 9) {
                x = sceneX + HALF_SQUARE;
                z = sceneZ + CORNER_SMALL;
                y = (heightSW + heightSE) >> 1;
                colour1 = (colourSW + colourSE) >> 1;
                colour2 = (colour2SW + colour2SE) >> 1;
            } else if (type === 10) {
                x = sceneX + CORNER_BIG;
                z = sceneZ + HALF_SQUARE;
                y = (heightSE + heightNE) >> 1;
                colour1 = (colourSE + colourNE) >> 1;
                colour2 = (colour2SE + colour2NE) >> 1;
            } else if (type === 11) {
                x = sceneX + HALF_SQUARE;
                z = sceneZ + CORNER_BIG;
                y = (heightNE + heightNW) >> 1;
                colour1 = (colourNE + colourNW) >> 1;
                colour2 = (colour2NE + colour2NW) >> 1;
            } else if (type === 12) {
                x = sceneX + CORNER_SMALL;
                z = sceneZ + HALF_SQUARE;
                y = (heightNW + heightSW) >> 1;
                colour1 = (colourNW + colourSW) >> 1;
                colour2 = (colour2NW + colour2SW) >> 1;
            } else if (type === 13) {
                x = sceneX + CORNER_SMALL;
                z = sceneZ + CORNER_SMALL;
                y = heightSW;
                colour1 = colourSW;
                colour2 = colour2SW;
            } else if (type === 14) {
                x = sceneX + CORNER_BIG;
                z = sceneZ + CORNER_SMALL;
                y = heightSE;
                colour1 = colourSE;
                colour2 = colour2SE;
            } else if (type === 15) {
                x = sceneX + CORNER_BIG;
                z = sceneZ + CORNER_BIG;
                y = heightNE;
                colour1 = colourNE;
                colour2 = colour2NE;
            } else {
                x = sceneX + CORNER_SMALL;
                z = sceneZ + CORNER_BIG;
                y = heightNW;
                colour1 = colourNW;
                colour2 = colour2NW;
            }

            this.vertexX[v] = x;
            this.vertexY[v] = y;
            this.vertexZ[v] = z;
            primaryColours[v] = colour1;
            secondaryColours[v] = colour2;
        }

        const paths: Int8Array = defShapeF[shape];
        const faceCount: number = (paths.length / 4) | 0;
        this.faceVertexA = new Int32Array(faceCount);
        this.faceVertexB = new Int32Array(faceCount);
        this.faceVertexC = new Int32Array(faceCount);
        this.faceColourA = new Int32Array(faceCount);
        this.faceColourB = new Int32Array(faceCount);
        this.faceColourC = new Int32Array(faceCount);

        if (texture !== -1) {
            this.faceTexture = new Int32Array(faceCount);
        } else {
            this.faceTexture = null;
        }

        let index: number = 0;
        for (let t: number = 0; t < faceCount; t++) {
            const colour: number = paths[index];
            let a: number = paths[index + 1];
            let b: number = paths[index + 2];
            let c: number = paths[index + 3];
            index += 4;

            if (a < 4) {
                a = (a - rotation) & 0x3;
            }

            if (b < 4) {
                b = (b - rotation) & 0x3;
            }

            if (c < 4) {
                c = (c - rotation) & 0x3;
            }

            this.faceVertexA[t] = a;
            this.faceVertexB[t] = b;
            this.faceVertexC[t] = c;

            if (colour === 0) {
                this.faceColourA[t] = primaryColours[a];
                this.faceColourB[t] = primaryColours[b];
                this.faceColourC[t] = primaryColours[c];

                if (this.faceTexture) {
                    this.faceTexture[t] = -1;
                }
            } else {
                this.faceColourA[t] = secondaryColours[a];
                this.faceColourB[t] = secondaryColours[b];
                this.faceColourC[t] = secondaryColours[c];

                if (this.faceTexture) {
                    this.faceTexture[t] = texture;
                }
            }
        }
    }
}
