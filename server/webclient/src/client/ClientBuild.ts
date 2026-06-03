import FloType from '#/config/FloType.js';
import LocType from '#/config/LocType.js';

import ClientLocAnim from '#/dash3d/ClientLocAnim.js';
import CollisionMap, { BuildArea } from '#/dash3d/CollisionMap.js';
import { LocAngle } from '#/dash3d/LocAngle.js';
import { LocShape } from '#/dash3d/LocShape.js';
import { MapFlag } from '#/dash3d/MapFlag.js';
import Model from '#/dash3d/Model.js';
import type ModelSource from '#/dash3d/ModelSource.js';
import { TerrainOverlayShape } from '#/dash3d/TerrainOverlayShape.js';
import World from '#/dash3d/World.js';

import { Colour } from '#/graphics/Colour.js';
import Pix3D from '#/dash3d/Pix3D.js';

import type OnDemand from '#/io/OnDemand.js';
import Packet from '#/io/Packet.js';

import { Int32Array2d, Int32Array3d, Uint8Array3d } from '#/util/Arrays.js';

export default class ClientBuild {
    static readonly WSHAPE0: Int8Array = Int8Array.of(1, 2, 4, 8);
    static readonly WSHAPE1: Uint8Array = Uint8Array.of(16, 32, 64, 128);
    static readonly DECORXOF: Int8Array = Int8Array.of(1, 0, -1, 0);
    static readonly DECORZOF: Int8Array = Int8Array.of(0, -1, 0, 1);

    static hueOff: number = ((Math.random() * 17.0) | 0) - 8;
    static ligOff: number = ((Math.random() * 33.0) | 0) - 16;

    static lowMem: boolean = true;
    static minusedlevel: number = 0;

    private readonly maxTileX: number;
    private readonly maxTileZ: number;

    private readonly groundh: Int32Array[][]; // ground height
    private readonly mapl: Uint8Array[][]; // map land flags
    private readonly floort1: Uint8Array[][]; // floor type 1
    private readonly floort2: Uint8Array[][]; // floor type 2
    private readonly floors: Uint8Array[][]; // floor shape
    private readonly floorr: Uint8Array[][]; // floor rotation
    private readonly shadow: Uint8Array[][];
    private readonly lightmap: Int32Array[];
    private readonly huetot: Int32Array;
    private readonly sattot: Int32Array;
    private readonly ligtot: Int32Array;
    private readonly comtot: Int32Array;
    private readonly tot: Int32Array;
    private readonly mapo: Int32Array[][]; // map occlusion

    public constructor(maxTileX: number, maxTileZ: number, groundh: Int32Array[][], mapl: Uint8Array[][]) {
        this.maxTileX = maxTileX;
        this.maxTileZ = maxTileZ;

        this.groundh = groundh;
        this.mapl = mapl;

        this.floort1 = new Uint8Array3d(BuildArea.LEVELS, maxTileX, maxTileZ);
        this.floort2 = new Uint8Array3d(BuildArea.LEVELS, maxTileX, maxTileZ);
        this.floors = new Uint8Array3d(BuildArea.LEVELS, maxTileX, maxTileZ);
        this.floorr = new Uint8Array3d(BuildArea.LEVELS, maxTileX, maxTileZ);

        this.mapo = new Int32Array3d(BuildArea.LEVELS, maxTileX + 1, maxTileZ + 1);
        this.shadow = new Uint8Array3d(BuildArea.LEVELS, maxTileX + 1, maxTileZ + 1);
        this.lightmap = new Int32Array2d(maxTileX + 1, maxTileZ + 1);

        this.huetot = new Int32Array(maxTileZ);
        this.sattot = new Int32Array(maxTileZ);
        this.ligtot = new Int32Array(maxTileZ);
        this.comtot = new Int32Array(maxTileZ);
        this.tot = new Int32Array(maxTileZ);
    }

    finishBuild(world: World | null, collision: (CollisionMap | null)[]): void {
        for (let level: number = 0; level < BuildArea.LEVELS; level++) {
            for (let x: number = 0; x < BuildArea.SIZE; x++) {
                for (let z: number = 0; z < BuildArea.SIZE; z++) {
                    if ((this.mapl[level][x][z] & MapFlag.Block) !== 0) {
                        let trueLevel: number = level;

                        if ((this.mapl[1][x][z] & MapFlag.LinkBelow) !== 0) {
                            trueLevel--;
                        }

                        if (trueLevel >= 0) {
                            collision[trueLevel]?.blockGround(x, z);
                        }
                    }
                }
            }
        }

        ClientBuild.hueOff += ((Math.random() * 5.0) | 0) - 2;
        if (ClientBuild.hueOff < -8) {
            ClientBuild.hueOff = -8;
        } else if (ClientBuild.hueOff > 8) {
            ClientBuild.hueOff = 8;
        }

        ClientBuild.ligOff += ((Math.random() * 5.0) | 0) - 2;
        if (ClientBuild.ligOff < -16) {
            ClientBuild.ligOff = -16;
        } else if (ClientBuild.ligOff > 16) {
            ClientBuild.ligOff = 16;
        }

        for (let level: number = 0; level < BuildArea.LEVELS; level++) {
            const shademap: Uint8Array[] = this.shadow[level];
            const lightAmbient: number = 96;
            const lightAttenuation: number = 768;
            const lightX: number = -50;
            const lightY: number = -10;
            const lightZ: number = -50;
            const lightMag: number = Math.sqrt(lightX * lightX + lightY * lightY + lightZ * lightZ) | 0;
            const lightMagnitude: number = (lightAttenuation * lightMag) >> 8;

            for (let z: number = 1; z < this.maxTileZ - 1; z++) {
                for (let x: number = 1; x < this.maxTileX - 1; x++) {
                    const dx: number = this.groundh[level][x + 1][z] - this.groundh[level][x - 1][z];
                    const dz: number = this.groundh[level][x][z + 1] - this.groundh[level][x][z - 1];

                    const len: number = Math.sqrt(dx * dx + 65536 + dz * dz) | 0;
                    const normalX: number = ((dx << 8) / len) | 0;
                    const normalY: number = (65536 / len) | 0;
                    const normalZ: number = ((dz << 8) / len) | 0;

                    const light: number = lightAmbient + (((lightX * normalX + lightY * normalY + lightZ * normalZ) / lightMagnitude) | 0);
                    const shade: number = (shademap[x - 1][z] >> 2) + (shademap[x + 1][z] >> 3) + (shademap[x][z - 1] >> 2) + (shademap[x][z + 1] >> 3) + (shademap[x][z] >> 1);

                    this.lightmap[x][z] = light - shade;
                }
            }

            for (let z: number = 0; z < this.maxTileZ; z++) {
                this.huetot[z] = 0;
                this.sattot[z] = 0;
                this.ligtot[z] = 0;
                this.comtot[z] = 0;
                this.tot[z] = 0;
            }

            for (let x0: number = -5; x0 < this.maxTileX + 5; x0++) {
                for (let z0: number = 0; z0 < this.maxTileZ; z0++) {
                    const x1: number = x0 + 5;

                    if (x1 >= 0 && x1 < this.maxTileX) {
                        const t1: number = this.floort1[level][x1][z0] & 0xff;

                        if (t1 > 0) {
                            const flo: FloType = FloType.list[t1 - 1];
                            this.huetot[z0] += flo.underlayHue;
                            this.sattot[z0] += flo.saturation;
                            this.ligtot[z0] += flo.lightness;
                            this.comtot[z0] += flo.chroma;
                            this.tot[z0]++;
                        }
                    }

                    const x2: number = x0 - 5;
                    if (x2 >= 0 && x2 < this.maxTileX) {
                        const t1: number = this.floort1[level][x2][z0] & 0xff;

                        if (t1 > 0) {
                            const flo: FloType = FloType.list[t1 - 1];
                            this.huetot[z0] -= flo.underlayHue;
                            this.sattot[z0] -= flo.saturation;
                            this.ligtot[z0] -= flo.lightness;
                            this.comtot[z0] -= flo.chroma;
                            this.tot[z0]--;
                        }
                    }
                }

                if (x0 >= 1 && x0 < this.maxTileX - 1) {
                    let blendHue: number = 0;
                    let blendSat: number = 0;
                    let blendLig: number = 0;
                    let blendCom: number = 0;
                    let blendTot: number = 0;

                    for (let z0: number = -5; z0 < this.maxTileZ + 5; z0++) {
                        const dz1: number = z0 + 5;
                        if (dz1 >= 0 && dz1 < this.maxTileZ) {
                            blendHue += this.huetot[dz1];
                            blendSat += this.sattot[dz1];
                            blendLig += this.ligtot[dz1];
                            blendCom += this.comtot[dz1];
                            blendTot += this.tot[dz1];
                        }

                        const dz2: number = z0 - 5;
                        if (dz2 >= 0 && dz2 < this.maxTileZ) {
                            blendHue -= this.huetot[dz2];
                            blendSat -= this.sattot[dz2];
                            blendLig -= this.ligtot[dz2];
                            blendCom -= this.comtot[dz2];
                            blendTot -= this.tot[dz2];
                        }

                        if (z0 >= 1 && z0 < this.maxTileZ - 1 && (!ClientBuild.lowMem || ((this.mapl[level][x0][z0] & MapFlag.ForceHighDetail) === 0 && this.getVisBelowLevel(level, x0, z0) === ClientBuild.minusedlevel))) {
                            const t1: number = this.floort1[level][x0][z0] & 0xff;
                            const t2: number = this.floort2[level][x0][z0] & 0xff;

                            if (t1 > 0 || t2 > 0) {
                                const heightSW: number = this.groundh[level][x0][z0];
                                const heightSE: number = this.groundh[level][x0 + 1][z0];
                                const heightNE: number = this.groundh[level][x0 + 1][z0 + 1];
                                const heightNW: number = this.groundh[level][x0][z0 + 1];

                                const lightSW: number = this.lightmap[x0][z0];
                                const lightSE: number = this.lightmap[x0 + 1][z0];
                                const lightNE: number = this.lightmap[x0 + 1][z0 + 1];
                                const lightNW: number = this.lightmap[x0][z0 + 1];

                                let t1Colour: number = -1;
                                let t1RandColour: number = -1;

                                if (t1 > 0) {
                                    const hue: number = ((blendHue * 256) / blendCom) | 0;
                                    const sat: number = (blendSat / blendTot) | 0;
                                    let lig: number = (blendLig / blendTot) | 0;
                                    t1Colour = ClientBuild.getTable(hue, sat, lig);

                                    const randomHue: number = (hue + ClientBuild.hueOff) & 0xff;
                                    let randomLig = lig + ClientBuild.ligOff;
                                    if (randomLig < 0) {
                                        randomLig = 0;
                                    } else if (randomLig > 255) {
                                        randomLig = 255;
                                    }
                                    t1RandColour = ClientBuild.getTable(randomHue, sat, randomLig);
                                }

                                if (level > 0) {
                                    let occludes: boolean = t1 !== 0 || this.floors[level][x0][z0] === TerrainOverlayShape.PLAIN;

                                    if (t2 > 0 && !FloType.list[t2 - 1].occlude) {
                                        occludes = false;
                                    }

                                    // occludes && flat
                                    if (occludes && heightSW === heightSE && heightSW === heightNE && heightSW === heightNW) {
                                        this.mapo[level][x0][z0] |= 0x924;
                                    }
                                }

                                let underlay: number = 0;
                                if (t1Colour !== -1) {
                                    underlay = Pix3D.colourTable[ClientBuild.getUCol(t1RandColour, 96)];
                                }

                                if (t2 === 0) {
                                    world?.setGround(
                                        level,
                                        x0,
                                        z0,
                                        TerrainOverlayShape.PLAIN,
                                        LocAngle.WEST,
                                        -1,
                                        heightSW,
                                        heightSE,
                                        heightNE,
                                        heightNW,
                                        ClientBuild.getUCol(t1Colour, lightSW),
                                        ClientBuild.getUCol(t1Colour, lightSE),
                                        ClientBuild.getUCol(t1Colour, lightNE),
                                        ClientBuild.getUCol(t1Colour, lightNW),
                                        Colour.BLACK,
                                        Colour.BLACK,
                                        Colour.BLACK,
                                        Colour.BLACK,
                                        underlay,
                                        Colour.BLACK
                                    );
                                } else {
                                    const shape: number = this.floors[level][x0][z0] + 1;
                                    const rotation: number = this.floorr[level][x0][z0];
                                    const flo: FloType = FloType.list[t2 - 1];

                                    let texture: number = flo.texture;
                                    let t2Colour: number;
                                    let overlay: number;
                                    if (texture >= 0) {
                                        overlay = Pix3D.getTextureAverage(texture);
                                        t2Colour = -1;
                                    } else if (flo.colour === Colour.MAGENTA) {
                                        overlay = 0;
                                        t2Colour = -2;
                                        texture = -1;
                                    } else {
                                        t2Colour = ClientBuild.getTable(flo.hue, flo.saturation, flo.lightness);
                                        overlay = Pix3D.colourTable[ClientBuild.getOCol(flo.overlayHsl, 96)];
                                    }

                                    world?.setGround(
                                        level,
                                        x0,
                                        z0,
                                        shape,
                                        rotation,
                                        texture,
                                        heightSW,
                                        heightSE,
                                        heightNE,
                                        heightNW,
                                        ClientBuild.getUCol(t1Colour, lightSW),
                                        ClientBuild.getUCol(t1Colour, lightSE),
                                        ClientBuild.getUCol(t1Colour, lightNE),
                                        ClientBuild.getUCol(t1Colour, lightNW),
                                        ClientBuild.getOCol(t2Colour, lightSW),
                                        ClientBuild.getOCol(t2Colour, lightSE),
                                        ClientBuild.getOCol(t2Colour, lightNE),
                                        ClientBuild.getOCol(t2Colour, lightNW),
                                        underlay,
                                        overlay
                                    );
                                }
                            }
                        }
                    }
                }
            }

            for (let stz: number = 1; stz < this.maxTileZ - 1; stz++) {
                for (let stx: number = 1; stx < this.maxTileX - 1; stx++) {
                    world?.setLayer(level, stx, stz, this.getVisBelowLevel(level, stx, stz));
                }
            }
        }

        world?.shareLight(64, 768, -50, -10, -50);

        for (let x: number = 0; x < this.maxTileX; x++) {
            for (let z: number = 0; z < this.maxTileZ; z++) {
                if ((this.mapl[1][x][z] & MapFlag.LinkBelow) !== 0) {
                    world?.pushDown(x, z);
                }
            }
        }

        let wall0: number = 0x1; // this flag is set by walls with rotation 0 or 2
        let wall1: number = 0x2; // this flag is set by walls with rotation 1 or 3
        let floor: number = 0x4; // this flag is set by floors which are flat

        for (let topLevel: number = 0; topLevel < BuildArea.LEVELS; topLevel++) {
            if (topLevel > 0) {
                wall0 <<= 0x3;
                wall1 <<= 0x3;
                floor <<= 0x3;
            }

            for (let level: number = 0; level <= topLevel; level++) {
                for (let tileZ: number = 0; tileZ <= this.maxTileZ; tileZ++) {
                    for (let tileX: number = 0; tileX <= this.maxTileX; tileX++) {
                        if ((this.mapo[level][tileX][tileZ] & wall0) !== 0) {
                            let minTileZ: number = tileZ;
                            let maxTileZ: number = tileZ;
                            let minLevel: number = level;
                            let maxLevel: number = level;

                            while (minTileZ > 0 && (this.mapo[level][tileX][minTileZ - 1] & wall0) !== 0) {
                                minTileZ--;
                            }

                            while (maxTileZ < this.maxTileZ && (this.mapo[level][tileX][maxTileZ + 1] & wall0) !== 0) {
                                maxTileZ++;
                            }

                            find_min_level: while (minLevel > 0) {
                                for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                    if ((this.mapo[minLevel - 1][tileX][z] & wall0) === 0) {
                                        break find_min_level;
                                    }
                                }
                                minLevel--;
                            }

                            find_max_level: while (maxLevel < topLevel) {
                                for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                    if ((this.mapo[maxLevel + 1][tileX][z] & wall0) === 0) {
                                        break find_max_level;
                                    }
                                }
                                maxLevel++;
                            }

                            const area: number = (maxLevel + 1 - minLevel) * (maxTileZ + 1 - minTileZ);
                            if (area >= 8) {
                                const minY: number = this.groundh[maxLevel][tileX][minTileZ] - 240;
                                const maxX: number = this.groundh[minLevel][tileX][minTileZ];

                                World.setOcclude(topLevel, 1, tileX * 128, minY, minTileZ * 128, tileX * 128, maxX, maxTileZ * 128 + 128);

                                for (let l: number = minLevel; l <= maxLevel; l++) {
                                    for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                        this.mapo[l][tileX][z] &= ~wall0;
                                    }
                                }
                            }
                        }

                        if ((this.mapo[level][tileX][tileZ] & wall1) !== 0) {
                            let minTileX: number = tileX;
                            let maxTileX: number = tileX;
                            let minLevel: number = level;
                            let maxLevel: number = level;

                            while (minTileX > 0 && (this.mapo[level][minTileX - 1][tileZ] & wall1) !== 0) {
                                minTileX--;
                            }

                            while (maxTileX < this.maxTileX && (this.mapo[level][maxTileX + 1][tileZ] & wall1) !== 0) {
                                maxTileX++;
                            }

                            find_min_level2: while (minLevel > 0) {
                                for (let x: number = minTileX; x <= maxTileX; x++) {
                                    if ((this.mapo[minLevel - 1][x][tileZ] & wall1) === 0) {
                                        break find_min_level2;
                                    }
                                }
                                minLevel--;
                            }

                            find_max_level2: while (maxLevel < topLevel) {
                                for (let x: number = minTileX; x <= maxTileX; x++) {
                                    if ((this.mapo[maxLevel + 1][x][tileZ] & wall1) === 0) {
                                        break find_max_level2;
                                    }
                                }
                                maxLevel++;
                            }

                            const area: number = (maxLevel + 1 - minLevel) * (maxTileX + 1 - minTileX);

                            if (area >= 8) {
                                const minY: number = this.groundh[maxLevel][minTileX][tileZ] - 240;
                                const maxY: number = this.groundh[minLevel][minTileX][tileZ];

                                World.setOcclude(topLevel, 2, minTileX * 128, minY, tileZ * 128, maxTileX * 128 + 128, maxY, tileZ * 128);

                                for (let l: number = minLevel; l <= maxLevel; l++) {
                                    for (let x: number = minTileX; x <= maxTileX; x++) {
                                        this.mapo[l][x][tileZ] &= ~wall1;
                                    }
                                }
                            }
                        }
                        if ((this.mapo[level][tileX][tileZ] & floor) !== 0) {
                            let minTileX: number = tileX;
                            let maxTileX: number = tileX;
                            let minTileZ: number = tileZ;
                            let maxTileZ: number = tileZ;

                            while (minTileZ > 0 && (this.mapo[level][tileX][minTileZ - 1] & floor) !== 0) {
                                minTileZ--;
                            }

                            while (maxTileZ < this.maxTileZ && (this.mapo[level][tileX][maxTileZ + 1] & floor) !== 0) {
                                maxTileZ++;
                            }

                            find_min_tile_xz: while (minTileX > 0) {
                                for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                    if ((this.mapo[level][minTileX - 1][z] & floor) === 0) {
                                        break find_min_tile_xz;
                                    }
                                }
                                minTileX--;
                            }

                            find_max_tile_xz: while (maxTileX < this.maxTileX) {
                                for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                    if ((this.mapo[level][maxTileX + 1][z] & floor) === 0) {
                                        break find_max_tile_xz;
                                    }
                                }
                                maxTileX++;
                            }

                            if ((maxTileX + 1 - minTileX) * (maxTileZ + 1 - minTileZ) >= 4) {
                                const y: number = this.groundh[level][minTileX][minTileZ];

                                World.setOcclude(topLevel, 4, minTileX * 128, y, minTileZ * 128, maxTileX * 128 + 128, y, maxTileZ * 128 + 128);

                                for (let x: number = minTileX; x <= maxTileX; x++) {
                                    for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                        this.mapo[level][x][z] &= ~floor;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    static perlinNoise(x: number, z: number): number {
        let value: number = this.interpolatedNoise(x + 45365, z + 91923, 4) + ((this.interpolatedNoise(x + 10294, z + 37821, 2) - 128) >> 1) + ((this.interpolatedNoise(x, z, 1) - 128) >> 2) - 128;
        value = ((value * 0.3) | 0) + 35;
        if (value < 10) {
            value = 10;
        } else if (value > 60) {
            value = 60;
        }
        return value;
    }

    static interpolatedNoise(x: number, z: number, scale: number): number {
        const intX: number = (x / scale) | 0;
        const fracX: number = x & (scale - 1);
        const intZ: number = (z / scale) | 0;
        const fracZ: number = z & (scale - 1);
        const v1: number = this.smoothNoise(intX, intZ);
        const v2: number = this.smoothNoise(intX + 1, intZ);
        const v3: number = this.smoothNoise(intX, intZ + 1);
        const v4: number = this.smoothNoise(intX + 1, intZ + 1);
        const i1: number = this.interpolate(v1, v2, fracX, scale);
        const i2: number = this.interpolate(v3, v4, fracX, scale);
        return this.interpolate(i1, i2, fracZ, scale);
    }

    static interpolate(a: number, b: number, x: number, scale: number): number {
        const f: number = (65536 - Pix3D.cosTable[((x * 1024) / scale) | 0]) >> 1;
        return ((a * (65536 - f)) >> 16) + ((b * f) >> 16);
    }

    static smoothNoise(x: number, y: number): number {
        const corners: number = this.noise(x - 1, y - 1) + this.noise(x + 1, y - 1) + this.noise(x - 1, y + 1) + this.noise(x + 1, y + 1);
        const sides: number = this.noise(x - 1, y) + this.noise(x + 1, y) + this.noise(x, y - 1) + this.noise(x, y + 1);
        const center: number = this.noise(x, y);
        return ((corners / 16) | 0) + ((sides / 8) | 0) + ((center / 4) | 0);
    }

    static noise(x: number, y: number): number {
        const n: number = x + y * 57;
        const n1: bigint = BigInt((n << 13) ^ n);
        return Number(((n1 * (n1 * n1 * 15731n + 789221n) + 1376312589n) & 0x7fffffffn) >> 19n) & 0xff;
    }

    fadeAdjacent(startZ: number, startX: number, endZ: number, endX: number) {
        for (let z: number = startZ; z <= startZ + endZ; z++) {
            for (let x: number = startX; x <= startX + endX; x++) {
                if (x >= 0 && x < this.maxTileX && z >= 0 && z < this.maxTileZ) {
                    this.shadow[0][x][z] = 127;

                    if (startX == x && x > 0) {
                        this.groundh[0][x][z] = this.groundh[0][x - 1][z];
                    }

                    if (startX + endX == x && x < this.maxTileX - 1) {
                        this.groundh[0][x][z] = this.groundh[0][x + 1][z];
                    }

                    if (startZ == z && z > 0) {
                        this.groundh[0][x][z] = this.groundh[0][x][z - 1];
                    }

                    if (startZ + endZ == z && z < this.maxTileZ - 1) {
                        this.groundh[0][x][z] = this.groundh[0][x][z + 1];
                    }
                }
            }
        }
    }

    loadGround(src: Uint8Array, originX: number, originZ: number, xOffset: number, zOffset: number): void {
        const buf: Packet = new Packet(src);

        for (let level: number = 0; level < BuildArea.LEVELS; level++) {
            for (let x: number = 0; x < 64; x++) {
                for (let z: number = 0; z < 64; z++) {
                    const stx: number = x + xOffset;
                    const stz: number = z + zOffset;
                    let opcode: number;

                    if (stx >= 0 && stx < BuildArea.SIZE && stz >= 0 && stz < BuildArea.SIZE) {
                        this.mapl[level][stx][stz] = 0;

                        while (true) {
                            opcode = buf.g1();
                            if (opcode === 0) {
                                if (level === 0) {
                                    this.groundh[0][stx][stz] = -ClientBuild.perlinNoise(stx + originX + 932731, stz + 556238 + originZ) * 8;
                                } else {
                                    this.groundh[level][stx][stz] = this.groundh[level - 1][stx][stz] - 240;
                                }
                                break;
                            }

                            if (opcode === 1) {
                                let height: number = buf.g1();
                                if (height === 1) {
                                    height = 0;
                                }
                                if (level === 0) {
                                    this.groundh[0][stx][stz] = -height * 8;
                                } else {
                                    this.groundh[level][stx][stz] = this.groundh[level - 1][stx][stz] - height * 8;
                                }
                                break;
                            }

                            if (opcode <= 49) {
                                this.floort2[level][stx][stz] = buf.g1b();
                                this.floors[level][stx][stz] = ((((opcode - 2) / 4) | 0) << 24) >> 24;
                                this.floorr[level][stx][stz] = (((opcode - 2) & 0x3) << 24) >> 24;
                            } else if (opcode <= 81) {
                                this.mapl[level][stx][stz] = ((opcode - 49) << 24) >> 24;
                            } else {
                                this.floort1[level][stx][stz] = ((opcode - 81) << 24) >> 24;
                            }
                        }
                    } else {
                        while (true) {
                            opcode = buf.g1();
                            if (opcode === 0) {
                                break;
                            }

                            if (opcode === 1) {
                                buf.g1();
                                break;
                            }

                            if (opcode <= 49) {
                                buf.g1();
                            }
                        }
                    }
                }
            }
        }
    }

    static checkLocations(src: Uint8Array, xOffset: number, zOffset: number): boolean {
        let ready = true;
        const buf = new Packet(src);
        let locId = -1;

        while (true) {
            const deltaId = buf.gsmart();
            if (deltaId == 0) {
                break;
            }

            locId += deltaId;

            let locPos = 0;
            let skip = false;

            while (true) {
                if (skip) {
                    const deltaPos = buf.gsmart();
                    if (deltaPos == 0) {
                        break;
                    }

                    buf.g1();
                } else {
                    const deltaPos = buf.gsmart();
                    if (deltaPos == 0) {
                        break;
                    }

                    locPos += deltaPos - 1;

                    const z = locPos & 0x3f;
                    const x = (locPos >> 6) & 0x3f;

                    const shape = buf.g1() >> 2;
                    const stx = xOffset + x;
                    const stz = zOffset + z;

                    if (stx > 0 && stz > 0 && stx < 103 && stz < 103) {
                        const loc = LocType.list(locId);
                        if (shape != 22 || !ClientBuild.lowMem || loc.active || loc.forcedecor) {
                            if (!loc.checkModelAll()) {
                                ready = false;
                            }

                            skip = true;
                        }
                    }
                }
            }
        }

        return ready;
    }

    static prefetchLocations(buf: Packet, od: OnDemand) {
        let locId = -1;
        while (true) {
            const deltaId = buf.gsmart();
            if (deltaId == 0) {
                return;
            }

            locId += deltaId;

            const loc = LocType.list(locId);
            loc.prefetchModelAll(od);

            while (true) {
                const deltaPos = buf.gsmart();
                if (deltaPos == 0) {
                    break;
                }

                buf.g1();
            }
        }
    }

    loadLocations(src: Uint8Array, xOffset: number, zOffset: number, world: World | null, collisions: (CollisionMap | null)[]): void {
        const buf: Packet = new Packet(src);
        let locId: number = -1;

        while (true) {
            const deltaId: number = buf.gsmart();
            if (deltaId === 0) {
                return;
            }

            locId += deltaId;

            let locPos: number = 0;
            while (true) {
                const deltaPos: number = buf.gsmart();
                if (deltaPos === 0) {
                    break;
                }

                locPos += deltaPos - 1;
                const z: number = locPos & 0x3f;
                const x: number = (locPos >> 6) & 0x3f;
                const level: number = locPos >> 12;

                const info: number = buf.g1();
                const shape: number = info >> 2;
                const rotation: number = info & 0x3;
                const stx: number = x + xOffset;
                const stz: number = z + zOffset;

                if (stx > 0 && stz > 0 && stx < BuildArea.SIZE - 1 && stz < BuildArea.SIZE - 1) {
                    let currentLevel: number = level;
                    if ((this.mapl[1][stx][stz] & MapFlag.LinkBelow) !== 0) {
                        currentLevel = level - 1;
                    }

                    let cmap: CollisionMap | null = null;
                    if (currentLevel >= 0) {
                        cmap = collisions[currentLevel];
                    }

                    this.addLoc(level, stx, stz, locId, shape, rotation, world, cmap);
                }
            }
        }
    }

    private addLoc(level: number, x: number, z: number, locId: number, shape: number, angle: number, world: World | null, collision: CollisionMap | null): void {
        if (ClientBuild.lowMem) {
            if ((this.mapl[level][x][z] & MapFlag.ForceHighDetail) !== 0) {
                return;
            }

            if (this.getVisBelowLevel(level, x, z) !== ClientBuild.minusedlevel) {
                return;
            }
        }

        let heightSW: number = this.groundh[level][x][z];
        let heightSE: number = this.groundh[level][x + 1][z];
        let heightNE: number = this.groundh[level][x + 1][z + 1];
        let heightNW: number = this.groundh[level][x][z + 1];
        const y: number = (heightSW + heightSE + heightNE + heightNW) >> 2;

        const loc: LocType = LocType.list(locId);

        let typecode: number = (x + (z << 7) + (locId << 14) + 0x40000000) | 0;
        if (!loc.active) {
            typecode += -0x80000000; // int.min
        }
        typecode |= 0;

        const typecode2: number = ((((angle << 6) + shape) | 0) << 24) >> 24;

        if (shape === LocShape.GROUND_DECOR) {
            if (!ClientBuild.lowMem || loc.active || loc.forcedecor) {
                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(22, angle, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(locId, 22, shape, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                world?.setGroundDecor(model, level, x, z, y, typecode, typecode2);

                if (loc.blockwalk && loc.active && collision) {
                    collision.blockGround(x, z);
                }
            }
        } else if (shape === LocShape.CENTREPIECE_STRAIGHT || shape === LocShape.CENTREPIECE_DIAGONAL) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(10, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, 10, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            if (model) {
                let yaw: number = 0;
                if (shape === LocShape.CENTREPIECE_DIAGONAL) {
                    yaw += 256;
                }

                let width: number;
                let height: number;
                if (angle === LocAngle.NORTH || angle === LocAngle.SOUTH) {
                    width = loc.length;
                    height = loc.width;
                } else {
                    width = loc.width;
                    height = loc.length;
                }

                if (world?.addScenery(level, x, z, y, model, typecode, typecode2, width, height, yaw) && loc.shadow) {
                    let model2: Model | null;
                    if (model instanceof Model) {
                        model2 = model;
                    } else {
                        model2 = loc.getModel(10, angle, heightSW, heightSE, heightNE, heightNW, -1);
                    }

                    if (model2) {
                        for (let dx: number = 0; dx <= width; dx++) {
                            for (let dz: number = 0; dz <= height; dz++) {
                                let shade: number = (model2.radius / 4) | 0;
                                if (shade > 30) {
                                    shade = 30;
                                }

                                if (shade > this.shadow[level][x + dx][z + dz]) {
                                    this.shadow[level][x + dx][z + dz] = (shade << 24) >> 24;
                                }
                            }
                        }
                    }
                }
            }

            if (loc.blockwalk && collision) {
                collision.addLoc(x, z, loc.width, loc.length, angle, loc.blockrange);
            }
        } else if (shape >= LocShape.ROOF_STRAIGHT) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(shape, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, shape, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.addScenery(level, x, z, y, model, typecode, typecode2, 1, 1, 0);

            if (shape >= LocShape.ROOF_STRAIGHT && shape <= LocShape.ROOF_FLAT && shape !== LocShape.ROOF_DIAGONAL_WITH_ROOFEDGE && level > 0) {
                this.mapo[level][x][z] |= 0x924;
            }

            if (loc.blockwalk && collision) {
                collision.addLoc(x, z, loc.width, loc.length, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_STRAIGHT) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(0, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, 0, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.setWall(level, x, z, y, ClientBuild.WSHAPE0[angle], 0, model, null, typecode, typecode2);

            if (angle === LocAngle.WEST) {
                if (loc.shadow) {
                    this.shadow[level][x][z] = 50;
                    this.shadow[level][x][z + 1] = 50;
                }

                if (loc.occlude) {
                    this.mapo[level][x][z] |= 0x249;
                }
            } else if (angle === LocAngle.NORTH) {
                if (loc.shadow) {
                    this.shadow[level][x][z + 1] = 50;
                    this.shadow[level][x + 1][z + 1] = 50;
                }

                if (loc.occlude) {
                    this.mapo[level][x][z + 1] |= 0x492;
                }
            } else if (angle === LocAngle.EAST) {
                if (loc.shadow) {
                    this.shadow[level][x + 1][z] = 50;
                    this.shadow[level][x + 1][z + 1] = 50;
                }

                if (loc.occlude) {
                    this.mapo[level][x + 1][z] |= 0x249;
                }
            } else if (angle === LocAngle.SOUTH) {
                if (loc.shadow) {
                    this.shadow[level][x][z] = 50;
                    this.shadow[level][x + 1][z] = 50;
                }

                if (loc.occlude) {
                    this.mapo[level][x][z] |= 0x492;
                }
            }

            if (loc.blockwalk && collision) {
                collision.addWall(x, z, shape, angle, loc.blockrange);
            }

            if (loc.wallwidth !== 16) {
                world?.moveDecor(level, x, z, loc.wallwidth);
            }
        } else if (shape === LocShape.WALL_DIAGONAL_CORNER) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(1, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, 1, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.setWall(level, x, z, y, ClientBuild.WSHAPE1[angle], 0, model, null, typecode, typecode2);

            if (loc.shadow) {
                if (angle === LocAngle.WEST) {
                    this.shadow[level][x][z + 1] = 50;
                } else if (angle === LocAngle.NORTH) {
                    this.shadow[level][x + 1][z + 1] = 50;
                } else if (angle === LocAngle.EAST) {
                    this.shadow[level][x + 1][z] = 50;
                } else if (angle === LocAngle.SOUTH) {
                    this.shadow[level][x][z] = 50;
                }
            }

            if (loc.blockwalk && collision) {
                collision.addWall(x, z, shape, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_L) {
            const offset: number = (angle + 1) & 0x3;

            let model1: ModelSource | null;
            let model2: ModelSource | null;
            if (loc.anim === -1) {
                model1 = loc.getModel(2, angle + 4, heightSW, heightSE, heightNE, heightNW, -1);
                model2 = loc.getModel(2, offset, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model1 = new ClientLocAnim(locId, 2, angle + 4, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                model2 = new ClientLocAnim(locId, 2, offset, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.setWall(
                level,
                x,
                z,
                y,
                ClientBuild.WSHAPE0[angle],
                ClientBuild.WSHAPE0[offset],
                model1,
                model2,
                typecode,
                typecode2
            );

            if (loc.occlude) {
                if (angle === LocAngle.WEST) {
                    this.mapo[level][x][z] |= 0x249;
                    this.mapo[level][x][z + 1] |= 0x492;
                } else if (angle === LocAngle.NORTH) {
                    this.mapo[level][x][z + 1] |= 0x492;
                    this.mapo[level][x + 1][z] |= 0x249;
                } else if (angle === LocAngle.EAST) {
                    this.mapo[level][x + 1][z] |= 0x249;
                    this.mapo[level][x][z] |= 0x492;
                } else if (angle === LocAngle.SOUTH) {
                    this.mapo[level][x][z] |= 0x492;
                    this.mapo[level][x][z] |= 0x249;
                }
            }

            if (loc.blockwalk && collision) {
                collision.addWall(x, z, shape, angle, loc.blockrange);
            }

            if (loc.wallwidth !== 16) {
                world?.moveDecor(level, x, z, loc.wallwidth);
            }
        } else if (shape === LocShape.WALL_SQUARE_CORNER) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(3, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, 3, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.setWall(level, x, z, y, ClientBuild.WSHAPE1[angle], 0, model, null, typecode, typecode2);

            if (loc.shadow) {
                if (angle === LocAngle.WEST) {
                    this.shadow[level][x][z + 1] = 50;
                } else if (angle === LocAngle.NORTH) {
                    this.shadow[level][x + 1][z + 1] = 50;
                } else if (angle === LocAngle.EAST) {
                    this.shadow[level][x + 1][z] = 50;
                } else if (angle === LocAngle.SOUTH) {
                    this.shadow[level][x][z] = 50;
                }
            }

            if (loc.blockwalk && collision) {
                collision.addWall(x, z, shape, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_DIAGONAL) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(shape, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, shape, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.addScenery(level, x, z, y, model, typecode, typecode2, 1, 1, 0);

            if (loc.blockwalk && collision) {
                collision.addLoc(x, z, loc.width, loc.length, angle, loc.blockrange);
            }
        } else {
            if (loc.hillskew) {
                if (angle == 1) {
                    const temp = heightNW;
                    heightNW = heightNE;
                    heightNE = heightSE;
                    heightSE = heightSW;
                    heightSW = temp;
                } else if (angle == 2) {
                    let temp = heightNW;
                    heightNW = heightSE;
                    heightSE = temp;
                    temp = heightNE;
                    heightNE = heightSW;
                    heightSW = temp;
                } else if (angle == 3) {
                    const temp = heightNW;
                    heightNW = heightSW;
                    heightSW = heightSE;
                    heightSE = heightNE;
                    heightNE = temp;
                }
            }

            if (shape === LocShape.WALLDECOR_STRAIGHT_NOOFFSET) {
                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                world?.setDecor(level, x, z, y, 0, 0, typecode, model, typecode2, angle * 512, ClientBuild.WSHAPE0[angle]);
            } else if (shape === LocShape.WALLDECOR_STRAIGHT_OFFSET) {
                let wallwidth: number = 16;
                if (world) {
                    const typecode: number = world.wallType(level, x, z);
                    if (typecode > 0) {
                        wallwidth = LocType.list((typecode >> 14) & 0x7fff).wallwidth;
                    }
                }

                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                world?.setDecor(
                    level,
                    x,
                    z,
                    y,
                    ClientBuild.DECORXOF[angle] * wallwidth,
                    ClientBuild.DECORZOF[angle] * wallwidth,
                    typecode,
                    model,
                    typecode2,
                    angle * 512,
                    ClientBuild.WSHAPE0[angle]
                );
            } else if (shape === LocShape.WALLDECOR_DIAGONAL_OFFSET) {
                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                world?.setDecor(level, x, z, y, 0, 0, typecode, model, typecode2, angle, 256);
            } else if (shape === LocShape.WALLDECOR_DIAGONAL_NOOFFSET) {
                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                world?.setDecor(level, x, z, y, 0, 0, typecode, model, typecode2, angle, 512);
            } else if (shape === LocShape.WALLDECOR_DIAGONAL_BOTH) {
                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                world?.setDecor(level, x, z, y, 0, 0, typecode, model, typecode2, angle, 768);
            }
        }
    }

    private getVisBelowLevel(level: number, stx: number, stz: number): number {
        if ((this.mapl[level][stx][stz] & MapFlag.VisBelow) === 0) {
            return level <= 0 || (this.mapl[1][stx][stz] & MapFlag.LinkBelow) === 0 ? level : level - 1;
        }

        return 0;
    }

    static getTable(hue: number, saturation: number, lightness: number): number {
        if (lightness > 179) {
            saturation = (saturation / 2) | 0;
        }
        if (lightness > 192) {
            saturation = (saturation / 2) | 0;
        }
        if (lightness > 217) {
            saturation = (saturation / 2) | 0;
        }
        if (lightness > 243) {
            saturation = (saturation / 2) | 0;
        }
        return (((hue / 4) | 0) << 10) + (((saturation / 32) | 0) << 7) + ((lightness / 2) | 0);
    }

    static changeLocAvailable(id: number, shape: number): boolean {
        const loc = LocType.list(id);
        if (shape == 11) {
            shape = 10;
        }
        if (shape >= 5 && shape <= 8) {
            shape = 4;
        }
        return loc.checkModel(shape);
    }

    static changeLocUnchecked(level: number, x: number, z: number, locId: number, shape: number, angle: number, trueLevel: number, levelHeightmap: Int32Array[][], world: World | null, cmap: CollisionMap | null): void {
        let heightSW: number = levelHeightmap[trueLevel][x][z];
        let heightSE: number = levelHeightmap[trueLevel][x + 1][z];
        let heightNW: number = levelHeightmap[trueLevel][x + 1][z + 1];
        let heightNE: number = levelHeightmap[trueLevel][x][z + 1];
        const y: number = (heightSW + heightSE + heightNW + heightNE) >> 2;

        const loc: LocType = LocType.list(locId);

        let typecode: number = (x + (z << 7) + (locId << 14) + 0x40000000) | 0;
        if (!loc.active) {
            typecode += -0x80000000; // int.min
        }
        typecode |= 0;

        const typecode2: number = ((((angle << 6) + shape) | 0) << 24) >> 24;

        if (shape === LocShape.GROUND_DECOR) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(22, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, 22, shape, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.setGroundDecor(model, level, x, z, y, typecode, typecode2);

            if (loc.blockwalk && loc.active && cmap) {
                cmap.blockGround(x, z);
            }
        } else if (shape === LocShape.CENTREPIECE_STRAIGHT || shape === LocShape.CENTREPIECE_DIAGONAL) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(10, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, 10, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            if (model) {
                let yaw: number = 0;
                if (shape === LocShape.CENTREPIECE_DIAGONAL) {
                    yaw += 256;
                }

                let width: number;
                let height: number;
                if (angle === LocAngle.NORTH || angle === LocAngle.SOUTH) {
                    width = loc.length;
                    height = loc.width;
                } else {
                    width = loc.width;
                    height = loc.length;
                }

                world?.addScenery(level, x, z, y, model, typecode, typecode2, width, height, yaw);
            }

            if (loc.blockwalk && cmap) {
                cmap.addLoc(x, z, loc.width, loc.length, angle, loc.blockrange);
            }
        } else if (shape >= LocShape.ROOF_STRAIGHT) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(shape, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, shape, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.addScenery(level, x, z, y, model, typecode, typecode2, 1, 1, 0);

            if (loc.blockwalk && cmap) {
                cmap.addLoc(x, z, loc.width, loc.length, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_STRAIGHT) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(0, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, 0, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.setWall(level, x, z, y, ClientBuild.WSHAPE0[angle], 0, model, null, typecode, typecode2);

            if (loc.blockwalk && cmap) {
                cmap.addWall(x, z, shape, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_DIAGONAL_CORNER) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(1, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, 1, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.setWall(level, x, z, y, ClientBuild.WSHAPE1[angle], 0, model, null, typecode, typecode2);

            if (loc.blockwalk && cmap) {
                cmap.addWall(x, z, shape, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_L) {
            const offset: number = (angle + 1) & 0x3;

            let model1: ModelSource | null;
            let model2: ModelSource | null;
            if (loc.anim === -1) {
                model1 = loc.getModel(2, angle + 4, heightSW, heightSE, heightNE, heightNW, -1);
                model2 = loc.getModel(2, offset, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model1 = new ClientLocAnim(locId, 2, angle + 4, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                model2 = new ClientLocAnim(locId, 2, offset, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.setWall(level, x, z, y, ClientBuild.WSHAPE0[angle], ClientBuild.WSHAPE0[offset], model1, model2, typecode, typecode2);

            if (loc.blockwalk && cmap) {
                cmap.addWall(x, z, shape, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_SQUARE_CORNER) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(3, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, 3, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.setWall(level, x, z, y, ClientBuild.WSHAPE1[angle], 0, model, null, typecode, typecode2);

            if (loc.blockwalk && cmap) {
                cmap.addWall(x, z, shape, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_DIAGONAL) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(shape, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(locId, shape, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            world?.addScenery(level, x, z, y, model, typecode, typecode2, 1, 1, 0);

            if (loc.blockwalk && cmap) {
                cmap.addLoc(x, z, loc.width, loc.length, angle, loc.blockrange);
            }
        } else {
            if (loc.hillskew) {
                if (angle == 1) {
                    const temp = heightNW;
                    heightNW = heightNE;
                    heightNE = heightSE;
                    heightSE = heightSW;
                    heightSW = temp;
                } else if (angle == 2) {
                    let temp = heightNW;
                    heightNW = heightSE;
                    heightSE = temp;
                    temp = heightNE;
                    heightNE = heightSW;
                    heightSW = temp;
                } else if (angle == 3) {
                    const temp = heightNW;
                    heightNW = heightSW;
                    heightSW = heightSE;
                    heightSE = heightNE;
                    heightNE = temp;
                }
            }

            if (shape === LocShape.WALLDECOR_STRAIGHT_NOOFFSET) {
                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                world?.setDecor(level, x, z, y, 0, 0, typecode, model, typecode2, angle * 512, ClientBuild.WSHAPE0[angle]);
            } else if (shape === LocShape.WALLDECOR_STRAIGHT_OFFSET) {
                let wallwidth: number = 16;
                if (world) {
                    const typecode: number = world.wallType(level, x, z);
                    if (typecode > 0) {
                        wallwidth = LocType.list((typecode >> 14) & 0x7fff).wallwidth;
                    }
                }

                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                world?.setDecor(level, x, z, y, ClientBuild.DECORXOF[angle] * wallwidth, ClientBuild.DECORZOF[angle] * wallwidth, typecode, model, typecode2, angle * 512, ClientBuild.WSHAPE0[angle]);
            } else if (shape === LocShape.WALLDECOR_DIAGONAL_OFFSET) {
                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                world?.setDecor(level, x, z, y, 0, 0, typecode, model, typecode2, angle, 256);
            } else if (shape === LocShape.WALLDECOR_DIAGONAL_NOOFFSET) {
                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                world?.setDecor(level, x, z, y, 0, 0, typecode, model, typecode2, angle, 512);
            } else if (shape === LocShape.WALLDECOR_DIAGONAL_BOTH) {
                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                world?.setDecor(level, x, z, y, 0, 0, typecode, model, typecode2, angle, 768);
            }
        }
    }

    static getUCol(hsl: number, lightness: number): number {
        if (hsl === -1) {
            return 12345678;
        }

        lightness = ((lightness * (hsl & 0x7f)) / 128) | 0;
        if (lightness < 2) {
            lightness = 2;
        } else if (lightness > 126) {
            lightness = 126;
        }

        return (hsl & 0xff80) + lightness;
    }

    static getOCol(hsl: number, scalar: number): number {
        if (hsl === -2) {
            return 12345678;
        }

        if (hsl === -1) {
            if (scalar < 0) {
                scalar = 0;
            } else if (scalar > 127) {
                scalar = 127;
            }
            return 127 - scalar;
        } else {
            scalar = ((scalar * (hsl & 0x7f)) / 128) | 0;
            if (scalar < 2) {
                scalar = 2;
            } else if (scalar > 126) {
                scalar = 126;
            }
            return (hsl & 0xff80) + scalar;
        }
    }
}
