export const SUPPORTED_IMAGE_MIMES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export const SUPPORTED_AUDIO_MIMES = Object.freeze([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/flac",
]);

const EXTENSION_MIME_MAP = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "audio/webm",
  aac: "audio/aac",
  m4a: "audio/m4a",
  flac: "audio/flac",
});

export function isSupportedImageMime(mime) {
  if (typeof mime !== "string") return false;
  return SUPPORTED_IMAGE_MIMES.includes(mime.trim().toLowerCase());
}

export function isSupportedAudioMime(mime) {
  if (typeof mime !== "string") return false;
  const clean = mime.trim().toLowerCase();
  if (SUPPORTED_AUDIO_MIMES.includes(clean)) return true;
  if (clean === "audio/x-wav") return true;
  if (clean === "audio/x-m4a") return true;
  if (clean === "audio/x-flac") return true;
  return false;
}

export function detectMediaMime(fileName = "", mime = "") {
  const cleanMime = typeof mime === "string" ? mime.trim().toLowerCase() : "";
  if (cleanMime === "audio/x-wav") return "audio/wav";
  if (cleanMime === "audio/x-m4a") return "audio/m4a";
  if (cleanMime === "audio/x-flac") return "audio/flac";

  if (isSupportedImageMime(cleanMime) || isSupportedAudioMime(cleanMime)) {
    return cleanMime;
  }

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (EXTENSION_MIME_MAP[ext]) {
    return EXTENSION_MIME_MAP[ext];
  }

  return cleanMime;
}

export function validateMediaFileCandidate(file, kind) {
  if (!file) {
    return { valid: false, error: "media.emptyFile" };
  }

  const detectedMime = detectMediaMime(file.name || "", file.type || "");

  if (kind === "image") {
    if (!isSupportedImageMime(detectedMime)) {
      return {
        valid: false,
        error: "media.unsupportedImageType",
        detectedMime,
      };
    }
  } else if (kind === "audio") {
    if (!isSupportedAudioMime(detectedMime)) {
      return {
        valid: false,
        error: "media.unsupportedAudioType",
        detectedMime,
      };
    }
  } else {
    return { valid: false, error: "media.unknownKind" };
  }

  return {
    valid: true,
    normalizedMime: detectedMime,
  };
}

export function normalizeImageMetadata(image) {
  if (!image || typeof image !== "object" || typeof image.id !== "string" || !image.id.trim()) {
    return undefined;
  }

  const normalized = {
    id: image.id.trim(),
    mimeType: typeof image.mimeType === "string" && image.mimeType.trim() ? image.mimeType.trim().toLowerCase() : "image/png",
    name: typeof image.name === "string" && image.name.trim() ? image.name.trim() : "image.png",
    size: typeof image.size === "number" && image.size >= 0 ? image.size : 0,
  };

  if (typeof image.alt === "string" && image.alt.trim()) {
    normalized.alt = image.alt.trim();
  }

  return normalized;
}

export function normalizeAudioMetadata(audio) {
  if (!audio || typeof audio !== "object" || typeof audio.id !== "string" || !audio.id.trim()) {
    return undefined;
  }

  const normalized = {
    id: audio.id.trim(),
    mimeType: typeof audio.mimeType === "string" && audio.mimeType.trim() ? audio.mimeType.trim().toLowerCase() : "audio/mpeg",
    name: typeof audio.name === "string" && audio.name.trim() ? audio.name.trim() : "audio.mp3",
    size: typeof audio.size === "number" && audio.size >= 0 ? audio.size : 0,
  };

  if (typeof audio.duration === "number" && audio.duration >= 0) {
    normalized.duration = audio.duration;
  }

  return normalized;
}

export function formatFileSize(bytes) {
  if (typeof bytes !== "number" || isNaN(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
