import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';

import Model from '#/dash3d/Model.js';
import PixFont from '#/graphics/PixFont.js';

import LruCache from '#/datastruct/LruCache.js';
import JString from '#/datastruct/JString.js';

import Pix32 from '#/graphics/Pix32.js';

import { TypedArray1d } from '#/util/Arrays.js';
import NpcType from '#/config/NpcType.ts';
import ObjType from '#/config/ObjType.ts';
import type ClientPlayer from '#/dash3d/ClientPlayer.ts';

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

export default class Component {
    static types: Component[] = [];
    invSlotObjId: Int32Array | null = null;
    invSlotObjCount: Int32Array | null = null;
    seqFrame: number = 0;
    seqCycle: number = 0;
    id: number = -1;
    layer: number = -1;
    type: number = -1;
    buttonType: number = -1;
    clientCode: number = 0;
    width: number = 0;
    height: number = 0;
    alpha: number = 0;
    x: number = 0;
    y: number = 0;
    scripts: (Uint16Array | null)[] | null = null;
    scriptComparator: Uint8Array | null = null;
    scriptOperand: Uint16Array | null = null;
    overlayer: number = -1;
    scroll: number = 0;
    scrollPosition: number = 0;
    hide: boolean = false;
    children: number[] | null = null;
    activeModelType: number = 0;
    activeModel: number = 0;
    anim: number = -1;
    activeAnim: number = -1;
    zoom: number = 0;
    xan: number = 0;
    yan: number = 0;
    targetVerb: string | null = null;
    targetText: string | null = null;
    targetMask: number = -1;
    option: string | null = null;
    static modelCache: LruCache = new LruCache(30);
    static imageCache: LruCache | null = null;
    marginX: number = 0;
    marginY: number = 0;
    colour: number = 0;
    activeColour: number = 0;
    overColour: number = 0;
    modelType: number = 0;
    model: number = 0;
    graphic: Pix32 | null = null;
    activeGraphic: Pix32 | null = null;
    font: PixFont | null = null;
    text: string | null = null;
    activeText: string | null = null;
    draggable: boolean = false;
    interactable: boolean = false;
    usable: boolean = false;
    fill: boolean = false;
    center: boolean = false;
    shadowed: boolean = false;
    invSlotOffsetX: Int16Array | null = null;
    invSlotOffsetY: Int16Array | null = null;
    childX: number[] | null = null;
    childY: number[] | null = null;
    invSlotGraphic: (Pix32 | null)[] | null = null;
    iop: (string | null)[] | null = null;

    static unpack(interfaces: Jagfile, media: Jagfile | null, fonts: PixFont[]): void {
        this.imageCache = new LruCache(50000);

        const data: Packet = new Packet(interfaces.read('data'));
        let layer: number = -1;

        const count = data.g2();
        this.types = new Array(count);

        while (data.pos < data.length) {
            let id: number = data.g2();
            if (id === 65535) {
                layer = data.g2();
                id = data.g2();
            }

            const com: Component = (this.types[id] = new Component());
            com.id = id;
            com.layer = layer;
            com.type = data.g1();
            com.buttonType = data.g1();
            com.clientCode = data.g2();
            com.width = data.g2();
            com.height = data.g2();
            com.alpha = data.g1();

            com.overlayer = data.g1();
            if (com.overlayer === 0) {
                com.overlayer = -1;
            } else {
                com.overlayer = ((com.overlayer - 1) << 8) + data.g1();
            }

            const comparatorCount: number = data.g1();
            if (comparatorCount > 0) {
                com.scriptComparator = new Uint8Array(comparatorCount);
                com.scriptOperand = new Uint16Array(comparatorCount);

                for (let i: number = 0; i < comparatorCount; i++) {
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
                com.scroll = data.g2();
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
                com.invSlotObjId = new Int32Array(com.width * com.height);
                com.invSlotObjCount = new Int32Array(com.width * com.height);

                com.draggable = data.g1() === 1;
                com.interactable = data.g1() === 1;
                com.usable = data.g1() === 1;
                com.marginX = data.g1();
                com.marginY = data.g1();

                com.invSlotOffsetX = new Int16Array(20);
                com.invSlotOffsetY = new Int16Array(20);
                com.invSlotGraphic = new TypedArray1d(20, null);

                for (let i: number = 0; i < 20; i++) {
                    if (data.g1() === 1) {
                        com.invSlotOffsetX[i] = data.g2b();
                        com.invSlotOffsetY[i] = data.g2b();

                        const graphic: string = data.gjstr();
                        if (media && graphic.length > 0) {
                            const spriteIndex: number = graphic.lastIndexOf(',');
                            com.invSlotGraphic[i] = this.getImage(media, graphic.substring(0, spriteIndex), parseInt(graphic.substring(spriteIndex + 1)));
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
                com.center = data.g1() === 1;
                const font: number = data.g1();
                if (fonts) {
                    com.font = fonts[font];
                }
                com.shadowed = data.g1() === 1;
            }

            if (com.type === ComponentType.TYPE_TEXT) {
                com.text = data.gjstr();
                com.activeText = data.gjstr();
            }

            if (com.type === ComponentType.TYPE_UNUSED || com.type === ComponentType.TYPE_RECT || com.type === ComponentType.TYPE_TEXT) {
                com.colour = data.g4();
            }

            if (com.type === ComponentType.TYPE_RECT || com.type === ComponentType.TYPE_TEXT) {
                com.activeColour = data.g4();
                com.overColour = data.g4();
            }

            if (com.type === ComponentType.TYPE_GRAPHIC) {
                const graphic: string = data.gjstr();
                if (media && graphic.length > 0) {
                    const index: number = graphic.lastIndexOf(',');
                    com.graphic = this.getImage(media, graphic.substring(0, index), parseInt(graphic.substring(index + 1), 10));
                }

                const activeGraphic: string = data.gjstr();
                if (media && activeGraphic.length > 0) {
                    const index: number = activeGraphic.lastIndexOf(',');
                    com.activeGraphic = this.getImage(media, activeGraphic.substring(0, index), parseInt(activeGraphic.substring(index + 1), 10));
                }
            }

            if (com.type === ComponentType.TYPE_MODEL) {
                const model: number = data.g1();
                if (model !== 0) {
                    com.modelType = 1;
                    com.model = ((model - 1) << 8) + data.g1();
                }

                const activeModel: number = data.g1();
                if (activeModel !== 0) {
                    com.activeModelType = 1;
                    com.activeModel = ((activeModel - 1) << 8) + data.g1();
                }

                com.anim = data.g1();
                if (com.anim === 0) {
                    com.anim = -1;
                } else {
                    com.anim = ((com.anim - 1) << 8) + data.g1();
                }

                com.activeAnim = data.g1();
                if (com.activeAnim === 0) {
                    com.activeAnim = -1;
                } else {
                    com.activeAnim = ((com.activeAnim - 1) << 8) + data.g1();
                }

                com.zoom = data.g2();
                com.xan = data.g2();
                com.yan = data.g2();
            }

            if (com.type === ComponentType.TYPE_INV_TEXT) {
                com.invSlotObjId = new Int32Array(com.width * com.height);
                com.invSlotObjCount = new Int32Array(com.width * com.height);

                com.center = data.g1() === 1;
                const font: number = data.g1();
                if (fonts) {
                    com.font = fonts[font];
                }
                com.shadowed = data.g1() === 1;
                com.colour = data.g4();
                com.marginX = data.g2b();
                com.marginY = data.g2b();
                com.interactable = data.g1() === 1;

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
                com.targetText = data.gjstr();
                com.targetMask = data.g2();
            }

            if (com.buttonType === ButtonType.BUTTON_OK || com.buttonType === ButtonType.BUTTON_TOGGLE || com.buttonType === ButtonType.BUTTON_SELECT || com.buttonType === ButtonType.BUTTON_CONTINUE) {
                com.option = data.gjstr();

                if (com.option.length === 0) {
                    if (com.buttonType === ButtonType.BUTTON_OK) {
                        com.option = 'Ok';
                    } else if (com.buttonType === ButtonType.BUTTON_TOGGLE) {
                        com.option = 'Select';
                    } else if (com.buttonType === ButtonType.BUTTON_SELECT) {
                        com.option = 'Select';
                    } else if (com.buttonType === ButtonType.BUTTON_CONTINUE) {
                        com.option = 'Continue';
                    }
                }
            }
        }

        this.imageCache = null;
    }

    getModel(primaryFrame: number, secondaryFrame: number, active: boolean, localPlayer: ClientPlayer | null): Model | null {
        let model: Model | null = null;
        if (active) {
            model = this.loadModel(this.activeModelType, this.activeModel, localPlayer);
        } else {
            model = this.loadModel(this.modelType, this.model, localPlayer);
        }

        if (!model) {
            return null;
        }

        if (primaryFrame === -1 && secondaryFrame === -1 && !model.faceColour) {
            return model;
        }

        const tmp: Model = Model.modelShareColored(model, true, true, false);
        if (primaryFrame !== -1 || secondaryFrame !== -1) {
            tmp.createLabelReferences();
        }

        if (primaryFrame !== -1) {
            tmp.applyTransform(primaryFrame);
        }

        if (secondaryFrame !== -1) {
            tmp.applyTransform(secondaryFrame);
        }

        tmp.calculateNormals(64, 768, -50, -10, -50, true);
        return tmp;
    }

    loadModel(type: number, id: number, localPlayer: ClientPlayer | null): Model | null {
        let model = Component.modelCache.get(BigInt((type << 16) + id)) as Model | null;
        if (model) {
            return model;
        }

        if (type === 1) {
            model = Model.tryGet(id);
        } else if (type === 2) {
            model = NpcType.get(id).getHeadModel();
        } else if (type === 3) {
            if (localPlayer) {
                model = localPlayer.getHeadModel();
            }
        } else if (type === 4) {
            model = ObjType.get(id).getInvModel(50);
        } else if (type === 5) {
            model = null;
        }

        if (model) {
            Component.modelCache.put(BigInt((type << 16) + id), model);
        }

        return model;
    }

    static cacheModel(model: Model, type: number, id: number) {
        Component.modelCache.clear();

        if (model && type != 4) {
            Component.modelCache.put(BigInt((type << 16) + id), model);
        }
    }

    getAbsoluteX(): number {
        if (this.layer === this.id) {
            return this.x;
        }

        let parent: Component = Component.types[this.layer];
        if (!parent.children || !parent.childX || !parent.childY) {
            return this.x;
        }

        let childIndex: number = parent.children.indexOf(this.id);
        if (childIndex === -1) {
            return this.x;
        }

        let x: number = parent.childX[childIndex];
        while (parent.layer !== parent.id) {
            const grandParent: Component = Component.types[parent.layer];
            if (grandParent.children && grandParent.childX && grandParent.childY) {
                childIndex = grandParent.children.indexOf(parent.id);
                if (childIndex !== -1) {
                    x += grandParent.childX[childIndex];
                }
            }
            parent = grandParent;
        }

        return x;
    }

    private static getImage(media: Jagfile, name: string, spriteIndex: number): Pix32 | null {
        const uid: bigint = (JString.hashCode(name) << 8n) | BigInt(spriteIndex);

        if (this.imageCache) {
            const image: Pix32 | null = this.imageCache.get(uid) as Pix32 | null;
            if (image) {
                return image;
            }
        }

        try {
            const image = Pix32.fromArchive(media, name, spriteIndex);
            this.imageCache?.put(uid, image);
            return image;
        } catch (e) {
            return null;
        }
    }
}
