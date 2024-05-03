import Packet from '#jagex2/io/Packet.js';
import { loadOrder, listFiles } from '#lostcity/util/NameMap.js';
import Jagfile from '#jagex2/io/Jagfile.js';
import { AnimPack, BasePack, ModelPack, shouldBuildFileAny } from '#lostcity/util/PackFile.js';

export function packClientModel() {
    if (!shouldBuildFileAny('data/src/models', 'data/pack/client/models')) {
        return;
    }

    /* order:
    'base_label.dat',  'ob_point1.dat',
    'ob_point2.dat',   'ob_point3.dat',
    'ob_point4.dat',   'ob_point5.dat',
    'ob_head.dat',     'base_head.dat',
    'frame_head.dat',  'frame_tran1.dat',
    'frame_tran2.dat', 'ob_vertex1.dat',
    'ob_vertex2.dat',  'frame_del.dat',
    'base_type.dat',   'ob_face1.dat',
    'ob_face2.dat',    'ob_face3.dat',
    'ob_face4.dat',    'ob_face5.dat',
    'ob_axis.dat'
    */

    console.log('Packing models.jag');
    //console.time('models.jag');

    const modelOrder = loadOrder('data/src/pack/model.order');
    const animOrder = loadOrder('data/src/pack/anim.order');
    const baseOrder = loadOrder('data/src/pack/base.order');

    const files = listFiles('data/src/models');

    // ----

    const base_head = Packet.alloc(1);
    const base_type = Packet.alloc(1);
    const base_label = Packet.alloc(2);

    {
        base_head.p2(baseOrder.length);
        let highest = 0;
        for (let i = 0; i < baseOrder.length; i++) {
            const id = baseOrder[i];
            if (id > highest) {
                highest = id;
            }
        }
        base_head.p2(highest);

        for (let i = 0; i < baseOrder.length; i++) {
            const id = baseOrder[i];
            const name = BasePack.getById(id);

            const file = files.find(file => file.endsWith(`${name}.base`));
            if (!file) {
                console.log('missing base file', id, name);
                continue;
            }

            const data = Packet.load(file);

            data.pos = data.data.length - 4;
            const typeLength = data.g2();
            const labelLength = data.g2();

            base_head.p2(id);
            base_head.p1(typeLength);

            data.pos = 0;

            const p_typeLength = new Uint8Array(typeLength);
            data.gdata(p_typeLength, 0, p_typeLength.length);
            base_type.pdata(p_typeLength, 0, p_typeLength.length);

            const p_labelLength = new Uint8Array(labelLength);
            data.gdata(p_labelLength, 0, p_labelLength.length);
            base_label.pdata(p_labelLength, 0, p_labelLength.length);
        }

        // base_head.save('dump/base_head.dat');
        // base_type.save('dump/base_type.dat');
        // base_label.save('dump/base_label.dat');
    }

    // ----

    const frame_head = Packet.alloc(3);
    const frame_tran1 = Packet.alloc(4);
    const frame_tran2 = Packet.alloc(4);
    const frame_del = Packet.alloc(2);

    {
        frame_head.p2(animOrder.length);
        let highest = 0;
        for (let i = 0; i < animOrder.length; i++) {
            const id = animOrder[i];
            if (id > highest) {
                highest = id;
            }
        }
        frame_head.p2(highest);

        for (let i = 0; i < animOrder.length; i++) {
            const id = animOrder[i];
            const name = AnimPack.getById(id);

            const file = files.find(file => file.endsWith(`${name}.frame`));
            if (!file) {
                console.log('missing frame file', id, name);
                continue;
            }

            const data = Packet.load(file);

            data.pos = data.data.length - 8;
            const headLength = data.g2();
            const tran1Length = data.g2();
            const tran2Length = data.g2();
            const delLength = data.g2();

            data.pos = 0;

            const p_headLength = new Uint8Array(headLength);
            data.gdata(p_headLength, 0, p_headLength.length);

            const p_tran1Length = new Uint8Array(tran1Length);
            data.gdata(p_tran1Length, 0, p_tran1Length.length);

            const p_tran2Length = new Uint8Array(tran2Length);
            data.gdata(p_tran2Length, 0, p_tran2Length.length);

            const p_delLength = new Uint8Array(delLength);
            data.gdata(p_delLength, 0, p_delLength.length);


            frame_head.pdata(p_headLength, 0, p_headLength.length);
            frame_tran1.pdata(p_tran1Length, 0, p_tran1Length.length);
            frame_tran2.pdata(p_tran2Length, 0, p_tran2Length.length);
            frame_del.pdata(p_delLength, 0, p_delLength.length);
        }

        // frame_head.save('dump/frame_head.dat');
        // frame_tran1.save('dump/frame_tran1.dat');
        // frame_tran2.save('dump/frame_tran2.dat');
        // frame_del.save('dump/frame_del.dat');
    }

    // ----

    const ob_head = Packet.alloc(3);
    const ob_face1 = Packet.alloc(5);
    const ob_face2 = Packet.alloc(4);
    const ob_face3 = Packet.alloc(4);
    const ob_face4 = Packet.alloc(3);
    const ob_face5 = Packet.alloc(3);
    const ob_point1 = Packet.alloc(4);
    const ob_point2 = Packet.alloc(4);
    const ob_point3 = Packet.alloc(4);
    const ob_point4 = Packet.alloc(4);
    const ob_point5 = Packet.alloc(4);
    const ob_vertex1 = Packet.alloc(5);
    const ob_vertex2 = Packet.alloc(4);
    const ob_axis = Packet.alloc(3);

    {
        ob_head.p2(modelOrder.length);

        for (let i = 0; i < modelOrder.length; i++) {
            const id = modelOrder[i];
            const name = ModelPack.getById(id);

            const file = files.find(file => file.endsWith(`${name}.ob2`));
            if (!file) {
                console.log('missing ob2 file', id, name);
                continue;
            }

            const data = Packet.load(file);

            data.pos = data.data.length - 18;
            const vertexCount = data.g2();
            const faceCount = data.g2();
            const texturedFaceCount = data.g1();

            const hasInfo = data.g1();
            const hasPriorities = data.g1();
            const hasAlpha = data.g1();
            const hasFaceLabels = data.g1();
            const hasVertexLabels = data.g1();

            const vertexXLength = data.g2();
            const vertexYLength = data.g2();
            const vertexZLength = data.g2();
            const faceVertexLength = data.g2();

            ob_head.p2(id);
            ob_head.p2(vertexCount);
            ob_head.p2(faceCount);
            ob_head.p1(texturedFaceCount);
            ob_head.p1(hasInfo);
            ob_head.p1(hasPriorities);
            ob_head.p1(hasAlpha);
            ob_head.p1(hasFaceLabels);
            ob_head.p1(hasVertexLabels);

            data.pos = 0;

            const p_vertexCount = new Uint8Array(vertexCount);
            data.gdata(p_vertexCount, 0, p_vertexCount.length);
            ob_point1.pdata(p_vertexCount, 0, p_vertexCount.length);

            const p_faceCount = new Uint8Array(faceCount);
            data.gdata(p_faceCount, 0, p_faceCount.length);
            ob_vertex2.pdata(p_faceCount, 0, p_faceCount.length);

            if (hasPriorities == 255) {
                const p_faceCount = new Uint8Array(faceCount);
                data.gdata(p_faceCount, 0, p_faceCount.length);
                ob_face3.pdata(p_faceCount, 0, p_faceCount.length);
            }

            if (hasFaceLabels == 1) {
                const p_faceCount = new Uint8Array(faceCount);
                data.gdata(p_faceCount, 0, p_faceCount.length);
                ob_face5.pdata(p_faceCount, 0, p_faceCount.length);
            }

            if (hasInfo == 1) {
                const p_faceCount = new Uint8Array(faceCount);
                data.gdata(p_faceCount, 0, p_faceCount.length);
                ob_face2.pdata(p_faceCount, 0, p_faceCount.length);
            }

            if (hasVertexLabels == 1) {
                const p_vertexCount = new Uint8Array(vertexCount);
                data.gdata(p_vertexCount, 0, p_vertexCount.length);
                ob_point5.pdata(p_vertexCount, 0, p_vertexCount.length);
            }

            if (hasAlpha == 1) {
                const p_faceCount = new Uint8Array(faceCount);
                data.gdata(p_faceCount, 0, p_faceCount.length);
                ob_face4.pdata(p_faceCount, 0, p_faceCount.length);
            }

            const p_faceVertexLength = new Uint8Array(faceVertexLength);
            data.gdata(p_faceVertexLength, 0, p_faceVertexLength.length);
            ob_vertex1.pdata(p_faceVertexLength, 0, p_faceVertexLength.length);

            const p_faceCount2 = new Uint8Array(faceCount * 2);
            data.gdata(p_faceCount2, 0, p_faceCount2.length);
            ob_face1.pdata(p_faceCount2, 0, p_faceCount2.length);

            const p_texturedFaceCount = new Uint8Array(texturedFaceCount * 6);
            data.gdata(p_texturedFaceCount, 0, p_texturedFaceCount.length);
            ob_axis.pdata(p_texturedFaceCount, 0, p_texturedFaceCount.length);

            const p_vertexXLength = new Uint8Array(vertexXLength);
            data.gdata(p_vertexXLength, 0, p_vertexXLength.length);
            ob_point2.pdata(p_vertexXLength, 0, p_vertexXLength.length);

            const p_vertexYLength = new Uint8Array(vertexYLength);
            data.gdata(p_vertexYLength, 0, p_vertexYLength.length);
            ob_point3.pdata(p_vertexYLength, 0, p_vertexYLength.length);

            const p_vertexZLength = new Uint8Array(vertexZLength);
            data.gdata(p_vertexZLength, 0, p_vertexZLength.length);
            ob_point4.pdata(p_vertexZLength, 0, p_vertexZLength.length);
        }

        // ob_head.save('dump/ob_head.dat');
        // ob_face1.save('dump/ob_face1.dat');
        // ob_face2.save('dump/ob_face2.dat');
        // ob_face3.save('dump/ob_face3.dat');
        // ob_face4.save('dump/ob_face4.dat');
        // ob_face5.save('dump/ob_face5.dat');
        // ob_point1.save('dump/ob_point1.dat');
        // ob_point2.save('dump/ob_point2.dat');
        // ob_point3.save('dump/ob_point3.dat');
        // ob_point4.save('dump/ob_point4.dat');
        // ob_point5.save('dump/ob_point5.dat');
        // ob_vertex1.save('dump/ob_vertex1.dat');
        // ob_vertex2.save('dump/ob_vertex2.dat');
        // ob_axis.save('dump/ob_axis.dat');
    }

    // ----

    const jag = new Jagfile();

    jag.write('base_label.dat', base_label);
    jag.write('ob_point1.dat', ob_point1);
    jag.write('ob_point2.dat', ob_point2);
    jag.write('ob_point3.dat', ob_point3);
    jag.write('ob_point4.dat', ob_point4);
    jag.write('ob_point5.dat', ob_point5);
    jag.write('ob_head.dat', ob_head);
    jag.write('base_head.dat', base_head);
    jag.write('frame_head.dat', frame_head);
    jag.write('frame_tran1.dat', frame_tran1);
    jag.write('frame_tran2.dat', frame_tran2);
    jag.write('ob_vertex1.dat', ob_vertex1);
    jag.write('ob_vertex2.dat', ob_vertex2);
    jag.write('frame_del.dat', frame_del);
    jag.write('base_type.dat', base_type);
    jag.write('ob_face1.dat', ob_face1);
    jag.write('ob_face2.dat', ob_face2);
    jag.write('ob_face3.dat', ob_face3);
    jag.write('ob_face4.dat', ob_face4);
    jag.write('ob_face5.dat', ob_face5);
    jag.write('ob_axis.dat', ob_axis);

    jag.save('data/pack/client/models');

    base_label.release();
    ob_point1.release();
    ob_point2.release();
    ob_point3.release();
    ob_point4.release();
    ob_point5.release();
    ob_head.release();
    base_head.release();
    frame_head.release();
    frame_tran1.release();
    frame_tran2.release();
    ob_vertex1.release();
    ob_vertex2.release();
    frame_del.release();
    base_type.release();
    ob_face1.release();
    ob_face2.release();
    ob_face3.release();
    ob_face4.release();
    ob_face5.release();
    ob_axis.release();
    //console.timeEnd('models.jag');
}
