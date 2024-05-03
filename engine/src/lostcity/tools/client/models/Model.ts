import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';

class Metadata {
    vertexCount = 0;
    faceCount = 0;
    texturedFaceCount = 0;
    vertexFlagsOffset = 0;
    vertexXOffset = 0;
    vertexYOffset = 0;
    vertexZOffset = 0;
    vertexLabelsOffset = 0;
    faceVerticesOffset = 0;
    faceOrientationsOffset = 0;
    faceColorsOffset = 0;
    faceInfosOffset = 0;
    facePrioritiesOffset = 0;
    faceAlphasOffset = 0;
    faceLabelsOffset = 0;
    faceTextureAxisOffset = 0;
    hasInfo = 0;
    hasPriorities = 0;
    hasAlpha = 0;
    hasFaceLabels = 0;
    hasVertexLabels = 0;
}

export default class Model {
    static order: number[] = [];
    static metadata: Metadata[] = [];

    static head: Packet;
    static face1: Packet;
    static face2: Packet;
    static face3: Packet;
    static face4: Packet;
    static face5: Packet;
    static point1: Packet;
    static point2: Packet;
    static point3: Packet;
    static point4: Packet;
    static point5: Packet;
    static vertex1: Packet;
    static vertex2: Packet;
    static axis: Packet;

    id!: number;
    meta!: Metadata;
    vertexCount!: number;
    faceCount!: number;
    texturedFaceCount!: number;
    vertexX!: number[];
    vertexY!: number[];
    vertexZ!: number[];
    faceVertexA!: number[];
    faceVertexB!: number[];
    faceVertexC!: number[];
    texturedVertexA!: number[];
    texturedVertexB!: number[];
    texturedVertexC!: number[];
    vertexLabel!: number[];
    faceInfo!: number[];
    facePriority!: number[];
    priority!: number;
    faceAlpha!: number[];
    faceLabel!: number[];
    faceColor!: number[];
    rawVertexFlags!: Uint8Array;
    rawVertexX!: Uint8Array;
    rawVertexY!: Uint8Array;
    rawVertexZ!: Uint8Array;
    rawVertexLabel!: Uint8Array;
    rawFaceColor!: Uint8Array;
    rawFaceInfo!: Uint8Array;
    rawFacePriority!: Uint8Array;
    rawFaceAlpha!: Uint8Array;
    rawFaceLabel!: Uint8Array;
    rawFaceVertex!: Uint8Array;
    rawFaceOrientation!: Uint8Array;
    rawTexturedVertex!: Uint8Array;

    static unpack(models: Jagfile) {
        const head = models.read('ob_head.dat');
        const face1 = models.read('ob_face1.dat');
        const face2 = models.read('ob_face2.dat');
        const face3 = models.read('ob_face3.dat');
        const face4 = models.read('ob_face4.dat');
        const face5 = models.read('ob_face5.dat');
        const point1 = models.read('ob_point1.dat');
        const point2 = models.read('ob_point2.dat');
        const point3 = models.read('ob_point3.dat');
        const point4 = models.read('ob_point4.dat');
        const point5 = models.read('ob_point5.dat');
        const vertex1 = models.read('ob_vertex1.dat');
        const vertex2 = models.read('ob_vertex2.dat');
        const axis = models.read('ob_axis.dat');

        let faceTextureAxisOffset = 0;
        let vertexLabelsOffset = 0;
        let faceColorsOffset = 0;
        let faceInfosOffset = 0;
        let facePrioritiesOffset = 0;
        let faceAlphasOffset = 0;
        let faceLabelsOffset = 0;

        if (!head) {
            throw new Error('missing ob_head.dat');
        }

        if (!face1) {
            throw new Error('missing ob_face1.dat');
        }

        if (!face2) {
            throw new Error('missing ob_face2.dat');
        }

        if (!face3) {
            throw new Error('missing ob_face3.dat');
        }

        if (!face4) {
            throw new Error('missing ob_face4.dat');
        }

        if (!face5) {
            throw new Error('missing ob_face5.dat');
        }

        if (!point1) {
            throw new Error('missing ob_point1.dat');
        }

        if (!point2) {
            throw new Error('missing ob_point2.dat');
        }

        if (!point3) {
            throw new Error('missing ob_point3.dat');
        }

        if (!point4) {
            throw new Error('missing ob_point4.dat');
        }

        if (!point5) {
            throw new Error('missing ob_point5.dat');
        }

        if (!vertex1) {
            throw new Error('missing ob_vertex1.dat');
        }

        if (!vertex2) {
            throw new Error('missing ob_vertex2.dat');
        }

        if (!axis) {
            throw new Error('missing ob_axis.dat');
        }

        const total = head.g2();
        for (let i = 0; i < total; i++) {
            const id = head.g2();
            Model.order.push(id);

            const meta = new Metadata();
            meta.vertexCount = head.g2();
            meta.faceCount = head.g2();
            meta.texturedFaceCount = head.g1();

            meta.vertexFlagsOffset = point1.pos;
            meta.vertexXOffset = point2.pos;
            meta.vertexYOffset = point3.pos;
            meta.vertexZOffset = point4.pos;
            meta.faceVerticesOffset = vertex1.pos;
            meta.faceOrientationsOffset = vertex2.pos;

            const hasInfo = head.g1();
            const hasPriorities = head.g1();
            const hasAlpha = head.g1();
            const hasFaceLabels = head.g1();
            const hasVertexLabels = head.g1();
            meta.hasInfo = hasInfo;
            meta.hasPriorities = hasPriorities;
            meta.hasAlpha = hasAlpha;
            meta.hasFaceLabels = hasFaceLabels;
            meta.hasVertexLabels = hasVertexLabels;

            for (let v = 0; v < meta.vertexCount; v++) {
                const flags = point1.g1();

                if ((flags & 0x1) != 0) {
                    point2.gsmarts();
                }

                if ((flags & 0x2) != 0) {
                    point3.gsmarts();
                }

                if ((flags & 0x4) != 0) {
                    point4.gsmarts();
                }
            }

            for (let f = 0; f < meta.faceCount; f++) {
                const type = vertex2.g1();

                if (type === 1) {
                    vertex1.gsmarts();
                    vertex1.gsmarts();
                }

                vertex1.gsmarts();
            }

            meta.faceColorsOffset = faceColorsOffset;
            faceColorsOffset += meta.faceCount * 2;

            if (hasInfo == 1) {
                meta.faceInfosOffset = faceInfosOffset;
                faceInfosOffset += meta.faceCount;
            }

            if (hasPriorities == 255) {
                meta.facePrioritiesOffset = facePrioritiesOffset;
                facePrioritiesOffset += meta.faceCount;
            } else {
                meta.facePrioritiesOffset = -hasPriorities - 1;
            }

            if (hasAlpha == 1) {
                meta.faceAlphasOffset = faceAlphasOffset;
                faceAlphasOffset += meta.faceCount;
            }

            if (hasFaceLabels == 1) {
                meta.faceLabelsOffset = faceLabelsOffset;
                faceLabelsOffset += meta.faceCount;
            }

            if (hasVertexLabels == 1) {
                meta.vertexLabelsOffset = vertexLabelsOffset;
                vertexLabelsOffset += meta.vertexCount;
            }

            meta.faceTextureAxisOffset = faceTextureAxisOffset;
            faceTextureAxisOffset += meta.texturedFaceCount;

            Model.metadata[id] = meta;
        }

        Model.head = head;
        Model.face1 = face1;
        Model.face2 = face2;
        Model.face3 = face3;
        Model.face4 = face4;
        Model.face5 = face5;
        Model.point1 = point1;
        Model.point2 = point2;
        Model.point3 = point3;
        Model.point4 = point4;
        Model.point5 = point5;
        Model.vertex1 = vertex1;
        Model.vertex2 = vertex2;
        Model.axis = axis;
    }

    static get(id: number) {
        const meta = Model.metadata[id];
        if (!meta) {
            return null;
        }

        const model = new Model();
        model.id = id;
        model.meta = meta;
        model.vertexCount = meta.vertexCount;
        model.faceCount = meta.faceCount;
        model.texturedFaceCount = meta.texturedFaceCount;
        model.vertexX = [];
        model.vertexY = [];
        model.vertexZ = [];
        model.faceVertexA = [];
        model.faceVertexB = [];
        model.faceVertexC = [];
        model.texturedVertexA = [];
        model.texturedVertexB = [];
        model.texturedVertexC = [];

        if (meta.vertexLabelsOffset >= 0) {
            model.vertexLabel = [];
        }

        if (meta.faceInfosOffset >= 0) {
            model.faceInfo = [];
        }

        if (meta.facePrioritiesOffset >= 0) {
            model.facePriority = [];
        } else {
            model.priority = -meta.facePrioritiesOffset - 1;
        }

        if (meta.faceAlphasOffset >= 0) {
            model.faceAlpha = [];
        }

        if (meta.faceLabelsOffset >= 0) {
            model.faceLabel = [];
        }

        model.faceColor = [];

        Model.point1.pos = meta.vertexFlagsOffset;
        Model.point2.pos = meta.vertexXOffset;
        Model.point3.pos = meta.vertexYOffset;
        Model.point4.pos = meta.vertexZOffset;
        Model.vertex1.pos = meta.faceVerticesOffset;

        let x = 0;
        let y = 0;
        let z = 0;

        const startX = Model.point2.pos;
        const startY = Model.point3.pos;
        const startZ = Model.point4.pos;
        for (let v = 0; v < meta.vertexCount; v++) {
            const flags = Model.point1.g1();
            let x0 = 0;
            let y0 = 0;
            let z0 = 0;

            if ((flags & 0x1) != 0) {
                x0 = Model.point2.gsmarts();
            }

            if ((flags & 0x2) != 0) {
                y0 = Model.point3.gsmarts();
            }

            if ((flags & 0x4) != 0) {
                z0 = Model.point4.gsmarts();
            }

            model.vertexX[v] = x + x0;
            model.vertexY[v] = y + y0;
            model.vertexZ[v] = z + z0;

            x = model.vertexX[v];
            y = model.vertexY[v];
            z = model.vertexZ[v];

            if (model.vertexLabel) {
                model.vertexLabel[v] = Model.point5.g1();
            }
        }
        const endX = Model.point2.pos;
        const endY = Model.point3.pos;
        const endZ = Model.point4.pos;

        const p_vertexCount = new Uint8Array(meta.vertexCount);
        Model.point1.pos = meta.vertexFlagsOffset;
        Model.point1.gdata(p_vertexCount, 0, p_vertexCount.length);
        model.rawVertexFlags = p_vertexCount;

        const p_rawVertexX = new Uint8Array(endX - startX);
        Model.point2.pos = startX;
        Model.point2.gdata(p_rawVertexX, 0, p_rawVertexX.length);
        model.rawVertexX = p_rawVertexX;

        const p_rawVertexY = new Uint8Array(endY - startY);
        Model.point3.pos = startY;
        Model.point3.gdata(p_rawVertexY, 0, p_rawVertexY.length);
        model.rawVertexY = p_rawVertexY;

        const p_rawVertexZ = new Uint8Array(endZ - startZ);
        Model.point4.pos = startZ;
        Model.point4.gdata(p_rawVertexZ, 0, p_rawVertexZ.length);
        model.rawVertexZ = p_rawVertexZ;

        if (model.vertexLabel) {
            const p_rawVertexLabel = new Uint8Array(meta.vertexCount);
            Model.point5.pos = meta.vertexLabelsOffset;
            Model.point5.gdata(p_rawVertexLabel, 0, p_rawVertexLabel.length);
            model.rawVertexLabel = p_rawVertexLabel;
        }

        Model.face1.pos = meta.faceColorsOffset;
        Model.face2.pos = meta.faceInfosOffset;
        Model.face3.pos = meta.facePrioritiesOffset;
        Model.face4.pos = meta.faceAlphasOffset;
        Model.face5.pos = meta.faceLabelsOffset;

        for (let f = 0; f < meta.faceCount; f++) {
            model.faceColor[f] = Model.face1.g2();

            if (model.faceInfo) {
                model.faceInfo[f] = Model.face2.g1();
            }

            if (model.facePriority) {
                model.facePriority[f] = Model.face3.g1();
            }

            if (model.faceAlpha) {
                model.faceAlpha[f] = Model.face4.g1();
            }

            if (model.faceLabel) {
                model.faceLabel[f] = Model.face5.g1();
            }
        }
        const p_rawFaceColor = new Uint8Array(meta.faceCount * 2);
        Model.face1.pos = meta.faceColorsOffset;
        Model.face1.gdata(p_rawFaceColor, 0, p_rawFaceColor.length);
        model.rawFaceColor = p_rawFaceColor;

        if (meta.hasInfo == 1) {
            const p_rawFaceInfo = new Uint8Array(meta.faceCount);
            Model.face2.pos = meta.faceInfosOffset;
            Model.face2.gdata(p_rawFaceInfo, 0, p_rawFaceInfo.length);
            model.rawFaceInfo = p_rawFaceInfo;
        }

        if (meta.hasPriorities == 255) {
            const p_rawFacePriority = new Uint8Array(meta.faceCount);
            Model.face3.pos = meta.facePrioritiesOffset;
            Model.face3.gdata(p_rawFacePriority, 0, p_rawFacePriority.length);
            model.rawFacePriority = p_rawFacePriority;
        }

        if (meta.hasAlpha == 1) {
            const p_rawFaceAlpha = new Uint8Array(meta.faceCount);
            Model.face4.pos = meta.faceAlphasOffset;
            Model.face4.gdata(p_rawFaceAlpha, 0, p_rawFaceAlpha.length);
            model.rawFaceAlpha = p_rawFaceAlpha;
        }

        if (meta.hasFaceLabels == 1) {
            const p_rawFaceLabel = new Uint8Array(meta.faceCount);
            Model.face5.pos = meta.faceLabelsOffset;
            Model.face5.gdata(p_rawFaceLabel, 0, p_rawFaceLabel.length);
            model.rawFaceLabel = p_rawFaceLabel;
        }

        Model.vertex1.pos = meta.faceVerticesOffset;
        Model.vertex2.pos = meta.faceOrientationsOffset;

        let a = 0;
        let b = 0;
        let c = 0;
        let last = 0;

        const startFaceVertices = Model.vertex1.pos;
        const startFaceOrientations = Model.vertex2.pos;
        for (let f = 0; f < meta.faceCount; f++) {
            const type = Model.vertex2.g1();

            if (type === 1) {
                a = Model.vertex1.gsmarts() + last;
                last = a;

                b = Model.vertex1.gsmarts() + last;
                last = b;
            } else if (type === 2) {
                b = c;
            } else if (type === 3) {
                a = c;
            } else if (type === 4) {
                const b0 = a;
                a = b;
                b = b0;
            }

            c = Model.vertex1.gsmarts() + last;
            last = c;

            model.faceVertexA[f] = a;
            model.faceVertexB[f] = b;
            model.faceVertexC[f] = c;
        }
        const endFaceVertices = Model.vertex1.pos;
        const endFaceOrientations = Model.vertex2.pos;

        const p_rawFaceVertex = new Uint8Array(endFaceVertices - startFaceVertices);
        Model.vertex1.pos = startFaceVertices;
        Model.vertex1.gdata(p_rawFaceVertex, 0, p_rawFaceVertex.length);
        model.rawFaceVertex = p_rawFaceVertex;

        const p_rawFaceOrientation = new Uint8Array(endFaceOrientations - startFaceOrientations);
        Model.vertex2.pos = startFaceOrientations;
        Model.vertex2.gdata(p_rawFaceOrientation, 0, p_rawFaceOrientation.length);
        model.rawFaceOrientation = p_rawFaceOrientation;

        Model.axis.pos = meta.faceTextureAxisOffset * 6;
        for (let t = 0; t < meta.texturedFaceCount; t++) {
            model.texturedVertexA[t] = Model.axis.g2();
            model.texturedVertexB[t] = Model.axis.g2();
            model.texturedVertexC[t] = Model.axis.g2();
        }

        const p_rawTexturedVertex = new Uint8Array(meta.texturedFaceCount * 6);
        Model.axis.pos = meta.faceTextureAxisOffset * 6;
        Model.axis.gdata(p_rawTexturedVertex, 0, p_rawTexturedVertex.length);
        model.rawTexturedVertex = p_rawTexturedVertex;

        return model;
    }

    // using 234+ format because it's suitable to be separate files and has tooling
    convert() {
        const data = Packet.alloc(0);

        data.pdata(this.rawVertexFlags, 0, this.rawVertexFlags.length);
        data.pdata(this.rawFaceOrientation, 0, this.rawFaceOrientation.length);

        if (this.meta.hasPriorities == 255) {
            data.pdata(this.rawFacePriority, 0, this.rawFacePriority.length);
        }

        if (this.meta.hasFaceLabels == 1) {
            data.pdata(this.rawFaceLabel, 0, this.rawFaceLabel.length);
        }

        if (this.meta.hasInfo == 1) {
            data.pdata(this.rawFaceInfo, 0, this.rawFaceInfo.length);
        }

        if (this.meta.hasVertexLabels == 1) {
            data.pdata(this.rawVertexLabel, 0, this.rawVertexLabel.length);
        }

        if (this.meta.hasAlpha == 1) {
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
        data.p1(this.meta.hasPriorities);
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
