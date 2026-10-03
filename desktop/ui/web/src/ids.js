// Identifier allocation for sessions, evidence and annotations. `crypto.randomUUID` needs a secure context; the packaged
// WebView serves the app from a localhost origin (secure), but a fallback built on `crypto.getRandomValues` keeps id
// allocation working anywhere a CSPRNG exists. Never Math.random: an evidence id must not collide.
export function newId() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
