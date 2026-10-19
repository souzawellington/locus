import { parseBlocks, serializeBlocks } from "../vault/markdown.ts";

export type TravelMode = "car" | "bike" | "walk";

export type Place = {
  name: string;
  address: string;
  lat: number;
  lon: number;
  mode: TravelMode;
};

const MODES = new Set<TravelMode>(["car", "bike", "walk"]);

const PLACE_RE = /^!\[\[place:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\|(car|bike|walk)\|([^|\]]*)\|([^\]]*)\]\]$/;

function coord(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(6).replace(/\.?0+$/, "");
}

export function formatPlace(place: Place): string {
  const mode: TravelMode = MODES.has(place.mode) ? place.mode : "car";
  const name = encodeURIComponent(place.name.trim() || "Lugar");
  const address = encodeURIComponent(place.address.trim());
  return `![[place:${coord(place.lat)},${coord(place.lon)}|${mode}|${name}|${address}]]`;
}

export function parsePlace(raw: string): Place | null {
  const match = PLACE_RE.exec(raw.trim());
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  const mode = match[3] as TravelMode;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  let name = "Lugar";
  let address = "";
  try {
    name = decodeURIComponent(match[4] ?? "") || "Lugar";
    address = decodeURIComponent(match[5] ?? "");
  } catch {
    return null;
  }
  return { name, address, lat, lon, mode };
}

export function placesIn(markdown: string): { place: Place; index: number }[] {
  return parseBlocks(markdown).flatMap((block, index) => {
    const place = parsePlace(block.raw);
    return place ? [{ place, index }] : [];
  });
}

export function replacePlace(markdown: string, index: number, place: Place): string {
  const blocks = parseBlocks(markdown);
  if (!blocks[index]) return markdown;
  const next = blocks.map((block, blockIndex) => (blockIndex === index ? { ...block, raw: formatPlace(place) } : block));
  return serializeBlocks(next);
}

const STREET = /(?:^|[\s,(])(rua|r\.|avenida|av\.|alameda|al\.|travessa|tv\.|praça|praca|estrada|rodovia|largo|viela)\s+\S+/i;
const CEP = /\b\d{5}-?\d{3}\b/;

export function looksLikeAddress(line: string): boolean {
  const text = line.trim();
  if (text.length < 8 || text.length > 160) return false;
  if (text.includes("![[") || text.includes("[[")) return false;
  if (CEP.test(text)) return true;
  return STREET.test(text) && /\d/.test(text);
}

export function addressLine(raw: string): string | null {
  const line = raw
    .split("\n")
    .map((item) => item.trim())
    .find((item) => looksLikeAddress(item));
  return line ?? null;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  const text = km < 10 ? km.toFixed(1).replace(".", ",") : String(Math.round(km));
  return `${text} km`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
