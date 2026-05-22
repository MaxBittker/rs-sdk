import fs from 'fs';

import Environment from '#/util/Environment.js';

function rmIfExists(path: string) {
    if (fs.existsSync(path)) {
        fs.rmSync(path, { recursive: true });
    }
}

rmIfExists('data/pack/');

// clean up server packfiles, we can regen these safely, sometimes it can have old data inside
rmIfExists(`${Environment.build.srcDir}/pack/category.pack`);
rmIfExists(`${Environment.build.srcDir}/pack/enum.pack`);
rmIfExists(`${Environment.build.srcDir}/pack/param.pack`);
rmIfExists(`${Environment.build.srcDir}/pack/script.pack`);
rmIfExists(`${Environment.build.srcDir}/pack/struct.pack`);
rmIfExists(`${Environment.build.srcDir}/pack/mesanim.pack`);
rmIfExists(`${Environment.build.srcDir}/pack/dbrow.pack`);
rmIfExists(`${Environment.build.srcDir}/pack/dbtable.pack`);
rmIfExists(`${Environment.build.srcDir}/pack/hunt.pack`);
rmIfExists(`${Environment.build.srcDir}/pack/varn.pack`);
rmIfExists(`${Environment.build.srcDir}/pack/vars.pack`);

// these get rebuilt anyways but since we're here...
rmIfExists('data/symbols/');
