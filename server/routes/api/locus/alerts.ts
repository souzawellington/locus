import { defineEventHandler, getQuery, setResponseHeaders } from "h3";
import { roundToAbout1Km } from "../../../../src/lib/world/geo.ts";
import { eonetUrl, firmsUrl, nearby, openMeteoUrl, usgsWeekUrl, weatherLabel, type AlertEvent, type WeatherNow } from "../../../../src/lib/world/proxy.ts";

const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 10 * 60_000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function read(fetchImpl: FetchLike, url: string): Promise<unknown | null> {
  try {
    const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function collectAlerts(lat: number, lon: number, fetchImpl: FetchLike, firmsKey = ""): Promise<{ events: AlertEvent[]; weather: WeatherNow | null }> {
  const center = roundToAbout1Km(lat, lon);
  const [quakes, eonet, meteo, firms] = await Promise.all([
    read(fetchImpl, usgsWeekUrl()),
    read(fetchImpl, eonetUrl()),
    read(fetchImpl, openMeteoUrl(center.lat, center.lon)),
    firmsKey ? read(fetchImpl, firmsUrl(firmsKey, center.lat, center.lon)) : Promise.resolve(null),
  ]);
  const quakeRows = ((quakes as { features?: { id?: string; geometry?: { coordinates?: number[] }; properties?: { mag?: number; place?: string; url?: string } }[] })?.features ?? []).flatMap((feature) => {
    const [lonQ, latQ] = feature.geometry?.coordinates ?? [];
    if (!Number.isFinite(latQ) || !Number.isFinite(lonQ)) return [];
    return [{ id: String(feature.id ?? latQ), kind: "terremoto" as const, title: `Terremoto ${feature.properties?.mag ?? ""} ${feature.properties?.place ?? ""}`.trim(), lat: Number(latQ), lon: Number(lonQ), href: feature.properties?.url || "https://earthquake.usgs.gov/", source: "USGS" }];
  });
  const eventRows = ((eonet as { events?: { id?: string; title?: string; sources?: { url?: string }[]; geometry?: { coordinates?: number[] }[] }[] })?.events ?? []).flatMap((event) => {
    const coords = event.geometry?.[0]?.coordinates;
    const lonE = coords?.[0];
    const latE = coords?.[1];
    if (!Number.isFinite(latE) || !Number.isFinite(lonE)) return [];
    return [{ id: String(event.id ?? event.title), kind: "evento" as const, title: event.title || "Evento natural", lat: Number(latE), lon: Number(lonE), href: event.sources?.[0]?.url || "https://eonet.gsfc.nasa.gov/", source: "NASA EONET" }];
  });
  const fireRows = typeof firms === "string" ? [] : [];
  const events = [
    ...nearby(quakeRows, center, 400).slice(0, 3),
    ...nearby(eventRows, center, 500).slice(0, 2),
    ...nearby(fireRows, center, 150).slice(0, 2),
  ].map((event) => ({ ...event, km: Math.round(event.km) }));
  const current = (meteo as { current?: { temperature_2m?: number; weather_code?: number }; daily?: { temperature_2m_max?: number[] } })?.current;
  const weather: WeatherNow | null = current
    ? {
        temperature: current.temperature_2m ?? null,
        label: weatherLabel(Number(current.weather_code ?? 0)),
        tomorrow: (meteo as { daily?: { temperature_2m_max?: number[] } }).daily?.temperature_2m_max?.[1] != null ? `Amanhã até ${Math.round((meteo as { daily?: { temperature_2m_max?: number[] } }).daily!.temperature_2m_max![1]!)}°` : "",
        href: "https://open-meteo.com/",
      }
    : null;
  return { events, weather };
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "cache-control": "public, max-age=300" });
  const query = getQuery(event);
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { events: [], weather: null };
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.body;
  const firms = process.env.NASA_FIRMS_KEY ?? "";
  const body = await collectAlerts(lat, lon, (url, init) => fetch(url, init), firms);
  if (firms) {
    try {
      const csv = await fetch(firmsUrl(firms, roundToAbout1Km(lat, lon).lat, roundToAbout1Km(lat, lon).lon));
      if (csv.ok) {
        const text = await csv.text();
        const rows = text.split("\n").slice(1).flatMap((line) => {
          const cells = line.split(",");
          const latitude = Number(cells[0]);
          const longitude = Number(cells[1]);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
          return [{ id: `${latitude},${longitude}`, kind: "fogo" as const, title: "Foco de calor", lat: latitude, lon: longitude, href: "https://firms.modaps.eosdis.nasa.gov/", source: "NASA FIRMS" }];
        });
        body.events.push(...nearby(rows, roundToAbout1Km(lat, lon), 150).slice(0, 2).map((item) => ({ ...item, km: Math.round(item.km) })));
      }
    } catch {
      /* fires are optional */
    }
  }
  cache.set(key, { at: Date.now(), body });
  return body;
});
