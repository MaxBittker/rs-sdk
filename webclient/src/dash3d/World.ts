import FloType from '#/config/FloType.js';
import LocType from '#/config/LocType.js';

import CollisionMap, { CollisionConstants } from '#/dash3d/CollisionMap.js';
import { LocAngle } from '#/dash3d/LocAngle.js';
import LocShape from '#/dash3d/LocShape.js';
import World3D from '#/dash3d/World3D.js';

import ClientLocAnim from '#/dash3d/ClientLocAnim.js';

import { OverlayShape } from '#/dash3d/OverlayShape.js';

import { Colors } from '#/graphics/Colors.js';
import Pix3D from '#/graphics/Pix3D.js';
import Model from '#/dash3d/Model.js';

import Packet from '#/io/Packet.js';

import { Int32Array2d, Int32Array3d, Uint8Array3d } from '#/util/Arrays.js';
import type ModelSource from '#/dash3d/ModelSource.ts';
import type OnDemand from '#/io/OnDemand.ts';

// noinspection JSSuspiciousNameCombination,DuplicatedCode
export default class World {
    static readonly ROTATION_WALL_TYPE: Int8Array = Int8Array.of(1, 2, 4, 8);
    static readonly ROTATION_WALL_CORNER_TYPE: Uint8Array = Uint8Array.of(16, 32, 64, 128);
    static readonly WALL_DECORATION_ROTATION_FORWARD_X: Int8Array = Int8Array.of(1, 0, -1, 0);
    static readonly WALL_DECORATION_ROTATION_FORWARD_Z: Int8Array = Int8Array.of(0, -1, 0, 1);

    static randomHueOffset: number = ((Math.random() * 17.0) | 0) - 8;
    static randomLightnessOffset: number = ((Math.random() * 33.0) | 0) - 16;

    static lowMemory: boolean = true;
    static levelBuilt: number = 0;
    static fullbright: boolean = false;

    static perlin(x: number, z: number): number {
        let value: number = this.perlinScale(x + 45365, z + 91923, 4) + ((this.perlinScale(x + 10294, z + 37821, 2) - 128) >> 1) + ((this.perlinScale(x, z, 1) - 128) >> 2) - 128;
        value = ((value * 0.3) | 0) + 35;
        if (value < 10) {
            value = 10;
        } else if (value > 60) {
            value = 60;
        }
        return value;
    }

    static perlinScale(x: number, z: number, scale: number): number {
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
        const f: number = (65536 - Pix3D.cos[((x * 1024) / scale) | 0]) >> 1;
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

    static addLoc(loopCycle: number, level: number, x: number, z: number, scene: World3D | null, levelHeightmap: Int32Array[][], collision: CollisionMap | null, locId: number, shape: number, angle: number, trueLevel: number): void {
        const heightSW: number = levelHeightmap[trueLevel][x][z];
        const heightSE: number = levelHeightmap[trueLevel][x + 1][z];
        const heightNW: number = levelHeightmap[trueLevel][x + 1][z + 1];
        const heightNE: number = levelHeightmap[trueLevel][x][z + 1];
        const y: number = (heightSW + heightSE + heightNW + heightNE) >> 2;

        const loc: LocType = LocType.get(locId);

        let typecode1: number = (x + (z << 7) + (locId << 14) + 0x40000000) | 0;
        if (!loc.active) {
            typecode1 += -0x80000000; // int.min
        }
        typecode1 |= 0;

        const typecode2: number = ((((angle << 6) + shape) | 0) << 24) >> 24;

        if (shape === LocShape.GROUND_DECOR.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(22, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 22, shape, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addGroundDecoration(model, level, x, z, y, typecode1, typecode2);

            if (loc.blockwalk && loc.active && collision) {
                collision.addFloor(x, z);
            }
        } else if (shape === LocShape.CENTREPIECE_STRAIGHT.id || shape === LocShape.CENTREPIECE_DIAGONAL.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(10, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 10, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            if (model) {
                let yaw: number = 0;
                if (shape === LocShape.CENTREPIECE_DIAGONAL.id) {
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

                scene?.addLoc(level, x, z, y, model, typecode1, typecode2, width, height, yaw);
            }

            if (loc.blockwalk && collision) {
                collision.addLoc(x, z, loc.width, loc.length, angle, loc.blockrange);
            }
        } else if (shape >= LocShape.ROOF_STRAIGHT.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(shape, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, shape, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addLoc(level, x, z, y, model, typecode1, typecode2, 1, 1, 0);

            if (loc.blockwalk && collision) {
                collision.addLoc(x, z, loc.width, loc.length, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_STRAIGHT.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(0, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 0, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addWall(level, x, z, y, World.ROTATION_WALL_TYPE[angle], 0, model, null, typecode1, typecode2);

            if (loc.blockwalk && collision) {
                collision.addWall(x, z, shape, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_DIAGONAL_CORNER.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(1, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 1, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addWall(level, x, z, y, World.ROTATION_WALL_CORNER_TYPE[angle], 0, model, null, typecode1, typecode2);

            if (loc.blockwalk && collision) {
                collision.addWall(x, z, shape, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_L.id) {
            const offset: number = (angle + 1) & 0x3;

            let model1: ModelSource | null;
            let model2: ModelSource | null;
            if (loc.anim === -1) {
                model1 = loc.getModel(2, angle + 4, heightSW, heightSE, heightNE, heightNW, -1);
                model2 = loc.getModel(2, offset, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model1 = new ClientLocAnim(loopCycle, locId, 2, angle + 4, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                model2 = new ClientLocAnim(loopCycle, locId, 2, offset, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addWall(
                level,
                x,
                z,
                y,
                World.ROTATION_WALL_TYPE[angle],
                World.ROTATION_WALL_TYPE[offset],
                model1,
                model2,
                typecode1,
                typecode2
            );

            if (loc.blockwalk && collision) {
                collision.addWall(x, z, shape, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_SQUARE_CORNER.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(3, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 3, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addWall(level, x, z, y, World.ROTATION_WALL_CORNER_TYPE[angle], 0, model, null, typecode1, typecode2);

            if (loc.blockwalk && collision) {
                collision.addWall(x, z, shape, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_DIAGONAL.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(shape, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, shape, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addLoc(level, x, z, y, model, typecode1, typecode2, 1, 1, 0);

            if (loc.blockwalk && collision) {
                collision.addLoc(x, z, loc.width, loc.length, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALLDECOR_STRAIGHT_NOOFFSET.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.setWallDecoration(level, x, z, y, 0, 0, typecode1, model, typecode2, angle * 512, World.ROTATION_WALL_TYPE[angle]);
        } else if (shape === LocShape.WALLDECOR_STRAIGHT_OFFSET.id) {
            let offset: number = 16;
            if (scene) {
                const typecode: number = scene.getWallTypecode(level, x, z);
                if (typecode > 0) {
                    offset = LocType.get((typecode >> 14) & 0x7fff).wallwidth;
                }
            }

            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.setWallDecoration(
                level,
                x,
                z,
                y,
                World.WALL_DECORATION_ROTATION_FORWARD_X[angle] * offset,
                World.WALL_DECORATION_ROTATION_FORWARD_Z[angle] * offset,
                typecode1,
                model,
                typecode2,
                angle * 512,
                World.ROTATION_WALL_TYPE[angle]
            );
        } else if (shape === LocShape.WALLDECOR_DIAGONAL_OFFSET.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.setWallDecoration(level, x, z, y, 0, 0, typecode1, model, typecode2, angle, 256);
        } else if (shape === LocShape.WALLDECOR_DIAGONAL_NOOFFSET.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.setWallDecoration(level, x, z, y, 0, 0, typecode1, model, typecode2, angle, 512);
        } else if (shape === LocShape.WALLDECOR_DIAGONAL_BOTH.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.setWallDecoration(level, x, z, y, 0, 0, typecode1, model, typecode2, angle, 768);
        }
    }

    private readonly maxTileX: number;
    private readonly maxTileZ: number;
    private readonly heightmap: Int32Array[][];
    private readonly levelTileFlags: Uint8Array[][];
    private readonly levelTileUnderlayIds: Uint8Array[][];
    private readonly levelTileOverlayIds: Uint8Array[][];
    private readonly levelTileOverlayShape: Uint8Array[][];
    private readonly levelTileOverlayRotation: Uint8Array[][];
    private readonly shadow: Uint8Array[][];
    private readonly levelLightmap: Int32Array[];
    private readonly blendChroma: Int32Array;
    private readonly blendSaturation: Int32Array;
    private readonly blendLightness: Int32Array;
    private readonly blendLuminance: Int32Array;
    private readonly blendMagnitude: Int32Array;
    private readonly occlusion: Int32Array[][];

    public constructor(maxTileX: number, maxTileZ: number, levelHeightmap: Int32Array[][], levelTileFlags: Uint8Array[][]) {
        this.maxTileX = maxTileX;
        this.maxTileZ = maxTileZ;
        this.heightmap = levelHeightmap;
        this.levelTileFlags = levelTileFlags;

        this.levelTileUnderlayIds = new Uint8Array3d(CollisionConstants.LEVELS, maxTileX, maxTileZ);
        this.levelTileOverlayIds = new Uint8Array3d(CollisionConstants.LEVELS, maxTileX, maxTileZ);
        this.levelTileOverlayShape = new Uint8Array3d(CollisionConstants.LEVELS, maxTileX, maxTileZ);
        this.levelTileOverlayRotation = new Uint8Array3d(CollisionConstants.LEVELS, maxTileX, maxTileZ);

        this.occlusion = new Int32Array3d(CollisionConstants.LEVELS, maxTileX + 1, maxTileZ + 1);
        this.shadow = new Uint8Array3d(CollisionConstants.LEVELS, maxTileX + 1, maxTileZ + 1);
        this.levelLightmap = new Int32Array2d(maxTileX + 1, maxTileZ + 1);

        this.blendChroma = new Int32Array(maxTileZ);
        this.blendSaturation = new Int32Array(maxTileZ);
        this.blendLightness = new Int32Array(maxTileZ);
        this.blendLuminance = new Int32Array(maxTileZ);
        this.blendMagnitude = new Int32Array(maxTileZ);
    }

    build(scene: World3D | null, collision: (CollisionMap | null)[]): void {
        for (let level: number = 0; level < CollisionConstants.LEVELS; level++) {
            for (let x: number = 0; x < CollisionConstants.SIZE; x++) {
                for (let z: number = 0; z < CollisionConstants.SIZE; z++) {
                    // solid
                    if ((this.levelTileFlags[level][x][z] & 0x1) === 1) {
                        let trueLevel: number = level;

                        // bridge
                        if ((this.levelTileFlags[1][x][z] & 0x2) === 2) {
                            trueLevel--;
                        }

                        if (trueLevel >= 0) {
                            collision[trueLevel]?.addFloor(x, z);
                        }
                    }
                }
            }
        }

        World.randomHueOffset += ((Math.random() * 5.0) | 0) - 2;
        if (World.randomHueOffset < -8) {
            World.randomHueOffset = -8;
        } else if (World.randomHueOffset > 8) {
            World.randomHueOffset = 8;
        }

        World.randomLightnessOffset += ((Math.random() * 5.0) | 0) - 2;
        if (World.randomLightnessOffset < -16) {
            World.randomLightnessOffset = -16;
        } else if (World.randomLightnessOffset > 16) {
            World.randomLightnessOffset = 16;
        }

        for (let level: number = 0; level < CollisionConstants.LEVELS; level++) {
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
                    const dx: number = this.heightmap[level][x + 1][z] - this.heightmap[level][x - 1][z];
                    const dz: number = this.heightmap[level][x][z + 1] - this.heightmap[level][x][z - 1];
                    const len: number = Math.sqrt(dx * dx + dz * dz + 65536) | 0;
                    const normalX: number = ((dx << 8) / len) | 0;
                    const normalY: number = (65536 / len) | 0;
                    const normalZ: number = ((dz << 8) / len) | 0;
                    const light: number = lightAmbient + (((lightX * normalX + lightY * normalY + lightZ * normalZ) / lightMagnitude) | 0);
                    const shade: number = (shademap[x - 1][z] >> 2) + (shademap[x + 1][z] >> 3) + (shademap[x][z - 1] >> 2) + (shademap[x][z + 1] >> 3) + (shademap[x][z] >> 1);
                    this.levelLightmap[x][z] = light - shade;
                }
            }

            for (let z: number = 0; z < this.maxTileZ; z++) {
                this.blendChroma[z] = 0;
                this.blendSaturation[z] = 0;
                this.blendLightness[z] = 0;
                this.blendLuminance[z] = 0;
                this.blendMagnitude[z] = 0;
            }

            for (let x0: number = -5; x0 < this.maxTileX + 5; x0++) {
                for (let z0: number = 0; z0 < this.maxTileZ; z0++) {
                    const x1: number = x0 + 5;
                    let debugMag: number;

                    if (x1 >= 0 && x1 < this.maxTileX) {
                        const underlayId: number = this.levelTileUnderlayIds[level][x1][z0] & 0xff;

                        if (underlayId > 0) {
                            const flu: FloType = FloType.types[underlayId - 1];
                            this.blendChroma[z0] += flu.chroma;
                            this.blendSaturation[z0] += flu.saturation;
                            this.blendLightness[z0] += flu.lightness;
                            this.blendLuminance[z0] += flu.luminance;
                            debugMag = this.blendMagnitude[z0]++;
                        }
                    }

                    const x2: number = x0 - 5;
                    if (x2 >= 0 && x2 < this.maxTileX) {
                        const underlayId: number = this.levelTileUnderlayIds[level][x2][z0] & 0xff;

                        if (underlayId > 0) {
                            const flu: FloType = FloType.types[underlayId - 1];
                            this.blendChroma[z0] -= flu.chroma;
                            this.blendSaturation[z0] -= flu.saturation;
                            this.blendLightness[z0] -= flu.lightness;
                            this.blendLuminance[z0] -= flu.luminance;
                            debugMag = this.blendMagnitude[z0]--;
                        }
                    }
                }

                if (x0 >= 1 && x0 < this.maxTileX - 1) {
                    let hueAccumulator: number = 0;
                    let saturationAccumulator: number = 0;
                    let lightnessAccumulator: number = 0;
                    let luminanceAccumulator: number = 0;
                    let magnitudeAccumulator: number = 0;

                    for (let z0: number = -5; z0 < this.maxTileZ + 5; z0++) {
                        const dz1: number = z0 + 5;
                        if (dz1 >= 0 && dz1 < this.maxTileZ) {
                            hueAccumulator += this.blendChroma[dz1];
                            saturationAccumulator += this.blendSaturation[dz1];
                            lightnessAccumulator += this.blendLightness[dz1];
                            luminanceAccumulator += this.blendLuminance[dz1];
                            magnitudeAccumulator += this.blendMagnitude[dz1];
                        }

                        const dz2: number = z0 - 5;
                        if (dz2 >= 0 && dz2 < this.maxTileZ) {
                            hueAccumulator -= this.blendChroma[dz2];
                            saturationAccumulator -= this.blendSaturation[dz2];
                            lightnessAccumulator -= this.blendLightness[dz2];
                            luminanceAccumulator -= this.blendLuminance[dz2];
                            magnitudeAccumulator -= this.blendMagnitude[dz2];
                        }

                        if (z0 >= 1 && z0 < this.maxTileZ - 1 && (!World.lowMemory || ((this.levelTileFlags[level][x0][z0] & 0x10) === 0 && this.getDrawLevel(level, x0, z0) === World.levelBuilt))) {
                            const underlayId: number = this.levelTileUnderlayIds[level][x0][z0] & 0xff;
                            const overlayId: number = this.levelTileOverlayIds[level][x0][z0] & 0xff;

                            if (underlayId > 0 || overlayId > 0) {
                                const heightSW: number = this.heightmap[level][x0][z0];
                                const heightSE: number = this.heightmap[level][x0 + 1][z0];
                                const heightNE: number = this.heightmap[level][x0 + 1][z0 + 1];
                                const heightNW: number = this.heightmap[level][x0][z0 + 1];

                                const lightSW: number = this.levelLightmap[x0][z0];
                                const lightSE: number = this.levelLightmap[x0 + 1][z0];
                                const lightNE: number = this.levelLightmap[x0 + 1][z0 + 1];
                                const lightNW: number = this.levelLightmap[x0][z0 + 1];

                                let baseColor: number = -1;
                                let tintColor: number = -1;

                                if (underlayId > 0) {
                                    const hue: number = ((hueAccumulator * 256) / luminanceAccumulator) | 0;
                                    const saturation: number = (saturationAccumulator / magnitudeAccumulator) | 0;
                                    let lightness: number = (lightnessAccumulator / magnitudeAccumulator) | 0;
                                    baseColor = this.hsl24to16(hue, saturation, lightness);
                                    const randomHue: number = (hue + World.randomHueOffset) & 0xff;
                                    lightness += World.randomLightnessOffset;
                                    if (lightness < 0) {
                                        lightness = 0;
                                    } else if (lightness > 255) {
                                        lightness = 255;
                                    }
                                    tintColor = this.hsl24to16(randomHue, saturation, lightness);
                                }

                                if (level > 0) {
                                    let occludes: boolean = underlayId !== 0 || this.levelTileOverlayShape[level][x0][z0] === OverlayShape.PLAIN;

                                    if (overlayId > 0 && !FloType.types[overlayId - 1].occlude) {
                                        occludes = false;
                                    }

                                    // occludes && flat
                                    if (occludes && heightSW === heightSE && heightSW === heightNE && heightSW === heightNW) {
                                        this.occlusion[level][x0][z0] |= 0x924;
                                    }
                                }

                                let shadeColor: number = 0;
                                if (baseColor !== -1) {
                                    shadeColor = Pix3D.hslPal[World.mulHSL(tintColor, 96)];
                                }

                                if (overlayId === 0) {
                                    scene?.setTile(
                                        level,
                                        x0,
                                        z0,
                                        OverlayShape.PLAIN,
                                        LocAngle.WEST,
                                        -1,
                                        heightSW,
                                        heightSE,
                                        heightNE,
                                        heightNW,
                                        World.mulHSL(baseColor, lightSW),
                                        World.mulHSL(baseColor, lightSE),
                                        World.mulHSL(baseColor, lightNE),
                                        World.mulHSL(baseColor, lightNW),
                                        Colors.BLACK,
                                        Colors.BLACK,
                                        Colors.BLACK,
                                        Colors.BLACK,
                                        shadeColor,
                                        Colors.BLACK
                                    );
                                } else {
                                    const shape: number = this.levelTileOverlayShape[level][x0][z0] + 1;
                                    const rotation: number = this.levelTileOverlayRotation[level][x0][z0];
                                    const flo: FloType = FloType.types[overlayId - 1];
                                    let textureId: number = flo.texture;
                                    let hsl: number;
                                    let rgb: number;

                                    if (textureId >= 0) {
                                        rgb = Pix3D.getAverageTextureRGB(textureId);
                                        hsl = -1;
                                    } else if (flo.rgb === Colors.MAGENTA) {
                                        rgb = 0;
                                        hsl = -2;
                                        textureId = -1;
                                    } else {
                                        hsl = this.hsl24to16(flo.hue, flo.saturation, flo.lightness);
                                        rgb = Pix3D.hslPal[this.adjustLightness(flo.hsl, 96)];
                                    }

                                    scene?.setTile(
                                        level,
                                        x0,
                                        z0,
                                        shape,
                                        rotation,
                                        textureId,
                                        heightSW,
                                        heightSE,
                                        heightNE,
                                        heightNW,
                                        World.mulHSL(baseColor, lightSW),
                                        World.mulHSL(baseColor, lightSE),
                                        World.mulHSL(baseColor, lightNE),
                                        World.mulHSL(baseColor, lightNW),
                                        this.adjustLightness(hsl, lightSW),
                                        this.adjustLightness(hsl, lightSE),
                                        this.adjustLightness(hsl, lightNE),
                                        this.adjustLightness(hsl, lightNW),
                                        shadeColor,
                                        rgb
                                    );
                                }
                            }
                        }
                    }
                }
            }

            for (let stz: number = 1; stz < this.maxTileZ - 1; stz++) {
                for (let stx: number = 1; stx < this.maxTileX - 1; stx++) {
                    scene?.setDrawLevel(level, stx, stz, this.getDrawLevel(level, stx, stz));
                }
            }
        }

        if (!World.fullbright) {
            scene?.buildModels(64, 768, -50, -10, -50);
        }

        for (let x: number = 0; x < this.maxTileX; x++) {
            for (let z: number = 0; z < this.maxTileZ; z++) {
                if ((this.levelTileFlags[1][x][z] & 0x2) === 2) {
                    scene?.setBridge(x, z);
                }
            }
        }

        if (!World.fullbright) {
            let wall0: number = 0x1; // this flag is set by walls with rotation 0 or 2
            let wall1: number = 0x2; // this flag is set by walls with rotation 1 or 3
            let floor: number = 0x4; // this flag is set by floors which are flat

            for (let topLevel: number = 0; topLevel < CollisionConstants.LEVELS; topLevel++) {
                if (topLevel > 0) {
                    wall0 <<= 0x3;
                    wall1 <<= 0x3;
                    floor <<= 0x3;
                }

                for (let level: number = 0; level <= topLevel; level++) {
                    for (let tileZ: number = 0; tileZ <= this.maxTileZ; tileZ++) {
                        for (let tileX: number = 0; tileX <= this.maxTileX; tileX++) {
                            if ((this.occlusion[level][tileX][tileZ] & wall0) !== 0) {
                                let minTileZ: number = tileZ;
                                let maxTileZ: number = tileZ;
                                let minLevel: number = level;
                                let maxLevel: number = level;

                                while (minTileZ > 0 && (this.occlusion[level][tileX][minTileZ - 1] & wall0) !== 0) {
                                    minTileZ--;
                                }

                                while (maxTileZ < this.maxTileZ && (this.occlusion[level][tileX][maxTileZ + 1] & wall0) !== 0) {
                                    maxTileZ++;
                                }

                                find_min_level: while (minLevel > 0) {
                                    for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                        if ((this.occlusion[minLevel - 1][tileX][z] & wall0) === 0) {
                                            break find_min_level;
                                        }
                                    }
                                    minLevel--;
                                }

                                find_max_level: while (maxLevel < topLevel) {
                                    for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                        if ((this.occlusion[maxLevel + 1][tileX][z] & wall0) === 0) {
                                            break find_max_level;
                                        }
                                    }
                                    maxLevel++;
                                }

                                const area: number = (maxLevel + 1 - minLevel) * (maxTileZ + 1 - minTileZ);
                                if (area >= 8) {
                                    const minY: number = this.heightmap[maxLevel][tileX][minTileZ] - 240;
                                    const maxX: number = this.heightmap[minLevel][tileX][minTileZ];

                                    World3D.addOccluder(topLevel, 1, tileX * 128, minY, minTileZ * 128, tileX * 128, maxX, maxTileZ * 128 + 128);

                                    for (let l: number = minLevel; l <= maxLevel; l++) {
                                        for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                            this.occlusion[l][tileX][z] &= ~wall0;
                                        }
                                    }
                                }
                            }

                            if ((this.occlusion[level][tileX][tileZ] & wall1) !== 0) {
                                let minTileX: number = tileX;
                                let maxTileX: number = tileX;
                                let minLevel: number = level;
                                let maxLevel: number = level;

                                while (minTileX > 0 && (this.occlusion[level][minTileX - 1][tileZ] & wall1) !== 0) {
                                    minTileX--;
                                }

                                while (maxTileX < this.maxTileX && (this.occlusion[level][maxTileX + 1][tileZ] & wall1) !== 0) {
                                    maxTileX++;
                                }

                                find_min_level2: while (minLevel > 0) {
                                    for (let x: number = minTileX; x <= maxTileX; x++) {
                                        if ((this.occlusion[minLevel - 1][x][tileZ] & wall1) === 0) {
                                            break find_min_level2;
                                        }
                                    }
                                    minLevel--;
                                }

                                find_max_level2: while (maxLevel < topLevel) {
                                    for (let x: number = minTileX; x <= maxTileX; x++) {
                                        if ((this.occlusion[maxLevel + 1][x][tileZ] & wall1) === 0) {
                                            break find_max_level2;
                                        }
                                    }
                                    maxLevel++;
                                }

                                const area: number = (maxLevel + 1 - minLevel) * (maxTileX + 1 - minTileX);

                                if (area >= 8) {
                                    const minY: number = this.heightmap[maxLevel][minTileX][tileZ] - 240;
                                    const maxY: number = this.heightmap[minLevel][minTileX][tileZ];

                                    World3D.addOccluder(topLevel, 2, minTileX * 128, minY, tileZ * 128, maxTileX * 128 + 128, maxY, tileZ * 128);

                                    for (let l: number = minLevel; l <= maxLevel; l++) {
                                        for (let x: number = minTileX; x <= maxTileX; x++) {
                                            this.occlusion[l][x][tileZ] &= ~wall1;
                                        }
                                    }
                                }
                            }
                            if ((this.occlusion[level][tileX][tileZ] & floor) !== 0) {
                                let minTileX: number = tileX;
                                let maxTileX: number = tileX;
                                let minTileZ: number = tileZ;
                                let maxTileZ: number = tileZ;

                                while (minTileZ > 0 && (this.occlusion[level][tileX][minTileZ - 1] & floor) !== 0) {
                                    minTileZ--;
                                }

                                while (maxTileZ < this.maxTileZ && (this.occlusion[level][tileX][maxTileZ + 1] & floor) !== 0) {
                                    maxTileZ++;
                                }

                                find_min_tile_xz: while (minTileX > 0) {
                                    for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                        if ((this.occlusion[level][minTileX - 1][z] & floor) === 0) {
                                            break find_min_tile_xz;
                                        }
                                    }
                                    minTileX--;
                                }

                                find_max_tile_xz: while (maxTileX < this.maxTileX) {
                                    for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                        if ((this.occlusion[level][maxTileX + 1][z] & floor) === 0) {
                                            break find_max_tile_xz;
                                        }
                                    }
                                    maxTileX++;
                                }

                                if ((maxTileX + 1 - minTileX) * (maxTileZ + 1 - minTileZ) >= 4) {
                                    const y: number = this.heightmap[level][minTileX][minTileZ];

                                    World3D.addOccluder(topLevel, 4, minTileX * 128, y, minTileZ * 128, maxTileX * 128 + 128, y, maxTileZ * 128 + 128);

                                    for (let x: number = minTileX; x <= maxTileX; x++) {
                                        for (let z: number = minTileZ; z <= maxTileZ; z++) {
                                            this.occlusion[level][x][z] &= ~floor;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    spreadHeight(startZ: number, startX: number, endZ: number, endX: number) {
        for (let z: number = startZ; z < startZ + endZ; z++) {
            for (let x: number = startX; x < startX + endX; x++) {
				if (x >= 0 && x < this.maxTileX && z >= 0 && z < this.maxTileZ) {
					this.shadow[0][x][z] = 127;

					if (startX == x && x > 0) {
						this.heightmap[0][x][z] = this.heightmap[0][x - 1][z];
					}

					if (startX + endX == x && x < this.maxTileX - 1) {
						this.heightmap[0][x][z] = this.heightmap[0][x + 1][z];
					}

					if (startZ == z && z > 0) {
						this.heightmap[0][x][z] = this.heightmap[0][x][z - 1];
					}

					if (startZ + endZ == z && z < this.maxTileZ - 1) {
						this.heightmap[0][x][z] = this.heightmap[0][x][z + 1];
					}
				}
            }
        }
    }

    loadGround(originX: number, originZ: number, xOffset: number, zOffset: number, src: Uint8Array): void {
        const buf: Packet = new Packet(src);

        for (let level: number = 0; level < CollisionConstants.LEVELS; level++) {
            for (let x: number = 0; x < 64; x++) {
                for (let z: number = 0; z < 64; z++) {
                    const stx: number = x + xOffset;
                    const stz: number = z + zOffset;
                    let opcode: number;

                    if (stx >= 0 && stx < CollisionConstants.SIZE && stz >= 0 && stz < CollisionConstants.SIZE) {
                        this.levelTileFlags[level][stx][stz] = 0;
                        // eslint-disable-next-line no-constant-condition
                        while (true) {
                            opcode = buf.g1();
                            if (opcode === 0) {
                                if (level === 0) {
                                    this.heightmap[0][stx][stz] = -World.perlin(stx + originX + 932731, stz + 556238 + originZ) * 8;
                                } else {
                                    this.heightmap[level][stx][stz] = this.heightmap[level - 1][stx][stz] - 240;
                                }
                                break;
                            }

                            if (opcode === 1) {
                                let height: number = buf.g1();
                                if (height === 1) {
                                    height = 0;
                                }
                                if (level === 0) {
                                    this.heightmap[0][stx][stz] = -height * 8;
                                } else {
                                    this.heightmap[level][stx][stz] = this.heightmap[level - 1][stx][stz] - height * 8;
                                }
                                break;
                            }

                            if (opcode <= 49) {
                                this.levelTileOverlayIds[level][stx][stz] = buf.g1b();
                                this.levelTileOverlayShape[level][stx][stz] = ((((opcode - 2) / 4) | 0) << 24) >> 24;
                                this.levelTileOverlayRotation[level][stx][stz] = (((opcode - 2) & 0x3) << 24) >> 24;
                            } else if (opcode <= 81) {
                                this.levelTileFlags[level][stx][stz] = ((opcode - 49) << 24) >> 24;
                            } else {
                                this.levelTileUnderlayIds[level][stx][stz] = ((opcode - 81) << 24) >> 24;
                            }
                        }
                    } else {
                        // eslint-disable-next-line no-constant-condition
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

    static locsAreReady(src: Uint8Array, xOffset: number, zOffset: number): boolean {
        let ready = true;
		const buf = new Packet(src);
		let locId = -1;

		while (true) {
			const deltaId = buf.gsmarts();
			if (deltaId == 0) {
				break;
			}

			locId += deltaId;

			let locPos = 0;
			let skip = false;

            while (true) {
                if (skip) {
                    const deltaPos = buf.gsmarts();
                    if (deltaPos == 0) {
                        break;
                    }

                    buf.g1();
                } else {
                    const deltaPos = buf.gsmarts();
                    if (deltaPos == 0) {
                        break;
                    }

                    locPos += deltaPos - 1;

                    let z = locPos & 0x3F;
                    let x = locPos >> 6 & 0x3F;

                    let shape = buf.g1() >> 2;
                    let stx = xOffset + x;
                    let stz = zOffset + z;

                    if (stx > 0 && stz > 0 && stx < 103 && stz < 103) {
                        const loc = LocType.get(locId);
                        if (shape != 22 || !World.lowMemory || loc.active || loc.forcedecor) {
                            if (!loc.modelsAreReady()) {
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

    static prefetchLocs(buf: Packet, od: OnDemand) {
		let locId = -1;
		while (true) {
			const deltaId = buf.gsmarts();
			if (deltaId == 0) {
				return;
			}

			locId += deltaId;

			let loc = LocType.get(locId);
			loc.prefetch(od);

			while (true) {
				const deltaPos = buf.gsmarts();
				if (deltaPos == 0) {
					break;
				}

				buf.g1();
			}
		}
    }

    loadLocations(loopCycle: number, scene: World3D | null, collision: (CollisionMap | null)[], src: Uint8Array, xOffset: number, zOffset: number): void {
        const buf: Packet = new Packet(src);
        let locId: number = -1;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const deltaId: number = buf.gsmarts();
            if (deltaId === 0) {
                return;
            }

            locId += deltaId;

            let locPos: number = 0;
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const deltaPos: number = buf.gsmarts();
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

                if (stx > 0 && stz > 0 && stx < CollisionConstants.SIZE - 1 && stz < CollisionConstants.SIZE - 1) {
                    let currentLevel: number = level;
                    if ((this.levelTileFlags[1][stx][stz] & 0x2) === 2) {
                        currentLevel = level - 1;
                    }

                    let collisionMap: CollisionMap | null = null;
                    if (currentLevel >= 0) {
                        collisionMap = collision[currentLevel];
                    }

                    this.addLoc(loopCycle, level, stx, stz, scene, collisionMap, locId, shape, rotation);
                }
            }
        }
    }

    private addLoc(loopCycle: number, level: number, x: number, z: number, scene: World3D | null, collision: CollisionMap | null, locId: number, shape: number, angle: number): void {
        if (World.lowMemory) {
            if ((this.levelTileFlags[level][x][z] & 0x10) !== 0) {
                return;
            }

            if (this.getDrawLevel(level, x, z) !== World.levelBuilt) {
                return;
            }
        }

        const heightSW: number = this.heightmap[level][x][z];
        const heightSE: number = this.heightmap[level][x + 1][z];
        const heightNE: number = this.heightmap[level][x + 1][z + 1];
        const heightNW: number = this.heightmap[level][x][z + 1];
        const y: number = (heightSW + heightSE + heightNE + heightNW) >> 2;

        const loc: LocType = LocType.get(locId);

        let typecode1: number = (x + (z << 7) + (locId << 14) + 0x40000000) | 0;
        if (!loc.active) {
            typecode1 += -0x80000000; // int.min
        }
        typecode1 |= 0;

        const typecode2: number = ((((angle << 6) + shape) | 0) << 24) >> 24;

        if (shape === LocShape.GROUND_DECOR.id) {
            if (!World.lowMemory || loc.active || loc.forcedecor) {
                let model: ModelSource | null;
                if (loc.anim === -1) {
                    model = loc.getModel(22, angle, heightSW, heightSE, heightNE, heightNW, -1);
                } else {
                    model = new ClientLocAnim(loopCycle, locId, 22, shape, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                }

                scene?.addGroundDecoration(model, level, x, z, y, typecode1, typecode2);

                if (loc.blockwalk && loc.active && collision) {
                    collision.addFloor(x, z);
                }
            }
        } else if (shape === LocShape.CENTREPIECE_STRAIGHT.id || shape === LocShape.CENTREPIECE_DIAGONAL.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(10, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 10, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            if (model) {
                let yaw: number = 0;
                if (shape === LocShape.CENTREPIECE_DIAGONAL.id) {
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

                if (scene?.addLoc(level, x, z, y, model, typecode1, typecode2, width, height, yaw) && loc.shadow) {
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
        } else if (shape >= LocShape.ROOF_STRAIGHT.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(shape, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, shape, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addLoc(level, x, z, y, model, typecode1, typecode2, 1, 1, 0);

            if (shape >= LocShape.ROOF_STRAIGHT.id && shape <= LocShape.ROOF_FLAT.id && shape !== LocShape.ROOF_DIAGONAL_WITH_ROOFEDGE.id && level > 0) {
                this.occlusion[level][x][z] |= 0x924;
            }

            if (loc.blockwalk && collision) {
                collision.addLoc(x, z, loc.width, loc.length, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALL_STRAIGHT.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(0, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 0, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addWall(level, x, z, y, World.ROTATION_WALL_TYPE[angle], 0, model, null, typecode1, typecode2);

            if (angle === LocAngle.WEST) {
                if (loc.shadow) {
                    this.shadow[level][x][z] = 50;
                    this.shadow[level][x][z + 1] = 50;
                }

                if (loc.occlude) {
                    this.occlusion[level][x][z] |= 0x249;
                }
            } else if (angle === LocAngle.NORTH) {
                if (loc.shadow) {
                    this.shadow[level][x][z + 1] = 50;
                    this.shadow[level][x + 1][z + 1] = 50;
                }

                if (loc.occlude) {
                    this.occlusion[level][x][z + 1] |= 0x492;
                }
            } else if (angle === LocAngle.EAST) {
                if (loc.shadow) {
                    this.shadow[level][x + 1][z] = 50;
                    this.shadow[level][x + 1][z + 1] = 50;
                }

                if (loc.occlude) {
                    this.occlusion[level][x + 1][z] |= 0x249;
                }
            } else if (angle === LocAngle.SOUTH) {
                if (loc.shadow) {
                    this.shadow[level][x][z] = 50;
                    this.shadow[level][x + 1][z] = 50;
                }

                if (loc.occlude) {
                    this.occlusion[level][x][z] |= 0x492;
                }
            }

            if (loc.blockwalk && collision) {
                collision.addWall(x, z, shape, angle, loc.blockrange);
            }

            if (loc.wallwidth !== 16) {
                scene?.setWallDecorationOffset(level, x, z, loc.wallwidth);
            }
        } else if (shape === LocShape.WALL_DIAGONAL_CORNER.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(1, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 1, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addWall(level, x, z, y, World.ROTATION_WALL_CORNER_TYPE[angle], 0, model, null, typecode1, typecode2);

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
        } else if (shape === LocShape.WALL_L.id) {
            const offset: number = (angle + 1) & 0x3;

            let model1: ModelSource | null;
            let model2: ModelSource | null;
            if (loc.anim === -1) {
                model1 = loc.getModel(2, angle + 4, heightSW, heightSE, heightNE, heightNW, -1);
                model2 = loc.getModel(2, offset, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model1 = new ClientLocAnim(loopCycle, locId, 2, angle + 4, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
                model2 = new ClientLocAnim(loopCycle, locId, 2, offset, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addWall(
                level,
                x,
                z,
                y,
                World.ROTATION_WALL_TYPE[angle],
                World.ROTATION_WALL_TYPE[offset],
                model1,
                model2,
                typecode1,
                typecode2
            );

            if (loc.occlude) {
                if (angle === LocAngle.WEST) {
                    this.occlusion[level][x][z] |= 0x109;
                    this.occlusion[level][x][z + 1] |= 0x492;
                } else if (angle === LocAngle.NORTH) {
                    this.occlusion[level][x][z + 1] |= 0x492;
                    this.occlusion[level][x + 1][z] |= 0x249;
                } else if (angle === LocAngle.EAST) {
                    this.occlusion[level][x + 1][z] |= 0x249;
                    this.occlusion[level][x][z] |= 0x492;
                } else if (angle === LocAngle.SOUTH) {
                    this.occlusion[level][x][z] |= 0x492;
                    this.occlusion[level][x][z] |= 0x249;
                }
            }

            if (loc.blockwalk && collision) {
                collision.addWall(x, z, shape, angle, loc.blockrange);
            }

            if (loc.wallwidth !== 16) {
                scene?.setWallDecorationOffset(level, x, z, loc.wallwidth);
            }
        } else if (shape === LocShape.WALL_SQUARE_CORNER.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(3, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 3, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addWall(level, x, z, y, World.ROTATION_WALL_CORNER_TYPE[angle], 0, model, null, typecode1, typecode2);

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
        } else if (shape === LocShape.WALL_DIAGONAL.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(shape, angle, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, shape, angle, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.addLoc(level, x, z, y, model, typecode1, typecode2, 1, 1, 0);

            if (loc.blockwalk && collision) {
                collision.addLoc(x, z, loc.width, loc.length, angle, loc.blockrange);
            }
        } else if (shape === LocShape.WALLDECOR_STRAIGHT_NOOFFSET.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.setWallDecoration(level, x, z, y, 0, 0, typecode1, model, typecode2, angle * 512, World.ROTATION_WALL_TYPE[angle]);
        } else if (shape === LocShape.WALLDECOR_STRAIGHT_OFFSET.id) {
            let wallwidth: number = 16;
            if (scene) {
                const typecode: number = scene.getWallTypecode(level, x, z);
                if (typecode > 0) {
                    wallwidth = LocType.get((typecode >> 14) & 0x7fff).wallwidth;
                }
            }

            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.setWallDecoration(
                level,
                x,
                z,
                y,
                World.WALL_DECORATION_ROTATION_FORWARD_X[angle] * wallwidth,
                World.WALL_DECORATION_ROTATION_FORWARD_Z[angle] * wallwidth,
                typecode1,
                model,
                typecode2,
                angle * 512,
                World.ROTATION_WALL_TYPE[angle]
            );
        } else if (shape === LocShape.WALLDECOR_DIAGONAL_OFFSET.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.setWallDecoration(level, x, z, y, 0, 0, typecode1, model, typecode2, angle, 256);
        } else if (shape === LocShape.WALLDECOR_DIAGONAL_NOOFFSET.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.setWallDecoration(level, x, z, y, 0, 0, typecode1, model, typecode2, angle, 512);
        } else if (shape === LocShape.WALLDECOR_DIAGONAL_BOTH.id) {
            let model: ModelSource | null;
            if (loc.anim === -1) {
                model = loc.getModel(4, 0, heightSW, heightSE, heightNE, heightNW, -1);
            } else {
                model = new ClientLocAnim(loopCycle, locId, 4, 0, heightSW, heightSE, heightNE, heightNW, loc.anim, true);
            }

            scene?.setWallDecoration(level, x, z, y, 0, 0, typecode1, model, typecode2, angle, 768);
        }
    }

    private getDrawLevel(level: number, stx: number, stz: number): number {
        if ((this.levelTileFlags[level][stx][stz] & 0x8) === 0) {
            return level <= 0 || (this.levelTileFlags[1][stx][stz] & 0x2) === 0 ? level : level - 1;
        }

        return 0;
    }

    hsl24to16(hue: number, saturation: number, lightness: number): number {
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

    static mulHSL(hsl: number, lightness: number): number {
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

    adjustLightness(hsl: number, scalar: number): number {
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
