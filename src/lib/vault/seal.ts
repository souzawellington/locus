import type { NoteSeal } from "./types.ts";

export const SEAL_ITERATIONS = 210_000;
export const LOCK_AFTER_MS = 120_000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function idleExpired(lastActive: number, now: number, wait = LOCK_AFTER_MS): boolean {
  return now - lastActive >= wait;
}

/** True when the note carries a seal. Open text in memory does not unlock the check. */
export function noteIsLocked(note: { seal?: unknown } | null | undefined): boolean {
  return Boolean(note?.seal);
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

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealText(plain: string, password: string, iterations = SEAL_ITERATIONS): Promise<{ seal: NoteSeal; key: CryptoKey }> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt, iterations);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(plain)));
  return {
    key,
    seal: {
      salt: bytesToB64(salt),
      iv: bytesToB64(iv),
      data: bytesToB64(cipher),
      hideTitle: false,
      iterations,
    },
  };
}

export async function openText(seal: NoteSeal, password: string): Promise<{ plain: string; key: CryptoKey }> {
  const salt = b64ToBytes(seal.salt);
  const iv = b64ToBytes(seal.iv);
  const key = await deriveKey(password, salt, seal.iterations);
  try {
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, b64ToBytes(seal.data)));
    return { plain: textDecoder.decode(plain), key };
  } catch {
    throw new Error("senha");
  }
}

export async function encryptWithKey(key: CryptoKey, plain: string): Promise<{ iv: string; data: string }> {
  const iv = randomBytes(12);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(plain)));
  return { iv: bytesToB64(iv), data: bytesToB64(cipher) };
}

const sessionKeys = new Map<string, CryptoKey>();

export function rememberKey(id: string, key: CryptoKey) {
  sessionKeys.set(id, key);
}

export function sessionKey(id: string): CryptoKey | undefined {
  return sessionKeys.get(id);
}

export function forgetKey(id: string) {
  sessionKeys.delete(id);
}

export function forgetAllKeys() {
  sessionKeys.clear();
}

let devicePin: string | null = null;
let lastActive = Date.now();

export function rememberDevicePin(pin: string) {
  devicePin = pin;
}

export function currentDevicePin(): string | null {
  return devicePin;
}

export function forgetDevicePin() {
  devicePin = null;
}

export function markActive(now = Date.now()) {
  lastActive = now;
}

export function lastActiveAt(): number {
  return lastActive;
}

export type PinRecord = { salt: string; iv: string; data: string; iterations: number };

const PIN_STORAGE = "locus-device-pin";
const PIN_MARK = "locus-pin-ok";

export async function createPinRecord(pin: string): Promise<PinRecord> {
  const { seal } = await sealText(PIN_MARK, pin);
  return { salt: seal.salt, iv: seal.iv, data: seal.data, iterations: seal.iterations };
}

export async function pinMatches(record: PinRecord, pin: string): Promise<boolean> {
  try {
    const opened = await openText({ ...record, hideTitle: false }, pin);
    return opened.plain === PIN_MARK;
  } catch {
    return false;
  }
}

export function readPinRecord(): PinRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PIN_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PinRecord;
    if (!parsed.salt || !parsed.iv || !parsed.data || !parsed.iterations) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePinRecord(record: PinRecord | null) {
  if (typeof localStorage === "undefined") return;
  if (!record) localStorage.removeItem(PIN_STORAGE);
  else localStorage.setItem(PIN_STORAGE, JSON.stringify(record));
}
