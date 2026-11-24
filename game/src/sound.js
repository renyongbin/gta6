// Procedural sound for Neon Harbor: every effect is synthesized with WebAudio,
// so the game loads no audio files and makes no network request. Sound only
// starts after the player's first gesture (the browser's autoplay rule).
export function createSound() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let sirenHigh = false;
  let enabled = true;

  function ensure() {
    if (context) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      context = new AudioCtx();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || !enabled) return;
    const t = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol || 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, low) {
    if (!ensure() || !enabled) return;
    const t = context.currentTime;
    const len = Math.floor(context.sampleRate * dur);
    const buffer = context.createBuffer(1, len, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = low || 900;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
  }

  return {
    unlock() {
      resume();
    },
    setEnabled(on) {
      enabled = on;
    },
    punch() {
      noiseBurst(0.09, 0.25, 700);
      blip(140, 0.08, 'sine', 0.16, 70);
    },
    hit() {
      noiseBurst(0.12, 0.2, 500);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.14);
      setTimeout(() => blip(990, 0.12, 'sine', 0.14), 90);
    },
    mission() {
      [523, 659, 784, 1046].forEach((freq, i) => setTimeout(() => blip(freq, 0.16, 'triangle', 0.16), i * 110));
    },
    busted() {
      [392, 311, 233].forEach((freq, i) => setTimeout(() => blip(freq, 0.25, 'sawtooth', 0.1), i * 160));
    },
    click() {
      blip(880, 0.05, 'square', 0.08);
    },
    cash() {
      blip(1320, 0.07, 'sine', 0.12);
      setTimeout(() => blip(1760, 0.1, 'sine', 0.12), 70);
    },
    // Engine hum that follows the car's speed; call every frame while driving.
    engine(speed01) {
      if (!ensure() || !enabled) return;
      if (!engineOsc) {
        engineOsc = context.createOscillator();
        engineGain = context.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const target = speed01 > 0.02 ? 0.05 + speed01 * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, context.currentTime, 0.08);
    },
    // Two-tone police siren while wanted; call with true/false to start/stop.
    siren(on) {
      if (!ensure() || !enabled) {
        on = false;
      }
      if (on && !sirenOsc) {
        sirenOsc = context.createOscillator();
        sirenGain = context.createGain();
        sirenOsc.type = 'triangle';
        sirenGain.gain.value = 0.045;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenHigh = false;
        sirenTimer = setInterval(() => {
          sirenHigh = !sirenHigh;
          if (sirenOsc) sirenOsc.frequency.setTargetAtTime(sirenHigh ? 880 : 660, context.currentTime, 0.05);
        }, 420);
      } else if (!on && sirenOsc) {
        clearInterval(sirenTimer);
        sirenTimer = null;
        const osc = sirenOsc;
        const gain = sirenGain;
        sirenOsc = null;
        sirenGain = null;
        gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
        setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 300);
      }
    },
  };
}
