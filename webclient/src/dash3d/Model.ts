import AnimBase from '#/dash3d/AnimBase.js';
import AnimFrame from '#/dash3d/AnimFrame.js';
import Pix2D from '#/graphics/Pix2D.js';
import Pix3D from '#/graphics/Pix3D.js';

import { Int32Array2d, TypedArray1d } from '#/util/Arrays.js';
import ModelSource from '#/dash3d/ModelSource.ts';
import VertexNormal from '#/dash3d/VertexNormal';
import Packet from '#/io/Packet.ts';
import type OnDemandProvider from '#/io/OnDemandProvider.ts';

class Metadata {
    data: Uint8Array | null = null;
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
    faceColoursOffset: number = -1;
    faceInfosOffset: number = -1;
    facePrioritiesOffset: number = 0;
    faceAlphasOffset: number = -1;
    faceLabelsOffset: number = -1;
    faceTextureAxisOffset: number = -1;
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
    priorityVal: number;
    texturedFaceCount: number;
    texturedVertexA: Int32Array;
    texturedVertexB: Int32Array;
    texturedVertexC: Int32Array;
    minX?: number;
    maxX?: number;
    minZ?: number;
    maxZ?: number;
    radius?: number;
    minY?: number;
    maxY?: number;
    maxDepth?: number;
    minDepth?: number;
    vertexLabel?: Int32Array | null;
    faceLabel?: Int32Array | null;
    labelVertices?: (Int32Array | null)[] | null;
    labelFaces?: (Int32Array | null)[] | null;
    vertexNormal?: (VertexNormal | null)[] | null;
    vertexNormalOriginal?: (VertexNormal | null)[] | null;
};

export default class Model extends ModelSource {
    static loaded: number = 0;
    static empty: Model = new Model();
    static tmpVertexX: Int32Array = new Int32Array(2000);
    static tmpVertexY: Int32Array = new Int32Array(2000);
    static tmpVertexZ: Int32Array = new Int32Array(2000);
    static tmpFaceAlpha: Int32Array = new Int32Array(2000);
    maxDepth: number = 0;
    minDepth: number = 0;
    objRaise: number = 0;
    vertexLabel: Int32Array | null = null;
    faceLabel: Int32Array | null = null;
    labelVertices: (Int32Array | null)[] | null = null;
    labelFaces: (Int32Array | null)[] | null = null;
    picking: boolean = false;
    vertexNormalOriginal: (VertexNormal | null)[] | null = null;
    static meta: (Metadata | null)[] | null = null;
    static provider: OnDemandProvider;
    static faceClippedX: boolean[] | null = new TypedArray1d(4096, false);
    static faceNearClipped: boolean[] | null = new TypedArray1d(4096, false);
    static vertexScreenX: Int32Array | null = new Int32Array(4096);
    static vertexScreenY: Int32Array | null = new Int32Array(4096);
    static vertexScreenZ: Int32Array | null = new Int32Array(4096);
    static vertexViewSpaceX: Int32Array | null = new Int32Array(4096);
    static vertexViewSpaceY: Int32Array | null = new Int32Array(4096);
    static vertexViewSpaceZ: Int32Array | null = new Int32Array(4096);
    static tmpDepthFaceCount: Int32Array | null = new Int32Array(1500);
    static tmpDepthFaces: Int32Array[] | null = new Int32Array2d(1500, 512);
    static tmpPriorityFaceCount: Int32Array | null = new Int32Array(12);
    static tmpPriorityFaces: Int32Array[] | null = new Int32Array2d(12, 2000);
    static tmpPriority10FaceDepth: Int32Array | null = new Int32Array(2000);
    static tmpPriority11FaceDepth: Int32Array | null = new Int32Array(2000);
    static tmpPriorityDepthSum: Int32Array | null = new Int32Array(12);
    vertexCount: number = 0;
    faceCount: number = 0;
    texturedFaceCount: number = 0;
    vertexX: Int32Array | null = null;
    vertexY: Int32Array | null = null;
    vertexZ: Int32Array | null = null;
    faceVertexA: Int32Array | null = null;
    faceVertexB: Int32Array | null = null;
    faceVertexC: Int32Array | null = null;
    texturedVertexA: Int32Array | null = null;
    texturedVertexB: Int32Array | null = null;
    texturedVertexC: Int32Array | null = null;
    faceInfo: Int32Array | null = null;
    facePriority: Int32Array | null = null;
    priority: number = 0;
    faceAlpha: Int32Array | null = null;
    faceColour: Int32Array | null = null;
    faceColourA: Int32Array | null = null;
    faceColourB: Int32Array | null = null;
    faceColourC: Int32Array | null = null;
    maxY: number = 0;
    radius: number = 0;
    minX: number = 0;
    maxX: number = 0;
    minZ: number = 0;
    maxZ: number = 0;
    static clippedX: Int32Array = new Int32Array(10);
    static clippedY: Int32Array = new Int32Array(10);
    static clippedColour: Int32Array = new Int32Array(10);
    static pickedBitsets: Int32Array = new Int32Array(1000);
    static baseX: number = 0;
    static baseY: number = 0;
    static baseZ: number = 0;
    static mouseX: number = 0;
    static mouseY: number = 0;
    static pickedCount: number = 0;
    static checkHover: boolean = false;

    static init(total: number, provider: OnDemandProvider) {
        Model.meta = new Array(total);
        Model.provider = provider;
    }

    static unpack(id: number, data: Uint8Array | null) {
        if (!Model.meta) {
            return;
        }

        if (!data) {
            const info = (Model.meta[id] = new Metadata());
            info.vertexCount = 0;
            info.faceCount = 0;
            info.texturedFaceCount = 0;
            return;
        }

        const buf = new Packet(data);
        buf.pos = data.length - 18;

        const info = (Model.meta[id] = new Metadata());
        info.data = data;
        info.vertexCount = buf.g2();
        info.faceCount = buf.g2();
        info.texturedFaceCount = buf.g1();

		let hasInfo = buf.g1();
		let priority = buf.g1();
		let hasAlpha = buf.g1();
		let hasFaceLabels = buf.g1();
		let hasVertexLabels = buf.g1();
		let dataLengthX = buf.g2();
		let dataLengthY = buf.g2();
		let dataLengthZ = buf.g2();
		let dataLengthFaceOrientations = buf.g2();

		let pos = 0;
		info.vertexFlagsOffset = pos;

		pos += info.vertexCount;
		info.faceOrientationsOffset = pos;

		pos += info.faceCount;

		info.facePrioritiesOffset = pos;
		if (priority == 255) {
			pos += info.faceCount;
		} else {
			info.facePrioritiesOffset = -priority - 1;
		}

		info.faceLabelsOffset = pos;
		if (hasFaceLabels == 1) {
			pos += info.faceCount;
		} else {
			info.faceLabelsOffset = -1;
		}

		info.faceInfosOffset = pos;
		if (hasInfo == 1) {
			pos += info.faceCount;
		} else {
			info.faceInfosOffset = -1;
		}

		info.vertexLabelsOffset = pos;
		if (hasVertexLabels == 1) {
			pos += info.vertexCount;
		} else {
			info.vertexLabelsOffset = -1;
		}

		info.faceAlphasOffset = pos;
		if (hasAlpha == 1) {
			pos += info.faceCount;
		} else {
			info.faceAlphasOffset = -1;
		}

		info.faceVerticesOffset = pos;
		pos += dataLengthFaceOrientations;

		info.faceColoursOffset = pos;
		pos += info.faceCount * 2;

		info.faceTextureAxisOffset = pos;
		pos += info.texturedFaceCount * 6;

		info.vertexXOffset = pos;
		pos += dataLengthX;

		info.vertexYOffset = pos;
		pos += dataLengthY;

		info.vertexZOffset = pos;
		pos += dataLengthZ;
    }

    static unload(id: number) {
        if (Model.meta) {
            Model.meta[id] = null;
        }
    }

    static tryGet(id: number): Model | null {
        if (!Model.meta) {
            return null;
        }

        const meta = Model.meta[id];
        if (!meta) {
            Model.provider.requestModel(id);
            return null;
        }

        return Model.fromId(id);
    }

    static isReady(id: number): boolean {
        if (!Model.meta) {
            return false;
        }

        const meta = Model.meta[id];
        if (!meta) {
            Model.provider.requestModel(id);
            return false;
        }

        return true;
    }

    constructor(type?: ModelType) {
        super();

        if (type) {
            this.vertexCount = type.vertexCount;
            this.vertexX = type.vertexX;
            this.vertexY = type.vertexY;
            this.vertexZ = type.vertexZ;
            this.faceCount = type.faceCount;
            this.faceVertexA = type.faceVertexA;
            this.faceVertexB = type.faceVertexB;
            this.faceVertexC = type.faceVertexC;
            this.faceColourA = type.faceColorA;
            this.faceColourB = type.faceColorB;
            this.faceColourC = type.faceColorC;
            this.faceInfo = type.faceInfo;
            this.facePriority = type.facePriority;
            this.faceAlpha = type.faceAlpha;
            this.faceColour = type.faceColor;
            this.priority = type.priorityVal;
            this.texturedFaceCount = type.texturedFaceCount;
            this.texturedVertexA = type.texturedVertexA;
            this.texturedVertexB = type.texturedVertexB;
            this.texturedVertexC = type.texturedVertexC;
            this.minX = type.minX ?? 0;
            this.maxX = type.maxX ?? 0;
            this.minZ = type.minZ ?? 0;
            this.maxZ = type.maxZ ?? 0;
            this.radius = type.radius ?? 0;
            this.maxY = type.minY ?? 0;
            this.minY = type.maxY ?? 0;
            this.maxDepth = type.maxDepth ?? 0;
            this.minDepth = type.minDepth ?? 0;
            this.vertexLabel = type.vertexLabel ?? null;
            this.faceLabel = type.faceLabel ?? null;
            this.labelVertices = type.labelVertices ?? null;
            this.labelFaces = type.labelFaces ?? null;
            this.vertexNormal = type.vertexNormal ?? null;
            this.vertexNormalOriginal = type.vertexNormalOriginal ?? null;
        }
    }

    static fromId(id: number): Model {
        if (!Model.meta || !Model.meta[id]) {
            return new Model();
        }

        Model.loaded++;

        const info = Model.meta[id];
        const model = new Model();
		model.vertexCount = info.vertexCount;
		model.faceCount = info.faceCount;
		model.texturedFaceCount = info.texturedFaceCount;
		model.vertexX = new Int32Array(model.vertexCount);
		model.vertexY = new Int32Array(model.vertexCount);
		model.vertexZ = new Int32Array(model.vertexCount);
		model.faceVertexA = new Int32Array(model.faceCount);
		model.faceVertexB = new Int32Array(model.faceCount);
		model.faceVertexC = new Int32Array(model.faceCount);
		model.texturedVertexA = new Int32Array(model.texturedFaceCount);
		model.texturedVertexB = new Int32Array(model.texturedFaceCount);
		model.texturedVertexC = new Int32Array(model.texturedFaceCount);

		if (info.vertexLabelsOffset >= 0) {
			model.vertexLabel = new Int32Array(model.vertexCount);
		}

		if (info.faceInfosOffset >= 0) {
			model.faceInfo = new Int32Array(model.faceCount);
		}

		if (info.facePrioritiesOffset >= 0) {
			model.facePriority = new Int32Array(model.faceCount);
		} else {
			model.priority = -info.facePrioritiesOffset - 1;
		}

		if (info.faceAlphasOffset >= 0) {
			model.faceAlpha = new Int32Array(model.faceCount);
		}

		if (info.faceLabelsOffset >= 0) {
			model.faceLabel = new Int32Array(model.faceCount);
		}

        model.faceColour = new Int32Array(model.faceCount);

		const point1 = new Packet(info.data);
		point1.pos = info.vertexFlagsOffset;

		const point2 = new Packet(info.data);
		point2.pos = info.vertexXOffset;

		const point3 = new Packet(info.data);
		point3.pos = info.vertexYOffset;

		const point4 = new Packet(info.data);
		point4.pos = info.vertexZOffset;

		const point5 = new Packet(info.data);
		point5.pos = info.vertexLabelsOffset;

		let dx = 0;
		let dy = 0;
		let dz = 0;
		for (let v = 0; v < model.vertexCount; v++) {
			let flags = point1.g1();

			let a = 0;
			if ((flags & 0x1) != 0) {
				a = point2.gsmart();
			}

			let b = 0;
			if ((flags & 0x2) != 0) {
				b = point3.gsmart();
			}

			let c = 0;
			if ((flags & 0x4) != 0) {
				c = point4.gsmart();
			}

			model.vertexX[v] = dx + a;
			model.vertexY[v] = dy + b;
			model.vertexZ[v] = dz + c;
			dx = model.vertexX[v];
			dy = model.vertexY[v];
			dz = model.vertexZ[v];

			if (model.vertexLabel != null) {
				model.vertexLabel[v] = point5.g1();
			}
		}

		const face1 = new Packet(info.data);
		face1.pos = info.faceColoursOffset;

		const face2 = new Packet(info.data);
		face2.pos = info.faceInfosOffset;

		const face3 = new Packet(info.data);
		face3.pos = info.facePrioritiesOffset;

		const face4 = new Packet(info.data);
		face4.pos = info.faceAlphasOffset;

		const face5 = new Packet(info.data);
		face5.pos = info.faceLabelsOffset;

		for (let f = 0; f < model.faceCount; f++) {
			model.faceColour[f] = face1.g2();

			if (model.faceInfo != null) {
				model.faceInfo[f] = face2.g1();
			}

			if (model.facePriority != null) {
				model.facePriority[f] = face3.g1();
			}

			if (model.faceAlpha != null) {
				model.faceAlpha[f] = face4.g1();
			}

			if (model.faceLabel != null) {
				model.faceLabel[f] = face5.g1();
			}
		}

		const vertex1 = new Packet(info.data);
		vertex1.pos = info.faceVerticesOffset;

		const vertex2 = new Packet(info.data);
		vertex2.pos = info.faceOrientationsOffset;

		let a = 0;
		let b = 0;
		let c = 0;
		let last = 0;

		for (let f = 0; f < model.faceCount; f++) {
			const orientation = vertex2.g1();
			if (orientation == 1) {
				a = vertex1.gsmart() + last;
				b = vertex1.gsmart() + a;
				c = vertex1.gsmart() + b;
				last = c;
			} else if (orientation == 2) {
				a = a;
				b = c;
				c = vertex1.gsmart() + last;
				last = c;
			} else if (orientation == 3) {
				a = c;
				b = b;
				c = vertex1.gsmart() + last;
				last = c;
			} else if (orientation == 4) {
				let tmp = a;
				a = b;
				b = tmp;
				c = vertex1.gsmart() + last;
				last = c;
			}

			model.faceVertexA[f] = a;
			model.faceVertexB[f] = b;
			model.faceVertexC[f] = c;
		}

		const axis = new Packet(info.data);
		axis.pos = info.faceTextureAxisOffset;

		for (let f = 0; f < model.texturedFaceCount; f++) {
			model.texturedVertexA[f] = axis.g2();
			model.texturedVertexB[f] = axis.g2();
			model.texturedVertexC[f] = axis.g2();
		}

        return model;
    }

    static modelCopyFaces(src: Model, copyVertexY: boolean, copyFaces: boolean): Model {
        const vertexCount: number = src.vertexCount;
        const faceCount: number = src.faceCount;
        const texturedFaceCount: number = src.texturedFaceCount;

        let vertexY: Int32Array;
        if (copyVertexY) {
            vertexY = new Int32Array(vertexCount);
            for (let v: number = 0; v < vertexCount; v++) {
                vertexY[v] = src.vertexY![v];
            }
        } else {
            vertexY = src.vertexY!;
        }

        let faceColorA: Int32Array | null;
        let faceColorB: Int32Array | null;
        let faceColorC: Int32Array | null;
        let faceInfo: Int32Array | null;
        let vertexNormal: (VertexNormal | null)[] | null = null;
        let vertexNormalOriginal: (VertexNormal | null)[] | null = null;
        if (copyFaces) {
            faceColorA = new Int32Array(faceCount);
            faceColorB = new Int32Array(faceCount);
            faceColorC = new Int32Array(faceCount);
            for (let f: number = 0; f < faceCount; f++) {
                if (src.faceColourA) {
                    faceColorA[f] = src.faceColourA[f];
                }
                if (src.faceColourB) {
                    faceColorB[f] = src.faceColourB[f];
                }
                if (src.faceColourC) {
                    faceColorC[f] = src.faceColourC[f];
                }
            }

            faceInfo = new Int32Array(faceCount);
            if (!src.faceInfo) {
                for (let f: number = 0; f < faceCount; f++) {
                    faceInfo[f] = 0;
                }
            } else {
                for (let f: number = 0; f < faceCount; f++) {
                    faceInfo[f] = src.faceInfo[f];
                }
            }

            vertexNormal = new TypedArray1d(vertexCount, null);
            for (let v: number = 0; v < vertexCount; v++) {
                const copy: VertexNormal = (vertexNormal[v] = new VertexNormal());
                if (src.vertexNormal) {
                    const original: VertexNormal | null = src.vertexNormal[v];
                    if (original) {
                        copy.x = original.x;
                        copy.y = original.y;
                        copy.z = original.z;
                        copy.w = original.w;
                    }
                }
            }

            vertexNormalOriginal = src.vertexNormalOriginal;
        } else {
            faceColorA = src.faceColourA;
            faceColorB = src.faceColourB;
            faceColorC = src.faceColourC;
            faceInfo = src.faceInfo;
        }
        return new Model({
            vertexCount: vertexCount,
            vertexX: src.vertexX!,
            vertexY: vertexY,
            vertexZ: src.vertexZ!,
            faceCount: faceCount,
            faceVertexA: src.faceVertexA!,
            faceVertexB: src.faceVertexB!,
            faceVertexC: src.faceVertexC!,
            faceColorA: faceColorA,
            faceColorB: faceColorB,
            faceColorC: faceColorC,
            faceInfo: faceInfo,
            facePriority: src.facePriority,
            faceAlpha: src.faceAlpha,
            faceColor: src.faceColour,
            priorityVal: src.priority,
            texturedFaceCount: texturedFaceCount,
            texturedVertexA: src.texturedVertexA!,
            texturedVertexB: src.texturedVertexB!,
            texturedVertexC: src.texturedVertexC!,
            minX: src.minX,
            maxX: src.maxX,
            minZ: src.minZ,
            maxZ: src.maxZ,
            radius: src.radius,
            minY: src.maxY,
            maxY: src.minY,
            maxDepth: src.maxDepth,
            minDepth: src.minDepth,
            vertexNormal: vertexNormal,
            vertexNormalOriginal: vertexNormalOriginal
        });
    }

    static modelShareColored(src: Model, shareColors: boolean, shareAlpha: boolean, shareVertices: boolean): Model {
        const vertexCount: number = src.vertexCount;
        const faceCount: number = src.faceCount;
        const texturedFaceCount: number = src.texturedFaceCount;

        let vertexX: Int32Array;
        let vertexY: Int32Array;
        let vertexZ: Int32Array;

        if (shareVertices) {
            vertexX = src.vertexX!;
            vertexY = src.vertexY!;
            vertexZ = src.vertexZ!;
        } else {
            vertexX = new Int32Array(vertexCount);
            vertexY = new Int32Array(vertexCount);
            vertexZ = new Int32Array(vertexCount);

            for (let v: number = 0; v < vertexCount; v++) {
                vertexX[v] = src.vertexX![v];
                vertexY[v] = src.vertexY![v];
                vertexZ[v] = src.vertexZ![v];
            }
        }

        let faceColor: Int32Array | null;
        if (shareColors) {
            faceColor = src.faceColour;
        } else {
            faceColor = new Int32Array(faceCount);
            for (let f: number = 0; f < faceCount; f++) {
                if (src.faceColour) {
                    faceColor[f] = src.faceColour[f];
                }
            }
        }

        let faceAlpha: Int32Array | null;
        if (shareAlpha) {
            faceAlpha = src.faceAlpha;
        } else {
            faceAlpha = new Int32Array(faceCount);
            if (!src.faceAlpha) {
                for (let f: number = 0; f < faceCount; f++) {
                    faceAlpha[f] = 0;
                }
            } else {
                for (let f: number = 0; f < faceCount; f++) {
                    faceAlpha[f] = src.faceAlpha[f];
                }
            }
        }
        return new Model({
            vertexCount: vertexCount,
            vertexX: vertexX,
            vertexY: vertexY,
            vertexZ: vertexZ,
            faceCount: faceCount,
            faceVertexA: src.faceVertexA!,
            faceVertexB: src.faceVertexB!,
            faceVertexC: src.faceVertexC!,
            faceColorA: null,
            faceColorB: null,
            faceColorC: null,
            faceInfo: src.faceInfo,
            facePriority: src.facePriority,
            faceAlpha: faceAlpha,
            faceColor: faceColor,
            priorityVal: src.priority,
            texturedFaceCount: texturedFaceCount,
            texturedVertexA: src.texturedVertexA!,
            texturedVertexB: src.texturedVertexB!,
            texturedVertexC: src.texturedVertexC!,
            vertexLabel: src.vertexLabel,
            faceLabel: src.faceLabel
        });
    }

    static modelShareAlpha(src: Model, shareAlpha: boolean): Model {
        const vertexCount: number = src.vertexCount;
        const faceCount: number = src.faceCount;
        const texturedFaceCount: number = src.texturedFaceCount;

        const vertexX: Int32Array = new Int32Array(vertexCount);
        const vertexY: Int32Array = new Int32Array(vertexCount);
        const vertexZ: Int32Array = new Int32Array(vertexCount);

        for (let v: number = 0; v < vertexCount; v++) {
            vertexX[v] = src.vertexX![v];
            vertexY[v] = src.vertexY![v];
            vertexZ[v] = src.vertexZ![v];
        }

        let faceAlpha: Int32Array | null;
        if (shareAlpha) {
            faceAlpha = src.faceAlpha;
        } else {
            faceAlpha = new Int32Array(faceCount);
            if (!src.faceAlpha) {
                for (let f: number = 0; f < faceCount; f++) {
                    faceAlpha[f] = 0;
                }
            } else {
                for (let f: number = 0; f < faceCount; f++) {
                    faceAlpha[f] = src.faceAlpha[f];
                }
            }
        }
        return new Model({
            vertexCount: vertexCount,
            vertexX: vertexX,
            vertexY: vertexY,
            vertexZ: vertexZ,
            faceCount: faceCount,
            faceVertexA: src.faceVertexA!,
            faceVertexB: src.faceVertexB!,
            faceVertexC: src.faceVertexC!,
            faceColorA: src.faceColourA,
            faceColorB: src.faceColourB,
            faceColorC: src.faceColourC,
            faceInfo: src.faceInfo,
            facePriority: src.facePriority,
            faceAlpha: faceAlpha,
            faceColor: src.faceColour,
            priorityVal: src.priority,
            texturedFaceCount: texturedFaceCount,
            texturedVertexA: src.texturedVertexA!,
            texturedVertexB: src.texturedVertexB!,
            texturedVertexC: src.texturedVertexC!,
            labelVertices: src.labelVertices,
            labelFaces: src.labelFaces
        });
    }

    static modelFromModelsBounds(models: Model[], count: number): Model {
        let copyInfo: boolean = false;
        let copyPriority: boolean = false;
        let copyAlpha: boolean = false;
        let copyColor: boolean = false;

        let vertexCount: number = 0;
        let faceCount: number = 0;
        let texturedFaceCount: number = 0;
        let priority: number = -1;

        for (let i: number = 0; i < count; i++) {
            const model: Model = models[i];
            if (model) {
                vertexCount += model.vertexCount;
                faceCount += model.faceCount;
                texturedFaceCount += model.texturedFaceCount;

                copyInfo ||= model.faceInfo !== null;

                if (!model.facePriority) {
                    if (priority === -1) {
                        priority = model.priority;
                    }
                    if (priority !== model.priority) {
                        copyPriority = true;
                    }
                } else {
                    copyPriority = true;
                }

                copyAlpha ||= model.faceAlpha !== null;
                copyColor ||= model.faceColour !== null;
            }
        }

        const vertexX: Int32Array = new Int32Array(vertexCount);
        const vertexY: Int32Array = new Int32Array(vertexCount);
        const vertexZ: Int32Array = new Int32Array(vertexCount);

        const faceVertexA: Int32Array = new Int32Array(faceCount);
        const faceVertexB: Int32Array = new Int32Array(faceCount);
        const faceVertexC: Int32Array = new Int32Array(faceCount);

        const faceColorA: Int32Array = new Int32Array(faceCount);
        const faceColorB: Int32Array = new Int32Array(faceCount);
        const faceColorC: Int32Array = new Int32Array(faceCount);

        const texturedVertexA: Int32Array = new Int32Array(texturedFaceCount);
        const texturedVertexB: Int32Array = new Int32Array(texturedFaceCount);
        const texturedVertexC: Int32Array = new Int32Array(texturedFaceCount);

        let faceInfo: Int32Array | null = null;
        if (copyInfo) {
            faceInfo = new Int32Array(faceCount);
        }

        let facePriority: Int32Array | null = null;
        if (copyPriority) {
            facePriority = new Int32Array(faceCount);
        }

        let faceAlpha: Int32Array | null = null;
        if (copyAlpha) {
            faceAlpha = new Int32Array(faceCount);
        }

        let faceColor: Int32Array | null = null;
        if (copyColor) {
            faceColor = new Int32Array(faceCount);
        }

        vertexCount = 0;
        faceCount = 0;
        texturedFaceCount = 0;

        for (let i: number = 0; i < count; i++) {
            const model: Model = models[i];
            if (model) {
                const vertexCount2: number = vertexCount;

                for (let v: number = 0; v < model.vertexCount; v++) {
                    vertexX[vertexCount] = model.vertexX![v];
                    vertexY[vertexCount] = model.vertexY![v];
                    vertexZ[vertexCount] = model.vertexZ![v];
                    vertexCount++;
                }

                for (let f: number = 0; f < model.faceCount; f++) {
                    faceVertexA[faceCount] = model.faceVertexA![f] + vertexCount2;
                    faceVertexB[faceCount] = model.faceVertexB![f] + vertexCount2;
                    faceVertexC[faceCount] = model.faceVertexC![f] + vertexCount2;
                    if (model.faceColourA) {
                        faceColorA[faceCount] = model.faceColourA[f];
                    }
                    if (model.faceColourB) {
                        faceColorB[faceCount] = model.faceColourB[f];
                    }
                    if (model.faceColourC) {
                        faceColorC[faceCount] = model.faceColourC[f];
                    }

                    if (copyInfo) {
                        if (!model.faceInfo) {
                            if (faceInfo) {
                                faceInfo[faceCount] = 0;
                            }
                        } else {
                            if (faceInfo) {
                                faceInfo[faceCount] = model.faceInfo[f];
                            }
                        }
                    }

                    if (copyPriority) {
                        if (!model.facePriority) {
                            if (facePriority) {
                                facePriority[faceCount] = model.priority;
                            }
                        } else {
                            if (facePriority) {
                                facePriority[faceCount] = model.facePriority[f];
                            }
                        }
                    }

                    if (copyAlpha) {
                        if (!model.faceAlpha) {
                            if (faceAlpha) {
                                faceAlpha[faceCount] = 0;
                            }
                        } else {
                            if (faceAlpha) {
                                faceAlpha[faceCount] = model.faceAlpha[f];
                            }
                        }
                    }

                    if (copyColor && model.faceColour) {
                        if (faceColor) {
                            faceColor[faceCount] = model.faceColour[f];
                        }
                    }

                    faceCount++;
                }

                for (let f: number = 0; f < model.texturedFaceCount; f++) {
                    texturedVertexA[texturedFaceCount] = model.texturedVertexA![f] + vertexCount2;
                    texturedVertexB[texturedFaceCount] = model.texturedVertexB![f] + vertexCount2;
                    texturedVertexC[texturedFaceCount] = model.texturedVertexC![f] + vertexCount2;
                    texturedFaceCount++;
                }
            }
        }
        const model: Model = new Model({
            vertexCount: vertexCount,
            vertexX: vertexX,
            vertexY: vertexY,
            vertexZ: vertexZ,
            faceCount: faceCount,
            faceVertexA: faceVertexA,
            faceVertexB: faceVertexB,
            faceVertexC: faceVertexC,
            faceColorA: faceColorA,
            faceColorB: faceColorB,
            faceColorC: faceColorC,
            faceInfo: faceInfo,
            facePriority: facePriority,
            faceAlpha: faceAlpha,
            faceColor: faceColor,
            priorityVal: priority,
            texturedFaceCount: texturedFaceCount,
            texturedVertexA: texturedVertexA,
            texturedVertexB: texturedVertexB,
            texturedVertexC: texturedVertexC
        });
        model.calculateBoundsCylinder();
        return model;
    }

    static modelFromModels(models: (Model | null)[], count: number): Model {
        let copyInfo: boolean = false;
        let copyPriorities: boolean = false;
        let copyAlpha: boolean = false;
        let copyLabels: boolean = false;

        let vertexCount: number = 0;
        let faceCount: number = 0;
        let texturedFaceCount: number = 0;
        let priority: number = -1;

        for (let i: number = 0; i < count; i++) {
            const model: Model | null = models[i];
            if (model) {
                vertexCount += model.vertexCount;
                faceCount += model.faceCount;
                texturedFaceCount += model.texturedFaceCount;
                copyInfo ||= model.faceInfo !== null;

                if (!model.facePriority) {
                    if (priority === -1) {
                        priority = model.priority;
                    }

                    if (priority !== model.priority) {
                        copyPriorities = true;
                    }
                } else {
                    copyPriorities = true;
                }

                copyAlpha ||= model.faceAlpha !== null;
                copyLabels ||= model.faceLabel !== null;
            }
        }

        const vertexX: Int32Array = new Int32Array(vertexCount);
        const vertexY: Int32Array = new Int32Array(vertexCount);
        const vertexZ: Int32Array = new Int32Array(vertexCount);

        const vertexLabel: Int32Array = new Int32Array(vertexCount);

        const faceVertexA: Int32Array = new Int32Array(faceCount);
        const faceVertexB: Int32Array = new Int32Array(faceCount);
        const faceVertexC: Int32Array = new Int32Array(faceCount);

        const texturedVertexA: Int32Array = new Int32Array(texturedFaceCount);
        const texturedVertexB: Int32Array = new Int32Array(texturedFaceCount);
        const texturedVertexC: Int32Array = new Int32Array(texturedFaceCount);

        let faceInfo: Int32Array | null = null;
        if (copyInfo) {
            faceInfo = new Int32Array(faceCount);
        }

        let facePriority: Int32Array | null = null;
        if (copyPriorities) {
            facePriority = new Int32Array(faceCount);
        }

        let faceAlpha: Int32Array | null = null;
        if (copyAlpha) {
            faceAlpha = new Int32Array(faceCount);
        }

        let faceLabel: Int32Array | null = null;
        if (copyLabels) {
            faceLabel = new Int32Array(faceCount);
        }

        const faceColor: Int32Array = new Int32Array(faceCount);
        vertexCount = 0;
        faceCount = 0;
        texturedFaceCount = 0;

        for (let i: number = 0; i < count; i++) {
            const model: Model | null = models[i];

            if (model) {
                for (let face: number = 0; face < model.faceCount; face++) {
                    if (copyInfo) {
                        if (!model.faceInfo) {
                            if (faceInfo) {
                                faceInfo[faceCount] = 0;
                            }
                        } else {
                            if (faceInfo) {
                                faceInfo[faceCount] = model.faceInfo[face];
                            }
                        }
                    }

                    if (copyPriorities) {
                        if (!model.facePriority) {
                            if (facePriority) {
                                facePriority[faceCount] = model.priority;
                            }
                        } else {
                            if (facePriority) {
                                facePriority[faceCount] = model.facePriority[face];
                            }
                        }
                    }

                    if (copyAlpha) {
                        if (!model.faceAlpha) {
                            if (faceAlpha) {
                                faceAlpha[faceCount] = 0;
                            }
                        } else {
                            if (faceAlpha) {
                                faceAlpha[faceCount] = model.faceAlpha[face];
                            }
                        }
                    }

                    if (copyLabels && model.faceLabel) {
                        if (faceLabel) {
                            faceLabel[faceCount] = model.faceLabel[face];
                        }
                    }

                    if (model.faceColour) {
                        faceColor[faceCount] = model.faceColour[face];
                    }
                    const a: { vertex: number; vertexCount: number } = Model.addVertex(model, model.faceVertexA![face], vertexX, vertexY, vertexZ, vertexLabel, vertexCount);
                    vertexCount = a.vertexCount;
                    const b: { vertex: number; vertexCount: number } = Model.addVertex(model, model.faceVertexB![face], vertexX, vertexY, vertexZ, vertexLabel, vertexCount);
                    vertexCount = b.vertexCount;
                    const c: { vertex: number; vertexCount: number } = Model.addVertex(model, model.faceVertexC![face], vertexX, vertexY, vertexZ, vertexLabel, vertexCount);
                    vertexCount = c.vertexCount;
                    faceVertexA[faceCount] = a.vertex;
                    faceVertexB[faceCount] = b.vertex;
                    faceVertexC[faceCount] = c.vertex;
                    faceCount++;
                }

                for (let f: number = 0; f < model.texturedFaceCount; f++) {
                    const a: { vertex: number; vertexCount: number } = Model.addVertex(model, model.texturedVertexA![f], vertexX, vertexY, vertexZ, vertexLabel, vertexCount);
                    vertexCount = a.vertexCount;
                    const b: { vertex: number; vertexCount: number } = Model.addVertex(model, model.texturedVertexB![f], vertexX, vertexY, vertexZ, vertexLabel, vertexCount);
                    vertexCount = b.vertexCount;
                    const c: { vertex: number; vertexCount: number } = Model.addVertex(model, model.texturedVertexC![f], vertexX, vertexY, vertexZ, vertexLabel, vertexCount);
                    vertexCount = c.vertexCount;
                    texturedVertexA[texturedFaceCount] = a.vertex;
                    texturedVertexB[texturedFaceCount] = b.vertex;
                    texturedVertexC[texturedFaceCount] = c.vertex;
                    texturedFaceCount++;
                }
            }
        }
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
            priorityVal: priority,
            texturedFaceCount: texturedFaceCount,
            texturedVertexA: texturedVertexA,
            texturedVertexB: texturedVertexB,
            texturedVertexC: texturedVertexC,
            vertexLabel: vertexLabel,
            faceLabel: faceLabel
        });
    }

    set(src: Model, shareAlpha: boolean): void {
        if (Model.tmpVertexX.length < this.vertexCount) {
			Model.tmpVertexX = new Int32Array(this.vertexCount + 100);
			Model.tmpVertexY = new Int32Array(this.vertexCount + 100);
			Model.tmpVertexZ = new Int32Array(this.vertexCount + 100);
		}

        this.vertexX = Model.tmpVertexX;
        this.vertexY = Model.tmpVertexY;
        this.vertexZ = Model.tmpVertexZ;

        for (let v: number = 0; v < this.vertexCount; v++) {
            this.vertexX[v] = src.vertexX![v];
            this.vertexY[v] = src.vertexY![v];
            this.vertexZ[v] = src.vertexZ![v];
        }

        if (shareAlpha) {
            this.faceAlpha = src.faceAlpha;
        } else {
			if (Model.tmpFaceAlpha.length < this.faceCount) {
				Model.tmpFaceAlpha = new Int32Array(this.faceCount + 100);
			}

            this.faceAlpha = new Int32Array(this.faceCount);

            if (!src.faceAlpha) {
                for (let f: number = 0; f < this.faceCount; f++) {
                    this.faceAlpha[f] = 0;
                }
            } else {
                for (let f: number = 0; f < this.faceCount; f++) {
                    this.faceAlpha[f] = src.faceAlpha[f];
                }
            }
        }

		this.faceInfo = src.faceInfo;
		this.faceColour = src.faceColour;
		this.facePriority = src.facePriority;
		this.priority = src.priority;
		this.labelFaces = src.labelFaces;
		this.labelVertices = src.labelVertices;
		this.faceVertexA = src.faceVertexA;
		this.faceVertexB = src.faceVertexB;
		this.faceVertexC = src.faceVertexC;
		this.faceColourA = src.faceColourA;
		this.faceColourB = src.faceColourB;
		this.faceColourC = src.faceColourC;
		this.texturedVertexA = src.texturedVertexA;
		this.texturedVertexB = src.texturedVertexB;
		this.texturedVertexC = src.texturedVertexC;
    }

    static addVertex = (
        src: Model,
        vertexId: number,
        vertexX: Int32Array,
        vertexY: Int32Array,
        vertexZ: Int32Array,
        vertexLabel: Int32Array,
        vertexCount: number
    ): {
        vertex: number;
        vertexCount: number;
    } => {
        let identical: number = -1;

        if (src.vertexX && src.vertexY && src.vertexZ) {
            const x: number = src.vertexX[vertexId];
            const y: number = src.vertexY[vertexId];
            const z: number = src.vertexZ[vertexId];

            for (let v: number = 0; v < vertexCount; v++) {
                if (x === vertexX[v] && y === vertexY[v] && z === vertexZ[v]) {
                    identical = v;
                    break;
                }
            }

            if (identical === -1) {
                vertexX[vertexCount] = x;
                vertexY[vertexCount] = y;
                vertexZ[vertexCount] = z;

                if (vertexLabel && src.vertexLabel) {
                    vertexLabel[vertexCount] = src.vertexLabel[vertexId];
                }

                identical = vertexCount++;
            }
        }

        return { vertex: identical, vertexCount };
    };

    calculateBoundsCylinder(): void {
        this.minY = 0;
        this.radius = 0;
        this.maxY = 0;

        for (let i: number = 0; i < this.vertexCount; i++) {
            const x: number = this.vertexX![i];
            const y: number = this.vertexY![i];
            const z: number = this.vertexZ![i];

            if (-y > this.minY) {
                this.minY = -y;
            }

            if (y > this.maxY) {
                this.maxY = y;
            }

            const radiusSqr: number = x * x + z * z;
            if (radiusSqr > this.radius) {
                this.radius = radiusSqr;
            }
        }

        this.radius = (Math.sqrt(this.radius) + 0.99) | 0;
        this.minDepth = (Math.sqrt(this.radius * this.radius + this.minY * this.minY) + 0.99) | 0;
        this.maxDepth = this.minDepth + ((Math.sqrt(this.radius * this.radius + this.maxY * this.maxY) + 0.99) | 0);
    }

    calculateBoundsY(): void {
        this.minY = 0;
        this.maxY = 0;

        for (let i: number = 0; i < this.vertexCount; i++) {
            const y: number = this.vertexY![i];

            if (-y > this.minY) {
                this.minY = -y;
            }

            if (y > this.maxY) {
                this.maxY = y;
            }
        }

        this.minDepth = (Math.sqrt(this.radius * this.radius + this.minY * this.minY) + 0.99) | 0;
        this.maxDepth = this.minDepth + ((Math.sqrt(this.radius * this.radius + this.maxY * this.maxY) + 0.99) | 0);
    }

    private calculateBoundsAABB(): void {
        this.minY = 0;
        this.radius = 0;
        this.maxY = 0;
        this.minX = 999999;
        this.maxX = -999999;
        this.maxZ = -99999;
        this.minZ = 99999;

        for (let v: number = 0; v < this.vertexCount; v++) {
            const x: number = this.vertexX![v];
            const y: number = this.vertexY![v];
            const z: number = this.vertexZ![v];

            if (x < this.minX) {
                this.minX = x;
            }

            if (x > this.maxX) {
                this.maxX = x;
            }

            if (z < this.minZ) {
                this.minZ = z;
            }

            if (z > this.maxZ) {
                this.maxZ = z;
            }

            if (-y > this.minY) {
                this.minY = -y;
            }

            if (y > this.maxY) {
                this.maxY = y;
            }

            const radiusSqr: number = x * x + z * z;
            if (radiusSqr > this.radius) {
                this.radius = radiusSqr;
            }
        }

        this.radius = Math.sqrt(this.radius) | 0;
        this.minDepth = Math.sqrt(this.radius * this.radius + this.minY * this.minY) | 0;
        this.maxDepth = this.minDepth + (Math.sqrt(this.radius * this.radius + this.maxY * this.maxY) | 0);
    }

    createLabelReferences(): void {
        if (this.vertexLabel) {
            const labelVertexCount: Int32Array = new Int32Array(256);
            let count: number = 0;

            for (let v: number = 0; v < this.vertexCount; v++) {
                const label: number = this.vertexLabel[v];
                labelVertexCount[label]++;
                if (label > count) {
                    count = label;
                }
            }

            this.labelVertices = new TypedArray1d(count + 1, null);
            for (let label: number = 0; label <= count; label++) {
                this.labelVertices[label] = new Int32Array(labelVertexCount[label]);
                labelVertexCount[label] = 0;
            }

            let v: number = 0;
            while (v < this.vertexCount) {
                const label: number = this.vertexLabel[v];
                const verts: Int32Array | null = this.labelVertices[label];
                if (!verts) {
                    continue;
                }

                verts[labelVertexCount[label]++] = v++;
            }

            this.vertexLabel = null;
        }

        if (this.faceLabel) {
            const labelFaceCount: Int32Array = new Int32Array(256);
            let count: number = 0;
            for (let f: number = 0; f < this.faceCount; f++) {
                const label: number = this.faceLabel[f];
                labelFaceCount[label]++;
                if (label > count) {
                    count = label;
                }
            }

            this.labelFaces = new TypedArray1d(count + 1, null);
            for (let label: number = 0; label <= count; label++) {
                this.labelFaces[label] = new Int32Array(labelFaceCount[label]);
                labelFaceCount[label] = 0;
            }

            let face: number = 0;
            while (face < this.faceCount) {
                const label: number = this.faceLabel[face];
                const faces: Int32Array | null = this.labelFaces[label];
                if (!faces) {
                    continue;
                }

                faces[labelFaceCount[label]++] = face++;
            }

            this.faceLabel = null;
        }
    }

    applyTransform(id: number): void {
        if (!this.labelVertices || id === -1) {
            return;
        }

        const transform: AnimFrame = AnimFrame.instances[id];
        if (!transform) {
            return;
        }

        const skeleton: AnimBase | null = transform.base;
        Model.baseX = 0;
        Model.baseY = 0;
        Model.baseZ = 0;

        for (let i: number = 0; i < transform.length; i++) {
            if (!transform.groups || !transform.x || !transform.y || !transform.z || !skeleton || !skeleton.labels || !skeleton.types) {
                continue;
            }

            const base: number = transform.groups[i];
            this.applyTransform2(transform.x[i], transform.y[i], transform.z[i], skeleton.labels[base], skeleton.types[base]);
        }
    }

    applyTransforms(primaryId: number, secondaryId: number, mask: Int32Array | null): void {
        if (primaryId === -1) {
            return;
        }

        if (!mask || secondaryId === -1) {
            this.applyTransform(primaryId);
        } else {
            const primary: AnimFrame = AnimFrame.instances[primaryId];
            const secondary: AnimFrame = AnimFrame.instances[secondaryId];
            const skeleton: AnimBase | null = primary.base;

            Model.baseX = 0;
            Model.baseY = 0;
            Model.baseZ = 0;

            let counter: number = 0;
            let maskBase: number = mask[counter++];

            for (let i: number = 0; i < primary.length; i++) {
                if (!primary.groups) {
                    continue;
                }
                const base: number = primary.groups[i];
                while (base > maskBase) {
                    maskBase = mask[counter++];
                }

                if (skeleton && skeleton.types && primary.x && primary.y && primary.z && skeleton.labels && (base !== maskBase || skeleton.types[base] === 0)) {
                    this.applyTransform2(primary.x[i], primary.y[i], primary.z[i], skeleton.labels[base], skeleton.types[base]);
                }
            }

            Model.baseX = 0;
            Model.baseY = 0;
            Model.baseZ = 0;

            counter = 0;
            maskBase = mask[counter++];

            for (let i: number = 0; i < secondary.length; i++) {
                if (!secondary.groups) {
                    continue;
                }
                const base: number = secondary.groups[i];
                while (base > maskBase) {
                    maskBase = mask[counter++];
                }

                if (skeleton && skeleton.types && secondary.x && secondary.y && secondary.z && skeleton.labels && (base === maskBase || skeleton.types[base] === 0)) {
                    this.applyTransform2(secondary.x[i], secondary.y[i], secondary.z[i], skeleton.labels[base], skeleton.types[base]);
                }
            }
        }
    }

    private applyTransform2(x: number, y: number, z: number, labels: Uint8Array | null, type: number): void {
        if (!labels) {
            return;
        }

        const labelCount: number = labels.length;

        if (type === 0) {
            let count: number = 0;
            Model.baseX = 0;
            Model.baseY = 0;
            Model.baseZ = 0;

            for (let g: number = 0; g < labelCount; g++) {
                if (!this.labelVertices) {
                    continue;
                }
                const label: number = labels[g];
                if (label < this.labelVertices.length) {
                    const vertices: Int32Array | null = this.labelVertices[label];
                    if (vertices) {
                        for (let i: number = 0; i < vertices.length; i++) {
                            const v: number = vertices[i];
                            Model.baseX += this.vertexX![v];
                            Model.baseY += this.vertexY![v];
                            Model.baseZ += this.vertexZ![v];
                            count++;
                        }
                    }
                }
            }

            if (count > 0) {
                Model.baseX = ((Model.baseX / count) | 0) + x;
                Model.baseY = ((Model.baseY / count) | 0) + y;
                Model.baseZ = ((Model.baseZ / count) | 0) + z;
            } else {
                Model.baseX = x;
                Model.baseY = y;
                Model.baseZ = z;
            }
        } else if (type === 1) {
            for (let g: number = 0; g < labelCount; g++) {
                const group: number = labels[g];
                if (!this.labelVertices || group >= this.labelVertices.length) {
                    continue;
                }

                const vertices: Int32Array | null = this.labelVertices[group];
                if (vertices) {
                    for (let i: number = 0; i < vertices.length; i++) {
                        const v: number = vertices[i];
                        this.vertexX![v] += x;
                        this.vertexY![v] += y;
                        this.vertexZ![v] += z;
                    }
                }
            }
        } else if (type === 2) {
            for (let g: number = 0; g < labelCount; g++) {
                const label: number = labels[g];
                if (!this.labelVertices || label >= this.labelVertices.length) {
                    continue;
                }

                const vertices: Int32Array | null = this.labelVertices[label];
                if (vertices) {
                    for (let i: number = 0; i < vertices.length; i++) {
                        const v: number = vertices[i];
                        this.vertexX![v] -= Model.baseX;
                        this.vertexY![v] -= Model.baseY;
                        this.vertexZ![v] -= Model.baseZ;

                        const pitch: number = (x & 0xff) * 8;
                        const yaw: number = (y & 0xff) * 8;
                        const roll: number = (z & 0xff) * 8;

                        let sin: number;
                        let cos: number;

                        if (roll !== 0) {
                            sin = Pix3D.sin[roll];
                            cos = Pix3D.cos[roll];
                            const x_: number = (this.vertexY![v] * sin + this.vertexX![v] * cos) >> 16;
                            this.vertexY![v] = (this.vertexY![v] * cos - this.vertexX![v] * sin) >> 16;
                            this.vertexX![v] = x_;
                        }

                        if (pitch !== 0) {
                            sin = Pix3D.sin[pitch];
                            cos = Pix3D.cos[pitch];
                            const y_: number = (this.vertexY![v] * cos - this.vertexZ![v] * sin) >> 16;
                            this.vertexZ![v] = (this.vertexY![v] * sin + this.vertexZ![v] * cos) >> 16;
                            this.vertexY![v] = y_;
                        }

                        if (yaw !== 0) {
                            sin = Pix3D.sin[yaw];
                            cos = Pix3D.cos[yaw];
                            const x_: number = (this.vertexZ![v] * sin + this.vertexX![v] * cos) >> 16;
                            this.vertexZ![v] = (this.vertexZ![v] * cos - this.vertexX![v] * sin) >> 16;
                            this.vertexX![v] = x_;
                        }

                        this.vertexX![v] += Model.baseX;
                        this.vertexY![v] += Model.baseY;
                        this.vertexZ![v] += Model.baseZ;
                    }
                }
            }
        } else if (type === 3) {
            for (let g: number = 0; g < labelCount; g++) {
                const label: number = labels[g];
                if (!this.labelVertices || label >= this.labelVertices.length) {
                    continue;
                }

                const vertices: Int32Array | null = this.labelVertices[label];
                if (vertices) {
                    for (let i: number = 0; i < vertices.length; i++) {
                        const v: number = vertices[i];

                        this.vertexX![v] -= Model.baseX;
                        this.vertexY![v] -= Model.baseY;
                        this.vertexZ![v] -= Model.baseZ;

                        this.vertexX![v] = ((this.vertexX![v] * x) / 128) | 0;
                        this.vertexY![v] = ((this.vertexY![v] * y) / 128) | 0;
                        this.vertexZ![v] = ((this.vertexZ![v] * z) / 128) | 0;

                        this.vertexX![v] += Model.baseX;
                        this.vertexY![v] += Model.baseY;
                        this.vertexZ![v] += Model.baseZ;
                    }
                }
            }
        } else if (type === 5 && this.labelFaces && this.faceAlpha) {
            for (let g: number = 0; g < labelCount; g++) {
                const label: number = labels[g];
                if (label >= this.labelFaces.length) {
                    continue;
                }

                const triangles: Int32Array | null = this.labelFaces[label];
                if (triangles) {
                    for (let i: number = 0; i < triangles.length; i++) {
                        const t: number = triangles[i];

                        this.faceAlpha[t] += x * 8;
                        if (this.faceAlpha[t] < 0) {
                            this.faceAlpha[t] = 0;
                        }

                        if (this.faceAlpha[t] > 255) {
                            this.faceAlpha[t] = 255;
                        }
                    }
                }
            }
        }
    }

    rotateY90(): void {
        for (let v: number = 0; v < this.vertexCount; v++) {
            const tmp: number = this.vertexX![v];
            this.vertexX![v] = this.vertexZ![v];
            this.vertexZ![v] = -tmp;
        }
    }

    rotateX(angle: number): void {
        const sin: number = Pix3D.sin[angle];
        const cos: number = Pix3D.cos[angle];

        for (let v: number = 0; v < this.vertexCount; v++) {
            const tmp: number = (this.vertexY![v] * cos - this.vertexZ![v] * sin) >> 16;
            this.vertexZ![v] = (this.vertexY![v] * sin + this.vertexZ![v] * cos) >> 16;
            this.vertexY![v] = tmp;
        }
    }

    translate(y: number, x: number, z: number): void {
        for (let v: number = 0; v < this.vertexCount; v++) {
            this.vertexX![v] += x;
            this.vertexY![v] += y;
            this.vertexZ![v] += z;
        }
    }

    recolour(src: number, dst: number): void {
        if (!this.faceColour) {
            return;
        }

        for (let f: number = 0; f < this.faceCount; f++) {
            if (this.faceColour[f] === src) {
                this.faceColour[f] = dst;
            }
        }
    }

    rotateY180(): void {
        for (let v: number = 0; v < this.vertexCount; v++) {
            this.vertexZ![v] = -this.vertexZ![v];
        }

        for (let f: number = 0; f < this.faceCount; f++) {
            const tmp: number = this.faceVertexA![f];
            this.faceVertexA![f] = this.faceVertexC![f];
            this.faceVertexC![f] = tmp;
        }
    }

    scale(x: number, y: number, z: number): void {
        for (let v: number = 0; v < this.vertexCount; v++) {
            this.vertexX![v] = ((this.vertexX![v] * x) / 128) | 0;
            this.vertexY![v] = ((this.vertexY![v] * y) / 128) | 0;
            this.vertexZ![v] = ((this.vertexZ![v] * z) / 128) | 0;
        }
    }

    calculateNormals(lightAmbient: number, lightAttenuation: number, lightSrcX: number, lightSrcY: number, lightSrcZ: number, applyLighting: boolean): void {
        const lightMagnitude: number = Math.sqrt(lightSrcX * lightSrcX + lightSrcY * lightSrcY + lightSrcZ * lightSrcZ) | 0;
        const attenuation: number = (lightAttenuation * lightMagnitude) >> 8;

        if (!this.faceColourA || !this.faceColourB || !this.faceColourC) {
            this.faceColourA = new Int32Array(this.faceCount);
            this.faceColourB = new Int32Array(this.faceCount);
            this.faceColourC = new Int32Array(this.faceCount);
        }

        if (!this.vertexNormal) {
            this.vertexNormal = new TypedArray1d(this.vertexCount, null);

            for (let v: number = 0; v < this.vertexCount; v++) {
                this.vertexNormal[v] = new VertexNormal();
            }
        }

        for (let f: number = 0; f < this.faceCount; f++) {
            const a: number = this.faceVertexA![f];
            const b: number = this.faceVertexB![f];
            const c: number = this.faceVertexC![f];

            const dxAB: number = this.vertexX![b] - this.vertexX![a];
            const dyAB: number = this.vertexY![b] - this.vertexY![a];
            const dzAB: number = this.vertexZ![b] - this.vertexZ![a];

            const dxAC: number = this.vertexX![c] - this.vertexX![a];
            const dyAC: number = this.vertexY![c] - this.vertexY![a];
            const dzAC: number = this.vertexZ![c] - this.vertexZ![a];

            let nx: number = dyAB * dzAC - dyAC * dzAB;
            let ny: number = dzAB * dxAC - dzAC * dxAB;
            let nz: number = dxAB * dyAC - dxAC * dyAB;

            while (nx > 8192 || ny > 8192 || nz > 8192 || nx < -8192 || ny < -8192 || nz < -8192) {
                nx >>= 1;
                ny >>= 1;
                nz >>= 1;
            }

            let length: number = Math.sqrt(nx * nx + ny * ny + nz * nz) | 0;
            if (length <= 0) {
                length = 1;
            }

            nx = ((nx * 256) / length) | 0;
            ny = ((ny * 256) / length) | 0;
            nz = ((nz * 256) / length) | 0;

            if (!this.faceInfo || (this.faceInfo[f] & 0x1) === 0) {
                let n: VertexNormal | null = this.vertexNormal[a];
                if (n) {
                    n.x += nx;
                    n.y += ny;
                    n.z += nz;
                    n.w++;
                }

                n = this.vertexNormal[b];
                if (n) {
                    n.x += nx;
                    n.y += ny;
                    n.z += nz;
                    n.w++;
                }

                n = this.vertexNormal[c];
                if (n) {
                    n.x += nx;
                    n.y += ny;
                    n.z += nz;
                    n.w++;
                }
            } else {
                const lightness: number = lightAmbient + (((lightSrcX * nx + lightSrcY * ny + lightSrcZ * nz) / (attenuation + ((attenuation / 2) | 0))) | 0);
                if (this.faceColour) {
                    this.faceColourA[f] = Model.mulColourLightness(this.faceColour[f], lightness, this.faceInfo[f]);
                }
            }
        }

        if (applyLighting) {
            this.applyLighting(lightAmbient, attenuation, lightSrcX, lightSrcY, lightSrcZ);
        } else {
            this.vertexNormalOriginal = new TypedArray1d(this.vertexCount, null);

            for (let v: number = 0; v < this.vertexCount; v++) {
                const normal: VertexNormal | null = this.vertexNormal[v];
                const copy: VertexNormal = new VertexNormal();

                if (normal) {
                    copy.x = normal.x;
                    copy.y = normal.y;
                    copy.z = normal.z;
                    copy.w = normal.w;
                }

                this.vertexNormalOriginal[v] = copy;
            }
        }

        if (applyLighting) {
            this.calculateBoundsCylinder();
        } else {
            this.calculateBoundsAABB();
        }
    }

    applyLighting(lightAmbient: number, lightAttenuation: number, lightSrcX: number, lightSrcY: number, lightSrcZ: number): void {
        for (let f: number = 0; f < this.faceCount; f++) {
            const a: number = this.faceVertexA![f];
            const b: number = this.faceVertexB![f];
            const c: number = this.faceVertexC![f];

            if (!this.faceInfo && this.faceColour && this.vertexNormal && this.faceColourA && this.faceColourB && this.faceColourC) {
                const colour: number = this.faceColour[f];

                const va: VertexNormal | null = this.vertexNormal[a];
                if (va) {
                    this.faceColourA[f] = Model.mulColourLightness(colour, lightAmbient + (((lightSrcX * va.x + lightSrcY * va.y + lightSrcZ * va.z) / (lightAttenuation * va.w)) | 0), 0);
                }

                const vb: VertexNormal | null = this.vertexNormal[b];
                if (vb) {
                    this.faceColourB[f] = Model.mulColourLightness(colour, lightAmbient + (((lightSrcX * vb.x + lightSrcY * vb.y + lightSrcZ * vb.z) / (lightAttenuation * vb.w)) | 0), 0);
                }

                const vc: VertexNormal | null = this.vertexNormal[c];
                if (vc) {
                    this.faceColourC[f] = Model.mulColourLightness(colour, lightAmbient + (((lightSrcX * vc.x + lightSrcY * vc.y + lightSrcZ * vc.z) / (lightAttenuation * vc.w)) | 0), 0);
                }
            } else if (this.faceInfo && (this.faceInfo[f] & 0x1) === 0 && this.faceColour && this.vertexNormal && this.faceColourA && this.faceColourB && this.faceColourC) {
                const colour: number = this.faceColour[f];
                const info: number = this.faceInfo[f];

                const va: VertexNormal | null = this.vertexNormal[a];
                if (va) {
                    this.faceColourA[f] = Model.mulColourLightness(colour, lightAmbient + (((lightSrcX * va.x + lightSrcY * va.y + lightSrcZ * va.z) / (lightAttenuation * va.w)) | 0), info);
                }

                const vb: VertexNormal | null = this.vertexNormal[b];
                if (vb) {
                    this.faceColourB[f] = Model.mulColourLightness(colour, lightAmbient + (((lightSrcX * vb.x + lightSrcY * vb.y + lightSrcZ * vb.z) / (lightAttenuation * vb.w)) | 0), info);
                }

                const vc: VertexNormal | null = this.vertexNormal[c];
                if (vc) {
                    this.faceColourC[f] = Model.mulColourLightness(colour, lightAmbient + (((lightSrcX * vc.x + lightSrcY * vc.y + lightSrcZ * vc.z) / (lightAttenuation * vc.w)) | 0), info);
                }
            }
        }

        this.vertexNormal = null;
        this.vertexNormalOriginal = null;
        this.vertexLabel = null;
        this.faceLabel = null;

        if (this.faceInfo) {
            for (let f: number = 0; f < this.faceCount; f++) {
                if ((this.faceInfo[f] & 0x2) === 2) {
                    return;
                }
            }
        }

        this.faceColour = null;
    }

    static mulColourLightness(hsl: number, scalar: number, faceInfo: number): number {
        if ((faceInfo & 0x2) === 2) {
            if (scalar < 0) {
                scalar = 0;
            } else if (scalar > 127) {
                scalar = 127;
            }

            return 127 - scalar;
        }

        scalar = (scalar * (hsl & 0x7f)) >> 7;

        if (scalar < 2) {
            scalar = 2;
        } else if (scalar > 126) {
            scalar = 126;
        }

        return (hsl & 0xff80) + scalar;
    }

    // this function is NOT near-clipped (helps with performance) so be careful how you use it!
    drawSimple(pitch: number, yaw: number, roll: number, eyePitch: number, eyeX: number, eyeY: number, eyeZ: number): void {
        const sinPitch: number = Pix3D.sin[pitch];
        const cosPitch: number = Pix3D.cos[pitch];

        const sinYaw: number = Pix3D.sin[yaw];
        const cosYaw: number = Pix3D.cos[yaw];

        const sinRoll: number = Pix3D.sin[roll];
        const cosRoll: number = Pix3D.cos[roll];

        const sinEyePitch: number = Pix3D.sin[eyePitch];
        const cosEyePitch: number = Pix3D.cos[eyePitch];

        const midZ: number = (eyeY * sinEyePitch + eyeZ * cosEyePitch) >> 16;

        for (let v: number = 0; v < this.vertexCount; v++) {
            let x: number = this.vertexX![v];
            let y: number = this.vertexY![v];
            let z: number = this.vertexZ![v];

            let tmp: number;
            if (roll !== 0) {
                tmp = (y * sinRoll + x * cosRoll) >> 16;
                y = (y * cosRoll - x * sinRoll) >> 16;
                x = tmp;
            }

            if (pitch !== 0) {
                tmp = (y * cosPitch - z * sinPitch) >> 16;
                z = (y * sinPitch + z * cosPitch) >> 16;
                y = tmp;
            }

            if (yaw !== 0) {
                tmp = (z * sinYaw + x * cosYaw) >> 16;
                z = (z * cosYaw - x * sinYaw) >> 16;
                x = tmp;
            }

            x += eyeX;
            y += eyeY;
            z += eyeZ;

            tmp = (y * cosEyePitch - z * sinEyePitch) >> 16;
            z = (y * sinEyePitch + z * cosEyePitch) >> 16;
            y = tmp;

            if (Model.vertexScreenX && Model.vertexScreenY && Model.vertexScreenZ) {
                Model.vertexScreenZ[v] = z - midZ;
                Model.vertexScreenX[v] = Pix3D.centerX + (((x << 9) / z) | 0);
                Model.vertexScreenY[v] = Pix3D.centerY + (((y << 9) / z) | 0);
            }

            if (this.texturedFaceCount > 0 && Model.vertexViewSpaceX && Model.vertexViewSpaceY && Model.vertexViewSpaceZ) {
                Model.vertexViewSpaceX[v] = x;
                Model.vertexViewSpaceY[v] = y;
                Model.vertexViewSpaceZ[v] = z;
            }
        }

        try {
            // try catch for example a model being drawn from 3d can crash like at baxtorian falls
            this.draw2(false, false, 0);
        } catch (err) {
            /* empty */
        }
    }

    // todo: better name, Java relies on overloads
    draw(_loopCycle: number, yaw: number, sinEyePitch: number, cosEyePitch: number, sinEyeYaw: number, cosEyeYaw: number, relativeX: number, relativeY: number, relativeZ: number, typecode: number): void {
        const zPrime: number = (relativeZ * cosEyeYaw - relativeX * sinEyeYaw) >> 16;
        const midZ: number = (relativeY * sinEyePitch + zPrime * cosEyePitch) >> 16;
        const radiusCosEyePitch: number = (this.radius * cosEyePitch) >> 16;

        const maxZ: number = midZ + radiusCosEyePitch;
        if (maxZ <= 50 || midZ >= 3500) {
            return;
        }

        const midX: number = (relativeZ * sinEyeYaw + relativeX * cosEyeYaw) >> 16;
        let leftX: number = (midX - this.radius) << 9;
        if (((leftX / maxZ) | 0) >= Pix2D.centerX2d) {
            return;
        }

        let rightX: number = (midX + this.radius) << 9;
        if (((rightX / maxZ) | 0) <= -Pix2D.centerX2d) {
            return;
        }

        const midY: number = (relativeY * cosEyePitch - zPrime * sinEyePitch) >> 16;
        const radiusSinEyePitch: number = (this.radius * sinEyePitch) >> 16;

        let bottomY: number = (midY + radiusSinEyePitch) << 9;
        if (((bottomY / maxZ) | 0) <= -Pix2D.centerY2d) {
            return;
        }

        const yPrime: number = radiusSinEyePitch + ((this.minY * cosEyePitch) >> 16);
        let topY: number = (midY - yPrime) << 9;
        if (((topY / maxZ) | 0) >= Pix2D.centerY2d) {
            return;
        }

        const radiusZ: number = radiusCosEyePitch + ((this.minY * sinEyePitch) >> 16);

        let clipped: boolean = midZ - radiusZ <= 50;
        let picking: boolean = false;

        if (typecode > 0 && Model.checkHover) {
            let z: number = midZ - radiusCosEyePitch;
            if (z <= 50) {
                z = 50;
            }

            if (midX > 0) {
                leftX = (leftX / maxZ) | 0;
                rightX = (rightX / z) | 0;
            } else {
                rightX = (rightX / maxZ) | 0;
                leftX = (leftX / z) | 0;
            }

            if (midY > 0) {
                topY = (topY / maxZ) | 0;
                bottomY = (bottomY / z) | 0;
            } else {
                bottomY = (bottomY / maxZ) | 0;
                topY = (topY / z) | 0;
            }

            const mouseX: number = Model.mouseX - Pix3D.centerX;
            const mouseY: number = Model.mouseY - Pix3D.centerY;
            if (mouseX > leftX && mouseX < rightX && mouseY > topY && mouseY < bottomY) {
                if (this.picking) {
                    Model.pickedBitsets[Model.pickedCount++] = typecode;
                } else {
                    picking = true;
                }
            }
        }

        const centerX: number = Pix3D.centerX;
        const centerY: number = Pix3D.centerY;

        let sinYaw: number = 0;
        let cosYaw: number = 0;
        if (yaw !== 0) {
            sinYaw = Pix3D.sin[yaw];
            cosYaw = Pix3D.cos[yaw];
        }

        for (let v: number = 0; v < this.vertexCount; v++) {
            let x: number = this.vertexX![v];
            let y: number = this.vertexY![v];
            let z: number = this.vertexZ![v];

            let temp: number;
            if (yaw !== 0) {
                temp = (z * sinYaw + x * cosYaw) >> 16;
                z = (z * cosYaw - x * sinYaw) >> 16;
                x = temp;
            }

            x += relativeX;
            y += relativeY;
            z += relativeZ;

            temp = (z * sinEyeYaw + x * cosEyeYaw) >> 16;
            z = (z * cosEyeYaw - x * sinEyeYaw) >> 16;
            x = temp;

            temp = (y * cosEyePitch - z * sinEyePitch) >> 16;
            z = (y * sinEyePitch + z * cosEyePitch) >> 16;
            y = temp;

            if (Model.vertexScreenZ) {
                Model.vertexScreenZ[v] = z - midZ;
            }

            if (z >= 50 && Model.vertexScreenX && Model.vertexScreenY) {
                Model.vertexScreenX[v] = centerX + (((x << 9) / z) | 0);
                Model.vertexScreenY[v] = centerY + (((y << 9) / z) | 0);
            } else if (Model.vertexScreenX) {
                Model.vertexScreenX[v] = -5000;
                clipped = true;
            }

            if ((clipped || this.texturedFaceCount > 0) && Model.vertexViewSpaceX && Model.vertexViewSpaceY && Model.vertexViewSpaceZ) {
                Model.vertexViewSpaceX[v] = x;
                Model.vertexViewSpaceY[v] = y;
                Model.vertexViewSpaceZ[v] = z;
            }
        }

        try {
            // try catch for example a model being drawn from 3d can crash like at baxtorian falls
            this.draw2(clipped, picking, typecode);
        } catch (err) {
            /* empty */
        }
    }

    // todo: better name, Java relies on overloads
    private draw2(clipped: boolean, picking: boolean, typecode: number, wireframe: boolean = false): void {
        for (let depth: number = 0; depth < this.maxDepth; depth++) {
            if (Model.tmpDepthFaceCount) {
                Model.tmpDepthFaceCount[depth] = 0;
            }
        }

        for (let f: number = 0; f < this.faceCount; f++) {
            if (this.faceInfo && this.faceInfo[f] === -1) {
                continue;
            }

            if (Model.vertexScreenX && Model.vertexScreenY && Model.vertexScreenZ && Model.tmpDepthFaces && Model.tmpDepthFaceCount) {
                const a: number = this.faceVertexA![f];
                const b: number = this.faceVertexB![f];
                const c: number = this.faceVertexC![f];

                const xA: number = Model.vertexScreenX[a];
                const xB: number = Model.vertexScreenX[b];
                const xC: number = Model.vertexScreenX[c];

                const yA: number = Model.vertexScreenY[a];
                const yB: number = Model.vertexScreenY[b];
                const yC: number = Model.vertexScreenY[c];

                const zA: number = Model.vertexScreenZ[a];
                const zB: number = Model.vertexScreenZ[b];
                const zC: number = Model.vertexScreenZ[c];

                if (clipped && (xA === -5000 || xB === -5000 || xC === -5000)) {
                    if (Model.faceNearClipped) {
                        Model.faceNearClipped[f] = true;
                    }

                    if (Model.tmpDepthFaces && Model.tmpDepthFaceCount) {
                        const depthAverage: number = (((zA + zB + zC) / 3) | 0) + this.minDepth;
                        Model.tmpDepthFaces[depthAverage][Model.tmpDepthFaceCount[depthAverage]++] = f;
                    }
                } else {
                    if (picking && this.pointWithinTriangle(Model.mouseX, Model.mouseY, yA, yB, yC, xA, xB, xC)) {
                        Model.pickedBitsets[Model.pickedCount++] = typecode;
                        picking = false;
                    }

                    const dxAB: number = xA - xB;
                    const dyAB: number = yA - yB;
                    const dxCB: number = xC - xB;
                    const dyCB: number = yC - yB;

                    if (dxAB * dyCB - dyAB * dxCB <= 0) {
                        continue;
                    }

                    if (Model.faceNearClipped) {
                        Model.faceNearClipped[f] = false;
                    }
                    if (Model.faceClippedX) {
                        Model.faceClippedX[f] = xA < 0 || xB < 0 || xC < 0 || xA > Pix2D.boundX || xB > Pix2D.boundX || xC > Pix2D.boundX;
                    }

                    if (Model.tmpDepthFaces && Model.tmpDepthFaceCount) {
                        const depthAverage: number = (((zA + zB + zC) / 3) | 0) + this.minDepth;
                        Model.tmpDepthFaces[depthAverage][Model.tmpDepthFaceCount[depthAverage]++] = f;
                    }
                }
            }
        }

        if (!this.facePriority && Model.tmpDepthFaceCount) {
            for (let depth: number = this.maxDepth - 1; depth >= 0; depth--) {
                const count: number = Model.tmpDepthFaceCount[depth];
                if (count <= 0) {
                    continue;
                }

                if (Model.tmpDepthFaces) {
                    const faces: Int32Array = Model.tmpDepthFaces[depth];
                    for (let f: number = 0; f < count; f++) {
                        try {
                            this.drawFace(faces[f], wireframe);
                        } catch (e) {
                            // chrome's V8 optimizer hates us
                        }
                    }
                }
            }

            return;
        }

        for (let priority: number = 0; priority < 12; priority++) {
            if (Model.tmpPriorityFaceCount && Model.tmpPriorityDepthSum) {
                Model.tmpPriorityFaceCount[priority] = 0;
                Model.tmpPriorityDepthSum[priority] = 0;
            }
        }

        if (Model.tmpDepthFaceCount) {
            for (let depth: number = this.maxDepth - 1; depth >= 0; depth--) {
                const faceCount: number = Model.tmpDepthFaceCount[depth];

                if (faceCount > 0 && Model.tmpDepthFaces) {
                    const faces: Int32Array = Model.tmpDepthFaces[depth];

                    for (let i: number = 0; i < faceCount; i++) {
                        if (this.facePriority && Model.tmpPriorityFaceCount && Model.tmpPriorityFaces) {
                            const priorityDepth: number = faces[i];
                            const priorityFace: number = this.facePriority[priorityDepth];
                            const priorityFaceCount: number = Model.tmpPriorityFaceCount[priorityFace]++;

                            Model.tmpPriorityFaces[priorityFace][priorityFaceCount] = priorityDepth;

                            if (priorityFace < 10 && Model.tmpPriorityDepthSum) {
                                Model.tmpPriorityDepthSum[priorityFace] += depth;
                            } else if (priorityFace === 10 && Model.tmpPriority10FaceDepth) {
                                Model.tmpPriority10FaceDepth[priorityFaceCount] = depth;
                            } else if (Model.tmpPriority11FaceDepth) {
                                Model.tmpPriority11FaceDepth[priorityFaceCount] = depth;
                            }
                        }
                    }
                }
            }
        }

        let averagePriorityDepthSum1_2: number = 0;
        if (Model.tmpPriorityFaceCount && Model.tmpPriorityDepthSum && (Model.tmpPriorityFaceCount[1] > 0 || Model.tmpPriorityFaceCount[2] > 0)) {
            averagePriorityDepthSum1_2 = ((Model.tmpPriorityDepthSum[1] + Model.tmpPriorityDepthSum[2]) / (Model.tmpPriorityFaceCount[1] + Model.tmpPriorityFaceCount[2])) | 0;
        }

        let averagePriorityDepthSum3_4: number = 0;
        if (Model.tmpPriorityFaceCount && Model.tmpPriorityDepthSum && (Model.tmpPriorityFaceCount[3] > 0 || Model.tmpPriorityFaceCount[4] > 0)) {
            averagePriorityDepthSum3_4 = ((Model.tmpPriorityDepthSum[3] + Model.tmpPriorityDepthSum[4]) / (Model.tmpPriorityFaceCount[3] + Model.tmpPriorityFaceCount[4])) | 0;
        }

        let averagePriorityDepthSum6_8: number = 0;
        if (Model.tmpPriorityFaceCount && Model.tmpPriorityDepthSum && (Model.tmpPriorityFaceCount[6] > 0 || Model.tmpPriorityFaceCount[8] > 0)) {
            averagePriorityDepthSum6_8 = ((Model.tmpPriorityDepthSum[6] + Model.tmpPriorityDepthSum[8]) / (Model.tmpPriorityFaceCount[6] + Model.tmpPriorityFaceCount[8])) | 0;
        }

        if (Model.tmpPriorityFaceCount && Model.tmpPriorityFaces) {
            let priorityFace: number = 0;
            let priorityFaceCount: number = Model.tmpPriorityFaceCount[10];

            let priorityFaces: Int32Array = Model.tmpPriorityFaces[10];
            let priorityFaceDepths: Int32Array | null = Model.tmpPriority10FaceDepth;
            if (priorityFace === priorityFaceCount) {
                priorityFace = 0;
                priorityFaceCount = Model.tmpPriorityFaceCount[11];
                priorityFaces = Model.tmpPriorityFaces[11];
                priorityFaceDepths = Model.tmpPriority11FaceDepth;
            }

            let priorityDepth: number;
            if (priorityFace < priorityFaceCount && priorityFaceDepths) {
                priorityDepth = priorityFaceDepths[priorityFace];
            } else {
                priorityDepth = -1000;
            }

            for (let priority: number = 0; priority < 10; priority++) {
                while (priority === 0 && priorityDepth > averagePriorityDepthSum1_2) {
                    try {
                        this.drawFace(priorityFaces[priorityFace++], wireframe);

                        if (priorityFace === priorityFaceCount && priorityFaces !== Model.tmpPriorityFaces[11]) {
                            priorityFace = 0;
                            priorityFaceCount = Model.tmpPriorityFaceCount[11];
                            priorityFaces = Model.tmpPriorityFaces[11];
                            priorityFaceDepths = Model.tmpPriority11FaceDepth;
                        }

                        if (priorityFace < priorityFaceCount && priorityFaceDepths) {
                            priorityDepth = priorityFaceDepths[priorityFace];
                        } else {
                            priorityDepth = -1000;
                        }
                    } catch (e) {
                        // chrome's V8 optimizer hates us
                    }
                }

                while (priority === 3 && priorityDepth > averagePriorityDepthSum3_4) {
                    try {
                        this.drawFace(priorityFaces[priorityFace++], wireframe);

                        if (priorityFace === priorityFaceCount && priorityFaces !== Model.tmpPriorityFaces[11]) {
                            priorityFace = 0;
                            priorityFaceCount = Model.tmpPriorityFaceCount[11];
                            priorityFaces = Model.tmpPriorityFaces[11];
                            priorityFaceDepths = Model.tmpPriority11FaceDepth;
                        }

                        if (priorityFace < priorityFaceCount && priorityFaceDepths) {
                            priorityDepth = priorityFaceDepths[priorityFace];
                        } else {
                            priorityDepth = -1000;
                        }
                    } catch (e) {
                        // chrome's V8 optimizer hates us
                    }
                }

                while (priority === 5 && priorityDepth > averagePriorityDepthSum6_8) {
                    try {
                        this.drawFace(priorityFaces[priorityFace++], wireframe);

                        if (priorityFace === priorityFaceCount && priorityFaces !== Model.tmpPriorityFaces[11]) {
                            priorityFace = 0;
                            priorityFaceCount = Model.tmpPriorityFaceCount[11];
                            priorityFaces = Model.tmpPriorityFaces[11];
                            priorityFaceDepths = Model.tmpPriority11FaceDepth;
                        }

                        if (priorityFace < priorityFaceCount && priorityFaceDepths) {
                            priorityDepth = priorityFaceDepths[priorityFace];
                        } else {
                            priorityDepth = -1000;
                        }
                    } catch (e) {
                        // chrome's V8 optimizer hates us
                    }
                }

                const count: number = Model.tmpPriorityFaceCount[priority];
                const faces: Int32Array = Model.tmpPriorityFaces[priority];

                for (let i: number = 0; i < count; i++) {
                    try {
                        this.drawFace(faces[i], wireframe);
                    } catch (e) {
                        // chrome's V8 optimizer hates us
                    }
                }
            }

            while (priorityDepth !== -1000) {
                try {
                    this.drawFace(priorityFaces[priorityFace++], wireframe);

                    if (priorityFace === priorityFaceCount && priorityFaces !== Model.tmpPriorityFaces[11]) {
                        priorityFace = 0;
                        priorityFaces = Model.tmpPriorityFaces[11];
                        priorityFaceCount = Model.tmpPriorityFaceCount[11];
                        priorityFaceDepths = Model.tmpPriority11FaceDepth;
                    }

                    if (priorityFace < priorityFaceCount && priorityFaceDepths) {
                        priorityDepth = priorityFaceDepths[priorityFace];
                    } else {
                        priorityDepth = -1000;
                    }
                } catch (e) {
                    // chrome's V8 optimizer hates us
                }
            }
        }
    }

    private drawFace(face: number, wireframe: boolean = false): void {
        if (Model.faceNearClipped && Model.faceNearClipped[face]) {
            this.drawNearClippedFace(face, wireframe);
            return;
        }

        const a: number = this.faceVertexA![face];
        const b: number = this.faceVertexB![face];
        const c: number = this.faceVertexC![face];

        if (Model.faceClippedX) {
            Pix3D.clipX = Model.faceClippedX[face];
        }

        if (!this.faceAlpha) {
            Pix3D.alpha = 0;
        } else {
            Pix3D.alpha = this.faceAlpha[face];
        }

        let type: number;
        if (!this.faceInfo) {
            type = 0;
        } else {
            type = this.faceInfo[face] & 0x3;
        }

        if (wireframe && Model.vertexScreenX && Model.vertexScreenY && this.faceColourA && this.faceColourB && this.faceColourC) {
            Pix3D.drawLine(Model.vertexScreenX[a], Model.vertexScreenY[a], Model.vertexScreenX[b], Model.vertexScreenY[b], Pix3D.hslPal[this.faceColourA[face]]);
            Pix3D.drawLine(Model.vertexScreenX[b], Model.vertexScreenY[b], Model.vertexScreenX[c], Model.vertexScreenY[c], Pix3D.hslPal[this.faceColourB[face]]);
            Pix3D.drawLine(Model.vertexScreenX[c], Model.vertexScreenY[c], Model.vertexScreenX[a], Model.vertexScreenY[a], Pix3D.hslPal[this.faceColourC[face]]);
        } else if (type === 0 && this.faceColourA && this.faceColourB && this.faceColourC && Model.vertexScreenX && Model.vertexScreenY) {
            Pix3D.fillGouraudTriangle(
                Model.vertexScreenX[a],
                Model.vertexScreenX[b],
                Model.vertexScreenX[c],
                Model.vertexScreenY[a],
                Model.vertexScreenY[b],
                Model.vertexScreenY[c],
                this.faceColourA[face],
                this.faceColourB[face],
                this.faceColourC[face]
            );
        } else if (type === 1 && this.faceColourA && Model.vertexScreenX && Model.vertexScreenY) {
            Pix3D.fillTriangle(Model.vertexScreenX[a], Model.vertexScreenX[b], Model.vertexScreenX[c], Model.vertexScreenY[a], Model.vertexScreenY[b], Model.vertexScreenY[c], Pix3D.hslPal[this.faceColourA[face]]);
        } else if (type === 2 && this.faceInfo && this.faceColour && this.faceColourA && this.faceColourB && this.faceColourC && Model.vertexScreenX && Model.vertexScreenY && Model.vertexViewSpaceX && Model.vertexViewSpaceY && Model.vertexViewSpaceZ) {
            const texturedFace: number = this.faceInfo[face] >> 2;
            const tA: number = this.texturedVertexA![texturedFace];
            const tB: number = this.texturedVertexB![texturedFace];
            const tC: number = this.texturedVertexC![texturedFace];
            Pix3D.fillTexturedTriangle(
                Model.vertexScreenX[a],
                Model.vertexScreenX[b],
                Model.vertexScreenX[c],
                Model.vertexScreenY[a],
                Model.vertexScreenY[b],
                Model.vertexScreenY[c],
                this.faceColourA[face],
                this.faceColourB[face],
                this.faceColourC[face],
                Model.vertexViewSpaceX[tA],
                Model.vertexViewSpaceY[tA],
                Model.vertexViewSpaceZ[tA],
                Model.vertexViewSpaceX[tB],
                Model.vertexViewSpaceX[tC],
                Model.vertexViewSpaceY[tB],
                Model.vertexViewSpaceY[tC],
                Model.vertexViewSpaceZ[tB],
                Model.vertexViewSpaceZ[tC],
                this.faceColour[face]
            );
        } else if (type === 3 && this.faceInfo && this.faceColour && this.faceColourA && Model.vertexScreenX && Model.vertexScreenY && Model.vertexViewSpaceX && Model.vertexViewSpaceY && Model.vertexViewSpaceZ) {
            const texturedFace: number = this.faceInfo[face] >> 2;
            const tA: number = this.texturedVertexA![texturedFace];
            const tB: number = this.texturedVertexB![texturedFace];
            const tC: number = this.texturedVertexC![texturedFace];
            Pix3D.fillTexturedTriangle(
                Model.vertexScreenX[a],
                Model.vertexScreenX[b],
                Model.vertexScreenX[c],
                Model.vertexScreenY[a],
                Model.vertexScreenY[b],
                Model.vertexScreenY[c],
                this.faceColourA[face],
                this.faceColourA[face],
                this.faceColourA[face],
                Model.vertexViewSpaceX[tA],
                Model.vertexViewSpaceY[tA],
                Model.vertexViewSpaceZ[tA],
                Model.vertexViewSpaceX[tB],
                Model.vertexViewSpaceX[tC],
                Model.vertexViewSpaceY[tB],
                Model.vertexViewSpaceY[tC],
                Model.vertexViewSpaceZ[tB],
                Model.vertexViewSpaceZ[tC],
                this.faceColour[face]
            );
        }
    }

    private drawNearClippedFace(face: number, wireframe: boolean = false): void {
        let elements: number = 0;

        if (Model.vertexViewSpaceZ) {
            const centerX: number = Pix3D.centerX;
            const centerY: number = Pix3D.centerY;

            const a: number = this.faceVertexA![face];
            const b: number = this.faceVertexB![face];
            const c: number = this.faceVertexC![face];

            const zA: number = Model.vertexViewSpaceZ[a];
            const zB: number = Model.vertexViewSpaceZ[b];
            const zC: number = Model.vertexViewSpaceZ[c];

            if (zA >= 50 && Model.vertexScreenX && Model.vertexScreenY && this.faceColourA) {
                Model.clippedX[elements] = Model.vertexScreenX[a];
                Model.clippedY[elements] = Model.vertexScreenY[a];
                Model.clippedColour[elements++] = this.faceColourA[face];
            } else if (Model.vertexViewSpaceX && Model.vertexViewSpaceY && this.faceColourA) {
                const xA: number = Model.vertexViewSpaceX[a];
                const yA: number = Model.vertexViewSpaceY[a];
                const colorA: number = this.faceColourA[face];

                if (zC >= 50 && this.faceColourC) {
                    const scalar: number = (50 - zA) * Pix3D.reciprocal16[zC - zA];
                    Model.clippedX[elements] = centerX + ((((xA + (((Model.vertexViewSpaceX[c] - xA) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedY[elements] = centerY + ((((yA + (((Model.vertexViewSpaceY[c] - yA) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedColour[elements++] = colorA + (((this.faceColourC[face] - colorA) * scalar) >> 16);
                }

                if (zB >= 50 && this.faceColourB) {
                    const scalar: number = (50 - zA) * Pix3D.reciprocal16[zB - zA];
                    Model.clippedX[elements] = centerX + ((((xA + (((Model.vertexViewSpaceX[b] - xA) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedY[elements] = centerY + ((((yA + (((Model.vertexViewSpaceY[b] - yA) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedColour[elements++] = colorA + (((this.faceColourB[face] - colorA) * scalar) >> 16);
                }
            }

            if (zB >= 50 && Model.vertexScreenX && Model.vertexScreenY && this.faceColourB) {
                Model.clippedX[elements] = Model.vertexScreenX[b];
                Model.clippedY[elements] = Model.vertexScreenY[b];
                Model.clippedColour[elements++] = this.faceColourB[face];
            } else if (Model.vertexViewSpaceX && Model.vertexViewSpaceY && this.faceColourB) {
                const xB: number = Model.vertexViewSpaceX[b];
                const yB: number = Model.vertexViewSpaceY[b];
                const colorB: number = this.faceColourB[face];

                if (zA >= 50 && this.faceColourA) {
                    const scalar: number = (50 - zB) * Pix3D.reciprocal16[zA - zB];
                    Model.clippedX[elements] = centerX + ((((xB + (((Model.vertexViewSpaceX[a] - xB) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedY[elements] = centerY + ((((yB + (((Model.vertexViewSpaceY[a] - yB) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedColour[elements++] = colorB + (((this.faceColourA[face] - colorB) * scalar) >> 16);
                }

                if (zC >= 50 && this.faceColourC) {
                    const scalar: number = (50 - zB) * Pix3D.reciprocal16[zC - zB];
                    Model.clippedX[elements] = centerX + ((((xB + (((Model.vertexViewSpaceX[c] - xB) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedY[elements] = centerY + ((((yB + (((Model.vertexViewSpaceY[c] - yB) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedColour[elements++] = colorB + (((this.faceColourC[face] - colorB) * scalar) >> 16);
                }
            }

            if (zC >= 50 && Model.vertexScreenX && Model.vertexScreenY && this.faceColourC) {
                Model.clippedX[elements] = Model.vertexScreenX[c];
                Model.clippedY[elements] = Model.vertexScreenY[c];
                Model.clippedColour[elements++] = this.faceColourC[face];
            } else if (Model.vertexViewSpaceX && Model.vertexViewSpaceY && this.faceColourC) {
                const xC: number = Model.vertexViewSpaceX[c];
                const yC: number = Model.vertexViewSpaceY[c];
                const colorC: number = this.faceColourC[face];

                if (zB >= 50 && this.faceColourB) {
                    const scalar: number = (50 - zC) * Pix3D.reciprocal16[zB - zC];
                    Model.clippedX[elements] = centerX + ((((xC + (((Model.vertexViewSpaceX[b] - xC) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedY[elements] = centerY + ((((yC + (((Model.vertexViewSpaceY[b] - yC) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedColour[elements++] = colorC + (((this.faceColourB[face] - colorC) * scalar) >> 16);
                }

                if (zA >= 50 && this.faceColourA) {
                    const scalar: number = (50 - zC) * Pix3D.reciprocal16[zA - zC];
                    Model.clippedX[elements] = centerX + ((((xC + (((Model.vertexViewSpaceX[a] - xC) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedY[elements] = centerY + ((((yC + (((Model.vertexViewSpaceY[a] - yC) * scalar) >> 16)) << 9) / 50) | 0);
                    Model.clippedColour[elements++] = colorC + (((this.faceColourA[face] - colorC) * scalar) >> 16);
                }
            }
        }

        const x0: number = Model.clippedX[0];
        const x1: number = Model.clippedX[1];
        const x2: number = Model.clippedX[2];
        const y0: number = Model.clippedY[0];
        const y1: number = Model.clippedY[1];
        const y2: number = Model.clippedY[2];

        if ((x0 - x1) * (y2 - y1) - (y0 - y1) * (x2 - x1) <= 0) {
            return;
        }

        Pix3D.clipX = false;

        if (elements === 3) {
            if (x0 < 0 || x1 < 0 || x2 < 0 || x0 > Pix2D.boundX || x1 > Pix2D.boundX || x2 > Pix2D.boundX) {
                Pix3D.clipX = true;
            }

            let type: number;
            if (!this.faceInfo) {
                type = 0;
            } else {
                type = this.faceInfo[face] & 0x3;
            }

            if (wireframe) {
                Pix3D.drawLine(x0, x1, y0, y1, Model.clippedColour[0]);
                Pix3D.drawLine(x1, x2, y1, y2, Model.clippedColour[1]);
                Pix3D.drawLine(x2, x0, y2, y0, Model.clippedColour[2]);
            } else if (type === 0) {
                Pix3D.fillGouraudTriangle(x0, x1, x2, y0, y1, y2, Model.clippedColour[0], Model.clippedColour[1], Model.clippedColour[2]);
            } else if (type === 1 && this.faceColourA) {
                Pix3D.fillTriangle(x0, x1, x2, y0, y1, y2, Pix3D.hslPal[this.faceColourA[face]]);
            } else if (type === 2 && this.faceInfo && this.faceColour && Model.vertexViewSpaceX && Model.vertexViewSpaceY && Model.vertexViewSpaceZ) {
                const texturedFace: number = this.faceInfo[face] >> 2;
                const tA: number = this.texturedVertexA![texturedFace];
                const tB: number = this.texturedVertexB![texturedFace];
                const tC: number = this.texturedVertexC![texturedFace];
                Pix3D.fillTexturedTriangle(
                    x0,
                    x1,
                    x2,
                    y0,
                    y1,
                    y2,
                    Model.clippedColour[0],
                    Model.clippedColour[1],
                    Model.clippedColour[2],
                    Model.vertexViewSpaceX[tA],
                    Model.vertexViewSpaceY[tA],
                    Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB],
                    Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB],
                    Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB],
                    Model.vertexViewSpaceZ[tC],
                    this.faceColour[face]
                );
            } else if (type === 3 && this.faceInfo && this.faceColour && this.faceColourA && Model.vertexViewSpaceX && Model.vertexViewSpaceY && Model.vertexViewSpaceZ) {
                const texturedFace: number = this.faceInfo[face] >> 2;
                const tA: number = this.texturedVertexA![texturedFace];
                const tB: number = this.texturedVertexB![texturedFace];
                const tC: number = this.texturedVertexC![texturedFace];
                Pix3D.fillTexturedTriangle(
                    x0,
                    x1,
                    x2,
                    y0,
                    y1,
                    y2,
                    this.faceColourA[face],
                    this.faceColourA[face],
                    this.faceColourA[face],
                    Model.vertexViewSpaceX[tA],
                    Model.vertexViewSpaceY[tA],
                    Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB],
                    Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB],
                    Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB],
                    Model.vertexViewSpaceZ[tC],
                    this.faceColour[face]
                );
            }
        } else if (elements === 4) {
            if (x0 < 0 || x1 < 0 || x2 < 0 || x0 > Pix2D.boundX || x1 > Pix2D.boundX || x2 > Pix2D.boundX || Model.clippedX[3] < 0 || Model.clippedX[3] > Pix2D.boundX) {
                Pix3D.clipX = true;
            }

            let type: number;
            if (!this.faceInfo) {
                type = 0;
            } else {
                type = this.faceInfo[face] & 0x3;
            }

            if (wireframe) {
                Pix3D.drawLine(x0, x1, y0, y1, Model.clippedColour[0]);
                Pix3D.drawLine(x1, x2, y1, y2, Model.clippedColour[1]);
                Pix3D.drawLine(x2, Model.clippedX[3], y2, Model.clippedY[3], Model.clippedColour[2]);
                Pix3D.drawLine(Model.clippedX[3], x0, Model.clippedY[3], y0, Model.clippedColour[3]);
            } else if (type === 0) {
                Pix3D.fillGouraudTriangle(x0, x1, x2, y0, y1, y2, Model.clippedColour[0], Model.clippedColour[1], Model.clippedColour[2]);
                Pix3D.fillGouraudTriangle(x0, x2, Model.clippedX[3], y0, y2, Model.clippedY[3], Model.clippedColour[0], Model.clippedColour[2], Model.clippedColour[3]);
            } else if (type === 1) {
                if (this.faceColourA) {
                    const colorA: number = Pix3D.hslPal[this.faceColourA[face]];
                    Pix3D.fillTriangle(x0, x1, x2, y0, y1, y2, colorA);
                    Pix3D.fillTriangle(x0, x2, Model.clippedX[3], y0, y2, Model.clippedY[3], colorA);
                }
            } else if (type === 2 && this.faceInfo && this.faceColour && Model.vertexViewSpaceX && Model.vertexViewSpaceY && Model.vertexViewSpaceZ) {
                const texturedFace: number = this.faceInfo[face] >> 2;
                const tA: number = this.texturedVertexA![texturedFace];
                const tB: number = this.texturedVertexB![texturedFace];
                const tC: number = this.texturedVertexC![texturedFace];
                Pix3D.fillTexturedTriangle(
                    x0,
                    x1,
                    x2,
                    y0,
                    y1,
                    y2,
                    Model.clippedColour[0],
                    Model.clippedColour[1],
                    Model.clippedColour[2],
                    Model.vertexViewSpaceX[tA],
                    Model.vertexViewSpaceY[tA],
                    Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB],
                    Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB],
                    Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB],
                    Model.vertexViewSpaceZ[tC],
                    this.faceColour[face]
                );
                Pix3D.fillTexturedTriangle(
                    x0,
                    x2,
                    Model.clippedX[3],
                    y0,
                    y2,
                    Model.clippedY[3],
                    Model.clippedColour[0],
                    Model.clippedColour[2],
                    Model.clippedColour[3],
                    Model.vertexViewSpaceX[tA],
                    Model.vertexViewSpaceY[tA],
                    Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB],
                    Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB],
                    Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB],
                    Model.vertexViewSpaceZ[tC],
                    this.faceColour[face]
                );
            } else if (type === 3 && this.faceInfo && this.faceColour && this.faceColourA && Model.vertexViewSpaceX && Model.vertexViewSpaceY && Model.vertexViewSpaceZ) {
                const texturedFace: number = this.faceInfo[face] >> 2;
                const tA: number = this.texturedVertexA![texturedFace];
                const tB: number = this.texturedVertexB![texturedFace];
                const tC: number = this.texturedVertexC![texturedFace];
                Pix3D.fillTexturedTriangle(
                    x0,
                    x1,
                    x2,
                    y0,
                    y1,
                    y2,
                    this.faceColourA[face],
                    this.faceColourA[face],
                    this.faceColourA[face],
                    Model.vertexViewSpaceX[tA],
                    Model.vertexViewSpaceY[tA],
                    Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB],
                    Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB],
                    Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB],
                    Model.vertexViewSpaceZ[tC],
                    this.faceColour[face]
                );
                Pix3D.fillTexturedTriangle(
                    x0,
                    x2,
                    Model.clippedX[3],
                    y0,
                    y2,
                    Model.clippedY[3],
                    this.faceColourA[face],
                    this.faceColourA[face],
                    this.faceColourA[face],
                    Model.vertexViewSpaceX[tA],
                    Model.vertexViewSpaceY[tA],
                    Model.vertexViewSpaceZ[tA],
                    Model.vertexViewSpaceX[tB],
                    Model.vertexViewSpaceX[tC],
                    Model.vertexViewSpaceY[tB],
                    Model.vertexViewSpaceY[tC],
                    Model.vertexViewSpaceZ[tB],
                    Model.vertexViewSpaceZ[tC],
                    this.faceColour[face]
                );
            }
        }
    }

    private pointWithinTriangle(x: number, y: number, yA: number, yB: number, yC: number, xA: number, xB: number, xC: number): boolean {
        if (y < yA && y < yB && y < yC) {
            return false;
        } else if (y > yA && y > yB && y > yC) {
            return false;
        } else if (x < xA && x < xB && x < xC) {
            return false;
        } else {
            return x <= xA || x <= xB || x <= xC;
        }
    }
}
