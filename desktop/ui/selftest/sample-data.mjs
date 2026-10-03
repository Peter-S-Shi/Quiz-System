// Synthetic sample content for looking at the product and for the browser self-tests (no real data): papers (one with a real
// PNG and a real WAV), a translation document, typing texts, a few recorded attempts, a schedule and a review - all created
// through the product services, so what the page shows is exactly what the shipped code stores.
import { createLibrary } from '../web/src/product/library.js';
import { createReviews } from '../web/src/product/reviews.js';
import { createPracticeRuntime } from '../web/src/practice/runtime.js';
import { ScheduleStore } from '../web/src/orchestration/schedule-store.js';
import { fixedClock, addDays } from '../web/src/orchestration/dates.js';
import { storeMedia } from '../web/src/media/media-source.js';
import { correctAnswerForView, paperWithExplanations, wrongAnswerForView } from '../tests/objective-fixtures.mjs';

import zlib from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A small valid RGB PNG (a warm-paper gradient), decodable by any browser engine. */
export function pngBytes(size = 8) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) { raw[row + 1 + x * 3] = 200 + x * 4; raw[row + 2 + x * 3] = 180 + y * 4; raw[row + 3 + x * 3] = 140; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Uint8Array.from(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
export const PNG_2X2 = pngBytes(8);

/** A short mono 8-bit PCM WAV (a quiet tone), decodable by any browser engine. */
export function wavBytes(ms = 120, rate = 8000) {
  const n = Math.floor((rate * ms) / 1000);
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write('data', 36); buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i += 1) buf[44 + i] = 128 + Math.round(20 * Math.sin((2 * Math.PI * 440 * i) / rate));
  return Uint8Array.from(buf);
}

export async function seedSample(port, { today = null } = {}) {
  const day = today ?? new Date().toISOString().slice(0, 10);
  const clock = fixedClock(day);
  let n = 0;
  const now = () => new Date(Date.parse(`${day}T08:00:00.000Z`) - 86_400_000 * 3 + (n++) * 60_000).toISOString();
  const library = await createLibrary({ port, now });
  const reviews = await createReviews({ port, now, library });
  const store = await ScheduleStore.open(port, { clock });
  const runtime = await createPracticeRuntime(port, { store, now });

  const img = await storeMedia(port, { name: 'figure.png', mimeType: 'image/png', bytes: PNG_2X2 });
  const aud = await storeMedia(port, { name: 'clip.wav', mimeType: 'audio/wav', bytes: wavBytes() });

  const capitals = { ...paperWithExplanations({ id: 'paper-capitals' }), title: 'Capital cities', category: 'Geography', tags: ['europe'] };
  const media = { ...paperWithExplanations({ id: 'paper-media' }), title: 'Figures and sounds', category: 'Media' };
  media.questions[0].image = { id: img.id, name: 'figure.png', mimeType: 'image/png', alt: 'a tiny synthetic figure' };
  media.questions[3].audio = { id: aud.id, name: 'clip.wav', mimeType: 'audio/wav' };
  await library.savePaper(capitals);
  await library.savePaper(media);
  const doc = await library.saveDocument({ ...library.newDocument(), id: 'doc-phrases', title: 'Everyday phrases', sourceLanguage: 'zh', targetLanguage: 'en', items: [
    { sourceText: '环境很重要。', referenceTranslation: 'The environment matters.' }, { sourceText: '学习是一种习惯。', referenceTranslation: 'Learning is a habit.' }] });
  const text = await library.saveTypingText({ ...library.newTypingText(), id: 'text-env', title: 'Paper and ink', text: 'The environment matters. Careful copying builds attention.', language: 'en' });

  // recorded attempts
  const play = async (started, paper, wrong = []) => {
    for (let i = 0; i < started.engine.view().total; i += 1) {
      started.engine.go(i);
      const v = started.engine.view();
      started.engine.answer(wrong.includes(v.question.id) ? wrongAnswerForView(v, paper) : correctAnswerForView(v, paper));
      if (started.engine.view().canSubmitItem) started.engine.submitItem();
    }
    const payload = started.engine.finalize({ now: now() });
    await runtime.servicesFor(started).commit({ payload });
    return payload;
  };
  const objective = await play(runtime.startObjective({ paper: capitals, intent: 'practice', feedbackTiming: 'instant', selection: { source: 'manual' } }), capitals, ['q-single', 'q-multi']);
  const t = runtime.startTranslation({ document: doc.payload, selection: { source: 'manual' } });
  t.engine.setAnswer('The enviroment is importent.');
  t.engine.addAnnotation({ start: 4, end: 14, kind: 'uncertain' }, { now: now() });
  const translation = t.engine.finalize({ now: now() });
  await runtime.servicesFor(t).commit({ payload: translation });
  const y = runtime.startTyping({ text: text.payload, intent: 'practice', selection: { source: 'manual' } });
  y.engine.input({ isTrusted: true, type: 'input', inputType: 'insertText', value: 'The enviroment matters.' });
  const typing = y.engine.finalize({ completedAt: now() }).payload;
  await runtime.servicesFor(y).commit({ payload: typing });

  // a review of the translation, and a learner-owned schedule
  const draft = reviews.newDraft(translation, { type: 'human', displayLabel: 'Ms. Example' });
  draft.items[translation.responses[0].itemId] = { judgment: 'partial', comment: 'Mind the spelling.', tags: [], suggestedRevision: 'The environment is important.', corrections: [] };
  draft.summary = 'Good effort.';
  const review = await reviews.save(draft);
  const schedule = await store.create({ slot: { domain: 'objective', material: { type: 'quiz-paper', id: 'paper-capitals' }, intent: 'practice' }, date: addDays(day, 2), cadence: { kind: 'every', unit: 'day', interval: 3 } });
  return { day, img, aud, ids: { capitals: 'paper-capitals', media: 'paper-media', doc: doc.payload.id, text: text.payload.id }, objective, translation, typing, review, schedule };
}
