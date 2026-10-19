import { haversineKm } from "./geo.ts";
import { estimateArrival, normalizeCallsign, type FlightSnapshot } from "./flight.ts";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function adsbDbUrl(callsign: string): string {
  return `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(normalizeCallsign(callsign))}`;
}

export function adsbFiUrl(callsign: string): string {
  return `https://api.adsb.fi/v2/callsign/${encodeURIComponent(normalizeCallsign(callsign))}`;
}

export function openskyTokenUrl(): string {
  return "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
}

export function openskyTokenBody(clientId: string, clientSecret: string): string {
  return new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();
}

export function openskyBoxUrl(south: number, west: number, north: number, east: number): string {
  const url = new URL("https://opensky-network.org/api/states/all");
  url.searchParams.set("lamin", south.toFixed(2));
  url.searchParams.set("lomin", west.toFixed(2));
  url.searchParams.set("lamax", north.toFixed(2));
  url.searchParams.set("lomax", east.toFixed(2));
  return url.toString();
}

export function usgsWeekUrl(): string {
  return "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
}

export function eonetUrl(): string {
  return "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=40";
}

export function openMeteoUrl(lat: number, lon: number): string {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(2));
  url.searchParams.set("longitude", lon.toFixed(2));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "auto");
  return url.toString();
}

export function firmsUrl(key: string, lat: number, lon: number): string {
  const pad = 1.5;
  const box = [lon - pad, lat - pad, lon + pad, lat + pad].map((n) => n.toFixed(2)).join(",");
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_SNPP_NRT/${box}/2`;
}

type Stop = { code: string; name: string; lat: number; lon: number };

function stop(raw: unknown): Stop | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const lat = Number(row.latitude ?? row.lat);
  const lon = Number(row.longitude ?? row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const code = String(row.iata_code ?? row.iata ?? row.icao_code ?? row.icao ?? "").trim();
  const name = String(row.name ?? row.municipality ?? (code || "Aeroporto"));
  return { code, name, lat, lon };
}

function fromAdsbDb(body: unknown, callsign: string): Pick<FlightSnapshot, "airline" | "origin" | "destination"> {
  const route = (body as { response?: { flightroute?: Record<string, unknown> } })?.response?.flightroute;
  const airline = String((route?.airline as { name?: string } | undefined)?.name ?? callsign.slice(0, 2));
  return {
    airline,
    origin: stop(route?.origin),
    destination: stop(route?.destination),
  };
}

function fromAdsbFi(body: unknown, callsign: string): FlightSnapshot["position"] {
  const list = (body as { ac?: Record<string, unknown>[] })?.ac ?? [];
  const row = list.find((item) => String(item.flight ?? "").replace(/\s+/g, "").toUpperCase().startsWith(callsign)) ?? list[0];
  if (!row) return null;
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const alt = row.alt_baro;
  const altitudeM = typeof alt === "number" ? alt * 0.3048 : null;
  const speed = Number(row.gs);
  return {
    lat,
    lon,
    heading: Number(row.track) || 0,
    altitudeM,
    speedKt: Number.isFinite(speed) ? speed : null,
  };
}

export async function lookupFlight(callsignRaw: string, fetchImpl: FetchLike, env: { openskyId?: string; openskySecret?: string } = {}, now = Date.now()): Promise<FlightSnapshot> {
  const callsign = normalizeCallsign(callsignRaw);
  const empty: FlightSnapshot = {
    callsign,
    airline: callsign.slice(0, 2),
    origin: null,
    destination: null,
    status: "sem posição",
    position: null,
    estimate: null,
    source: "adsbdb",
  };
  let snapshot = { ...empty };
  try {
    const routeRes = await fetchImpl(adsbDbUrl(callsign), { headers: { Accept: "application/json" } });
    if (routeRes.ok) {
      const route = fromAdsbDb(await routeRes.json(), callsign);
      snapshot = { ...snapshot, ...route };
    }
  } catch {
    /* route is optional */
  }
  try {
    const liveRes = await fetchImpl(adsbFiUrl(callsign), { headers: { Accept: "application/json" } });
    if (liveRes.ok) snapshot.position = fromAdsbFi(await liveRes.json(), callsign);
  } catch {
    snapshot.position = null;
  }
  if (!snapshot.position && env.openskyId && env.openskySecret && snapshot.origin && snapshot.destination) {
    try {
      const tokenRes = await fetchImpl(openskyTokenUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: openskyTokenBody(env.openskyId, env.openskySecret),
      });
      if (tokenRes.ok) {
        const token = (await tokenRes.json()) as { access_token?: string };
        const midLat = (snapshot.origin.lat + snapshot.destination.lat) / 2;
        const midLon = (snapshot.origin.lon + snapshot.destination.lon) / 2;
        const box = openskyBoxUrl(midLat - 2, midLon - 2, midLat + 2, midLon + 2);
        const states = await fetchImpl(box, { headers: { Authorization: `Bearer ${token.access_token ?? ""}`, Accept: "application/json" } });
        if (states.ok) {
          const body = (await states.json()) as { states?: unknown[][] };
          const row = (body.states ?? []).find((state) => String(state[1] ?? "").replace(/\s+/g, "").toUpperCase().startsWith(callsign));
          if (row && Number.isFinite(Number(row[6])) && Number.isFinite(Number(row[5]))) {
            snapshot.position = {
              lat: Number(row[6]),
              lon: Number(row[5]),
              heading: Number(row[10]) || 0,
              altitudeM: Number.isFinite(Number(row[7])) ? Number(row[7]) : null,
              speedKt: Number.isFinite(Number(row[9])) ? Number(row[9]) * 1.94384 : null,
            };
            snapshot.source = "opensky";
          }
        }
      }
    } catch {
      /* live position stays empty */
    }
  }
  if (snapshot.position) {
    snapshot.status = "no ar";
    if (snapshot.destination) {
      const left = haversineKm(snapshot.position, snapshot.destination);
      const when = estimateArrival(left, snapshot.position.speedKt, now);
      snapshot.estimate = when;
    }
  }
  return snapshot;
}

export type AlertEvent = {
  id: string;
  kind: "terremoto" | "evento" | "fogo";
  title: string;
  lat: number;
  lon: number;
  km: number;
  href: string;
  source: string;
};

export type WeatherNow = {
  temperature: number | null;
  label: string;
  tomorrow: string;
  href: string;
};

export function weatherLabel(code: number): string {
  if (code === 0) return "céu limpo";
  if (code <= 3) return "nublado";
  if (code <= 48) return "neblina";
  if (code <= 67) return "chuva";
  if (code <= 77) return "neve";
  if (code <= 82) return "pancadas";
  return "trovoada";
}

export function nearby<T extends { lat: number; lon: number }>(items: T[], center: { lat: number; lon: number }, radiusKm: number): (T & { km: number })[] {
  return items
    .map((item) => ({ ...item, km: haversineKm(center, item) }))
    .filter((item) => item.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
}
