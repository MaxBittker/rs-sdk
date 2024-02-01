import { shouldBuild } from '#lostcity/util/PackIds.js';
import { packInterface } from './PackShared.js';

if (shouldBuild('data/src/scripts', '.if', 'data/pack/server/interface.dat') || shouldBuild('src/lostcity/tools/packinterface', '.ts', 'data/pack/server/interface.dat')) {
    const data = packInterface(true);
    data.save('data/pack/server/interface.dat');
}
