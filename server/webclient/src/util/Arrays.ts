export class TypedArray1d<T> extends Array<T> {
    constructor(length: number, defaultValue: T) {
        super(length);
        for (let l: number = 0; l < length; l++) {
            this[l] = defaultValue;
        }
    }
}

export class TypedArray2d<T> extends Array<Array<T>> {
    constructor(length: number, width: number, defaultValue: T) {
        super(length);
        for (let l: number = 0; l < length; l++) {
            this[l] = new Array(width);
            for (let w: number = 0; w < width; w++) {
                this[l][w] = defaultValue;
            }
        }
    }
}

export class TypedArray3d<T> extends Array<Array<Array<T>>> {
    constructor(length: number, width: number, height: number, defaultValue: T) {
        super(length);
        for (let l: number = 0; l < length; l++) {
            this[l] = new Array(width);
            for (let w: number = 0; w < width; w++) {
                this[l][w] = new Array(height);
                for (let h: number = 0; h < height; h++) {
                    this[l][w][h] = defaultValue;
                }
            }
        }
    }
}

export class TypedArray4d<T> extends Array<Array<Array<Array<T>>>> {
    constructor(length: number, width: number, height: number, space: number, defaultValue: T) {
        super(length);
        for (let l: number = 0; l < length; l++) {
            this[l] = new Array(width);
            for (let w: number = 0; w < width; w++) {
                this[l][w] = new Array(height);
                for (let h: number = 0; h < height; h++) {
                    this[l][w][h] = new Array(space);
                    for (let s: number = 0; s < space; s++) {
                        this[l][w][h][s] = defaultValue;
                    }
                }
            }
        }
    }
}

export class Uint8Array3d extends Array<Array<Uint8Array>> {
    constructor(length: number, width: number, height: number) {
        super(length);
        for (let l: number = 0; l < length; l++) {
            this[l] = new Array(width);
            for (let w: number = 0; w < width; w++) {
                this[l][w] = new Uint8Array(height);
            }
        }
    }
}

export class Int32Array2d extends Array<Int32Array> {
    constructor(length: number, width: number) {
        super(length);
        for (let l: number = 0; l < length; l++) {
            this[l] = new Int32Array(width);
        }
    }
}

export class Int32Array3d extends Array<Array<Int32Array>> {
    constructor(length: number, width: number, height: number) {
        super(length);
        for (let l: number = 0; l < length; l++) {
            this[l] = new Array(width);
            for (let w: number = 0; w < width; w++) {
                this[l][w] = new Int32Array(height);
            }
        }
    }
}
