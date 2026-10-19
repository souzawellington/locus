import { createRateLimiter } from "./limit.ts";
import type { TravelMode } from "./place.ts";
import type { FetchLike } from "./geocode.ts";

export type LatLon = { lat: number; lon: number };

export type RouteLine = {
  distanceM: number;
  durationS: number;
  coordinates: [number, number][];
};

export type Router = {
  id: "osrm" | "ors";
  route(from: LatLon, to: LatLon, mode: TravelMode, signal?: AbortSignal): Promise<RouteLine>;
};

const OSRM_PROFILE: Record<TravelMode, string> = {
  car: "driving",
  bike: "bike",
  walk: "foot",
};

const ORS_PROFILE: Record<TravelMode, string> = {
  car: "driving-car",
  bike: "cycling-regular",
  walk: "foot-walking",
};

export function osrmUrl(from: LatLon, to: LatLon, mode: TravelMode): string {
  const profile = OSRM_PROFILE[mode];
  const path = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  return `https://router.project-osrm.org/route/v1/${profile}/${path}?overview=full&geometries=geojson&alternatives=false`;
}

export function orsUrl(mode: TravelMode): string {
  return `https://api.openrouteservice.org/v2/directions/${ORS_PROFILE[mode]}/geojson`;
}

function lineFrom(coordinates: unknown, distance: unknown, duration: unknown): RouteLine | null {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const points = coordinates.flatMap((pair) => {
    if (!Array.isArray(pair) || pair.length < 2) return [];
    const lon = Number(pair[0]);
    const lat = Number(pair[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
    return [[lon, lat] as [number, number]];
  });
  const distanceM = Number(distance);
  const durationS = Number(duration);
  if (points.length < 2 || !Number.isFinite(distanceM) || !Number.isFinite(durationS)) return null;
  return { distanceM, durationS, coordinates: points };
}

const polite = { referrerPolicy: "origin" as const, headers: { Accept: "application/json" } };

export function createOsrmRouter(fetchImpl: FetchLike, limit = createRateLimiter(1000)): Router {
  return {
    id: "osrm",
    async route(from, to, mode, signal) {
      const response = await limit(() => fetchImpl(osrmUrl(from, to, mode), { ...polite, signal }));
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as {
        routes?: { distance?: number; duration?: number; geometry?: { coordinates?: unknown } }[];
      };
      const route = body.routes?.[0];
      const line = lineFrom(route?.geometry?.coordinates, route?.distance, route?.duration);
      if (!line) throw new Error("rota");
      return line;
    },
  };
}

export function createOrsRouter(fetchImpl: FetchLike, apiKey: string, limit = createRateLimiter(1000)): Router {
  const key = apiKey.trim();
  return {
    id: "ors",
    async route(from, to, mode, signal) {
      const response = await limit(() =>
        fetchImpl(orsUrl(mode), {
          method: "POST",
          referrerPolicy: "origin",
          signal,
          headers: {
            Accept: "application/geo+json",
            "Content-Type": "application/json",
            Authorization: key,
          },
          body: JSON.stringify({ coordinates: [[from.lon, from.lat], [to.lon, to.lat]] }),
        }),
      );
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as {
        features?: { properties?: { summary?: { distance?: number; duration?: number } }; geometry?: { coordinates?: unknown } }[];
      };
      const feature = body.features?.[0];
      const line = lineFrom(feature?.geometry?.coordinates, feature?.properties?.summary?.distance, feature?.properties?.summary?.duration);
      if (!line) throw new Error("rota");
      return line;
    },
  };
}

const ORS_STORAGE = "locus-ors-key";

export function readOrsKey(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(ORS_STORAGE)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function writeOrsKey(key: string) {
  if (typeof localStorage === "undefined") return;
  const trimmed = key.trim();
  if (!trimmed) localStorage.removeItem(ORS_STORAGE);
  else localStorage.setItem(ORS_STORAGE, trimmed);
}

export function browserRouter(): Router {
  const key = readOrsKey();
  const fetchImpl: FetchLike = (url, init) => fetch(url, init);
  if (key) return createOrsRouter(fetchImpl, key);
  return createOsrmRouter(fetchImpl);
}
