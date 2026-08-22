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
  if (typeof atob === "function") {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  return new Uint8Array(0);
}

/**
 * Converts Blob or ArrayBuffer or base64 to base64 string.
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
    const buffer = await data.arrayBuffer();
    return arrayBufferToBase64(buffer);
  }
  return "";
}

/**
 * Converts data to Blob with mimeType.
 */
export function dataToBlob(data, mimeType = "application/octet-stream") {
  if (typeof Blob === "undefined") return null;
  if (data instanceof Blob) return data;
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return new Blob([data], { type: mimeType });
  }
  if (typeof data === "string") {
    const bytes = base64ToUint8Array(data.startsWith("data:") ? data.split(",")[1] : data);
    return new Blob([bytes], { type: mimeType });
  }
  return null;
}

/**
 * In-memory Media Store implementation (for unit tests / non-browser environments).
 */
export function createMemoryMediaStore() {
  const map = new Map();

  return {
    async saveMediaAsset(asset) {
      if (!asset?.id) throw new TypeError("Media asset must have an id");
      const base64Data = await dataToBase64(asset.data || asset.blob);
      const record = {
        id: asset.id,
        mimeType: asset.mimeType || "application/octet-stream",
        name: asset.name || "asset",
        size: typeof asset.size === "number" ? asset.size : base64Data.length,
        data: base64Data,
        createdAt: asset.createdAt || new Date().toISOString(),
      };
      map.set(asset.id, record);
      return record;
    },

    async getMediaAsset(id) {
      const record = map.get(id);
      if (!record) return null;
      const blob = dataToBlob(record.data, record.mimeType);
      return {
        ...record,
        blob,
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
          results.push({
            id: record.id,
            mimeType: record.mimeType,
            name: record.name,
            size: record.size,
            data: record.data,
          });
        }
      }
      return results;
    },

    async importMediaAssets(assets = []) {
      if (!Array.isArray(assets)) return;
      for (const item of assets) {
        if (item?.id) {
          await this.saveMediaAsset(item);
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
      const base64Data = await dataToBase64(asset.data || asset.blob);
      const record = {
        id: asset.id,
        mimeType: asset.mimeType || "application/octet-stream",
        name: asset.name || "asset",
        size: typeof asset.size === "number" ? asset.size : base64Data.length,
        data: base64Data,
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
          const blob = dataToBlob(record.data, record.mimeType);
          resolve({
            ...record,
            blob,
          });
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
        if (asset) {
          results.push({
            id: asset.id,
            mimeType: asset.mimeType,
            name: asset.name,
            size: asset.size,
            data: asset.data,
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
            store.put({
              id: asset.id,
              mimeType: asset.mimeType || "application/octet-stream",
              name: asset.name || "asset",
              size: typeof asset.size === "number" ? asset.size : (asset.data ? asset.data.length : 0),
              data: typeof asset.data === "string" ? (asset.data.startsWith("data:") ? asset.data.split(",")[1] : asset.data) : "",
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
