import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

export default class IfType {
    static TYPE_LAYER: number = 0;
    static TYPE_UNUSED: number = 1;
    static TYPE_INVENTORY: number = 2;
    static TYPE_RECT: number = 3;
    static TYPE_TEXT: number = 4;
    static TYPE_SPRITE: number = 5;
    static TYPE_MODEL: number = 6;
    static TYPE_INVENTORY_TEXT: number = 7;

    static NO_BUTTON: number = 0;
    static BUTTON: number = 1;
    static TARGET_BUTTON: number = 2;
    static CLOSE_BUTTON: number = 3;
    static TOGGLE_BUTTON: number = 4;
    static SELECT_BUTTON: number = 5;
    static PAUSE_BUTTON: number = 6;

    private static componentNames: Map<string, number> = new Map();
    private static components: IfType[] = [];

    static load(dir: string): void {
        this.componentNames = new Map();
        this.components = [];

        if (!fs.existsSync(`${dir}/interface.dat`)) {
            console.log('Warning: No interface.dat found.');
            return;
        }

        const dat = Packet.load(`${dir}/interface.dat`);
        dat.g2(); // count

        let rootLayer = -1;
        while (dat.available > 0) {
            let id = dat.g2();
            if (id === 65535) {
                rootLayer = dat.g2();
                id = dat.g2();
            }

            const com = new IfType();
            com.id = id;
            com.rootLayer = rootLayer;

            com.comName = dat.gjstr();
            com.overlay = dat.gbool();

            com.type = dat.g1();
            com.buttonType = dat.g1();
            com.clientCode = dat.g2();
            com.width = dat.g2();
            com.height = dat.g2();

            com.overLayer = dat.g1();
            if (com.overLayer == 0) {
                com.overLayer = -1;
            } else {
                com.overLayer = ((com.overLayer - 1) << 8) + dat.g1();
            }

            const comparatorCount = dat.g1();
            if (comparatorCount > 0) {
                com.scriptComparator = new Uint8Array(comparatorCount).fill(0);
                com.scriptOperand = new Uint16Array(comparatorCount).fill(0);

                for (let i = 0; i < comparatorCount; i++) {
                    com.scriptComparator[i] = dat.g1();
                    com.scriptOperand[i] = dat.g2();
                }
            }

            const scriptCount = dat.g1();
            if (scriptCount > 0) {
                com.scripts = new Array(scriptCount).fill(null);

                for (let i = 0; i < scriptCount; i++) {
                    const opcodeCount = dat.g2();

                    com.scripts[i] = new Uint16Array(opcodeCount).fill(0);
                    for (let j = 0; j < opcodeCount; j++) {
                        com.scripts[i][j] = dat.g2();
                    }
                }
            }

            switch (com.type) {
                case IfType.TYPE_LAYER: {
                    com.scroll = dat.g2();
                    com.hide = dat.gbool();

                    const childCount = dat.g1();
                    com.childId = new Uint16Array(childCount).fill(0);
                    com.childX = new Uint16Array(childCount).fill(0);
                    com.childY = new Uint16Array(childCount).fill(0);

                    for (let i = 0; i < childCount; i++) {
                        com.childId[i] = dat.g2();
                        com.childX[i] = dat.g2s();
                        com.childY[i] = dat.g2s();
                    }
                    break;
                }
                case IfType.TYPE_UNUSED:
                    // The client has this impl for 10 bytes.
                    // Seems unused though.
                    dat.pos += 10;
                    break;
                case IfType.TYPE_INVENTORY: {
                    com.draggable = dat.gbool();
                    com.interactable = dat.gbool();
                    com.usable = dat.gbool();
                    com.marginX = dat.g1();
                    com.marginY = dat.g1();

                    com.inventorySlotOffsetX = new Uint16Array(20).fill(0);
                    com.inventorySlotOffsetY = new Uint16Array(20).fill(0);
                    com.inventorySlotGraphic = new Array(20).fill(null);

                    for (let i = 0; i < 20; i++) {
                        if (dat.gbool()) {
                            com.inventorySlotOffsetX[i] = dat.g2s();
                            com.inventorySlotOffsetY[i] = dat.g2s();
                            com.inventorySlotGraphic[i] = dat.gjstr();
                        }
                    }

                    com.inventoryOptions = new Array(5).fill(null);
                    for (let i = 0; i < 5; i++) {
                        com.inventoryOptions[i] = dat.gjstr();
                    }

                    com.actionVerb = dat.gjstr();
                    com.action = dat.gjstr();
                    com.actionTarget = dat.g2();
                    break;
                }
                case IfType.TYPE_RECT:
                    com.fill = dat.gbool();
                    com.colour = dat.g4();
                    com.activeColour = dat.g4();
                    com.overColour = dat.g4();
                    break;
                case IfType.TYPE_TEXT:
                    com.center = dat.gbool();
                    com.font = dat.g1();
                    com.shadowed = dat.gbool();
                    com.text = dat.gjstr();
                    com.activeText = dat.gjstr();
                    com.colour = dat.g4();
                    com.activeColour = dat.g4();
                    com.overColour = dat.g4();
                    break;
                case IfType.TYPE_SPRITE:
                    com.graphic = dat.gjstr();
                    com.activeGraphic = dat.gjstr();
                    break;
                case IfType.TYPE_MODEL: {
                    com.model = dat.g1();
                    if (com.model != 0) {
                        com.model = ((com.model - 1) << 8) + dat.g1();
                    }

                    com.activeModel = dat.g1();
                    if (com.activeModel != 0) {
                        com.activeModel = ((com.activeModel - 1) << 8) + dat.g1();
                    }

                    com.anim = dat.g1();
                    if (com.anim == 0) {
                        com.anim = -1;
                    } else {
                        com.anim = ((com.anim - 1) << 8) + dat.g1();
                    }

                    com.activeAnim = dat.g1();
                    if (com.activeAnim == 0) {
                        com.activeAnim = -1;
                    } else {
                        com.activeAnim = ((com.activeAnim - 1) << 8) + dat.g1();
                    }

                    com.zoom = dat.g2();
                    com.xan = dat.g2();
                    com.yan = dat.g2();
                    break;
                }
                case IfType.TYPE_INVENTORY_TEXT: {
                    com.center = dat.gbool();
                    com.font = dat.g1();
                    com.shadowed = dat.gbool();
                    com.colour = dat.g4();
                    com.marginX = dat.g2s();
                    com.marginY = dat.g2s();
                    com.interactable = dat.gbool();
                    com.inventoryOptions = new Array(5).fill(null);
                    for (let i = 0; i < 5; i++) {
                        com.inventoryOptions[i] = dat.gjstr();
                    }
                    break;
                }
            }

            switch (com.buttonType) {
                case IfType.NO_BUTTON:
                    break;
                case IfType.TARGET_BUTTON:
                    com.actionVerb = dat.gjstr();
                    com.action = dat.gjstr();
                    com.actionTarget = dat.g2();
                    break;
                case IfType.BUTTON:
                case IfType.TOGGLE_BUTTON:
                case IfType.SELECT_BUTTON:
                case IfType.PAUSE_BUTTON:
                    com.option = dat.gjstr();
                    break;
            }

            IfType.components[id] = com;

            if (com.comName) {
                IfType.componentNames.set(com.comName, id);
            }
        }
    }

    static get(id: number): IfType {
        return IfType.components[id];
    }

    static getId(name: string): number {
        return IfType.componentNames.get(name) ?? -1;
    }

    static getByName(name: string): IfType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }

    // ----
    id: number = -1;
    rootLayer: number = -1;
    comName: string | null = null;
    overlay: boolean = false;
    type: number = -1;
    buttonType: number = -1;
    clientCode: number = 0;
    width: number = 0;
    height: number = 0;
    overLayer: number = -1;
    scriptComparator: Uint8Array | null = null;
    scriptOperand: Uint16Array | null = null;
    scripts: Array<Uint16Array> | null = null;
    scroll: number = 0;
    hide = false;
    draggable = false;
    interactable = false;
    usable = false;
    marginX: number = 0;
    marginY: number = 0;
    inventorySlotOffsetX: Uint16Array | null = null;
    inventorySlotOffsetY: Uint16Array | null = null;
    inventorySlotGraphic: Array<string> | null = null;
    inventoryOptions: Array<string | null> | null = null;
    fill = false;
    center = false;
    font: number = 0;
    shadowed = false;
    text: string | null = null;
    activeText: string | null = null;
    colour: number = 0;
    activeColour: number = 0;
    overColour: number = 0;
    graphic: string | null = null;
    activeGraphic: string | null = null;
    model: number = -1;
    activeModel: number = -1;
    anim: number = -1;
    activeAnim: number = -1;
    zoom: number = 0;
    xan: number = 0;
    yan: number = 0;
    actionVerb: string | null = null;
    action: string | null = null;
    actionTarget: number = -1;
    option: string | null = null;
    childId: Uint16Array | null = null;
    childX: Uint16Array | null = null;
    childY: Uint16Array | null = null;
}
