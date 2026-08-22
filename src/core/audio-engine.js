/**
 * Synthesized Studio Audio Engine
 * Zero-dependency physical sound generator powered by the Web Audio API.
 * Synthesizes paper page turn rustle, pencil writing scratches, and rubber stamp thuds.
 */

function createNoiseBuffer(ctx, durationSec, decayFactor = null) {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const decay = decayFactor !== null ? Math.exp(-i / (bufferSize * decayFactor)) : 1;
    output[i] = (Math.random() * 2 - 1) * decay;
  }
  return buffer;
}

export class StudioAudioEngine {
  constructor({ enabled = true } = {}) {
    this.ctx = null;
    this.enabled = Boolean(enabled);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    if (typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          this.ctx = null;
        }
      }
    }

    return this.ctx;
  }

  /**
   * Synthesize gentle paper page-turn rustle & air glide.
   */
  playPageTurn() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, 0.18, 0.45);

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(350, now + 0.16);
      filter.Q.setValueAtTime(1.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
    } catch {
      // Ignore audio synthesis errors gracefully
    }
  }

  /**
   * Synthesize tactile pencil / pen ink write scratch stroke.
   */
  playPencilStroke() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, 0.09, null);

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2800, now);
      filter.frequency.linearRampToValueAtTime(3600, now + 0.07);
      filter.Q.setValueAtTime(2.5, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
    } catch {
      // Ignore audio synthesis errors gracefully
    }
  }

  /**
   * Synthesize physical rubber stamp thud & surface impact.
   */
  playStampThud() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Low resonant sine thump
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.35, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);

      // Impact click transient
      const clickSource = ctx.createBufferSource();
      clickSource.buffer = createNoiseBuffer(ctx, 0.025, 0.3);

      const clickFilter = ctx.createBiquadFilter();
      clickFilter.type = "bandpass";
      clickFilter.frequency.setValueAtTime(750, now);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.25, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

      clickSource.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(ctx.destination);

      clickSource.start(now);
    } catch {
      // Ignore audio synthesis errors gracefully
    }
  }
}

export const studioAudio = new StudioAudioEngine();
