// Procedural sound, no assets: a few WebAudio oscillators and noise bursts. Audio only
// starts after the first user gesture (browsers block it before then) and M toggles mute.
// Every call is a no-op until the context exists, so screenshots stay silent and safe.

export function createSound() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol || 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  function noise(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      if (muted && engineOsc) {
        try { engineOsc.stop(); } catch { /* already stopped */ }
        engineOsc = null;
        engineGain = null;
      }
      return muted;
    },
    get muted() {
      return muted;
    },
    punch() {
      noise(0.09, 0.25, 900);
    },
    hit() {
      tone(140, 0.18, 'sawtooth', 0.14, 70);
    },
    crime() {
      tone(660, 0.12, 'square', 0.07);
      setTimeout(() => tone(880, 0.14, 'square', 0.07), 120);
    },
    pickup() {
      tone(523, 0.1, 'sine', 0.12);
      setTimeout(() => tone(784, 0.16, 'sine', 0.12), 100);
    },
    mission() {
      tone(523, 0.12, 'sine', 0.13);
      setTimeout(() => tone(659, 0.12, 'sine', 0.13), 110);
      setTimeout(() => tone(784, 0.22, 'sine', 0.13), 220);
    },
    busted() {
      tone(392, 0.25, 'sawtooth', 0.12, 196);
      setTimeout(() => tone(196, 0.4, 'sawtooth', 0.12, 98), 240);
    },
    /** Engine hum that follows the car speed; call every frame while driving. */
    engine(speed, driving) {
      if (!ensure() || muted || !driving) {
        if (engineOsc) {
          try { engineOsc.stop(); } catch { /* already stopped */ }
          engineOsc = null;
          engineGain = null;
        }
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.035;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(ctx.destination);
        engineOsc.start();
      }
      engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 0.28, ctx.currentTime, 0.08);
    },
    /** A short two-tone siren blip, throttled by the caller. */
    siren(high) {
      tone(high ? 960 : 720, 0.22, 'triangle', 0.045);
    },
  };
}
