import type { Place, TravelMode } from "./place.ts";

export type LatLon = { lat: number; lon: number };

const GOOGLE_MODE: Record<TravelMode, string> = {
  car: "driving",
  bike: "bicycling",
  walk: "walking",
};

const APPLE_MODE: Record<TravelMode, string> = {
  car: "d",
  bike: "c",
  walk: "w",
};

function pair(point: LatLon): string {
  return `${point.lat},${point.lon}`;
}

export function googleMapsUrl(place: Place, from?: LatLon): string {
  const destination = pair(place);
  if (from) {
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("origin", pair(from));
    url.searchParams.set("destination", destination);
    url.searchParams.set("travelmode", GOOGLE_MODE[place.mode]);
    return url.toString();
  }
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", place.address || destination);
  return url.toString();
}

export function wazeUrl(place: Place): string {
  const url = new URL("https://www.waze.com/ul");
  url.searchParams.set("ll", pair(place));
  url.searchParams.set("navigate", "yes");
  if (place.name) url.searchParams.set("q", place.name);
  return url.toString();
}

export function appleMapsUrl(place: Place, from?: LatLon): string {
  const url = new URL("https://maps.apple.com/");
  if (from) {
    url.searchParams.set("saddr", pair(from));
    url.searchParams.set("daddr", pair(place));
    url.searchParams.set("dirflg", APPLE_MODE[place.mode]);
  } else {
    url.searchParams.set("ll", pair(place));
    url.searchParams.set("q", place.name || place.address || pair(place));
  }
  return url.toString();
}
