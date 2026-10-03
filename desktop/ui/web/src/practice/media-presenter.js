// The surface's media presenter: turns media objects into something a learner can actually SEE or HEAR, and proves it
// before a session that needs them may start (Objective image / audio, required carry-forward of Focused Practice).
//
// Proof is behavioral, not declarative: the bytes are read through the Store Port, the declared kind must match the
// stored media type, and the browser engine itself must decode the image / load the audio metadata. Anything else is a
// problem with a reason, and the session does not start (the engine refuses media that is not proven). The proven blob
// URL is kept so the view shows exactly the object that was proven; nothing is written back to the store.
import { fetchMedia, mimeMatchesKind, MediaError } from '../media/media-source.js';
import { h } from '../dom.js';

const DECODE_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, what) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function decodeImage(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) throw new Error('the image has no pixels');
}

function loadAudio(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => (Number.isFinite(audio.duration) || audio.duration === Infinity ? resolve() : reject(new Error('the audio has no duration'))), { once: true });
    audio.addEventListener('error', () => reject(new Error('the audio cannot be decoded')), { once: true });
    audio.src = url;
  });
}

export function createMediaPresenter(port, { timeoutMs = DECODE_TIMEOUT_MS } = {}) {
  /** id -> { url, kind, mimeType } of objects already PROVEN presentable. */
  const proven = new Map();
  /** id+kind -> in-flight proof, so concurrent sessions prove an object once. */
  const inflight = new Map();

  async function proveOne({ kind, id }) {
    const key = `${kind}:${id}`;
    const have = proven.get(key);
    if (have) return { ok: true };
    if (inflight.has(key)) return inflight.get(key);
    const run = (async () => {
      try {
        const m = await fetchMedia(port, id);
        if (!mimeMatchesKind(kind, m.mimeType)) throw new MediaError('MEDIA_TYPE', `the stored type ${m.mimeType || '(none)'} is not ${kind} media`);
        const url = URL.createObjectURL(new Blob([m.bytes], { type: m.mimeType }));
        try {
          await withTimeout(kind === 'image' ? decodeImage(url) : loadAudio(url), timeoutMs, `showing the ${kind}`);
        } catch (e) {
          URL.revokeObjectURL(url);
          throw e;
        }
        proven.set(key, { url, kind, mimeType: m.mimeType });
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: String(e?.message ?? e).replace(/^[A-Z_]+: /, '') };
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, run);
    return run;
  }

  return {
    /** @param {{kind: 'image'|'audio', id: string}[]} refs */
    async prove(refs) {
      const unique = [...new Map(refs.map((r) => [`${r.kind}:${r.id}`, r])).values()];
      const results = await Promise.all(unique.map(async (r) => [r, await proveOne(r)]));
      const presentable = new Set();
      const problems = [];
      for (const [r, res] of results) {
        if (res.ok) presentable.add(r.id);
        else problems.push({ kind: r.kind, id: r.id, reason: res.reason });
      }
      // an id is presentable only if EVERY kind that refers to it was proven
      for (const p of problems) presentable.delete(p.id);
      return { presentable, problems };
    },
    /** The blob URL of a proven object, or null (never a guess). */
    urlFor: (id, kind) => proven.get(`${kind}:${id}`)?.url ?? null,
    dispose() {
      for (const { url } of proven.values()) URL.revokeObjectURL(url);
      proven.clear();
    },
  };
}

/**
 * The visible part of a question's media. `media` is the presenter (or null when none is available, in which case the
 * learner sees an explicit unavailable notice instead of a silent gap).
 */
export function mediaBlock(media, question, labels) {
  const parts = [];
  if (question.image) {
    const url = media?.urlFor(question.image.id, 'image');
    parts.push(url
      ? h('figure', { class: 'qmedia' }, h('img', { class: 'qimage', src: url, alt: question.image.alt || question.image.name || labels.image }))
      : h('p', { class: 'media-note error', role: 'alert' }, labels.imageUnavailable));
  }
  if (question.audio) {
    const url = media?.urlFor(question.audio.id, 'audio');
    parts.push(url
      ? h('figure', { class: 'qmedia' }, h('audio', { class: 'qaudio', src: url, controls: true, preload: 'metadata', 'aria-label': question.audio.name || labels.audio }))
      : h('p', { class: 'media-note error', role: 'alert' }, labels.audioUnavailable));
  }
  return parts.length ? h('div', { class: 'qmedia-wrap' }, parts) : null;
}
