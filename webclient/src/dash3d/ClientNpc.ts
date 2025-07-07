import NpcType from '#/config/NpcType.js';
import SeqType from '#/config/SeqType.js';
import SpotAnimType from '#/config/SpotAnimType.js';

import ClientEntity from '#/dash3d/ClientEntity.js';

import Model from '#/dash3d/Model.js';

export const enum NpcUpdate {
    DAMAGE2 = 0x1,
    ANIM = 0x2,
    FACE_ENTITY = 0x4,
    SAY = 0x8,
    DAMAGE = 0x10,
    CHANGE_TYPE = 0x20,
    SPOTANIM = 0x40,
    FACE_COORD = 0x80
}

export default class ClientNpc extends ClientEntity {
    type: NpcType | null = null;

    getModel(): Model | null {
        if (this.type == null) {
            return null;
        }

        let model = this.getAnimatedModel();
        if (model == null) {
            return null;
        }

        this.height = model.minY;

        if (this.spotanimId != -1 && this.spotanimFrame != -1) {
            let spot = SpotAnimType.types[this.spotanimId];
            let spotModel = spot.getModel();

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

        if (this.type.size == 1) {
            model.picking = true;
        }

        return model;
    }

    private getAnimatedModel(): Model | null {
        if (!this.type) {
            return null;
        }

        if (this.primarySeqId < 0 || this.primarySeqDelay != 0) {
            const secondarySeq = SeqType.types[this.secondarySeqId];
            let secondaryTransform = -1;
            if (this.secondarySeqId >= 0 && secondarySeq.frames) {
                secondaryTransform = secondarySeq.frames[this.secondarySeqFrame];
            }

            return this.type.getModel(secondaryTransform, -1, null);
        } else {
            const primarySeq = SeqType.types[this.primarySeqId];
            let primaryTransform = -1;
            if (primarySeq.frames) {
                primaryTransform = primarySeq.frames[this.primarySeqFrame];
            }

            const secondarySeq = SeqType.types[this.secondarySeqId];
            let secondaryTransform = -1;
            if (this.secondarySeqId >= 0 && this.secondarySeqId != this.readyanim && secondarySeq.frames) {
                secondaryTransform = secondarySeq.frames[this.secondarySeqFrame];
            }

            return this.type.getModel(primaryTransform, secondaryTransform, primarySeq.walkmerge);
        }
    }

    isVisible(): boolean {
        return this.type !== null;
    }
}
