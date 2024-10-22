import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';

class Metadata {
    vertexCount: number = 0;
    faceCount: number = 0;
    texturedFaceCount: number = 0;

    vertexFlagsOffset: number = -1;
    vertexXOffset: number = -1;
    vertexYOffset: number = -1;
    vertexZOffset: number = -1;
    vertexLabelsOffset: number = -1;
    faceVerticesOffset: number = -1;
    faceOrientationsOffset: number = -1;
    faceColorsOffset: number = -1;
    faceInfosOffset: number = -1;
    facePrioritiesOffset: number = 0;
    faceAlphasOffset: number = -1;
    faceLabelsOffset: number = -1;
    faceTextureAxisOffset: number = -1;

    data: Uint8Array | null = null;

    hasInfo: number = 0;
    priority: number = 0;
    hasAlpha: number = 0;
    hasFaceLabels: number = 0;
    hasVertexLabels: number = 0;
}

type ModelType = {
    vertexCount: number;
    vertexX: Int32Array;
    vertexY: Int32Array;
    vertexZ: Int32Array;
    faceCount: number;
    faceVertexA: Int32Array;
    faceVertexB: Int32Array;
    faceVertexC: Int32Array;
    faceColorA: Int32Array | null;
    faceColorB: Int32Array | null;
    faceColorC: Int32Array | null;
    faceInfo: Int32Array | null;
    facePriority: Int32Array | null;
    faceAlpha: Int32Array | null;
    faceColor: Int32Array | null;
    priority: number;
    texturedFaceCount: number;
    texturedVertexA: Int32Array;
    texturedVertexB: Int32Array;
    texturedVertexC: Int32Array;
    vertexLabel?: Int32Array | null;
    faceLabel?: Int32Array | null;
};

export default class Model {
    static order: number[] = [];
    static metadata: (Metadata | null)[] | null = null;

    static head: Packet | null = null;
    static face1: Packet | null = null;
    static face2: Packet | null = null;
    static face3: Packet | null = null;
    static face4: Packet | null = null;
    static face5: Packet | null = null;
    static point1: Packet | null = null;
    static point2: Packet | null = null;
    static point3: Packet | null = null;
    static point4: Packet | null = null;
    static point5: Packet | null = null;
    static vertex1: Packet | null = null;
    static vertex2: Packet | null = null;
    static axis: Packet | null = null;

    static unpack(models: Jagfile) {
        try {
            Model.head = models.read('ob_head.dat')!;
            Model.face1 = models.read('ob_face1.dat')!;
            Model.face2 = models.read('ob_face2.dat')!;
            Model.face3 = models.read('ob_face3.dat')!;
            Model.face4 = models.read('ob_face4.dat')!;
            Model.face5 = models.read('ob_face5.dat')!;
            Model.point1 = models.read('ob_point1.dat')!;
            Model.point2 = models.read('ob_point2.dat')!;
            Model.point3 = models.read('ob_point3.dat')!;
            Model.point4 = models.read('ob_point4.dat')!;
            Model.point5 = models.read('ob_point5.dat')!;
            Model.vertex1 = models.read('ob_vertex1.dat')!;
            Model.vertex2 = models.read('ob_vertex2.dat')!;
            Model.axis = models.read('ob_axis.dat')!;

            Model.head.pos = 0;
            Model.point1.pos = 0;
            Model.point2.pos = 0;
            Model.point3.pos = 0;
            Model.point4.pos = 0;
            Model.vertex1.pos = 0;
            Model.vertex2.pos = 0;

            const count: number = Model.head.g2();
            Model.metadata = new Array(count + 100).fill(null);

            let vertexTextureDataOffset: number = 0;
            let labelDataOffset: number = 0;
            let triangleColorDataOffset: number = 0;
            let triangleInfoDataOffset: number = 0;
            let trianglePriorityDataOffset: number = 0;
            let triangleAlphaDataOffset: number = 0;
            let triangleSkinDataOffset: number = 0;

            for (let i: number = 0; i < count; i++) {
                const id: number = Model.head.g2();
                const meta: Metadata = new Metadata();
                Model.order.push(id);

                meta.vertexCount = Model.head.g2();
                meta.faceCount = Model.head.g2();
                meta.texturedFaceCount = Model.head.g1();

                meta.vertexFlagsOffset = Model.point1.pos;
                meta.vertexXOffset = Model.point2.pos;
                meta.vertexYOffset = Model.point3.pos;
                meta.vertexZOffset = Model.point4.pos;
                meta.faceVerticesOffset = Model.vertex1.pos;
                meta.faceOrientationsOffset = Model.vertex2.pos;

                const hasInfo: number = Model.head.g1();
                const priority: number = Model.head.g1();
                const hasAlpha: number = Model.head.g1();
                const hasSkins: number = Model.head.g1();
                const hasLabels: number = Model.head.g1();

                meta.hasInfo = hasInfo;
                meta.priority = priority;
                meta.hasAlpha = hasAlpha;
                meta.hasFaceLabels = hasSkins;
                meta.hasVertexLabels = hasLabels;

                for (let v: number = 0; v < meta.vertexCount; v++) {
                    const flags: number = Model.point1.g1();

                    if ((flags & 0x1) !== 0) {
                        Model.point2.gsmart();
                    }

                    if ((flags & 0x2) !== 0) {
                        Model.point3.gsmart();
                    }

                    if ((flags & 0x4) !== 0) {
                        Model.point4.gsmart();
                    }
                }

                for (let v: number = 0; v < meta.faceCount; v++) {
                    const type: number = Model.vertex2.g1();

                    if (type === 1) {
                        Model.vertex1.gsmart();
                        Model.vertex1.gsmart();
                    }

                    Model.vertex1.gsmart();
                }

                meta.faceColorsOffset = triangleColorDataOffset;
                triangleColorDataOffset += meta.faceCount * 2;

                if (hasInfo === 1) {
                    meta.faceInfosOffset = triangleInfoDataOffset;
                    triangleInfoDataOffset += meta.faceCount;
                }

                if (priority === 255) {
                    meta.facePrioritiesOffset = trianglePriorityDataOffset;
                    trianglePriorityDataOffset += meta.faceCount;
                } else {
                    meta.facePrioritiesOffset = -priority - 1;
                }

                if (hasAlpha === 1) {
                    meta.faceAlphasOffset = triangleAlphaDataOffset;
                    triangleAlphaDataOffset += meta.faceCount;
                }

                if (hasSkins === 1) {
                    meta.faceLabelsOffset = triangleSkinDataOffset;
                    triangleSkinDataOffset += meta.faceCount;
                }

                if (hasLabels === 1) {
                    meta.vertexLabelsOffset = labelDataOffset;
                    labelDataOffset += meta.vertexCount;
                }

                meta.faceTextureAxisOffset = vertexTextureDataOffset;
                vertexTextureDataOffset += meta.texturedFaceCount;

                Model.metadata[id] = meta;
            }
        } catch (err) {
            console.log('Error loading model index');
            console.error(err);
        }
    }

    static get(id: number): Model {
        if (!Model.metadata) {
            throw new Error('Error model:' + id + ' not found!');
        }

        const meta: Metadata | null = Model.metadata[id];
        if (!meta) {
            throw new Error('Error model:' + id + ' not found!');
        }

        if (!Model.head || !Model.face1 || !Model.face2 || !Model.face3 || !Model.face4 || !Model.face5 || !Model.point1 || !Model.point2 || !Model.point3 || !Model.point4 || !Model.point5 || !Model.vertex1 || !Model.vertex2 || !Model.axis) {
            throw new Error('Error model:' + id + ' not found!');
        }

        const vertexCount: number = meta.vertexCount;
        const faceCount: number = meta.faceCount;
        const texturedFaceCount: number = meta.texturedFaceCount;

        const vertexX: Int32Array = new Int32Array(vertexCount);
        const vertexY: Int32Array = new Int32Array(vertexCount);
        const vertexZ: Int32Array = new Int32Array(vertexCount);

        const faceVertexA: Int32Array = new Int32Array(faceCount);
        const faceVertexB: Int32Array = new Int32Array(faceCount);
        const faceVertexC: Int32Array = new Int32Array(faceCount);

        const texturedVertexA: Int32Array = new Int32Array(texturedFaceCount);
        const texturedVertexB: Int32Array = new Int32Array(texturedFaceCount);
        const texturedVertexC: Int32Array = new Int32Array(texturedFaceCount);

        let vertexLabel: Int32Array | null = null;
        if (meta.vertexLabelsOffset >= 0) {
            vertexLabel = new Int32Array(vertexCount);
        }

        let faceInfo: Int32Array | null = null;
        if (meta.faceInfosOffset >= 0) {
            faceInfo = new Int32Array(faceCount);
        }

        let facePriority: Int32Array | null = null;
        let priority: number = 0;
        if (meta.facePrioritiesOffset >= 0) {
            facePriority = new Int32Array(faceCount);
        } else {
            priority = -meta.facePrioritiesOffset - 1;
        }

        let faceAlpha: Int32Array | null = null;
        if (meta.faceAlphasOffset >= 0) {
            faceAlpha = new Int32Array(faceCount);
        }

        let faceLabel: Int32Array | null = null;
        if (meta.faceLabelsOffset >= 0) {
            faceLabel = new Int32Array(faceCount);
        }

        const faceColor: Int32Array = new Int32Array(faceCount);

        Model.point1.pos = meta.vertexFlagsOffset;
        Model.point2.pos = meta.vertexXOffset;
        Model.point3.pos = meta.vertexYOffset;
        Model.point4.pos = meta.vertexZOffset;
        Model.point5.pos = meta.vertexLabelsOffset;

        let dx: number = 0;
        let dy: number = 0;
        let dz: number = 0;
        let a: number;
        let b: number;
        let c: number;

        const startX = Model.point2.pos;
        const startY = Model.point3.pos;
        const startZ = Model.point4.pos;
        for (let v: number = 0; v < vertexCount; v++) {
            const flags: number = Model.point1.g1();

            a = 0;
            if ((flags & 0x1) !== 0) {
                a = Model.point2.gsmart();
            }

            b = 0;
            if ((flags & 0x2) !== 0) {
                b = Model.point3.gsmart();
            }

            c = 0;
            if ((flags & 0x4) !== 0) {
                c = Model.point4.gsmart();
            }

            vertexX[v] = dx + a;
            vertexY[v] = dy + b;
            vertexZ[v] = dz + c;
            dx = vertexX[v];
            dy = vertexY[v];
            dz = vertexZ[v];

            if (vertexLabel) {
                vertexLabel[v] = Model.point5.g1();
            }
        }
        const endX = Model.point2.pos;
        const endY = Model.point3.pos;
        const endZ = Model.point4.pos;

        const p_rawVertexFlags = new Uint8Array(meta.vertexCount);
        Model.point1.pos = meta.vertexFlagsOffset;
        Model.point1.gdata(p_rawVertexFlags, 0, p_rawVertexFlags.length);

        const p_rawVertexX = new Uint8Array(endX - startX);
        Model.point2.pos = startX;
        Model.point2.gdata(p_rawVertexX, 0, p_rawVertexX.length);

        const p_rawVertexY = new Uint8Array(endY - startY);
        Model.point3.pos = startY;
        Model.point3.gdata(p_rawVertexY, 0, p_rawVertexY.length);

        const p_rawVertexZ = new Uint8Array(endZ - startZ);
        Model.point4.pos = startZ;
        Model.point4.gdata(p_rawVertexZ, 0, p_rawVertexZ.length);

        const p_rawVertexLabel = new Uint8Array(meta.vertexCount);
        if (vertexLabel) {
            Model.point5.pos = meta.vertexLabelsOffset;
            Model.point5.gdata(p_rawVertexLabel, 0, p_rawVertexLabel.length);
        }

        Model.face1.pos = meta.faceColorsOffset;
        Model.face2.pos = meta.faceInfosOffset;
        Model.face3.pos = meta.facePrioritiesOffset;
        Model.face4.pos = meta.faceAlphasOffset;
        Model.face5.pos = meta.faceLabelsOffset;

        for (let f: number = 0; f < faceCount; f++) {
            faceColor[f] = Model.face1.g2();

            if (faceInfo) {
                faceInfo[f] = Model.face2.g1();
            }

            if (facePriority) {
                facePriority[f] = Model.face3.g1();
            }

            if (faceAlpha) {
                faceAlpha[f] = Model.face4.g1();
            }

            if (faceLabel) {
                faceLabel[f] = Model.face5.g1();
            }
        }

        const p_rawFaceColor = new Uint8Array(meta.faceCount * 2);
        Model.face1.pos = meta.faceColorsOffset;
        Model.face1.gdata(p_rawFaceColor, 0, p_rawFaceColor.length);

        let p_rawFaceInfo: Uint8Array | null = null;
        if (meta.hasInfo == 1) {
            p_rawFaceInfo = new Uint8Array(meta.faceCount);
            Model.face2.pos = meta.faceInfosOffset;
            Model.face2.gdata(p_rawFaceInfo, 0, p_rawFaceInfo.length);
        }

        let p_rawFacePriority: Uint8Array | null = null;
        if (meta.priority == 255) {
            p_rawFacePriority = new Uint8Array(meta.faceCount);
            Model.face3.pos = meta.facePrioritiesOffset;
            Model.face3.gdata(p_rawFacePriority, 0, p_rawFacePriority.length);
        }

        let p_rawFaceAlpha: Uint8Array | null = null;
        if (meta.hasAlpha == 1) {
            p_rawFaceAlpha = new Uint8Array(meta.faceCount);
            Model.face4.pos = meta.faceAlphasOffset;
            Model.face4.gdata(p_rawFaceAlpha, 0, p_rawFaceAlpha.length);
        }

        let p_rawFaceLabel: Uint8Array | null = null;
        if (meta.hasFaceLabels == 1) {
            p_rawFaceLabel = new Uint8Array(meta.faceCount);
            Model.face5.pos = meta.faceLabelsOffset;
            Model.face5.gdata(p_rawFaceLabel, 0, p_rawFaceLabel.length);
        }

        Model.vertex1.pos = meta.faceVerticesOffset;
        Model.vertex2.pos = meta.faceOrientationsOffset;

        a = 0;
        b = 0;
        c = 0;
        let last: number = 0;

        const startFaceVertices = Model.vertex1.pos;
        const startFaceOrientations = Model.vertex2.pos;
        for (let f: number = 0; f < faceCount; f++) {
            const orientation: number = Model.vertex2.g1();

            if (orientation === 1) {
                a = Model.vertex1.gsmart() + last;
                last = a;
                b = Model.vertex1.gsmart() + last;
                last = b;
                c = Model.vertex1.gsmart() + last;
                last = c;
            } else if (orientation === 2) {
                b = c;
                c = Model.vertex1.gsmart() + last;
                last = c;
            } else if (orientation === 3) {
                a = c;
                c = Model.vertex1.gsmart() + last;
                last = c;
            } else if (orientation === 4) {
                const tmp: number = a;
                a = b;
                b = tmp;
                c = Model.vertex1.gsmart() + last;
                last = c;
            }

            faceVertexA[f] = a;
            faceVertexB[f] = b;
            faceVertexC[f] = c;
        }
        const endFaceVertices = Model.vertex1.pos;
        const endFaceOrientations = Model.vertex2.pos;

        const p_rawFaceVertex = new Uint8Array(endFaceVertices - startFaceVertices);
        Model.vertex1.pos = startFaceVertices;
        Model.vertex1.gdata(p_rawFaceVertex, 0, p_rawFaceVertex.length);

        const p_rawFaceOrientation = new Uint8Array(endFaceOrientations - startFaceOrientations);
        Model.vertex2.pos = startFaceOrientations;
        Model.vertex2.gdata(p_rawFaceOrientation, 0, p_rawFaceOrientation.length);

        Model.axis.pos = meta.faceTextureAxisOffset * 6;
        for (let f: number = 0; f < texturedFaceCount; f++) {
            texturedVertexA[f] = Model.axis.g2();
            texturedVertexB[f] = Model.axis.g2();
            texturedVertexC[f] = Model.axis.g2();
        }

        const p_rawTexturedVertex = new Uint8Array(meta.texturedFaceCount * 6);
        Model.axis.pos = meta.faceTextureAxisOffset * 6;
        Model.axis.gdata(p_rawTexturedVertex, 0, p_rawTexturedVertex.length);

        return new Model({
            vertexCount: vertexCount,
            vertexX: vertexX,
            vertexY: vertexY,
            vertexZ: vertexZ,
            faceCount: faceCount,
            faceVertexA: faceVertexA,
            faceVertexB: faceVertexB,
            faceVertexC: faceVertexC,
            faceColorA: null,
            faceColorB: null,
            faceColorC: null,
            faceInfo: faceInfo,
            facePriority: facePriority,
            faceAlpha: faceAlpha,
            faceColor: faceColor,
            priority: priority,
            texturedFaceCount: texturedFaceCount,
            texturedVertexA: texturedVertexA,
            texturedVertexB: texturedVertexB,
            texturedVertexC: texturedVertexC,
            vertexLabel: vertexLabel,
            faceLabel: faceLabel
        }, id, meta,
        p_rawVertexFlags, p_rawVertexX, p_rawVertexY, p_rawVertexZ, p_rawVertexLabel,
        p_rawFaceColor, p_rawFaceInfo, p_rawFacePriority, p_rawFaceAlpha,
        p_rawFaceLabel, p_rawFaceVertex, p_rawFaceOrientation, p_rawTexturedVertex);
    }

    // ----

    id: number;
    meta: Metadata;

    vertexCount: number;
    vertexX: Int32Array;
    vertexY: Int32Array;
    vertexZ: Int32Array;

    faceCount: number;
    faceVertexA: Int32Array;
    faceVertexB: Int32Array;
    faceVertexC: Int32Array;
    faceColorA: Int32Array | null;
    faceColorB: Int32Array | null;
    faceColorC: Int32Array | null;
    faceInfo: Int32Array | null;
    facePriority: Int32Array | null;
    faceAlpha: Int32Array | null;
    faceColor: Int32Array | null;

    priority: number;

    texturedFaceCount: number;
    texturedVertexA: Int32Array;
    texturedVertexB: Int32Array;
    texturedVertexC: Int32Array;

    vertexLabel: Int32Array | null;
    faceLabel: Int32Array | null;

    rawVertexFlags: Uint8Array | null;
    rawVertexX: Uint8Array | null;
    rawVertexY: Uint8Array | null;
    rawVertexZ: Uint8Array | null;
    rawVertexLabel: Uint8Array | null;
    rawFaceColor: Uint8Array | null;
    rawFaceInfo: Uint8Array | null;
    rawFacePriority: Uint8Array | null;
    rawFaceAlpha: Uint8Array | null;
    rawFaceLabel: Uint8Array | null;
    rawFaceVertex: Uint8Array | null;
    rawFaceOrientation: Uint8Array | null;
    rawTexturedVertex: Uint8Array | null;

    constructor(type: ModelType,
        id: number, meta: Metadata,
        rawVertexFlags?: Uint8Array | null, rawVertexX?: Uint8Array | null, rawVertexY?: Uint8Array | null, rawVertexZ?: Uint8Array | null, rawVertexLabel?: Uint8Array | null,
        rawFaceColor?: Uint8Array | null, rawFaceInfo?: Uint8Array | null, rawFacePriority?: Uint8Array | null, rawFaceAlpha?: Uint8Array | null,
        rawFaceLabel?: Uint8Array | null, rawFaceVertex?: Uint8Array | null, rawFaceOrientation?: Uint8Array | null, rawTexturedVertex?: Uint8Array | null
    ) {
        this.vertexCount = type.vertexCount;
        this.vertexX = type.vertexX;
        this.vertexY = type.vertexY;
        this.vertexZ = type.vertexZ;
        this.faceCount = type.faceCount;
        this.faceVertexA = type.faceVertexA;
        this.faceVertexB = type.faceVertexB;
        this.faceVertexC = type.faceVertexC;
        this.faceColorA = type.faceColorA;
        this.faceColorB = type.faceColorB;
        this.faceColorC = type.faceColorC;
        this.faceInfo = type.faceInfo;
        this.facePriority = type.facePriority;
        this.faceAlpha = type.faceAlpha;
        this.faceColor = type.faceColor;
        this.priority = type.priority;
        this.texturedFaceCount = type.texturedFaceCount;
        this.texturedVertexA = type.texturedVertexA;
        this.texturedVertexB = type.texturedVertexB;
        this.texturedVertexC = type.texturedVertexC;
        this.vertexLabel = type.vertexLabel ?? null;
        this.faceLabel = type.faceLabel ?? null;
        this.id = id;
        this.meta = meta;

        this.rawVertexFlags = rawVertexFlags ?? null;
        this.rawVertexX = rawVertexX ?? null;
        this.rawVertexY = rawVertexY ?? null;
        this.rawVertexZ = rawVertexZ ?? null;
        this.rawVertexLabel = rawVertexLabel ?? null;
        this.rawFaceColor = rawFaceColor ?? null;
        this.rawFaceInfo = rawFaceInfo ?? null;
        this.rawFacePriority = rawFacePriority ?? null;
        this.rawFaceAlpha = rawFaceAlpha ?? null;
        this.rawFaceLabel = rawFaceLabel ?? null;
        this.rawFaceVertex = rawFaceVertex ?? null;
        this.rawFaceOrientation = rawFaceOrientation ?? null;
        this.rawTexturedVertex = rawTexturedVertex ?? null;
    }

    // using 234+ format because it's suitable to be separate files and has tooling
    convert() {
        if (!this.rawVertexFlags || !this.rawFaceOrientation || !this.rawFaceVertex || !this.rawFaceColor || !this.rawTexturedVertex || !this.rawVertexX || !this.rawVertexY || !this.rawVertexZ) {
            throw new Error('missing raw data for model:' + this.id);
        }

        const data = Packet.alloc(3);

        data.pdata(this.rawVertexFlags, 0, this.rawVertexFlags.length);
        data.pdata(this.rawFaceOrientation, 0, this.rawFaceOrientation.length);

        if (this.meta.priority == 255 && this.rawFacePriority) {
            data.pdata(this.rawFacePriority, 0, this.rawFacePriority.length);
        }

        if (this.meta.hasFaceLabels == 1 && this.rawFaceLabel) {
            data.pdata(this.rawFaceLabel, 0, this.rawFaceLabel.length);
        }

        if (this.meta.hasInfo == 1 && this.rawFaceInfo) {
            data.pdata(this.rawFaceInfo, 0, this.rawFaceInfo.length);
        }

        if (this.meta.hasVertexLabels == 1 && this.rawVertexLabel) {
            data.pdata(this.rawVertexLabel, 0, this.rawVertexLabel.length);
        }

        if (this.meta.hasAlpha == 1 && this.rawFaceAlpha) {
            data.pdata(this.rawFaceAlpha, 0, this.rawFaceAlpha.length);
        }

        data.pdata(this.rawFaceVertex, 0, this.rawFaceVertex.length);
        data.pdata(this.rawFaceColor, 0, this.rawFaceColor.length);
        data.pdata(this.rawTexturedVertex, 0, this.rawTexturedVertex.length);
        data.pdata(this.rawVertexX, 0, this.rawVertexX.length);
        data.pdata(this.rawVertexY, 0, this.rawVertexY.length);
        data.pdata(this.rawVertexZ, 0, this.rawVertexZ.length);

        // header:
        data.p2(this.meta.vertexCount);
        data.p2(this.meta.faceCount);
        data.p1(this.meta.texturedFaceCount);

        data.p1(this.meta.hasInfo);
        data.p1(this.meta.priority);
        data.p1(this.meta.hasAlpha);
        data.p1(this.meta.hasFaceLabels);
        data.p1(this.meta.hasVertexLabels);

        data.p2(this.rawVertexX.length);
        data.p2(this.rawVertexY.length);
        data.p2(this.rawVertexZ.length);
        data.p2(this.rawFaceVertex.length);

        return data;
    }
}
