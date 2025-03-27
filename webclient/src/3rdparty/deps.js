import { gunzipSync, unzipSync } from 'fflate';

import { playWave, setWaveVolume } from '#3rdparty/audio.js';
import { playMidi, stopMidi, setMidiVolume } from '#3rdparty/tinymidipcm.js';
import BZip2 from '#3rdparty/bzip2-wasm.js';
import MobileKeyboard from '#3rdparty/MobileKeyboard.js';

export {
    gunzipSync,
    unzipSync,
    playWave,
    setWaveVolume,
    playMidi,
    stopMidi,
    setMidiVolume,
    BZip2,
    MobileKeyboard
};
