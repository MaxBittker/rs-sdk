import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';

import Model from '#/dash3d/Model.js';
import PixFont from '#/graphics/PixFont.js';

import LruCache from '#/datastruct/LruCache.js';
import JString from '#/datastruct/JString.js';

import Pix32 from '#/graphics/Pix32.js';

import { TypedArray1d } from '#/util/Arrays.js';
import NpcType from '#/config/NpcType.js';
import ObjType from '#/config/ObjType.js';
import type ClientPlayer from '#/dash3d/ClientPlayer.js';
import AnimFrame from '#/dash3d/AnimFrame.js';

export const enum ComponentType {
    TYPE_LAYER = 0,
    TYPE_UNUSED = 1, // TODO
    TYPE_INV = 2,
    TYPE_RECT = 3,
    TYPE_TEXT = 4,
    TYPE_GRAPHIC = 5,
    TYPE_MODEL = 6,
    TYPE_INV_TEXT = 7,
};

export const enum ButtonType {
    BUTTON_OK = 1,
    BUTTON_TARGET = 2,
    BUTTON_CLOSE = 3,
    BUTTON_TOGGLE = 4,
    BUTTON_SELECT = 5,
    BUTTON_CONTINUE = 6,
};

export default class IfType {
    static list: IfType[] = [];
    static modelCache: LruCache<Model> = new LruCache(30);
    static spriteCache: LruCache<Pix32> | null = null;

    animFrame: number = 0;
    animCycle: number = 0;
    id: number = -1;
    layerId: number = -1;
    type: number = -1;
    buttonType: number = -1;
    clientCode: number = 0;
    width: number = 0;
    height: number = 0;
    trans: number = 0;
    overLayerId: number = -1;
    x: number = 0;
    y: number = 0;
    scripts: (Uint16Array | null)[] | null = null;
    scriptComparator: Uint8Array | null = null;
    scriptOperand: Uint16Array | null = null;
    scrollHeight: number = 0;
    scrollPos: number = 0;
    hide: boolean = false;
    children: number[] | null = null;
    childX: number[] | null = null;
    childY: number[] | null = null;
    linkObjType: Int32Array | null = null;
    linkObjNumber: Int32Array | null = null;
    objSwap: boolean = false;
    objOps: boolean = false;
    objUse: boolean = false;
    objReplace: boolean = false;
    marginX: number = 0;
    marginY: number = 0;
    invBackgroundX: Int16Array | null = null;
    invBackgroundY: Int16Array | null = null;
    invBackground: (Pix32 | null)[] | null = null;
    iop: (string | null)[] | null = null;
    fill: boolean = false;
    centre: boolean = false;
    font: PixFont | null = null;
    shadow: boolean = false;
    text: string | null = null;
    text2: string | null = null;
    colour: number = 0;
    colour2: number = 0;
    colourOver: number = 0;
    colour2Over: number = 0;
    graphic: Pix32 | null = null;
    graphic2: Pix32 | null = null;
    model1Type: number = 0;
    model1Id: number = 0;
    model2Id: number = 0;
    model2Type: number = 0;
    modelAnim: number = -1;
    modelAnim2: number = -1;
    modelZoom: number = 0;
    modelXAn: number = 0;
    modelYAn: number = 0;
    targetVerb: string | null = null;
    targetBase: string | null = null;
    targetMask: number = -1;
    buttonText: string | null = null;

    static init(interfaces: JagFile, media: JagFile | null, fonts: PixFont[]): void {
        this.spriteCache = new LruCache(50000);

        const data: Packet = new Packet(interfaces.read('data'));
        let layer: number = -1;

        const count = data.g2();
        this.list = new Array(count);

        while (data.pos < data.length) {
            let id: number = data.g2();
            if (id === 65535) {
                layer = data.g2();
                id = data.g2();
            }

            const com: IfType = (this.list[id] = new IfType());
            com.id = id;
            com.layerId = layer;

            com.type = data.g1();
            com.buttonType = data.g1();
            com.clientCode = data.g2();
            com.width = data.g2();
            com.height = data.g2();
            com.trans = data.g1();

            com.overLayerId = data.g1();
            if (com.overLayerId === 0) {
                com.overLayerId = -1;
            } else {
                com.overLayerId = ((com.overLayerId - 1) << 8) + data.g1();
            }

            const scriptStackCount: number = data.g1();
            if (scriptStackCount > 0) {
                com.scriptComparator = new Uint8Array(scriptStackCount);
                com.scriptOperand = new Uint16Array(scriptStackCount);

                for (let i: number = 0; i < scriptStackCount; i++) {
                    com.scriptComparator[i] = data.g1();
                    com.scriptOperand[i] = data.g2();
                }
            }

            const scriptCount: number = data.g1();
            if (scriptCount > 0) {
                com.scripts = new TypedArray1d(scriptCount, null);

                for (let i: number = 0; i < scriptCount; i++) {
                    const opcodeCount: number = data.g2();

                    const script: Uint16Array = new Uint16Array(opcodeCount);
                    com.scripts[i] = script;
                    for (let j: number = 0; j < opcodeCount; j++) {
                        script[j] = data.g2();
                    }
                }
            }

            if (com.type === ComponentType.TYPE_LAYER) {
                com.scrollHeight = data.g2();
                com.hide = data.g1() === 1;

                const childCount: number = data.g2();
                com.children = new Array(childCount);
                com.childX = new Array(childCount);
                com.childY = new Array(childCount);

                for (let i: number = 0; i < childCount; i++) {
                    com.children[i] = data.g2();
                    com.childX[i] = data.g2b();
                    com.childY[i] = data.g2b();
                }
            }

            if (com.type === ComponentType.TYPE_UNUSED) {
                data.pos += 3;
            }

            if (com.type === ComponentType.TYPE_INV) {
                com.linkObjType = new Int32Array(com.width * com.height);
                com.linkObjNumber = new Int32Array(com.width * com.height);

                com.objSwap = data.g1() === 1;
                com.objOps = data.g1() === 1;
                com.objUse = data.g1() === 1;
                com.objReplace = data.g1() === 1;

                com.marginX = data.g1();
                com.marginY = data.g1();

                com.invBackgroundX = new Int16Array(20);
                com.invBackgroundY = new Int16Array(20);
                com.invBackground = new TypedArray1d(20, null);

                for (let i: number = 0; i < 20; i++) {
                    if (data.g1() === 1) {
                        com.invBackgroundX[i] = data.g2b();
                        com.invBackgroundY[i] = data.g2b();

                        const graphic: string = data.gjstr();
                        if (media && graphic.length > 0) {
                            const spriteIndex: number = graphic.lastIndexOf(',');
                            com.invBackground[i] = this.getSprite(media, graphic.substring(0, spriteIndex), parseInt(graphic.substring(spriteIndex + 1)));
                        }
                    }
                }

                com.iop = new TypedArray1d(5, null);
                for (let i: number = 0; i < 5; i++) {
                    com.iop[i] = data.gjstr();
                    if (com.iop[i]!.length === 0) {
                        com.iop[i] = null;
                    }
                }
            }

            if (com.type === ComponentType.TYPE_RECT) {
                com.fill = data.g1() === 1;
            }

            if (com.type === ComponentType.TYPE_TEXT || com.type === ComponentType.TYPE_UNUSED) {
                com.centre = data.g1() === 1;

                const font: number = data.g1();
                if (fonts) {
                    com.font = fonts[font];
                }

                com.shadow = data.g1() === 1;
            }

            if (com.type === ComponentType.TYPE_TEXT) {
                com.text = data.gjstr();
                com.text2 = data.gjstr();
            }

            if (com.type === ComponentType.TYPE_UNUSED || com.type === ComponentType.TYPE_RECT || com.type === ComponentType.TYPE_TEXT) {
                com.colour = data.g4();
            }

            if (com.type === ComponentType.TYPE_RECT || com.type === ComponentType.TYPE_TEXT) {
                com.colour2 = data.g4();
                com.colourOver = data.g4();
                com.colour2Over = data.g4();
            }

            if (com.type === ComponentType.TYPE_GRAPHIC) {
                const graphic: string = data.gjstr();
                if (media && graphic.length > 0) {
                    const index: number = graphic.lastIndexOf(',');
                    com.graphic = this.getSprite(media, graphic.substring(0, index), parseInt(graphic.substring(index + 1), 10));
                }

                const activeGraphic: string = data.gjstr();
                if (media && activeGraphic.length > 0) {
                    const index: number = activeGraphic.lastIndexOf(',');
                    com.graphic2 = this.getSprite(media, activeGraphic.substring(0, index), parseInt(activeGraphic.substring(index + 1), 10));
                }
            }

            if (com.type === ComponentType.TYPE_MODEL) {
                const model: number = data.g1();
                if (model !== 0) {
                    com.model1Type = 1;
                    com.model1Id = ((model - 1) << 8) + data.g1();
                }

                const activeModel: number = data.g1();
                if (activeModel !== 0) {
                    com.model2Type = 1;
                    com.model2Id = ((activeModel - 1) << 8) + data.g1();
                }

                com.modelAnim = data.g1();
                if (com.modelAnim === 0) {
                    com.modelAnim = -1;
                } else {
                    com.modelAnim = ((com.modelAnim - 1) << 8) + data.g1();
                }

                com.modelAnim2 = data.g1();
                if (com.modelAnim2 === 0) {
                    com.modelAnim2 = -1;
                } else {
                    com.modelAnim2 = ((com.modelAnim2 - 1) << 8) + data.g1();
                }

                com.modelZoom = data.g2();
                com.modelXAn = data.g2();
                com.modelYAn = data.g2();
            }

            if (com.type === ComponentType.TYPE_INV_TEXT) {
                com.linkObjType = new Int32Array(com.width * com.height);
                com.linkObjNumber = new Int32Array(com.width * com.height);

                com.centre = data.g1() === 1;

                const font: number = data.g1();
                if (fonts) {
                    com.font = fonts[font];
                }

                com.shadow = data.g1() === 1;
                com.colour = data.g4();
                com.marginX = data.g2b();
                com.marginY = data.g2b();

                com.objOps = data.g1() === 1;

                com.iop = new TypedArray1d(5, null);
                for (let i: number = 0; i < 5; i++) {
                    com.iop[i] = data.gjstr();
                    if (com.iop[i]!.length === 0) {
                        com.iop[i] = null;
                    }
                }
            }

            if (com.buttonType === ButtonType.BUTTON_TARGET || com.type === ComponentType.TYPE_INV) {
                com.targetVerb = data.gjstr();
                com.targetBase = data.gjstr();
                com.targetMask = data.g2();
            }

            if (com.buttonType === ButtonType.BUTTON_OK || com.buttonType === ButtonType.BUTTON_TOGGLE || com.buttonType === ButtonType.BUTTON_SELECT || com.buttonType === ButtonType.BUTTON_CONTINUE) {
                com.buttonText = data.gjstr();

                if (com.buttonText.length === 0) {
                    if (com.buttonType === ButtonType.BUTTON_OK) {
                        com.buttonText = 'Ok';
                    } else if (com.buttonType === ButtonType.BUTTON_TOGGLE) {
                        com.buttonText = 'Select';
                    } else if (com.buttonType === ButtonType.BUTTON_SELECT) {
                        com.buttonText = 'Select';
                    } else if (com.buttonType === ButtonType.BUTTON_CONTINUE) {
                        com.buttonText = 'Continue';
                    }
                }
            }
        }

        this.spriteCache = null;
    }

    swapSlots(src: number, dst: number) {
        if (!this.linkObjType || !this.linkObjNumber) {
            return;
        }

        let tmp = this.linkObjType[src];
        this.linkObjType[src] = this.linkObjType[dst];
        this.linkObjType[dst] = tmp;

        tmp = this.linkObjNumber[src];
        this.linkObjNumber[src] = this.linkObjNumber[dst];
        this.linkObjNumber[dst] = tmp;
    }

    getTempModel(primaryFrame: number, secondaryFrame: number, active: boolean, localPlayer: ClientPlayer | null): Model | null {
        let model: Model | null = null;
        if (active) {
            model = this.getModel(this.model2Type, this.model2Id, localPlayer);
        } else {
            model = this.getModel(this.model1Type, this.model1Id, localPlayer);
        }

        if (!model) {
            return null;
        }

        if (primaryFrame === -1 && secondaryFrame === -1 && !model.faceColour) {
            return model;
        }

        const tmp: Model = Model.copyForAnim(model, true, AnimFrame.animateTransparencies(primaryFrame) && AnimFrame.animateTransparencies(secondaryFrame), false);
        if (primaryFrame !== -1 || secondaryFrame !== -1) {
            tmp.prepareAnim();
        }

        if (primaryFrame !== -1) {
            tmp.animate(primaryFrame);
        }

        if (secondaryFrame !== -1) {
            tmp.animate(secondaryFrame);
        }

        tmp.calculateNormals(64, 768, -50, -10, -50, true);
        return tmp;
    }

    private getModel(type: number, id: number, localPlayer: ClientPlayer | null): Model | null {
        let model = IfType.modelCache.find(BigInt((type << 16) + id));
        if (model) {
            return model;
        }

        if (type === 1) {
            model = Model.load(id);
        } else if (type === 2) {
            model = NpcType.list(id).getHead();
        } else if (type === 3) {
            if (localPlayer) {
                model = localPlayer.getHeadModel();
            }
        } else if (type === 4) {
            model = ObjType.list(id).getModelUnlit(50);
        } else if (type === 5) {
            model = null;
        }

        if (model) {
            IfType.modelCache.put(model, BigInt((type << 16) + id));
        }

        return model;
    }

    static cacheModel(model: Model, type: number, id: number) {
        IfType.modelCache.clear();

        if (model && type != 4) {
            IfType.modelCache.put(model, BigInt((type << 16) + id));
        }
    }

    private static getSprite(media: JagFile, name: string, spriteIndex: number): Pix32 | null {
        const uid: bigint = (JString.hashCode(name) << 8n) | BigInt(spriteIndex);

        if (this.spriteCache) {
            const image = this.spriteCache.find(uid);
            if (image) {
                return image;
            }
        }

        try {
            const image = Pix32.depack(media, name, spriteIndex);
            this.spriteCache?.put(image, uid);
            return image;
        } catch (_e) {
            return null;
        }
    }
}
