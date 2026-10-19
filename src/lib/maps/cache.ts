import type { Geocoder, PlaceHit } from "./geocode.ts";
import type { RouteLine, Router } from "./route.ts";
import type { TravelMode } from "./place.ts";

export type GeoCache = {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
};

export function memoryCache(): GeoCache {
  const rows = new Map<string, unknown>();
  return {
    async get(key) {
      return rows.has(key) ? rows.get(key) ?? null : null;
    },
    async set(key, value) {
      rows.set(key, value);
    },
  };
}

const DB_NAME = "locus-geo";
const STORE = "entries";

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

export function idbCache(): GeoCache {
  return {
    async get(key) {
      if (typeof indexedDB === "undefined") return null;
      try {
        const db = await openDb();
        try {
          const row = await new Promise<{ value?: unknown } | undefined>((resolve, reject) => {
            const tx = db.transaction(STORE, "readonly");
            const request = tx.objectStore(STORE).get(key);
            request.onsuccess = () => resolve(request.result as { value?: unknown } | undefined);
            request.onerror = () => reject(request.error);
          });
          return row?.value ?? null;
        } finally {
          db.close();
        }
      } catch {
        return null;
      }
    },
    async set(key, value) {
      if (typeof indexedDB === "undefined") return;
      const db = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          const request = tx.objectStore(STORE).put({ id: key, value, at: Date.now() });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
  };
}

let deviceCache: GeoCache | null = null;

export function deviceGeoCache(): GeoCache {
  if (!deviceCache) deviceCache = typeof indexedDB === "undefined" ? memoryCache() : idbCache();
  return deviceCache;
}

function queryKey(query: string): string {
  return `q:${query.trim().toLowerCase()}`;
}

export async function searchPlaces(query: string, geocoder: Geocoder, cache: GeoCache, signal?: AbortSignal): Promise<PlaceHit[]> {
  const key = queryKey(query);
  const cached = await cache.get(key);
  if (Array.isArray(cached) && cached.length) return cached as PlaceHit[];
  const hits = await geocoder.search(query, signal);
  if (hits.length) await cache.set(key, hits);
  return hits;
}

export function routeKey(from: { lat: number; lon: number }, to: { lat: number; lon: number }, mode: TravelMode): string {
  const spot = (point: { lat: number; lon: number }) => `${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
  return `r:${mode}:${spot(from)}:${spot(to)}`;
}

export async function cachedRoute(
  router: Router,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  mode: TravelMode,
  cache: GeoCache,
  signal?: AbortSignal,
): Promise<RouteLine> {
  const key = routeKey(from, to, mode);
  const cached = await cache.get(key);
  if (cached && typeof cached === "object" && Array.isArray((cached as RouteLine).coordinates)) return cached as RouteLine;
  const line = await router.route(from, to, mode, signal);
  await cache.set(key, line);
  return line;
}
