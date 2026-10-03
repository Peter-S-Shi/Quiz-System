// Media bytes over the Store Port (the formal media pipeline): objects are content-addressed files owned by Rust; the
// WebView sees them only as bounded chunks by media id and never as a path. Everything here is DOM-free so the pipeline
// is testable against the real store; turning bytes into something visible (a blob URL, a decoded image) is the job of
// `practice/media-presenter.js`.

export const IMAGE_MIMES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
export const AUDIO_MIMES = Object.freeze(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/m4a', 'audio/mp4', 'audio/flac']);
/** The largest object the pipeline moves in one piece (mirrors the Rust `media.put` cap). */
export const MEDIA_MAX_BYTES = 24 << 20;
const CHUNK = 1 << 20;

export class MediaError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'MediaError';
    this.code = code;
  }
}

/** Does this media type belong to the kind a question declares (`image` / `audio`)? */
export function mimeMatchesKind(kind, mimeType) {
  const list = kind === 'image' ? IMAGE_MIMES : kind === 'audio' ? AUDIO_MIMES : [];
  return list.includes(String(mimeType ?? '').toLowerCase());
}

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Read a whole media object: `{ bytes, mimeType, size, name }`. Missing / oversized objects fail with a MediaError. */
export async function fetchMedia(port, id, { maxBytes = MEDIA_MAX_BYTES } = {}) {
  let located;
  try {
    located = await port.locateMedia(id);
  } catch (e) {
    throw new MediaError(e?.code === 'NOT_FOUND' ? 'MEDIA_MISSING' : 'MEDIA_UNREADABLE', String(e?.message ?? e));
  }
  if (located.size > maxBytes) throw new MediaError('MEDIA_TOO_LARGE', `the media object is larger than ${maxBytes} bytes`);
  const bytes = new Uint8Array(located.size);
  let offset = 0;
  while (offset < located.size) {
    let chunk;
    try {
      chunk = await port.readMediaChunk(id, offset, CHUNK);
    } catch (e) {
      throw new MediaError('MEDIA_UNREADABLE', String(e?.message ?? e));
    }
    const part = base64ToBytes(chunk.data);
    if (part.length === 0 || offset + part.length > located.size) throw new MediaError('MEDIA_UNREADABLE', 'the media object ended unexpectedly');
    bytes.set(part, offset);
    offset += part.length;
  }
  return { bytes, mimeType: String(located.mimeType ?? ''), size: located.size };
}

/** Store bytes as a media object (deduplicated by content). Returns the stored reference `{ id, mimeType, name, size }`. */
export async function storeMedia(port, { name, mimeType, bytes }) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new MediaError('MEDIA_EMPTY', 'there is nothing to store');
  if (bytes.length > MEDIA_MAX_BYTES) throw new MediaError('MEDIA_TOO_LARGE', 'the media object is too large');
  if (!mimeMatchesKind('image', mimeType) && !mimeMatchesKind('audio', mimeType)) throw new MediaError('MEDIA_TYPE', `unsupported media type ${JSON.stringify(mimeType)}`);
  const r = await port.putMedia({ name: String(name || 'media'), mimeType, data: bytesToBase64(bytes) });
  return { id: r.id, mimeType: r.mimeType, name: r.name, size: r.size, deduplicated: r.deduplicated };
}
