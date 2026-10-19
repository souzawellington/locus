const DB_NAME = "locus-media";
const STORE = "files";

type MediaRow = {
  id: string;
  encrypted: boolean;
  mime: string;
  iv: string;
  buffer: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function saveMedia(id: string, blob: Blob, key?: CryptoKey) {
  const mime = blob.type || "application/octet-stream";
  const raw = new Uint8Array(await blob.arrayBuffer());
  if (!key) {
    const row: MediaRow = { id, encrypted: false, mime, iv: "", buffer: raw.buffer };
    await withStore("readwrite", (store) => store.put(row));
    return;
  }
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);
  const packed = new TextEncoder().encode(JSON.stringify({ mime, bytes: bytesToB64(raw) }));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, packed));
  const row: MediaRow = { id, encrypted: true, mime: "", iv: bytesToB64(iv), buffer: cipher.buffer };
  await withStore("readwrite", (store) => store.put(row));
}

export async function loadMedia(id: string, key?: CryptoKey): Promise<Blob | null> {
  const row = await withStore<MediaRow | undefined>("readonly", (store) => store.get(id));
  if (!row) return null;
  if (!row.encrypted) return new Blob([row.buffer], { type: row.mime || "application/octet-stream" });
  if (!key) return null;
  try {
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(row.iv) }, key, row.buffer));
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as { mime?: string; bytes?: string };
    if (!parsed.bytes) return null;
    return new Blob([b64ToBytes(parsed.bytes)], { type: parsed.mime || "application/octet-stream" });
  } catch {
    return null;
  }
}

export async function deleteMedia(id: string) {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function recryptMedia(ids: string[], from?: CryptoKey, to?: CryptoKey) {
  for (const id of ids) {
    const blob = await loadMedia(id, from);
    if (!blob) continue;
    await saveMedia(id, blob, to);
  }
}

export async function compressImage(file: Blob, max = 2048): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (webp) return webp;
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  return jpeg ?? file;
}
