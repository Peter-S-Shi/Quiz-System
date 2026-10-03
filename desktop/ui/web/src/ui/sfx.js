// Optional physical sound accents (page turn, pen stroke, stamp), synthesized with Web Audio - no audio files. Off unless
// the learner enabled it; silent when the engine has no AudioContext or the motion preference is reduced. They accent an
// action that already happened; no feedback is carried by sound alone.
let ctx = null;

function context() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** Play now, or as soon as a suspended context (autoplay policy) has resumed; never throws. */
function play(name) {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended' && typeof c.resume === 'function') {
    c.resume().then(() => SOUNDS[name](c)).catch(() => {});
    return;
  }
  SOUNDS[name](c);
}

function burst(c, { freq, to = freq, ms, gain, type = 'sine' }) {
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + ms / 1000);
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.02);
}

const SOUNDS = {
  page: (c) => burst(c, { freq: 520, to: 260, ms: 90, gain: 0.03, type: 'triangle' }),
  pen: (c) => burst(c, { freq: 1800, to: 900, ms: 60, gain: 0.02, type: 'sawtooth' }),
  stamp: (c) => burst(c, { freq: 140, to: 60, ms: 140, gain: 0.07, type: 'sine' }),
};

/** Test seam: forget the shared context so a fake AudioContext can be installed on globalThis. */
export const resetSfxForTest = () => { ctx = null; };

export function createSfx({ enabled = () => false, reduced = () => false } = {}) {
  return (name) => {
    try {
      if (!enabled() || reduced() || !SOUNDS[name]) return;
      play(name);
    } catch {
      /* sound is only an accent */
    }
  };
}
