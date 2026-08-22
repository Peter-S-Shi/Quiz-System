const DB_NAME = "quiz-studio-media-db";
const DB_VERSION = 1;
const STORE_NAME = "media_assets";

/**
 * Converts ArrayBuffer / Uint8Array to base64 string.
 */
export function arrayBufferToBase64(buffer) {
  if (!buffer) return "";
  let binary = "";
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  return "";
}

/**
 * Converts base64 string to Uint8Array.
 */
export function base64ToUint8Array(base64) {
  if (!base64 || typeof base64 !== "string") return new Uint8Array(0);
  const clean = base64.startsWith("data:") ? base64.split(",")[1] || "" : base64.trim();
  if (typeof atob === "function") {
    const binary = atob(clean);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(clean, "base64"));
  }
  return new Uint8Array(0);
}

/**
 * Converts base64 string to Blob.
 */
export function base64ToBlob(base64, mimeType = "application/octet-stream") {
  const bytes = base64ToUint8Array(base64);
  if (typeof Blob !== "undefined") {
    return new Blob([bytes], { type: mimeType });
  }
  return bytes;
}

/**
 * Converts Blob or ArrayBuffer or base64 to Blob.
 */
export function dataToBlob(data, mimeType = "application/octet-stream") {
  if (!data) return typeof Blob !== "undefined" ? new Blob([], { type: mimeType }) : new Uint8Array(0);
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return data;
  }
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return typeof Blob !== "undefined" ? new Blob([data], { type: mimeType }) : (data instanceof Uint8Array ? data : new Uint8Array(data));
  }
  if (typeof data === "string") {
    return base64ToBlob(data, mimeType);
  }
  return typeof Blob !== "undefined" ? new Blob([], { type: mimeType }) : new Uint8Array(0);
}

/**
 * Converts Blob / Uint8Array to base64 string.
 */
export async function dataToBase64(data) {
  if (!data) return "";
  if (typeof data === "string") {
    if (data.startsWith("data:")) {
      return data.split(",")[1] || "";
    }
    return data;
  }
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return arrayBufferToBase64(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    if (typeof data.arrayBuffer === "function") {
      const buffer = await data.arrayBuffer();
      return arrayBufferToBase64(buffer);
    }
  }
  return "";
}

/**
 * In-memory Media Store implementation (for unit tests / non-browser environments).
 * Stores binary Blob/Uint8Array objects in memory and handles base64 conversions on export/import.
 */
export function createMemoryMediaStore() {
  const map = new Map();

  return {
    async saveMediaAsset(asset) {
      if (!asset?.id) throw new TypeError("Media asset must have an id");
      const mimeType = asset.mimeType || "application/octet-stream";
      const blob = dataToBlob(asset.blob || asset.data, mimeType);
      const size = typeof asset.size === "number" && asset.size >= 0
        ? asset.size
        : (blob.size !== undefined ? blob.size : (blob.byteLength || 0));

      const record = {
        id: asset.id,
        mimeType,
        name: asset.name || "asset",
        size,
        blob,
        createdAt: asset.createdAt || new Date().toISOString(),
      };
      map.set(asset.id, record);
      return record;
    },

    async getMediaAsset(id) {
      const record = map.get(id);
      if (!record) return null;
      return {
        ...record,
      };
    },

    async deleteMediaAsset(id) {
      map.delete(id);
    },

    async listMediaAssetIds() {
      return Array.from(map.keys());
    },

    async exportMediaAssets(assetIds = []) {
      const results = [];
      for (const id of assetIds) {
        const record = map.get(id);
        if (record) {
          const base64Data = await dataToBase64(record.blob);
          results.push({
            id: record.id,
            mimeType: record.mimeType,
            name: record.name,
            size: record.size,
            data: base64Data,
          });
        }
      }
      return results;
    },

    async importMediaAssets(assets = []) {
      if (!Array.isArray(assets)) return;
      for (const item of assets) {
        if (item?.id) {
          const mimeType = item.mimeType || "application/octet-stream";
          const blob = dataToBlob(item.data || item.blob, mimeType);
          const size = typeof item.size === "number" && item.size >= 0
            ? item.size
            : (blob.size !== undefined ? blob.size : (blob.byteLength || 0));

          map.set(item.id, {
            id: item.id,
            mimeType,
            name: item.name || "asset",
            size,
            blob,
            createdAt: item.createdAt || new Date().toISOString(),
          });
        }
      }
    },

    async clear() {
      map.clear();
    },
  };
}

/**
 * IndexedDB-backed Media Store implementation (for browser runtime).
 * Stores binary Blob objects natively in IndexedDB (not base64).
 */
export function createIndexedDbMediaStore() {
  let dbPromise = null;

  function getDb() {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB is not available in this environment."));
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return dbPromise;
  }

  return {
    async saveMediaAsset(asset) {
      if (!asset?.id) throw new TypeError("Media asset must have an id");
      const db = await getDb();
      const mimeType = asset.mimeType || "application/octet-stream";
      const blob = dataToBlob(asset.blob || asset.data, mimeType);
      const size = typeof asset.size === "number" && asset.size >= 0
        ? asset.size
        : (blob.size !== undefined ? blob.size : 0);

      const record = {
        id: asset.id,
        mimeType,
        name: asset.name || "asset",
        size,
        blob,
        createdAt: asset.createdAt || new Date().toISOString(),
      };

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = () => reject(req.error);
      });
    },

    async getMediaAsset(id) {
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
          const record = req.result;
          if (!record) {
            resolve(null);
            return;
          }
          resolve(record);
        };
        req.onerror = () => reject(req.error);
      });
    },

    async deleteMediaAsset(id) {
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async listMediaAssetIds() {
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async exportMediaAssets(assetIds = []) {
      const db = await getDb();
      const results = [];
      for (const id of assetIds) {
        const asset = await new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
        if (asset && asset.blob) {
          const base64Data = await dataToBase64(asset.blob);
          results.push({
            id: asset.id,
            mimeType: asset.mimeType,
            name: asset.name,
            size: asset.size,
            data: base64Data,
          });
        }
      }
      return results;
    },

    async importMediaAssets(assets = []) {
      if (!Array.isArray(assets) || !assets.length) return;
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        for (const asset of assets) {
          if (asset?.id) {
            const mimeType = asset.mimeType || "application/octet-stream";
            const blob = dataToBlob(asset.data || asset.blob, mimeType);
            const size = typeof asset.size === "number" && asset.size >= 0
              ? asset.size
              : (blob.size !== undefined ? blob.size : 0);

            store.put({
              id: asset.id,
              mimeType,
              name: asset.name || "asset",
              size,
              blob,
              createdAt: asset.createdAt || new Date().toISOString(),
            });
          }
        }
      });
    },
  };
}

/**
 * Creates default media store: IndexedDB if in browser, Memory if in tests.
 */
export function createDefaultMediaStore() {
  if (typeof indexedDB !== "undefined") {
    return createIndexedDbMediaStore();
  }
  return createMemoryMediaStore();
}
