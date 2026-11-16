// Fix iOS Audio Context by Blake Kus https://gist.github.com/kus/3f01d60569eeadefe3a1
// MIT license
(function () {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    if (window.AudioContext) {
        window.audioContext = new window.AudioContext({ sampleRate: 22050 });
    }
    var fixAudioContext = function (e) {
        if (window.audioContext) {
            // Create empty buffer
            var buffer = window.audioContext.createBuffer(1, 1, 22050);
            var source = window.audioContext.createBufferSource();
            source.buffer = buffer;
            // Connect to output (speakers)
            source.connect(window.audioContext.destination);
            // Play sound
            if (source.start) {
                source.start(0);
            } else if (source.play) {
                source.play(0);
            } else if (source.noteOn) {
                source.noteOn(0);
            }
        }
        // Remove events
        document.removeEventListener('touchstart', fixAudioContext);
        document.removeEventListener('touchend', fixAudioContext);
        document.removeEventListener('click', fixAudioContext);
    };
    // iOS 6-8
    document.addEventListener('touchstart', fixAudioContext);
    // iOS 9
    document.addEventListener('touchend', fixAudioContext);
    // Safari
    document.addEventListener('click', fixAudioContext);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            if (window.audioContext) {
                window.audioContext.resume();
            }
        }
    });
})();

let waveGain;

export async function playWave(data) {
    try {
        const audioBuffer = await window.audioContext.decodeAudioData(new Uint8Array(data).buffer);
        let bufferSource = window.audioContext.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.connect(waveGain);
        bufferSource.start();
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export function setWaveVolume(dB) {
    if (!waveGain) {
        waveGain = window.audioContext.createGain();
        waveGain.connect(window.audioContext.destination);
    }

    waveGain.gain.value = Math.pow(10, dB / 20);
}
