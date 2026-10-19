const TOKEN = /\b([A-Za-z]{2,3})\s?(\d{2,4})\b/g;

export type FlightHit = { raw: string; callsign: string };

export function normalizeCallsign(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function findFlights(text: string): FlightHit[] {
  const found: FlightHit[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(TOKEN)) {
    const letters = match[1] ?? "";
    const digits = match[2] ?? "";
    if (!letters || !digits) continue;
    if (letters !== letters.toUpperCase()) continue;
    const callsign = `${letters}${digits}`;
    if (seen.has(callsign)) continue;
    seen.add(callsign);
    found.push({ raw: match[0], callsign });
  }
  return found;
}

export type AirportStop = { code: string; name: string; lat: number; lon: number };

export type FlightPosition = {
  lat: number;
  lon: number;
  heading: number;
  altitudeM: number | null;
  speedKt: number | null;
};

export type FlightSnapshot = {
  callsign: string;
  airline: string;
  origin: AirportStop | null;
  destination: AirportStop | null;
  status: "no ar" | "sem posição";
  position: FlightPosition | null;
  estimate: string | null;
  source: string;
};

export function flightRadarUrl(callsign: string): string {
  return `https://www.flightradar24.com/data/flights/${encodeURIComponent(callsign.toLowerCase())}`;
}

export function flightAwareUrl(callsign: string): string {
  return `https://www.flightaware.com/live/flight/${encodeURIComponent(callsign)}`;
}

export function estimateArrival(distanceKm: number, speedKt: number | null, now = Date.now()): string | null {
  if (!speedKt || speedKt < 40 || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  const hours = distanceKm / (speedKt * 1.852);
  const at = new Date(now + hours * 3600_000);
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `${hh}h${mm}`;
}
