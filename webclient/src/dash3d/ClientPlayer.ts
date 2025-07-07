import IdkType from '#/config/IdkType.js';
import ObjType from '#/config/ObjType.js';
import SpotAnimType from '#/config/SpotAnimType.js';
import SeqType from '#/config/SeqType.js';

import LruCache from '#/datastruct/LruCache.js';
import JString from '#/datastruct/JString.js';

import ClientEntity from '#/dash3d/ClientEntity.js';

import Model from '#/dash3d/Model.js';

import Packet from '#/io/Packet.js';

import { TypedArray1d } from '#/util/Arrays.js';

export const enum PlayerUpdate {
    APPEARANCE = 0x1,
    ANIM = 0x2,
    FACE_ENTITY = 0x4,
    SAY = 0x8,
    DAMAGE = 0x10,
    FACE_COORD = 0x20,
    CHAT = 0x40,
    BIG_UPDATE = 0x80,
    SPOTANIM = 0x100,
    EXACT_MOVE = 0x200,
    DAMAGE2 = 0x400,
}

const enum HairColor {
    HAIR_DARK_BROWN = 6798,
    HAIR_WHITE = 107,
    HAIR_LIGHT_GREY = 10283,
    HAIR_DARK_GREY = 16,
    HAIR_APRICOT = 4797,
    HAIR_STRAW = 7744,
    HAIR_LIGHT_BROWN = 5799,
    HAIR_BROWN = 4634,
    HAIR_TURQUOISE = 33697,
    HAIR_GREEN = 22433,
    HAIR_GINGER = 2983,
    HAIR_MAGENTA = 54193,
}

const enum BodyColorSource {
    BODY_KHAKI = 8741,
    BODY_CHARCOAL = 12,
    BODY_CRIMSON = 64030,
    BODY_NAVY = 43162,
    BODY_STRAW = 7735,
    BODY_WHITE = 8404,
    BODY_RED = 1701,
    BODY_BLUE = 38430,
    BODY_GREEN = 24094,
    BODY_YELLOW = 10153,
    BODY_PURPLE = 56621,
    BODY_ORANGE = 4783,
    BODY_ROSE = 1341,
    BODY_LIME = 16578,
    BODY_CYAN = 35003,
    BODY_EMERALD = 25239,
}

const enum BodyColorDest {
    BODY_RECOLOR_KHAKI = 9104,
    BODY_RECOLOR_CHARCOAL = 10275,
    BODY_RECOLOR_CRIMSON = 7595,
    BODY_RECOLOR_NAVY = 3610,
    BODY_RECOLOR_STRAW = 7975,
    BODY_RECOLOR_WHITE = 8526,
    BODY_RECOLOR_RED = 918,
    BODY_RECOLOR_BLUE = 38802,
    BODY_RECOLOR_GREEN = 24466,
    BODY_RECOLOR_YELLOW = 10145,
    BODY_RECOLOR_PURPLE = 58654,
    BODY_RECOLOR_ORANGE = 5027,
    BODY_RECOLOR_ROSE = 1457,
    BODY_RECOLOR_LIME = 16565,
    BODY_RECOLOR_CYAN = 34991,
    BODY_RECOLOR_EMERALD = 25486,
}

const enum FeetColor {
    FEET_BROWN = 4626,
    FEET_KHAKI = 11146,
    FEET_ASHEN = 6439,
    FEET_DARK = 12,
    FEET_TERRACOTTA = 4758,
    FEET_GREY = 10270,
}

const enum SkinColor {
    SKIN = 4574,
    SKIN_DARKER = 4550,
    SKIN_DARKER_DARKER = 4537,
    SKIN_DARKER_DARKER_DARKER = 5681,
    SKIN_DARKER_DARKER_DARKER_DARKER = 5673,
    SKIN_DARKER_DARKER_DARKER_DARKER_DARKER = 5790,
    SKIN_DARKER_DARKER_DARKER_DARKER_DARKER_DARKER = 6806,
    SKIN_DARKER_DARKER_DARKER_DARKER_DARKER_DARKER_DARKER = 8076,
}

export default class ClientPlayer extends ClientEntity {
    // prettier-ignore
    static readonly TORSO_RECOLORS: number[] = [
        BodyColorDest.BODY_RECOLOR_KHAKI,
        BodyColorDest.BODY_RECOLOR_CHARCOAL,
        BodyColorDest.BODY_RECOLOR_CRIMSON,
        BodyColorDest.BODY_RECOLOR_NAVY,
        BodyColorDest.BODY_RECOLOR_STRAW,
        BodyColorDest.BODY_RECOLOR_WHITE,
        BodyColorDest.BODY_RECOLOR_RED,
        BodyColorDest.BODY_RECOLOR_BLUE,
        BodyColorDest.BODY_RECOLOR_GREEN,
        BodyColorDest.BODY_RECOLOR_YELLOW,
        BodyColorDest.BODY_RECOLOR_PURPLE,
        BodyColorDest.BODY_RECOLOR_ORANGE,
        BodyColorDest.BODY_RECOLOR_ROSE,
        BodyColorDest.BODY_RECOLOR_LIME,
        BodyColorDest.BODY_RECOLOR_CYAN,
        BodyColorDest.BODY_RECOLOR_EMERALD
    ];

    // prettier-ignore
    static readonly DESIGN_IDK_COLORS: number[][] = [
        [ // hair
            HairColor.HAIR_DARK_BROWN,
            HairColor.HAIR_WHITE,
            HairColor.HAIR_LIGHT_GREY,
            HairColor.HAIR_DARK_GREY,
            HairColor.HAIR_APRICOT,
            HairColor.HAIR_STRAW,
            HairColor.HAIR_LIGHT_BROWN,
            HairColor.HAIR_BROWN,
            HairColor.HAIR_TURQUOISE,
            HairColor.HAIR_GREEN,
            HairColor.HAIR_GINGER,
            HairColor.HAIR_MAGENTA
        ],
        [ // torso
            BodyColorSource.BODY_KHAKI,
            BodyColorSource.BODY_CHARCOAL,
            BodyColorSource.BODY_CRIMSON,
            BodyColorSource.BODY_NAVY,
            BodyColorSource.BODY_STRAW,
            BodyColorSource.BODY_WHITE,
            BodyColorSource.BODY_RED,
            BodyColorSource.BODY_BLUE,
            BodyColorSource.BODY_GREEN,
            BodyColorSource.BODY_YELLOW,
            BodyColorSource.BODY_PURPLE,
            BodyColorSource.BODY_ORANGE,
            BodyColorSource.BODY_ROSE,
            BodyColorSource.BODY_LIME,
            BodyColorSource.BODY_CYAN,
            BodyColorSource.BODY_EMERALD
        ],
        [ // legs
            BodyColorSource.BODY_EMERALD - 1,
            BodyColorSource.BODY_KHAKI + 1,
            BodyColorSource.BODY_CHARCOAL,
            BodyColorSource.BODY_CRIMSON,
            BodyColorSource.BODY_NAVY,
            BodyColorSource.BODY_STRAW,
            BodyColorSource.BODY_WHITE,
            BodyColorSource.BODY_RED,
            BodyColorSource.BODY_BLUE,
            BodyColorSource.BODY_GREEN,
            BodyColorSource.BODY_YELLOW,
            BodyColorSource.BODY_PURPLE,
            BodyColorSource.BODY_ORANGE,
            BodyColorSource.BODY_ROSE,
            BodyColorSource.BODY_LIME,
            BodyColorSource.BODY_CYAN
        ],
        [ // feet
            FeetColor.FEET_BROWN,
            FeetColor.FEET_KHAKI,
            FeetColor.FEET_ASHEN,
            FeetColor.FEET_DARK,
            FeetColor.FEET_TERRACOTTA,
            FeetColor.FEET_GREY
        ],
        [ // skin
            SkinColor.SKIN_DARKER,
            SkinColor.SKIN_DARKER_DARKER,
            SkinColor.SKIN_DARKER_DARKER_DARKER,
            SkinColor.SKIN_DARKER_DARKER_DARKER_DARKER,
            SkinColor.SKIN_DARKER_DARKER_DARKER_DARKER_DARKER,
            SkinColor.SKIN_DARKER_DARKER_DARKER_DARKER_DARKER_DARKER,
            SkinColor.SKIN_DARKER_DARKER_DARKER_DARKER_DARKER_DARKER_DARKER,
            SkinColor.SKIN
        ]
    ];

    name: string | null = null;
    visible: boolean = false;
    gender: number = 0;
    headicons: number = 0;
    appearance: Uint16Array = new Uint16Array(12);
    colour: Uint16Array = new Uint16Array(5);
    combatLevel: number = 0;
    hash: bigint = 0n;
    lowMemory: boolean = false;
    modelCacheKey: bigint = -1n;
    static modelCache: LruCache | null = new LruCache(200);
    y: number = 0;
    locStartCycle: number = 0;
    locStopCycle: number = 0;
    locOffsetX: number = 0;
    locOffsetY: number = 0;
    locOffsetZ: number = 0;
    locModel: Model | null = null;
    minTileX: number = 0;
    minTileZ: number = 0;
    maxTileX: number = 0;
    maxTileZ: number = 0;

    /*@__MANGLE_PROP__*/
    read(buf: Packet): void {
        buf.pos = 0;

        this.gender = buf.g1();
        this.headicons = buf.g1();

        for (let part: number = 0; part < 12; part++) {
            const msb: number = buf.g1();
            if (msb === 0) {
                this.appearance[part] = 0;
            } else {
                this.appearance[part] = (msb << 8) + buf.g1();
            }
        }

        for (let part: number = 0; part < 5; part++) {
            let color: number = buf.g1();
            if (color < 0 || color >= ClientPlayer.DESIGN_IDK_COLORS[part].length) {
                color = 0;
            }
            this.colour[part] = color;
        }

        this.readyanim = buf.g2();
        if (this.readyanim === 65535) {
            this.readyanim = -1;
        }

        this.turnanim = buf.g2();
        if (this.turnanim === 65535) {
            this.turnanim = -1;
        }

        this.walkanim = buf.g2();
        if (this.walkanim === 65535) {
            this.walkanim = -1;
        }

        this.walkanim_b = buf.g2();
        if (this.walkanim_b === 65535) {
            this.walkanim_b = -1;
        }

        this.walkanim_l = buf.g2();
        if (this.walkanim_l === 65535) {
            this.walkanim_l = -1;
        }

        this.walkanim_r = buf.g2();
        if (this.walkanim_r === 65535) {
            this.walkanim_r = -1;
        }

        this.runanim = buf.g2();
        if (this.runanim === 65535) {
            this.runanim = -1;
        }

        this.name = JString.formatName(JString.fromBase37(buf.g8()));
        this.combatLevel = buf.g1();
        this.visible = true;

        this.hash = 0n;
        for (let part: number = 0; part < 12; part++) {
            this.hash <<= 0x4n;
            if (this.appearance[part] >= 256) {
                this.hash += BigInt(this.appearance[part]) - 256n;
            }
        }
        if (this.appearance[0] >= 256) {
            this.hash += (BigInt(this.appearance[0]) - 256n) >> 4n;
        }
        if (this.appearance[1] >= 256) {
            this.hash += (BigInt(this.appearance[1]) - 256n) >> 8n;
        }
        for (let part: number = 0; part < 5; part++) {
            this.hash <<= 0x3n;
            this.hash += BigInt(this.colour[part]);
        }
        this.hash <<= 0x1n;
        this.hash += BigInt(this.gender);
    }

    getModel(loopCycle: number): Model | null {
        if (!this.visible) {
            return null;
        }

        let model = this.getAnimatedModel();
        if (model == null) {
            return null;
        }

        this.height = model.minY;
        model.picking = true;

        if (this.lowMemory) {
            return model;
        }

        if (this.spotanimId != -1 && this.spotanimFrame != -1) {
            const spot = SpotAnimType.types[this.spotanimId];
            const spotModel = spot.getModel();

            if (spotModel != null) {
                const temp: Model = Model.modelShareColored(spotModel, true, !spot.animHasAlpha, false);
                temp.translate(-this.spotanimHeight, 0, 0);
                temp.createLabelReferences();
                if (spot.seq && spot.seq.frames) {
                    temp.applyTransform(spot.seq.frames[this.spotanimFrame]);
                }
                temp.labelFaces = null;
                temp.labelVertices = null;
                if (spot.resizeh != 128 || spot.resizev != 128) {
                    temp.scale(spot.resizev, spot.resizeh, spot.resizeh);
                }
                temp.calculateNormals(spot.ambient + 64, spot.contrast + 850, -30, -50, -30, true);

                const models: Model[] = [model, temp];
                model = Model.modelFromModelsBounds(models, 2);
            }
        }

        if (this.locModel != null) {
            if (loopCycle >= this.locStopCycle) {
                this.locModel = null;
            }

            if (loopCycle >= this.locStartCycle && loopCycle < this.locStopCycle) {
                const loc = this.locModel;
                if (loc) {
                    loc.translate(this.locOffsetY - this.y, this.locOffsetX - this.x, this.locOffsetZ - this.z);

                    if (this.dstYaw == 512) {
                        loc.rotateY90();
                        loc.rotateY90();
                        loc.rotateY90();
                    } else if (this.dstYaw == 1024) {
                        loc.rotateY90();
                        loc.rotateY90();
                    } else if (this.dstYaw == 1536) {
                        loc.rotateY90();
                    }

                    const models: Model[] = [model, loc];
                    model = Model.modelFromModelsBounds(models, 2);

                    if (this.dstYaw == 512) {
                        loc.rotateY90();
                    } else if (this.dstYaw == 1024) {
                        loc.rotateY90();
                        loc.rotateY90();
                    } else if (this.dstYaw == 1536) {
                        loc.rotateY90();
                        loc.rotateY90();
                        loc.rotateY90();
                    }

                    loc.translate(this.y - this.locOffsetY, super.x - this.locOffsetX, super.z - this.locOffsetZ);
                }
            }
        }

        model.picking = true;
        return model;
    }

    getAnimatedModel(): Model | null {
        let hash: bigint = this.hash;
        let primaryTransformId: number = -1;
        let secondaryTransformId: number = -1;
        let rightHandValue: number = -1;
        let leftHandValue: number = -1;

        if (this.primarySeqId >= 0 && this.primarySeqDelay === 0) {
            const seq: SeqType = SeqType.types[this.primarySeqId];

            if (seq.frames) {
                primaryTransformId = seq.frames[this.primarySeqFrame];
            }

            if (this.secondarySeqId >= 0 && this.secondarySeqId !== this.readyanim) {
                const secondFrames: Int16Array | null = SeqType.types[this.secondarySeqId].frames;
                if (secondFrames) {
                    secondaryTransformId = secondFrames[this.secondarySeqFrame];
                }
            }

            if (seq.righthand >= 0) {
                rightHandValue = seq.righthand;
                hash += BigInt(rightHandValue - this.appearance[5]) << 40n;
            }

            if (seq.lefthand >= 0) {
                leftHandValue = seq.lefthand;
                hash += BigInt(leftHandValue - this.appearance[3]) << 48n;
            }
        } else if (this.secondarySeqId >= 0) {
            const secondFrames: Int16Array | null = SeqType.types[this.secondarySeqId].frames;
            if (secondFrames) {
                primaryTransformId = secondFrames[this.secondarySeqFrame];
            }
        }

        let model: Model | null = ClientPlayer.modelCache?.get(hash) as Model | null;
        if (!model) {
            let needsModel = false;

            for (let part = 0; part < 12; part++) {
                let value = this.appearance[part];

                if (leftHandValue >= 0 && part == 3) {
                    value = leftHandValue;
                }

                if (rightHandValue >= 0 && part == 5) {
                    value = rightHandValue;
                }

                if (value >= 0x100 && value < 0x200 && !IdkType.types[value - 0x100].modelIsReady()) {
                    needsModel = true;
                }

                if (value >= 0x200 && !ObjType.get(value - 0x200).wornModelIsReady(this.gender)) {
                    needsModel = true;
                }
            }

            if (needsModel) {
                if (this.modelCacheKey !== -1n && ClientPlayer.modelCache) {
                    model = ClientPlayer.modelCache.get(this.hash) as Model | null;
                }

                if (model == null) {
                    return null;
                }
            }
        }

        if (!model) {
            const models: (Model | null)[] = new TypedArray1d(12, null);
            let modelCount: number = 0;

            for (let part: number = 0; part < 12; part++) {
                let value: number = this.appearance[part];

                if (leftHandValue >= 0 && part === 3) {
                    value = leftHandValue;
                }

                if (rightHandValue >= 0 && part === 5) {
                    value = rightHandValue;
                }

                if (value >= 256 && value < 512) {
                    const idkModel: Model | null = IdkType.types[value - 256].getModel();
                    if (idkModel) {
                        models[modelCount++] = idkModel;
                    }
                }

                if (value >= 512) {
                    const obj: ObjType = ObjType.get(value - 512);
                    const wornModel: Model | null = obj.getWornModel(this.gender);
                    if (wornModel) {
                        models[modelCount++] = wornModel;
                    }
                }
            }

            model = Model.modelFromModels(models, modelCount);
            for (let part: number = 0; part < 5; part++) {
                if (this.colour[part] === 0) {
                    continue;
                }

                model.recolour(ClientPlayer.DESIGN_IDK_COLORS[part][0], ClientPlayer.DESIGN_IDK_COLORS[part][this.colour[part]]);

                if (part === 1) {
                    model.recolour(ClientPlayer.TORSO_RECOLORS[0], ClientPlayer.TORSO_RECOLORS[this.colour[part]]);
                }
            }

            model.createLabelReferences();
            model.calculateNormals(64, 850, -30, -50, -30, true);
            ClientPlayer.modelCache?.put(hash, model);
            this.modelCacheKey = hash;
        }

        if (this.lowMemory) {
            return model;
        }

        const tmp: Model = Model.modelShareAlpha(model, true);
        if (primaryTransformId !== -1 && secondaryTransformId !== -1) {
            tmp.applyTransforms(primaryTransformId, secondaryTransformId, SeqType.types[this.primarySeqId].walkmerge);
        } else if (primaryTransformId !== -1) {
            tmp.applyTransform(primaryTransformId);
        }

        tmp.calculateBoundsCylinder();
        tmp.labelFaces = null;
        tmp.labelVertices = null;
        return tmp;
    }

    getHeadModel(): Model | null {
        if (!this.visible) {
            return null;
        }

		let needsModel = false;

		for (let i = 0; i < 12; i++) {
			const part = this.appearance[i];

			if (part >= 0x100 && part < 0x200 && !IdkType.types[part - 0x100].headModelIsReady()) {
                console.log('head model not ready');
				needsModel = true;
			}

			if (part >= 0x200 && !ObjType.get(part - 0x200).headModelIsReady(this.gender)) {
				needsModel = true;
			}
		}

		if (needsModel) {
			return null;
		}

        const models: (Model | null)[] = new TypedArray1d(12, null);
        let modelCount: number = 0;
        for (let part: number = 0; part < 12; part++) {
            const value: number = this.appearance[part];

            if (value >= 256 && value < 512) {
                const idkModel = IdkType.types[value - 256].getHeadModel();
                if (idkModel) {
                    models[modelCount++] = idkModel;
                }
            }

            if (value >= 512) {
                const headModel: Model | null = ObjType.get(value - 512).getHeadModel(this.gender);
                if (headModel) {
                    models[modelCount++] = headModel;
                }
            }
        }

        const tmp: Model = Model.modelFromModels(models, modelCount);
        for (let part: number = 0; part < 5; part++) {
            if (this.colour[part] === 0) {
                continue;
            }

            tmp.recolour(ClientPlayer.DESIGN_IDK_COLORS[part][0], ClientPlayer.DESIGN_IDK_COLORS[part][this.colour[part]]);

            if (part === 1) {
                tmp.recolour(ClientPlayer.TORSO_RECOLORS[0], ClientPlayer.TORSO_RECOLORS[this.colour[part]]);
            }
        }

        return tmp;
    }

    isVisible(): boolean {
        return this.visible;
    }
}
