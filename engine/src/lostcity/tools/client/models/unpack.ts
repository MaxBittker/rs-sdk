import fs from 'fs';

import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';
import Model from '#lostcity/tools/client/models/Model.js';

const models = Jagfile.load('data/client/models');

// ----

{
    Model.unpack(models);

    let pack = '';
    for (let i = 0; i < Model.metadata.length; i++) {
        if (!Model.metadata[i]) {
            continue;
        }

        pack += `${i}=model_${i}\n`;

        const model = Model.get(i);

        if (!model) {
            console.log('missing model', i);
            continue;
        }

        const raw = model.convert();
        raw.save(`data/src/models/model_${i}.ob2`);
        raw.release();
    }

    let order = '';
    for (let i = 0; i < Model.order.length; i++) {
        order += `${Model.order[i]}\n`;
    }

    fs.writeFileSync('data/src/pack/model.pack', pack);
    fs.writeFileSync('data/src/pack/model.order', order);
}

// ----

{
    if (!fs.existsSync('data/src/models/base')) {
        fs.mkdirSync('data/src/models/base', { recursive: true });
    }

    let pack = '';
    let order = '';

    const head = models.read('base_head.dat');
    const type = models.read('base_type.dat');
    const label = models.read('base_label.dat');

    if (!head) {
        throw new Error('missing base_head.dat');
    }

    if (!type) {
        throw new Error('missing base_type.dat');
    }

    if (!label) {
        throw new Error('missing base_label.dat');
    }

    const total = head.g2(); // # to read
    const instances = head.g2(); // highest ID

    for (let i = 0; i < total; i++) {
        // let hstart = head.pos;
        const tstart = type.pos;
        const labelstart = label.pos;

        const id = head.g2();
        order += `${id}\n`;
        pack += `${id}=base_${id}\n`;

        const length = head.g1();
        for (let j = 0; j < length; j++) {
            type.g1();

            const labelCount = label.g1();
            for (let k = 0; k < labelCount; k++) {
                label.g1();
            }
        }

        // let hend = head.pos;
        const tend = type.pos;
        const labelend = label.pos;

        const base = Packet.alloc(0);
        // base.pdata(head.gdata(hend - hstart, hstart, false));

        const pp = new Uint8Array((tend - tstart));
        type.pos = tstart;
        type.gdata(pp, 0, pp.length);
        base.pdata(pp, 0, pp.length);

        const pl = new Uint8Array((labelend - labelstart));
        label.pos = labelstart;
        label.gdata(pl, 0, pl.length);
        base.pdata(pl, 0, pl.length);

        // base.p2(hend - hstart);
        base.p2(tend - tstart);
        base.p2(labelend - labelstart);
        base.save(`data/src/models/base/base_${id}.base`);
        base.release();
    }

    fs.writeFileSync('data/src/pack/base.pack', pack);
    fs.writeFileSync('data/src/pack/base.order', order);
}

// ----

{
    if (!fs.existsSync('data/src/models/frame')) {
        fs.mkdirSync('data/src/models/frame', { recursive: true });
    }

    let pack = '';
    let order = '';

    const head = models.read('frame_head.dat');
    const tran1 = models.read('frame_tran1.dat');
    const tran2 = models.read('frame_tran2.dat');
    const del = models.read('frame_del.dat');

    if (!head) {
        throw new Error('missing frame_head.dat');
    }

    if (!tran1) {
        throw new Error('missing frame_tran1.dat');
    }

    if (!tran2) {
        throw new Error('missing frame_tran2.dat');
    }

    if (!del) {
        throw new Error('missing frame_del.dat');
    }

    const total = head.g2();
    const instances = head.g2();

    for (let i = 0; i < total; i++) {
        const hstart = head.pos;
        const t1start = tran1.pos;
        const t2start = tran2.pos;
        const dstart = del.pos;

        const id = head.g2();
        del.g1();
        head.g2();

        order += `${id}\n`;
        pack += `${id}=anim_${id}\n`;

        const labelCount = head.g1();
        for (let j = 0; j < labelCount; j++) {
            const flags = tran1.g1();
            if (flags === 0) {
                continue;
            }

            if ((flags & 0x1) != 0) {
                tran2.gsmarts();
            }

            if ((flags & 0x2) != 0) {
                tran2.gsmarts();
            }

            if ((flags & 0x4) != 0) {
                tran2.gsmarts();
            }
        }

        const hend = head.pos;
        const t1end = tran1.pos;
        const t2end = tran2.pos;
        const dend = del.pos;

        const frame = Packet.alloc(2);

        const p_hend = new Uint8Array((hend - hstart));
        head.pos = hstart;
        head.gdata(p_hend, 0, p_hend.length);
        frame.pdata(p_hend, 0, p_hend.length);

        const p_t1end = new Uint8Array((t1end - t1start));
        tran1.pos = t1start;
        tran1.gdata(p_t1end, 0, p_t1end.length);
        frame.pdata(p_t1end, 0, p_t1end.length);

        const p_t2end = new Uint8Array((t2end - t2start));
        tran2.pos = t2start;
        tran2.gdata(p_t2end, 0, p_t2end.length);
        frame.pdata(p_t2end, 0, p_t2end.length);

        const p_dend = new Uint8Array((dend - dstart));
        del.pos = dstart;
        del.gdata(p_dend, 0, p_dend.length);
        frame.pdata(p_dend, 0, p_dend.length);

        frame.p2(hend - hstart);
        frame.p2(t1end - t1start);
        frame.p2(t2end - t2start);
        frame.p2(dend - dstart);
        frame.save(`data/src/models/frame/anim_${id}.frame`);
        frame.release();
    }

    fs.writeFileSync('data/src/pack/anim.pack', pack);
    fs.writeFileSync('data/src/pack/anim.order', order);
}
