import { createRateLimiter } from "./limit.ts";
import type { Place } from "./place.ts";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type PlaceHit = Pick<Place, "name" | "address" | "lat" | "lon">;

export type Geocoder = {
  id: "photon" | "nominatim";
  search(query: string, signal?: AbortSignal): Promise<PlaceHit[]>;
  reverse(lat: number, lon: number, signal?: AbortSignal): Promise<PlaceHit | null>;
};

export const SUGGESTION_PROVIDER = "photon" as const;

type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function photonSearchUrl(query: string): string {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  return url.toString();
}

export function photonReverseUrl(lat: number, lon: number): string {
  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  return url.toString();
}

export function nominatimSearchUrl(query: string): string {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  return url.toString();
}

function photonHit(feature: PhotonFeature): PlaceHit | null {
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  const latitude = finite(lat);
  const longitude = finite(lon);
  if (latitude === null || longitude === null) return null;
  const props = feature.properties ?? {};
  const street = [props.street, props.housenumber].filter(Boolean).join(", ");
  const city = [props.district, props.city, props.state].filter(Boolean).join(", ");
  const address = [street, city, props.country].filter(Boolean).join(" — ");
  const name = props.name || street || city || "Lugar";
  return { name, address: address || name, lat: latitude, lon: longitude };
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

const politeInit: RequestInit = { referrerPolicy: "origin", headers: { Accept: "application/json" } };

export function createPhotonGeocoder(fetchImpl: FetchLike, limit = createRateLimiter(1000)): Geocoder {
  return {
    id: "photon",
    async search(query, signal) {
      const text = query.trim();
      if (text.length < 3) return [];
      const response = await limit(() => fetchImpl(photonSearchUrl(text), { ...politeInit, signal }));
      const body = (await readJson(response)) as { features?: PhotonFeature[] };
      return (body.features ?? []).map(photonHit).filter((hit): hit is PlaceHit => Boolean(hit)).slice(0, 5);
    },
    async reverse(lat, lon, signal) {
      const response = await limit(() => fetchImpl(photonReverseUrl(lat, lon), { ...politeInit, signal }));
      const body = (await readJson(response)) as { features?: PhotonFeature[] };
      return photonHit(body.features?.[0] ?? {}) ;
    },
  };
}

type NominatimRow = { lat?: string; lon?: string; display_name?: string; name?: string };

export function createNominatimGeocoder(fetchImpl: FetchLike, limit = createRateLimiter(1000)): Geocoder {
  return {
    id: "nominatim",
    async search(query, signal) {
      const text = query.trim();
      if (text.length < 3) return [];
      const response = await limit(() => fetchImpl(nominatimSearchUrl(text), { ...politeInit, signal }));
      const rows = (await readJson(response)) as NominatimRow[];
      if (!Array.isArray(rows)) return [];
      return rows.flatMap((row) => {
        const lat = finite(row.lat);
        const lon = finite(row.lon);
        if (lat === null || lon === null) return [];
        const address = row.display_name?.trim() || "";
        const name = row.name?.trim() || address.split(",")[0]?.trim() || "Lugar";
        return [{ name, address: address || name, lat, lon }];
      });
    },
    async reverse() {
      return null;
    },
  };
}

export function browserGeocoder(): Geocoder {
  return createPhotonGeocoder((url, init) => fetch(url, init));
}
